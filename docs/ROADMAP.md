# Roadmap

The roadmap distinguishes what *exists today* (✅), what is *next* (🟡 in progress
or next release), and what is *aspirational* (⬜).

Versioning is semver. Items inside a version are not strictly ordered; the version
itself is the contract.

---

## v0.1.0 — Initial public release ✅

The diamond: a local-first, audited, MCP-native cognitive memory.

### Latest Improvements (2026-04-30)
- ✅ **Granular Dream Choice**: Users can now choose exactly which item to keep (A or B) during deduplication in the desktop app, with side-by-side content comparison.
- ✅ **Robust Search (Lexical Boost)**: Added a lexical scoring boost in `atlas.mjs` to ensure exact keyword matches (e.g., "pizza") are never filtered out by semantic thresholds.
- ✅ **Native Tauri Export**: Fixed export/import functionality by integrating native file dialogs and direct filesystem access, bypassing browser-based limitations.
- ✅ **Documentation Cleanup**: Unified all documentation in English and aligned terminology with the functional architecture.
- ✅ **Desktop app overhaul**: Premium dark theme (Inter font, glassmorphism), global toast notifications, Settings panel (MCP setup, env vars, system info), node creation dialog, sidebar real-time filter synced with graph, MiniMap, keyword badges.

### Core engine — `@paradigm-memory/memory-core`
- ✅ Cognitive map model (`tree.json` + nodes with `id, label, summary, keywords, importance, freshness, confidence, retrieval_policy`).
- ✅ SQLite storage via Node 22 `node:sqlite` (zero `node-gyp`, zero compile).
- ✅ FTS5 full-text index with BM25 ranking and boolean / phrase / `+` `-` operators.
- ✅ Hybrid retrieval: lexical (FTS5 + prefix-stem) + semantic (cosine on cached vectors).
- ✅ Activation gating with three states: open (≥0.75), latent (≥0.45), ignored (<0.25).
- ✅ Raw activation ranking (uncapped) so leaf nodes can win over parents.
- ✅ Embedding providers: `ollama`, `wasm` (`@huggingface/transformers`, optional dep),
  `keyword` (deterministic test fallback), `off`.
- ✅ Embedding registry (`embedding-registry.mjs`) — recommended models per
  language with size / quality / notes (`off`, `wasm-minilm`, `ollama-nomic`,
  `keyword-test`).
- ✅ Persistent SQLite cache for embeddings + in-process LRU (cap configurable
  via `PARADIGM_MEMORY_EMBED_LRU`).
- ✅ Auto-warm on boot — first user query pays only its own embedding.
- ✅ Audit log: every mutation (`write`, `propose`, `accept`, `reject`, `delete`,
  `update`, `create_node`, `import`) writes to `memory_mutations`.
- ✅ Soft-delete: items keep `deleted_at`; excluded from search; never hard-removed
  in v0.1 — full forensic capability.
- ✅ Status state machine: `active` | `proposed` | `deleted`.
- ✅ Heuristic memory writer: classifies user text → preference / decision /
  architecture / observation; proposes deterministic items.
- ✅ Consolidator (`dream`): detects duplicates (Jaccard on tokens), stale items
  (age × importance), overloaded nodes, orphan items. Suggestions only.
- ✅ Optional **reasoner** (`createReasoner`) using `@huggingface/transformers`
  (Qwen2.5-1.5B-Instruct, ONNX/WASM, fully local). When passed to `dream()`,
  it produces suggested summaries for overloaded nodes.
- ✅ Schema validation: `validateMemoryNode`, `validateMemoryItem`,
  `validateMemoryMutation`, `validateMemoryTrace`.
- ✅ Tracing: every operation produces a JSON trace under `data/traces/`.
- ✅ Snapshot export / import (`paradigm.brain` JSON format).
- ✅ Profile-default storage: defaults to `~/.paradigm` so memory survives
  reinstalls. Override with `PARADIGM_MEMORY_DIR`.
- ✅ Auto-snapshot before destructive operations (`memory_delete`,
  `memory_import` with `mode: "replace"`) under `<memory-dir>/snapshots/`.

### MCP server — `@paradigm-memory/memory-mcp`
- ✅ stdio JSON-RPC server speaking MCP protocol `2025-03-26`.
- ✅ HTTP/SSE bridge (`http-server.mjs`) with `/health`, `/api/version`,
  `/api/tools`, `/mcp` (JSON-RPC), `/sse`. Loopback by default; non-loopback
  binds require `PARADIGM_HTTP_TOKEN` Bearer auth.
- ✅ 24 tools, all snake_case, all audited where they mutate state.
- ✅ Workspace pool: every tool accepts `workspace?: string`. One process serves
  N projects under `<dataDir>/workspaces/<workspace>/memory/`.
- ✅ Zod-validated inputs; structured error responses (`invalid_input`,
  `unknown_node`, `unknown_item`, `node_exists`, `missing_parent`,
  `invalid_review_status`, `invalid_snapshot`, `invalid_mode`).
- ✅ `--version`, `--help` CLI flags.
- ✅ Standalone bin: `paradigm-memory-mcp`.

| Tool | Mutation |
|---|---|
| `memory_version` | --- |
| `memory_update_check` | --- |
| `memory_self_update` | guarded package update |
| `memory_search` | — |
| `memory_doctor` | — |
| `memory_doctor_fix` | safe repair |
| `memory_stats` | — |
| `memory_tree` | — |
| `memory_read` | — |
| `memory_propose_write` | `propose` |
| `memory_write` | `write` |
| `memory_review` | `accept` / `reject` |
| `memory_list_proposed` | — |
| `memory_delete` | `delete` (auto-snapshot) |
| `memory_create_node` | `create_node` |
| `memory_export` | — |
| `memory_import` | `import` (auto-snapshot in `replace` mode) |
| `memory_snapshot_diff` | — |
| `memory_snapshot_restore` | `import` (auto-snapshot) |
| `memory_feedback` | `update` |
| `memory_import_markdown` | `write` / `propose` |
| `memory_dream` | — |
| `memory_warm` | — |

### CLI — `@paradigm-memory/memory-cli`
- ✅ Cross-platform `paradigm` binary (Node 22+).
- ✅ `paradigm studio` — launches the Paradigm Memory desktop app from a source checkout.
- ✅ `paradigm update` — `npm install` (repo) or `npm update -g` (installed).
- ✅ `paradigm uninstall` — unregisters `claude` / `codex` / `gemini` MCP entries;
  keeps memory unless `--purge-memory` is confirmed by typing `DELETE`.
- ✅ `paradigm export [file]` / `paradigm import [file] [--mode merge|replace]`.
- ✅ `paradigm ingest <path> [--node id] [--proposed]` — bulk-imports
  `.md` / `.markdown` / `.txt` / `.yaml` / `.yml` files or directories.
- ✅ `paradigm serve [--host --port]` — start the HTTP/SSE bridge.
- ✅ `paradigm dream` — run consolidation analysis.
- ✅ `paradigm version` — full version + active memory dir.

### Tooling, infra, distribution
- ✅ Apache-2.0 license, Fabien POLLY 2026.
- ✅ GitHub Actions CI on Linux / macOS / Windows + eval baseline upload
  (`.github/workflows/ci.yml`).
- ✅ GitHub Actions npm publish on tag `v*.*.*`
  (`.github/workflows/publish.yml`) for `memory-core`, `memory-mcp`,
  `memory-cli`, with `--provenance --access public`.
- ✅ Node-only lint (`scripts/lint.mjs`) — parses every `.mjs` with `node --check`.
- ✅ Test harness (`node --test`) — service / smoke / HTTP / unit tests.
- ✅ Coverage harness (`npm run test:coverage`,
  `node --experimental-test-coverage --test`); CI runs it on Ubuntu.
- ✅ Eval harness (`scripts/eval.mjs`) — 3 case sets (cases / paraphrase / semantic-hard),
  2 variants (lexical / embeddings), reports under `evals/results/`.
- ✅ Cross-platform installers:
  - **One-liner remote install** (`scripts/installer/install.sh`,
    `scripts/installer/install.ps1`) served via raw.githubusercontent.com.
    rustup-style UX: `curl … | bash` / `irm … | iex`. Verifies Node 22+,
    `npm install -g @paradigm-memory/memory-cli` (from npm when published, GitHub
    source fallback otherwise), bootstraps `~/.paradigm`, best-effort
    registers the MCP with `claude` / `codex` / `gemini` CLIs on PATH.
  - **Contributor installer** (`scripts/install.sh`, `scripts/install.ps1`)
    for source checkouts that wires the local repo as the MCP source.
- ✅ `scripts/init-empty-memory.mjs` — bootstrap an empty workspace.
- ✅ `scripts/warm-embeddings.mjs` — pre-compute embedding cache from CLI.
- ✅ `scripts/embedding-registry.mjs` — print recommended models from the CLI.
- ✅ Packaging scaffolds: Homebrew (`packaging/homebrew/paradigm-memory.rb`),
  Scoop (`packaging/scoop/paradigm-memory.json`) — waiting for npm tarball SHA.
- ✅ `CHANGELOG.md`, `CONTRIBUTING.md`, `README.md` (English, dev-focused),
  `docs/INSTALL_PROMPT.md` (paste-into-agent install prompt),
  `docs/MCP_CLIENTS.md` (Claude / Codex / Gemini configs).

---

## v0.1.x — Polish & follow-ups (1-2 weeks) 🟡

Non-breaking additions and quality improvements before v0.2.

### Killer feature candidates
- ✅ **Explainable retrieval ("why this memory?")** — `memory_search` now returns
  a compact `debug.why` block with activation reasons, evidence scores, FTS
  contribution, node activation and semantic errors.  the desktop app should surface this
  as a readable trace panel instead of making retrieval feel magical.
- ✅ **Serious memory doctor** — `memory_doctor` / `paradigm doctor` now reports
  SQLite WAL/busy-timeout status, orphan items, broken child links, embedding
  cache coverage, a health score and actionable repair hints.
- ✅ **Safe doctor auto-fix** — `memory_doctor_fix`, `paradigm doctor --fix`,
  and the desktop app Health tab can rebuild FTS, refresh JSON mirrors from SQLite, and
  optionally warm embeddings without deleting content.
- ✅ **Signed-ish portable exports** — `memory_export` now returns a deterministic
  SHA-256 over the emitted `.brain` payload. Next step: store and verify this
  hash in desktop app import/diff flows.
- ✅ **Snapshot diff plumbing** — `memory_snapshot_diff` and `paradigm diff`
  compare two `.brain` files by node and item id. `paradigm rollback` wraps
  replace-import with an explicit confirmation prompt.
- ✅ **Workspace stats** — `memory_stats` and `paradigm stats` expose storage,
  counts, top nodes and freshness numbers for desktop app / CLI inspectors.
- ✅ **SQLite reliability baseline** — every store connection sets WAL and a
  `busy_timeout`, and the doctor exposes both so Windows lock problems are
  visible before they become mysterious failures.
- ✅ **SQLite as source of truth** — `tree.json`/`items.json` seed the first boot,
  then SQLite is re-hydrated back into runtime state and mirrored out to JSON
  for debug/compatibility.
- ✅ **Usage-weighted memory quality** — `memory_feedback` and desktop app search
  buttons record useful/ignored evidence and apply bounded importance/confidence
  tuning with an audited update.
- ✅ **Snapshot partial rollback** — `memory_snapshot_restore`,
  `paradigm restore`, and the desktop app Health tab restore selected item/node ids from a
  `.brain` snapshot after first writing a safety snapshot.
- ⬜ **Project/git branch-aware workspaces** — intentionally deferred for now.
  Later, derive workspace identity from repo/remotes/branch and maintain durable
  per-project summaries without making the default user memory noisy.

### Code quality
- ✅ Smoke tests cover the expanded MCP surface (version/update diagnostics,
  Markdown import, HTTP bridge in `tests/memory-http.test.mjs`).
- ✅ Service tests cover `memory_export`, `memory_import`, workspace isolation,
  snapshots, Markdown import, `memory_dream`.
- ✅ SQLite concurrency regression opens multiple service connections against
  one data dir and expects no writer lock failures.
- ✅ `npm run test:coverage` wired into CI.
- ⬜ Migrate JSDoc on all public APIs.

### Cross-platform
- 🟡 Document and fix the Windows env-var trap (`KEY=VALUE node ...` doesn't
  propagate via Git Bash on Windows; PowerShell `$env:` is the reliable path).
- ✅ npm-publish workflow as GitHub Action (release on tag `v*.*.*`).
- ✅ Homebrew/Scoop manifest updater — `npm run release:manifests` fetches the
  published npm tarball and writes the SHA-256 into `packaging/homebrew` and
  `packaging/scoop`. Before publish, `npm run release:check` validates versions
  and warns about placeholder hashes.
- ✅  the desktop app release workflow — `.github/workflows/studio-release.yml` (builds the desktop app) builds
  Tauri bundles on Windows, macOS and Linux for tags or manual dispatch.
- 🟡 Fully bundled MCP sidecar —  the desktop app now prefers a packaged
  `paradigm-memory-mcp(.exe)` beside the app/resources and falls back to source
  checkout or global npm. Remaining work: ship a real native sidecar artifact
  per OS so releases need no Node runtime.

### Self-healing / self-update
- ✅ `memory_self_update` — disabled by default; enabling requires
  `PARADIGM_ALLOW_SELF_UPDATE=1`, uses fixed package names only, accepts no
  arbitrary command.
- ✅ `memory_update_check` — read-only npm registry version check,
  timeout-bounded, opt-out via `PARADIGM_DISABLE_UPDATE_CHECK=1`.
- ⬜ Startup stderr update notice for CLI users.

### Embeddings
- ⬜ Default WASM model preload at install time (`scripts/install.{sh,ps1}`
  pre-downloads the `Xenova/all-MiniLM-L6-v2` weights so first call is instant).
- ✅ Embedding model registry (`embedding-registry.mjs`).
- ⬜ Vector storage as `BLOB` (Float32Array) instead of JSON text — 3-5×
  faster lookup, half the disk.
- ✅ **Post-ingest warm path** — `paradigm ingest --warm`, `paradigm warm`,
  and `service.warm()` MCP-side method. Bulk-imported items no longer have
  to wait for the first query to be embedded. See `docs/OPERATIONS.md` § 1.
- ✅ **Memory health command** — `paradigm doctor` reports cached-embedding
  count vs. total nodes+items, lists orphans, suggests warm. Read-only.
- ⬜ Auto re-embed on `cached_text != current_text` (idempotent diff pass).

### Concurrency & reliability
- ✅ **SQLite lock audit** — confirm WAL + `busy_timeout` is set on every
  connection (CLI, MCP stdio, HTTP bridge, scripts). Add a regression test
  that opens N concurrent writers and expects no `SQLITE_BUSY`. Vigilance
  point flagged on Windows where multiple `paradigm` invocations + desktop app
  sidecar + custom maintenance scripts can race. See `docs/OPERATIONS.md` § 3.3.
- ✅ Desktop app sidecar lifecycle — Tauri now keeps the MCP child handle, exposes
  `mcp_status`, and kills the sidecar on app shutdown instead of leaking the
  process.
- ⬜ Optional advisory lockfile (`<memory-dir>/.lock`) when running
  destructive maintenance scripts so the MCP refuses to start meanwhile.

### Eval & observability
- ⬜ Eval cases for `memory_create_node` (does the system surface a freshly
  created branch on next search?).
- ⬜ Eval cases for `memory_dream` (does it detect injected duplicates?).
- ⬜ **Dream similarity-threshold sweep** — empirically the 0.35–0.55 Jaccard
  band is the sweet spot; pin it with an eval that asserts precision/recall
  at fixed thresholds so accidental drift is caught.
- ⬜ **Stress-test fixture** — generate 1k / 5k / 10k synthetic items and
  measure search latency, embedding warm-up time, dream pass duration.
- ⬜ Optional Prometheus / OTLP metrics export.

---

## v0.2 — Paradigm Memory (Tauri + React + react-flow) 🟡

A standalone desktop app for users to physically *see* and *touch* their memory.
The shell is Rust (Tauri); the UI is web (React + react-flow); the backend is
the existing `paradigm-memory-mcp` running as a sidecar.

The MVP scaffold landed and is buildable (`npm run app:build`,
`cargo check`). All MVP features in the list below are implemented. Remaining
v0.2 work is bundle hardening, packaging, signed releases, and the bonus list.

### Architecture
```
Paradigm Memory (Tauri shell, Rust)
  └── React + react-flow + vanilla CSS  (the only place pixels are drawn)
        └── stdio JSON-RPC ↔ paradigm-memory-mcp (Node sidecar)
                                       └── @paradigm-memory/memory-core
```

### MVP features
- ✅ **Tauri + React scaffold** — Rust shell, Vite, React, react-flow, sidecar
  bridge to `paradigm-memory-mcp`.
- ✅ **Direct tree catalog** —  the desktop app uses `memory_tree`, so a fresh profile no
  longer appears empty just because search has not activated anything yet.
- ✅ **Tree view (left)** — hierarchical, expand/collapse, badge per node showing
  active item count, status colour, freshness decay.
- ✅ **Graph view (centre)** — deterministic react-flow node map. Node size = importance,
  colour = status (active / proposed / latent), edges = parent-child + explicit links.
- ✅ **Activation animation** — when the user types a query in the search bar,
  watch the activation propagate node-by-node with a pulse.
- ✅ **Item editor (right)** — select an item; edit content / tags / importance /
  confidence inline; show its mutation history.
- ✅ **Pending review queue** — single screen for proposed items: accept / reject
  / edit-then-accept in one click.
- ✅ **Audit log timeline** — chronological view of `memory_mutations`, filterable
  by actor / operation / node / date range; "go to item" deep-link.
- ✅ **Search panel** — invokes `memory_search`, lists nodes + evidence with
  scores; clicking an item highlights it on the graph.
- ✅ **Workspace switcher** — top bar input to swap between workspaces under
  the current dataDir.
- ✅ **Data-dir diagnostics** —  the desktop app displays the active memory path and
  auto-detects repo-local `data/` in dev mode before falling back to `~/.paradigm`.
- ✅ **Update banner** —  the desktop app calls `memory_update_check` and shows a
  non-intrusive badge when a newer package exists.
- ⬜ **Update now button** — gated by signed release verification / explicit
  confirmation; never touches user memory data.
- ✅ **Export / Import buttons** — wire to `memory_export` / `memory_import`,
  default extension `.brain`, file picker.
- ✅ **Dream button** — runs `memory_dream` and displays the number of
  consolidation suggestions.

### Bonus / stretch
- ⬜ **Embedding map (UMAP 2D)** — project items into a 2D plane to visualise
  semantic clusters.
- ⬜ **Diff viewer** — between item versions (post-update) or between branches
  (post-import-merge).
- ✅ **Run dream interactively** — open the consolidator suggestions panel,
  preview each proposal, accept / reject with granular A/B choice.
- ✅ **Memory snapshots** — auto-snapshot to `<memory-dir>/snapshots/<date>.brain`
  is implemented for destructive operations; the desktop app Health tab lists snapshots,
  compares them, restores selected items, and can full-rollback with
  confirmation. Remaining: retention policy and scheduled snapshots.
- ✅ **Operational auto-refresh** —  the desktop app can auto-refresh map/proposals/health,
  shows last refresh time and sidecar runtime details, and Audit has its own
  live refresh/filter controls.
- ⬜ **Live trace tail** — follow `data/traces/*.json` to debug activation in real time.

### Non-goals (kept out of the desktop app)
- No chat UI. The MCP serves agents; the desktop app serves humans operating the memory.
- No model inference (the desktop app doesn't run LLMs; the optional reasoner runs in
  the MCP/CLI process).

### Distribution
- ⬜ Tauri bundle for Windows (`.msi`), macOS (`.dmg`, signed + notarised),
  Linux (`.AppImage`, `.deb`, `.rpm`). ~10 MB.
- ⬜ Auto-update via Tauri updater (signed releases on GitHub).

---

## v0.2.x — Cognitive QoL (next iteration) ⬜

Quality-of-life features that emerge from real usage, before the multi-agent
work in v0.3.

### Authoring ergonomics
- ⬜ **Auto-keywords** — when an item is added/updated, recompute the parent
  node's `keywords` from a TF-IDF over its items (proposed mutation, never
  silent). Solves the "memory invisible because the parent has no matching
  keyword" failure mode.
- ⬜ **Hashtag engine** — extract `#tag` tokens from item content and merge
  them into `item.tags` on write. Editable in the desktop app item editor.
- ⬜ **Obsidian-style links** — recognise `[[node.id]]` and `[[Node Label]]`
  inside item content; store as outgoing links on the item; surface them as
  clickable graph edges in the desktop app.
- ⬜ **Bidirectional backlinks** — for every link, expose a reverse "linked-from"
  list when reading a node.
- ⬜ **Inline templates** — `paradigm template <name>` to seed common branches
  (`projects.<name>`, `people.<name>`, `decisions.<area>`).

### Inspectability
- ✅ **Memory health command** — `paradigm doctor`: checks for items without
  embeddings, broken parent links, FTS rows out of sync, orphan mutations;
  fixes what is safe, reports the rest.
- ✅ **`paradigm stats`** — per-workspace counts, size on disk, top-talking
  nodes, freshness histogram.
- ⬜ **HTTP `/api/stats`** mirroring the CLI command.

### Desktop app polish
- ⬜ Drag-to-reparent nodes on the graph, with a confirmation diff and a
  `move_node` mutation type.
- ⬜ Multi-select items + bulk delete / bulk re-tag / bulk move.
- ⬜ Light theme toggle (current UI is dark-only).

---

## v0.3 — Multi-agent collaboration ⬜

When two agents (or one agent + one human) work in the same memory.

- ⬜ Read locks / optimistic mutations to prevent stale-write races.
- ⬜ Conflict detection on `memory_review` (item already accepted by another
  actor → reviewer sees the diff and decides).
- ⬜ Per-actor activity dashboard.
- ⬜ Optional remote sync (push/pull `.brain` over a private bucket;
  no centralised cloud, just object storage).
- ⬜ Signed mutations (every actor has an opaque key; the desktop app can filter "show
  only mutations from actor X").

---

## v0.4 — Sleep mode (tiny LLM consolidation) 🟡

Today's `memory_dream` is heuristic-only by default — fast, no LLM. The
optional **reasoner** (Qwen2.5-1.5B-Instruct via WASM) is wired in v0.1.0 and
adds suggested summaries to overloaded-node proposals. v0.4 expands this into
a full sleep schedule.

- ✅ Local tiny model (`onnx-community/Qwen2.5-1.5B-Instruct` via
  `@huggingface/transformers`, ONNX/WASM, CPU). 100 % offline.
- ✅ `dream({ reasoner })` already produces `suggested_summary` for overloaded
  nodes.
- ⬜ **Reasoner sizing knob** — `PARADIGM_REASONER_MODEL` env override; if
  the 1.5B model produces unsatisfactory consolidations, swap to a 3B-class
  model (`Qwen2.5-3B-Instruct` and friends). Documented trade-off:
  RAM ≈ 2× and latency 2-3× per call. See `docs/OPERATIONS.md` § 4.
- ⬜ Additional consolidation tasks the model performs:
  - Summarise N similar items into one richer item, preserving citations.
  - Merge near-duplicates with semantic understanding (not just token overlap).
  - Re-tag items with consistent vocabulary.
  - Detect items contradicted by newer items; propose archive.
  - Expand a sparse node into sub-nodes when its items naturally cluster.
- ⬜ Sleep schedule: opt-in cron / on-idle; respects a token budget cap.
- ⬜ Outputs as `proposed` mutations the user can review. Never auto-applies.
- ⬜ Optional fine-tune flow: collect the user's accept/reject decisions over
  time, fine-tune the small model on the resulting preference dataset.

---

## v0.5+ — Ecosystem ⬜

Aspirational, ordered by likely impact.

- ✅ HTTP/SSE MCP transport in addition to stdio (`packages/memory-mcp/src/http-server.mjs`).
- ⬜ Vector index (HNSW via `hnswlib-node` or `sqlite-vec`) when stores exceed
  10k items.
- ✅ Markdown / Obsidian importer for seeding from existing knowledge bases
  (`memory_import_markdown` + `paradigm ingest`).
- ✅ YAML/text ingestion via `paradigm ingest`; MCP still accepts inline text
  only for safety.
- ⬜ Browser extension that captures useful pages into a "research" workspace
  (gated by user click, not background scraping).
- ⬜ Adapter library for non-MCP agents (LangChain, LlamaIndex, AutoGen).
- ⬜ Hosted version (paradigm.cloud) for teams, optional, with strict
  open-source parity guarantee.

---

## Things explicitly out of scope (forever, or until proven otherwise)

- **No chat with an "entity".** The substrate experiment lives in a separate
  research repo and is intentionally kept apart from the production memory layer.
- **No silent auto-mutations.** Every change to memory must produce a
  `memory_mutations` row with an actor and a reason. No exceptions. The
  reasoner can *propose* but never apply.
- **No phoning home.** No telemetry, no analytics, no "improve the product"
  beacons. The npm registry version check is the only outbound HTTP, and it
  is opt-out via `PARADIGM_DISABLE_UPDATE_CHECK=1`.
- **No facial / personal-data scraping.** Period.
- **No remote tool execution from MCP input.** The MCP accepts inline content
  for ingestion; only the local CLI (`paradigm ingest`) reads files from disk,
  because the user is always the one selecting the source.

---

## How to influence the roadmap

Open an issue with a clear use case. Concrete codebases > abstract ideas.
Show `npm run eval:memory` results that demonstrate a regression or a missing
capability — those are the strongest arguments.
