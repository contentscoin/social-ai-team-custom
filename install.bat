@echo off
REM Install Social AI Team skills into Claude Code

SET SKILLS_DIR=%USERPROFILE%\.claude\skills
SET AGENTS_DIR=%USERPROFILE%\.claude\agents
SET SCRIPT_DIR=%~dp0

echo Installing Social AI Team skills...

FOR %%S IN (social-media-manager brand-onboarding content-calendar caption-writer social-creative-designer social-performance-review linkedin-writer threads-writer x-writer publisher content-director reels-script ad-storyboard kr-guardrail-check kr-voice-localizer naver-blog-writer naver-clip-writer kakao-channel-writer ima2) DO (
    IF NOT EXIST "%SKILLS_DIR%\%%S" MKDIR "%SKILLS_DIR%\%%S"
    XCOPY /E /Y /Q "%SCRIPT_DIR%skills\%%S\*" "%SKILLS_DIR%\%%S\" >nul
    echo   OK  %%S
)

IF NOT EXIST "%AGENTS_DIR%" MKDIR "%AGENTS_DIR%"
XCOPY /Y /Q "%SCRIPT_DIR%.claude\agents\*.md" "%AGENTS_DIR%\" >nul
echo   OK  team agents (copywriter, creative-designer, video-producer, compliance-reviewer)

echo.
echo Done. All 19 skills installed to %SKILLS_DIR%, team agents to %AGENTS_DIR%
echo Open Claude Code and run /content-director (or /social-media-manager) to get started.
pause
