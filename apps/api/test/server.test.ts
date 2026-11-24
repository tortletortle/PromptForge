import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { buildServer } from "../src/server.js";
import { createAsset, listAssets, openDatabase, type SqliteDatabase } from "../src/database.js";

describe("PromptForge API", () => {
  let database: SqliteDatabase;
  let app: ReturnType<typeof buildServer>;

  beforeEach(() => {
    database = openDatabase(":memory:");
    app = buildServer({ database });
  });

  afterEach(async () => {
    await app.close();
    database.close();
  });

  it("migrates legacy v2 assets and compile history to the role-aware kernel schema", () => {
    const directory = mkdtempSync(join(tmpdir(), "promptforge-v2-migration-"));
    const path = join(directory, "legacy.sqlite");
    const legacy = new Database(path);
    legacy.exec([
      "CREATE TABLE prompt_assets (id TEXT PRIMARY KEY);",
      "CREATE TABLE prompt_asset_versions (asset_id TEXT NOT NULL, version INTEGER NOT NULL, snapshot_json TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (asset_id, version));",
      "CREATE TABLE compile_runs (id TEXT PRIMARY KEY);",
      "INSERT INTO prompt_asset_versions (asset_id, version, snapshot_json, created_at) VALUES ('legacy', 1, '{\"name\":\"Legacy asset\",\"content\":\"Old prompt\"}', '2026-01-01T00:00:00.000Z');",
      "PRAGMA user_version = 2;"
    ].join("\n"));
    legacy.close();

    const migrated = openDatabase(path);
    expect(migrated.pragma("user_version", { simple: true })).toBe(4);
    const assetColumns = migrated.pragma("table_info(prompt_assets)") as Array<{ name: string }>;
    const runColumns = migrated.pragma("table_info(compile_runs)") as Array<{ name: string }>;
    expect(assetColumns.map((column) => column.name)).toContain("role");
    expect(runColumns.map((column) => column.name)).toContain("messages_json");
    expect(runColumns.map((column) => column.name)).toContain("manifest_json");
    const snapshot = migrated.prepare(
      "SELECT snapshot_json FROM prompt_asset_versions WHERE asset_id = 'legacy' AND version = 1"
    ).get() as { snapshot_json: string };
    expect(JSON.parse(snapshot.snapshot_json)).toMatchObject({ role: "system" });
    migrated.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it("initializes the versioned kernel schema and defaults new assets to system role", () => {
    expect(database.pragma("user_version", { simple: true })).toBe(4);
    const asset = createAsset(database, { name: "Default role", content: "System by default" });
    expect(asset.role).toBe("system");
  });

  it("rejects unsupported prompt roles at the API boundary", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/assets",
      payload: { name: "Invalid role", role: "tool", content: "Do not accept" }
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: "role 必须是 system、developer 或 user。" });
  });

  it("creates an asset and compiles it through a target adapter", async () => {
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/assets",
      payload: {
        name: "Engineering assistant",
        content: "Help {{ audience }} solve technical problems.",
        variables: [{ name: "audience", required: true }]
      }
    });

    expect(createResponse.statusCode).toBe(201);
    const created = createResponse.json() as { asset: { id: string; version: number } };
    expect(created.asset.version).toBe(1);

    const updateResponse = await app.inject({
      method: "PUT",
      url: "/api/assets/" + created.asset.id,
      payload: { content: "Updated instructions for {{ audience }}." }
    });
    expect((updateResponse.json() as { asset: { version: number } }).asset.version).toBe(2);

    const versionsResponse = await app.inject({
      method: "GET",
      url: "/api/assets/" + created.asset.id + "/versions"
    });
    const versions = versionsResponse.json() as { versions: Array<{ version: number; snapshot: { content: string } }> };
    expect(versions.versions.map((version) => version.version)).toEqual([2, 1]);
    expect(versions.versions[1]?.snapshot.content).toBe("Help {{ audience }} solve technical problems.");

    const restoreResponse = await app.inject({
      method: "POST",
      url: "/api/assets/" + created.asset.id + "/versions/1/restore"
    });
    const restored = restoreResponse.json() as { asset: { version: number; content: string } };
    expect(restored.asset.version).toBe(3);
    expect(restored.asset.content).toBe("Help {{ audience }} solve technical problems.");

    const compileResponse = await app.inject({
      method: "POST",
      url: "/api/compile",
      payload: {
        assetIds: [created.asset.id],
        variables: { audience: "engineers" },
        target: "chatgpt"
      }
    });

    expect(compileResponse.statusCode).toBe(200);
    const compiled = compileResponse.json() as {
      run: { status: string };
      result: { success: boolean; text: string };
      artifact: { fileName: string; content: string } | null;
    };
    expect(compiled.run.status).toBe("success");
    expect(compiled.result.success).toBe(true);
    expect(compiled.result.text).toContain("engineers");
    expect(compiled.artifact?.fileName).toContain("chatgpt");
  });

  it("handles 100 concurrent compile requests without losing immutable history", async () => {
    const assets = Array.from({ length: 30 }, (_, index) => createAsset(database, {
      name: "Concurrent asset " + index,
      role: index % 3 === 0 ? "system" : index % 3 === 1 ? "developer" : "user",
      content: "Concurrent compile instruction " + index
    }));
    const assetIds = assets.map((asset) => asset.id);
    const started = performance.now();
    const responses = await Promise.all(Array.from({ length: 100 }, () =>
      app.inject({
        method: "POST",
        url: "/api/compile",
        payload: { assetIds, target: "api", tokenBudget: 100_000 }
      })
    ));
    const elapsedMs = Number((performance.now() - started).toFixed(2));

    expect(responses.every((response) => response.statusCode === 200)).toBe(true);
    const payloads = responses.map((response) => response.json() as {
      run: { id: string; status: string; messages: Array<{ role: string }>; manifest: { resolvedAssets: unknown[] } };
      result: { success: boolean; orderedAssetIds: string[] };
    });
    const runIds = payloads.map((payload) => payload.run.id);

    expect(new Set(runIds).size).toBe(100);
    for (const payload of payloads) {
      expect(payload.run.status).toBe("success");
      expect(payload.result.success).toBe(true);
      expect(payload.result.orderedAssetIds).toHaveLength(30);
      expect(payload.run.manifest.resolvedAssets).toHaveLength(30);
      expect(payload.run.messages.map((message) => message.role)).toEqual(["system", "developer", "user"]);
    }

    const historyResponse = await app.inject({ method: "GET", url: "/api/compile-runs" });
    expect(historyResponse.statusCode).toBe(200);
    const history = (historyResponse.json() as { runs: Array<{ id: string; manifest: { resolvedAssets: unknown[] } }> }).runs;
    expect(history).toHaveLength(100);
    expect(new Set(history.map((run) => run.id)).size).toBe(100);
    expect(new Set(history.map((run) => run.id))).toEqual(new Set(runIds));
    expect(history.every((run) => run.manifest.resolvedAssets.length === 30)).toBe(true);

    console.info("[PROMPT_KERNEL_STRESS][api-concurrency]", JSON.stringify({
      concurrentRequests: responses.length,
      assetsPerCompile: assetIds.length,
      persistedRuns: history.length,
      elapsedMs
    }));
  }, 30_000);

  it("persists prompt roles, emits structured messages, and stores a reproducible manifest", async () => {
    const createdAssets: Array<{ id: string; role: string }> = [];
    for (const item of [
      { name: "System", role: "system", content: "System instruction" },
      { name: "Developer", role: "developer", content: "Developer policy" },
      { name: "User", role: "user", content: "User request" }
    ]) {
      const response = await app.inject({
        method: "POST",
        url: "/api/assets",
        payload: item
      });
      expect(response.statusCode).toBe(201);
      createdAssets.push((response.json() as { asset: { id: string; role: string } }).asset);
    }

    expect(createdAssets.map((asset) => asset.role)).toEqual(["system", "developer", "user"]);

    const compileResponse = await app.inject({
      method: "POST",
      url: "/api/compile",
      payload: {
        assetIds: createdAssets.map((asset) => asset.id),
        target: "api"
      }
    });
    expect(compileResponse.statusCode).toBe(200);
    const compiled = compileResponse.json() as {
      run: {
        messages: Array<{ role: string; content: string }>;
        manifest: { schemaVersion: number; resolvedAssets: Array<{ id: string; role: string; content: string }> };
      };
      result: { messages: Array<{ role: string; content: string }> };
      artifact: { content: string } | null;
    };
    expect(compiled.result.messages.map((message) => message.role)).toEqual(["system", "developer", "user"]);
    expect(compiled.run.messages).toEqual(compiled.result.messages);
    expect(compiled.run.manifest.schemaVersion).toBe(1);
    expect(compiled.run.manifest.resolvedAssets).toHaveLength(3);
    const developerSnapshot = compiled.run.manifest.resolvedAssets.find((asset) => asset.id === createdAssets[1]?.id);
    expect(developerSnapshot).toMatchObject({
      role: "developer",
      content: "Developer policy"
    });

    const apiArtifact = JSON.parse(compiled.artifact?.content ?? "{}") as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(apiArtifact.messages.map((message) => message.role)).toEqual(["system", "developer", "user"]);
  });

  it("stores the role in each immutable asset version", async () => {
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/assets",
      payload: { name: "Role version", role: "developer", content: "Developer rules" }
    });
    const created = (createResponse.json() as { asset: { id: string } }).asset;
    const updateResponse = await app.inject({
      method: "PUT",
      url: "/api/assets/" + created.id,
      payload: { role: "user" }
    });
    expect((updateResponse.json() as { asset: { role: string } }).asset.role).toBe("user");

    const versionsResponse = await app.inject({
      method: "GET",
      url: "/api/assets/" + created.id + "/versions"
    });
    const versions = (versionsResponse.json() as {
      versions: Array<{ version: number; snapshot: { role: string } }>;
    }).versions;
    expect(versions.map((version) => version.snapshot.role)).toEqual(["user", "developer"]);
  });

  it("persists failed compile diagnostics in history", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/compile",
      payload: { assetIds: [], target: "cursor" }
    });
    expect(response.statusCode).toBe(200);

    const history = await app.inject({ method: "GET", url: "/api/compile-runs" });
    const body = history.json() as { runs: Array<{ status: string; errors: unknown[] }> };
    expect(body.runs).toHaveLength(1);
    expect(body.runs[0]?.status).toBe("failed");
    expect(body.runs[0]?.errors.length).toBeGreaterThan(0);
  });

  it("persists assets across SQLite database reopen", () => {
    const directory = mkdtempSync(join(tmpdir(), "promptforge-persistence-"));
    const path = join(directory, "promptforge.sqlite");
    const first = openDatabase(path);
    createAsset(first, { name: "Persistent asset", content: "Persist this prompt." });
    first.close();

    const second = openDatabase(path);
    expect(listAssets(second)).toHaveLength(1);
    expect(listAssets(second)[0]?.name).toBe("Persistent asset");
    second.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it("creates project and task context", async () => {
    const projectResponse = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: { name: "Website rebuild", tokenBudget: 6000 }
    });
    const project = (projectResponse.json() as { project: { id: string } }).project;

    const taskResponse = await app.inject({
      method: "POST",
      url: "/api/projects/" + project.id + "/tasks",
      payload: { name: "Landing page", context: { audience: "designers" } }
    });
    expect(taskResponse.statusCode).toBe(201);

    const tasksResponse = await app.inject({
      method: "GET",
      url: "/api/projects/" + project.id + "/tasks"
    });
    const tasks = tasksResponse.json() as { tasks: Array<{ context: Record<string, string> }> };
    expect(tasks.tasks[0]?.context.audience).toBe("designers");
  });
});
