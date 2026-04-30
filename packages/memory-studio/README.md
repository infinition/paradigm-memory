# @paradigm-memory/memory-studio

Desktop inspector for paradigm-memory.
**Tauri** (Rust shell) + **React** + **react-flow** + **paradigm-memory-mcp** sidecar.

The Studio is the dogfooding client of the MCP server: it talks JSON-RPC over
stdio exactly the way Claude Code, Cursor, Cline & co do. Anything the Studio
can do, an agent can do.

## Status

v0.1 scaffold — boots, talks to the MCP sidecar, draws the cognitive map,
edits items, runs propose/review/reject, exports/imports `.brain` files,
reads the audit log directly from SQLite.

## Dev

Prerequisites:
- Node 22+ (for the MCP sidecar).
- Rust stable (`rustup default stable`) + the platform Tauri prerequisites
  (https://tauri.app/start/prerequisites/).
- This repo cloned, with `npm install` already run at the workspace root.

```bash
# from the repo root
cd packages/memory-studio
npm install                  # installs vite, react, @xyflow/react, @tauri-apps/...
npm run tauri:dev            # launches the desktop app in dev mode
```

The app boots `paradigm-memory-mcp` as a stdio sidecar. Memory dir resolves to:

1. `$PARADIGM_MEMORY_DIR` if set,
2. `~/.paradigm` otherwise (cross-platform via `dirs::home_dir()`).

To point the sidecar elsewhere:

```bash
PARADIGM_MEMORY_DIR=$PWD/.paradigm npm run tauri:dev

# Or override the sidecar command itself (for an installed npm bin):
PARADIGM_MCP_COMMAND="paradigm-memory-mcp" npm run tauri:dev
```

## Build

```bash
npm run tauri:build
```

Produces a platform-native bundle under `src-tauri/target/release/bundle/` —
`.msi` on Windows, `.dmg` on macOS, `.AppImage` / `.deb` on Linux.

## Architecture

```
┌──────────────────────────────────────────────────┐
│  React UI (Vite, port 1420 in dev)               │
│   ├─ App.tsx           layout + tabs             │
│   ├─ SearchBar.tsx     debounced memory_search   │
│   ├─ Sidebar.tsx       hierarchical tree         │
│   ├─ Graph.tsx         react-flow nodal view     │
│   ├─ ItemEditor.tsx    propose / write / delete  │
│   ├─ ReviewQueue.tsx   pending items             │
│   └─ AuditLog.tsx      mutation timeline         │
└──────────────────────────────────────────────────┘
                    │ invoke("mcp_call", …)
                    ▼
┌──────────────────────────────────────────────────┐
│  Tauri Rust backend (src-tauri/src/main.rs)      │
│   - spawns paradigm-memory-mcp at startup        │
│   - persistent stdin / stdout                    │
│   - reader thread → oneshot channels by id       │
│   - read_mutations command (direct sqlite)       │
└──────────────────────────────────────────────────┘
                    │ stdio JSON-RPC
                    ▼
┌──────────────────────────────────────────────────┐
│  paradigm-memory-mcp                             │
│   (the same binary Claude Code uses)             │
└──────────────────────────────────────────────────┘
```

## Tabs

- **Map** — tree (left) + nodal graph (centre) + item editor (right) +
  search bar (top) that triggers an activation animation across the graph.
- **Review** — queue of `proposed` items, accept / reject in one click.
  The badge in the tab title shows the live count.
- **Audit** — chronological mutation log read from
  `<dataDir>/memory/paradigm.sqlite` (or
  `<dataDir>/workspaces/<workspace>/memory/paradigm.sqlite`).

## Top-bar actions

- **↻** — refresh the cognitive map walk.
- **↓** — `memory_export` → triggers a browser download of a `.brain` file.
- **↑** — file picker → `memory_import` (merge mode).

## Roadmap (Studio-specific)

- Workspace switcher dropdown (the MCP already supports it).
- Update banner when a newer `@paradigm-memory/memory-mcp` is on npm.
- Embedding map (UMAP 2D) tab.
- Live tail of `data/traces/*.json` for debugging activation.
- Fine-grained "diff before merge" preview when importing a `.brain`.
- Bundle the MCP sidecar inside the Tauri binary (currently relies on the
  workspace path for dev; production needs `bundle.externalBin`).

See the repo-root `ROADMAP.md` for the broader picture.

## License

Apache-2.0 © 2026 Fabien POLLY.
