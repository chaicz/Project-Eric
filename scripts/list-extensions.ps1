$cs = 'C:\tools\code-server\bin\code-server.cmd'

Write-Host "cs exists: $(Test-Path $cs)"
Write-Host "extensions dir exists: $(Test-Path 'C:\tools\code-server\extensions')"
Write-Host "user data dir exists: $(Test-Path (Join-Path $env:LOCALAPPDATA 'code-server\Data\extensions'))"
Write-Host ""
Write-Host "Built-in extensions:"
if (Test-Path 'C:\tools\code-server\extensions') {
    Get-ChildItem 'C:\tools\code-server\extensions' -Directory | Select-Object -ExpandProperty Name
}
Write-Host ""
Write-Host "User extensions (folders on disk):"
if (Test-Path (Join-Path $env:LOCALAPPDATA 'code-server\Data\extensions')) {
    Get-ChildItem (Join-Path $env:LOCALAPPDATA 'code-server\Data\extensions') -Directory | Select-Object -ExpandProperty Name
}
Write-Host ""
Write-Host "code-server list-extensions:"
& $cs --list-extensions 2>&1 | Where-Object { $_ -notmatch 'Deprecation|trace-deprecation|CategoryInfo|FullyQualified|^\s*\+|^At ' }
Write-Host ""
Write-Host "Registry entries:"
$reg = Join-Path $env:LOCALAPPDATA 'code-server\Data\extensions\extensions.json'
if (Test-Path $reg) {
    (Get-Content $reg -Raw | ConvertFrom-Json) | ForEach-Object {
        "  {0}@{1} -> {2}" -f $_.identifier.id, $_.version, $_.relativeLocation
    }
}
