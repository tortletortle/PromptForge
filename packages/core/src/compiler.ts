import { mergeVariableDefinitions, renderTemplate } from "./template.js";
import type {
  CompileDiagnostic,
  CompileOptions,
  CompileResult,
  PromptAsset
} from "./types.js";

function compareAssets(a: PromptAsset, b: PromptAsset): number {
  return b.priority - a.priority || a.id.localeCompare(b.id);
}

function resolveDependencies(
  assets: PromptAsset[],
  selectedAssetIds: string[]
): { orderedAssets: PromptAsset[]; errors: CompileDiagnostic[] } {
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const state = new Map<string, 0 | 1 | 2>();
  const orderedAssets: PromptAsset[] = [];
  const errors: CompileDiagnostic[] = [];
  const stack: string[] = [];

  const visit = (id: string, sourceId?: string): void => {
    const asset = byId.get(id);
    if (!asset) {
      errors.push({
        code: sourceId ? "MISSING_DEPENDENCY" : "ASSET_NOT_FOUND",
        severity: "error",
        message: sourceId
          ? "模块 " + sourceId + " 依赖不存在的模块 " + id
          : "选择的模块不存在：" + id,
        assetIds: sourceId ? [sourceId, id] : [id]
      });
      return;
    }

    const current = state.get(id) ?? 0;
    if (current === 2) return;
    if (current === 1) {
      const start = stack.indexOf(id);
      const cycle = [...stack.slice(start < 0 ? 0 : start), id];
      errors.push({
        code: "DEPENDENCY_CYCLE",
        severity: "error",
        message: "检测到循环依赖：" + cycle.join(" → "),
        assetIds: cycle
      });
      return;
    }

    state.set(id, 1);
    stack.push(id);
    const dependencies = [...asset.dependencies].sort((left, right) => {
      const a = byId.get(left);
      const b = byId.get(right);
      if (a && b) return compareAssets(a, b);
      return left.localeCompare(right);
    });

    for (const dependencyId of dependencies) {
      visit(dependencyId, id);
    }

    stack.pop();
    state.set(id, 2);
    orderedAssets.push(asset);
  };

  const roots = [...new Set(selectedAssetIds)]
    .map((id) => byId.get(id))
    .filter((asset): asset is PromptAsset => Boolean(asset))
    .sort(compareAssets);

  for (const id of selectedAssetIds) {
    if (!byId.has(id)) {
      errors.push({
        code: "ASSET_NOT_FOUND",
        severity: "error",
        message: "选择的模块不存在：" + id,
        assetIds: [id]
      });
    }
  }

  for (const root of roots) visit(root.id);

  const uniqueErrors = new Map<string, CompileDiagnostic>();
  for (const error of errors) {
    const key = error.code + ":" + (error.assetIds ?? []).join(",");
    uniqueErrors.set(key, error);
  }

  return { orderedAssets, errors: [...uniqueErrors.values()] };
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
        errors.push({
          code: "ASSET_CONFLICT",
          severity: "error",
          message: "模块冲突：" + left.name + " 与 " + right.name,
          assetIds: [left.id, right.id]
        });
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

export function compilePromptPackage(options: CompileOptions): CompileResult {
  const errors: CompileDiagnostic[] = [];
  const warnings: CompileDiagnostic[] = [];

  if (options.selectedAssetIds.length === 0) {
    errors.push({
      code: "NO_ASSETS_SELECTED",
      severity: "error",
      message: "至少选择一个提示词模块后才能编译。"
    });
  }

  const resolved = resolveDependencies(options.assets, options.selectedAssetIds);
  errors.push(...resolved.errors);

  if (errors.length > 0) {
    return {
      success: false,
      text: "",
      orderedAssetIds: resolved.orderedAssets.map((asset) => asset.id),
      tokenEstimate: 0,
      estimateMethod: "heuristic-v1",
      warnings,
      errors
    };
  }

  errors.push(...detectConflicts(resolved.orderedAssets));
  if (errors.length > 0) {
    return {
      success: false,
      text: "",
      orderedAssetIds: resolved.orderedAssets.map((asset) => asset.id),
      tokenEstimate: 0,
      estimateMethod: "heuristic-v1",
      warnings,
      errors
    };
  }

  const variableMerge = mergeVariableDefinitions(resolved.orderedAssets);
  warnings.push(...variableMerge.warnings);
  const values = options.variables ?? {};
  const renderedSections: string[] = [];

  for (const asset of resolved.orderedAssets) {
    const rendered = renderTemplate(asset.content, variableMerge.definitions, values, asset.id);
    errors.push(...rendered.errors);
    renderedSections.push("## " + asset.name + "\n\n" + rendered.text.trim());
  }

  const heading = "# PromptForge Prompt Package";
  const projectLine = options.projectName ? "\n\nProject: " + options.projectName : "";
  const taskLine = options.taskName ? "\nTask: " + options.taskName : "";
  const text = [heading + projectLine + taskLine, ...renderedSections].join("\n\n---\n\n").trim();
  const tokenEstimate = estimateTokens(text);

  if (options.tokenBudget !== undefined && tokenEstimate > options.tokenBudget) {
    errors.push({
      code: "TOKEN_BUDGET_EXCEEDED",
      severity: "error",
      message: "估算 Token 数 " + tokenEstimate + " 超出预算 " + options.tokenBudget + "。"
    });
  } else if (options.tokenBudget !== undefined && tokenEstimate >= options.tokenBudget * 0.9) {
    warnings.push({
      code: "TOKEN_BUDGET_NEAR_LIMIT",
      severity: "warning",
      message: "估算 Token 数已达到预算的 90% 以上。"
    });
  }

  return {
    success: errors.length === 0,
    text,
    orderedAssetIds: resolved.orderedAssets.map((asset) => asset.id),
    tokenEstimate,
    estimateMethod: "heuristic-v1",
    warnings,
    errors
  };
}
