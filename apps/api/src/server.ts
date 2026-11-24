import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  ADAPTER_IDS,
  ADAPTERS,
  PROMPT_ROLES,
  compilePromptPackage,
  createAdapterArtifact,
  type AdapterId,
  type PromptAssetInput,
  type PromptProjectInput,
  type PromptRole,
  type PromptTaskInput,
  type VariableDefinition
} from "@promptforge/core";
import {
  createAsset,
  createCompileRun,
  createProject,
  createTask,
  deleteAsset,
  getAsset,
  getCompileRun,
  getProject,
  getTask,
  listAssets,
  listAssetVersions,
  listCompileRuns,
  listProjects,
  listTasks,
  openDatabase,
  restoreAssetVersion,
  updateAsset,
  type SqliteDatabase
} from "./database.js";

interface ServerOptions {
  database?: SqliteDatabase;
  dbPath?: string;
  logger?: boolean;
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(field + " 必须是非空字符串。");
  }
  return value.trim();
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(field + " 必须是非空字符串。");
  return value;
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new Error(field + " 必须是字符串。");
  return value;
}

function stringArray(value: unknown, field: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(field + " 必须是字符串数组。");
  }
  return value as string[];
}

function parsePromptRole(value: unknown): PromptRole | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !(PROMPT_ROLES as readonly string[]).includes(value)) {
    throw new Error("role 必须是 system、developer 或 user。");
  }
  return value as PromptRole;
}

function parseVariables(value: unknown): VariableDefinition[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error("variables 必须是数组。");

  return value.map((item, index) => {
    if (!isRecord(item)) throw new Error("variables[" + index + "] 格式无效。");
    const name = requiredString(item.name, "变量名称");
    if (item.required !== undefined && typeof item.required !== "boolean") {
      throw new Error("变量 required 必须是布尔值。");
    }
    const description = optionalString(item.description, "变量 description");
    const defaultValue = optionalString(item.defaultValue, "变量 defaultValue");
    return {
      name,
      required: item.required !== false,
      ...(description !== undefined ? { description } : {}),
      ...(defaultValue !== undefined ? { defaultValue } : {})
    };
  });
}

function parseStringRecord(value: unknown, field: string): Record<string, string> {
  if (value === undefined) return {};
  if (!isRecord(value)) throw new Error(field + " 必须是字符串键值对象。");
  const entries = Object.entries(value);
  if (entries.some(([, item]) => typeof item !== "string")) {
    throw new Error(field + " 的所有值都必须是字符串。");
  }
  return Object.fromEntries(entries) as Record<string, string>;
}

function parseAssetCreate(value: unknown): PromptAssetInput {
  if (!isRecord(value)) throw new Error("请求体格式无效。");
  const description = optionalString(value.description, "description");
  const category = optionalString(value.category, "category");
  const role = parsePromptRole(value.role);
  const tags = stringArray(value.tags, "tags");
  const dependencies = stringArray(value.dependencies, "dependencies");
  const conflictsWith = stringArray(value.conflictsWith, "conflictsWith");
  const variables = parseVariables(value.variables);
  if (value.priority !== undefined && (typeof value.priority !== "number" || !Number.isFinite(value.priority))) {
    throw new Error("priority 必须是有限数字。");
  }
  return {
    name: requiredString(value.name, "name"),
    ...(role !== undefined ? { role } : {}),
    content: requiredText(value.content, "content"),
    ...(description !== undefined ? { description } : {}),
    ...(category !== undefined ? { category } : {}),
    ...(tags !== undefined ? { tags } : {}),
    ...(dependencies !== undefined ? { dependencies } : {}),
    ...(conflictsWith !== undefined ? { conflictsWith } : {}),
    ...(variables !== undefined ? { variables } : {}),
    ...(typeof value.priority === "number" ? { priority: value.priority } : {})
  };
}

function parseAssetUpdate(value: unknown): Partial<PromptAssetInput> {
  if (!isRecord(value)) throw new Error("请求体格式无效。");
  const result: Partial<PromptAssetInput> = {};
  if (value.name !== undefined) result.name = requiredString(value.name, "name");
  if (value.role !== undefined) result.role = parsePromptRole(value.role)!;
  if (value.content !== undefined) result.content = requiredText(value.content, "content");
  if (value.description !== undefined) {
    const description = optionalString(value.description, "description");
    if (description === undefined) throw new Error("description 不能为空值。");
    result.description = description;
  }
  if (value.category !== undefined) result.category = requiredString(value.category, "category");
  if (value.tags !== undefined) result.tags = stringArray(value.tags, "tags")!;
  if (value.dependencies !== undefined) result.dependencies = stringArray(value.dependencies, "dependencies")!;
  if (value.conflictsWith !== undefined) result.conflictsWith = stringArray(value.conflictsWith, "conflictsWith")!;
  if (value.variables !== undefined) result.variables = parseVariables(value.variables)!;
  if (value.priority !== undefined) {
    if (typeof value.priority !== "number" || !Number.isFinite(value.priority)) throw new Error("priority 必须是有限数字。");
    result.priority = value.priority;
  }
  return result;
}

function parseProjectCreate(value: unknown): PromptProjectInput {
  if (!isRecord(value)) throw new Error("请求体格式无效。");
  const description = optionalString(value.description, "description");
  if (value.tokenBudget !== undefined && (typeof value.tokenBudget !== "number" || !Number.isFinite(value.tokenBudget) || value.tokenBudget <= 0)) {
    throw new Error("tokenBudget 必须是正数。");
  }
  return {
    name: requiredString(value.name, "name"),
    ...(description !== undefined ? { description } : {}),
    ...(typeof value.tokenBudget === "number" ? { tokenBudget: Math.floor(value.tokenBudget) } : {})
  };
}

function parseTaskCreate(value: unknown): PromptTaskInput {
  if (!isRecord(value)) throw new Error("请求体格式无效。");
  const description = optionalString(value.description, "description");
  return {
    name: requiredString(value.name, "name"),
    ...(description !== undefined ? { description } : {}),
    context: parseStringRecord(value.context, "context"),
    selectedAssetIds: stringArray(value.selectedAssetIds, "selectedAssetIds") ?? []
  };
}

function errorResponse(error: unknown): { error: string } {
  return { error: error instanceof Error ? error.message : "请求无效。" };
}

export function buildServer(options: ServerOptions = {}): FastifyInstance {
  const ownsDatabase = options.database === undefined;
  const db = options.database ?? openDatabase(options.dbPath);
  const app = Fastify({ logger: options.logger ?? false });

  app.register(cors, {
    origin: ["http://127.0.0.1:5173", "http://localhost:5173"]
  });

  app.addHook("onClose", async () => {
    if (ownsDatabase) db.close();
  });

  app.get("/api/health", async () => ({
    status: "ok",
    name: "PromptForge",
    version: "0.1.0"
  }));

  app.get("/api/adapters", async () => ({ adapters: ADAPTERS }));

  app.get("/api/assets", async (request) => {
    const query = request.query as { search?: string };
    return { assets: listAssets(db, typeof query.search === "string" ? query.search : "") };
  });

  app.get("/api/assets/:id", async (request, reply) => {
    const params = request.params as { id: string };
    const asset = getAsset(db, params.id);
    if (!asset) return reply.code(404).send({ error: "提示词模块不存在。" });
    return { asset };
  });

  app.post("/api/assets", async (request, reply) => {
    try {
      const asset = createAsset(db, parseAssetCreate(request.body));
      return reply.code(201).send({ asset });
    } catch (error) {
      return reply.code(400).send(errorResponse(error));
    }
  });

  app.put("/api/assets/:id", async (request, reply) => {
    try {
      const params = request.params as { id: string };
      const asset = updateAsset(db, params.id, parseAssetUpdate(request.body));
      if (!asset) return reply.code(404).send({ error: "提示词模块不存在。" });
      return { asset };
    } catch (error) {
      return reply.code(400).send(errorResponse(error));
    }
  });

  app.delete("/api/assets/:id", async (request, reply) => {
    const params = request.params as { id: string };
    const deleted = deleteAsset(db, params.id);
    if (!deleted) return reply.code(404).send({ error: "提示词模块不存在。" });
    return { deleted: true };
  });

  app.get("/api/assets/:id/versions", async (request, reply) => {
    const params = request.params as { id: string };
    if (!getAsset(db, params.id)) return reply.code(404).send({ error: "提示词模块不存在。" });
    return { versions: listAssetVersions(db, params.id) };
  });

  app.post("/api/assets/:id/versions/:version/restore", async (request, reply) => {
    const params = request.params as { id: string; version: string };
    const version = Number(params.version);
    if (!Number.isInteger(version) || version < 1) {
      return reply.code(400).send({ error: "版本号必须是正整数。" });
    }
    const asset = restoreAssetVersion(db, params.id, version);
    if (!asset) return reply.code(404).send({ error: "提示词模块或历史版本不存在。" });
    return { asset };
  });

  app.get("/api/projects", async () => ({ projects: listProjects(db) }));

  app.post("/api/projects", async (request, reply) => {
    try {
      const project = createProject(db, parseProjectCreate(request.body));
      return reply.code(201).send({ project });
    } catch (error) {
      return reply.code(400).send(errorResponse(error));
    }
  });

  app.get("/api/projects/:id/tasks", async (request, reply) => {
    const params = request.params as { id: string };
    if (!getProject(db, params.id)) return reply.code(404).send({ error: "项目不存在。" });
    return { tasks: listTasks(db, params.id) };
  });

  app.post("/api/projects/:id/tasks", async (request, reply) => {
    try {
      const params = request.params as { id: string };
      if (!getProject(db, params.id)) return reply.code(404).send({ error: "项目不存在。" });
      const task = createTask(db, params.id, parseTaskCreate(request.body));
      return reply.code(201).send({ task });
    } catch (error) {
      return reply.code(400).send(errorResponse(error));
    }
  });

  app.post("/api/compile", async (request, reply) => {
    try {
      if (!isRecord(request.body)) throw new Error("请求体格式无效。");
      const targetValue = requiredString(request.body.target, "target");
      if (!ADAPTER_IDS.includes(targetValue as AdapterId)) throw new Error("不支持的目标适配器：" + targetValue);

      const projectId = typeof request.body.projectId === "string" ? request.body.projectId : null;
      const taskId = typeof request.body.taskId === "string" ? request.body.taskId : null;
      const project = projectId ? getProject(db, projectId) : null;
      if (projectId && !project) return reply.code(404).send({ error: "项目不存在。" });

      const task = taskId ? getTask(db, taskId) : null;
      if (taskId && !task) return reply.code(404).send({ error: "任务不存在。" });
      if (task && projectId && task.projectId !== projectId) {
        return reply.code(400).send({ error: "任务不属于当前项目。" });
      }

      const selectedAssetIds = stringArray(request.body.assetIds, "assetIds") ?? task?.selectedAssetIds ?? [];
      const requestVariables = parseStringRecord(request.body.variables, "variables");
      const variables = { ...(task?.context ?? {}), ...requestVariables };
      const tokenBudget = request.body.tokenBudget !== undefined
        ? Number(request.body.tokenBudget)
        : project?.tokenBudget;

      if (tokenBudget !== undefined && (!Number.isFinite(tokenBudget) || tokenBudget <= 0)) {
        throw new Error("tokenBudget 必须是正数。");
      }

      const assets = listAssets(db);
      const result = compilePromptPackage({
        assets,
        selectedAssetIds,
        variables,
        ...(tokenBudget !== undefined ? { tokenBudget: Math.floor(tokenBudget) } : {}),
        ...(project ? { projectName: project.name } : {}),
        ...(task ? { taskName: task.name } : {})
      });

      const artifact = result.success
        ? createAdapterArtifact(targetValue as AdapterId, result, {
            ...(project ? { projectName: project.name } : {}),
            ...(task ? { taskName: task.name } : {})
          })
        : null;

      const run = createCompileRun(db, {
        projectId: project?.id ?? null,
        taskId: task?.id ?? null,
        target: targetValue as AdapterId,
        input: {
          selectedAssetIds,
          variables,
          ...(tokenBudget !== undefined ? { tokenBudget: Math.floor(tokenBudget) } : {})
        },
        outputText: result.text,
        messages: result.messages,
        manifest: result.manifest,
        tokenEstimate: result.tokenEstimate,
        status: result.success ? "success" : "failed",
        warnings: result.warnings,
        errors: result.errors
      });

      return { run, result, artifact };
    } catch (error) {
      return reply.code(400).send(errorResponse(error));
    }
  });

  app.get("/api/compile-runs", async (request) => {
    const query = request.query as { projectId?: string };
    return { runs: listCompileRuns(db, typeof query.projectId === "string" ? query.projectId : undefined) };
  });

  app.get("/api/compile-runs/:id", async (request, reply) => {
    const params = request.params as { id: string };
    const run = getCompileRun(db, params.id);
    if (!run) return reply.code(404).send({ error: "编译记录不存在。" });
    return { run };
  });

  return app;
}

export async function startServer(): Promise<void> {
  const dbPath = process.env.PROMPTFORGE_DB_PATH ?? resolve(process.cwd(), "data", "promptforge.sqlite");
  const app = buildServer({ dbPath, logger: true });
  const port = Number(process.env.PORT ?? 4317);
  const host = process.env.HOST ?? "127.0.0.1";
  await app.listen({ port, host });
  app.log.info("PromptForge API listening on http://" + host + ":" + port);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  startServer().catch((error: unknown) => {
    process.stderr.write(String(error) + "\n");
    process.exitCode = 1;
  });
}
