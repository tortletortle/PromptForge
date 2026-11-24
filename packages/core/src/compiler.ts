import { mergeVariableDefinitions, renderTemplate } from "./template.js";
import {
  PROMPT_ROLES,
  type CompileAssetSnapshot,
  type CompileDiagnostic,
  type CompileManifest,
  type CompileOptions,
  type CompileResult,
  type CompiledMessage,
  type PromptAsset,
  type PromptRole,
  type TokenCounter
} from "./types.js";

const ROLE_RANK: Record<PromptRole, number> = {
  system: 0,
  developer: 1,
  user: 2
};

function isPromptRole(value: unknown): value is PromptRole {
  return typeof value === "string" && (PROMPT_ROLES as readonly string[]).includes(value);
}

function compareAssets(a: PromptAsset, b: PromptAsset): number {
  const aPriority = Number.isFinite(a.priority) ? a.priority : 0;
  const bPriority = Number.isFinite(b.priority) ? b.priority : 0;
  return bPriority - aPriority || a.id.localeCompare(b.id);
}

function diagnostic(
  code: string,
  stage: CompileDiagnostic["stage"],
  message: string,
  assetIds?: string[]
): CompileDiagnostic {
  return {
    code,
    ...(stage !== undefined ? { stage } : {}),
    severity: "error",
    message,
    ...(assetIds ? { assetIds } : {})
  };
}

function toCompileAssetSnapshot(asset: PromptAsset): CompileAssetSnapshot {
  return {
    id: asset.id,
    version: Number.isSafeInteger(asset.version) ? asset.version : 0,
    role: isPromptRole(asset.role) ? asset.role : "system",
    name: typeof asset.name === "string" ? asset.name : "",
    description: typeof asset.description === "string" ? asset.description : "",
    content: typeof asset.content === "string" ? asset.content : "",
    category: typeof asset.category === "string" ? asset.category : "General",
    tags: Array.isArray(asset.tags) ? asset.tags.filter((tag): tag is string => typeof tag === "string") : [],
    dependencies: Array.isArray(asset.dependencies)
      ? asset.dependencies.filter((id): id is string => typeof id === "string")
      : [],
    conflictsWith: Array.isArray(asset.conflictsWith)
      ? asset.conflictsWith.filter((id): id is string => typeof id === "string")
      : [],
    variables: Array.isArray(asset.variables)
      ? asset.variables.filter((item) => Boolean(item && typeof item.name === "string" && typeof item.required === "boolean"))
          .map((item) => ({ ...item }))
      : [],
    priority: Number.isFinite(asset.priority) ? asset.priority : 0
  };
}

function validateAssetIndex(assets: PromptAsset[]): CompileDiagnostic[] {
  const errors: CompileDiagnostic[] = [];
  const seen = new Set<string>();

  for (const asset of [...assets].sort((a, b) => String(a?.id).localeCompare(String(b?.id)))) {
    if (!asset || typeof asset !== "object") {
      errors.push(diagnostic("INVALID_ASSET", "input", "资产列表包含无效对象。"));
      continue;
    }
    if (typeof asset.id !== "string" || !asset.id.trim()) {
      errors.push(diagnostic("INVALID_ASSET_ID", "input", "提示词资产 ID 不能为空。"));
      continue;
    }
    if (seen.has(asset.id)) {
      errors.push(diagnostic("DUPLICATE_ASSET_ID", "input", "资产 ID 重复：" + asset.id, [asset.id]));
    }
    seen.add(asset.id);
  }

  return errors;
}

function validateResolvedAssets(assets: PromptAsset[]): CompileDiagnostic[] {
  const errors: CompileDiagnostic[] = [];

  for (const asset of [...assets].sort((a, b) => a.id.localeCompare(b.id))) {
    if (!isPromptRole(asset.role)) {
      errors.push(diagnostic("INVALID_ASSET_ROLE", "input", "资产 " + asset.id + " 的角色无效。", [asset.id]));
    }
    if (typeof asset.name !== "string" || !asset.name.trim()) {
      errors.push(diagnostic("INVALID_ASSET_NAME", "input", "资产 " + asset.id + " 的名称不能为空。", [asset.id]));
    }
    if (typeof asset.content !== "string" || asset.content.trim().length === 0) {
      errors.push(diagnostic("EMPTY_ASSET_CONTENT", "input", "资产 " + asset.id + " 的内容不能为空。", [asset.id]));
    }
    if (typeof asset.priority !== "number" || !Number.isFinite(asset.priority)) {
      errors.push(diagnostic("INVALID_ASSET_PRIORITY", "input", "资产 " + asset.id + " 的优先级必须是有限数字。", [asset.id]));
    }
    if (!Array.isArray(asset.dependencies) || asset.dependencies.some((id) => typeof id !== "string")) {
      errors.push(diagnostic("INVALID_ASSET_DEPENDENCIES", "input", "资产 " + asset.id + " 的依赖列表无效。", [asset.id]));
    }
    if (!Array.isArray(asset.variables)) {
      errors.push(diagnostic("INVALID_ASSET_VARIABLES", "input", "资产 " + asset.id + " 的变量定义列表无效。", [asset.id]));
    } else {
      for (const variable of asset.variables) {
        if (!variable || typeof variable !== "object" ||
            typeof variable.name !== "string" ||
            typeof variable.required !== "boolean" ||
            (variable.description !== undefined && typeof variable.description !== "string") ||
            (variable.defaultValue !== undefined && typeof variable.defaultValue !== "string")) {
          errors.push(diagnostic("INVALID_VARIABLE_DEFINITION", "input", "资产 " + asset.id + " 包含无效变量定义。", [asset.id]));
        }
      }
    }
    if (!Array.isArray(asset.tags) || !Array.isArray(asset.conflictsWith) ||
        asset.tags.some((tag) => typeof tag !== "string") ||
        asset.conflictsWith.some((id) => typeof id !== "string")) {
      errors.push(diagnostic("INVALID_ASSET_METADATA", "input", "资产 " + asset.id + " 的标签或冲突列表无效。", [asset.id]));
    }
  }

  return errors;
}

function resolveDependencies(
  assets: PromptAsset[],
  selectedAssetIds: string[]
): { orderedAssets: PromptAsset[]; errors: CompileDiagnostic[]; normalizedRoots: string[] } {
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const state = new Map<string, 0 | 1 | 2>();
  const orderedAssets: PromptAsset[] = [];
  const errors: CompileDiagnostic[] = [];
  const stack: string[] = [];
  const uniqueSelected = [...new Set(selectedAssetIds)];
  const roots = uniqueSelected
    .map((id) => byId.get(id))
    .filter((asset): asset is PromptAsset => Boolean(asset))
    .sort(compareAssets);
  const normalizedRoots = [
    ...roots.map((asset) => asset.id),
    ...uniqueSelected.filter((id) => !byId.has(id)).sort((a, b) => a.localeCompare(b))
  ];

  for (const id of uniqueSelected.filter((item) => !byId.has(item)).sort((a, b) => a.localeCompare(b))) {
    if (!byId.has(id)) {
      errors.push(diagnostic("ASSET_NOT_FOUND", "graph", "选择的模块不存在：" + id, [id]));
    }
  }

  const visit = (id: string, sourceId?: string): void => {
    const asset = byId.get(id);
    if (!asset) {
      errors.push(diagnostic(
        sourceId ? "MISSING_DEPENDENCY" : "ASSET_NOT_FOUND",
        "graph",
        sourceId ? "模块 " + sourceId + " 依赖不存在的模块 " + id : "选择的模块不存在：" + id,
        sourceId ? [sourceId, id] : [id]
      ));
      return;
    }

    const current = state.get(id) ?? 0;
    if (current === 2) return;
    if (current === 1) {
      const start = stack.indexOf(id);
      const cycle = [...stack.slice(start < 0 ? 0 : start), id];
      errors.push(diagnostic("DEPENDENCY_CYCLE", "graph", "检测到循环依赖：" + cycle.join(" → "), cycle));
      return;
    }

    state.set(id, 1);
    stack.push(id);
    const dependencies = (Array.isArray(asset.dependencies) ? asset.dependencies : [])
      .filter((dependencyId): dependencyId is string => typeof dependencyId === "string")
      .sort((left, right) => {
        const a = byId.get(left);
        const b = byId.get(right);
        if (a && b) return compareAssets(a, b);
        return left.localeCompare(right);
      });

    for (const dependencyId of dependencies) visit(dependencyId, id);

    stack.pop();
    state.set(id, 2);
    orderedAssets.push(asset);
  };

  for (const root of roots) visit(root.id);

  const uniqueErrors = new Map<string, CompileDiagnostic>();
  for (const error of errors) {
    const key = error.code + ":" + (error.assetIds ?? []).join(",");
    uniqueErrors.set(key, error);
  }

  return {
    orderedAssets,
    errors: [...uniqueErrors.values()],
    normalizedRoots
  };
}

function validateRoleDependencyOrder(assets: PromptAsset[]): CompileDiagnostic[] {
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const errors: CompileDiagnostic[] = [];

  for (const asset of assets) {
    for (const dependencyId of [...asset.dependencies].sort((a, b) => a.localeCompare(b))) {
      const dependency = byId.get(dependencyId);
      if (!dependency || !isPromptRole(asset.role) || !isPromptRole(dependency.role)) continue;
      if (ROLE_RANK[dependency.role] > ROLE_RANK[asset.role]) {
        errors.push(diagnostic(
          "ROLE_DEPENDENCY_ORDER_CONFLICT",
          "graph",
          "模块 " + asset.name + "（" + asset.role + "）依赖更晚角色的模块 " +
            dependency.name + "（" + dependency.role + "），无法同时满足角色顺序和依赖顺序。",
          [asset.id, dependency.id]
        ));
      }
    }
  }

  return errors;
}

function detectConflicts(assets: PromptAsset[]): CompileDiagnostic[] {
  const errors: CompileDiagnostic[] = [];
  for (let leftIndex = 0; leftIndex < assets.length; leftIndex += 1) {
    const left = assets[leftIndex];
    if (!left) continue;

    for (let rightIndex = leftIndex + 1; rightIndex < assets.length; rightIndex += 1) {
      const right = assets[rightIndex];
      if (!right) continue;
      if (left.conflictsWith.includes(right.id) || right.conflictsWith.includes(left.id)) {
        errors.push(diagnostic(
          "ASSET_CONFLICT",
          "graph",
          "模块冲突：" + left.name + " 与 " + right.name,
          [left.id, right.id]
        ));
      }
    }
  }
  return errors;
}

export function estimateTokens(text: string): number {
  let asciiCharacters = 0;
  let nonAsciiCharacters = 0;

  for (const character of text) {
    if (character.codePointAt(0)! <= 0x7f) asciiCharacters += 1;
    else nonAsciiCharacters += 1;
  }

  return Math.ceil(asciiCharacters / 4 + nonAsciiCharacters * 1.4);
}

export const heuristicTokenCounter: TokenCounter = {
  id: "heuristic-v2",
  count(messages) {
    return messages.reduce((total, message) => total + estimateTokens(message.content) + 4, 0);
  }
};

function createMessages(
  orderedAssets: PromptAsset[],
  renderedById: Map<string, string>
): CompiledMessage[] {
  const messages: CompiledMessage[] = [];

  for (const role of PROMPT_ROLES) {
    const assets = orderedAssets.filter((asset) => asset.role === role);
    if (assets.length === 0) continue;
    const sections = assets.map((asset) => {
      const body = renderedById.get(asset.id) ?? asset.content;
      return "## " + asset.name + "\n\n" + body.trim();
    });
    messages.push({
      role,
      content: sections.join("\n\n---\n\n"),
      sourceAssetIds: assets.map((asset) => asset.id)
    });
  }

  return messages;
}

function createDisplayText(
  messages: CompiledMessage[],
  options: CompileOptions
): string {
  const header = [
    "# PromptForge Prompt Package",
    ...(options.projectName ? ["Project: " + options.projectName] : []),
    ...(options.taskName ? ["Task: " + options.taskName] : [])
  ].join("\n");
  const sections = messages.map((message) =>
    "## " + message.role.toUpperCase() + " MESSAGE\n\n" + message.content
  );
  return [header, ...sections].join("\n\n---\n\n").trim();
}

function createManifest(
  selectedAssetIds: string[],
  orderedAssets: PromptAsset[],
  variableNames: string[],
  tokenEstimate: number,
  estimateMethod: string
): CompileManifest {
  return {
    schemaVersion: 1,
    selectedAssetIds,
    orderedAssetIds: orderedAssets.map((asset) => asset.id),
    resolvedAssets: orderedAssets.map(toCompileAssetSnapshot),
    variableNames: [...variableNames].sort((a, b) => a.localeCompare(b)),
    tokenEstimate,
    estimateMethod
  };
}

export function compilePromptKernel(options: CompileOptions): CompileResult {
  const errors: CompileDiagnostic[] = [];
  const warnings: CompileDiagnostic[] = [];
  const assets = Array.isArray(options.assets) ? options.assets : [];
  const selectedAssetIds = Array.isArray(options.selectedAssetIds) ? options.selectedAssetIds : [];

  if (!Array.isArray(options.assets)) {
    errors.push(diagnostic("INVALID_ASSET_LIST", "input", "assets 必须是资产数组。"));
  }
  if (!Array.isArray(options.selectedAssetIds) || selectedAssetIds.some((id) => typeof id !== "string")) {
    errors.push(diagnostic("INVALID_SELECTION", "input", "selectedAssetIds 必须是字符串数组。"));
  }
  if (selectedAssetIds.length === 0) {
    errors.push(diagnostic("NO_ASSETS_SELECTED", "input", "至少选择一个提示词模块后才能编译。"));
  }
  if (options.tokenBudget !== undefined &&
      (!Number.isSafeInteger(options.tokenBudget) || options.tokenBudget <= 0)) {
    errors.push(diagnostic("INVALID_TOKEN_BUDGET", "budget", "Token 预算必须是正安全整数。"));
  }
  if (options.variables !== undefined &&
      (!options.variables || typeof options.variables !== "object" || Array.isArray(options.variables) ||
       Object.values(options.variables).some((value) => typeof value !== "string"))) {
    errors.push(diagnostic("INVALID_VARIABLE_VALUES", "input", "variables 必须是字符串键值对象。"));
  }
  if (options.tokenCounter !== undefined &&
      (!options.tokenCounter || typeof options.tokenCounter.id !== "string" || !options.tokenCounter.id.trim() ||
       typeof options.tokenCounter.count !== "function")) {
    errors.push(diagnostic("INVALID_TOKEN_COUNTER", "budget", "TokenCounter 必须提供非空 id 和 count 函数。"));
  }

  errors.push(...validateAssetIndex(assets));
  if (errors.length > 0) {
    const manifest = createManifest([], [], [], 0, options.tokenCounter?.id ?? heuristicTokenCounter.id);
    return {
      success: false,
      text: "",
      messages: [],
      manifest,
      orderedAssetIds: [],
      tokenEstimate: 0,
      estimateMethod: manifest.estimateMethod,
      warnings,
      errors
    };
  }

  const duplicateRoots = [...new Set(selectedAssetIds.filter((id, index) => selectedAssetIds.indexOf(id) !== index))].sort((a, b) => a.localeCompare(b));
  if (duplicateRoots.length > 0) {
    warnings.push({
      code: "DUPLICATE_SELECTED_ASSET",
      stage: "input",
      severity: "warning",
      message: "重复选择的模块已自动去重：" + [...new Set(duplicateRoots)].sort().join(", ")
    });
  }

  const resolved = resolveDependencies(assets, selectedAssetIds);
  errors.push(...resolved.errors);
  errors.push(...validateResolvedAssets(resolved.orderedAssets));

  if (errors.length > 0) {
    const manifest = createManifest(resolved.normalizedRoots, resolved.orderedAssets, [], 0, options.tokenCounter?.id ?? heuristicTokenCounter.id);
    return {
      success: false,
      text: "",
      messages: [],
      manifest,
      orderedAssetIds: resolved.orderedAssets.map((asset) => asset.id),
      tokenEstimate: 0,
      estimateMethod: manifest.estimateMethod,
      warnings,
      errors
    };
  }

  errors.push(...validateRoleDependencyOrder(resolved.orderedAssets));
  errors.push(...detectConflicts(resolved.orderedAssets));
  if (errors.length > 0) {
    const manifest = createManifest(resolved.normalizedRoots, resolved.orderedAssets, [], 0, options.tokenCounter?.id ?? heuristicTokenCounter.id);
    return {
      success: false,
      text: "",
      messages: [],
      manifest,
      orderedAssetIds: resolved.orderedAssets.map((asset) => asset.id),
      tokenEstimate: 0,
      estimateMethod: manifest.estimateMethod,
      warnings,
      errors
    };
  }

  const variableMerge = mergeVariableDefinitions(resolved.orderedAssets);
  errors.push(...variableMerge.errors);
  warnings.push(...variableMerge.warnings);
  const values = options.variables ?? {};
  const renderedById = new Map<string, string>();
  const usedVariables = new Set<string>();

  for (const asset of resolved.orderedAssets) {
    const rendered = renderTemplate(asset.content, variableMerge.definitions, values, asset.id);
    errors.push(...rendered.errors);
    for (const name of rendered.usedVariables) usedVariables.add(name);
    renderedById.set(asset.id, rendered.text);
  }

  for (const name of Object.keys(values).sort((a, b) => a.localeCompare(b))) {
    if (!variableMerge.definitions.has(name)) {
      warnings.push({
        code: "UNUSED_VARIABLE_VALUE",
        stage: "variables",
        severity: "warning",
        message: "提供了未被选中资产声明的变量值：" + name
      });
    }
  }

  for (const name of [...variableMerge.definitions.keys()].sort((a, b) => a.localeCompare(b))) {
    if (!usedVariables.has(name)) {
      warnings.push({
        code: "UNUSED_VARIABLE_DEFINITION",
        stage: "variables",
        severity: "warning",
        message: "变量定义没有被当前资产内容引用：" + name
      });
    }
  }

  const messages = createMessages(resolved.orderedAssets, renderedById);
  const orderedAssetIds = messages.flatMap((message) => message.sourceAssetIds);
  const assetsById = new Map(resolved.orderedAssets.map((asset) => [asset.id, asset]));
  const emittedAssets = orderedAssetIds
    .map((id) => assetsById.get(id))
    .filter((asset): asset is PromptAsset => Boolean(asset));
  const text = createDisplayText(messages, options);
  const tokenCounter = options.tokenCounter ?? heuristicTokenCounter;
  let tokenEstimate = 0;

  try {
    tokenEstimate = tokenCounter.count(messages);
    if (!Number.isSafeInteger(tokenEstimate) || tokenEstimate < 0) {
      errors.push(diagnostic("INVALID_TOKEN_COUNT", "budget", "TokenCounter 必须返回非负安全整数。"));
      tokenEstimate = 0;
    }
  } catch {
    errors.push(diagnostic("TOKEN_COUNTER_FAILURE", "budget", "TokenCounter 执行失败，无法验证 Token 预算。"));
  }

  if (options.tokenBudget !== undefined && tokenEstimate > options.tokenBudget) {
    errors.push(diagnostic(
      "TOKEN_BUDGET_EXCEEDED",
      "budget",
      "估算 Token 数 " + tokenEstimate + " 超出预算 " + options.tokenBudget + "。"
    ));
  } else if (options.tokenBudget !== undefined && tokenEstimate >= options.tokenBudget * 0.9) {
    warnings.push({
      code: "TOKEN_BUDGET_NEAR_LIMIT",
      stage: "budget",
      severity: "warning",
      message: "估算 Token 数已达到预算的 90% 以上。"
    });
  }

  const manifest = createManifest(
    resolved.normalizedRoots,
    emittedAssets,
    [...variableMerge.definitions.keys()],
    tokenEstimate,
    tokenCounter.id
  );

  return {
    success: errors.length === 0,
    text,
    messages,
    manifest,
    orderedAssetIds,
    tokenEstimate,
    estimateMethod: tokenCounter.id,
    warnings,
    errors
  };
}

export function compilePromptPackage(options: CompileOptions): CompileResult {
  return compilePromptKernel(options);
}
