# Paradigm Memory — local repair for installs damaged by the v0.1.0–v0.1.3 bugs.
#
#   Use case: you installed via the GitHub-Releases one-liner BEFORE v0.1.4 and
#   now `paradigm` is not on PATH and/or the desktop app says
#   "Boot error: write to mcp stdin (os error 232)" because the bundled
#   node_modules shipped empty.
#
# Run from this repo checkout:
#   powershell -ExecutionPolicy Bypass -File .\scripts\installer\repair.ps1
#
# What it does:
#   1. Copies the local node_modules into ~/.paradigm/app/current/node_modules
#      so the bundled MCP server can resolve its runtime deps (zod, etc).
#   2. Cleans up duplicated / fused entries in your User PATH that the old
#      install.ps1 created (e.g. `binC:\Users\…\.rustup\…`).
#   3. Re-prepends ~/.paradigm/bin so `paradigm`, `paradigm-memory-mcp`, …
#      resolve in any new terminal.
#
# This script does NOT touch your memory under ~/.paradigm/memory.

$ErrorActionPreference = "Stop"

$ParadigmHome = if ($env:PARADIGM_HOME) { $env:PARADIGM_HOME } else { Join-Path $env:USERPROFILE ".paradigm" }
$AppDir = Join-Path $ParadigmHome "app\current"
$BinDir = Join-Path $ParadigmHome "bin"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")

function Say($msg) { Write-Host "[paradigm-repair] $msg" -ForegroundColor Cyan }
function Warn($msg) { Write-Host "[paradigm-repair] $msg" -ForegroundColor Yellow }
function Fail($msg) { Write-Host "[paradigm-repair] $msg" -ForegroundColor Red; exit 1 }

# 1. node_modules ---------------------------------------------------------
$srcModules = Join-Path $RepoRoot "node_modules"
$dstModules = Join-Path $AppDir "node_modules"
if (-not (Test-Path $srcModules)) {
    Say "Local node_modules missing. Running 'npm install' in $RepoRoot ..."
    Push-Location $RepoRoot
    try { npm install --no-fund --no-audit | Out-Host } finally { Pop-Location }
}
if (-not (Test-Path $AppDir)) {
    Fail "$AppDir does not exist. Run the GitHub-Releases installer first, then re-run this repair."
}
Say "Refreshing $dstModules from $srcModules (this may take a minute) ..."
if (Test-Path $dstModules) { Remove-Item -Recurse -Force $dstModules }
Copy-Item -Recurse -Force -Path $srcModules -Destination $dstModules
Say "node_modules repaired."

# 2. PATH cleanup ---------------------------------------------------------
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
$rawParts = @($userPath -split ';')
$cleaned = @()
$fusedDetected = $false
foreach ($part in $rawParts) {
    if (-not $part) { continue }
    if ($part -eq $BinDir) { continue }
    if ($part.StartsWith($BinDir, [System.StringComparison]::OrdinalIgnoreCase) -and $part -ne $BinDir) {
        $tail = $part.Substring($BinDir.Length)
        if ($tail -and (Test-Path -IsValid $tail)) {
            $cleaned += $tail
            $fusedDetected = $true
        }
        continue
    }
    $cleaned += $part
}
$newUserPath = (@($BinDir) + $cleaned) -join ";"
if ($newUserPath -ne $userPath) {
    [Environment]::SetEnvironmentVariable("Path", $newUserPath, "User")
    if ($fusedDetected) { Warn "Detected and unfused duplicated 'bin' entries in your PATH." }
    Say "User PATH updated. Restart open terminals to see the change."
} else {
    Say "User PATH already in shape."
}

# Apply to the current session too so the next command works immediately.
$sessionParts = @($env:Path -split ';' | Where-Object { $_ -and $_ -ne $BinDir -and -not $_.StartsWith($BinDir, [System.StringComparison]::OrdinalIgnoreCase) })
$env:Path = (@($BinDir) + $sessionParts) -join ";"

# 3. Smoke test -----------------------------------------------------------
# Note: do NOT use `2>&1` here. On Windows PowerShell 5.1, redirecting a
# native command's stderr inside PowerShell wraps each line in an ErrorRecord
# (NativeCommandError) and sets $? to false even when the exe returned 0.
# We just call node directly and read $LASTEXITCODE.
Say "Smoke testing the bundled MCP ..."
$server = Join-Path $AppDir "packages\memory-mcp\src\server.mjs"
if (-not (Test-Path $server)) { Fail "Server entrypoint missing at $server. Re-run the installer." }
$nodeOut = & node $server --version
$nodeExit = $LASTEXITCODE
if ($nodeExit -eq 0) {
    Say "MCP responds: $nodeOut"
} else {
    Warn "MCP smoke test exited with code $nodeExit"
    Fail "Repair did not fully fix the install. Open an issue with the output above."
}

Say ""
Say "Done. Two next steps:"
Say "  1) The desktop app (paradigm-memory.exe) should now boot cleanly."
Say "  2) For 'paradigm' on the CLI in THIS shell, run the following one-liner"
Say "     (or just open a new terminal):"
Write-Host ""
Write-Host '     $env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User")' -ForegroundColor Yellow
Write-Host ""
Say "  Then: paradigm version"
