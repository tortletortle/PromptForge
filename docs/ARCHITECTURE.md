# PromptForge V0.1 Architecture

## Design principles

1. **Local-first:** prompt assets and compile records live in SQLite on the user's machine.
2. **Deterministic core:** identical asset snapshots, selected IDs, variables, and budget produce identical compiled text and diagnostics.
3. **Explicit composition:** dependencies are declared by asset ID; no hidden semantic retrieval is performed.
4. **Safe exports:** adapters create downloadable artifacts. They do not silently edit external project files.
5. **Replaceable boundaries:** UI, API, persistence, compiler, and adapters are separated so later IDE and agent integrations do not contaminate domain logic.

## Runtime topology

```text
React + Vite (127.0.0.1:5173)
        |
        | HTTP /api
        v
Fastify API (127.0.0.1:4317)
        |
        +---- PromptForge Core
        |       +-- dependency resolver
        |       +-- conflict validator
        |       +-- template renderer
        |       +-- deterministic compiler
        |       +-- token heuristic
        |       +-- target adapters
        |
        +---- SQLite (better-sqlite3)
                +-- prompt_assets
                +-- prompt_asset_versions
                +-- projects
                +-- project_tasks
                +-- compile_runs
```

## Core compile pipeline

1. Validate selected asset IDs.
2. Expand dependencies with depth-first traversal.
3. Detect missing dependencies and dependency cycles.
4. Order roots and dependencies deterministically (priority descending, then ID ascending; dependencies before dependents).
5. Detect symmetric conflicts declared by either asset.
6. Merge variable definitions and apply user values/defaults.
7. Render each module in resolved order.
8. Estimate tokens using `heuristic-v1`.
9. Enforce the configured token budget.
10. Render a target-specific artifact only when compilation succeeds.
11. Persist the input snapshot, output, status, and diagnostics in compile history.

## Data model

- `prompt_assets`: current prompt module, metadata, dependency/conflict references, variable definitions, and current version.
- `prompt_asset_versions`: immutable JSON snapshots for each saved version; restoring an older snapshot creates a new current version.
- `projects`: named workspaces and default token budgets.
- `project_tasks`: task descriptions, string context variables, and selected asset IDs.
- `compile_runs`: target, compile input snapshot, output, estimate, status, diagnostics, and timestamp.

JSON arrays/objects are stored as text in SQLite. All SQL values are parameterized.

## Adapter contract

Each adapter is a pure renderer:

`AdapterId + successful CompileResult + project/task metadata -> AdapterArtifact`

An artifact contains a suggested file path, MIME type, content, and human-readable placement instructions. It never performs filesystem writes outside the downloaded artifact.

## Security boundary

- API binds to loopback by default.
- CORS is restricted to the local Vite development origin.
- No account system, remote sync, telemetry, model provider key storage, or remote API calls are included.
- If the host is changed from loopback, an authentication and origin-security layer must be added first.
