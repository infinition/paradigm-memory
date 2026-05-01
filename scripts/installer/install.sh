#!/usr/bin/env bash
# paradigm-memory one-liner installer (Linux / macOS).
#
#   curl -fsSL https://raw.githubusercontent.com/infinition/paradigm-memory/main/scripts/installer/install.sh | bash
#
# What it does:
#   - Verifies Node 22+ and npm.
#   - Installs `@paradigm-memory/memory-cli` globally (from npm, or from GitHub if
#     the npm package is not yet published).
#   - Bootstraps ~/.paradigm if it does not exist.
#   - Best-effort registers the MCP with claude / codex / gemini CLIs that
#     are already on PATH.
#
# Override the install location:
#   PARADIGM_MEMORY_DIR=/path/to/.paradigm bash <(curl -fsSL …)
#
# Pin a version (defaults to the npm `latest` tag, or the repo `main` branch):
#   PARADIGM_VERSION=0.1.0 bash <(curl -fsSL …)

set -euo pipefail

REPO="infinition/paradigm-memory"
NPM_PKG="@paradigm-memory/memory-cli"
PARADIGM_MEMORY_DIR="${PARADIGM_MEMORY_DIR:-$HOME/.paradigm}"
PARADIGM_VERSION="${PARADIGM_VERSION:-}"
PARADIGM_REF="${PARADIGM_REF:-main}"

cyan() { printf '\033[0;36m%s\033[0m' "$1"; }
red()  { printf '\033[0;31m%s\033[0m' "$1"; }
say()  { printf '%s %s\n' "$(cyan '[paradigm]')" "$*"; }
fail() { printf '%s %s\n' "$(red   '[paradigm]')" "$*" >&2; exit 1; }

command -v node >/dev/null 2>&1 \
  || fail "Node 22+ is required. Install it from https://nodejs.org or via nvm/fnm, then re-run."
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
[ "$NODE_MAJOR" -lt 22 ] \
  && fail "Node $NODE_MAJOR detected. Paradigm needs Node 22+ for the native sqlite module."
command -v npm >/dev/null 2>&1 \
  || fail "npm is not on PATH (it ships with Node)."

PKG_SPEC="$NPM_PKG"
[ -n "$PARADIGM_VERSION" ] && PKG_SPEC="${NPM_PKG}@${PARADIGM_VERSION}"

if npm view "$PKG_SPEC" version >/dev/null 2>&1; then
  say "Installing $PKG_SPEC from npm ..."
  npm install -g "$PKG_SPEC" --no-fund --no-audit
else
  command -v git >/dev/null 2>&1 \
    || fail "git is required to install from GitHub (npm package not yet published)."
  say "Package not on npm yet — installing from github.com/$REPO@$PARADIGM_REF ..."
  TMP=$(mktemp -d)
  trap 'rm -rf "$TMP"' EXIT
  git clone --depth 1 --branch "$PARADIGM_REF" "https://github.com/$REPO.git" "$TMP" >/dev/null 2>&1 \
    || fail "git clone failed. Check network / branch '$PARADIGM_REF'."
  ( cd "$TMP" \
    && npm install --no-fund --no-audit \
    && npm install -g "$TMP/packages/memory-cli" --no-fund --no-audit )
fi

say "Memory dir: $PARADIGM_MEMORY_DIR (will be created on first use)"
mkdir -p "$PARADIGM_MEMORY_DIR"

# Best-effort: register the MCP with any client already on PATH.
register_with() {
  local client="$1"
  command -v "$client" >/dev/null 2>&1 || return 0
  if "$client" mcp list 2>/dev/null | grep -q '^paradigm-memory[: ]'; then
    say "$client: paradigm-memory already registered."
    return 0
  fi
  say "Registering MCP with $client (user scope) ..."
  if   "$client" mcp add --scope user paradigm-memory paradigm-memory-mcp 2>/dev/null; then :
  elif "$client" mcp add               paradigm-memory -- paradigm-memory-mcp 2>/dev/null; then :
  else
    say "$client mcp add failed — register it manually:"
    say "  $client mcp add --scope user paradigm-memory paradigm-memory-mcp"
  fi
}
register_with claude
register_with codex
register_with gemini

say "Done."
say "Try:    paradigm version"
say "Or:     paradigm doctor   |   paradigm studio   |   paradigm dream"
say "Then restart your MCP client (Claude Code / Codex / Gemini) and call memory_search."
