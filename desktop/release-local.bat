@echo off
REM 로컬 릴리즈 (Windows) — GitHub Actions 없이 이 PC에서 인스톨러를 빌드해
REM GitHub Release로 업로드한다. Actions 사용량 한도/장애 시의 우회 경로.
REM 사용법: release-local.bat   (GH_TOKEN 환경변수가 없으면 입력을 요청)
setlocal
cd /d %~dp0

IF "%GH_TOKEN%"=="" set /p GH_TOKEN=GitHub PAT (repo 권한):
IF "%GH_TOKEN%"=="" ( echo PAT가 필요합니다 — github.com/settings/tokens 에서 repo 권한으로 발급 & exit /b 1 )

echo [1/3] 의존성 설치...
call npm install || exit /b 1

echo [2/3] 테스트 — 실패하면 릴리즈하지 않는다...
call npm test || ( echo 테스트 실패 — 릴리즈 중단 & exit /b 1 )

echo [3/3] Windows 인스톨러 빌드 + Release v%npm_package_version% 업로드...
set CSC_IDENTITY_AUTO_DISCOVERY=false
call npx electron-builder --win --x64 --publish always || exit /b 1

echo.
echo 완료 — https://github.com/contentscoin/social-ai-team-custom/releases
echo (exe + latest.yml 업로드됨 — 기존 사용자 앱이 자동업데이트로 새 버전을 받습니다)
endlocal
pause
