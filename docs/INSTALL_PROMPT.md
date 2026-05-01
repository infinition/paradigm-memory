# paradigm-memory MCP install prompt

You are installing paradigm-memory, a local-first MCP memory server. Do this safely and do not delete existing memory.

1. Verify Node.js is >= 22: `node --version`. If older, ask the user to upgrade (https://nodejs.org or via `nvm` / `fnm`) before continuing.
2. Run the one-liner installer for the user's platform:
   - **Windows PowerShell**:
     ```powershell
     irm https://raw.githubusercontent.com/infinition/paradigm-memory/main/scripts/installer/install.ps1 | iex
     ```
   - **Linux / macOS**:
     ```bash
     curl -fsSL https://raw.githubusercontent.com/infinition/paradigm-memory/main/scripts/installer/install.sh | bash
     ```
   The installer auto-detects Node, installs `@paradigm-memory/memory-cli` globally, bootstraps `~/.paradigm`, and best-effort registers the MCP with `claude` / `codex` / `gemini` if those CLIs are on the user's PATH. There is **no** `git clone` step.
3. Confirm the CLI works: `paradigm version`.
4. Confirm the MCP server lists tools in the user's client (Claude Code, Codex, Gemini, Cursor, Cline, Continue, OpenCode). The user may need to restart their client once for the MCP to appear.
5. After install, use `memory_search` before substantive work and `memory_propose_write` after durable facts / decisions / preferences.
6. To seed existing notes, ask the user first, then run `paradigm ingest <file-or-folder> --node workspace --proposed --warm`. The `--warm` flag pre-computes embeddings so newly-ingested items are immediately searchable semantically.

Important:
- Memory is stored in the user profile at `~/.paradigm` (Linux / macOS) or `%USERPROFILE%\.paradigm` (Windows) by default. Never delete it unless the user explicitly asks.
- If `paradigm` is not on PATH after install, ask the user to restart their shell. npm-global bin path is added to PATH on first install on most setups; some shells need a reload.
- Override the install location with `PARADIGM_MEMORY_DIR=/path` (Bash) or `$env:PARADIGM_MEMORY_DIR = "..."` (PowerShell) before running the installer.

Contributor / source-checkout install (only if the user explicitly says so):
```bash
git clone https://github.com/infinition/paradigm-memory.git
cd paradigm-memory
bash ./scripts/install.sh   # or .\scripts\install.ps1 on Windows
```
This uses the local checkout as the MCP source — useful for hacking on the engine, not for normal use.
