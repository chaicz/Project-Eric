# Clear code-server's extension manifest cache and workspace trust state,
# then bounce the project stack so the new OWASP contributes (viewsContainers,
# viewsWelcome, walkthroughs) are picked up.

$paths = @(
    (Join-Path $env:LOCALAPPDATA 'code-server\Data\extensions\extensions.json'),
    (Join-Path $env:APPDATA 'code-server\User\workspaceStorage'),
    (Join-Path $env:LOCALAPPDATA 'code-server\Data\CachedExtensions'),
    (Join-Path $env:LOCALAPPDATA 'code-server\Data\CachedData'),
    (Join-Path $env:LOCALAPPDATA 'code-server\Data\logs')
)

foreach ($p in $paths) {
    if (Test-Path $p) {
        Write-Host "Removing: $p"
        Remove-Item $p -Recurse -Force -ErrorAction SilentlyContinue
    } else {
        Write-Host "Skip (missing): $p" -ForegroundColor DarkGray
    }
}

# Also nuke the global state db that holds extension registry metadata.
$stateDb = Join-Path $env:LOCALAPPDATA 'code-server\Data\User\globalStorage\state.vscdb'
if (Test-Path $stateDb) {
    Write-Host "Removing: $stateDb"
    Remove-Item $stateDb -Recurse -Force -ErrorAction SilentlyContinue
}
