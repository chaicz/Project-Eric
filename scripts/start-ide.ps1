# ============================================================
# start-ide.ps1
#
# Starts code-server in the background. Logs go to
# C:\tools\code-server\logs\ and the process is detached
# from this terminal so you can keep using it.
#
#   powershell -ExecutionPolicy Bypass -File scripts\start-ide.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\start-ide.ps1 -Stop
#   powershell -ExecutionPolicy Bypass -File scripts\start-ide.ps1 -Status
#
# Per-account workbench
# ---------------------
# Passing -UserId starts a workbench that belongs to one Project Eric
# account. That instance gets:
#
#   - its own folder   <IDE root>\users\user-<id>
#   - its own state    <IDE root>\users\user-<id>\.code-server-data
#   - its own port     8090 + (id % 200)
#   - the shared extension folder, so the bundled Project Eric
#     extensions are always available.
#
# The port formula must stay in sync with `portForUser()` in
# scripts/dev-server-plugin.js.
#
#   powershell -ExecutionPolicy Bypass -File scripts\start-ide.ps1 -UserId 7
#   powershell -ExecutionPolicy Bypass -File scripts\start-ide.ps1 -UserId 7 -Stop
# ============================================================

param(
    [switch]$Stop,
    [switch]$Status,
    [string]$Bind = '',
    [int]$Port   = 0,
    [int]$UserId = 0
)

$InstallDir  = 'C:\tools\code-server'
$Binary      = Join-Path $InstallDir 'bin\code-server.exe'
$CmdWrapper  = Join-Path $InstallDir 'bin\code-server.cmd'
$LogDir      = Join-Path $InstallDir 'logs'
$LogFile     = Join-Path $LogDir 'code-server.log'
$WorkspaceRoot = 'C:\Users\Public\project-eric-ide'
$Workspace   = $WorkspaceRoot
$ProcessName = 'code-server'

# The shared extension folder. code-server keeps its installed
# extensions here, so a per-account instance still gets the bundled
# Project Eric OWASP and Eric Collab extensions.
$ExtensionsDir = Join-Path $env:LOCALAPPDATA 'code-server\Data\extensions'

# ---- Port allocation --------------------------------------------------------
# The default instance keeps 8080. Per-account instances start at 8090 so
# they never collide with it or with each other in normal use.
function Get-EricPort([int]$Id) {
    if ($Id -le 0) { return 8080 }
    return 8090 + ($Id % 200)
}

if ($Port -le 0) { $Port = Get-EricPort $UserId }
if (-not $Bind) { $Bind = "127.0.0.1:$Port" }

if ($UserId -gt 0) {
    $Workspace   = Join-Path $WorkspaceRoot ("users\user-$UserId")
    $LogFile     = Join-Path $LogDir ("code-server-user-$UserId.log")
    $UserDataDir = Join-Path $Workspace '.code-server-data'
}

# ---- Helpers ----------------------------------------------------------------
function Write-Step($m) { Write-Host ("`n>> " + $m) -ForegroundColor Cyan }
function Write-OK($m)   { Write-Host ('   [OK] ' + $m) -ForegroundColor Green }
function Write-Warn($m) { Write-Host ('   [!]  ' + $m) -ForegroundColor Yellow }
function Write-Fail($m) { Write-Host ('   [X]  ' + $m) -ForegroundColor Red }

# ---- Stop mode --------------------------------------------------------------
if ($Stop) {
    Write-Step "Stopping code-server"
    $stopped = @()

    # 1. Whatever owns the listening socket on the code-server port. This is
    #    the most reliable handle — on Windows code-server runs as `node.exe`,
    #    so a process-name filter alone never matches.
    $listeners = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
    foreach ($conn in $listeners) {
        $pidVal = $conn.OwningProcess
        if (-not $pidVal) { continue }
        try {
            Stop-Process -Id $pidVal -Force -ErrorAction Stop
            $stopped += $pidVal
        } catch {
            Write-Warn ("Could not stop PID " + $pidVal + " - " + $_.Exception.Message)
        }
    }

    # 2. Any node process started from the code-server install directory.
    #    The executable is node, so the install path in the command line is
    #    the only reliable marker.
    #
    #    This is skipped for a per-account stop (-UserId): the process
    #    filter cannot tell one account's instance from another's, and
    #    stopping one account must never take the others down with it.
    if ($UserId -le 0) {
        Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
            Where-Object { $_.CommandLine -like "*$InstallDir*" } |
            ForEach-Object {
                try {
                    Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop
                    $stopped += $_.ProcessId
                } catch { }
            }
    }

    # 3. A native `code-server` binary (the Linux/macOS process name).
    if ($UserId -le 0) {
        Get-Process -Name 'code-server' -ErrorAction SilentlyContinue | ForEach-Object {
            try {
                Stop-Process -Id $_.Id -Force -ErrorAction Stop
                $stopped += $_.Id
            } catch { }
        }
    }

    if ($stopped.Count -gt 0) {
        Write-OK ("Stopped " + $stopped.Count + " process(es)")
    } else {
        Write-Warn 'code-server is not running'
    }

    # Wait for the socket to be released. Without this a follow-up start
    # sees a lingering listener and refuses to bind.
    $deadline = (Get-Date).AddSeconds(15)
    while ((Get-Date) -lt $deadline) {
        $stillListening = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
        if (-not $stillListening) {
            Write-OK ("Port " + $Port + " released")
            break
        }
        Start-Sleep -Milliseconds 250
    }
    exit 0
}

# ---- Status mode ------------------------------------------------------------
if ($Status) {
    $listen = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
    if ($listen) {
        $pidVal = $listen[0].OwningProcess
        Write-Host ('code-server is RUNNING (PID: ' + $pidVal + ', port ' + $Port + ')') -ForegroundColor Green
        Write-Host ('  URL: http://' + $Bind)
        if ($UserId -gt 0) { Write-Host ('  Account: user-' + $UserId) -ForegroundColor DarkGray }
    } else {
        Write-Host 'code-server is NOT running' -ForegroundColor Yellow
    }
    exit 0
}

# ---- Pre-flight -------------------------------------------------------------
if (-not (Test-Path $CmdWrapper) -and -not (Test-Path $Binary)) {
    Write-Fail 'code-server not installed. Run scripts\setup-ide.ps1 first.'
    exit 1
}
if (-not (Test-Path $LogDir))    { New-Item -ItemType Directory -Path $LogDir    -Force | Out-Null }
if (-not (Test-Path $Workspace)) { New-Item -ItemType Directory -Path $Workspace -Force | Out-Null }

# ---- Already running? -------------------------------------------------------
# A listener on the port is not enough to conclude "code-server is up" — a
# process that was just killed can hold the socket for a moment, and a
# foreign app may own the port entirely. Only bail out when we can actually
# see a live code-server process behind the listener.
$existing = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
if ($existing) {
    $live = Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -like "*$InstallDir*" }
    if ($UserId -gt 0) {
        # For a per-account instance the port must be held by *this*
        # account's workbench. Another account's instance owns a
        # different port, so it must not be mistaken for ours. The
        # bind address is the reliable marker — the workspace path is
        # not part of the command line.
        $live = $live | Where-Object { $_.CommandLine -match "--bind-addr\s+127\.0\.0\.1:$Port\b" }
    }
    if ($live) {
        Write-Warn ("Port " + $Port + " is already in use by code-server — nothing to do.")
        Write-Host ('  URL: http://' + $Bind) -ForegroundColor Yellow
        exit 0
    }
    Write-Warn ("Port " + $Port + " is in use by another process — attempting to start anyway.")
}

# ---- Start ------------------------------------------------------------------
Write-Step ("Starting code-server on " + $Bind)
$argList = @(
    '--bind-addr', $Bind,
    '--auth', 'none',
    '--disable-telemetry',
    '--disable-update-check'
)

# Belt + suspenders: pass --extensions-dir and --user-data-dir so we control
# exactly which extensions are loaded. The `ms-vsliveshare.vsliveshare` web
# variant is required for real-time collaboration (Live Share) and ships
# with code-server; the previous `--disable-extension` hack is no longer
# needed because the web variant does not register the
# `liveshare.startFromActivityBar` activity-bar command.

# A per-account instance gets its own folder and its own editor state, so
# two accounts never share files, settings or history. The extension
# folder stays shared — the bundled Project Eric extensions must be
# available in every account's workbench.
#
# The folder is passed as a POSITIONAL argument, not as `--folder`:
# code-server 4.x has no `--folder` option and rejects it outright
# ("error Unknown option --folder"). A positional path becomes the
# account's default workspace, and the `?folder=` query parameter the
# dashboard appends points at the same place.
if ($UserId -gt 0) {
    if (-not (Test-Path $UserDataDir)) {
        New-Item -ItemType Directory -Path $UserDataDir -Force | Out-Null
    }

    # Seed the account's VS Code settings so the workbench starts the
    # same way the shared instance does (no startup editor, no telemetry,
    # no restored windows). Without this a fresh user-data-dir would
    # reopen whatever the account had open last time.
    $userSettingsPath = Join-Path $UserDataDir 'User\settings.json'
    if (-not (Test-Path $userSettingsPath)) {
        $userSettings = [ordered]@{
            'extensions.webWorker'                  = $true
            'telemetry.telemetryLevel'              = 'off'
            'update.showReleaseNotes'               = $false
            'update.enableWindowsBackgroundUpdates' = $false
            'workbench.startupEditor'               = 'none'
            'window.restoreWindows'                 = 'none'
        }
        try {
            New-Item -ItemType Directory -Path (Split-Path -Parent $userSettingsPath) -Force | Out-Null
            Set-Content -Path $userSettingsPath -Value ($userSettings | ConvertTo-Json -Depth 6) -Encoding UTF8
        } catch {
            Write-Warn ("Could not write " + $userSettingsPath + " - " + $_.Exception.Message)
        }
    }

    $argList += '--user-data-dir', $UserDataDir
    if (Test-Path $ExtensionsDir) {
        $argList += '--extensions-dir', $ExtensionsDir
    }
    # Positional argument: the account's workspace folder.
    $argList += $Workspace
    Write-Host ('   Account workspace: ' + $Workspace) -ForegroundColor DarkGray
}

$launcher = $CmdWrapper
if (-not (Test-Path $launcher)) { $launcher = $Binary }

$startProc = Start-Process `
    -FilePath $launcher `
    -ArgumentList $argList `
    -WorkingDirectory $Workspace `
    -RedirectStandardOutput $LogFile `
    -RedirectStandardError  ($LogFile + '.err') `
    -WindowStyle Hidden `
    -PassThru

Start-Sleep -Seconds 2

# ---- Verify -----------------------------------------------------------------
$running = Get-Process -Id $startProc.Id -ErrorAction SilentlyContinue
if ($running) {
    Write-OK ("Started (PID: " + $running.Id + ")")
    Write-OK ("Logs:   " + $LogFile)
    Write-Host ''
    Write-Host '  code-server is live at:' -ForegroundColor Cyan
    Write-Host ('    http://' + $Bind) -ForegroundColor White
    Write-Host ''
    Write-Host '  Open the Eric dashboard - Tools - Live IDE -' -ForegroundColor White
    Write-Host '  click Launch IDE in new window.' -ForegroundColor White
    Write-Host ''
    if ($UserId -gt 0) {
        Write-Host ('  To stop: scripts\start-ide.ps1 -UserId ' + $UserId + ' -Stop') -ForegroundColor DarkGray
    } else {
        Write-Host '  To stop: scripts\start-ide.ps1 -Stop' -ForegroundColor DarkGray
    }
} else {
    Write-Fail ("code-server failed to start. Check " + $LogFile)
    exit 1
}
