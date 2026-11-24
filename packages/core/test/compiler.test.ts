import { describe, expect, it } from "vitest";
import { compilePromptPackage } from "../src/compiler.js";
import type { PromptAsset } from "../src/types.js";

function asset(overrides: Partial<PromptAsset> & Pick<PromptAsset, "id" | "name" | "content">): PromptAsset {
  return {
    id: overrides.id,
    name: overrides.name,
    description: "",
    content: overrides.content,
    category: "General",
    tags: [],
    dependencies: [],
    conflictsWith: [],
    variables: [],
    priority: 0,
    version: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides
  };
}

describe("compilePromptPackage", () => {
  it("expands dependencies before dependents in a deterministic order", () => {
    const base = asset({ id: "base", name: "Base", content: "Base instructions" });
    const feature = asset({
      id: "feature",
      name: "Feature",
      content: "Feature instructions",
      dependencies: ["base"]
    });

    const result = compilePromptPackage({
      assets: [feature, base],
      selectedAssetIds: ["feature"]
    });

    expect(result.success).toBe(true);
    expect(result.orderedAssetIds).toEqual(["base", "feature"]);
    expect(result.text.indexOf("Base instructions")).toBeLessThan(result.text.indexOf("Feature instructions"));
  });

  it("produces the same output regardless of selected root order", () => {
    const first = asset({ id: "a", name: "A", content: "A", priority: 2 });
    const second = asset({ id: "b", name: "B", content: "B", priority: 1 });
    const left = compilePromptPackage({ assets: [first, second], selectedAssetIds: ["a", "b"] });
    const right = compilePromptPackage({ assets: [second, first], selectedAssetIds: ["b", "a"] });

    expect(left.text).toBe(right.text);
    expect(left.orderedAssetIds).toEqual(right.orderedAssetIds);
  });

  it("reports missing dependencies", () => {
    const item = asset({ id: "item", name: "Item", content: "Body", dependencies: ["absent"] });
    const result = compilePromptPackage({ assets: [item], selectedAssetIds: ["item"] });

    expect(result.success).toBe(false);
    expect(result.errors.map((error) => error.code)).toContain("MISSING_DEPENDENCY");
  });

  it("detects dependency cycles", () => {
    const a = asset({ id: "a", name: "A", content: "A", dependencies: ["b"] });
    const b = asset({ id: "b", name: "B", content: "B", dependencies: ["a"] });
    const result = compilePromptPackage({ assets: [a, b], selectedAssetIds: ["a"] });

    expect(result.success).toBe(false);
    expect(result.errors.map((error) => error.code)).toContain("DEPENDENCY_CYCLE");
  });

  it("detects conflicts declared from either side", () => {
    const a = asset({ id: "a", name: "A", content: "A", conflictsWith: ["b"] });
    const b = asset({ id: "b", name: "B", content: "B" });
    const result = compilePromptPackage({ assets: [a, b], selectedAssetIds: ["a", "b"] });

    expect(result.success).toBe(false);
    expect(result.errors.map((error) => error.code)).toContain("ASSET_CONFLICT");
  });

  it("renders required variables and defaults", () => {
    const item = asset({
      id: "item",
      name: "Brief",
      content: "Write for {{ audience }} in {{ language }}.",
      variables: [
        { name: "audience", required: true },
        { name: "language", required: false, defaultValue: "Chinese" }
      ]
    });
    const result = compilePromptPackage({
      assets: [item],
      selectedAssetIds: ["item"],
      variables: { audience: "engineers" }
    });

    expect(result.success).toBe(true);
    expect(result.text).toContain("Write for engineers in Chinese.");
  });

  it("rejects missing required variables", () => {
    const item = asset({
      id: "item",
      name: "Brief",
      content: "Write for {{ audience }}.",
      variables: [{ name: "audience", required: true }]
    });
    const result = compilePromptPackage({ assets: [item], selectedAssetIds: ["item"] });

    expect(result.success).toBe(false);
    expect(result.errors.map((error) => error.code)).toContain("MISSING_VARIABLE");
  });

  it("rejects packages above the token budget", () => {
    const item = asset({ id: "item", name: "Long", content: "A".repeat(500) });
    const result = compilePromptPackage({
      assets: [item],
      selectedAssetIds: ["item"],
      tokenBudget: 10
    });

    expect(result.success).toBe(false);
    expect(result.errors.map((error) => error.code)).toContain("TOKEN_BUDGET_EXCEEDED");
  });
});
