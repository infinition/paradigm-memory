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
$DesktopDir = Join-Path $ParadigmHome "desktop\current"
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
$desktopAsset = $release.assets | Where-Object { $_.name -match '^paradigm-memory-desktop-v.*-windows-x64\.zip$' } | Select-Object -First 1

$tmp = Join-Path $env:TEMP ("paradigm-install-" + [guid]::NewGuid())
$archive = Join-Path $tmp $asset.name
New-Item -ItemType Directory -Force -Path $tmp, $AppDir, $DesktopDir, $BinDir, $MemoryDir | Out-Null
try {
    Say "Downloading $($asset.name) ..."
    Invoke-WebRequest -Uri $asset.browser_download_url -Headers $headers -OutFile $archive
    if (Test-Path $AppDir) { Remove-Item -Recurse -Force $AppDir }
    New-Item -ItemType Directory -Force -Path $AppDir | Out-Null
    tar -xzf $archive -C $AppDir
    if ($desktopAsset) {
        $desktopArchive = Join-Path $tmp $desktopAsset.name
        Say "Downloading $($desktopAsset.name) ..."
        Invoke-WebRequest -Uri $desktopAsset.browser_download_url -Headers $headers -OutFile $desktopArchive
        if (Test-Path $DesktopDir) { Remove-Item -Recurse -Force $DesktopDir }
        New-Item -ItemType Directory -Force -Path $DesktopDir | Out-Null
        Expand-Archive -Path $desktopArchive -DestinationPath $DesktopDir -Force
    }
    else {
        Say "No portable desktop asset found; CLI/MCP install will still work."
    }
}
finally {
    if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
}

$paradigmCmd = Join-Path $BinDir "paradigm.cmd"
$paradigmPs1 = Join-Path $BinDir "paradigm.ps1"
$paradigmMemoryCmd = Join-Path $BinDir "paradigm-memory.cmd"
$paradigmMemoryPs1 = Join-Path $BinDir "paradigm-memory.ps1"
$mcpCmd = Join-Path $BinDir "paradigm-memory-mcp.cmd"
$mcpPs1 = Join-Path $BinDir "paradigm-memory-mcp.ps1"
$httpCmd = Join-Path $BinDir "paradigm-memory-http.cmd"
$httpPs1 = Join-Path $BinDir "paradigm-memory-http.ps1"

$desktopExe = Join-Path $DesktopDir "paradigm-memory.exe"
Set-Content -Path $paradigmCmd -Encoding ASCII -Value "@echo off`r`nset `"PARADIGM_MEMORY_DIR=$MemoryDir`"`r`nset `"PARADIGM_DESKTOP_DIR=$DesktopDir`"`r`nif `"%~1`"==`"`" goto launch_desktop`r`nif /I `"%~1`"==`"app`" goto launch_desktop`r`nif /I `"%~1`"==`"memory`" goto launch_desktop`r`nif /I `"%~1`"==`"open`" goto launch_desktop`r`nif /I `"%~1`"==`"launch`" goto launch_desktop`r`ngoto cli`r`n:launch_desktop`r`nif exist `"$desktopExe`" (`r`n  start `"`" `"$desktopExe`"`r`n  exit /b 0`r`n)`r`n:cli`r`nnode `"$AppDir\packages\memory-cli\src\cli.mjs`" %*`r`n"
Set-Content -Path $paradigmMemoryCmd -Encoding ASCII -Value "@echo off`r`ncall `"$paradigmCmd`" app`r`n"
Set-Content -Path $mcpCmd -Encoding ASCII -Value "@echo off`r`nset `"PARADIGM_MEMORY_DIR=$MemoryDir`"`r`nnode `"$AppDir\packages\memory-mcp\src\server.mjs`" %*`r`n"
Set-Content -Path $httpCmd -Encoding ASCII -Value "@echo off`r`nset `"PARADIGM_MEMORY_DIR=$MemoryDir`"`r`nnode `"$AppDir\packages\memory-mcp\src\http-server.mjs`" %*`r`n"
Set-Content -Path $paradigmPs1 -Encoding ASCII -Value @"
`$env:PARADIGM_MEMORY_DIR = "$MemoryDir"
`$env:PARADIGM_DESKTOP_DIR = "$DesktopDir"
if (`$args.Count -eq 0 -or `$args[0] -in @("app", "memory", "open", "launch")) {
    if (Test-Path "$desktopExe") {
        Start-Process "$desktopExe"
        exit 0
    }
}
& node "$AppDir\packages\memory-cli\src\cli.mjs" @args
exit `$LASTEXITCODE
"@
Set-Content -Path $paradigmMemoryPs1 -Encoding ASCII -Value @"
& "$paradigmPs1" app
exit `$LASTEXITCODE
"@
Set-Content -Path $mcpPs1 -Encoding ASCII -Value @"
`$env:PARADIGM_MEMORY_DIR = "$MemoryDir"
& node "$AppDir\packages\memory-mcp\src\server.mjs" @args
exit `$LASTEXITCODE
"@
Set-Content -Path $httpPs1 -Encoding ASCII -Value @"
`$env:PARADIGM_MEMORY_DIR = "$MemoryDir"
& node "$AppDir\packages\memory-mcp\src\http-server.mjs" @args
exit `$LASTEXITCODE
"@

$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
$pathParts = @($userPath -split ';' | Where-Object { $_ -and $_ -ne $BinDir })
$newUserPath = (($BinDir) + $pathParts) -join ";"
if ($newUserPath -ne $userPath) {
    [Environment]::SetEnvironmentVariable("Path", $newUserPath, "User")
    $env:Path = (($BinDir) + @($env:Path -split ';' | Where-Object { $_ -and $_ -ne $BinDir })) -join ";"
    Say "Added $BinDir first in your user PATH. Restart terminals that were already open."
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
Say "Try: paradigm"
Say "CLI commands still work, for example: paradigm version"
