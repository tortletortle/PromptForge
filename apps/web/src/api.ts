import type {
  AdapterArtifact,
  AdapterId,
  CompileResult,
  CompileRun,
  PromptAsset,
  PromptAssetInput,
  PromptAssetVersion,
  PromptProject,
  PromptProjectInput,
  PromptTask,
  PromptTaskInput
} from "@promptforge/core";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });

  const payload = await response.json() as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? "请求失败，HTTP " + response.status);
  }
  return payload;
}

export interface CompileResponse {
  run: CompileRun;
  result: CompileResult;
  artifact: AdapterArtifact | null;
}

export const api = {
  assets: (search = "") => request<{ assets: PromptAsset[] }>("/api/assets?search=" + encodeURIComponent(search)),
  createAsset: (input: PromptAssetInput) => request<{ asset: PromptAsset }>("/api/assets", {
    method: "POST",
    body: JSON.stringify(input)
  }),
  updateAsset: (id: string, input: Partial<PromptAssetInput>) => request<{ asset: PromptAsset }>("/api/assets/" + encodeURIComponent(id), {
    method: "PUT",
    body: JSON.stringify(input)
  }),
  deleteAsset: (id: string) => request<{ deleted: boolean }>("/api/assets/" + encodeURIComponent(id), {
    method: "DELETE"
  }),
  assetVersions: (id: string) => request<{ versions: PromptAssetVersion[] }>("/api/assets/" + encodeURIComponent(id) + "/versions"),
  restoreAssetVersion: (id: string, version: number) => request<{ asset: PromptAsset }>("/api/assets/" + encodeURIComponent(id) + "/versions/" + version + "/restore", {
    method: "POST"
  }),
  projects: () => request<{ projects: PromptProject[] }>("/api/projects"),
  createProject: (input: PromptProjectInput) => request<{ project: PromptProject }>("/api/projects", {
    method: "POST",
    body: JSON.stringify(input)
  }),
  tasks: (projectId: string) => request<{ tasks: PromptTask[] }>("/api/projects/" + encodeURIComponent(projectId) + "/tasks"),
  createTask: (projectId: string, input: PromptTaskInput) => request<{ task: PromptTask }>("/api/projects/" + encodeURIComponent(projectId) + "/tasks", {
    method: "POST",
    body: JSON.stringify(input)
  }),
  compile: (input: {
    projectId?: string;
    taskId?: string;
    assetIds: string[];
    variables: Record<string, string>;
    tokenBudget?: number;
    target: AdapterId;
  }) => request<CompileResponse>("/api/compile", {
    method: "POST",
    body: JSON.stringify(input)
  }),
  history: (projectId?: string) => request<{ runs: CompileRun[] }>(
    "/api/compile-runs" + (projectId ? "?projectId=" + encodeURIComponent(projectId) : "")
  )
};
