@echo off
title DMXI Auto-Start Setup
cd /d %~dp0

echo ============================================
echo  DMXI Background Service Installer
echo ============================================
echo.

:: Kill stale ports
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":4000 " ^| findstr LISTENING 2^>nul') do taskkill /PID %%a /F >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5173 " ^| findstr LISTENING 2^>nul') do taskkill /PID %%a /F >nul 2>&1

echo [1/4] Starting background servers with PM2...
pm2 delete dmxi-server >nul 2>&1
pm2 delete dmxi-client >nul 2>&1
pm2 start ecosystem.config.js

echo.
echo [2/4] Saving process list...
pm2 save --force

echo.
echo [3/4] Registering Windows auto-start (silent, no window)...
pm2-startup install

echo.
echo [4/4] Opening browser...
timeout /t 6 /nobreak >nul
start http://localhost:5173

echo.
echo ============================================
echo  Done!
echo.
echo  DMXI will now auto-start silently every
echo  time you log in to Windows. No windows,
echo  no taskbar icons -- it just runs.
echo.
echo  Backend   ^>  http://localhost:4000
echo  Frontend  ^>  http://localhost:5173
echo.
echo  Useful commands:
echo    pm2 status        -- check if running
echo    pm2 logs          -- view live logs
echo    pm2 stop all      -- stop both servers
echo    pm2 restart all   -- restart both
echo    pm2-startup uninstall -- remove auto-start
echo ============================================
pause
