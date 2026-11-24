# PromptForge Architecture

## Design principles

1. **Local-first:** prompt assets and compile records live in SQLite on the user's machine.
2. **Deterministic kernel:** identical versioned asset snapshots and compile options produce identical messages, text, diagnostics ordering, and manifest ordering.
3. **Explicit composition:** dependencies are declared by asset ID; no hidden semantic retrieval is performed.
4. **Role-aware output:** system, developer, and user content remains structurally separated until a target adapter chooses its output representation.
5. **Safe exports:** adapters create downloadable artifacts. They do not silently edit external project files.
6. **Replaceable boundaries:** UI, API, persistence, kernel, and adapters remain separate.

## Runtime topology

```text
React + Vite (127.0.0.1:5173)
        |
        | HTTP /api
        v
Fastify API (127.0.0.1:4317)
        |
        +---- PromptForge Core
        |       +-- input and asset validation
        |       +-- dependency graph resolver
        |       +-- role-order validator
        |       +-- symmetric conflict validator
        |       +-- variable schema merger
        |       +-- safe template renderer
        |       +-- role-aware message assembler
        |       +-- injectable TokenCounter
        |       +-- compile manifest
        |       +-- target adapters
        |
        +---- SQLite (better-sqlite3)
                +-- prompt_assets
                +-- prompt_asset_versions
                +-- projects
                +-- project_tasks
                +-- compile_runs
```

## Prompt Kernel V0.2

The kernel is a pure TypeScript domain module. It has no database, HTTP, filesystem, IDE, provider SDK, embedding, or LLM dependency.

### Roles and ordering

Prompt assets support `system`, `developer`, and `user`. Existing V0.1 assets migrate to `system`.

Canonical role order is system → developer → user. Within each role, dependency order is preserved. Dependencies must precede dependents. If a dependency's role ranks after its dependent, compilation fails with `ROLE_DEPENDENCY_ORDER_CONFLICT`; the kernel never silently violates either constraint.

### Deterministic compile pipeline

1. Validate the request, asset IDs, roles, content, metadata, variable schemas, and token budget.
2. Expand explicitly selected roots and transitive dependencies with cycle-aware depth-first traversal.
3. Sort roots and sibling dependencies by priority descending, then ID ascending; dependencies always precede dependents.
4. Reject missing dependencies, cycles, role-order contradictions, and symmetric asset conflicts.
5. Merge variable definitions. Conflicting defaults are errors; required=true takes precedence.
6. Render `{{ variable_name }}` placeholders as plain text. Values are never evaluated or recursively expanded.
7. Reject undeclared placeholders, malformed template delimiters, and missing/empty required values. Warn on unused values and declarations.
8. Build one message per non-empty role and a legacy flattened text view.
9. Count messages with an injected `TokenCounter`; the default `heuristic-v2` remains explicitly approximate.
10. Enforce the budget and return structured diagnostics plus a compile manifest.

### Compile manifest and reproducibility

The manifest records schema version, selected roots, deterministic resolved order, complete snapshots of every resolved asset (including content, role, version, dependencies and variable definitions), variable names, token estimate, and estimator identity.

Compile history stores both the structured messages and manifest. This preserves the exact compile inputs even if an asset is later edited or deleted.

## Data model

- `prompt_assets`: current prompt module, role, metadata, dependency/conflict references, variable definitions, and current version.
- `prompt_asset_versions`: immutable JSON snapshots for each saved version.
- `projects`: named workspaces and default token budgets.
- `project_tasks`: task descriptions, string context variables, and selected asset IDs.
- `compile_runs`: input, flattened output, role-separated messages, complete compile manifest, estimate, status, diagnostics, and timestamp.

SQLite schema versions are migrated using `PRAGMA user_version`. JSON arrays/objects are stored as text. All SQL values are parameterized.

## Adapter contract

Each adapter is a pure renderer:

`AdapterId + successful CompileResult + project/task metadata -> AdapterArtifact`

Role-aware targets consume `CompileResult.messages`; text-only targets consume `CompileResult.text`. An artifact contains a suggested file path, MIME type, content, and placement instructions. It never writes to external project files.

## Security boundary

- API binds to loopback by default.
- CORS is restricted to the local Vite development origin.
- No account system, remote sync, telemetry, model provider key storage, or remote API calls are included.
- Prompt content is never executed as code.
- If the host is changed from loopback, authentication and origin-security controls must be added first.
