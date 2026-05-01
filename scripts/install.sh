#!/usr/bin/env bash
# paradigm-memory installer (Linux / macOS).
# - Verifies Node >= 22.
# - Installs project deps.
# - Registers the MCP with Claude Code (user scope) if `claude` is on PATH.
# - Bootstraps an empty memory under ./.paradigm if none exists.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/infinition/paradigm-memory/main/scripts/installer/install.sh | bash
#   ./scripts/install.sh                # local
#   PARADIGM_MEMORY_DIR=./.paradigm ./scripts/install.sh

set -euo pipefail

PARADIGM_MEMORY_DIR="${PARADIGM_MEMORY_DIR:-$HOME/.paradigm}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if ! command -v node >/dev/null 2>&1; then
  echo "[paradigm] Node.js not found. Install Node 22+ from https://nodejs.org and re-run."
  exit 1
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "[paradigm] Node $NODE_MAJOR detected. Paradigm needs Node 22+ for the native sqlite module."
  exit 1
fi

echo "[paradigm] Installing dependencies in $ROOT_DIR ..."
(cd "$ROOT_DIR" && npm install --no-fund --no-audit)
npm install -g "$ROOT_DIR/packages/memory-cli" --no-fund --no-audit

if [ ! -f "$PARADIGM_MEMORY_DIR/memory/tree.json" ]; then
  echo "[paradigm] Bootstrapping empty memory at $PARADIGM_MEMORY_DIR ..."
  PARADIGM_MEMORY_DIR="$PARADIGM_MEMORY_DIR" node "$ROOT_DIR/scripts/init-empty-memory.mjs"
fi

if command -v claude >/dev/null 2>&1; then
  if claude mcp list 2>/dev/null | grep -q '^paradigm-memory:'; then
    echo "[paradigm] Claude Code MCP already registered."
  else
    echo "[paradigm] Registering MCP with Claude Code (user scope) ..."
    claude mcp add --scope user paradigm-memory node "$ROOT_DIR/packages/memory-mcp/src/server.mjs" || echo "[paradigm] (mcp add failed - already registered? Run claude mcp list to check.)"
  fi
else
  echo "[paradigm] Claude Code CLI not on PATH. Skip registration. To do it later:"
  echo "          claude mcp add --scope user paradigm-memory node $ROOT_DIR/packages/memory-mcp/src/server.mjs"
fi
echo "[paradigm] CLI installed: paradigm"
echo "[paradigm] Done. Restart your MCP client and ask it to use memory_search."
