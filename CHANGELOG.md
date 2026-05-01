# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.2] - 2026-05-01

### Changed

- Release workflow now publishes CLI/MCP archives and desktop assets from GitHub Releases only.
- One-line installers now install CLI/MCP plus the portable desktop app when available.
- `paradigm` opens Paradigm Memory, while subcommands such as `paradigm version` and `paradigm serve` remain CLI commands.
- macOS release assets target Apple Silicon only.

### Fixed

- Fixed the MCP service refresh recursion that could overflow the stack in CI.
- Hardened Windows cleanup in concurrent SQLite tests.
- Added generated Tauri icon assets required by app builds.

## [0.1.1] — 2026-05-01

### Added — Desktop App (`@paradigm-memory/memory`)

- **Interactive Reorganization**: Support for drag-and-drop items onto sidebar nodes for instant re-parenting.
- **Advanced Metadata Editing**: Item cards now feature sliders for `importance` and `confidence` and a dedicated `tags` input in the edit mode.
- **Smart Node Creation**: Added autocomplete for Node IDs in the creation modal, suggesting existing hierarchy paths to prevent fragmentation.
- **Node Management**: New "Delete Node" action in the item editor header with automatic orphan re-parenting.
- **Rich Content Display**: Enhanced Markdown rendering with support for line breaks (`remark-breaks`), math equations (`rehype-katex`), and secure external links.
- **Visual Feedback**: Real-time `drag-over` highlighting on sidebar nodes during item moves.

### Added — MCP Server (`@paradigm-memory/memory-mcp`)

- New management tools: `memory_move_item`, `memory_update_node`, and `memory_delete_node`.
- Enhanced `memory_update_item` schema to support granular metadata updates (importance, confidence, tags).

### Changed — Engine (`@paradigm-memory/memory-core`)

- **Smart Deletion Logic**: Deleting a node now preserves history by automatically moving all child nodes and items to the parent node (or the root workspace).
- **Relational Consistency**: `moveItem` and node operations use SQL transactions to ensure data integrity during structural changes.

## [0.1.0] — 2026-04-30

### Added — Engine (`@paradigm-memory/memory-core`)

- Local-first cognitive map model (`tree.json` + nodes with `id, label, summary, keywords, importance, freshness, confidence, retrieval_policy`).
- SQLite storage via Node 22 `node:sqlite` — zero `node-gyp`, zero compile, native FTS5.
- FTS5 full-text index with **real `bm25` scoring**, normalised per batch; boolean / phrase / `+` / `-` operators supported.
- Hybrid retrieval: lexical (FTS5 + prefix-stem) + semantic (cosine on cached embeddings).
- Activation gating with three states: open (≥ 0.75), latent (≥ 0.45), ignored (< 0.25).
- Full-corpus FTS pass with re-weighting (no `nodeIds` pre-filter): items in non-activated branches stay searchable.
- Off-domain short-circuit driven by intent classifier (regex-based for v0.1).
- Embedding providers: `ollama`, `wasm` (`@huggingface/transformers`, optional dep), `keyword` (deterministic test fallback), `off`.
- Embedding registry (`embedding-registry.mjs`) — recommended models per language with size / quality notes.
- Persistent SQLite cache for embeddings + in-process LRU (cap configurable via `PARADIGM_MEMORY_EMBED_LRU`).
- Auto-warm on boot; explicit `paradigm warm` command and `service.warm()` MCP-side method for post-ingest warming.
- Optional **reasoner** (`createReasoner`) using `@huggingface/transformers` (Qwen2.5-1.5B-Instruct, ONNX/WASM, fully local). When passed to `dream()`, produces suggested summaries for overloaded nodes.
- Heuristic dream pass: detects duplicates (Jaccard tokens), stale items (age × importance), overloaded nodes, orphans.
- Audit log on every mutation (`write`, `propose`, `accept`, `reject`, `delete`, `update`, `create_node`, `import`, etc.) writes to `memory_mutations`.
- Soft-delete: items keep `deleted_at`; excluded from search; never hard-removed.
- Status state machine: `active` | `proposed` | `deleted`.
- Schema validation: `validateMemoryNode`, `validateMemoryItem`, `validateMemoryMutation`, `validateMemoryTrace`.
- Tracing: every operation produces a JSON trace under `data/traces/`.
- Snapshot export / import (`paradigm.brain` JSON format) with merge / replace modes.
- Auto-snapshot before destructive operations (`memory_delete`, `memory_import` with `mode: "replace"`) under `<memory-dir>/snapshots/`.

### Added — MCP server (`@paradigm-memory/memory-mcp`)

- stdio JSON-RPC server speaking MCP protocol `2025-03-26`.
- HTTP/SSE bridge (`http-server.mjs`) with `/health`, `/api/version`, `/api/tools`, `/mcp` (JSON-RPC), `/sse`. Loopback by default; non-loopback binds require `PARADIGM_HTTP_TOKEN` Bearer auth.
- Workspace pool: every tool accepts `workspace?: string`. One process serves N projects under `<dataDir>/workspaces/<workspace>/memory/`.
- Zod-validated inputs; structured error responses (`invalid_input`, `unknown_node`, `unknown_item`, `node_exists`, `missing_parent`, `invalid_review_status`, `invalid_snapshot`, `invalid_mode`).
- `--version`, `--help` CLI flags. Standalone bins: `paradigm-memory-mcp`, `paradigm-memory-http`.

#### Tools (26 total)

| Tool | Purpose | Mutation |
|---|---|---|
| `memory_version` | Server / protocol / data-dir / stats | — |
| `memory_update_check` | Read-only npm registry check | — |
| `memory_self_update` | Gated package update (off by default) | guarded |
| `memory_search` | Cognitive-map activation + hybrid retrieval + context pack | — |
| `memory_tree` | Full map for inspectors / desktop app | — |
| `memory_read` | Node + children + (active/proposed) items | — |
| `memory_propose_write` | Stage an item for review | `propose` |
| `memory_write` | Trusted direct active write | `write` |
| `memory_review` | Accept / reject proposed item | `accept` / `reject` |
| `memory_list_proposed` | Review queue | — |
| `memory_delete` | Soft-delete item, keep audit | `delete` (auto-snapshot) |
| `memory_update_item` | Edit content / tags of an existing item | `update` |
| `memory_create_node` | Create a cognitive-map branch | `create_node` |
| `memory_export` | Export versioned `.brain` snapshot | — |
| `memory_import` | Import `.brain` (merge / replace) | `import` (auto-snapshot in `replace`) |
| `memory_import_markdown` | Import inline Markdown / Obsidian content | `write` / `propose` |
| `memory_dream` | Duplicate / stale / overloaded / orphan suggestions | — |
| `memory_warm` | Force-compute embeddings for nodes + items | — |
| `memory_doctor` | Read-only health report (orphans, missing embeddings) | — |
| `memory_doctor_fix` | Apply safe doctor remediations | (varies) |
| `memory_stats` | Per-workspace counts / size / freshness histogram | — |
| `memory_mutations` | Paged mutation history with filters | — |
| `memory_snapshots` | List `.brain` snapshots under `<memory-dir>/snapshots/` | — |
| `memory_snapshot_diff` | Diff a snapshot against the current store | — |
| `memory_snapshot_restore` | Restore a snapshot (auto-snapshots current state first) | `import` |
| `memory_feedback` | Record `accept` / `reject` signals against a search result for future re-ranking | `feedback` |

### Added — CLI (`@paradigm-memory/memory-cli`)

Cross-platform `paradigm` binary (Node 22+):

- `paradigm` / `paradigm memory` — launches the desktop app from a source checkout.
- `paradigm version` — full version + active memory dir + stats.
- `paradigm update` — `npm install` (repo) or `npm update -g` (installed).
- `paradigm uninstall` — unregister `claude` / `codex` / `gemini` MCP entries; keep memory unless `--purge-memory` confirmed.
- `paradigm export [file] [--mutations] [--deleted]` — export `.brain` snapshot.
- `paradigm import [file] [--mode merge|replace]` — import `.brain` snapshot.
- `paradigm ingest <path> [--node id] [--proposed] [--warm]` — bulk import `.md` / `.markdown` / `.txt` / `.yaml` / `.yml` files / dirs. `--warm` pre-computes embeddings.
- `paradigm warm` — explicit embedding warm pass.
- `paradigm doctor` — read-only health diagnostic.
- `paradigm serve [--host --port]` — start the HTTP/SSE bridge.
- `paradigm dream` — run consolidation analysis.

### Added — Desktop app (`@paradigm-memory/memory`)

Tauri 2 + React + react-flow desktop inspector. Rust shell, sidecar bridge to `paradigm-memory-mcp`. Lives under `packages/memory/`.

- Map view (left) — hierarchical tree, expand / collapse, badge per node showing active item count.
- Graph view (centre) — react-flow nodal map with topology-aware layout. **Positions persist across data refreshes; user drags survive auto-refresh ticks**. Auto-layout only runs on the first load or when manually triggered via the **Relayout** button in the toolbar.
- Item editor (right) — edit content / tags / importance / confidence; mutation history per item.
- Tabs: Map, Review queue, Audit log, Dream, Health, Settings.
- Search panel — debounced `memory_search` with activation pulse animation on the graph.
- Workspace switcher with auto-discovery of existing workspaces under `<dataDir>/workspaces/`.
- Data-dir diagnostics, update banner, `.brain` export / import via native Tauri dialogs.
- Settings tab — MCP runtime status, env vars, system info, refresh interval control.
- Toast notifications, MiniMap, dark theme (Inter font, glassmorphism).
- Graceful error path on sidecar spawn failure (native message box on Windows; clear stderr otherwise — replaces the previous `panic!`).

### Added — Distribution

- **One-liner installers** (`scripts/installer/install.sh`, `scripts/installer/install.ps1`) served via `raw.githubusercontent.com`. rustup-style UX: `curl ... | bash` / `irm ... | iex`. Verifies Node 22+, downloads CLI/MCP bundles from GitHub Releases, bootstraps `~/.paradigm`, best-effort registers the MCP with `claude` / `codex` / `gemini`.
- Contributor installers (`scripts/install.sh`, `scripts/install.ps1`) for source checkouts that wire the local repo as the MCP source.
- GitHub Actions CI on Linux / macOS / Windows + coverage on Ubuntu.
- GitHub Actions release on tag `v*.*.*` for Windows / Linux / macOS app bundles and CLI/MCP archives.
- Packaging scaffolds: Homebrew formula, Scoop manifest, both pointed at GitHub Release assets.

### Added — Storage & UX

- Profile-default storage: `~/.paradigm` (Linux / macOS) / `%USERPROFILE%\.paradigm` (Windows). Survives reinstall. Override with `PARADIGM_MEMORY_DIR`.

### Added — Documentation

- English-only documentation set: `README.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, `docs/ROADMAP.md`, `docs/INSTALL_PROMPT.md` (paste-into-agent install prompt), `docs/MCP_CLIENTS.md` (Claude / Codex / Gemini configs), `docs/OPERATIONS.md` (Windows pitfalls, embedding indexing latency, reasoner sizing, SQLite locking, backup guidance), `docs/COGNITIVE_MAP_RETRIEVAL.md`, `docs/MEMORY_WRITER.md`, `docs/SAFETY.md`.

### Repo hygiene

- Legacy substrate experiment (entity, web server, manifesto) moved to `legacy/substrate/`. Nothing in `packages/` depends on it.
- Desktop app directory renamed `packages/memory-studio` → `packages/memory` (the npm name `@paradigm-memory/memory` is unchanged).
- Workspace dependency graph: `memory-core` → `memory-mcp` → `memory-cli`; `memory` (private, desktop GUI) consumes the MCP via stdio.

### Notes

- Targets Node 22+ for the native `node:sqlite` module (no `better-sqlite3`, no `node-gyp`).
- Snake-case tool names per MCP convention.
- Apache-2.0 license, © 2026 Fabien POLLY.
