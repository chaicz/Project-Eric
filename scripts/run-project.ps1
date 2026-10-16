# ============================================================
# run-project.ps1
#
# Unified launcher for the full Project Eric dev stack:
#   1. Vite dev server  (http://127.0.0.1:5173)
#   2. code-server       (http://127.0.0.1:8080)
#   3. Yjs collab relay  (ws://127.0.0.1:1234, optional)
#
# Both run in detached background processes so the caller
# can keep using the terminal. Logs go under ./logs/.
#
#   powershell -ExecutionPolicy Bypass -File scripts\run-project.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\run-project.ps1 -Stop
#   powershell -ExecutionPolicy Bypass -File scripts\run-project.ps1 -Status
# ============================================================

param(
    [switch]$Stop,
    [switch]$Status,
    [switch]$NoYjs,
    [int]$VitePort   = 5173,
    [int]$CodePort   = 8080,
    [int]$YjsPort    = 1234
)

$ScriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$LogDir      = Join-Path $ProjectRoot 'logs'
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }

$ViteLog     = Join-Path $LogDir 'vite.log'
$YjsLog      = Join-Path $LogDir 'yjs.log'
$CodeLog     = Join-Path $LogDir 'code-server.log'
$LauncherLog = Join-Path $LogDir 'run-project.log'

# Where code-server keeps its config
$CodeUserSettingsDir = Join-Path $env:APPDATA 'code-server\User'
$CodeUserSettings    = Join-Path $CodeUserSettingsDir 'settings.json'
$CodeDataUserDir     = Join-Path $env:LOCALAPPDATA 'code-server\Data\User'
$CodeDataSettings    = Join-Path $CodeDataUserDir 'settings.json'

# ---- Helpers ----------------------------------------------------------------
function Write-Step($m) { Write-Host ("`n>> " + $m) -ForegroundColor Cyan }
function Write-OK($m)   { Write-Host ('   [OK] ' + $m) -ForegroundColor Green }
function Write-Warn($m) { Write-Host ('   [!]  ' + $m) -ForegroundColor Yellow }
function Write-Fail($m) { Write-Host ('   [X]  ' + $m) -ForegroundColor Red }

function Test-PortListening($port) {
    return $null -ne (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)
}

function Stop-ByPort($port, [string]$label) {
    $listeners = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
    if ($listeners) {
        foreach ($conn in $listeners) {
            $p = $conn.OwningProcess
            try { Stop-Process -Id $p -Force -ErrorAction Stop; Write-OK ("Stopped " + $label + " (PID " + $p + ")") }
            catch { Write-Warn ("Could not stop " + $label + " PID " + $p + " - " + $_.Exception.Message) }
        }
    } else {
        Write-Warn ($label + " is not running on port " + $port)
    }
}

# ---- Stop mode --------------------------------------------------------------
if ($Stop) {
    Write-Step "Stopping Project Eric dev stack"
    Stop-ByPort $VitePort 'Vite dev server'
    Stop-ByPort $CodePort 'code-server'
    if (-not $NoYjs) { Stop-ByPort $YjsPort 'Yjs collab relay' }
    # Also kill the Vite wrapper (npm.cmd spawns node) since it doesn't own the port itself.
    Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object {
        ($_.Path -like '*nodejs*' -and $_.StartTime -gt (Get-Date).AddHours(-2)) -or
        ($_.Path -like '*code-server*')
    } | ForEach-Object {
        try { Stop-Process -Id $_.Id -Force -ErrorAction Stop } catch { }
    }
    Write-OK 'All background processes stopped'
    exit 0
}

# ---- Status mode ------------------------------------------------------------
if ($Status) {
    Write-Step "Project Eric stack status"
    $vite   = Test-PortListening $VitePort
    $code   = Test-PortListening $CodePort
    $yjs    = if ($NoYjs) { $false } else { Test-PortListening $YjsPort }
    $fmt = { param($ok,$name,$url)
        if ($ok) { Write-Host ("   [OK]  " + $name.PadRight(22) + " " + $url) -ForegroundColor Green }
        else     { Write-Host ("   [off] " + $name.PadRight(22) + " (not running)") -ForegroundColor Yellow }
    }
    & $fmt $vite   'Vite dev server'   "http://127.0.0.1:$VitePort"
    & $fmt $code   'code-server'       "http://127.0.0.1:$CodePort"
    if (-not $NoYjs) { & $fmt $yjs 'Yjs collab relay' "ws://127.0.0.1:$YjsPort" }
    exit 0
}

# ---- Pre-flight -------------------------------------------------------------
if (-not (Test-Path (Join-Path $ProjectRoot 'package.json'))) {
    Write-Fail ("package.json not found at " + $ProjectRoot)
    exit 1
}
if (-not (Test-Path 'C:\tools\code-server\bin\code-server.cmd')) {
    Write-Warn 'code-server not installed. Run `npm run ide:setup` first; continuing anyway.'
}

# ---- Step 1: code-server User settings -----------------------------------
#
# Persist minimal user settings so the workbench boots cleanly every time
# (telemetry off, no restore-windows, no startup editor). We do NOT
# re-disable Live Share here anymore - the web variant of
# `ms-vsliveshare.vsliveshare` is required for collaboration, and the
# previous `liveshare.startFromActivityBar` error only affected the
# desktop variant. If you ever need to silence a specific extension
# error, prefer patching the .vsix itself over a global disable.
Write-Step "Writing code-server User settings"
$userSettings = @{
    'extensions.webWorker'                  = $true
    'telemetry.telemetryLevel'              = 'off'
    'update.showReleaseNotes'               = $false
    'update.enableWindowsBackgroundUpdates' = $false
    'workbench.startupEditor'               = 'none'
    'window.restoreWindows'                 = 'none'
}

# Some code-server builds only check LOCALAPPDATA, some also check APPDATA — write to both so the
# next launch (regardless of where it reads from) starts up clean.
$serialised = $userSettings | ConvertTo-Json -Depth 6
foreach ($dir in @($CodeUserSettingsDir, $CodeDataUserDir)) {
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    $target = Join-Path $dir 'settings.json'
    try {
        Set-Content -Path $target -Value $serialised -Encoding UTF8
        Write-OK ("Wrote " + $target)
    } catch {
        Write-Warn ("Could not write " + $target + " - " + $_.Exception.Message)
    }
}

# ---- Step 2: Vite dev server -----------------------------------------------
Write-Step "Starting Vite dev server on port $VitePort"
if (Test-PortListening $VitePort) {
    Write-Warn ("Port $VitePort is already in use — Vite likely already running")
} else {
    $viteArgs = @('/c', 'npm', 'run', 'dev', '--', '--port', "$VitePort", '--host', '127.0.0.1', '--strictPort')
    $viteProc = Start-Process `
        -FilePath 'cmd.exe' `
        -ArgumentList $viteArgs `
        -WorkingDirectory $ProjectRoot `
        -RedirectStandardOutput $ViteLog `
        -RedirectStandardError  ($ViteLog + '.err') `
        -WindowStyle Hidden `
        -PassThru
    Write-OK ("Vite launching (PID " + $viteProc.Id + ") -> " + $ViteLog)
}

# ---- Step 3: code-server ----------------------------------------------------
Write-Step "Starting code-server on port $CodePort"
if (Test-PortListening $CodePort) {
    Write-Warn ("Port $CodePort is already in use — code-server likely already running")
} else {
    $cs = Join-Path $ScriptDir 'start-ide.ps1'
    if (Test-Path $cs) {
        # start-ide.ps1 no longer accepts a -DisableExt parameter; the
        # web variant of Live Share is whitelisted on launch.
        $csCmd = 'powershell.exe -ExecutionPolicy Bypass -File "' + $cs + '" -Bind 127.0.0.1:' + $CodePort
        $csProc = Start-Process `
            -FilePath 'cmd.exe' `
            -ArgumentList '/c', $csCmd `
            -WorkingDirectory $ProjectRoot `
            -RedirectStandardOutput $CodeLog `
            -RedirectStandardError ($CodeLog + '.err') `
            -WindowStyle Hidden `
            -PassThru
        Write-OK ("code-server launcher invoked (PID " + $csProc.Id + ")")
    } else {
        Write-Fail ('start-ide.ps1 not found; cannot start code-server')
    }
}

# ---- Step 4: Yjs collab relay (optional) -----------------------------------
if (-not $NoYjs) {
    Write-Step "Starting Yjs collab relay on port $YjsPort"
    if (Test-PortListening $YjsPort) {
        Write-Warn ("Port $YjsPort is already in use — Yjs likely already running")
    } else {
        $yjs = Join-Path $ProjectRoot 'extensions\eric-collab\scripts\yjs-server.js'
        if (Test-Path $yjs) {
            $node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
            if (-not $node) { $node = 'C:\Program Files\nodejs\node.exe' }
            $env:PORT = "$YjsPort"
            $env:DATA_DIR = Join-Path $ProjectRoot '.yjs-data'
            if (-not (Test-Path $env:DATA_DIR)) { New-Item -ItemType Directory -Path $env:DATA_DIR -Force | Out-Null }
            $yjsCmd = '""' + $node + '" "' + $yjs + '""'
            $yjsProc = Start-Process `
                -FilePath 'cmd.exe' `
                -ArgumentList '/c', $yjsCmd `
                -WorkingDirectory $ProjectRoot `
                -RedirectStandardOutput $YjsLog `
                -RedirectStandardError ($YjsLog + '.err') `
                -WindowStyle Hidden `
                -PassThru
            Write-OK ("Yjs collab launching (PID " + $yjsProc.Id + ")")
        } else {
            Write-Warn ('yjs-server.js not found; skipping collab relay')
        }
    }
}

# ---- Wait + summary --------------------------------------------------------
Write-Step "Waiting for ports to open"
$deadline = (Get-Date).AddSeconds(20)
while ((Get-Date) -lt $deadline) {
    $viteOk = Test-PortListening $VitePort
    $codeOk = Test-PortListening $CodePort
    if ($viteOk -and $codeOk) { break }
    Start-Sleep -Milliseconds 500
}

Write-Host ''
Write-Step "Project Eric dev stack"
$fmt2 = { param($ok,$name,$url)
    if ($ok) { Write-Host ('   [OK]  ' + $name.PadRight(22) + ' ' + $url) -ForegroundColor Green }
    else     { Write-Host ('   [..]  ' + $name.PadRight(22) + ' starting...') -ForegroundColor Yellow }
}
& $fmt2 (Test-PortListening $VitePort) 'Vite dev server'   "http://127.0.0.1:$VitePort"
& $fmt2 (Test-PortListening $CodePort) 'code-server'       "http://127.0.0.1:$CodePort"
if (-not $NoYjs) { & $fmt2 (Test-PortListening $YjsPort) 'Yjs collab relay' "ws://127.0.0.1:$YjsPort" }
Write-Host ''
Write-Host '  Open the dashboard and navigate to Tools - Live IDE or OWASP Analysis.' -ForegroundColor White
Write-Host '  The OWASP scanner now runs inside the embedded code-server workbench.' -ForegroundColor White
Write-Host '  Stop everything: scripts\run-project.ps1 -Stop' -ForegroundColor DarkGray
