import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { createAsset, listAssetVersions, openDatabase } from "../src/database.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function runWorker(databasePath: string, assetId: string, workerId: number): Promise<void> {
  const moduleUrl = new URL("../src/database.ts", import.meta.url).href;
  const script = `
    const [{ openDatabase, createAsset, updateAsset }, moduleUrl, databasePath, assetId, workerId, count] = [
      await import(${JSON.stringify(moduleUrl)}),
      process.argv[1],
      process.argv[2],
      process.argv[3],
      Number(process.argv[4]),
      Number(process.argv[5])
    ];
    const db = openDatabase(databasePath);
    try {
      for (let index = 0; index < count; index += 1) {
        const updated = updateAsset(db, assetId, {
          description: "worker-" + workerId + "-update-" + index
        });
        if (!updated) throw new Error("shared asset disappeared");
      }
      for (let index = 0; index < 5; index += 1) {
        createAsset(db, {
          name: "worker-" + workerId + "-asset-" + index,
          content: "created by concurrent worker " + workerId
        });
      }
    } finally {
      db.close();
    }
  `;
  const packageRoot = fileURLToPath(new URL("..", import.meta.url));
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      "--import", "tsx", "--input-type=module", "-e", script,
      moduleUrl, databasePath, assetId, String(workerId), "12"
    ], { cwd: packageRoot, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => { stderr += chunk; });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error("SQLite worker " + workerId + " exited " + code + ": " + stderr));
    });
  });
}

describe("SQLite multi-process write safety", () => {
  it("serializes concurrent asset updates and preserves every version snapshot", async () => {
    const directory = mkdtempSync(join(tmpdir(), "promptforge-multiprocess-"));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, "shared.sqlite");
    const db = openDatabase(databasePath);
    const original = createAsset(db, {
      name: "Shared asset",
      content: "initial content"
    });
    db.close();

    const workerCount = 4;
    await Promise.all(
      Array.from({ length: workerCount }, (_, index) =>
        runWorker(databasePath, original.id, index)
      )
    );

    const verificationDb = openDatabase(databasePath);
    try {
      const finalAsset = verificationDb.prepare(
        "SELECT version FROM prompt_assets WHERE id = ?"
      ).get(original.id) as { version: number } | undefined;
      const versions = listAssetVersions(verificationDb, original.id);
      const createdByWorkers = verificationDb.prepare(
        "SELECT COUNT(*) AS count FROM prompt_assets WHERE name LIKE 'worker-%-asset-%'"
      ).get() as { count: number };

      expect(finalAsset?.version).toBe(1 + workerCount * 12);
      expect(versions).toHaveLength(1 + workerCount * 12);
      expect(new Set(versions.map((version) => version.version)).size).toBe(1 + workerCount * 12);
      expect(createdByWorkers.count).toBe(workerCount * 5);
    } finally {
      verificationDb.close();
    }
  }, 60_000);
});
