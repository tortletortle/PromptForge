import { describe, expect, it } from "vitest";
import { createAdapterArtifact } from "../src/adapters.js";

describe("target adapters", () => {
  it("renders Cursor rules with frontmatter", () => {
    const artifact = createAdapterArtifact("cursor", "Use concise instructions.", { projectName: "Demo App" });
    expect(artifact.fileName).toContain(".cursor/rules/");
    expect(artifact.content).toContain("alwaysApply: false");
    expect(artifact.content).toContain("Use concise instructions.");
  });

  it("preserves role-separated messages in generic API exports", () => {
    const artifact = createAdapterArtifact("api", {
      text: "Flattened preview",
      messages: [
        { role: "system", content: "System rules", sourceAssetIds: ["a"] },
        { role: "developer", content: "Developer policy", sourceAssetIds: ["b"] },
        { role: "user", content: "User task", sourceAssetIds: ["c"] }
      ]
    });
    const parsed = JSON.parse(artifact.content) as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(parsed.messages.map((message) => message.role)).toEqual(["system", "developer", "user"]);
    expect(parsed.messages[1]?.content).toBe("Developer policy");
    expect(artifact.content).not.toContain("api_key");
  });

  it("keeps string input backward compatible", () => {
    const artifact = createAdapterArtifact("api", "System instructions");
    const parsed = JSON.parse(artifact.content) as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(parsed.messages[0]).toEqual({ role: "system", content: "System instructions" });
  });

  it("renders Claude Code and local AI files", () => {
    expect(createAdapterArtifact("claude-code", "Rule").fileName).toContain(".claude/rules/");
    expect(createAdapterArtifact("local", "Rule").mimeType).toBe("text/plain");
  });
});
