# PromptForge Prompt Kernel V0.2 Design

## 1. Responsibility

The kernel is a deterministic, provider-independent compiler. It accepts versioned prompt assets and an explicit selection/context, then returns:

- validated dependency closure and stable asset order;
- role-separated chat messages;
- rendered variable values and structured diagnostics;
- a token estimate with an explicit estimator identifier;
- a compile manifest containing the exact resolved asset snapshots.

The kernel does not access SQLite, HTTP, the filesystem, IDEs, model providers, embeddings, or external services. It never executes prompt text as code and never asks an LLM to decide composition.

## 2. Domain contract

### Prompt roles

V0.2 supports `system`, `developer`, and `user`. Existing assets migrate to `system`.

Canonical role order is system → developer → user. Within each role, preserve deterministic topological order. A dependency must appear before its dependent. A dependency whose role ranks after its dependent is rejected with `ROLE_DEPENDENCY_ORDER_CONFLICT`, because both ordering constraints cannot be satisfied.

### Selection and dependency semantics

- Root assets are selected explicitly by stable asset ID.
- Dependencies are expanded transitively; no semantic or tag-based auto-selection occurs.
- Every selected root and dependency must exist.
- Cycles, duplicate asset IDs, invalid metadata, and conflicting assets fail closed.
- Dependency order is authoritative. Priority descending, then ID ascending, is only a deterministic tie-breaker; priority never silently overrides a conflict or dependency.

### Variables

- Template syntax is `{{ variable_name }}`; values are plain text and are never recursively evaluated.
- Every referenced variable must be declared by at least one resolved asset.
- Required variables must receive a non-empty value or a declared default.
- Compatible duplicate declarations merge with required=true taking precedence.
- Different defaults for the same variable are a hard error rather than a silent first-wins warning.
- Unused supplied values and unused declarations are surfaced as warnings.

### Output

The kernel returns one message per non-empty role, ordered system → developer → user. Each message retains the source asset IDs. A legacy flattened `text` view remains available for Markdown-style adapters and previews.

The manifest records selected roots, resolved asset IDs, exact resolved asset snapshots (including version, role, variables, dependencies and content), variable names, token estimate and estimator ID. This is the evidence needed to reproduce and audit a compile after assets are edited or deleted.

## 3. Deterministic pipeline

1. Validate the compile request and all asset records.
2. Index assets; reject duplicate IDs.
3. Expand selected roots with cycle-aware depth-first traversal.
4. Check dependency/role ordering constraints.
5. Detect symmetric conflicts across the resolved closure.
6. Merge variable definitions and validate ambiguity.
7. Render templates without code execution or recursive interpolation.
8. Group rendered assets into role-separated messages.
9. Count tokens through an injected `TokenCounter`; default to explicitly named `heuristic-v2`.
10. Enforce the token budget and return diagnostics plus manifest.

No adapter may run if compilation fails.

## 4. Extension points

- `TokenCounter`: a pure interface for provider/model-specific tokenizer implementations. The default heuristic is advisory and must never be represented as exact.
- Adapters consume `CompileResult.messages` when the target supports structured roles; text-only targets consume `CompileResult.text`.
- Future selection policies, project scopes, retrieval, and provider integrations must remain outside the deterministic kernel and pass their final explicit asset selection into it.

## 5. Acceptance invariants

- Identical asset snapshots and compile options produce byte-identical messages, text, diagnostics ordering, and manifest ordering.
- Input array order and selected-root order do not change output.
- Every included asset is reachable from an explicit selected root.
- Every dependency precedes its dependent.
- Role order and dependency order cannot silently contradict each other.
- Every rendered placeholder is declared and resolved.
- Conflicting variable defaults never silently choose one.
- Token estimator identity is always returned.
- Compile manifest is sufficient to reconstruct the exact resolved prompt inputs.
- No database, network, filesystem, provider SDK, or LLM dependency exists in `packages/core`.

## 6. Out of scope for this kernel increment

- Frontend role editor.
- Live Cursor/Claude Code integration or automatic file writes.
- Provider API calls and API-key storage.
- Embedding search, semantic prompt selection, or autonomous agents.
- Exact tokenization for every provider.
- Multi-user permissions and cloud synchronization.
