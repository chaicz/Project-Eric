# Disable all user-installed extensions except the Project Eric ones.
# Live Share is the one that throws "liveshare.startFromActivityBar not found",
# Live Server / Claude Code / Java pack are unused clutter for a security
# scanner workspace.

$dir = Join-Path $env:LOCALAPPDATA 'code-server\Data\extensions'
if (-not (Test-Path $dir)) {
    Write-Host "No user extensions dir at $dir" -ForegroundColor Yellow
    exit 0
}

# Extensions we WANT to keep (un-prefixed = unchanged).
$keep = @(
    'project-eric.project-eric-owasp-0.1.0',
    'project-eric.eric-collab-0.2.0'
)

# Already-disabled marker (e.g. kernlang.kern-mcp-security-1.0.0-universal.disabled).
$disabledMarker = '.disabled'

Get-ChildItem $dir -Directory | ForEach-Object {
    $name = $_.Name
    if ($name.EndsWith($disabledMarker)) {
        Write-Host "  [skip]  $name  (already disabled)" -ForegroundColor DarkGray
        return
    }
    if ($keep -contains $name) {
        Write-Host "  [keep]  $name" -ForegroundColor Green
        return
    }
    # Rename to add .disabled suffix - code-server treats this as installed-but-disabled.
    $newName = $name + $disabledMarker
    try {
        Rename-Item $_.FullName -NewName $newName -ErrorAction Stop
        Write-Host "  [OFF]   $name  ->  $newName" -ForegroundColor Yellow
    } catch {
        Write-Host "  [ERR]   $name  ->  $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "After cleanup:" -ForegroundColor Cyan
Get-ChildItem $dir -Directory | Select-Object -ExpandProperty Name
