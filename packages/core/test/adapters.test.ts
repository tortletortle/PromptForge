import { describe, expect, it } from "vitest";
import { createAdapterArtifact } from "../src/adapters.js";

describe("target adapters", () => {
  it("renders Cursor rules with frontmatter", () => {
    const artifact = createAdapterArtifact("cursor", "Use concise instructions.", { projectName: "Demo App" });
    expect(artifact.fileName).toContain(".cursor/rules/");
    expect(artifact.content).toContain("alwaysApply: false");
    expect(artifact.content).toContain("Use concise instructions.");
  });

  it("renders a generic API request without inventing model credentials", () => {
    const artifact = createAdapterArtifact("api", "System instructions", { projectName: "Demo" });
    const parsed = JSON.parse(artifact.content) as { messages: Array<{ role: string; content: string }> };
    expect(parsed.messages[0]).toEqual({ role: "system", content: "System instructions" });
    expect(artifact.content).not.toContain("api_key");
  });

  it("renders Claude Code and local AI files", () => {
    expect(createAdapterArtifact("claude-code", "Rule").fileName).toContain(".claude/rules/");
    expect(createAdapterArtifact("local", "Rule").mimeType).toBe("text/plain");
  });
});
