# Extensions that should NOT be loaded in code-server.
# Each row is the folder name under ...\code-server\Data\extensions.
$unwanted = @(
    # Live Share (causes `liveshare.startFromActivityBar not found` errors)
    'ms-vsliveshare.vsliveshare-1.1.122',
    # Old "MCP Security Scanner" - replaced by the in-code-server function
    'kernlang.kern-mcp-security-1.0.0-universal',
    # Live Server (not needed for security scanning)
    'ms-vscode.live-server-0.4.20-universal',
    # Claude Code (unrelated chat agent, not part of Project Eric)
    'saoudrizwan.claude-dev-4.1.24-universal',
    # Java tooling (unrelated to security scanning)
    'ms-python.debugpy-2026.6.0-win32-x64',
    'ms-python.python-2026.4.0-universal',
    'ms-python.vscode-python-envs-1.38.0-universal',
    'ms-python.vscode-python-envs-1.40.0-universal',
    'redhat.java-1.57.0-win32-x64',
    'vscjava.vscode-gradle-3.18.0-universal',
    'vscjava.vscode-java-debug-0.60.0-universal',
    'vscjava.vscode-java-dependency-0.27.6-universal',
    'vscjava.vscode-java-pack-0.31.2-universal',
    'vscjava.vscode-java-test-0.46.0-universal',
    'vscjava.vscode-java-test-0.47.0-universal',
    'vscjava.vscode-maven-0.45.3-universal'
)

$dir = Join-Path $env:LOCALAPPDATA 'code-server\Data\extensions'
foreach ($name in $unwanted) {
    $path = Join-Path $dir $name
    if (Test-Path $path) {
        Remove-Item $path -Recurse -Force
        Write-Host "  [DEL]   $name" -ForegroundColor Yellow
    } else {
        Write-Host "  [skip]  $name (not present)" -ForegroundColor DarkGray
    }
}

# Also clean up any leftover .disabled folders from the previous run.
Get-ChildItem $dir -Directory -Filter '*.disabled' -ErrorAction SilentlyContinue | ForEach-Object {
    Remove-Item $_.FullName -Recurse -Force
    Write-Host "  [DEL]   $($_.Name)  (.disabled cleanup)" -ForegroundColor Yellow
}

Write-Host ''
Write-Host 'Remaining extensions:' -ForegroundColor Cyan
Get-ChildItem $dir -Directory | Select-Object -ExpandProperty Name
