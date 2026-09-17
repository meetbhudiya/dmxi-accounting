@echo off
setlocal EnableDelayedExpansion
title DMXI - Build Release (Protected)

echo.
echo  =============================================
echo   DMXI Accounting - Building Protected Release
echo  =============================================
echo.

set ROOT=%~dp0
set RELEASE=%ROOT%release

:: ── 0. Bump version ───────────────────────────────────────────────────────────
echo [0/8] Bumping version number...
for /f "usebackq delims=" %%n in (`powershell -NoProfile -Command "(Get-Content '%ROOT%version.json' | ConvertFrom-Json).buildNumber"`) do set OLD_BUILD=%%n
set /a NEW_BUILD=%OLD_BUILD% + 1
for /f "usebackq delims=" %%d in (`powershell -NoProfile -Command "Get-Date -Format 'yyyy-MM-dd'"`) do set BUILD_DATE=%%d
powershell -NoProfile -Command "$v = Get-Content '%ROOT%version.json' | ConvertFrom-Json; $v.buildNumber = %NEW_BUILD%; $v.version = '1.0.%NEW_BUILD%'; $v.buildDate = '%BUILD_DATE%'; $v | ConvertTo-Json -Compress | Set-Content '%ROOT%version.json' -Encoding utf8"
echo     [OK] Version 1.0.%NEW_BUILD% (%BUILD_DATE%)

:: ── 1. Clean previous release ────────────────────────────────────────────────
echo [1/8] Cleaning previous release...
if exist "%RELEASE%" rmdir /s /q "%RELEASE%"
mkdir "%RELEASE%"
mkdir "%RELEASE%\public"

:: ── 2. Install dependencies ───────────────────────────────────────────────────
echo [2/8] Installing dependencies...
cd /d "%ROOT%"
call npm install
if %errorlevel% neq 0 ( echo ERROR: npm install failed & pause & exit /b 1 )

:: ── 3. Build + obfuscate the React client ─────────────────────────────────────
echo [3/8] Building and obfuscating React client...
cd /d "%ROOT%client"
call npm run build
if %errorlevel% neq 0 ( echo ERROR: Client build failed & pause & exit /b 1 )

:: ── 4. Copy client dist to release/public ─────────────────────────────────────
echo [4/8] Copying client files...
xcopy /s /e /y /q "%ROOT%client\dist\*" "%RELEASE%\public\" >nul
if %errorlevel% neq 0 ( echo ERROR: Failed to copy client files & pause & exit /b 1 )

:: ── 5. Build the server TypeScript ───────────────────────────────────────────
echo [5/8] Compiling server TypeScript...
cd /d "%ROOT%server"
call npx tsc -p tsconfig.json
if %errorlevel% neq 0 ( echo ERROR: Server TypeScript build failed & pause & exit /b 1 )

:: ── 6. Obfuscate the server dist ─────────────────────────────────────────────
echo [6/8] Obfuscating server code...
call node scripts/obfuscate.js
if %errorlevel% neq 0 ( echo ERROR: Server obfuscation failed & pause & exit /b 1 )

:: ── 7. Package server into DMXI.exe ──────────────────────────────────────────
echo [7/8] Packaging into DMXI.exe (this may take a minute)...
call npx @yao-pkg/pkg dist/main.js --targets node18-win-x64 --output "%RELEASE%\DMXI.exe"
if %errorlevel% neq 0 ( echo ERROR: pkg packaging failed & pause & exit /b 1 )

:: ── 8. Copy runtime assets beside the exe ────────────────────────────────────
echo [8/8] Copying runtime assets...

set ENGINE=%ROOT%node_modules\.prisma\client\query_engine-windows.dll.node
if exist "%ENGINE%" (
    copy /y "%ENGINE%" "%RELEASE%\query_engine-windows.dll.node" >nul
    echo     [OK] Prisma query engine copied
) else (
    echo     [WARN] Prisma engine not found - run prisma:generate first
)

if exist "%ROOT%server\.env" (
    copy /y "%ROOT%server\.env" "%RELEASE%\.env" >nul
    echo     [OK] .env copied
)

copy /y "%ROOT%version.json" "%RELEASE%\version.json" >nul
echo     [OK] version.json copied (v1.0.%NEW_BUILD%)

:: ── Done ─────────────────────────────────────────────────────────────────────
echo.
echo  =======================================================
echo   Protected build complete!  v1.0.%NEW_BUILD% (%BUILD_DATE%)
echo   - Client JS:  obfuscated + minified (RC4 string enc.)
echo   - Server JS:  obfuscated + bundled into DMXI.exe
echo   - Source maps: NONE
echo  =======================================================
echo.
dir /b "%RELEASE%"
echo.
echo  To run: double-click release\DMXI.exe
echo  Then open http://localhost:4000
echo.
echo  -------------------------------------------------------
echo   NEXT STEPS FOR DISTRIBUTION:
echo  -------------------------------------------------------
echo   1. Upload release\DMXI.exe to Google Drive
echo   2. Get a shareable link and convert to direct download:
echo      https://drive.google.com/uc?export=download^&id=FILE_ID
echo   3. Update your Google Sheet with:
echo      version  = 1.0.%NEW_BUILD%
echo      buildDate = %BUILD_DATE%
echo      downloadUrl = (the Drive link above)
echo      notes    = (what changed in this version)
echo   4. Clients will see the update banner within 1 hour
echo  -------------------------------------------------------
echo.
pause
