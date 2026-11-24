import type { CompileDiagnostic, PromptAsset, VariableDefinition } from "./types.js";

export interface TemplateRenderResult {
  text: string;
  errors: CompileDiagnostic[];
  warnings: CompileDiagnostic[];
  usedVariables: string[];
}

export interface VariableMergeResult {
  definitions: Map<string, VariableDefinition>;
  errors: CompileDiagnostic[];
  warnings: CompileDiagnostic[];
}

const VARIABLE_NAME_PATTERN = /^[\p{L}_][\p{L}\p{N}_.-]*$/u;
const PLACEHOLDER_PATTERN = /\{\{\s*([\p{L}_][\p{L}\p{N}_.-]*)\s*\}\}/gu;

export function mergeVariableDefinitions(assets: PromptAsset[]): VariableMergeResult {
  const definitions = new Map<string, VariableDefinition>();
  const errors: CompileDiagnostic[] = [];
  const warnings: CompileDiagnostic[] = [];

  for (const asset of assets) {
    const localNames = new Set<string>();
    for (const definition of asset.variables) {
      if (!VARIABLE_NAME_PATTERN.test(definition.name)) {
        errors.push({
          code: "INVALID_VARIABLE_NAME",
          stage: "variables",
          severity: "error",
          message: "模块 " + asset.name + " 包含无效变量名：" + definition.name,
          assetIds: [asset.id]
        });
        continue;
      }

      if (localNames.has(definition.name)) {
        errors.push({
          code: "DUPLICATE_VARIABLE_DEFINITION",
          stage: "variables",
          severity: "error",
          message: "模块 " + asset.name + " 重复定义变量：" + definition.name,
          assetIds: [asset.id]
        });
        continue;
      }
      localNames.add(definition.name);

      const existing = definitions.get(definition.name);
      if (!existing) {
        definitions.set(definition.name, { ...definition });
        continue;
      }

      if (
        existing.defaultValue !== undefined &&
        definition.defaultValue !== undefined &&
        existing.defaultValue !== definition.defaultValue
      ) {
        errors.push({
          code: "VARIABLE_DEFAULT_CONFLICT",
          stage: "variables",
          severity: "error",
          message: "变量 " + definition.name + " 存在互相冲突的默认值；必须显式统一定义。",
          assetIds: [asset.id]
        });
      }

      if (
        existing.description &&
        definition.description &&
        existing.description !== definition.description
      ) {
        warnings.push({
          code: "VARIABLE_DESCRIPTION_CONFLICT",
          stage: "variables",
          severity: "warning",
          message: "变量 " + definition.name + " 的说明不一致；采用确定性顺序中的首次说明。",
          assetIds: [asset.id]
        });
      }

      definitions.set(definition.name, {
        name: definition.name,
        required: existing.required || definition.required,
        ...(existing.description
          ? { description: existing.description }
          : definition.description
            ? { description: definition.description }
            : {}),
        ...(existing.defaultValue !== undefined
          ? { defaultValue: existing.defaultValue }
          : definition.defaultValue !== undefined
            ? { defaultValue: definition.defaultValue }
            : {})
      });
    }
  }

  return { definitions, errors, warnings };
}

export function renderTemplate(
  content: string,
  definitions: Map<string, VariableDefinition>,
  values: Record<string, string>,
  assetId: string
): TemplateRenderResult {
  const errors: CompileDiagnostic[] = [];
  const used = new Set<string>();
  const residue = content.replace(PLACEHOLDER_PATTERN, "");
  if (residue.includes("{{") || residue.includes("}}")) {
    errors.push({
      code: "MALFORMED_TEMPLATE",
      stage: "render",
      severity: "error",
      message: "模块 " + assetId + " 包含格式不正确的模板占位符。",
      assetIds: [assetId]
    });
  }

  const text = content.replace(PLACEHOLDER_PATTERN, (match, name: string) => {
    used.add(name);
    const definition = definitions.get(name);
    if (!definition) {
      errors.push({
        code: "UNDECLARED_VARIABLE",
        stage: "render",
        severity: "error",
        message: "模块 " + assetId + " 使用了未声明的变量：" + name,
        assetIds: [assetId]
      });
      return match;
    }

    if (Object.prototype.hasOwnProperty.call(values, name)) {
      const value = values[name] ?? "";
      if (definition.required && value.trim().length === 0) {
        errors.push({
          code: "MISSING_VARIABLE",
          stage: "render",
          severity: "error",
          message: "必需变量不能为空：" + name,
          assetIds: [assetId]
        });
        return match;
      }
      return value;
    }

    if (definition.defaultValue !== undefined) {
      if (definition.required && definition.defaultValue.trim().length === 0) {
        errors.push({
          code: "MISSING_VARIABLE",
          stage: "render",
          severity: "error",
          message: "必需变量没有有效值或非空默认值：" + name,
          assetIds: [assetId]
        });
        return match;
      }
      return definition.defaultValue;
    }

    if (!definition.required) return "";

    errors.push({
      code: "MISSING_VARIABLE",
      stage: "render",
      severity: "error",
      message: "模块 " + assetId + " 缺少必需变量：" + name,
      assetIds: [assetId]
    });
    return match;
  });

  return { text, errors, warnings: [], usedVariables: [...used].sort((a, b) => a.localeCompare(b)) };
}
