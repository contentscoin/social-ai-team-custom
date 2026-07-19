@echo off
REM Local release (Windows) - build the installer and upload it to GitHub
REM Releases without GitHub Actions (fallback for Actions usage limits).
REM Usage: release-local.bat   (prompts for GH_TOKEN if not set)
REM NOTE: keep this file ASCII-only. cmd.exe parses batch files in the OEM
REM codepage (CP949 on Korean Windows), so UTF-8 Korean text corrupts parsing.
setlocal
cd /d %~dp0

IF "%GH_TOKEN%"=="" set /p GH_TOKEN=GitHub PAT with repo scope:
IF "%GH_TOKEN%"=="" (
    echo A GitHub PAT is required - create one at github.com/settings/tokens
    exit /b 1
)

echo [1/3] Installing dependencies...
call npm install || exit /b 1

echo [2/3] Running tests - the release aborts if they fail...
call npm test || (
    echo Tests failed - release aborted.
    exit /b 1
)

echo [3/3] Building the Windows installer and uploading the release...
set CSC_IDENTITY_AUTO_DISCOVERY=false
call npx electron-builder --win --x64 --publish always || exit /b 1

echo.
echo Done - https://github.com/contentscoin/social-ai-team-custom/releases
echo The installer and latest.yml were uploaded; apps will pick it up via auto-update.
endlocal
pause
