# PromptForge V0.1 Product Scope

## Primary user workflow

1. Create a reusable prompt module in the asset library.
2. Add tags, category, priority, template variables, dependencies, and conflicts.
3. Create a project and optional task context.
4. Select root modules for a compile.
5. Let the compiler expand dependencies and validate the dependency graph.
6. Supply variable values and a token budget.
7. Review errors/warnings and the compiled preview.
8. Copy the output or download a target-specific artifact.
9. Inspect the persisted compile history.

## Included

| Capability | V0.1 behavior | Acceptance evidence |
|---|---|---|
| Prompt assets | Create, read, update, delete, search, categorize, tag | API tests + UI flow |
| Asset version | Immutable snapshot per save; inspect history; restore an older snapshot as a new version | API tests + version-history UI |
| Project context | Create projects with a default token budget | API test |
| Task context | Store string variables and selected asset IDs | API test |
| Dependencies | Expand dependencies before dependents | Core unit test |
| Cycle detection | Reject dependency cycles | Core unit test |
| Conflict detection | Reject conflicts declared by either side | Core unit test |
| Variables | Substitute `{{name}}`, defaults, and required values | Core unit test |
| Deterministic assembly | Stable ordering and output | Core unit test |
| Token budget | Heuristic estimate and over-budget rejection | Core unit test |
| Adapters | Cursor, Claude Code, ChatGPT, generic API JSON, local text | Adapter unit tests |
| Compile history | Persist success/failure, input snapshot, output and diagnostics | API test |
| UI | Asset library, composer, preview, history | Browser smoke test pending |

## Explicitly excluded

- Cloud accounts, multi-user permissions, and real-time collaboration.
- Marketplace or public prompt sharing.
- Embedding generation, vector databases, semantic search, or autonomous prompt selection.
- Training/fine-tuning models.
- Direct IDE extensions or background agents.
- Automatic writes into a user's Cursor/Claude Code project.
- Sending prompts to model providers or storing provider API keys.
- Exact tokenization for every model family.

## V0.1 completion gate

V0.1 is not considered complete until:

- [ ] clean install succeeds on Node.js 22+
- [ ] type checks pass for core, API, and web
- [ ] core and API automated tests pass
- [ ] production builds succeed
- [ ] API persists data across process restarts
- [ ] browser smoke test covers asset CRUD, project/task creation, compile, export, and history
- [ ] no critical security or data-loss defect remains
- [ ] dashboard evidence links to the exact commit and CI run
