Get-Process -Name code-server -ErrorAction SilentlyContinue | ForEach-Object {
    Write-Host "PID: $($_.Id)"
    Write-Host "Path: $($_.Path)"
    Write-Host "CommandLine: $($_.CommandLine)"
    Write-Host "---"
}
Write-Host ""
Write-Host "Listening on 8080:"
Get-NetTCPConnection -State Listen -LocalPort 8080 -ErrorAction SilentlyContinue | ForEach-Object {
    $p = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue
    Write-Host "PID: $($_.OwningProcess) Path: $($p.Path)"
}
Write-Host ""
Write-Host "Looking for code-server.exe:"
Get-ChildItem 'C:\' -Recurse -Filter 'code-server.cmd' -ErrorAction SilentlyContinue | Select-Object FullName -First 5
