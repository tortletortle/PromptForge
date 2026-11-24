import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
