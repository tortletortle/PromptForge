import type { CompileDiagnostic, PromptAsset, VariableDefinition } from "./types.js";

export interface TemplateRenderResult {
  text: string;
  errors: CompileDiagnostic[];
  warnings: CompileDiagnostic[];
}

export function mergeVariableDefinitions(assets: PromptAsset[]): {
  definitions: Map<string, VariableDefinition>;
  warnings: CompileDiagnostic[];
} {
  const definitions = new Map<string, VariableDefinition>();
  const warnings: CompileDiagnostic[] = [];

  for (const asset of assets) {
    for (const definition of asset.variables) {
      const existing = definitions.get(definition.name);
      if (!existing) {
        definitions.set(definition.name, definition);
        continue;
      }

      if (
        existing.defaultValue !== undefined &&
        definition.defaultValue !== undefined &&
        existing.defaultValue !== definition.defaultValue
      ) {
        warnings.push({
          code: "VARIABLE_DEFAULT_CONFLICT",
          severity: "warning",
          message: "变量 " + definition.name + " 在多个模块中定义了不同默认值；采用依赖顺序中首次出现的默认值。",
          assetIds: [asset.id]
        });
      }

      definitions.set(definition.name, {
        name: definition.name,
        required: existing.required || definition.required,
        ...(existing.description ? { description: existing.description } : {}),
        ...(existing.defaultValue !== undefined
          ? { defaultValue: existing.defaultValue }
          : definition.defaultValue !== undefined
            ? { defaultValue: definition.defaultValue }
            : {})
      });
    }
  }

  return { definitions, warnings };
}

export function renderTemplate(
  content: string,
  definitions: Map<string, VariableDefinition>,
  values: Record<string, string>,
  assetId: string
): TemplateRenderResult {
  const errors: CompileDiagnostic[] = [];
  const used = new Set<string>();

  const text = content.replace(/\{\{\s*([\p{L}\p{N}_.-]+)\s*\}\}/gu, (match, rawName: string) => {
    const name = rawName.trim();
    used.add(name);

    if (Object.prototype.hasOwnProperty.call(values, name)) {
      return values[name] ?? "";
    }

    const definition = definitions.get(name);
    if (definition?.defaultValue !== undefined) {
      return definition.defaultValue;
    }

    if (definition && !definition.required) {
      return "";
    }

    errors.push({
      code: "MISSING_VARIABLE",
      severity: "error",
      message: "模块 " + assetId + " 缺少必需变量：" + name,
      assetIds: [assetId]
    });
    return match;
  });

  for (const definition of definitions.values()) {
    if (definition.required && !definition.defaultValue && !Object.prototype.hasOwnProperty.call(values, definition.name)) {
      if (used.has(definition.name)) {
        continue;
      }
    }
  }

  return { text, errors, warnings: [] };
}
