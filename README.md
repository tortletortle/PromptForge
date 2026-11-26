# PromptForge

> Local-first prompt asset management and deterministic prompt compilation.

PromptForge turns reusable prompts into versioned assets, composes them with explicit project/task context, validates dependencies and conflicts, and exports deterministic prompt packages for different AI workflows.

## Current product baseline

V0.1 includes:

- Prompt asset CRUD, categories, tags, search, priority, immutable version snapshots, and restore-as-new-version.
- Project and task context with reusable string variables.
- Explicit module dependencies, cycle detection, and conflict detection.
- Deterministic dependency expansion and prompt assembly.
- Template variables using `{{ variable_name }}`, defaults, and required-variable validation.
- Heuristic token estimation and configurable token-budget enforcement.
- Compile preview, clipboard copy, target artifact export, and persisted compile history.
- Initial adapters for Cursor Rules, Claude Code, ChatGPT, generic API JSON, and local AI text workflows.

## Prompt Kernel V0.2

The role-aware deterministic Prompt Kernel is integrated into `main` and passed the main-branch CI and migration tests:

- Structured `system`, `developer`, and `user` roles.
- Deterministic dependency and role-order validation.
- Strict variable schema validation and fail-closed default conflict handling.
- Injectable `TokenCounter` interface; default `heuristic-v2` is approximate.
- Compile manifests containing exact resolved asset snapshots.
- Structured messages and manifests persisted in compile history.
- Atomic SQLite v1/v2 → v4 migrations and rollback on corrupt legacy snapshots.
- Iterative dependency traversal and indexed conflict detection with stress coverage.

The frontend role editor and structured-message history viewer are still pending. See [Prompt Kernel design](docs/PROMPT_KERNEL_DESIGN.md) and [Kernel status](docs/PROMPT_KERNEL_STATUS_ZH.md).

## Architecture

- **Frontend:** React 19 + TypeScript + Vite.
- **API:** Node.js 22+ + TypeScript + Fastify.
- **Persistence:** SQLite via better-sqlite3, with schema versioning through SQLite `user_version`.
- **Core:** provider-independent deterministic prompt kernel and pure target adapters.
- **Workspace:** npm workspaces monorepo.

The API binds to loopback by default and rejects non-loopback `HOST` overrides until remote authentication exists. There is no authentication; do not expose the service to a public network. The compiler does not send prompts to external models.

## Requirements

- Node.js 22 or newer
- npm 10 or newer

## Run locally

From the repository root:

```bash
npm ci
npm run dev
```

Open the Vite URL printed by the web workspace (normally `http://127.0.0.1:5173`). The API listens on `http://127.0.0.1:4317`.

The default database is `data/promptforge.sqlite` relative to the API process working directory. Override it with `PROMPTFORGE_DB_PATH`.

## 最小使用流程

1. 打开“提示词库”，新建模块，只填写名称、角色和提示词正文。
2. 需要动态内容时，在正文中写 `{{ variable_name }}`；保存时会自动识别为必填变量。默认值、依赖、冲突等设置可在“高级设置”中配置。
3. 打开“组合工作台”，选择需要组合的模块。依赖模块会自动展开。
4. 在自动生成的变量输入框中填写内容，选择目标平台，然后生成提示词。
5. 检查预览，复制到 AI 对话，或导出目标平台文件。每次编译都会保存到“编译历史”。

项目和任务是可选项；不创建项目也能直接使用核心组合流程。PromptForge 只负责管理、组合和导出提示词，不会自动调用模型，也不会静默修改外部项目文件。

## Dependency lockfile

The root `package-lock.json` locks the root package and all npm workspaces (`apps/api`, `apps/web`, and `packages/core`). Use `npm ci` for clean, reproducible installs; CI also uses `npm ci` and fails if the lockfile is out of sync with workspace manifests. When changing dependencies, update the relevant workspace `package.json` and regenerate the lockfile with Node.js 22 / npm 10 or newer. Commit the manifest and lockfile changes together; do not edit `package-lock.json` by hand.

## Verify

```bash
npm run typecheck
npm test
npm run build
npm run e2e
```

`npm run check` runs type checks, tests, and production builds.

## Token estimate limitation

The built-in `heuristic-v2` estimator is a rough planning aid, not a model tokenizer. Actual token counts vary by model, tokenizer, language, and provider. Provider-specific tokenizers can be supplied through the `TokenCounter` interface when an integration is added. Treat the heuristic as a budget warning, not a billing or context-window guarantee.

## Adapter boundary

Adapters generate downloadable artifacts only. Cursor and Claude Code outputs are suggested files; PromptForge does not overwrite project files or install IDE integrations. The generic API adapter preserves role-separated messages but does not select a model, add credentials, or send a request.

## Project status

See the [project dashboard](docs/PROJECT_STATUS_DASHBOARD_ZH.md), [overall development plan](docs/DEVELOPMENT_PLAN_ZH.md), [product scope](docs/PRODUCT_SCOPE_V0.1.md), and [architecture](docs/ARCHITECTURE.md).
