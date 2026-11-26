import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowDownToLine,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Clock3,
  Code2,
  Copy,
  FileCode2,
  FileText,
  FolderKanban,
  History,
  Layers3,
  Library,
  ListChecks,
  LoaderCircle,
  Plus,
  Play,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  Trash2,
  WandSparkles,
  X
} from "lucide-react";
import type {
  AdapterId,
  CompileRun,
  PromptAsset,
  PromptAssetInput,
  PromptAssetVersion,
  PromptProject,
  PromptRole,
  PromptTask,
  VariableDefinition
} from "@promptforge/core";
import { api, type CompileResponse } from "./api";

type View = "library" | "composer" | "history";

interface AssetFormState {
  name: string;
  role: PromptRole;
  description: string;
  content: string;
  category: string;
  tags: string;
  dependencies: string;
  conflictsWith: string;
  variablesJson: string;
  priority: string;
}

const emptyAssetForm: AssetFormState = {
  name: "",
  role: "system",
  description: "",
  content: "",
  category: "General",
  tags: "",
  dependencies: "",
  conflictsWith: "",
  variablesJson: "[]",
  priority: "0"
};

const adapterLabels: Record<AdapterId, string> = {
  cursor: "Cursor Rules",
  "claude-code": "Claude Code",
  chatgpt: "ChatGPT",
  api: "Generic API",
  local: "Local AI"
};

const roleLabels: Record<PromptRole, string> = {
  system: "系统指令",
  developer: "开发者指令",
  user: "用户输入"
};

function splitList(value: string): string[] {
  return [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
}

function formFromAsset(asset: PromptAsset): AssetFormState {
  return {
    name: asset.name,
    role: asset.role ?? "system",
    description: asset.description,
    content: asset.content,
    category: asset.category,
    tags: asset.tags.join(", "),
    dependencies: asset.dependencies.join(", "),
    conflictsWith: asset.conflictsWith.join(", "),
    variablesJson: JSON.stringify(asset.variables, null, 2),
    priority: String(asset.priority)
  };
}

function payloadFromForm(form: AssetFormState): PromptAssetInput {
  const manualVariables = (form.variablesJson.trim()
    ? JSON.parse(form.variablesJson)
    : []) as VariableDefinition[];
  if (!Array.isArray(manualVariables) || manualVariables.some((item) => !item || typeof item.name !== "string")) {
    throw new Error("高级变量定义必须是包含 name 字段的 JSON 数组。");
  }
  const variables = [...manualVariables];
  const definedNames = new Set(manualVariables.map((item) => item.name));
  const placeholderPattern = /\{\{\s*([\p{L}_][\p{L}\p{N}_.-]*)\s*\}\}/gu;
  for (const match of form.content.matchAll(placeholderPattern)) {
    const name = match[1]!;
    if (!definedNames.has(name)) {
      variables.push({ name, required: true });
      definedNames.add(name);
    }
  }
  return {
    name: form.name.trim(),
    role: form.role,
    description: form.description,
    content: form.content,
    category: form.category.trim() || "General",
    tags: splitList(form.tags),
    dependencies: splitList(form.dependencies),
    conflictsWith: splitList(form.conflictsWith),
    variables,
    priority: Number(form.priority) || 0
  };
}

function collectSelectedVariableDefinitions(
  assets: PromptAsset[],
  selectedAssetIds: string[]
): VariableDefinition[] {
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const visited = new Set<string>();
  const ordered: PromptAsset[] = [];

  const visit = (id: string): void => {
    if (visited.has(id)) return;
    visited.add(id);
    const asset = byId.get(id);
    if (!asset) return;
    for (const dependencyId of asset.dependencies) visit(dependencyId);
    ordered.push(asset);
  };

  for (const id of selectedAssetIds) visit(id);

  const definitions = new Map<string, VariableDefinition>();
  for (const asset of ordered) {
    for (const definition of asset.variables) {
      if (!definitions.has(definition.name)) definitions.set(definition.name, definition);
    }
  }
  return [...definitions.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function App() {
  const [view, setView] = useState<View>("library");
  const [assets, setAssets] = useState<PromptAsset[]>([]);
  const [assetVersions, setAssetVersions] = useState<PromptAssetVersion[]>([]);
  const [projects, setProjects] = useState<PromptProject[]>([]);
  const [tasks, setTasks] = useState<PromptTask[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [isNewAsset, setIsNewAsset] = useState(false);
  const [form, setForm] = useState<AssetFormState>(emptyAssetForm);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [target, setTarget] = useState<AdapterId>("cursor");
  const [tokenBudget, setTokenBudget] = useState("8000");
  const [newProjectName, setNewProjectName] = useState("");
  const [newTaskName, setNewTaskName] = useState("");
  const [taskContextJson, setTaskContextJson] = useState("{}");
  const [compileResponse, setCompileResponse] = useState<CompileResponse | null>(null);
  const [previewMode, setPreviewMode] = useState<"artifact" | "messages">("artifact");
  const [history, setHistory] = useState<CompileRun[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? null;
  const selectedAsset = assets.find((asset) => asset.id === selectedAssetId) ?? null;
  const filteredAssets = useMemo(() => {
    return assets.filter((asset) => {
      const matchesCategory = categoryFilter === "All" || asset.category === categoryFilter;
      const needle = search.trim().toLowerCase();
      const matchesSearch = !needle ||
        asset.name.toLowerCase().includes(needle) ||
        asset.description.toLowerCase().includes(needle) ||
        asset.content.toLowerCase().includes(needle) ||
        asset.tags.some((tag) => tag.toLowerCase().includes(needle));
      return matchesCategory && matchesSearch;
    });
  }, [assets, categoryFilter, search]);

  const categories = useMemo(() => {
    return ["All", ...new Set(assets.map((asset) => asset.category).filter(Boolean))];
  }, [assets]);

  const variableDefinitions = useMemo(
    () => collectSelectedVariableDefinitions(assets, selectedAssetIds),
    [assets, selectedAssetIds]
  );

  async function loadWorkspace(): Promise<void> {
    const [assetResult, projectResult] = await Promise.all([api.assets(), api.projects()]);
    setAssets(assetResult.assets);
    setProjects(projectResult.projects);
    if (!selectedProjectId && projectResult.projects[0]) {
      setSelectedProjectId(projectResult.projects[0].id);
      setTokenBudget(String(projectResult.projects[0].tokenBudget));
    }
    if (!selectedAssetId && assetResult.assets[0]) {
      setSelectedAssetId(assetResult.assets[0].id);
    }
    if (selectedAssetIds.length === 0 && assetResult.assets[0]) {
      setSelectedAssetIds([assetResult.assets[0].id]);
    }
  }

  useEffect(() => {
    loadWorkspace().catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : "无法连接 PromptForge API。");
    });
  }, []);

  useEffect(() => {
    if (!isNewAsset && selectedAssetId) {
      const asset = assets.find((item) => item.id === selectedAssetId);
      if (asset) setForm(formFromAsset(asset));
      api.assetVersions(selectedAssetId).then((result) => setAssetVersions(result.versions)).catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : "版本历史加载失败。");
      });
    } else {
      setAssetVersions([]);
    }
  }, [selectedAssetId, assets, isNewAsset]);

  useEffect(() => {
    if (!selectedProjectId) {
      setTasks([]);
      setSelectedTaskId("");
      return;
    }
    api.tasks(selectedProjectId).then((result) => {
      setTasks(result.tasks);
      if (selectedTaskId && !result.tasks.some((task) => task.id === selectedTaskId)) {
        setSelectedTaskId("");
      }
    }).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : "任务列表加载失败。");
    });
  }, [selectedProjectId]);

  useEffect(() => {
    if (selectedProject) setTokenBudget(String(selectedProject.tokenBudget));
  }, [selectedProjectId, projects]);

  useEffect(() => {
    const task = tasks.find((item) => item.id === selectedTaskId);
    if (!task) return;
    setVariableValues(task.context);
    if (task.selectedAssetIds.length > 0) setSelectedAssetIds(task.selectedAssetIds);
  }, [selectedTaskId, tasks]);

  useEffect(() => {
    if (view === "history") {
      api.history(selectedProjectId || undefined)
        .then((result) => setHistory(result.runs))
        .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "历史记录加载失败。"));
    }
  }, [view, selectedProjectId]);

  function beginNewAsset(): void {
    setIsNewAsset(true);
    setSelectedAssetId(null);
    setForm(emptyAssetForm);
    setView("library");
    setError("");
    setNotice("");
  }

  function selectAsset(asset: PromptAsset): void {
    setIsNewAsset(false);
    setSelectedAssetId(asset.id);
    setError("");
    setNotice("");
  }

  async function saveAsset(): Promise<void> {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const payload = payloadFromForm(form);
      if (!payload.name || !payload.content.trim()) throw new Error("名称和提示词正文不能为空。");
      const result = isNewAsset
        ? await api.createAsset(payload)
        : selectedAssetId
          ? await api.updateAsset(selectedAssetId, payload)
          : null;
      if (!result) throw new Error("没有选中的提示词模块。");
      const refreshed = await api.assets();
      setAssets(refreshed.assets);
      setSelectedAssetId(result.asset.id);
      setIsNewAsset(false);
      setNotice("模块已保存。版本 " + result.asset.version);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存失败。");
    } finally {
      setBusy(false);
    }
  }

  async function restoreVersion(version: number): Promise<void> {
    if (!selectedAssetId || !window.confirm("恢复到 v" + version + " 会创建一个新的当前版本，不会删除后续历史。继续吗？")) return;
    setBusy(true);
    setError("");
    try {
      const result = await api.restoreAssetVersion(selectedAssetId, version);
      const refreshed = await api.assets();
      setAssets(refreshed.assets);
      setSelectedAssetId(result.asset.id);
      setNotice("已恢复 v" + version + " 的内容，并创建新版本 v" + result.asset.version + "。");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "版本恢复失败。");
    } finally {
      setBusy(false);
    }
  }

  async function removeAsset(): Promise<void> {
    if (!selectedAssetId || !window.confirm("确定删除这个提示词模块吗？依赖它的模块会在下次编译时报告缺失依赖。")) return;
    setBusy(true);
    try {
      await api.deleteAsset(selectedAssetId);
      const refreshed = await api.assets();
      setAssets(refreshed.assets);
      setSelectedAssetId(refreshed.assets[0]?.id ?? null);
      setIsNewAsset(false);
      setNotice("模块已删除。");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "删除失败。");
    } finally {
      setBusy(false);
    }
  }

  function openAsset(assetId: string): void {
    const asset = assets.find((item) => item.id === assetId);
    if (!asset) {
      setNotice("该来源资产当前不存在，可能已被删除。");
      return;
    }
    setView("library");
    selectAsset(asset);
  }

  function toggleAsset(id: string): void {
    setSelectedAssetIds((current) => current.includes(id)
      ? current.filter((item) => item !== id)
      : [...current, id]);
  }

  async function createProject(): Promise<void> {
    if (!newProjectName.trim()) return;
    setBusy(true);
    setError("");
    try {
      const result = await api.createProject({ name: newProjectName.trim(), tokenBudget: Number(tokenBudget) || 8000 });
      const refreshed = await api.projects();
      setProjects(refreshed.projects);
      setSelectedProjectId(result.project.id);
      setNewProjectName("");
      setNotice("项目已创建。");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "项目创建失败。");
    } finally {
      setBusy(false);
    }
  }

  async function createTask(): Promise<void> {
    if (!selectedProjectId || !newTaskName.trim()) return;
    setBusy(true);
    setError("");
    try {
      const parsedContext = JSON.parse(taskContextJson) as unknown;
      if (!parsedContext || typeof parsedContext !== "object" || Array.isArray(parsedContext) || Object.values(parsedContext).some((value) => typeof value !== "string")) {
        throw new Error("任务上下文必须是字符串键值 JSON 对象。");
      }
      const result = await api.createTask(selectedProjectId, {
        name: newTaskName.trim(),
        selectedAssetIds,
        context: parsedContext as Record<string, string>
      });
      const refreshed = await api.tasks(selectedProjectId);
      setTasks(refreshed.tasks);
      setSelectedTaskId(result.task.id);
      setNewTaskName("");
      setTaskContextJson("{}");
      setNotice("任务上下文已创建。");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "任务创建失败。");
    } finally {
      setBusy(false);
    }
  }

  async function compile(): Promise<void> {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const activeVariableNames = new Set(variableDefinitions.map((definition) => definition.name));
      const variables = Object.fromEntries(
        Object.entries(variableValues).filter(([name, value]) =>
          activeVariableNames.has(name) && typeof value === "string" && value.length > 0
        )
      );
      const response = await api.compile({
        ...(selectedProjectId ? { projectId: selectedProjectId } : {}),
        ...(selectedTaskId ? { taskId: selectedTaskId } : {}),
        assetIds: selectedAssetIds,
        variables,
        ...(Number(tokenBudget) > 0 ? { tokenBudget: Number(tokenBudget) } : {}),
        target
      });
      setCompileResponse(response);
      if (response.result.success) setNotice("编译完成，已保存历史记录。");
      else setError("编译未通过，请查看诊断信息。");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "编译失败。");
    } finally {
      setBusy(false);
    }
  }

  async function copyOutput(): Promise<void> {
    const content = previewMode === "messages" && compileResponse
      ? JSON.stringify(compileResponse.result.messages, null, 2)
      : compileResponse?.artifact?.content ?? compileResponse?.result.text;
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      setNotice("已复制到剪贴板。");
    } catch {
      setError("浏览器未授予剪贴板权限，请手动选择并复制。");
    }
  }

  function downloadOutput(): void {
    const artifact = compileResponse?.artifact;
    if (!artifact) return;
    const blob = new Blob([artifact.content], { type: artifact.mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = artifact.fileName.split("/").pop() ?? "promptforge-output";
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice("导出文件已生成。目标路径建议为：" + artifact.fileName);
  }

  const selectedAssetCount = selectedAssetIds.length;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark"><WandSparkles size={19} strokeWidth={2.2} /></div>
          <div>
            <div className="brand-name">PromptForge</div>
            <div className="brand-caption">PROMPT WORKSPACE</div>
          </div>
        </div>

        <div className="workspace-label">WORKSPACE</div>
        <nav className="main-nav" aria-label="Main navigation">
          <button className={view === "library" ? "nav-item active" : "nav-item"} onClick={() => setView("library")}>
            <Library size={17} /><span>提示词库</span><span className="nav-count">{assets.length}</span>
          </button>
          <button className={view === "composer" ? "nav-item active" : "nav-item"} onClick={() => setView("composer")}>
            <Layers3 size={17} /><span>组合工作台</span>
          </button>
          <button className={view === "history" ? "nav-item active" : "nav-item"} onClick={() => setView("history")}>
            <History size={17} /><span>编译历史</span>
          </button>
        </nav>

        <div className="sidebar-divider" />
        <div className="workspace-label">CURRENT PROJECT</div>
        <div className="project-switcher">
          <div className="project-avatar">{selectedProject?.name.slice(0, 1).toUpperCase() ?? "P"}</div>
          <div className="project-switcher-copy">
            <strong>{selectedProject?.name ?? "尚未创建项目"}</strong>
            <span>{selectedProject ? "本地工作区" : "创建项目以开始"}</span>
          </div>
          <ChevronDown size={15} />
          <select
            className="project-select-overlay"
            aria-label="选择项目"
            value={selectedProjectId}
            onChange={(event) => setSelectedProjectId(event.target.value)}
          >
            <option value="">选择项目</option>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
        </div>

        <div className="sidebar-spacer" />
        <div className="local-status">
          <div className="status-dot" />
          <div><strong>本地存储已启用</strong><span>SQLite · 仅本机访问</span></div>
        </div>
        <div className="sidebar-footer">PROMPTFORGE V0.1 · PRIVATE BY DEFAULT</div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb">
            <span>PromptForge</span><span className="breadcrumb-slash">/</span>
            <strong>{view === "library" ? "提示词库" : view === "composer" ? "组合工作台" : "编译历史"}</strong>
          </div>
          <div className="topbar-actions">
            <div className="local-chip"><span /> LOCAL WORKSPACE</div>
            <button className="topbar-icon" title="V0.1 本地工作区" aria-label="帮助"><CircleHelp size={18} /></button>
            <div className="avatar">PF</div>
          </div>
        </header>

        <div className="page-content">
          {error && (
            <div className="feedback error-feedback"><AlertCircle size={16} /><span>{error}</span><button onClick={() => setError("")}><X size={15} /></button></div>
          )}
          {notice && (
            <div className="feedback success-feedback"><CheckCircle2 size={16} /><span>{notice}</span><button onClick={() => setNotice("")}><X size={15} /></button></div>
          )}

          {view === "library" && (
            <>
              <section className="page-heading">
                <div>
                  <div className="eyebrow">ASSET LIBRARY <span>·</span> {assets.length} MODULES</div>
                  <h1>提示词资产库</h1>
                  <p>把有效指令拆成可复用模块，维护版本、依赖与变量。</p>
                </div>
                <button className="button button-primary" onClick={beginNewAsset}><Plus size={16} /> 新建模块</button>
              </section>

              <section className="library-workspace">
                <div className="asset-browser">
                  <div className="browser-toolbar">
                    <div className="search-field"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索模块、正文或标签..." /></div>
                    <div className="filter-row">
                      <span>分类</span>
                      <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                        {categories.map((category) => <option key={category} value={category}>{category === "All" ? "全部分类" : category}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="asset-list">
                    {filteredAssets.map((asset) => (
                      <button
                        key={asset.id}
                        className={selectedAssetId === asset.id && !isNewAsset ? "asset-card selected" : "asset-card"}
                        onClick={() => selectAsset(asset)}
                      >
                        <div className="asset-card-top">
                          <div className="asset-type-icon"><FileText size={16} /></div>
                          <span className="asset-category">{asset.category}</span>
                          <span className={"role-badge role-" + (asset.role ?? "system")}>{roleLabels[asset.role ?? "system"]}</span>
                          <span className="asset-version">v{asset.version}</span>
                        </div>
                        <strong>{asset.name}</strong>
                        <p>{asset.description || asset.content.slice(0, 86).replace(/\s+/g, " ")}</p>
                        <div className="asset-card-bottom">
                          <div className="tag-list">{asset.tags.slice(0, 2).map((tag) => <span key={tag}>{tag}</span>)}</div>
                          <span className="asset-updated">{formatDate(asset.updatedAt)}</span>
                        </div>
                      </button>
                    ))}
                    {filteredAssets.length === 0 && (
                      <div className="empty-list">
                        <div className="empty-icon"><BookOpen size={20} /></div>
                        <strong>{assets.length ? "没有匹配的模块" : "提示词库还是空的"}</strong>
                        <p>{assets.length ? "试试其他关键词或分类。" : "创建第一个模块，把常用指令沉淀为资产。"}</p>
                        {!assets.length && <button className="button button-secondary button-small" onClick={beginNewAsset}><Plus size={14} /> 创建模块</button>}
                      </div>
                    )}
                  </div>
                  <div className="browser-footer"><span>{filteredAssets.length} 个模块</span><span>本地 SQLite 数据库</span></div>
                </div>

                <div className="asset-editor">
                  {selectedAssetId || isNewAsset ? (
                    <>
                      <div className="editor-heading">
                        <div>
                          <div className="eyebrow">{isNewAsset ? "NEW ASSET" : "ASSET EDITOR"}</div>
                          <h2>{isNewAsset ? "创建提示词模块" : "编辑模块"}</h2>
                        </div>
                        <div className="editor-heading-actions">
                          {!isNewAsset && assetVersions.length > 1 && <select className="version-restore-select" defaultValue="" aria-label="恢复历史版本" onChange={(event) => { const version = Number(event.target.value); event.currentTarget.value = ""; if (version > 0) void restoreVersion(version); }}><option value="">版本历史 · {assetVersions.length}</option>{assetVersions.filter((item) => item.version !== selectedAsset?.version).map((item) => <option key={item.version} value={item.version}>恢复 v{item.version} · {roleLabels[item.snapshot.role ?? "system"]} · {formatDate(item.createdAt)}</option>)}</select>}
                          {!isNewAsset && <button className="icon-button danger-quiet" onClick={removeAsset} title="删除模块"><Trash2 size={16} /></button>}
                          <button className="button button-primary button-small" onClick={saveAsset} disabled={busy}>
                            {busy ? <LoaderCircle className="spin" size={15} /> : <SaveIcon />}
                            保存模块
                          </button>
                        </div>
                      </div>
                      <div className="editor-form">
                        <div className="form-grid">
                          <label className="field field-wide"><span>模块名称 <b>*</b></span><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="例如：代码审查标准" /></label>
                          <label className="field field-wide"><span>提示词角色</span><select aria-label="提示词角色" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as PromptRole })}><option value="system">系统指令（system）</option><option value="developer">开发者指令（developer）</option><option value="user">用户输入（user）</option></select></label>
                          <label className="field field-wide"><span>提示词正文 <b>*</b></span><textarea className="content-editor" value={form.content} onChange={(event) => setForm({ ...form, content: event.target.value })} placeholder={"写下需要复用的指令。变量使用 {{ variable_name }}，保存后会自动识别。"} /></label>
                        </div>
                        <details className="advanced-settings">
                          <summary><strong>高级设置</strong><span>分类、标签、依赖、冲突和变量默认值</span></summary>
                          <div className="form-grid advanced-fields">
                            {!isNewAsset && selectedAssetId && <label className="field field-wide"><span>模块 ID <small>供依赖与冲突引用</small></span><input readOnly value={selectedAssetId} /></label>}
                            <label className="field"><span>分类</span><input value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} placeholder="Engineering" /></label>
                            <label className="field"><span>优先级</span><input type="number" value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })} /></label>
                            <label className="field field-wide"><span>描述</span><input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="这个模块解决什么问题？" /></label>
                            <label className="field field-wide"><span>标签 <small>用逗号分隔</small></span><input value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} placeholder="coding, review, quality" /></label>
                            <label className="field field-wide"><span>依赖模块 ID <small>用逗号分隔</small></span><input value={form.dependencies} onChange={(event) => setForm({ ...form, dependencies: event.target.value })} placeholder="填写需要先加载的模块 ID" /></label>
                            <label className="field field-wide"><span>冲突模块 ID <small>用逗号分隔</small></span><input value={form.conflictsWith} onChange={(event) => setForm({ ...form, conflictsWith: event.target.value })} placeholder="不能同时组合的模块 ID" /></label>
                            <label className="field field-wide"><span>变量定义 <small>高级 JSON；普通变量会从正文自动识别</small></span><textarea className="json-editor" value={form.variablesJson} onChange={(event) => setForm({ ...form, variablesJson: event.target.value })} spellCheck={false} /></label>
                          </div>
                        </details>
                      </div>
                      <div className="editor-footer"><span><ShieldCheck size={14} /> {selectedAsset ? roleLabels[selectedAsset.role ?? "system"] + " · 当前 v" + selectedAsset.version + " · " + assetVersions.length + " 个历史快照" : "保存后生成新版本"}</span><span>支持 {"{{ variable }}"} 模板</span></div>
                    </>
                  ) : (
                    <div className="editor-empty">
                      <div className="empty-icon large"><Layers3 size={24} /></div>
                      <h3>选择一个模块开始编辑</h3>
                      <p>或者创建新模块，把重复使用的提示词拆解为独立资产。</p>
                      <button className="button button-secondary" onClick={beginNewAsset}><Plus size={15} /> 新建模块</button>
                    </div>
                  )}
                </div>
              </section>
            </>
          )}

          {view === "composer" && (
            <>
              <section className="page-heading">
                <div>
                  <div className="eyebrow">PROMPT COMPILER <span>·</span> DETERMINISTIC BUILD</div>
                  <h1>组合工作台</h1>
                  <p>选择模块、解析依赖、填充变量，生成可复现的目标平台提示词包。</p>
                </div>
                <div className="compiler-status"><span className="status-dot" /> COMPILER READY</div>
              </section>

              <section className="composer-layout">
                <div className="composer-inputs">
                  <div className="panel">
                    <div className="panel-title"><div className="step-number">01</div><div><h3>项目与任务</h3><p>定义本次编译的工作上下文</p></div></div>
                    {projects.length > 0 ? (
                      <>
                        <label className="field"><span>项目</span><select value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value)}><option value="">不关联项目</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
                        <div className="inline-create"><input value={newTaskName} onChange={(event) => setNewTaskName(event.target.value)} placeholder="新任务名称..." /><button className="button button-secondary button-small" onClick={createTask} disabled={!selectedProjectId || !newTaskName.trim() || busy}><Plus size={14} /> 添加任务</button></div>
                        <label className="field task-context-field"><span>新任务上下文 <small>JSON 字符串键值对象</small></span><textarea className="json-editor task-context-editor" value={taskContextJson} onChange={(event) => setTaskContextJson(event.target.value)} spellCheck={false} placeholder={'{\n  "audience": "engineers"\n}'} /></label>
                        <label className="field"><span>任务上下文</span><select value={selectedTaskId} onChange={(event) => setSelectedTaskId(event.target.value)}><option value="">不使用特定任务</option>{tasks.map((task) => <option key={task.id} value={task.id}>{task.name}</option>)}</select></label>
                        {selectedProject && <div className="project-budget-note"><FolderKanban size={14} /> 项目默认预算 {selectedProject.tokenBudget.toLocaleString()} tokens</div>}
                      </>
                    ) : (
                      <div className="create-project-box">
                        <FolderKanban size={20} />
                        <strong>项目是可选的</strong>
                        <p>不创建项目也可以直接组合和生成提示词。创建项目后可以保存任务上下文与预算。</p>
                        <div className="inline-create"><input value={newProjectName} onChange={(event) => setNewProjectName(event.target.value)} placeholder="例如：Prompt Engineering" /><button className="button button-primary button-small" onClick={createProject} disabled={!newProjectName.trim() || busy}><Plus size={14} /> 创建</button></div>
                      </div>
                    )}
                  </div>

                  <div className="panel">
                    <div className="panel-title"><div className="step-number">02</div><div><h3>选择提示词模块</h3><p>依赖模块会自动展开，无需重复选择</p></div><span className="panel-count">{selectedAssetCount} SELECTED</span></div>
                    <div className="selectable-assets">
                      {assets.map((asset) => (
                        <label key={asset.id} className={selectedAssetIds.includes(asset.id) ? "selectable-asset checked" : "selectable-asset"}>
                          <input type="checkbox" checked={selectedAssetIds.includes(asset.id)} onChange={() => toggleAsset(asset.id)} />
                          <span className="custom-check">{selectedAssetIds.includes(asset.id) && <Check size={12} />}</span>
                          <span className="selectable-copy"><strong>{asset.name}</strong><small>{roleLabels[asset.role ?? "system"]} · {asset.category} · v{asset.version}</small></span>
                          <span className="priority-pill">P{asset.priority}</span>
                        </label>
                      ))}
                      {assets.length === 0 && <div className="subtle-empty">提示词库暂无模块。先到提示词库创建资产。</div>}
                    </div>
                  </div>

                  <div className="panel">
                    <div className="panel-title"><div className="step-number">03</div><div><h3>变量与输出目标</h3><p>在编译时注入任务级参数</p></div></div>
                    <div className="variable-fields" aria-label="模板变量">
                      {variableDefinitions.length > 0 ? variableDefinitions.map((definition) => (
                        <label className="field variable-field" key={definition.name}>
                          <span>{definition.name} {definition.required && <b>*</b>}</span>
                          <input
                            aria-label={"变量值：" + definition.name}
                            value={variableValues[definition.name] ?? ""}
                            onChange={(event) => setVariableValues((current) => ({ ...current, [definition.name]: event.target.value }))}
                            placeholder={definition.defaultValue !== undefined ? "默认值：" + definition.defaultValue : definition.required ? "填写必需变量" : "可留空"}
                          />
                          {definition.description && <small>{definition.description}</small>}
                        </label>
                      )) : (
                        <div className="variable-empty">选择包含模板变量的模块后，输入项会自动出现在这里。无需手写 JSON。</div>
                      )}
                    </div>
                    <div className="form-grid compact-grid">
                      <label className="field"><span>目标平台</span><select value={target} onChange={(event) => setTarget(event.target.value as AdapterId)}>{(Object.keys(adapterLabels) as AdapterId[]).map((id) => <option key={id} value={id}>{adapterLabels[id]}</option>)}</select></label>
                      <label className="field"><span>Token 预算</span><input type="number" min="1" value={tokenBudget} onChange={(event) => setTokenBudget(event.target.value)} /></label>
                    </div>
                    <button className="button button-primary compile-button" onClick={compile} disabled={busy || selectedAssetIds.length === 0}>
                      {busy ? <LoaderCircle className="spin" size={16} /> : <Play size={15} fill="currentColor" />} 编译提示词包 <ArrowRight size={15} />
                    </button>
                  </div>
                </div>

                <div className="compiler-output">
                  <div className="output-header">
                    <div><div className="eyebrow">BUILD OUTPUT</div><h3>编译预览</h3></div>
                    {compileResponse?.result.success && <span className="success-pill"><CheckCircle2 size={13} /> BUILD PASSED</span>}
                  </div>
                  {compileResponse ? (
                    <>
                      <div className="output-metrics">
                        <div><span>估算 Tokens</span><strong>{compileResponse.result.tokenEstimate.toLocaleString()}</strong></div>
                        <div><span>已加载模块</span><strong>{compileResponse.result.orderedAssetIds.length}</strong></div>
                        <div><span>目标平台</span><strong>{adapterLabels[target]}</strong></div>
                      </div>
                      {compileResponse.result.errors.length > 0 && (
                        <div className="diagnostics error-diagnostics">
                          <strong><AlertCircle size={14} /> 编译错误</strong>
                          {compileResponse.result.errors.map((item, index) => (
                            <div className="diagnostic-item" key={item.code + index}>
                              <p><b>{item.code}</b> · {item.message}</p>
                              {item.assetIds && item.assetIds.length > 0 && (
                                <div className="diagnostic-links">
                                  {item.assetIds.map((id) => {
                                    const asset = assets.find((candidate) => candidate.id === id);
                                    return asset
                                      ? <button type="button" key={id} onClick={() => openAsset(id)}>{asset.name}</button>
                                      : <span key={id}>缺失资产 {id.slice(0, 8)}</span>;
                                  })}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      {compileResponse.result.warnings.length > 0 && (
                        <div className="diagnostics warning-diagnostics">
                          <strong><AlertCircle size={14} /> 注意事项</strong>
                          {compileResponse.result.warnings.map((item, index) => (
                            <div className="diagnostic-item" key={item.code + index}>
                              <p><b>{item.code}</b> · {item.message}</p>
                              {item.assetIds && item.assetIds.length > 0 && (
                                <div className="diagnostic-links">
                                  {item.assetIds.map((id) => {
                                    const asset = assets.find((candidate) => candidate.id === id);
                                    return asset
                                      ? <button type="button" key={id} onClick={() => openAsset(id)}>{asset.name}</button>
                                      : <span key={id}>缺失资产 {id.slice(0, 8)}</span>;
                                  })}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="preview-tabs" role="tablist" aria-label="编译预览类型">
                        <button type="button" role="tab" aria-selected={previewMode === "artifact"} className={previewMode === "artifact" ? "preview-tab active" : "preview-tab"} onClick={() => setPreviewMode("artifact")}>目标文件</button>
                        <button type="button" role="tab" aria-selected={previewMode === "messages"} className={previewMode === "messages" ? "preview-tab active" : "preview-tab"} onClick={() => setPreviewMode("messages")}>结构化消息 <span>{compileResponse.result.messages.length}</span></button>
                      </div>
                      {previewMode === "messages" ? (
                        <div className="message-list" data-testid="structured-message-list">
                          {compileResponse.result.messages.length > 0 ? compileResponse.result.messages.map((message, index) => (
                            <article className={"message-card message-" + message.role} key={message.role + "-" + index} data-testid="compiled-message">
                              <div className="message-card-header">
                                <span className={"role-badge role-" + message.role}>{roleLabels[message.role]}</span>
                                <span>MESSAGE {String(index + 1).padStart(2, "0")}</span>
                              </div>
                              <pre>{message.content}</pre>
                              <div className="message-sources">
                                <span>来源模块</span>
                                {message.sourceAssetIds.map((id) => {
                                  const asset = assets.find((candidate) => candidate.id === id);
                                  return asset
                                    ? <button type="button" key={id} onClick={() => openAsset(id)}>{asset.name}</button>
                                    : <span key={id}>已删除资产 {id.slice(0, 8)}</span>;
                                })}
                              </div>
                            </article>
                          )) : <div className="message-empty">当前没有可展示的结构化消息。编译失败时请先查看上方诊断。</div>}
                        </div>
                      ) : (
                        <div className="code-preview">
                          <div className="code-toolbar"><span><span className="code-dot" /> {compileResponse.artifact?.fileName ?? "compile-preview.md"}</span><span>PREVIEW</span></div>
                          <pre>{(compileResponse.artifact?.content ?? compileResponse.result.text) || "编译失败，没有可导出的内容。"}</pre>
                        </div>
                      )}
                      <div className="output-actions">
                        <button className="button button-secondary" onClick={copyOutput} disabled={!compileResponse.result.text}><Copy size={15} /> 复制内容</button>
                        <button className="button button-primary" onClick={downloadOutput} disabled={!compileResponse.artifact}><ArrowDownToLine size={15} /> 导出文件</button>
                      </div>
                      {compileResponse.artifact && <div className="export-hint"><FileCode2 size={14} /><span>{compileResponse.artifact.instructions}</span></div>}
                    </>
                  ) : (
                    <div className="output-empty">
                      <div className="output-orbit"><div><Sparkles size={25} /></div></div>
                      <h3>等待第一次编译</h3>
                      <p>完成左侧配置后，运行编译器。PromptForge 会先解析依赖和冲突，再生成目标格式。</p>
                      <div className="pipeline">
                        <span><ListChecks size={14} /> Resolve</span><i /><span><BracesIcon /> Render</span><i /><span><Code2 size={14} /> Export</span>
                      </div>
                    </div>
                  )}
                </div>
              </section>
            </>
          )}

          {view === "history" && (
            <>
              <section className="page-heading">
                <div>
                  <div className="eyebrow">BUILD HISTORY <span>·</span> REPRODUCIBILITY</div>
                  <h1>编译历史</h1>
                  <p>每次编译都会保存输入快照、输出、诊断与估算 Token 数。</p>
                </div>
                <button className="button button-secondary" onClick={() => api.history(selectedProjectId || undefined).then((result) => setHistory(result.runs))}><History size={15} /> 刷新记录</button>
              </section>
              <section className="panel history-panel">
                <div className="history-toolbar"><div><h3>最近的编译记录</h3><p>最多显示最近 100 条记录</p></div><span className="panel-count">{history.length} BUILDS</span></div>
                {history.length > 0 ? (
                  <div className="history-table-wrap">
                    <table className="history-table">
                      <thead><tr><th>状态</th><th>目标平台</th><th>Token 估算</th><th>模块数</th><th>时间</th></tr></thead>
                      <tbody>
                        {history.map((run) => (
                          <tr key={run.id}>
                            <td>{run.status === "success" ? <span className="table-status passed"><CheckCircle2 size={14} /> PASSED</span> : <span className="table-status failed"><AlertCircle size={14} /> FAILED</span>}</td>
                            <td><strong>{adapterLabels[run.target]}</strong></td>
                            <td>{run.tokenEstimate.toLocaleString()}</td>
                            <td>{run.input.selectedAssetIds.length}</td>
                            <td>{formatDate(run.createdAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="history-empty"><Clock3 size={22} /><strong>还没有编译记录</strong><p>成功或失败的编译都会保存在这里，便于复现和排查。</p><button className="button button-secondary button-small" onClick={() => setView("composer")}>前往组合工作台 <ArrowRight size={14} /></button></div>
                )}
              </section>
            </>
          )}
        </div>

        <footer className="main-footer"><span>PromptForge <b>V0.1.0</b></span><span>Deterministic prompt assembly <i /> Local-first storage <i /> No telemetry</span></footer>
      </main>
    </div>
  );
}

function SaveIcon() {
  return <Check size={15} />;
}

function BracesIcon() {
  return <Code2 size={14} />;
}

function AlertCircleIcon() {
  return <AlertCircle size={14} />;
}

export default App;
