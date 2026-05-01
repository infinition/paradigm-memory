# Paradigm Memory one-line installer for Windows PowerShell.
#
#   irm https://raw.githubusercontent.com/infinition/paradigm-memory/main/scripts/installer/install.ps1 | iex
#
# Installs the CLI/MCP bundle from GitHub Releases into:
#   %USERPROFILE%\.paradigm\app\current
# and creates command shims in:
#   %USERPROFILE%\.paradigm\bin

$ErrorActionPreference = "Stop"

$Repo = "infinition/paradigm-memory"
$Version = $env:PARADIGM_VERSION
$ParadigmHome = if ($env:PARADIGM_HOME) { $env:PARADIGM_HOME } else { Join-Path $env:USERPROFILE ".paradigm" }
$MemoryDir = if ($env:PARADIGM_MEMORY_DIR) { $env:PARADIGM_MEMORY_DIR } else { $ParadigmHome }
$AppDir = Join-Path $ParadigmHome "app\current"
$BinDir = Join-Path $ParadigmHome "bin"

function Say($msg) { Write-Host "[paradigm] $msg" -ForegroundColor Cyan }
function Fail($msg) { Write-Host "[paradigm] $msg" -ForegroundColor Red; exit 1 }

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Fail "Node 22+ is required. Install it from https://nodejs.org and re-run."
}
$nodeMajor = [int]((node --version).Trim().TrimStart("v").Split(".")[0])
if ($nodeMajor -lt 22) {
    Fail "Node $nodeMajor detected. Paradigm Memory needs Node 22+ for native SQLite."
}
if (-not (Get-Command tar -ErrorAction SilentlyContinue)) {
    Fail "tar.exe is required to extract the release archive. It is included with modern Windows."
}

$releaseApi = if ($Version) {
    "https://api.github.com/repos/$Repo/releases/tags/v$Version"
} else {
    "https://api.github.com/repos/$Repo/releases/latest"
}

Say "Resolving GitHub Release from $releaseApi ..."
$headers = @{ "User-Agent" = "paradigm-memory-installer" }
$release = Invoke-RestMethod -Uri $releaseApi -Headers $headers
$asset = $release.assets | Where-Object { $_.name -match '^paradigm-memory-cli-v.*-windows-x64\.tar\.gz$' } | Select-Object -First 1
if (-not $asset) {
    Fail "No Windows x64 CLI asset found in release $($release.tag_name)."
}

$tmp = Join-Path $env:TEMP ("paradigm-install-" + [guid]::NewGuid())
$archive = Join-Path $tmp $asset.name
New-Item -ItemType Directory -Force -Path $tmp, $AppDir, $BinDir, $MemoryDir | Out-Null
try {
    Say "Downloading $($asset.name) ..."
    Invoke-WebRequest -Uri $asset.browser_download_url -Headers $headers -OutFile $archive
    if (Test-Path $AppDir) { Remove-Item -Recurse -Force $AppDir }
    New-Item -ItemType Directory -Force -Path $AppDir | Out-Null
    tar -xzf $archive -C $AppDir
}
finally {
    if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
}

$paradigmCmd = Join-Path $BinDir "paradigm.cmd"
$mcpCmd = Join-Path $BinDir "paradigm-memory-mcp.cmd"
$httpCmd = Join-Path $BinDir "paradigm-memory-http.cmd"

Set-Content -Path $paradigmCmd -Encoding ASCII -Value "@echo off`r`nset `"PARADIGM_MEMORY_DIR=$MemoryDir`"`r`nnode `"$AppDir\packages\memory-cli\src\cli.mjs`" %*`r`n"
Set-Content -Path $mcpCmd -Encoding ASCII -Value "@echo off`r`nset `"PARADIGM_MEMORY_DIR=$MemoryDir`"`r`nnode `"$AppDir\packages\memory-mcp\src\server.mjs`" %*`r`n"
Set-Content -Path $httpCmd -Encoding ASCII -Value "@echo off`r`nset `"PARADIGM_MEMORY_DIR=$MemoryDir`"`r`nnode `"$AppDir\packages\memory-mcp\src\http-server.mjs`" %*`r`n"

$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if (-not (($userPath -split ';') -contains $BinDir)) {
    [Environment]::SetEnvironmentVariable("Path", (($userPath, $BinDir) -ne "" -join ";"), "User")
    $env:Path = "$env:Path;$BinDir"
    Say "Added $BinDir to your user PATH. Restart terminals that were already open."
}

function Register-With($client) {
    if (-not (Get-Command $client -ErrorAction SilentlyContinue)) { return }
    $server = Join-Path $AppDir "packages\memory-mcp\src\server.mjs"
    $list = & $client mcp list 2>$null
    if ($list -match "(?m)^paradigm-memory[: ]") {
        Say "${client}: paradigm-memory already registered."
        return
    }
    Say "Registering MCP with $client ..."
    & $client mcp add --scope user paradigm-memory node $server 2>$null
    if ($LASTEXITCODE -ne 0) {
        & $client mcp add paradigm-memory -- node $server 2>$null
    }
    if ($LASTEXITCODE -ne 0) {
        Say "$client mcp add failed - register manually with:"
        Say "  $client mcp add --scope user paradigm-memory node `"$server`""
    }
}
Register-With "claude"
Register-With "codex"
Register-With "gemini"

Say "Installed $($release.tag_name)."
Say "Memory dir: $MemoryDir"
Say "Try: paradigm version"
