# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.0] — 2026-04-30

### Added
- `@paradigm-memory/memory-core` — local-first cognitive map retrieval engine (SQLite + FTS5 + embeddings).
- `@paradigm-memory/memory-mcp` — stdio MCP server exposing 11 tools: `memory_search`, `memory_read`,
  `memory_propose_write`, `memory_write`, `memory_review`, `memory_list_proposed`,
  `memory_delete`, `memory_create_node`, `memory_dream`, `memory_export`, `memory_import`.
- Profile-default storage: `~/.paradigm` (cross-platform, survives reinstall). Override with `PARADIGM_MEMORY_DIR`.
- `.brain` snapshot format (versioned JSON): export full memory or import / merge into another workspace.
- Workspace scoping: every tool accepts an optional `workspace` parameter.
- Embedding providers: `ollama`, `wasm` (via `@xenova/transformers`), `keyword`, `off`.
- Dream/consolidation pass: `memory_dream` analyses the store and proposes merges, archives, splits.
- **Granular Dream Choice**: Integrated Studio UI for choosing which item to keep in deduplication.
- **Robust Search (Lexical Boost)**: Added lexical scoring to ensure keyword matches are not filtered out.
- **Native Tauri Export**: Reliable export/import via native file dialogs.
- `paradigm-memory-mcp --version` / `--help`.
- Cross-platform install scripts (`scripts/install.sh`, `scripts/install.ps1`).
- Apache-2.0 license.
- GitHub Actions CI on Linux/macOS/Windows.
- Unified English documentation in `docs/`.

### Notes
- Targets Node 22+ for the native `node:sqlite` module (no `better-sqlite3`, no `node-gyp`).
- Snake-case tool names per MCP convention.
