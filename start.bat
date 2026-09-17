@echo off
title DMXI Startup
echo Starting DMXI servers...

:: Kill any stale processes on these ports
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":4000 " ^| findstr LISTENING') do taskkill /PID %%a /F >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5173 " ^| findstr LISTENING') do taskkill /PID %%a /F >nul 2>&1

timeout /t 1 /nobreak >nul

:: Start backend
start "DMXI Backend :4000" cmd /k "cd /d %~dp0server && npx tsx src/index.ts"

:: Give backend a moment to boot
timeout /t 3 /nobreak >nul

:: Start frontend
start "DMXI Frontend :5173" cmd /k "cd /d %~dp0client && npx vite"

timeout /t 5 /nobreak >nul

:: Open browser
start http://localhost:5173

echo.
echo Both servers started.
echo   Backend  ^> http://localhost:4000
echo   Frontend ^> http://localhost:5173
echo.
echo Close the two server windows to stop DMXI.
