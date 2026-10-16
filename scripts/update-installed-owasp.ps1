$installed = Join-Path $env:LOCALAPPDATA 'code-server\Data\extensions\project-eric.project-eric-owasp-0.1.0\package.json'
$source    = 'D:\webpage design\extensions\project-eric-owasp\package.json'

if (-not (Test-Path $installed)) {
    Write-Host "Installed package.json not found at $installed" -ForegroundColor Red
    exit 1
}
if (-not (Test-Path $source)) {
    Write-Host "Source package.json not found at $source" -ForegroundColor Red
    exit 1
}

# Copy our updated package.json over the installed one so code-server
# picks up the new walkthrough / viewsWelcome / activity bar config
# without a full re-package.
Copy-Item -Path $source -Destination $installed -Force
Write-Host "Copied $source -> $installed" -ForegroundColor Green
Write-Host ""
Write-Host "Quick check of new contributes keys:" -ForegroundColor Cyan
$j = Get-Content $installed -Raw | ConvertFrom-Json
$j.contributes.PSObject.Properties.Name | ForEach-Object { Write-Host "  $_" }
