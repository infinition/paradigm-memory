# Paradigm Memory Release Guide

Paradigm Memory is released from GitHub only. There is no npm publish step.

The normal release flow is:

1. Update the version in the workspace.
2. Run local checks.
3. Commit and push.
4. Create and push a `vX.Y.Z` tag.
5. Let GitHub Actions build and publish every release asset.

## What Gets Published

The `Release` workflow publishes:

- Paradigm Memory desktop bundles for Windows, Linux and macOS through Tauri.
- Portable desktop launchers used by the one-line installers:
  - `windows-x64` zip with `paradigm-memory.exe`
  - `linux-x64` AppImage
  - `macos-arm64` zip with `Paradigm Memory.app`
- CLI/MCP archives for:
  - `windows-x64`
  - `linux-x64`
  - `macos-arm64`

macOS release assets target Apple Silicon only. Intel macOS is intentionally not
published.

CLI assets are named like:

```text
paradigm-memory-cli-v0.1.2-windows-x64.tar.gz
paradigm-memory-cli-v0.1.2-linux-x64.tar.gz
paradigm-memory-cli-v0.1.2-macos-arm64.tar.gz
paradigm-memory-desktop-v0.1.2-windows-x64.zip
paradigm-memory-desktop-v0.1.2-linux-x64.AppImage
paradigm-memory-desktop-v0.1.2-macos-arm64.zip
```

The one-line installers download those CLI/MCP assets from GitHub Releases and
install them under `~/.paradigm/app/current`. When a matching portable desktop
asset is present, they also install it under `~/.paradigm/desktop/current`.

## Version Bump

Use one version everywhere:

```bash
npm version 0.1.2 --workspaces --include-workspace-root --no-git-tag-version
npm install --package-lock-only
```

Then verify these files have the same version:

- `package.json`
- `packages/memory-core/package.json`
- `packages/memory-mcp/package.json`
- `packages/memory-cli/package.json`
- `packages/memory/package.json`
- `packages/memory/src-tauri/tauri.conf.json`
- `packages/memory/src-tauri/Cargo.toml`
- `packages/memory/src-tauri/Cargo.lock`

Also keep internal dependencies pinned to the same version:

- `packages/memory-mcp/package.json` -> `@paradigm-memory/memory-core`
- `packages/memory-cli/package.json` -> `@paradigm-memory/memory-mcp`

## Local Checks

Run:

```bash
npm install
npm run release:check
npm run lint
npm test
npm run app:build
```

Optional local CLI bundle check:

```bash
npm prune --omit=dev
npm run release:cli
```

Use a fresh checkout if you prune dev dependencies locally and still need to do
frontend or Tauri work afterward.

## Tag Release

Commit the version bump and release changes first:

```bash
git status
git add .
git commit -m "Release v0.1.2"
git push
```

Create and push the tag:

```bash
git tag v0.1.2
git push origin v0.1.2
```

The tag must match `package.json` exactly. If the version is `0.1.2`, the tag
must be `v0.1.2`.

## Installer Behavior

Windows:

```powershell
irm https://raw.githubusercontent.com/infinition/paradigm-memory/main/scripts/installer/install.ps1 | iex
```

Linux / macOS:

```bash
curl -fsSL https://raw.githubusercontent.com/infinition/paradigm-memory/main/scripts/installer/install.sh | bash
```

The installers:

1. Check Node 22+.
2. Query GitHub Releases.
3. Download the matching CLI/MCP archive.
4. Download the matching portable desktop app when available.
5. Extract the CLI/MCP archive into `~/.paradigm/app/current`.
6. Install the desktop app into `~/.paradigm/desktop/current`.
7. Create command shims in `~/.paradigm/bin`.
8. Put `~/.paradigm/bin` first in PATH when possible.
9. Best-effort register `paradigm-memory` with supported MCP clients.

After install:

- `paradigm` opens the desktop app.
- `paradigm help` prints CLI help.
- `paradigm version`, `paradigm serve`, `paradigm export`, and other
  subcommands run the CLI.

Memory data is not deleted during install or update.

## Releasing After a Failed Tag

If a tag workflow fails before publishing assets, prefer a new patch version:

```bash
npm version 0.1.3 --workspaces --include-workspace-root --no-git-tag-version
npm install --package-lock-only
npm run release:check
git add .
git commit -m "Release v0.1.3"
git push
git tag v0.1.3
git push origin v0.1.3
```

Do not reuse public tags unless you are sure nobody has consumed them.
