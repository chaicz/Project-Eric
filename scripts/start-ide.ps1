# ============================================================
# start-ide.ps1
#
# Starts code-server in the background. Logs go to
# C:\tools\code-server\logs\ and the process is detached
# from this terminal so you can keep using it.
#
#   powershell -ExecutionPolicy Bypass -File scripts\start-ide.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\start-ide.ps1 -Stop
# ============================================================

param(
    [switch]$Stop,
    [switch]$Status,
    [string]$Bind = "127.0.0.1:8080",
    [int]$Port   = 8080
)

$InstallDir  = "C:\tools\code-server"
$Binary      = Join-Path $InstallDir "bin\code-server.exe"
$LogDir      = Join-Path $InstallDir "logs"
$LogFile     = Join-Path $LogDir "code-server.log"
$Workspace   = "C:\Users\Public\project-eric-ide"
$ProcessName = "code-server"

# ---- Helpers ----------------------------------------------------------------
function Write-Step($m){ Write-Host "`n▶ $m" -ForegroundColor Cyan }
function Write-OK($m)  { Write-Host "  ✓ $m" -ForegroundColor Green }
function Write-Warn($m){ Write-Host "  ! $m" -ForegroundColor Yellow }
function Write-Fail($m){ Write-Host "  ✗ $m" -ForegroundColor Red }

# ---- Stop mode --------------------------------------------------------------
if ($Stop) {
    Write-Step "Stopping code-server"
    $procs = Get-Process -Name $ProcessName -ErrorAction SilentlyContinue
    if ($procs) {
        $procs | Stop-Process -Force
        Write-OK "Stopped $($procs.Count) process(es)"
    } else {
        Write-Warn "code-server is not running"
    }
    exit 0
}

# ---- Status mode ------------------------------------------------------------
if ($Status) {
    $procs = Get-Process -Name $ProcessName -ErrorAction SilentlyContinue
    if ($procs) {
        Write-Host "code-server is RUNNING (PID: $($procs[0].Id))" -ForegroundColor Green
        Write-Host "  URL: http://$Bind"
    } else {
        Write-Host "code-server is NOT running" -ForegroundColor Yellow
    }
    exit 0
}

# ---- Pre-flight -------------------------------------------------------------
if (-not (Test-Path $Binary)) {
    Write-Fail "code-server not installed. Run scripts\setup-ide.ps1 first."
    exit 1
}
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }
if (-not (Test-Path $Workspace)) { New-Item -ItemType Directory -Path $Workspace -Force | Out-Null }

# ---- Already running? -------------------------------------------------------
$existing = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
if ($existing) {
    Write-Warn "Port $Port is already in use. code-server is likely already running."
    Write-Host "  URL: http://$Bind" -ForegroundColor Yellow
    exit 0
}

# ---- Start ------------------------------------------------------------------
Write-Step "Starting code-server on $Bind"
$argList = @(
    "--bind-addr", $Bind,
    "--auth", "none",
    "--disable-telemetry",
    "--disable-update-check"
) -join ' '

$startProc = Start-Process `
    -FilePath $Binary `
    -ArgumentList $argList `
    -WorkingDirectory $Workspace `
    -RedirectStandardOutput $LogFile `
    -RedirectStandardError  "$LogFile.err" `
    -WindowStyle Hidden `
    -PassThru

Start-Sleep -Seconds 2

# ---- Verify -----------------------------------------------------------------
$running = Get-Process -Id $startProc.Id -ErrorAction SilentlyContinue
if ($running) {
    Write-OK "Started (PID: $($running.Id))"
    Write-OK "Logs:   $LogFile"
    Write-Host ""
    Write-Host "  code-server is live at:" -ForegroundColor Cyan
    Write-Host "    http://$Bind" -ForegroundColor White
    Write-Host ""
    Write-Host "  Open the Eric dashboard → Tools → Live IDE →" -ForegroundColor White
    Write-Host "  click 'Launch IDE in new window'." -ForegroundColor White
    Write-Host ""
    Write-Host "  Inside the IDE, start a real-time room. Recommended:" -ForegroundColor White
    Write-Host "    - Eric Collab   (project-eric.eric-collab  - bundled, internet invite links)" -ForegroundColor DarkGray
    Write-Host "  Alternatives:" -ForegroundColor White
    Write-Host "    - CodeTogether   (genuitecllc.codetogether)" -ForegroundColor DarkGray
    Write-Host "    - VS Live Share  (ms-vsliveshare.vsliveshare)" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "  To stop: scripts\start-ide.ps1 -Stop" -ForegroundColor DarkGray
} else {
    Write-Fail "code-server failed to start. Check $LogFile"
    exit 1
}