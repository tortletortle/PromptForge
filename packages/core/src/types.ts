export const ADAPTER_IDS = ["cursor", "claude-code", "chatgpt", "api", "local"] as const;

export type AdapterId = (typeof ADAPTER_IDS)[number];

export const PROMPT_ROLES = ["system", "developer", "user"] as const;

export type PromptRole = (typeof PROMPT_ROLES)[number];

export interface VariableDefinition {
  name: string;
  description?: string;
  required: boolean;
  defaultValue?: string;
}

export interface PromptAsset {
  id: string;
  role: PromptRole;
  name: string;
  description: string;
  content: string;
  category: string;
  tags: string[];
  dependencies: string[];
  conflictsWith: string[];
  variables: VariableDefinition[];
  priority: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface PromptAssetSnapshot {
  role: PromptRole;
  name: string;
  description: string;
  content: string;
  category: string;
  tags: string[];
  dependencies: string[];
  conflictsWith: string[];
  variables: VariableDefinition[];
  priority: number;
}

export interface PromptAssetVersion {
  assetId: string;
  version: number;
  snapshot: PromptAssetSnapshot;
  createdAt: string;
}

export interface PromptAssetInput {
  name: string;
  role?: PromptRole;
  description?: string;
  content: string;
  category?: string;
  tags?: string[];
  dependencies?: string[];
  conflictsWith?: string[];
  variables?: VariableDefinition[];
  priority?: number;
}

export interface PromptProject {
  id: string;
  name: string;
  description: string;
  tokenBudget: number;
  createdAt: string;
  updatedAt: string;
}

export interface PromptProjectInput {
  name: string;
  description?: string;
  tokenBudget?: number;
}

export interface PromptTask {
  id: string;
  projectId: string;
  name: string;
  description: string;
  context: Record<string, string>;
  selectedAssetIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface PromptTaskInput {
  name: string;
  description?: string;
  context?: Record<string, string>;
  selectedAssetIds?: string[];
}

export type DiagnosticSeverity = "error" | "warning";

export interface CompileDiagnostic {
  code: string;
  stage?: "input" | "graph" | "variables" | "render" | "budget";
  message: string;
  severity: DiagnosticSeverity;
  assetIds?: string[];
}

export interface CompiledMessage {
  role: PromptRole;
  content: string;
  sourceAssetIds: string[];
}

export interface CompileAssetSnapshot extends PromptAssetSnapshot {
  id: string;
  version: number;
}

export interface CompileManifest {
  schemaVersion: 1;
  selectedAssetIds: string[];
  orderedAssetIds: string[];
  resolvedAssets: CompileAssetSnapshot[];
  variableNames: string[];
  tokenEstimate: number;
  estimateMethod: string;
}

export interface TokenCounter {
  id: string;
  count(messages: readonly CompiledMessage[]): number;
}

export interface CompileOptions {
  assets: PromptAsset[];
  selectedAssetIds: string[];
  variables?: Record<string, string>;
  tokenBudget?: number;
  projectName?: string;
  taskName?: string;
  tokenCounter?: TokenCounter;
}

export interface CompileResult {
  success: boolean;
  text: string;
  messages: CompiledMessage[];
  manifest: CompileManifest;
  orderedAssetIds: string[];
  tokenEstimate: number;
  estimateMethod: string;
  warnings: CompileDiagnostic[];
  errors: CompileDiagnostic[];
}

export interface AdapterArtifact {
  target: AdapterId;
  fileName: string;
  mimeType: string;
  content: string;
  instructions: string;
}

export interface AdapterInfo {
  id: AdapterId;
  name: string;
  description: string;
  fileExtension: string;
}

export interface CompileRun {
  id: string;
  projectId: string | null;
  taskId: string | null;
  target: AdapterId;
  input: {
    selectedAssetIds: string[];
    variables: Record<string, string>;
    tokenBudget?: number;
  };
  outputText: string;
  messages: CompiledMessage[];
  manifest: CompileManifest;
  tokenEstimate: number;
  status: "success" | "failed";
  warnings: CompileDiagnostic[];
  errors: CompileDiagnostic[];
  createdAt: string;
}
