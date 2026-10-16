Write-Host "cs exists: $(Test-Path 'C:\tools\code-server\bin\code-server.exe')"
Write-Host "extensions dir exists: $(Test-Path 'C:\tools\code-server\extensions')"
Write-Host "user data dir exists: $(Test-Path (Join-Path $env:LOCALAPPDATA 'code-server\Data\extensions'))"
Write-Host ""
Write-Host "Built-in extensions:"
if (Test-Path 'C:\tools\code-server\extensions') {
    Get-ChildItem 'C:\tools\code-server\extensions' -Directory | Select-Object -ExpandProperty Name
}
Write-Host ""
Write-Host "User extensions:"
if (Test-Path (Join-Path $env:LOCALAPPDATA 'code-server\Data\extensions')) {
    Get-ChildItem (Join-Path $env:LOCALAPPDATA 'code-server\Data\extensions') -Directory | Select-Object -ExpandProperty Name
}
Write-Host ""
Write-Host "code-server list-extensions:"
& 'C:\tools\code-server\bin\code-server.exe' --list-extensions 2>&1
