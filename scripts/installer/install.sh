#!/usr/bin/env bash
# Paradigm Memory one-line installer for Linux / macOS.
#
#   curl -fsSL https://raw.githubusercontent.com/infinition/paradigm-memory/main/scripts/installer/install.sh | bash
#
# Installs the CLI/MCP bundle from GitHub Releases into:
#   ~/.paradigm/app/current
# and creates command shims in:
#   ~/.paradigm/bin

set -euo pipefail

REPO="${PARADIGM_REPO:-infinition/paradigm-memory}"
PARADIGM_HOME="${PARADIGM_HOME:-$HOME/.paradigm}"
PARADIGM_MEMORY_DIR="${PARADIGM_MEMORY_DIR:-$PARADIGM_HOME}"
APP_DIR="$PARADIGM_HOME/app/current"
BIN_DIR="$PARADIGM_HOME/bin"
VERSION="${PARADIGM_VERSION:-}"

cyan() { printf '\033[0;36m%s\033[0m' "$1"; }
red()  { printf '\033[0;31m%s\033[0m' "$1"; }
say()  { printf '%s %s\n' "$(cyan '[paradigm]')" "$*"; }
fail() { printf '%s %s\n' "$(red '[paradigm]')" "$*" >&2; exit 1; }

command -v node >/dev/null 2>&1 || fail "Node 22+ is required. Install Node and re-run."
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -lt 22 ] && fail "Node $NODE_MAJOR detected. Paradigm Memory needs Node 22+ for native SQLite."
command -v curl >/dev/null 2>&1 || fail "curl is required."
command -v tar >/dev/null 2>&1 || fail "tar is required."

case "$(uname -s)" in
  Darwin) OS="macos" ;;
  Linux) OS="linux" ;;
  *) fail "Unsupported OS: $(uname -s)" ;;
esac

case "$(uname -m)" in
  x86_64|amd64) ARCH="x64" ;;
  arm64|aarch64) ARCH="arm64" ;;
  *) fail "Unsupported architecture: $(uname -m)" ;;
esac

if [ "$OS" = "macos" ] && [ "$ARCH" = "x64" ]; then
  fail "Intel macOS is not published. Paradigm Memory macOS releases target Apple Silicon."
fi

if [ -n "$VERSION" ]; then
  RELEASE_API="https://api.github.com/repos/$REPO/releases/tags/v$VERSION"
else
  RELEASE_API="https://api.github.com/repos/$REPO/releases/latest"
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
RELEASE_JSON="$TMP/release.json"

say "Resolving GitHub Release from $RELEASE_API ..."
curl -fsSL -H "User-Agent: paradigm-memory-installer" "$RELEASE_API" -o "$RELEASE_JSON"
ASSET_URL="$(node - "$RELEASE_JSON" "$OS" "$ARCH" <<'NODE'
const [file, os, arch] = process.argv.slice(2);
const release = JSON.parse(await import("node:fs/promises").then(fs => fs.readFile(file, "utf8")));
const re = new RegExp(`^paradigm-memory-cli-v.*-${os}-${arch}\\.tar\\.gz$`);
const asset = release.assets?.find((candidate) => re.test(candidate.name));
if (!asset) process.exit(2);
console.log(asset.browser_download_url);
NODE
)" || fail "No $OS $ARCH CLI asset found in the selected release."

ARCHIVE="$TMP/paradigm-memory-cli.tar.gz"
mkdir -p "$APP_DIR" "$BIN_DIR" "$PARADIGM_MEMORY_DIR"
say "Downloading $(basename "$ASSET_URL") ..."
curl -fL -H "User-Agent: paradigm-memory-installer" "$ASSET_URL" -o "$ARCHIVE"
rm -rf "$APP_DIR"
mkdir -p "$APP_DIR"
tar -xzf "$ARCHIVE" -C "$APP_DIR"

cat > "$BIN_DIR/paradigm" <<EOF
#!/usr/bin/env bash
export PARADIGM_MEMORY_DIR="$PARADIGM_MEMORY_DIR"
exec node "$APP_DIR/packages/memory-cli/src/cli.mjs" "\$@"
EOF
cat > "$BIN_DIR/paradigm-memory-mcp" <<EOF
#!/usr/bin/env bash
export PARADIGM_MEMORY_DIR="$PARADIGM_MEMORY_DIR"
exec node "$APP_DIR/packages/memory-mcp/src/server.mjs" "\$@"
EOF
cat > "$BIN_DIR/paradigm-memory-http" <<EOF
#!/usr/bin/env bash
export PARADIGM_MEMORY_DIR="$PARADIGM_MEMORY_DIR"
exec node "$APP_DIR/packages/memory-mcp/src/http-server.mjs" "\$@"
EOF
chmod +x "$BIN_DIR/paradigm" "$BIN_DIR/paradigm-memory-mcp" "$BIN_DIR/paradigm-memory-http"

case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *)
    PROFILE="$HOME/.profile"
    if [ -n "${ZSH_VERSION:-}" ]; then PROFILE="$HOME/.zshrc"; fi
    if [ -n "${BASH_VERSION:-}" ]; then PROFILE="$HOME/.bashrc"; fi
    printf '\nexport PATH="$HOME/.paradigm/bin:$PATH"\n' >> "$PROFILE"
    export PATH="$BIN_DIR:$PATH"
    say "Added $BIN_DIR to $PROFILE. Restart terminals that were already open."
    ;;
esac

register_with() {
  local client="$1"
  command -v "$client" >/dev/null 2>&1 || return 0
  if "$client" mcp list 2>/dev/null | grep -q '^paradigm-memory[: ]'; then
    say "$client: paradigm-memory already registered."
    return 0
  fi
  local server="$APP_DIR/packages/memory-mcp/src/server.mjs"
  say "Registering MCP with $client ..."
  if   "$client" mcp add --scope user paradigm-memory node "$server" 2>/dev/null; then :
  elif "$client" mcp add paradigm-memory -- node "$server" 2>/dev/null; then :
  else
    say "$client mcp add failed - register manually with:"
    say "  $client mcp add --scope user paradigm-memory node \"$server\""
  fi
}
register_with claude
register_with codex
register_with gemini

say "Installed Paradigm Memory."
say "Memory dir: $PARADIGM_MEMORY_DIR"
say "Try: paradigm version"
