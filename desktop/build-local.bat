@echo off
REM Local build only (Windows) - make the installer WITHOUT uploading a release.
REM No GitHub token needed. The .exe lands in desktop\dist\ - run it to install/update.
REM NOTE: keep this file ASCII-only. cmd.exe parses batch files in the OEM codepage
REM (CP949 on Korean Windows), so UTF-8 Korean text corrupts parsing.
setlocal
cd /d %~dp0

echo [1/3] Installing dependencies (first run is slow)...
call npm install || goto :fail

echo [2/3] Running tests...
call npm test || goto :fail

echo [3/3] Building the Windows installer (no upload)...
set CSC_IDENTITY_AUTO_DISCOVERY=false
call npx electron-builder --win --x64 --publish never || goto :fail

echo.
echo Done - the installer is here:
echo   %~dp0dist
echo Run Social-AI-Team-Setup-*.exe in that folder to install or update the app.
goto :done

:fail
echo.
echo *** FAILED - a step above did not finish. Read the last lines for the reason. ***
echo *** This window stays open (does not auto-close). Copy the error and share it. ***

:done
endlocal
pause
