# DMXI Deploy Script
# Run this when you're ready to push changes live to users
# Usage: .\deploy.ps1

Write-Host "Building client..." -ForegroundColor Cyan
Set-Location "$PSScriptRoot\client"
npm run build
if ($LASTEXITCODE -ne 0) { Write-Host "Build failed. Aborting." -ForegroundColor Red; exit 1 }

Write-Host "Restarting server..." -ForegroundColor Cyan
Set-Location $PSScriptRoot
pm2 restart dmxi-server

Write-Host ""
Write-Host "Deployed! Users are now on the new version." -ForegroundColor Green
Write-Host "  App: https://app.dmxiaccounting.com"
