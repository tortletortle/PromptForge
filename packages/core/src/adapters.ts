import type {
  AdapterArtifact,
  AdapterInfo,
  AdapterId,
  CompileResult,
  CompiledMessage
} from "./types.js";

export const ADAPTERS: AdapterInfo[] = [
  { id: "cursor", name: "Cursor Rules", description: "导出为 Cursor 项目规则文件。", fileExtension: ".mdc" },
  { id: "claude-code", name: "Claude Code", description: "导出为 Claude Code 项目规则文件。", fileExtension: ".md" },
  { id: "chatgpt", name: "ChatGPT", description: "生成可复制或上传的 ChatGPT 提示词文档。", fileExtension: ".md" },
  { id: "api", name: "Generic API", description: "生成保留 system/developer/user 角色的 Chat Completions 风格 JSON。", fileExtension: ".json" },
  { id: "local", name: "Local AI", description: "生成适用于本地模型的纯文本提示词。", fileExtension: ".txt" }
];

function slugify(value: string): string {
  const slug = value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "prompt";
}

type AdapterCompileInput = string | Pick<CompileResult, "text" | "messages">;

export function createAdapterArtifact(
  target: AdapterId,
  input: AdapterCompileInput,
  metadata: { projectName?: string; taskName?: string } = {}
): AdapterArtifact {
  const text = typeof input === "string" ? input : input.text;
  const messages: CompiledMessage[] = typeof input === "string"
    ? [{ role: "system", content: text, sourceAssetIds: [] }]
    : input.messages;
  const project = metadata.projectName || "promptforge";
  const slug = slugify(project);
  const description = "PromptForge compiled instructions for " + project;
  let fileName = "";
  let mimeType = "text/markdown";
  let content = text;
  let instructions = "";

  switch (target) {
    case "cursor":
      fileName = ".cursor/rules/promptforge-" + slug + ".mdc";
      content = [
        "---",
        "description: " + JSON.stringify(description),
        "alwaysApply: false",
        "---",
        "",
        text
      ].join("\n");
      instructions = "将文件放入项目的 .cursor/rules/ 目录；检查与现有规则是否重复后再启用。";
      break;
    case "claude-code":
      fileName = ".claude/rules/promptforge-" + slug + ".md";
      content = "# " + description + "\n\n" + text;
      instructions = "将文件放入项目的 .claude/rules/ 目录；不会自动修改现有 CLAUDE.md。";
      break;
    case "chatgpt":
      fileName = "promptforge-chatgpt-" + slug + ".md";
      content = "# Instructions\n\n" + text;
      instructions = "复制内容到 ChatGPT 对话，或将 Markdown 文件作为上下文上传。";
      break;
    case "api":
      fileName = "promptforge-request-" + slug + ".json";
      mimeType = "application/json";
      content = JSON.stringify({
        messages: messages.map((message) => ({
          role: message.role,
          content: message.content
        })),
        metadata: {
          generatedBy: "PromptForge",
          project: metadata.projectName ?? null,
          task: metadata.taskName ?? null
        }
      }, null, 2);
      instructions = "将 messages 数组合并到目标模型服务商的请求体；模型名和鉴权信息由调用方提供。";
      break;
    case "local":
      fileName = "promptforge-local-" + slug + ".txt";
      mimeType = "text/plain";
      content = text;
      instructions = "复制到本地模型的 system prompt 或对应提示词输入框。";
      break;
  }

  return { target, fileName, mimeType, content, instructions };
}
