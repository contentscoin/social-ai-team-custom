#!/bin/bash
# 로컬 릴리즈 (macOS/Linux) — GitHub Actions 없이 이 머신에서 인스톨러를 빌드해
# GitHub Release로 업로드한다. Actions 사용량 한도/장애 시의 우회 경로.
# 사용법: GH_TOKEN=<repo 권한 PAT> ./release-local.sh [--mac|--linux]  (기본: 현재 OS)
set -e
cd "$(dirname "$0")"

[ -z "$GH_TOKEN" ] && { echo "GH_TOKEN(repo 권한 PAT)이 필요합니다 — github.com/settings/tokens"; exit 1; }

target="$1"
if [ -z "$target" ]; then
  case "$(uname)" in
    Darwin) target=--mac ;;
    *) target=--linux ;;
  esac
fi

echo "[1/3] 의존성 설치..."
npm install

echo "[2/3] 테스트 — 실패하면 릴리즈하지 않는다..."
npm test

echo "[3/3] 인스톨러 빌드 + Release 업로드... ($target)"
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder "$target" --publish always

echo ""
echo "완료 — https://github.com/contentscoin/social-ai-team-custom/releases"
echo "(인스톨러 + latest*.yml 업로드됨 — 기존 사용자 앱이 자동업데이트로 새 버전을 받습니다)"
