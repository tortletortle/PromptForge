import { describe, expect, it } from "vitest";
import { compilePromptKernel, compilePromptPackage } from "../src/compiler.js";
import type { PromptAsset } from "../src/types.js";

function asset(
  overrides: Partial<PromptAsset> & Pick<PromptAsset, "id" | "name" | "content">
): PromptAsset {
  return {
    id: overrides.id,
    role: "system",
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

describe("PromptForge deterministic kernel", () => {
  it("expands dependencies before dependents", () => {
    const base = asset({ id: "base", name: "Base", content: "Base instructions" });
    const feature = asset({
      id: "feature",
      name: "Feature",
      content: "Feature instructions",
      dependencies: ["base"]
    });
    const result = compilePromptKernel({ assets: [feature, base], selectedAssetIds: ["feature"] });

    expect(result.success).toBe(true);
    expect(result.orderedAssetIds).toEqual(["base", "feature"]);
    expect(result.text.indexOf("Base instructions")).toBeLessThan(result.text.indexOf("Feature instructions"));
  });

  it("produces byte-identical output regardless of input and root order", () => {
    const system = asset({ id: "a", name: "A", content: "A", priority: 2 });
    const developer = asset({ id: "b", name: "B", content: "B", role: "developer", priority: 1 });
    const left = compilePromptKernel({ assets: [system, developer], selectedAssetIds: ["a", "b"] });
    const right = compilePromptKernel({ assets: [developer, system], selectedAssetIds: ["b", "a"] });

    expect(left.text).toBe(right.text);
    expect(left.messages).toEqual(right.messages);
    expect(left.manifest).toEqual(right.manifest);
  });

  it("groups messages in canonical system, developer, user role order", () => {
    const user = asset({ id: "u", name: "User task", content: "Do the task", role: "user" });
    const developer = asset({ id: "d", name: "Developer policy", content: "Follow policy", role: "developer" });
    const system = asset({ id: "s", name: "System identity", content: "You are an assistant" });
    const result = compilePromptKernel({
      assets: [user, developer, system],
      selectedAssetIds: ["u", "d", "s"]
    });

    expect(result.success).toBe(true);
    expect(result.messages.map((message) => message.role)).toEqual(["system", "developer", "user"]);
    expect(result.messages[0]?.sourceAssetIds).toEqual(["s"]);
    expect(result.messages[2]?.content).toContain("Do the task");
  });

  it("allows a later role to depend on an earlier role", () => {
    const system = asset({ id: "s", name: "System", content: "Base rules" });
    const user = asset({
      id: "u",
      name: "User task",
      content: "Task",
      role: "user",
      dependencies: ["s"]
    });
    const result = compilePromptKernel({ assets: [user, system], selectedAssetIds: ["u"] });

    expect(result.success).toBe(true);
    expect(result.messages.map((message) => message.role)).toEqual(["system", "user"]);
  });

  it("rejects a dependency that contradicts canonical role order", () => {
    const user = asset({ id: "u", name: "User context", content: "Context", role: "user" });
    const system = asset({
      id: "s",
      name: "System",
      content: "System rules",
      dependencies: ["u"]
    });
    const result = compilePromptKernel({ assets: [system, user], selectedAssetIds: ["s"] });

    expect(result.success).toBe(false);
    expect(result.errors.map((item) => item.code)).toContain("ROLE_DEPENDENCY_ORDER_CONFLICT");
  });

  it("reports missing dependencies and cycles", () => {
    const missing = asset({ id: "missing-root", name: "Missing", content: "Body", dependencies: ["absent"] });
    const missingResult = compilePromptKernel({ assets: [missing], selectedAssetIds: ["missing-root"] });
    expect(missingResult.errors.map((item) => item.code)).toContain("MISSING_DEPENDENCY");

    const a = asset({ id: "a", name: "A", content: "A", dependencies: ["b"] });
    const b = asset({ id: "b", name: "B", content: "B", dependencies: ["a"] });
    const cycleResult = compilePromptKernel({ assets: [a, b], selectedAssetIds: ["a"] });
    expect(cycleResult.errors.map((item) => item.code)).toContain("DEPENDENCY_CYCLE");
  });

  it("detects conflicts declared from either side", () => {
    const a = asset({ id: "a", name: "A", content: "A", conflictsWith: ["b"] });
    const b = asset({ id: "b", name: "B", content: "B" });
    const result = compilePromptKernel({ assets: [a, b], selectedAssetIds: ["a", "b"] });

    expect(result.success).toBe(false);
    expect(result.errors.map((item) => item.code)).toContain("ASSET_CONFLICT");
  });

  it("renders required variables and defaults without recursive interpolation", () => {
    const item = asset({
      id: "item",
      name: "Brief",
      content: "Write for {{ audience }} in {{ language }}. Literal value: {{ audience }}.",
      variables: [
        { name: "audience", required: true },
        { name: "language", required: false, defaultValue: "Chinese" }
      ]
    });
    const result = compilePromptKernel({
      assets: [item],
      selectedAssetIds: ["item"],
      variables: { audience: "{{ injected }}" }
    });

    expect(result.success).toBe(true);
    expect(result.text).toContain("Write for {{ injected }} in Chinese.");
    expect(result.text).not.toContain("Literal value: injected");
  });

  it("rejects undeclared placeholders and malformed template syntax", () => {
    const unknown = asset({ id: "unknown", name: "Unknown", content: "Use {{ audience }}." });
    const unknownResult = compilePromptKernel({ assets: [unknown], selectedAssetIds: ["unknown"] });
    expect(unknownResult.errors.map((item) => item.code)).toContain("UNDECLARED_VARIABLE");

    const malformed = asset({ id: "malformed", name: "Malformed", content: "Use {{ audience." });
    const malformedResult = compilePromptKernel({ assets: [malformed], selectedAssetIds: ["malformed"] });
    expect(malformedResult.errors.map((item) => item.code)).toContain("MALFORMED_TEMPLATE");
  });

  it("rejects conflicting defaults instead of silently choosing one", () => {
    const first = asset({
      id: "a",
      name: "A",
      content: "Language {{ language }}",
      variables: [{ name: "language", required: false, defaultValue: "English" }]
    });
    const second = asset({
      id: "b",
      name: "B",
      content: "Language {{ language }}",
      variables: [{ name: "language", required: false, defaultValue: "Chinese" }]
    });
    const result = compilePromptKernel({ assets: [first, second], selectedAssetIds: ["a", "b"] });

    expect(result.success).toBe(false);
    expect(result.errors.map((item) => item.code)).toContain("VARIABLE_DEFAULT_CONFLICT");
  });

  it("rejects empty required values and warns about unused values", () => {
    const item = asset({
      id: "item",
      name: "Brief",
      content: "Write for {{ audience }}.",
      variables: [{ name: "audience", required: true }]
    });
    const empty = compilePromptKernel({
      assets: [item],
      selectedAssetIds: ["item"],
      variables: { audience: "   " }
    });
    expect(empty.errors.map((entry) => entry.code)).toContain("MISSING_VARIABLE");

    const unused = compilePromptKernel({
      assets: [item],
      selectedAssetIds: ["item"],
      variables: { audience: "engineers", typo: "extra" }
    });
    expect(unused.warnings.map((entry) => entry.code)).toContain("UNUSED_VARIABLE_VALUE");
  });

  it("rejects duplicate asset IDs and invalid token budgets", () => {
    const first = asset({ id: "same", name: "First", content: "A" });
    const second = asset({ id: "same", name: "Second", content: "B" });
    const duplicate = compilePromptKernel({ assets: [first, second], selectedAssetIds: ["same"] });
    expect(duplicate.errors.map((item) => item.code)).toContain("DUPLICATE_ASSET_ID");

    const invalidBudget = compilePromptKernel({
      assets: [first],
      selectedAssetIds: ["same"],
      tokenBudget: 0
    });
    expect(invalidBudget.errors.map((item) => item.code)).toContain("INVALID_TOKEN_BUDGET");
  });

  it("uses an injected tokenizer and returns its identity", () => {
    const item = asset({ id: "item", name: "One", content: "Hello" });
    const result = compilePromptKernel({
      assets: [item],
      selectedAssetIds: ["item"],
      tokenCounter: { id: "test-tokenizer-v1", count: () => 37 }
    });

    expect(result.tokenEstimate).toBe(37);
    expect(result.estimateMethod).toBe("test-tokenizer-v1");
    expect(result.manifest.estimateMethod).toBe("test-tokenizer-v1");
  });

  it("stores complete resolved asset snapshots in the compile manifest", () => {
    const item = asset({ id: "item", name: "Versioned", content: "Exact content", version: 7 });
    const result = compilePromptKernel({ assets: [item], selectedAssetIds: ["item"] });

    expect(result.manifest.schemaVersion).toBe(1);
    expect(result.manifest.resolvedAssets[0]).toMatchObject({
      id: "item",
      version: 7,
      role: "system",
      content: "Exact content"
    });
  });

  it("does not auto-select unrelated assets", () => {
    const selected = asset({ id: "selected", name: "Selected", content: "Keep" });
    const unrelated = asset({ id: "unrelated", name: "Unrelated", content: "Do not include" });
    const result = compilePromptKernel({
      assets: [selected, unrelated],
      selectedAssetIds: ["selected"]
    });

    expect(result.orderedAssetIds).toEqual(["selected"]);
    expect(result.text).not.toContain("Do not include");
  });

  it("keeps the V0.1 compiler entry point backward compatible", () => {
    const item = asset({ id: "item", name: "Compatibility", content: "Hello" });
    expect(compilePromptPackage({ assets: [item], selectedAssetIds: ["item"] }).success).toBe(true);
  });
});
