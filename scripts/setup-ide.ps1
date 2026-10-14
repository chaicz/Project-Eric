# ============================================================
# setup-ide.ps1
#
# One-time setup for the Project Eric "Live IDE" workspace.
# Downloads the official code-server release from GitHub
# (coder/code-server), extracts it under C:\tools\code-server,
# creates a workspace folder, and writes a config file.
#
# Run from PowerShell (no admin required unless you want the
# binary on the system PATH):
#
#   cd "D:\webpage design"
#   powershell -ExecutionPolicy Bypass -File scripts\setup-ide.ps1
#
# Then start the server with:
#   scripts\start-ide.ps1
# ============================================================

$ErrorActionPreference = "Stop"
$ProgressPreference    = "SilentlyContinue"

# ---- Configuration ----------------------------------------------------------
$CodeServerVersion = "4.141.0"  # pin a known-good release
$InstallDir        = "C:\tools\code-server"
$WorkspaceDir      = "C:\Users\Public\project-eric-ide"
$ConfigDir         = Join-Path $env:USERPROFILE ".config\code-server"
$ConfigFile        = Join-Path $ConfigDir "config.yaml"
$LogDir            = Join-Path $InstallDir "logs"

# ---- Helpers ----------------------------------------------------------------
function Write-Step($msg) { Write-Host "`n▶ $msg" -ForegroundColor Cyan }
function Write-OK($msg)   { Write-Host "  ✓ $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "  ! $msg" -ForegroundColor Yellow }
function Write-Fail($msg) { Write-Host "  ✗ $msg" -ForegroundColor Red }

# ---- Step 1: Pre-flight -----------------------------------------------------
Write-Step "Pre-flight checks"

if (-not (Get-Command Invoke-WebRequest -ErrorAction SilentlyContinue)) {
    Write-Fail "Invoke-WebRequest is unavailable. Run on Windows PowerShell 5+ or PowerShell 7."
    exit 1
}
Write-OK "PowerShell ready"

# ---- Step 2: Download --------------------------------------------------------
$zipPath = Join-Path $env:TEMP "code-server-$CodeServerVersion-windows-amd64.tar.gz"
$url     = "https://github.com/coder/code-server/releases/download/v$CodeServerVersion/code-server-$CodeServerVersion-windows-amd64.tar.gz"

if (Test-Path (Join-Path $InstallDir "bin\code-server.exe")) {
    Write-OK "code-server already installed at $InstallDir"
} else {
    Write-Step "Downloading code-server v$CodeServerVersion"
    Write-Host "    URL: $url"
    try {
        Invoke-WebRequest -Uri $url -OutFile $zipPath -UseBasicParsing
    } catch {
        Write-Fail "Download failed: $($_.Exception.Message)"
        exit 1
    }
    Write-OK "Downloaded to $zipPath"

    # ---- Step 3: Extract ----------------------------------------------------
    Write-Step "Extracting to $InstallDir"
    if (-not (Test-Path $InstallDir)) { New-Item -ItemType Directory -Path $InstallDir | Out-Null }
    try {
        # Use tar.exe (built into Windows 10 1803+) for .tar.gz extraction
        $tarArgs = @('-xzf', "`"$zipPath`"", '-C', "`"$InstallDir`"", '--strip-components', '1')
        & tar.exe @tarArgs
        if ($LASTEXITCODE -ne 0) {
            throw "tar exited with code $LASTEXITCODE"
        }
    } catch {
        Write-Fail "Extraction failed: $($_.Exception.Message)"
        exit 1
    }
    Write-OK "Installed to $InstallDir"
}

# ---- Step 4: Create workspace -----------------------------------------------
Write-Step "Creating default workspace at $WorkspaceDir"
if (-not (Test-Path $WorkspaceDir)) { New-Item -ItemType Directory -Path $WorkspaceDir -Force | Out-Null }
$readme = Join-Path $WorkspaceDir "README.md"
if (-not (Test-Path $readme)) {
    @"
# Project Eric — Live IDE Workspace

This folder is opened by code-server when you click **Launch IDE** from
the Eric dashboard. Drop your repos, scripts, or notes here and they
show up in the IDE immediately.

## Suggested layout
- src/      — your code
- notes/    — meeting notes / research
- .eric/    — files Eric (the AI) writes back
"@ | Set-Content -Path $readme -Encoding UTF8
}
Write-OK "Workspace ready"

# ---- Step 5: Generate config.yaml -------------------------------------------
Write-Step "Writing $ConfigFile"
if (-not (Test-Path $ConfigDir)) { New-Item -ItemType Directory -Path $ConfigDir -Force | Out-Null }
@"
# Project Eric — code-server config
# Docs: https://github.com/coder/code-server/blob/main/docs/config.md
bind-addr: 127.0.0.1:8080
auth: none
cert: false
disable-telemetry: true
disable-update-check: true
log: $($LogDir -replace '\\','/')
"@ | Set-Content -Path $ConfigFile -Encoding UTF8
Write-OK "Config written"

# ---- Step 6: Build & install bundled Eric Collab extension ------------------
# Eric Collab is a custom VS Code extension that lives in
# extensions\eric-collab. It does real-time collaboration inside code-server
# using Yjs CRDTs + a public localtunnel so guests can join from anywhere with
# no account. The build emits a .vsix into extensions\eric-collab\dist\.
$extDir      = Join-Path $InstallDir "data\extensions"
$cs          = Join-Path $InstallDir "bin\code-server.cmd"
$repoRoot    = (Resolve-Path "$PSScriptRoot\..").Path
$ericCollab  = Join-Path $repoRoot "extensions\eric-collab"
$ericVsixDir = Join-Path $ericCollab "dist"

if (Test-Path (Join-Path $ericCollab "package.json")) {
    Write-Step "Building bundled Eric Collab extension"
    Push-Location $ericCollab
    try {
        if (-not (Test-Path (Join-Path $ericCollab "node_modules"))) {
            Write-Host "    Installing build dependencies (first run only)…"
            & npm install --no-audit --no-fund --silent 2>&1 | Out-Null
        }
        # Build + package into dist\eric-collab-<version>.vsix
        & node scripts\build.js 2>&1 | Out-Null
        if (Test-Path (Join-Path $ericCollab "out\extension.js")) {
            Write-OK "Eric Collab compiled"
        } else {
            Write-Warn "Eric Collab build did not produce out\extension.js (continuing)"
        }

        # Locate vsce (prefer the one we install on demand for packaging)
        $vsceBin = Join-Path $ericCollab "node_modules\.bin\vsce.cmd"
        if (-not (Test-Path $vsceBin)) {
            Write-Host "    Installing @vscode/vsce (one-time)…"
            & npm install --no-save @vscode/vsce --no-audit --no-fund 2>&1 | Out-Null
            $vsceBin = Join-Path $ericCollab "node_modules\.bin\vsce.cmd"
        }
        if (Test-Path $vsceBin) {
            & $vsceBin package --no-dependencies --out "$ericVsixDir" 2>&1 | Out-Null
        }

        $vsix = Get-ChildItem -Path $ericVsixDir -Filter "*.vsix" -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($vsix -and (Test-Path $cs)) {
            Write-Step "Installing Eric Collab into code-server"
            & $cs --install-extension $vsix.FullName 2>&1 | Out-Null
            Write-OK "Installed Eric Collab ($($vsix.Name))"
        } elseif ($vsix) {
            Write-OK "Built Eric Collab .vsix at $($vsix.FullName) — install it after starting code-server."
        } else {
            Write-Warn "Could not produce a .vsix; you can still install Eric Collab manually."
        }
    } catch {
        Write-Warn "Eric Collab build failed: $($_.Exception.Message)"
    } finally {
        Pop-Location
    }
} else {
    Write-Warn "extensions\eric-collab not found — skipping Eric Collab build"
}

# ---- Step 7: Pre-install CodeTogether / Live Share / Eclipse Java pack ------
# Eric Collab is the recommended option (above). The extensions here are
# fallbacks / alternatives for teams that already use them. They are pulled
# from the Open VSX marketplace that code-server uses by default.
$exts = @(
    @{ id = "genuitecllc.codetogether";          label = "CodeTogether (real-time rooms)" },
    @{ id = "ms-vsliveshare.vsliveshare";        label = "VS Live Share (Microsoft)" },
    @{ id = "vscjava.vscode-java-pack";          label = "Extension Pack for Java (Eclipse-equivalent)" },
    @{ id = "redhat.java";                        label = "Language Support for Java (Red Hat)" },
    @{ id = "vscjava.vscode-java-debug";          label = "Debugger for Java" },
    @{ id = "vscjava.vscode-maven";              label = "Maven for Java" },
    @{ id = "vscjava.vscode-java-test";          label = "Java Test Runner" },
    @{ id = "ms-python.python";                  label = "Python (ms-python)" }
)

if (Test-Path $cs) {
    Write-Step "Installing collaboration extensions from Open VSX"
    foreach ($ext in $exts) {
        Write-Host "    • $($ext.label)  ($($ext.id))"
        try {
            & $cs --install-extension $ext.id 2>&1 | Out-Null
            Write-OK  "Installed $($ext.label)"
        } catch {
            Write-Warn "Could not install $($ext.label) - you can install it manually inside the IDE (Ctrl+Shift+X)."
        }
    }
} else {
    Write-Warn "code-server binary not found at $cs - skipping extension install"
}

# ---- Step 7: Add to PATH for current user -----------------------------------
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
$binDir = Join-Path $InstallDir "bin"
if ($userPath -notlike "*$binDir*") {
    Write-Step "Adding $binDir to user PATH"
    [Environment]::SetEnvironmentVariable("Path", "$userPath;$binDir", "User")
    $env:Path += ";$binDir"
    Write-OK "PATH updated (restart terminal to use 'code-server' globally)"
}

# ---- Done -------------------------------------------------------------------
Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  code-server is installed!" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Next steps:" -ForegroundColor White
Write-Host "    1. Start the server:    scripts\start-ide.ps1"
Write-Host "    2. Open Eric → Tools → Live IDE"
Write-Host "    3. Click 'Launch IDE in new window'"
Write-Host "    4. Inside the IDE, start a real-time room. Recommended:"
Write-Host "         - Eric Collab  (project-eric.eric-collab  ·  bundled, internet invite links)"
Write-Host "       Alternatives:"
Write-Host "         - CodeTogether   (genuitecllc.codetogether)"
Write-Host "         - VS Live Share  (ms-vsliveshare.vsliveshare)"
Write-Host "    Eclipse-equivalent Java tooling is also pre-installed (Extension Pack for Java)."
Write-Host ""
Write-Host "  Server will run on:  http://localhost:8080" -ForegroundColor Yellow
Write-Host "  Workspace folder:    $WorkspaceDir" -ForegroundColor Yellow
Write-Host ""
