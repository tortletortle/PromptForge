export const ADAPTER_IDS = ["cursor", "claude-code", "chatgpt", "api", "local"] as const;

export type AdapterId = (typeof ADAPTER_IDS)[number];

export interface VariableDefinition {
  name: string;
  description?: string;
  required: boolean;
  defaultValue?: string;
}

export interface PromptAsset {
  id: string;
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

export interface PromptAssetInput {
  name: string;
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
  message: string;
  severity: DiagnosticSeverity;
  assetIds?: string[];
}

export interface CompileOptions {
  assets: PromptAsset[];
  selectedAssetIds: string[];
  variables?: Record<string, string>;
  tokenBudget?: number;
  projectName?: string;
  taskName?: string;
}

export interface CompileResult {
  success: boolean;
  text: string;
  orderedAssetIds: string[];
  tokenEstimate: number;
  estimateMethod: "heuristic-v1";
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
  tokenEstimate: number;
  status: "success" | "failed";
  warnings: CompileDiagnostic[];
  errors: CompileDiagnostic[];
  createdAt: string;
}
