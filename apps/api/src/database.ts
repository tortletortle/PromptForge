import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";
import type {
  AdapterId,
  CompileDiagnostic,
  CompileRun,
  PromptAsset,
  PromptAssetInput,
  PromptAssetSnapshot,
  PromptAssetVersion,
  PromptRole,
  PromptProject,
  PromptProjectInput,
  PromptTask,
  PromptTaskInput
} from "@promptforge/core";

export type SqliteDatabase = Database.Database;

const MIGRATION_1 = [
  "CREATE TABLE prompt_assets (",
  "  id TEXT PRIMARY KEY,",
  "  name TEXT NOT NULL,",
  "  description TEXT NOT NULL DEFAULT '',",
  "  content TEXT NOT NULL,",
  "  category TEXT NOT NULL DEFAULT 'General',",
  "  tags_json TEXT NOT NULL DEFAULT '[]',",
  "  dependencies_json TEXT NOT NULL DEFAULT '[]',",
  "  conflicts_json TEXT NOT NULL DEFAULT '[]',",
  "  variables_json TEXT NOT NULL DEFAULT '[]',",
  "  priority INTEGER NOT NULL DEFAULT 0,",
  "  version INTEGER NOT NULL DEFAULT 1,",
  "  created_at TEXT NOT NULL,",
  "  updated_at TEXT NOT NULL",
  ");",
  "CREATE INDEX prompt_assets_updated_at_idx ON prompt_assets(updated_at DESC);",
  "CREATE INDEX prompt_assets_category_idx ON prompt_assets(category);",
  "CREATE TABLE projects (",
  "  id TEXT PRIMARY KEY,",
  "  name TEXT NOT NULL,",
  "  description TEXT NOT NULL DEFAULT '',",
  "  token_budget INTEGER NOT NULL DEFAULT 8000,",
  "  created_at TEXT NOT NULL,",
  "  updated_at TEXT NOT NULL",
  ");",
  "CREATE TABLE project_tasks (",
  "  id TEXT PRIMARY KEY,",
  "  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,",
  "  name TEXT NOT NULL,",
  "  description TEXT NOT NULL DEFAULT '',",
  "  context_json TEXT NOT NULL DEFAULT '{}',",
  "  selected_asset_ids_json TEXT NOT NULL DEFAULT '[]',",
  "  created_at TEXT NOT NULL,",
  "  updated_at TEXT NOT NULL",
  ");",
  "CREATE INDEX project_tasks_project_id_idx ON project_tasks(project_id);",
  "CREATE TABLE compile_runs (",
  "  id TEXT PRIMARY KEY,",
  "  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,",
  "  task_id TEXT REFERENCES project_tasks(id) ON DELETE SET NULL,",
  "  target TEXT NOT NULL,",
  "  input_json TEXT NOT NULL,",
  "  output_text TEXT NOT NULL DEFAULT '',",
  "  token_estimate INTEGER NOT NULL DEFAULT 0,",
  "  status TEXT NOT NULL CHECK(status IN ('success', 'failed')),",
  "  warnings_json TEXT NOT NULL DEFAULT '[]',",
  "  errors_json TEXT NOT NULL DEFAULT '[]',",
  "  created_at TEXT NOT NULL",
  ");",
  "CREATE INDEX compile_runs_project_created_idx ON compile_runs(project_id, created_at DESC);"
].join("\n");

const MIGRATION_3 = [
  "ALTER TABLE prompt_assets ADD COLUMN role TEXT NOT NULL DEFAULT 'system';"
].join("\n");

const MIGRATION_4 = [
  "ALTER TABLE compile_runs ADD COLUMN messages_json TEXT NOT NULL DEFAULT '[]';",
  "ALTER TABLE compile_runs ADD COLUMN manifest_json TEXT NOT NULL DEFAULT '{}';"
].join("\n");

const MIGRATION_2 = [
  "CREATE TABLE IF NOT EXISTS prompt_asset_versions (",
  "  asset_id TEXT NOT NULL REFERENCES prompt_assets(id) ON DELETE CASCADE,",
  "  version INTEGER NOT NULL,",
  "  snapshot_json TEXT NOT NULL,",
  "  created_at TEXT NOT NULL,",
  "  PRIMARY KEY (asset_id, version)",
  ");",
  "CREATE INDEX IF NOT EXISTS prompt_asset_versions_asset_idx ON prompt_asset_versions(asset_id, version DESC);"
].join("\n");

interface AssetVersionRow {
  asset_id: string;
  version: number;
  snapshot_json: string;
  created_at: string;
}

interface AssetRow {
  id: string;
  name: string;
  description: string;
  content: string;
  category: string;
  tags_json: string;
  dependencies_json: string;
  conflicts_json: string;
  variables_json: string;
  priority: number;
  role: string;
  version: number;
  created_at: string;
  updated_at: string;
}

interface ProjectRow {
  id: string;
  name: string;
  description: string;
  token_budget: number;
  created_at: string;
  updated_at: string;
}

interface TaskRow {
  id: string;
  project_id: string;
  name: string;
  description: string;
  context_json: string;
  selected_asset_ids_json: string;
  created_at: string;
  updated_at: string;
}

interface CompileRunRow {
  id: string;
  project_id: string | null;
  task_id: string | null;
  target: string;
  input_json: string;
  output_text: string;
  token_estimate: number;
  status: "success" | "failed";
  warnings_json: string;
  errors_json: string;
  messages_json: string;
  manifest_json: string;
  created_at: string;
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function mapAsset(row: AssetRow): PromptAsset {
  const role = (["system", "developer", "user"] as const).includes(row.role as PromptRole)
    ? row.role as PromptRole
    : "system";
  return {
    id: row.id,
    role,
    name: row.name,
    description: row.description,
    content: row.content,
    category: row.category,
    tags: parseJson<string[]>(row.tags_json, []),
    dependencies: parseJson<string[]>(row.dependencies_json, []),
    conflictsWith: parseJson<string[]>(row.conflicts_json, []),
    variables: parseJson<PromptAsset["variables"]>(row.variables_json, []),
    priority: row.priority,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toAssetSnapshot(asset: PromptAsset): PromptAssetSnapshot {
  return {
    name: asset.name,
    description: asset.description,
    content: asset.content,
    category: asset.category,
    tags: asset.tags,
    dependencies: asset.dependencies,
    conflictsWith: asset.conflictsWith,
    variables: asset.variables,
    role: asset.role,
    priority: asset.priority
  };
}

function saveAssetVersion(db: SqliteDatabase, asset: PromptAsset): void {
  db.prepare(
    "INSERT OR IGNORE INTO prompt_asset_versions (asset_id, version, snapshot_json, created_at) VALUES (?, ?, ?, ?)"
  ).run(asset.id, asset.version, JSON.stringify(toAssetSnapshot(asset)), asset.updatedAt);
}

function mapProject(row: ProjectRow): PromptProject {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    tokenBudget: row.token_budget,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapTask(row: TaskRow): PromptTask {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    description: row.description,
    context: parseJson<Record<string, string>>(row.context_json, {}),
    selectedAssetIds: parseJson<string[]>(row.selected_asset_ids_json, []),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapCompileRun(row: CompileRunRow): CompileRun {
  return {
    id: row.id,
    projectId: row.project_id,
    taskId: row.task_id,
    target: row.target as AdapterId,
    input: parseJson<CompileRun["input"]>(row.input_json, { selectedAssetIds: [], variables: {} }),
    outputText: row.output_text,
    tokenEstimate: row.token_estimate,
    status: row.status,
    warnings: parseJson<CompileDiagnostic[]>(row.warnings_json, []),
    errors: parseJson<CompileDiagnostic[]>(row.errors_json, []),
    messages: parseJson<CompileRun["messages"]>(row.messages_json, []),
    manifest: parseJson<CompileRun["manifest"]>(row.manifest_json, {
      schemaVersion: 1,
      selectedAssetIds: parseJson<CompileRun["input"]>(row.input_json, { selectedAssetIds: [], variables: {} }).selectedAssetIds,
      orderedAssetIds: [],
      resolvedAssets: [],
      variableNames: [],
      tokenEstimate: row.token_estimate,
      estimateMethod: "legacy-unknown"
    }),
    createdAt: row.created_at
  };
}

export function openDatabase(filename = resolve(process.cwd(), "data", "promptforge.sqlite")): SqliteDatabase {
  if (filename !== ":memory:") {
    mkdirSync(dirname(resolve(filename)), { recursive: true });
  }

  const db = new Database(filename);
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");

  let currentVersion = db.pragma("user_version", { simple: true }) as number;
  if (currentVersion < 1) {
    db.exec("BEGIN IMMEDIATE;\n" + MIGRATION_1 + "\nPRAGMA user_version = 1;\nCOMMIT;");
    currentVersion = 1;
  }
  if (currentVersion < 2) {
    db.exec("BEGIN IMMEDIATE;\n" + MIGRATION_2 + "\nPRAGMA user_version = 2;\nCOMMIT;");
    const existingAssets = db.prepare("SELECT * FROM prompt_assets").all() as AssetRow[];
    for (const row of existingAssets) saveAssetVersion(db, mapAsset(row));
    currentVersion = 2;
  }
  if (currentVersion < 3) {
    db.exec("BEGIN IMMEDIATE;\n" + MIGRATION_3 + "\nPRAGMA user_version = 3;\nCOMMIT;");
    const versions = db.prepare("SELECT asset_id, version, snapshot_json FROM prompt_asset_versions").all() as Array<{
      asset_id: string; version: number; snapshot_json: string;
    }>;
    const updateSnapshot = db.prepare(
      "UPDATE prompt_asset_versions SET snapshot_json = ? WHERE asset_id = ? AND version = ?"
    );
    for (const version of versions) {
      const snapshot = parseJson<Record<string, unknown>>(version.snapshot_json, {});
      if (typeof snapshot.role !== "string") {
        snapshot.role = "system";
        updateSnapshot.run(JSON.stringify(snapshot), version.asset_id, version.version);
      }
    }
    currentVersion = 3;
  }
  if (currentVersion < 4) {
    db.exec("BEGIN IMMEDIATE;\n" + MIGRATION_4 + "\nPRAGMA user_version = 4;\nCOMMIT;");
  }

  if (filename !== ":memory:") {
    db.pragma("journal_mode = WAL");
  }

  return db;
}

function cleanStringArray(values: string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

export function listAssets(db: SqliteDatabase, search = ""): PromptAsset[] {
  const query = search.trim();
  const rows = query
    ? db.prepare(
        "SELECT * FROM prompt_assets WHERE name LIKE ? OR content LIKE ? OR category LIKE ? OR tags_json LIKE ? ORDER BY updated_at DESC, name ASC"
      ).all("%" + query + "%", "%" + query + "%", "%" + query + "%", "%" + query + "%") as AssetRow[]
    : db.prepare("SELECT * FROM prompt_assets ORDER BY updated_at DESC, name ASC").all() as AssetRow[];
  return rows.map(mapAsset);
}

export function getAsset(db: SqliteDatabase, id: string): PromptAsset | null {
  const row = db.prepare("SELECT * FROM prompt_assets WHERE id = ?").get(id) as AssetRow | undefined;
  return row ? mapAsset(row) : null;
}

export function createAsset(db: SqliteDatabase, input: PromptAssetInput): PromptAsset {
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    "INSERT INTO prompt_assets (id, name, description, content, category, tags_json, dependencies_json, conflicts_json, variables_json, priority, role, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)"
  ).run(
    id,
    input.name.trim(),
    input.description ?? "",
    input.content,
    input.category?.trim() || "General",
    JSON.stringify(cleanStringArray(input.tags)),
    JSON.stringify(cleanStringArray(input.dependencies)),
    JSON.stringify(cleanStringArray(input.conflictsWith)),
    JSON.stringify(input.variables ?? []),
    Number.isFinite(input.priority) ? input.priority : 0,
    input.role ?? "system",
    now,
    now
  );
  const asset = getAsset(db, id)!;
  saveAssetVersion(db, asset);
  return asset;
}

export function updateAsset(
  db: SqliteDatabase,
  id: string,
  input: Partial<PromptAssetInput>
): PromptAsset | null {
  const existing = getAsset(db, id);
  if (!existing) return null;

  const next = {
    name: input.name?.trim() ?? existing.name,
    role: input.role ?? existing.role,
    description: input.description ?? existing.description,
    content: input.content ?? existing.content,
    category: input.category?.trim() || existing.category,
    tags: input.tags ? cleanStringArray(input.tags) : existing.tags,
    dependencies: input.dependencies ? cleanStringArray(input.dependencies) : existing.dependencies,
    conflictsWith: input.conflictsWith ? cleanStringArray(input.conflictsWith) : existing.conflictsWith,
    variables: input.variables ?? existing.variables,
    priority: input.priority !== undefined && Number.isFinite(input.priority) ? input.priority : existing.priority
  };
  const now = new Date().toISOString();

  db.prepare(
    "UPDATE prompt_assets SET name = ?, role = ?, description = ?, content = ?, category = ?, tags_json = ?, dependencies_json = ?, conflicts_json = ?, variables_json = ?, priority = ?, version = version + 1, updated_at = ? WHERE id = ?"
  ).run(
    next.name,
    next.role,
    next.description,
    next.content,
    next.category,
    JSON.stringify(next.tags),
    JSON.stringify(next.dependencies),
    JSON.stringify(next.conflictsWith),
    JSON.stringify(next.variables),
    next.priority,
    now,
    id
  );

  const updated = getAsset(db, id);
  if (updated) saveAssetVersion(db, updated);
  return updated;
}

export function listAssetVersions(db: SqliteDatabase, assetId: string): PromptAssetVersion[] {
  const rows = db.prepare(
    "SELECT * FROM prompt_asset_versions WHERE asset_id = ? ORDER BY version DESC"
  ).all(assetId) as AssetVersionRow[];
  return rows.map((row) => ({
    assetId: row.asset_id,
    version: row.version,
    snapshot: parseJson<PromptAssetSnapshot>(row.snapshot_json, {
      role: "system",
      name: "",
      description: "",
      content: "",
      category: "General",
      tags: [],
      dependencies: [],
      conflictsWith: [],
      variables: [],
      priority: 0
    }),
    createdAt: row.created_at
  }));
}

export function restoreAssetVersion(
  db: SqliteDatabase,
  assetId: string,
  version: number
): PromptAsset | null {
  const row = db.prepare(
    "SELECT snapshot_json FROM prompt_asset_versions WHERE asset_id = ? AND version = ?"
  ).get(assetId, version) as { snapshot_json: string } | undefined;
  if (!row) return null;
  const snapshot = parseJson<PromptAssetSnapshot>(row.snapshot_json, {
    role: "system",
    name: "",
    description: "",
    content: "",
    category: "General",
    tags: [],
    dependencies: [],
    conflictsWith: [],
    variables: [],
    priority: 0
  });
  return updateAsset(db, assetId, snapshot);
}

export function deleteAsset(db: SqliteDatabase, id: string): boolean {
  return db.prepare("DELETE FROM prompt_assets WHERE id = ?").run(id).changes > 0;
}

export function listProjects(db: SqliteDatabase): PromptProject[] {
  return (db.prepare("SELECT * FROM projects ORDER BY updated_at DESC, name ASC").all() as ProjectRow[]).map(mapProject);
}

export function getProject(db: SqliteDatabase, id: string): PromptProject | null {
  const row = db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as ProjectRow | undefined;
  return row ? mapProject(row) : null;
}

export function createProject(db: SqliteDatabase, input: PromptProjectInput): PromptProject {
  const id = randomUUID();
  const now = new Date().toISOString();
  const tokenBudget = input.tokenBudget && input.tokenBudget > 0 ? Math.floor(input.tokenBudget) : 8000;
  db.prepare(
    "INSERT INTO projects (id, name, description, token_budget, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(id, input.name.trim(), input.description ?? "", tokenBudget, now, now);
  return getProject(db, id)!;
}

export function listTasks(db: SqliteDatabase, projectId: string): PromptTask[] {
  return (db.prepare("SELECT * FROM project_tasks WHERE project_id = ? ORDER BY updated_at DESC, name ASC").all(projectId) as TaskRow[]).map(mapTask);
}

export function getTask(db: SqliteDatabase, id: string): PromptTask | null {
  const row = db.prepare("SELECT * FROM project_tasks WHERE id = ?").get(id) as TaskRow | undefined;
  return row ? mapTask(row) : null;
}

export function createTask(db: SqliteDatabase, projectId: string, input: PromptTaskInput): PromptTask {
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    "INSERT INTO project_tasks (id, project_id, name, description, context_json, selected_asset_ids_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    id,
    projectId,
    input.name.trim(),
    input.description ?? "",
    JSON.stringify(input.context ?? {}),
    JSON.stringify(cleanStringArray(input.selectedAssetIds)),
    now,
    now
  );
  return getTask(db, id)!;
}

export function createCompileRun(
  db: SqliteDatabase,
  input: Omit<CompileRun, "id" | "createdAt">
): CompileRun {
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    "INSERT INTO compile_runs (id, project_id, task_id, target, input_json, output_text, token_estimate, status, warnings_json, errors_json, messages_json, manifest_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    id,
    input.projectId,
    input.taskId,
    input.target,
    JSON.stringify(input.input),
    input.outputText,
    input.tokenEstimate,
    input.status,
    JSON.stringify(input.warnings),
    JSON.stringify(input.errors),
    JSON.stringify(input.messages),
    JSON.stringify(input.manifest),
    now
  );
  return getCompileRun(db, id)!;
}

export function getCompileRun(db: SqliteDatabase, id: string): CompileRun | null {
  const row = db.prepare("SELECT * FROM compile_runs WHERE id = ?").get(id) as CompileRunRow | undefined;
  return row ? mapCompileRun(row) : null;
}

export function listCompileRuns(db: SqliteDatabase, projectId?: string): CompileRun[] {
  const rows = projectId
    ? db.prepare("SELECT * FROM compile_runs WHERE project_id = ? ORDER BY created_at DESC LIMIT 100").all(projectId) as CompileRunRow[]
    : db.prepare("SELECT * FROM compile_runs ORDER BY created_at DESC LIMIT 100").all() as CompileRunRow[];
  return rows.map(mapCompileRun);
}
