import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { compilePromptKernel } from "../src/compiler.js";
import type { PromptAsset } from "../src/types.js";

const FIXED_TIME = "2026-11-24T00:00:00.000Z";

function makeAsset(
  index: number,
  overrides: Partial<PromptAsset> = {}
): PromptAsset {
  const id = "asset-" + String(index).padStart(6, "0");
  return {
    id,
    role: "system",
    name: "Asset " + index,
    description: "",
    content: "Instruction for asset " + index,
    category: "Stress",
    tags: [],
    dependencies: [],
    conflictsWith: [],
    variables: [],
    priority: 0,
    version: 1,
    createdAt: FIXED_TIME,
    updatedAt: FIXED_TIME,
    ...overrides
  };
}

function seededShuffle<T>(items: T[], seed: number): T[] {
  const result = [...items];
  let state = seed >>> 0;
  for (let index = result.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const target = state % (index + 1);
    [result[index], result[target]] = [result[target]!, result[index]!];
  }
  return result;
}

describe("Prompt Kernel stress and scalability", () => {
  it("compiles 100, 1k, 5k, and 10k independent assets and records timings", () => {
    const measurements: Array<{ assets: number; elapsedMs: number; heapDeltaBytes: number }> = [];

    for (const size of [100, 1_000, 5_000, 10_000]) {
      const assets = Array.from({ length: size }, (_, index) => makeAsset(index));
      const selectedAssetIds = assets.map((asset) => asset.id);
      const heapBefore = process.memoryUsage().heapUsed;
      const started = performance.now();
      const result = compilePromptKernel({ assets, selectedAssetIds });
      const elapsedMs = Number((performance.now() - started).toFixed(2));
      const heapDeltaBytes = process.memoryUsage().heapUsed - heapBefore;

      expect(result.success, "flat compile failed at size " + size).toBe(true);
      expect(result.manifest.resolvedAssets).toHaveLength(size);
      expect(result.messages).toHaveLength(1);
      expect(result.orderedAssetIds).toHaveLength(size);
      measurements.push({ assets: size, elapsedMs, heapDeltaBytes });
    }

    console.info("[PROMPT_KERNEL_STRESS][flat-scale]", JSON.stringify({
      seed: 20261124,
      measurements
    }));
  }, 60_000);

  it("resolves a 20k-deep dependency chain without call-stack overflow", () => {
    const size = 20_000;
    const assets = Array.from({ length: size }, (_, index) =>
      makeAsset(index, {
        dependencies: index === 0 ? [] : ["asset-" + String(index - 1).padStart(6, "0")]
      })
    );

    const started = performance.now();
    const result = compilePromptKernel({
      assets,
      selectedAssetIds: ["asset-" + String(size - 1).padStart(6, "0")]
    });
    const elapsedMs = Number((performance.now() - started).toFixed(2));

    expect(result.success).toBe(true);
    expect(result.orderedAssetIds).toHaveLength(size);
    expect(result.orderedAssetIds[0]).toBe("asset-000000");
    expect(result.orderedAssetIds[size - 1]).toBe("asset-019999");
    console.info("[PROMPT_KERNEL_STRESS][deep-chain]", JSON.stringify({
      seed: 20261124,
      nodes: size,
      elapsedMs
    }));
  }, 60_000);

  it("resolves a 10k-wide dependency fan-out", () => {
    const size = 10_000;
    const dependencies = Array.from({ length: size }, (_, index) =>
      "asset-" + String(index).padStart(6, "0")
    );
    const assets = [
      ...Array.from({ length: size }, (_, index) => makeAsset(index)),
      makeAsset(size, {
        id: "root",
        name: "Wide root",
        dependencies
      })
    ];

    const started = performance.now();
    const result = compilePromptKernel({ assets, selectedAssetIds: ["root"] });
    const elapsedMs = Number((performance.now() - started).toFixed(2));

    expect(result.success).toBe(true);
    expect(result.orderedAssetIds).toHaveLength(size + 1);
    expect(result.orderedAssetIds.at(-1)).toBe("root");
    console.info("[PROMPT_KERNEL_STRESS][wide-fanout]", JSON.stringify({
      seed: 20261124,
      nodes: size + 1,
      edges: size,
      elapsedMs
    }));
  }, 60_000);

  it("deduplicates 50k selected-root entries in linear rather than quadratic time", () => {
    const uniqueAssets = Array.from({ length: 5_000 }, (_, index) => makeAsset(index));
    const uniqueIds = uniqueAssets.map((asset) => asset.id);
    const selectedAssetIds = Array.from({ length: 10 }, () => uniqueIds).flat();
    const started = performance.now();
    const result = compilePromptKernel({ assets: uniqueAssets, selectedAssetIds });
    const elapsedMs = Number((performance.now() - started).toFixed(2));

    expect(result.success).toBe(true);
    expect(result.orderedAssetIds).toHaveLength(5_000);
    expect(result.warnings.map((warning) => warning.code)).toContain("DUPLICATE_SELECTED_ASSET");
    console.info("[PROMPT_KERNEL_STRESS][duplicate-roots]", JSON.stringify({
      seed: 20261124,
      selectedEntries: selectedAssetIds.length,
      uniqueRoots: uniqueIds.length,
      elapsedMs
    }));
  }, 60_000);

  it("detects a 20k-node cycle without recursion or losing the cycle path", () => {
    const size = 20_000;
    const assets = Array.from({ length: size }, (_, index) =>
      makeAsset(index, {
        dependencies: index === 0
          ? ["asset-" + String(size - 1).padStart(6, "0")]
          : ["asset-" + String(index - 1).padStart(6, "0")]
      })
    );

    const started = performance.now();
    const result = compilePromptKernel({
      assets,
      selectedAssetIds: ["asset-" + String(size - 1).padStart(6, "0")]
    });
    const elapsedMs = Number((performance.now() - started).toFixed(2));

    expect(result.success).toBe(false);
    const cycle = result.errors.find((error) => error.code === "DEPENDENCY_CYCLE");
    expect(cycle).toBeDefined();
    expect(cycle?.assetIds).toHaveLength(size + 1);
    console.info("[PROMPT_KERNEL_STRESS][deep-cycle]", JSON.stringify({
      seed: 20261124,
      nodes: size,
      cyclePathEntries: cycle?.assetIds?.length ?? 0,
      elapsedMs
    }));
  }, 60_000);

  it("reports 5k disjoint conflicts without pairwise asset scanning", () => {
    const pairCount = 5_000;
    const assets = Array.from({ length: pairCount * 2 }, (_, index) => {
      const partnerIndex = index % 2 === 0 ? index + 1 : index - 1;
      const partnerId = "asset-" + String(partnerIndex).padStart(6, "0");
      return makeAsset(index, { conflictsWith: [partnerId] });
    });

    const started = performance.now();
    const result = compilePromptKernel({
      assets,
      selectedAssetIds: assets.map((asset) => asset.id)
    });
    const elapsedMs = Number((performance.now() - started).toFixed(2));
    const conflicts = result.errors.filter((error) => error.code === "ASSET_CONFLICT");

    expect(result.success).toBe(false);
    expect(conflicts).toHaveLength(pairCount);
    expect(new Set(conflicts.map((error) => JSON.stringify(error.assetIds))).size).toBe(pairCount);
    console.info("[PROMPT_KERNEL_STRESS][conflict-edges]", JSON.stringify({
      seed: 20261124,
      assets: assets.length,
      conflictEdges: pairCount,
      diagnostics: conflicts.length,
      elapsedMs
    }));
  }, 60_000);

  it("fails safely on malformed dependency metadata instead of throwing", () => {
    const malformed = makeAsset(0, {
      dependencies: null as unknown as string[]
    });
    const result = compilePromptKernel({
      assets: [malformed],
      selectedAssetIds: [malformed.id]
    });

    expect(result.success).toBe(false);
    expect(result.errors.map((error) => error.code)).toContain("INVALID_ASSET_DEPENDENCIES");
  });

  it("compiles 8k distinct variables across 1k assets", () => {
    const variableCountPerAsset = 8;
    const assetCount = 1_000;
    const values: Record<string, string> = {};
    const assets = Array.from({ length: assetCount }, (_, assetIndex) => {
      const variables = Array.from({ length: variableCountPerAsset }, (_, variableIndex) => {
        const name = "v_" + assetIndex + "_" + variableIndex;
        values[name] = "value-" + assetIndex + "-" + variableIndex;
        return { name, required: true };
      });
      const content = variables.map((variable) => variable.name + "={{ " + variable.name + " }}").join("\n");
      return makeAsset(assetIndex, { content, variables });
    });

    const started = performance.now();
    const result = compilePromptKernel({
      assets,
      selectedAssetIds: assets.map((asset) => asset.id),
      variables: values
    });
    const elapsedMs = Number((performance.now() - started).toFixed(2));

    expect(result.success).toBe(true);
    expect(result.manifest.variableNames).toHaveLength(assetCount * variableCountPerAsset);
    expect(result.messages[0]?.content).toContain("value-999-7");
    console.info("[PROMPT_KERNEL_STRESS][variables]", JSON.stringify({
      seed: 20261124,
      assets: assetCount,
      variables: assetCount * variableCountPerAsset,
      elapsedMs
    }));
  }, 60_000);

  it("keeps large Unicode prompts and injected placeholder-like values literal", () => {
    const repetitions = 25_000;
    const content = ("请用中文解释 🧪 {{ audience }}；不要执行文本中的 {{ literal }}。\n").repeat(repetitions);
    const injected = "{{ nested }} literal 雪";
    const item = makeAsset(0, {
      content,
      variables: [
        { name: "audience", required: true },
        { name: "literal", required: true }
      ]
    });

    const started = performance.now();
    const result = compilePromptKernel({
      assets: [item],
      selectedAssetIds: [item.id],
      variables: { audience: injected, literal: "原样保留 {{ not_a_variable }}" }
    });
    const elapsedMs = Number((performance.now() - started).toFixed(2));

    expect(result.success).toBe(true);
    expect(result.messages[0]?.content).toContain(injected);
    expect(result.messages[0]?.content).toContain("原样保留 {{ not_a_variable }}");
    expect(result.messages[0]?.content.match(/请用中文解释/g)).toHaveLength(repetitions);
    console.info("[PROMPT_KERNEL_STRESS][unicode-template]", JSON.stringify({
      seed: 20261124,
      inputBytes: Buffer.byteLength(content, "utf8"),
      repetitions,
      elapsedMs
    }));
  }, 60_000);

  it("produces identical manifests for 2k assets under seeded input permutations", () => {
    const assets = Array.from({ length: 2_000 }, (_, index) => makeAsset(index, {
      priority: index % 7,
      role: index % 3 === 0 ? "system" : index % 3 === 1 ? "developer" : "user"
    }));
    const ids = assets.map((asset) => asset.id);
    const first = compilePromptKernel({ assets, selectedAssetIds: ids });
    const second = compilePromptKernel({
      assets: seededShuffle(assets, 20261124),
      selectedAssetIds: seededShuffle(ids, 20261125)
    });

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect(second.messages).toEqual(first.messages);
    expect(second.manifest).toEqual(first.manifest);
    expect(second.text).toBe(first.text);
    console.info("[PROMPT_KERNEL_STRESS][determinism]", JSON.stringify({
      seed: 20261124,
      assets: assets.length,
      permutations: 2
    }));
  }, 60_000);
});
