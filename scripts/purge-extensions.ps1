# Drop the extensions this project does not use.
#
# The old version of this script deleted extension folders with
# `Remove-Item`, which left `extensions.json` pointing at folders that no
# longer existed. VS Code then marked those entries invalid and showed the
# "Invalid extensions detected. Review them." banner.
#
# Uninstalling through the code-server CLI removes the folder and the
# registry entry together, so the two can never drift apart again.
#
#   powershell -ExecutionPolicy Bypass -File scripts\purge-extensions.ps1

$ErrorActionPreference = 'Continue'

# Extensions that should NOT be loaded in code-server.
$unwanted = @(
    # Live Share (causes `liveshare.startFromActivityBar not found` errors)
    'ms-vsliveshare.vsliveshare',
    # Old "MCP Security Scanner" - replaced by the in-code-server function
    'kernlang.kern-mcp-security',
    # Live Server (not needed for security scanning)
    'ms-vscode.live-server',
    # Claude Code (unrelated chat agent, not part of Project Eric)
    'saoudrizwan.claude-dev',
    # CodeTogether (we ship Eric Collab instead)
    'genuitecllc.codetogether',
    # Jupyter Live Share (not used by this workspace)
    'seolmuah.jupyter-live-share',
    # Cline (standalone AI agent, not part of Project Eric)
    'saoudrizwan.cline'
)

$cs = 'C:\tools\code-server\bin\code-server.cmd'
if (-not (Test-Path $cs)) {
    Write-Host "code-server CLI not found at $cs" -ForegroundColor Red
    exit 1
}

$installed = & $cs --list-extensions 2>$null | Where-Object { $_ -match '\.' }

foreach ($id in $installed) {
    if ($unwanted -contains $id) {
        & $cs --uninstall-extension $id 2>$null | Out-Null
        Write-Host "  [DEL]  $id" -ForegroundColor Yellow
    }
}

Write-Host ''
Write-Host 'Remaining extensions:' -ForegroundColor Cyan
& $cs --list-extensions 2>$null | Where-Object { $_ -match '\.' }
