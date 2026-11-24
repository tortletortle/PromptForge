# PromptForge

> Local-first prompt asset management and deterministic prompt compilation.

PromptForge is a TypeScript-first workspace for composing reusable prompt assets into reproducible, target-aware prompt packages.

## V0.1 goals

- Manage prompt assets, categories, tags, and reusable modules.
- Organize work by project and task context.
- Resolve explicit module dependencies and detect dependency cycles/conflicts.
- Compile a deterministic prompt package with variables and token-budget checks.
- Preview and copy compiled output; retain compile history.
- Export target-specific artifacts through adapters for Cursor, Claude Code, ChatGPT, generic API, and local AI workflows.

## Architecture

- **Web UI:** React + TypeScript + Vite.
- **API:** Node.js + TypeScript + Fastify.
- **Persistence:** SQLite with Drizzle ORM and SQL migrations.
- **Core:** framework-independent domain, dependency resolver, conflict validator, and deterministic compiler.
- **Adapters:** pure renderers/exporters; no silent modification of external project files in V0.1.

## Development status

The repository is being bootstrapped from an empty repository. Features are marked complete only after implementation and automated verification.

## Planned V0.1 workflow

1. Create prompt assets and reusable modules.
2. Create a project and task profile.
3. Select modules and resolve dependencies.
4. Fill template variables.
5. Validate conflicts and token budget.
6. Compile, preview, copy, and retain a versioned compile record.
7. Export using a selected target adapter.

## Local development

The monorepo setup and exact commands will be documented after the initial scaffold lands.
