# paradigm-memory one-liner installer (Windows PowerShell).
#
#   irm https://raw.githubusercontent.com/infinition/paradigm-memory/main/scripts/installer/install.ps1 | iex
#
# What it does:
#   - Verifies Node 22+ and npm.
#   - Installs `@paradigm-memory/memory-cli` globally (from npm, or from GitHub if
#     the npm package is not yet published).
#   - Bootstraps %USERPROFILE%\.paradigm if it does not exist.
#   - Best-effort registers the MCP with claude / codex / gemini CLIs that
#     are already on PATH.
#
# Override the install location:
#   $env:PARADIGM_MEMORY_DIR = "D:\my\.paradigm"; irm ... | iex
#
# Pin a version (defaults to npm `latest` or the repo `main` branch):
#   $env:PARADIGM_VERSION = "0.1.0"; irm ... | iex

$ErrorActionPreference = "Stop"

$Repo    = "infinition/paradigm-memory"
$NpmPkg  = "@paradigm-memory/memory-cli"
$Ref     = if ($env:PARADIGM_REF)     { $env:PARADIGM_REF }     else { "main" }
$Version = $env:PARADIGM_VERSION

if (-not $env:PARADIGM_MEMORY_DIR) {
    $env:PARADIGM_MEMORY_DIR = Join-Path $env:USERPROFILE ".paradigm"
}

function Say  ($msg) { Write-Host "[paradigm] $msg" -ForegroundColor Cyan }
function Fail ($msg) { Write-Host "[paradigm] $msg" -ForegroundColor Red; exit 1 }

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Fail "Node 22+ required. Install from https://nodejs.org and re-run."
}
$nodeVersion = (node --version).Trim()
$nodeMajor = [int]$nodeVersion.TrimStart("v").Split(".")[0]
if ($nodeMajor -lt 22) {
    Fail "Node $nodeMajor detected. Paradigm needs Node 22+ for the native sqlite module."
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { Fail "npm not on PATH (it ships with Node)." }

$pkgSpec = if ($Version) { "$NpmPkg@$Version" } else { $NpmPkg }
$null = (& npm view $pkgSpec version 2>$null)
if ($LASTEXITCODE -eq 0) {
    Say "Installing $pkgSpec from npm ..."
    npm install -g $pkgSpec --no-fund --no-audit
}
else {
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
        Fail "git required to install from GitHub (npm package not yet published)."
    }
    Say "Package not on npm yet - installing from github.com/$Repo@$Ref ..."
    $tmp = Join-Path $env:TEMP ("paradigm-install-" + [guid]::NewGuid())
    try {
        git clone --depth 1 --branch $Ref "https://github.com/$Repo.git" $tmp | Out-Null
        Push-Location $tmp
        try {
            npm install --no-fund --no-audit
            npm install -g (Join-Path $tmp "packages\memory-cli") --no-fund --no-audit
        } finally { Pop-Location }
    }
    finally {
        if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
    }
}

Say "Memory dir: $($env:PARADIGM_MEMORY_DIR) (will be created on first use)"
New-Item -ItemType Directory -Force -Path $env:PARADIGM_MEMORY_DIR | Out-Null

function Register-With ($client) {
    if (-not (Get-Command $client -ErrorAction SilentlyContinue)) { return }
    $list = & $client mcp list 2>$null
    if ($list -match "(?m)^paradigm-memory[: ]") {
        Say "${client}: paradigm-memory already registered."
        return
    }
    Say "Registering MCP with $client (user scope) ..."
    & $client mcp add --scope user paradigm-memory paradigm-memory-mcp 2>$null
    if ($LASTEXITCODE -ne 0) {
        & $client mcp add paradigm-memory -- paradigm-memory-mcp 2>$null
    }
    if ($LASTEXITCODE -ne 0) {
        Say "$client mcp add failed - register it manually:"
        Say "  $client mcp add --scope user paradigm-memory paradigm-memory-mcp"
    }
}
Register-With "claude"
Register-With "codex"
Register-With "gemini"

Say "Done."
Say "Try:    paradigm version"
Say "Or:     paradigm doctor   |   paradigm memory   |   paradigm dream"
Say "Then restart your MCP client (Claude Code / Codex / Gemini) and call memory_search."
