# PromptForge

> Local-first prompt asset management and deterministic prompt compilation.

PromptForge turns reusable prompts into versioned assets, composes them with project/task context, validates dependencies and conflicts, and exports deterministic prompt packages for different AI workflows.

## V0.1 scope

- Prompt asset CRUD, categories, tags, search, priority, immutable version snapshots, and restore-as-new-version.
- Project and task context with reusable string variables.
- Explicit module dependencies, cycle detection, and conflict detection.
- Deterministic dependency expansion and prompt assembly.
- Template variables using `{{ variable_name }}`, defaults, and required-variable validation.
- Heuristic token estimation and configurable token-budget enforcement.
- Compile preview, clipboard copy, target artifact export, and persisted compile history.
- Initial adapters for Cursor Rules, Claude Code, ChatGPT, generic API JSON, and local AI text workflows.

V0.1 does **not** include cloud sync, team collaboration, marketplace, vector search, model training, provider-specific live API calls, or unattended edits to external project files.

## Architecture

- **Frontend:** React 19 + TypeScript + Vite.
- **API:** Node.js 22+ + TypeScript + Fastify.
- **Persistence:** SQLite via better-sqlite3, with schema versioning through SQLite `user_version`.
- **Core:** framework-independent dependency resolver, template renderer, deterministic compiler, token estimator, and target adapters.
- **Workspace:** npm workspaces monorepo.

The API binds to `127.0.0.1` by default. There is no authentication in V0.1; do not expose the service to a public network. Prompt content remains in the local SQLite database and is not sent to an external model by the compiler.

## Requirements

- Node.js 22 or newer
- npm 10 or newer

## Run locally

From the repository root:

```bash
npm install
npm run dev
```

Open the Vite URL printed by the web workspace (normally `http://127.0.0.1:5173`). The API listens on `http://127.0.0.1:4317`.

The default database is `data/promptforge.sqlite` relative to the API process working directory. Override it with `PROMPTFORGE_DB_PATH`.

## Verify

```bash
npm run typecheck
npm test
npm run build
npm run e2e
```

`npm run check` runs type checks, tests, and production builds. `npm run e2e` launches the local API and web app and verifies the browser workflow from asset creation through export and history.

## Token estimate limitation

The built-in `heuristic-v1` estimator is a rough planning aid, not a model tokenizer. Actual token counts vary by model, tokenizer, language, and provider. Treat the estimate as a budget warning, not a billing or context-window guarantee.

## Adapter boundary

Adapters generate downloadable artifacts only. Cursor and Claude Code outputs are suggested files; PromptForge does not overwrite project files or install IDE integrations in V0.1. The generic API adapter emits a message payload but does not select a model, add credentials, or send a request.

## Project status

See the [project dashboard](docs/PROJECT_STATUS_DASHBOARD_ZH.md), [overall development plan](docs/DEVELOPMENT_PLAN_ZH.md), [product scope](docs/PRODUCT_SCOPE_V0.1.md), and [architecture](docs/ARCHITECTURE.md).
