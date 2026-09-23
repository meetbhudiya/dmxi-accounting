@echo off
setlocal EnableDelayedExpansion
title DMXI - Build Desktop Release

echo.
echo  =============================================
echo   DMXI Accounting - Building Desktop Release
echo  =============================================
echo.

set ROOT=%~dp0
set RELEASE=%ROOT%release
set SERVER=%ROOT%server

:: ── 0. Bump version ───────────────────────────────────────────────────────────
echo [0/9] Bumping version number...
for /f "usebackq delims=" %%n in (`powershell -NoProfile -Command "(Get-Content '%ROOT%version.json' | ConvertFrom-Json).buildNumber"`) do set OLD_BUILD=%%n
set /a NEW_BUILD=%OLD_BUILD% + 1
for /f "usebackq delims=" %%d in (`powershell -NoProfile -Command "Get-Date -Format 'yyyy-MM-dd'"`) do set BUILD_DATE=%%d
powershell -NoProfile -Command "$v = Get-Content '%ROOT%version.json' | ConvertFrom-Json; $v.buildNumber = %NEW_BUILD%; $v.version = '1.0.%NEW_BUILD%'; $v.buildDate = '%BUILD_DATE%'; $v | ConvertTo-Json -Compress | Set-Content '%ROOT%version.json' -Encoding utf8"
echo     [OK] Version 1.0.%NEW_BUILD% (%BUILD_DATE%)

:: ── 1. Clean previous release ────────────────────────────────────────────────
echo [1/9] Cleaning previous release...
if exist "%RELEASE%" rmdir /s /q "%RELEASE%"
mkdir "%RELEASE%"
mkdir "%RELEASE%\public"

:: ── 2. Install dependencies ───────────────────────────────────────────────────
echo [2/9] Installing dependencies...
cd /d "%ROOT%"
call npm install
if %errorlevel% neq 0 ( echo ERROR: npm install failed & pause & exit /b 1 )

:: ── 3. Generate SQLite Prisma client ──────────────────────────────────────────
echo [3/9] Generating SQLite Prisma client...
cd /d "%SERVER%"
call npx prisma generate --schema=prisma/schema.desktop.prisma
if %errorlevel% neq 0 ( echo ERROR: Prisma generate failed & pause & exit /b 1 )

:: ── 4. Build + obfuscate the React client ─────────────────────────────────────
echo [4/9] Building React client...
cd /d "%ROOT%client"
call npm run build
if %errorlevel% neq 0 ( echo ERROR: Client build failed & pause & exit /b 1 )

:: ── 5. Copy client dist to release/public ─────────────────────────────────────
echo [5/9] Copying client files...
xcopy /s /e /y /q "%ROOT%client\dist\*" "%RELEASE%\public\" >nul
if %errorlevel% neq 0 ( echo ERROR: Failed to copy client files & pause & exit /b 1 )

:: ── 6. Build the server TypeScript ───────────────────────────────────────────
echo [6/9] Compiling server TypeScript...
cd /d "%SERVER%"
call npx tsc -p tsconfig.json
if %errorlevel% neq 0 ( echo ERROR: Server TypeScript build failed & pause & exit /b 1 )

:: ── 7. Obfuscate the server dist ─────────────────────────────────────────────
echo [7/9] Obfuscating server code...
call node scripts/obfuscate.js
if %errorlevel% neq 0 ( echo ERROR: Server obfuscation failed & pause & exit /b 1 )

:: ── 8. Package server into DMXI.exe ──────────────────────────────────────────
echo [8/9] Packaging into DMXI.exe (this may take a minute)...
call npx @yao-pkg/pkg dist/main.js --targets node18-win-x64 --output "%RELEASE%\DMXI.exe"
if %errorlevel% neq 0 ( echo ERROR: pkg packaging failed & pause & exit /b 1 )

:: ── 9. Copy runtime assets beside the exe ────────────────────────────────────
echo [9/9] Copying runtime assets...

:: SQLite Prisma engine (from desktop client output)
set ENGINE=%SERVER%\src\generated\desktop-client\query_engine-windows.dll.node
if not exist "%ENGINE%" set ENGINE=%ROOT%node_modules\.prisma\client\query_engine-windows.dll.node
if exist "%ENGINE%" (
    copy /y "%ENGINE%" "%RELEASE%\query_engine-windows.dll.node" >nul
    echo     [OK] Prisma query engine copied
) else (
    echo     [WARN] Prisma engine not found at %ENGINE%
)

:: .env with only JWT_SECRET (DATABASE_URL is set automatically to dmxi.db)
echo JWT_SECRET=%RANDOM%%RANDOM%%RANDOM%%RANDOM%%RANDOM%%RANDOM% > "%RELEASE%\.env"
echo PORT=4000 >> "%RELEASE%\.env"
echo     [OK] .env created with fresh JWT_SECRET

copy /y "%ROOT%version.json" "%RELEASE%\version.json" >nul
echo     [OK] version.json copied (v1.0.%NEW_BUILD%)

:: Restore the regular PostgreSQL Prisma client for dev
echo.
echo Restoring dev Prisma client (PostgreSQL)...
cd /d "%SERVER%"
call npx prisma generate --schema=prisma/schema.prisma
echo     [OK] Dev client restored

:: ── Done ─────────────────────────────────────────────────────────────────────
echo.
echo  =======================================================
echo   Desktop build complete!  v1.0.%NEW_BUILD% (%BUILD_DATE%)
echo   No PostgreSQL required - uses SQLite (dmxi.db)
echo   Browser opens automatically on first run
echo  =======================================================
echo.
dir /b "%RELEASE%"
echo.
echo  To distribute:
echo  1. Upload release\DMXI.exe to GitHub Releases
echo  2. Update dmxi-website\version.json with new version
echo  3. Run: wrangler deploy (in dmxi-website folder)
echo.
pause
