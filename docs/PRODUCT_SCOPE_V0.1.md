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
| UI | Asset library, composer, preview, history | Playwright smoke test 1/1 passed |

## Explicitly excluded

- Cloud accounts, multi-user permissions, and real-time collaboration.
- Marketplace or public prompt sharing.
- Embedding generation, vector databases, semantic search, or autonomous prompt selection.
- Training/fine-tuning models.
- Direct IDE extensions or background agents.
- Automatic writes into a user's Cursor/Claude Code project.
- Sending prompts to model providers or storing provider API keys.
- Exact tokenization for every model family.
- Frontend role editor and structured message history viewer (next increment).
- Whole-library JSON import/export and database backup/restore (next increment).

## V0.1 completion gate

- [x] Clean checkout installs and CI verification succeeds on Node.js 22+ using `npm install`.
- [x] Type checks pass for core, API, and web.
- [x] Core and API automated tests pass.
- [x] Production builds succeed.
- [ ] API data persistence is verified across a full process restart (database close/reopen is covered; process restart still needs a dedicated test).
- [x] Browser smoke test covers asset CRUD, project/task creation, compile, export, and history.
- [ ] Complete independent security/data-loss review and production-readiness checks.
- [x] Main dashboard evidence links to the exact commit and CI Run #101.

**Current main baseline:** `abba0f13362df5a7b2b46adf31739705869dcdfe`; [CI Run #101](https://github.com/tortletortle/PromptForge/actions/runs/45385688286).
