# paradigm-memory installer for Windows PowerShell.
# Usage:
#   .\scripts\install.ps1
#   $env:PARADIGM_MEMORY_DIR="$env:USERPROFILE\.paradigm"; .\scripts\install.ps1

$ErrorActionPreference = "Stop"

function Write-Info {
    param([string]$Message)
    Write-Host "[paradigm] $Message"
}

if (-not $env:PARADIGM_MEMORY_DIR) {
    $env:PARADIGM_MEMORY_DIR = Join-Path $env:USERPROFILE ".paradigm"
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = Resolve-Path (Join-Path $scriptDir "..")

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Info "Node.js not found. Install Node 22+ from https://nodejs.org and re-run."
    exit 1
}

$nodeVersion = (node --version).Trim()
$nodeMajorText = $nodeVersion.TrimStart("v").Split(".")[0]
$nodeMajor = [int]$nodeMajorText
if ($nodeMajor -lt 22) {
    Write-Info "Node $nodeMajor detected. Paradigm needs Node 22+ for native sqlite."
    exit 1
}
$npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npmCommand) { $npmCommand = Get-Command npm -ErrorAction SilentlyContinue }
if (-not $npmCommand) {
    Write-Info "npm not found on PATH. It ships with Node 22+."
    exit 1
}
$NpmCmd = $npmCommand.Source

Write-Info "Installing dependencies in $rootDir ..."
Push-Location $rootDir
try {
    & $NpmCmd install --no-fund --no-audit
    $corePackage = Join-Path $rootDir "packages\memory-core"
    $mcpPackage = Join-Path $rootDir "packages\memory-mcp"
    $cliPackage = Join-Path $rootDir "packages\memory-cli"
    & $NpmCmd install -g $corePackage $mcpPackage $cliPackage --no-fund --no-audit
}
finally {
    Pop-Location
}

$treePath = Join-Path $env:PARADIGM_MEMORY_DIR "memory\tree.json"
if (-not (Test-Path $treePath)) {
    Write-Info "Bootstrapping empty memory at $($env:PARADIGM_MEMORY_DIR) ..."
    node (Join-Path $rootDir "scripts\init-empty-memory.mjs")
}

$mcpServer = Join-Path $rootDir "packages\memory-mcp\src\server.mjs"
if (Get-Command claude -ErrorAction SilentlyContinue) {
    $mcpList = claude mcp list 2>$null
    if ($mcpList -match "(?m)^paradigm-memory:") {
        Write-Info "Claude Code MCP already registered."
    }
    else {
        Write-Info "Registering MCP with Claude Code user scope ..."
        claude mcp add --scope user paradigm-memory node $mcpServer
    }
}
else {
    Write-Info "Claude Code CLI not found on PATH. Manual registration command:"
    Write-Host "claude mcp add --scope user paradigm-memory node `"$mcpServer`""
}

Write-Info "CLI installed: paradigm"
Write-Info "Done. Restart your MCP client and ask it to use memory_search."
