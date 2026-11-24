import cors from "@fastify/cors";
import Fastify, { type FastifyError, type FastifyInstance, type FastifyReply } from "fastify";
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

export const API_LIMITS = {
  requestBodyBytes: 1_048_576,
  assetContentBytes: 262_144,
  assetNameBytes: 256,
  descriptionBytes: 4_096,
  categoryBytes: 128,
  tagCount: 32,
  tagBytes: 64,
  dependencyCount: 128,
  dependencyIdBytes: 128,
  variableDefinitionCountPerAsset: 256,
  variableNameBytes: 128,
  variableDescriptionBytes: 512,
  variableDefaultBytes: 8_192,
  variableCount: 256,
  variableValueBytes: 8_192,
  variableTotalBytes: 262_144,
  compileRootAssetCount: 128,
  compileDependencyNodes: 2_000,
  compileDependencyEdges: 10_000,
  compileSourceBytes: 1_048_576,
  compileVariableDefinitions: 8_192,
  compilePlaceholderCount: 20_000,
  compileOutputBytes: 2_097_152,
  tokenBudget: 10_000_000
} as const;

class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly statusCode: 413 | 422
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

function assertByteLength(
  value: string,
  field: string,
  maxBytes: number,
  code: string,
  statusCode: 413 | 422 = 413
): void {
  const actualBytes = Buffer.byteLength(value, "utf8");
  if (actualBytes > maxBytes) {
    throw new ApiRequestError(
      field + " 超过 " + maxBytes + " 字节上限（当前 " + actualBytes + " 字节）。",
      code,
      statusCode
    );
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(
  value: unknown,
  field: string,
  maxBytes: number = API_LIMITS.assetNameBytes
): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(field + " 必须是非空字符串。");
  }
  const normalized = value.trim();
  assertByteLength(normalized, field, maxBytes, "FIELD_TOO_LARGE");
  return normalized;
}

function requiredText(
  value: unknown,
  field: string,
  maxBytes: number = API_LIMITS.assetContentBytes
): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(field + " 必须是非空字符串。");
  assertByteLength(value, field, maxBytes, "ASSET_CONTENT_TOO_LARGE");
  return value;
}

function optionalString(
  value: unknown,
  field: string,
  maxBytes: number = API_LIMITS.descriptionBytes
): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new Error(field + " 必须是字符串。");
  assertByteLength(value, field, maxBytes, "FIELD_TOO_LARGE");
  return value;
}

function stringArray(
  value: unknown,
  field: string,
  maxItems: number = API_LIMITS.dependencyCount,
  maxItemBytes: number = API_LIMITS.dependencyIdBytes
): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(field + " 必须是字符串数组。");
  }
  if (value.length > maxItems) {
    throw new ApiRequestError(
      field + " 项数不能超过 " + maxItems + "。",
      "ARRAY_ITEM_LIMIT_EXCEEDED",
      422
    );
  }
  for (const item of value) assertByteLength(item, field + " 单项", maxItemBytes, "ARRAY_ITEM_TOO_LARGE");
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
  if (value.length > API_LIMITS.variableDefinitionCountPerAsset) {
    throw new ApiRequestError(
      "单个资产的变量定义不能超过 " + API_LIMITS.variableDefinitionCountPerAsset + " 项。",
      "VARIABLE_DEFINITION_COUNT_LIMIT",
      422
    );
  }

  return value.map((item, index) => {
    if (!isRecord(item)) throw new Error("variables[" + index + "] 格式无效。");
    const name = requiredString(item.name, "变量名称", API_LIMITS.variableNameBytes);
    if (item.required !== undefined && typeof item.required !== "boolean") {
      throw new Error("变量 required 必须是布尔值。");
    }
    const description = optionalString(item.description, "变量 description", API_LIMITS.variableDescriptionBytes);
    const defaultValue = optionalString(item.defaultValue, "变量 defaultValue", API_LIMITS.variableDefaultBytes);
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
  if (entries.length > API_LIMITS.variableCount) {
    throw new ApiRequestError(
      field + " 项数不能超过 " + API_LIMITS.variableCount + "。",
      "VARIABLE_COUNT_LIMIT",
      422
    );
  }
  if (entries.some(([, item]) => typeof item !== "string")) {
    throw new Error(field + " 的所有值都必须是字符串。");
  }

  let totalBytes = 0;
  for (const [name, item] of entries as Array<[string, string]>) {
    assertByteLength(name, field + " 变量名", API_LIMITS.variableNameBytes, "VARIABLE_NAME_TOO_LARGE");
    assertByteLength(item, field + " 变量值", API_LIMITS.variableValueBytes, "VARIABLE_VALUE_TOO_LARGE");
    totalBytes += Buffer.byteLength(name, "utf8") + Buffer.byteLength(item, "utf8");
    if (totalBytes > API_LIMITS.variableTotalBytes) {
      throw new ApiRequestError(
        field + " 的变量名和值合计不能超过 " + API_LIMITS.variableTotalBytes + " 字节。",
        "VARIABLE_TOTAL_BYTES_LIMIT",
        413
      );
    }
  }
  return Object.fromEntries(entries) as Record<string, string>;
}

function parseAssetCreate(value: unknown): PromptAssetInput {
  if (!isRecord(value)) throw new Error("请求体格式无效。");
  const description = optionalString(value.description, "description", API_LIMITS.descriptionBytes);
  const category = optionalString(value.category, "category", API_LIMITS.categoryBytes);
  const role = parsePromptRole(value.role);
  const tags = stringArray(value.tags, "tags", API_LIMITS.tagCount, API_LIMITS.tagBytes);
  const dependencies = stringArray(value.dependencies, "dependencies", API_LIMITS.dependencyCount, API_LIMITS.dependencyIdBytes);
  const conflictsWith = stringArray(value.conflictsWith, "conflictsWith", API_LIMITS.dependencyCount, API_LIMITS.dependencyIdBytes);
  const variables = parseVariables(value.variables);
  if (value.priority !== undefined && (typeof value.priority !== "number" || !Number.isFinite(value.priority))) {
    throw new Error("priority 必须是有限数字。");
  }
  return {
    name: requiredString(value.name, "name", API_LIMITS.assetNameBytes),
    ...(role !== undefined ? { role } : {}),
    content: requiredText(value.content, "content", API_LIMITS.assetContentBytes),
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
  if (value.name !== undefined) result.name = requiredString(value.name, "name", API_LIMITS.assetNameBytes);
  if (value.role !== undefined) result.role = parsePromptRole(value.role)!;
  if (value.content !== undefined) result.content = requiredText(value.content, "content", API_LIMITS.assetContentBytes);
  if (value.description !== undefined) {
    const description = optionalString(value.description, "description", API_LIMITS.descriptionBytes);
    if (description === undefined) throw new Error("description 不能为空值。");
    result.description = description;
  }
  if (value.category !== undefined) result.category = requiredString(value.category, "category", API_LIMITS.categoryBytes);
  if (value.tags !== undefined) result.tags = stringArray(value.tags, "tags", API_LIMITS.tagCount, API_LIMITS.tagBytes)!;
  if (value.dependencies !== undefined) result.dependencies = stringArray(value.dependencies, "dependencies", API_LIMITS.dependencyCount, API_LIMITS.dependencyIdBytes)!;
  if (value.conflictsWith !== undefined) result.conflictsWith = stringArray(value.conflictsWith, "conflictsWith", API_LIMITS.dependencyCount, API_LIMITS.dependencyIdBytes)!;
  if (value.variables !== undefined) result.variables = parseVariables(value.variables)!;
  if (value.priority !== undefined) {
    if (typeof value.priority !== "number" || !Number.isFinite(value.priority)) throw new Error("priority 必须是有限数字。");
    result.priority = value.priority;
  }
  return result;
}

function parseProjectCreate(value: unknown): PromptProjectInput {
  if (!isRecord(value)) throw new Error("请求体格式无效。");
  const description = optionalString(value.description, "description", API_LIMITS.descriptionBytes);
  if (value.tokenBudget !== undefined && (
    typeof value.tokenBudget !== "number" ||
    !Number.isSafeInteger(value.tokenBudget) ||
    value.tokenBudget <= 0 ||
    value.tokenBudget > API_LIMITS.tokenBudget
  )) {
    throw new ApiRequestError(
      "tokenBudget 必须是 1 到 " + API_LIMITS.tokenBudget + " 之间的正安全整数。",
      "TOKEN_BUDGET_OUT_OF_RANGE",
      422
    );
  }
  return {
    name: requiredString(value.name, "name", API_LIMITS.assetNameBytes),
    ...(description !== undefined ? { description } : {}),
    ...(typeof value.tokenBudget === "number" ? { tokenBudget: value.tokenBudget } : {})
  };
}

function parseTaskCreate(value: unknown): PromptTaskInput {
  if (!isRecord(value)) throw new Error("请求体格式无效。");
  const description = optionalString(value.description, "description", API_LIMITS.descriptionBytes);
  return {
    name: requiredString(value.name, "name", API_LIMITS.assetNameBytes),
    ...(description !== undefined ? { description } : {}),
    context: parseStringRecord(value.context, "context"),
    selectedAssetIds: stringArray(value.selectedAssetIds, "selectedAssetIds", API_LIMITS.compileRootAssetCount, API_LIMITS.dependencyIdBytes) ?? []
  };
}

function errorResponse(error: unknown): { error: string; code?: string } {
  if (error instanceof ApiRequestError) return { error: error.message, code: error.code };
  return { error: error instanceof Error ? error.message : "请求无效。" };
}

function sendApiError(reply: FastifyReply, error: unknown) {
  const statusCode = error instanceof ApiRequestError ? error.statusCode : 400;
  return reply.code(statusCode).send(errorResponse(error));
}

function assertCompileResourceLimits(
  assets: ReturnType<typeof listAssets>,
  selectedAssetIds: string[],
  variables: Record<string, string>
): void {
  if (selectedAssetIds.length > API_LIMITS.compileRootAssetCount) {
    throw new ApiRequestError(
      "单次编译根资产不能超过 " + API_LIMITS.compileRootAssetCount + " 个。",
      "COMPILE_ROOT_ASSET_LIMIT",
      422
    );
  }

  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const visited = new Set<string>();
  const stack = [...selectedAssetIds];
  const closure: ReturnType<typeof listAssets> = [];
  let dependencyEdges = 0;
  let sourceBytes = 0;

  while (stack.length > 0) {
    const id = stack.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const asset = byId.get(id);
    if (!asset) continue;

    closure.push(asset);
    if (closure.length > API_LIMITS.compileDependencyNodes) {
      throw new ApiRequestError(
        "单次编译依赖闭包不能超过 " + API_LIMITS.compileDependencyNodes + " 个资产。",
        "COMPILE_DEPENDENCY_NODE_LIMIT",
        422
      );
    }

    sourceBytes += Buffer.byteLength(asset.content, "utf8");
    if (sourceBytes > API_LIMITS.compileSourceBytes) {
      throw new ApiRequestError(
        "单次编译依赖闭包的源内容不能超过 " + API_LIMITS.compileSourceBytes + " 字节。",
        "COMPILE_SOURCE_BYTES_LIMIT",
        413
      );
    }

    dependencyEdges += asset.dependencies.length;
    if (dependencyEdges > API_LIMITS.compileDependencyEdges) {
      throw new ApiRequestError(
        "单次编译依赖边不能超过 " + API_LIMITS.compileDependencyEdges + " 条。",
        "COMPILE_DEPENDENCY_EDGE_LIMIT",
        422
      );
    }
    for (const dependencyId of asset.dependencies) stack.push(dependencyId);
  }

  const definitionCount = closure.reduce((total, asset) => total + asset.variables.length, 0);
  if (definitionCount > API_LIMITS.compileVariableDefinitions) {
    throw new ApiRequestError(
      "单次编译变量定义不能超过 " + API_LIMITS.compileVariableDefinitions + " 项。",
      "COMPILE_VARIABLE_DEFINITION_LIMIT",
      422
    );
  }

  const defaultBytes = new Map<string, number>();
  for (const asset of closure) {
    for (const definition of asset.variables) {
      if (definition.defaultValue === undefined) continue;
      const bytes = Buffer.byteLength(definition.defaultValue, "utf8");
      defaultBytes.set(definition.name, Math.max(defaultBytes.get(definition.name) ?? 0, bytes));
    }
  }

  let projectedOutputBytes = 256 + closure.length * 128;
  let placeholderCount = 0;
  const placeholderPattern = /\{\{\s*([\p{L}_][\p{L}\p{N}_.-]*)\s*\}\}/gu;
  for (const asset of closure) {
    projectedOutputBytes += Buffer.byteLength(asset.content, "utf8");
    for (const match of asset.content.matchAll(placeholderPattern)) {
      placeholderCount += 1;
      if (placeholderCount > API_LIMITS.compilePlaceholderCount) {
        throw new ApiRequestError(
          "单次编译模板占位符不能超过 " + API_LIMITS.compilePlaceholderCount + " 个。",
          "COMPILE_PLACEHOLDER_LIMIT",
          422
        );
      }

      const name = match[1]!;
      const placeholderBytes = Buffer.byteLength(match[0], "utf8");
      const replacementBytes = Object.prototype.hasOwnProperty.call(variables, name)
        ? Buffer.byteLength(variables[name] ?? "", "utf8")
        : Math.max(defaultBytes.get(name) ?? 0, placeholderBytes);
      projectedOutputBytes += replacementBytes - placeholderBytes;
      if (projectedOutputBytes > API_LIMITS.compileOutputBytes) {
        throw new ApiRequestError(
          "预计编译输出超过 " + API_LIMITS.compileOutputBytes + " 字节上限。",
          "COMPILE_OUTPUT_TOO_LARGE",
          413
        );
      }
    }
  }

  if (projectedOutputBytes > API_LIMITS.compileOutputBytes) {
    throw new ApiRequestError(
      "预计编译输出超过 " + API_LIMITS.compileOutputBytes + " 字节上限。",
      "COMPILE_OUTPUT_TOO_LARGE",
      413
    );
  }
}

export function buildServer(options: ServerOptions = {}): FastifyInstance {
  const ownsDatabase = options.database === undefined;
  const db = options.database ?? openDatabase(options.dbPath);
  const app = Fastify({
    logger: options.logger ?? false,
    bodyLimit: API_LIMITS.requestBodyBytes
  });

  app.setErrorHandler((error: FastifyError, _request, reply) => {
    if (error.statusCode === 413 || error.code === "FST_ERR_CTP_BODY_TOO_LARGE") {
      return reply.code(413).send({
        code: "REQUEST_BODY_TOO_LARGE",
        error: "请求体不能超过 " + API_LIMITS.requestBodyBytes + " 字节。"
      });
    }
    const statusCode = error.statusCode && error.statusCode >= 400 && error.statusCode < 500
      ? error.statusCode
      : 500;
    return reply.code(statusCode).send({
      code: statusCode === 500 ? "INTERNAL_SERVER_ERROR" : "REQUEST_ERROR",
      error: statusCode === 500 ? "服务器内部错误。" : error.message
    });
  });

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
      return sendApiError(reply, error);
    }
  });

  app.put("/api/assets/:id", async (request, reply) => {
    try {
      const params = request.params as { id: string };
      const asset = updateAsset(db, params.id, parseAssetUpdate(request.body));
      if (!asset) return reply.code(404).send({ error: "提示词模块不存在。" });
      return { asset };
    } catch (error) {
      return sendApiError(reply, error);
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
      return sendApiError(reply, error);
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
      return sendApiError(reply, error);
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

      const selectedAssetIds = stringArray(
        request.body.assetIds,
        "assetIds",
        API_LIMITS.requestBodyBytes,
        API_LIMITS.dependencyIdBytes
      ) ?? task?.selectedAssetIds ?? [];
      const requestVariables = parseStringRecord(request.body.variables, "variables");
      const variables = parseStringRecord({ ...(task?.context ?? {}), ...requestVariables }, "variables");
      const tokenBudget = request.body.tokenBudget !== undefined
        ? request.body.tokenBudget
        : project?.tokenBudget;

      if (tokenBudget !== undefined && (
        typeof tokenBudget !== "number" ||
        !Number.isSafeInteger(tokenBudget) ||
        tokenBudget <= 0 ||
        tokenBudget > API_LIMITS.tokenBudget
      )) {
        throw new ApiRequestError(
          "tokenBudget 必须是 1 到 " + API_LIMITS.tokenBudget + " 之间的正安全整数。",
          "TOKEN_BUDGET_OUT_OF_RANGE",
          422
        );
      }

      const assets = listAssets(db);
      assertCompileResourceLimits(assets, selectedAssetIds, variables);
      const result = compilePromptPackage({
        assets,
        selectedAssetIds,
        variables,
        ...(tokenBudget !== undefined ? { tokenBudget: Math.floor(tokenBudget) } : {}),
        ...(project ? { projectName: project.name } : {}),
        ...(task ? { taskName: task.name } : {})
      });

      if (Buffer.byteLength(result.text, "utf8") > API_LIMITS.compileOutputBytes) {
        throw new ApiRequestError(
          "编译输出超过 " + API_LIMITS.compileOutputBytes + " 字节上限。",
          "COMPILE_OUTPUT_TOO_LARGE",
          413
        );
      }

      const artifact = result.success
        ? createAdapterArtifact(targetValue as AdapterId, result, {
            ...(project ? { projectName: project.name } : {}),
            ...(task ? { taskName: task.name } : {})
          })
        : null;

      if (artifact && Buffer.byteLength(artifact.content, "utf8") > API_LIMITS.compileOutputBytes) {
        throw new ApiRequestError(
          "目标适配器文件超过 " + API_LIMITS.compileOutputBytes + " 字节上限。",
          "COMPILE_ARTIFACT_TOO_LARGE",
          413
        );
      }

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
      return sendApiError(reply, error);
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

export function resolveListenHost(value: string | undefined): string {
  const host = value?.trim() || "127.0.0.1";
  if (host !== "127.0.0.1" && host !== "localhost" && host !== "::1") {
    throw new Error(
      "PromptForge 尚未启用远程 API 认证，只允许监听本机回环地址（127.0.0.1、localhost 或 ::1）。"
    );
  }
  return host;
}

export async function startServer(): Promise<void> {
  const host = resolveListenHost(process.env.HOST);
  const port = Number(process.env.PORT ?? 4317);
  const dbPath = process.env.PROMPTFORGE_DB_PATH ?? resolve(process.cwd(), "data", "promptforge.sqlite");
  const app = buildServer({ dbPath, logger: true });
  try {
    await app.listen({ port, host });
    app.log.info("PromptForge API listening on http://" + host + ":" + port);
  } catch (error) {
    await app.close();
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  startServer().catch((error: unknown) => {
    process.stderr.write(String(error) + "\n");
    process.exitCode = 1;
  });
}
