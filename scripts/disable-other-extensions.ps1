# Remove every user extension except the Project Eric ones.
#
# Why this uses `code-server --uninstall-extension` and not `Remove-Item`
# -----------------------------------------------------------------------
# An earlier version of this script renamed extension folders to
# `*.disabled`. That does NOT disable anything: the extension scanner
# still reads every folder under ...\code-server\Data\extensions and reads
# its package.json, so the renamed folder was still picked up under the
# original id - and the `extensions.json` registry kept pointing at the
# old folder name. The result was the yellow "Invalid extensions
# detected. Review them." banner plus a list of extensions that appeared
# to be missing.
#
# Uninstalling through the CLI removes the folder *and* updates the
# registry, so both stay consistent.
#
#   powershell -ExecutionPolicy Bypass -File scripts\disable-other-extensions.ps1

$ErrorActionPreference = 'Continue'

$cs = 'C:\tools\code-server\bin\code-server.cmd'
$dir = Join-Path $env:LOCALAPPDATA 'code-server\Data\extensions'

if (-not (Test-Path $dir)) {
    Write-Host "No user extensions dir at $dir" -ForegroundColor Yellow
    exit 0
}
if (-not (Test-Path $cs)) {
    Write-Host "code-server CLI not found at $cs" -ForegroundColor Red
    exit 1
}

# Extensions we WANT to keep (the Project Eric ones).
$keep = @(
    'project-eric.project-eric-owasp',
    'project-eric.eric-collab'
)

$installed = & $cs --list-extensions 2>$null | Where-Object { $_ -match '\.' }

Write-Host "Installed extensions:" -ForegroundColor Cyan
foreach ($id in $installed) {
    if ($keep -contains $id) {
        Write-Host "  [keep] $id" -ForegroundColor Green
        continue
    }
    & $cs --uninstall-extension $id 2>$null | Out-Null
    Write-Host "  [OFF]  $id" -ForegroundColor Yellow
}

Write-Host ''
Write-Host 'Remaining extensions:' -ForegroundColor Cyan
& $cs --list-extensions 2>$null | Where-Object { $_ -match '\.' }

Write-Host ''
Write-Host 'Registry entries on disk:' -ForegroundColor Cyan
Get-ChildItem $dir -Directory -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name
