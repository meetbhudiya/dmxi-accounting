@echo off
title DMXI
cd /d %~dp0

:: Kill stale ports silently
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":4000 " ^| findstr LISTENING 2^>nul') do taskkill /PID %%a /F >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5173 " ^| findstr LISTENING 2^>nul') do taskkill /PID %%a /F >nul 2>&1

:: Start/restart PM2 apps (no terminal windows)
pm2 delete dmxi-server >nul 2>&1
pm2 delete dmxi-client >nul 2>&1
pm2 start ecosystem.config.js --silent

:: Wait for servers to boot, then open browser
timeout /t 6 /nobreak >nul
start http://localhost:5173
