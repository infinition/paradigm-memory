# paradigm-memory

> Local-first, audited memory MCP for Claude Code, OpenAI Codex, Gemini CLI, Cursor, Cline, Continue and OpenCode.
> Your agent gets a navigable cognitive map instead of a bloated context file.
> Zero cloud. SQLite local storage. Every mutation audited.

## Quickstart

One line. No clone, no manual setup.

**Windows (PowerShell):**

```powershell
irm https://raw.githubusercontent.com/Infinition/paradigm-memory/main/scripts/installer/install.ps1 | iex
```

**Linux / macOS:**

```bash
curl -fsSL https://raw.githubusercontent.com/Infinition/paradigm-memory/main/scripts/installer/install.sh | bash
```

The installer:

1. Checks for Node 22+ (refuses politely otherwise).
2. Installs `@paradigm-memory/memory-cli` globally (from npm if published, otherwise from this repo).
3. Bootstraps `~/.paradigm` (creates the dir; the first `paradigm` call seeds the schema).
4. Best-effort registers the MCP with `claude`, `codex`, and `gemini` CLIs that are already on your PATH.

Then:

```bash
paradigm version
```

**Override defaults:**

```bash
# Custom memory dir
PARADIGM_MEMORY_DIR=/path/to/.paradigm bash <(curl -fsSL https://raw.githubusercontent.com/Infinition/paradigm-memory/main/scripts/installer/install.sh)

# Pin a specific version
PARADIGM_VERSION=0.1.0  bash <(curl -fsSL https://raw.githubusercontent.com/Infinition/paradigm-memory/main/scripts/installer/install.sh)
```

```powershell
$env:PARADIGM_MEMORY_DIR = "D:\my\.paradigm"
irm https://raw.githubusercontent.com/Infinition/paradigm-memory/main/scripts/installer/install.ps1 | iex
```

Memory lives in `~/.paradigm` by default. It survives package reinstalls and `node_modules` wipes. Override with `PARADIGM_MEMORY_DIR=/path`.

### Contributor install (cloned the repo)

If you cloned the repo for development, use the in-tree installer instead. It uses your local checkout as the MCP source so the changes you save are picked up live.

```bash
# Linux / macOS
git clone https://github.com/Infinition/paradigm-memory.git
cd paradigm-memory
bash ./scripts/install.sh
```

```powershell
# Windows
git clone https://github.com/Infinition/paradigm-memory.git
cd paradigm-memory
powershell -ExecutionPolicy Bypass -File .\scripts\install.ps1
```

## Ask an agent to install it

Paste [docs/INSTALL_PROMPT.md](docs/INSTALL_PROMPT.md) into Claude Code, Codex, Gemini CLI or another coding agent. It tells the agent how to install without deleting existing memory.

## CLI

```bash
paradigm                 # launch Paradigm Memory from a source checkout
paradigm studio          # same
paradigm version         # print version + active memory dir
paradigm update          # update packages / reinstall deps, never touches memory
paradigm export          # prompt for .brain export path
paradigm export backup.brain
paradigm import          # prompt for .brain import path
paradigm import backup.brain --mode merge
paradigm ingest ./notes --node projects.research
paradigm ingest ./vault --node projects.research --proposed
paradigm serve           # local HTTP/SSE bridge on 127.0.0.1:8765
paradigm dream           # run consolidation analysis
paradigm uninstall       # unregister MCP clients, keep ~/.paradigm
```

## MCP tools

| Tool | Purpose | Mutates |
|---|---|---|
| `memory_version` | version, protocol, active data dir, workspace stats | no |
| `memory_update_check` | read-only npm version check | no |
| `memory_self_update` | gated npm update of fixed Paradigm packages, disabled by default | no unless enabled |
| `memory_search` | cognitive-map activation + hybrid retrieval + context pack | no |
| `memory_tree` | full map for inspectors / Studio | no |
| `memory_read` | node, children, optional active/proposed items | no |
| `memory_propose_write` | stage an item for review | propose |
| `memory_write` | trusted direct active write | write |
| `memory_review` | accept/reject proposed item | accept/reject |
| `memory_list_proposed` | review queue | no |
| `memory_delete` | soft-delete item, keep audit | delete |
| `memory_create_node` | create a cognitive-map branch | create_node |
| `memory_export` | export versioned .brain snapshot | no |
| `memory_import` | import .brain snapshot | import |
| `memory_import_markdown` | import inline Markdown/Obsidian content into a node | write/propose |
| `memory_dream` | duplicate/stale/overloaded/orphan suggestions | no |

Every tool accepts `workspace?: string` for one MCP process serving many projects.

Destructive operations are guarded: `memory_delete` and `memory_import` with
`mode: "replace"` create an automatic `.brain` snapshot under
`<memory-dir>/snapshots/` before changing state.

## Client setup

Detailed Claude / Codex / Gemini config lives in [docs/MCP_CLIENTS.md](docs/MCP_CLIENTS.md).

### Claude Code

```bash
claude mcp add --scope user paradigm-memory node /absolute/path/to/paradigm-memory/packages/memory-mcp/src/server.mjs
```

### OpenAI Codex

```bash
codex mcp add paradigm-memory -- node /absolute/path/to/paradigm-memory/packages/memory-mcp/src/server.mjs
```

Or `~/.codex/config.toml`:

```toml
[mcp_servers.paradigm-memory]
command = "node"
args = ["/absolute/path/to/paradigm-memory/packages/memory-mcp/src/server.mjs"]

[mcp_servers.paradigm-memory.env]
PARADIGM_MEMORY_DIR = "/absolute/path/to/.paradigm"
```

### Gemini CLI

```bash
gemini mcp add --scope user paradigm-memory node /absolute/path/to/paradigm-memory/packages/memory-mcp/src/server.mjs
```

Or `~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "paradigm-memory": {
      "command": "node",
      "args": ["/absolute/path/to/paradigm-memory/packages/memory-mcp/src/server.mjs"],
      "env": { "PARADIGM_MEMORY_DIR": "/absolute/path/to/.paradigm" },
      "trust": false
    }
  }
}
```

## Agent instruction

Put this in `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `.cursorrules`, or equivalent:

```markdown
Use paradigm-memory MCP as durable project memory.
Before substantive work, call `memory_search` for orientation.
Use `memory_tree` when you need to inspect the map.
After durable decisions, facts, preferences or architecture changes, call `memory_propose_write`.
Do not dump unrelated memory into the context window.
```

## Architecture

```text
Agent -> MCP stdio -> @paradigm-memory/memory-mcp -> @paradigm-memory/memory-core -> SQLite + tree.json
                         |                         |
                         |                         + FTS5, embeddings cache, audit log
                         + Memory Studio uses the same MCP sidecar
```

## HTTP bridge

For clients that cannot spawn stdio processes directly:

```bash
paradigm serve
# GET  http://127.0.0.1:8765/health
# GET  http://127.0.0.1:8765/api/version
# POST http://127.0.0.1:8765/mcp     # JSON-RPC MCP-compatible calls
# GET  http://127.0.0.1:8765/sse     # lightweight SSE endpoint announcement
```

The bridge binds to `127.0.0.1` by default. Binding to any non-loopback host
requires `PARADIGM_HTTP_TOKEN`; clients must send `Authorization: Bearer <token>`.

Self-update is intentionally off by default. To allow an agent to call
`memory_self_update`, start the MCP with `PARADIGM_ALLOW_SELF_UPDATE=1`.

## Paradigm Memory

```bash
paradigm          # preferred
npm run studio:dev
```

Studio is a human inspector: map, graph, search, review queue, audit timeline, export/import, dream. It is not a chat UI.

## Requirements

- Node.js 22+ for native `node:sqlite`.
- Optional: `PARADIGM_MEMORY_EMBEDDINGS=wasm` for local ONNX embeddings via `@xenova/transformers`.
- Optional: `PARADIGM_MEMORY_EMBEDDINGS=ollama` with `nomic-embed-text`.

## Verify

```bash
npm test
npm run lint
npm run eval:memory
npm run studio:build
npm run test:coverage
```

## Roadmap

See [docs/ROADMAP.md](docs/ROADMAP.md).

## Legacy substrate experiment

The original substrate / entity experiment that this repo started as has been
moved to [`legacy/substrate/`](legacy/substrate/README.md). It is intentionally
not part of the published `paradigm-memory` product. Nothing in `packages/`
depends on it; it is kept only for historical reference and reproducibility of
early evals. Ignore it if you only care about the memory MCP.

## License

Apache-2.0 © 2026 Fabien POLLY.
