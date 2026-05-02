<p align="center">
  <img width="220" height="220" alt="paradigm-memory" src="https://github.com/user-attachments/assets/4727027a-4712-4781-a51b-fd784f5fece1" />
</p>

<h1 align="center">paradigm-memory</h1>

<p align="center">
https://infinition.github.io/paradigm-memory/
</p>

<p align="center">
  <strong>The cognitive memory layer your AI agents have been missing.</strong><br>
  Local-first. Auditable. Multi-agent. Zero cloud.
</p>

<p align="center">
  <a href="https://github.com/infinition/paradigm-memory/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/infinition/paradigm-memory?style=flat-square&color=00D1FF"></a>
  <a href="https://github.com/infinition/paradigm-memory/actions"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/infinition/paradigm-memory/ci.yml?style=flat-square"></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-Apache--2.0-blue?style=flat-square"></a>
  <img alt="Node 22+" src="https://img.shields.io/badge/node-%E2%89%A522-339933?style=flat-square&logo=node.js&logoColor=white">
  <img alt="Cross-platform" src="https://img.shields.io/badge/platform-windows%20%7C%20macos%20%7C%20linux-lightgrey?style=flat-square">
</p>

> Stop bloating your agent's context with `MEMORY.md`. Give it a navigable cognitive map instead - searched in milliseconds, mutated under audit, owned by you.

paradigm-memory is a **local-first, MCP-native memory engine** for coding agents. It works with **Claude Code, OpenAI Codex, Cursor, Cline, Continue, Gemini CLI, OpenCode** and anything else that speaks MCP. One SQLite file holds your entire knowledge graph; every mutation is audited; every search returns a token-budgeted context pack the LLM can consume directly.

<p align="center">
<img width="90%"alt="Map view" src="https://github.com/user-attachments/assets/4e08bd6a-f02e-4ccb-9cc9-d530eb13ac36" />
</p>




---

## Why paradigm-memory

Most "AI memory" tools are flat vector stores in a SaaS dashboard. paradigm-memory is different.

| | paradigm-memory | Mem0 / Letta / Zep |
|---|---|---|
| **Where it runs** | Your machine, full stop | Hosted SaaS (or pay-per-token API) |
| **Data shape** | Cognitive map (tree + items + activation) | Flat vector list |
| **Audit** | Every mutation has actor + reason + diff | Black box |
| **Multi-agent** | One process serves N workspaces, M agents | One tenant per account |
| **Storage** | Single SQLite file you own | Their database |
| **Protocol** | MCP-native, day-1, 28 tools | REST/SDK |
| **Cost** | Free, Apache-2.0 | $$ per call after free tier |

**Five things you only get here:**

1. **Cognitive map**, not a vector dump - every fact lives under a node with semantics, importance, freshness, keywords. Activation propagates across the tree, so the LLM gets the *relevant subtree*, not 50 unrelated chunks.
2. **Forensic audit log** - every `write`, `propose`, `accept`, `reject`, `delete`, `update`, `import` writes an immutable mutation row with actor and reason. You can see exactly when an agent decided your `--no-fund` flag preference and which one.
3. **Multi-agent + multi-workspace by design** - one MCP process serves N isolated workspaces (`workspace?: string` on every tool). HTTP/SSE bridge lets multiple agents hit the same store simultaneously. SQLite WAL + `busy_timeout` handles concurrent writers cleanly.
4. **Local-first, no exception** - no telemetry, no analytics, no cloud sync, no phone-home. The only outbound HTTP is the (opt-out) version check against GitHub Releases.
5. **Auditable consolidation** - the `dream` pass detects duplicates, stale items, overloaded nodes, and orphans. Suggestions are *proposed* mutations you accept manually. Optional local reasoner (Qwen2.5-1.5B WASM) generates summary suggestions, never silent edits.

---

## Quickstart

One line. No clone, no manual setup.

**Windows (PowerShell):**

```powershell
irm https://raw.githubusercontent.com/infinition/paradigm-memory/main/scripts/installer/install.ps1 | iex
```

**Linux / macOS:**

```bash
curl -fsSL https://raw.githubusercontent.com/infinition/paradigm-memory/main/scripts/installer/install.sh | bash
```

The installer:

1. Verifies Node 22+ (refuses politely otherwise).
2. Downloads the matching CLI/MCP bundle and the portable desktop app from the latest GitHub Release.
3. Installs everything under `~/.paradigm/` (CLI in `app/current`, desktop in `desktop/current`, shims in `bin`).
4. Prepends `~/.paradigm/bin` to your user PATH.
5. Best-effort registers the MCP with `claude`, `codex`, and `gemini` if those CLIs are on PATH.

Then:

```bash
paradigm                    # open the desktop app
paradigm version            # check the install
paradigm doctor             # health check
```

Memory lives in `~/.paradigm/` by default. It survives reinstalls and `node_modules` wipes. Override with `PARADIGM_MEMORY_DIR=/path`.

> **Prefer manual install?** Grab the Windows `.exe` / `.msi`, macOS `.dmg`, or Linux `.AppImage` / `.deb` from [GitHub Releases](https://github.com/infinition/paradigm-memory/releases/latest).

---

## First steps (5 minutes)

After installing:

1. **Open the desktop app** - `paradigm` (or click the installed shortcut).
2. **Create a branch** - click `+` next to *Cognitive Map* in the left pane. Name it `projects.my_app`. Add 3-5 keywords.
3. **Write your first memory** - select the new node, type something in the right-hand editor (e.g. *"This project uses pnpm, not npm"*), click **Write**.
4. **Search it back** - type `pnpm` in the top search bar. Watch the activation pulse spread across the map. Your item appears with a relevance score.
5. **Tell your agent about it** - see the next section.

That's the loop. Everything else (review queue, dream consolidation, audit log, snapshots, doctor) is for when your store gets bigger.

---

## Tell your agent to use it

Drop this into `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `.cursorrules`, `.continuerules`, or whichever your client picks up:

```markdown
You have access to paradigm-memory MCP, a durable cognitive memory.

Before substantive work:
- Call `memory_search` with the user's intent for orientation.
- Call `memory_tree` only if you need to inspect the map structure.

After durable decisions, facts, preferences, or architecture changes:
- Call `memory_propose_write` (the user reviews) or `memory_write` (you trust yourself).
- Use dotted snake_case node ids: `projects.<name>`, `decisions.<area>`, `people.<name>`.

Never dump unrelated memory into the context window. The search results are
already token-budgeted - use them, don't paraphrase them back.
```

That's the whole instruction. The agent now has navigable, persistent memory across sessions.

---

## The desktop app

`paradigm-memory` ships with a real desktop app (Tauri + React + react-flow), not a webview shim. It's the dogfooding client of the MCP server - anything the GUI does, an agent can do.

**What's inside:**

- **Map** - hierarchical tree on the left, react-flow nodal graph in the centre, item editor on the right. Drag items between nodes to re-parent.
- **Search with activation animation** - type a query, see the cognitive map light up node by node as activation propagates.
- **Review queue** - accept/reject the items your agent proposed.
- **Audit log** - chronological view of every mutation, filterable by actor / operation / node. Click a row to jump to the item.
- **Dream** - runs the consolidator, shows duplicates / stale / overloaded / orphans, lets you accept fixes one by one.
- **Health** - read-only diagnostic + one-click safe repairs (rebuild FTS, refresh JSON mirrors, warm embeddings).
- **Snapshots** - every destructive operation auto-snapshots first; the Health tab lists snapshots, lets you diff one against the current state, and selectively restore items.
- **Settings** - workspace switcher, MCP runtime status, env vars, **one-click "Check for updates"** with copy-to-clipboard install commands when an update is available.

The app speaks JSON-RPC over stdio to the MCP server (the same one your agents use). You can shut down the GUI at any time without affecting agent access.

---

## Multi-agent and multi-user

paradigm-memory is built for the case where **multiple agents and humans share the same memory at the same time**.

- **Workspace pool.** Every tool accepts an optional `workspace?: string` parameter. One MCP process serves N projects, each isolated under `<dataDir>/workspaces/<name>/memory/`. No process restart, no per-project config.
- **Concurrent agents.** SQLite is opened in WAL journal mode with a 5-second busy timeout. Multiple agents (Claude Code in one terminal, Codex in another, Cursor in your IDE) can read and write simultaneously without conflict.
- **HTTP/SSE bridge.** For clients that cannot spawn a stdio MCP child, run `paradigm serve` and point them at `http://127.0.0.1:8765`. Loopback by default; non-loopback binds require a Bearer token (`PARADIGM_HTTP_TOKEN`).
- **Audit per actor.** Every mutation row carries an `actor` field. You can grep `memory_mutations` to see exactly which agent (or human) did what, when, and why.
- **Conflict-free re-parenting.** Moving items, renaming nodes, deleting branches - all wrapped in SQL transactions. If an operation fails midway, the store rolls back and the audit log records nothing.
- **`.brain` snapshots.** Export the full memory as a single versioned JSON file. Pass it to a teammate, version it in git, archive it before a risky operation. Import with `merge` (safe upsert) or `replace` (destructive, auto-snapshots first).

**Real-world setup:**

```text
┌──────────────────┐     stdio MCP    ┌─────────────────────────┐
│ Claude Code      │─────────────────▶│                         │
└──────────────────┘                  │                         │
┌──────────────────┐     stdio MCP    │  paradigm-memory-mcp    │   ┌──────────────────┐
│ Cursor           │─────────────────▶│  (single process)       │──▶│  ~/.paradigm/    │
└──────────────────┘                  │                         │   │  workspaces/     │
┌──────────────────┐     HTTP/SSE     │  - workspace pool       │   │    project_a/    │
│ Codex / OpenCode │─────────────────▶│  - WAL + busy_timeout   │   │    project_b/    │
└──────────────────┘                  │  - audit log            │   │    research/     │
┌──────────────────┐    Tauri sidecar │                         │   └──────────────────┘
│ Desktop app      │─────────────────▶│                         │
└──────────────────┘                  └─────────────────────────┘
```

---

## CLI

```bash
paradigm                       # open the desktop app
paradigm app | paradigm memory # same
paradigm version               # version + active memory dir + stats
paradigm help                  # full help

# Daily use
paradigm export [file]                              # export .brain snapshot
paradigm import [file] [--mode merge|replace]      # import .brain snapshot
paradigm ingest <path> [--node id] [--proposed --warm]  # bulk import .md/.txt/.yaml/folder

# Maintenance
paradigm doctor [--fix] [--warm]   # health check + safe repairs
paradigm warm                       # force-compute embedding cache
paradigm dream                      # run consolidation analysis
paradigm stats                      # workspace counts + storage stats

# Snapshots
paradigm snapshots                  # list automatic safety snapshots
paradigm diff a.brain b.brain       # compare two snapshots
paradigm rollback backup.brain      # replace memory from snapshot (destructive)
paradigm restore backup.brain --item item.id  # selective restore

# Server / network
paradigm serve [--host --port]      # local HTTP/SSE bridge

# Lifecycle
paradigm update                     # show how to update
paradigm uninstall                  # unregister MCP clients (keeps memory)
paradigm uninstall --purge-memory   # also wipe ~/.paradigm (typed-DELETE confirmed)
```

All commands accept `--workspace <name>` and `--dir <path>`.

---

## MCP tools

**Six you'll actually use day-to-day:**

| Tool | Purpose |
|---|---|
| `memory_search` | Cognitive-map activation + hybrid retrieval + token-budgeted context pack |
| `memory_tree` | Full map for inspectors / desktop app |
| `memory_read` | Read one node, its children, and (optionally) its items |
| `memory_propose_write` | Stage an item for human review |
| `memory_write` | Trusted direct write |
| `memory_dream` | Consolidation suggestions (duplicates, stale, overloaded, orphans) |

<details>
<summary><strong>The full surface (28 tools)</strong></summary>

| Tool | Mutation |
|---|---|
| `memory_version` | - |
| `memory_update_check` | - |
| `memory_self_update` | guarded |
| `memory_search` | - |
| `memory_tree` | - |
| `memory_read` | - |
| `memory_propose_write` | `propose` |
| `memory_write` | `write` |
| `memory_review` | `accept` / `reject` |
| `memory_list_proposed` | - |
| `memory_delete` | `delete` (auto-snapshot) |
| `memory_update_item` | `update` |
| `memory_move_item` | `update` |
| `memory_create_node` | `create_node` |
| `memory_update_node` | `update` |
| `memory_delete_node` | `delete` (children re-parented) |
| `memory_export` | - |
| `memory_import` | `import` (auto-snapshot in `replace`) |
| `memory_import_markdown` | `write` / `propose` |
| `memory_dream` | - |
| `memory_warm` | - |
| `memory_doctor` | - |
| `memory_doctor_fix` | varies |
| `memory_stats` | - |
| `memory_mutations` | - |
| `memory_snapshots` | - |
| `memory_snapshot_diff` | - |
| `memory_snapshot_restore` | `import` |
| `memory_feedback` | `feedback` |

Every tool accepts `workspace?: string`. Destructive operations (`memory_delete`, `memory_import` with `mode: "replace"`, `memory_snapshot_restore`) auto-snapshot the current state to `<memory-dir>/snapshots/` first.

</details>

---

## Client setup

The one-line installer auto-registers the MCP with Claude / Codex / Gemini if those CLIs are on PATH. Manual config below for everything else. Detailed configs live in [docs/MCP_CLIENTS.md](docs/MCP_CLIENTS.md).

**Claude Code:**

```bash
claude mcp add --scope user paradigm-memory paradigm-memory-mcp
```

**OpenAI Codex** - `~/.codex/config.toml`:

```toml
[mcp_servers.paradigm-memory]
command = "paradigm-memory-mcp"

[mcp_servers.paradigm-memory.env]
PARADIGM_MEMORY_DIR = "/absolute/path/to/.paradigm"
```

**Gemini CLI** - `~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "paradigm-memory": {
      "command": "paradigm-memory-mcp",
      "env": { "PARADIGM_MEMORY_DIR": "/absolute/path/to/.paradigm" },
      "trust": false
    }
  }
}
```

---

## HTTP bridge

For clients that cannot spawn stdio MCP children (web UIs, remote agents, custom tooling):

```bash
paradigm serve
# GET  http://127.0.0.1:8765/health
# GET  http://127.0.0.1:8765/api/version
# POST http://127.0.0.1:8765/mcp     # JSON-RPC MCP-compatible
# GET  http://127.0.0.1:8765/sse     # SSE endpoint announcement
```

The bridge binds to `127.0.0.1` by default. Binding to any non-loopback host requires `PARADIGM_HTTP_TOKEN`; clients must send `Authorization: Bearer <token>`.

---

## How it works (60 seconds)

1. **Lexical retrieval** - SQLite FTS5 with real `bm25` scoring, normalised per batch. Boolean operators (`AND`, `OR`, `NOT`), phrases (`"..."`), boost (`+term`), exclude (`-term`).
2. **Semantic retrieval** - cosine similarity on embeddings cached in SQLite (LRU in-memory on top). Default model: `Xenova/all-MiniLM-L6-v2` (90 MB, ONNX/WASM, runs on CPU). Optional Ollama (`nomic-embed-text`) or off entirely.
3. **Cognitive-map activation** - for each query, every node gets an activation score from its label, keywords, and embedding distance. Three gates: open (≥ 0.75) → fully expanded, latent (≥ 0.45) → kept as candidate, ignored (< 0.25) → pruned.
4. **Hybrid scoring** - final item score is a weighted combo of FTS bm25, lexical match, parent activation, importance, confidence, and a substring boost. Items in non-activated branches stay reachable when a query has no traction on the map.
5. **Token-budgeted context pack** - the search result is shaped into a single object the LLM can consume: activated nodes (one-liners), evidence items (full text), and a soft token cap.
6. **Optional dream pass** - heuristic detection of duplicates, stale items, overloaded nodes, orphans. With the optional Qwen2.5-1.5B WASM reasoner, also produces suggested summaries for overloaded nodes.

Everything fits in one SQLite file. No `node-gyp`, no `better-sqlite3`, no native compile - Node 22 ships its own SQLite.

---

## Updating

The desktop app's **Settings → Updates** panel calls the GitHub Release version check, shows a diff, and exposes click-to-copy install commands.

Manual update - re-run the one-liner installer:

```bash
# Linux / macOS
curl -fsSL https://raw.githubusercontent.com/infinition/paradigm-memory/main/scripts/installer/install.sh | bash

# Windows
irm https://raw.githubusercontent.com/infinition/paradigm-memory/main/scripts/installer/install.ps1 | iex
```

Your memory data is **never touched** by reinstall. The installer only replaces `~/.paradigm/app/current/` and `~/.paradigm/desktop/current/`.

---

## Uninstalling

```bash
paradigm uninstall                  # unregister MCP clients, keep ~/.paradigm
paradigm uninstall --purge-memory   # also wipe ~/.paradigm (asks for typed DELETE)
```

If you used the Windows MSI/NSIS installer, also run *Settings → Apps → Paradigm Memory → Uninstall* to remove the desktop app and its PATH entries.

---

## Troubleshooting

Field notes for things that go sideways: [`docs/OPERATIONS.md`](docs/OPERATIONS.md). Covers:

- Empty embedding cache after bulk ingest (`paradigm warm` / `--warm`)
- Query that should match but doesn't (parent node has no relevant keywords)
- Windows env-var traps (Git Bash vs PowerShell)
- `sqlite3.exe` quoting hell on Windows
- `database is locked` under heavy concurrency
- Reasoner sizing (1.5B → 3B trade-offs)
- Backup and cross-machine sync workflow

---

## Architecture

```text
┌─────────────────────────────────────────────────────────┐
│  @paradigm-memory/memory-cli   (paradigm CLI binary)    │
└────────────────────────────┬────────────────────────────┘
                             │ spawns / talks to
┌────────────────────────────▼────────────────────────────┐
│  @paradigm-memory/memory-mcp   (stdio + HTTP/SSE)       │
│  - 28 MCP tools, snake_case, all audited                │
│  - Workspace pool                                       │
│  - Zod validation, structured errors                    │
└────────────────────────────┬────────────────────────────┘
                             │ depends on
┌────────────────────────────▼────────────────────────────┐
│  @paradigm-memory/memory-core  (the engine)             │
│  - SQLite + FTS5 + WAL                                  │
│  - Hybrid retrieval (lexical + semantic)                │
│  - Cognitive-map activation gating                      │
│  - Embeddings (ollama / wasm / off)                     │
│  - Optional reasoner (Qwen2.5-1.5B WASM)                │
│  - Audit log + snapshot export/import                   │
└─────────────────────────────────────────────────────────┘
                             ▲
                             │ sidecar (stdio JSON-RPC)
┌────────────────────────────┴────────────────────────────┐
│  @paradigm-memory/memory   (Tauri + React + react-flow) │
│  Desktop app - same MCP, different surface              │
└─────────────────────────────────────────────────────────┘
```

---

## Requirements

- **Node.js 22+** for native `node:sqlite`. The installer enforces this.
- *(Optional)* `PARADIGM_MEMORY_EMBEDDINGS=wasm` for local ONNX embeddings via `@huggingface/transformers` (~90 MB model download on first use).
- *(Optional)* `PARADIGM_MEMORY_EMBEDDINGS=ollama` with `nomic-embed-text` if you already run Ollama.

---

## Roadmap

See [`docs/ROADMAP.md`](docs/ROADMAP.md) for the full picture. Highlights of what's coming:

- **v0.2.x** - auto-keywords (TF-IDF on items), hashtag engine, Obsidian-style `[[links]]`, `paradigm doctor` deeper checks
- **v0.3** - multi-agent collaboration features (read locks, conflict detection, optional remote `.brain` sync)
- **v0.4** - sleep mode (cron / on-idle dream pass with the local reasoner)
- **v0.5+** - vector index (HNSW / `sqlite-vec`) past 10k items, browser extension importer

---

## Contributing

Cloned the repo? Use the in-tree installer instead of the one-liner:

```bash
git clone https://github.com/infinition/paradigm-memory.git
cd paradigm-memory
bash ./scripts/install.sh        # or .\scripts\install.ps1 on Windows
```

This wires the local checkout as the MCP source so live changes are picked up. Then:

```bash
npm test
npm run lint
npm run app:build      # build the desktop app
npm run release:check  # validate versions / tags / config
```

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for guidelines.

---

## Legacy substrate experiment

The original substrate / entity experiment that this repo started as has been moved to [`legacy/substrate/`](legacy/substrate/README.md). It is intentionally not part of the published `paradigm-memory` product. Nothing in `packages/` depends on it; it is kept only for historical reference. Ignore it if you only care about the memory MCP.

---

## License

Apache-2.0 © 2026 Fabien POLLY.

---

## Star History

<a href="https://www.star-history.com/?repos=infinition%2Fparadigm-memory&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=infinition/paradigm-memory&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=infinition/paradigm-memory&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=infinition/paradigm-memory&type=date&legend=top-left" />
 </picture>
</a>
