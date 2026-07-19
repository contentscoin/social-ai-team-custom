#!/bin/bash
# 문서·설치 SSOT drift 검사 — skills/ 디렉터리가 단일 진실.
# install.sh·install.bat의 스킬 목록이 실제와 다르거나, 문서에 스테일 저장소
# URL이 남아 있으면 실패한다. (기획서 v1.2 — "문서·설치 SSOT 동기화"의 CI 게이트)
set -u
cd "$(dirname "$0")/.."
fail=0

actual=$(ls -1 skills | sort)
count=$(echo "$actual" | wc -l | tr -d ' ')

# install.sh — SKILLS=( ... ) 배열 항목
sh_list=$(sed -n '/^SKILLS=(/,/^)/p' install.sh | grep -o '"[^"]*"' | tr -d '"' | sort)
if [ "$actual" != "$sh_list" ]; then
  echo "✖ install.sh 스킬 목록이 skills/ 디렉터리와 다릅니다:"
  diff <(echo "$actual") <(echo "$sh_list") | sed 's/^/    /'
  fail=1
fi

# install.bat — FOR %%S IN (...) 목록
bat_list=$(grep -o 'IN ([^)]*)' install.bat | sed 's/^IN (//; s/)$//' | tr ' ' '\n' | sort)
if [ "$actual" != "$bat_list" ]; then
  echo "✖ install.bat 스킬 목록이 skills/ 디렉터리와 다릅니다:"
  diff <(echo "$actual") <(echo "$bat_list") | sed 's/^/    /'
  fail=1
fi

# 문서의 스킬 개수 표기 — "N skills"/"스킬 N종"이 실제 개수와 일치해야 한다
for f in README.md SETUP.md TEAM.md desktop/README.md; do
  bad=$(grep -noE "all [0-9]+ skills|see [0-9]+ skills|스킬 [0-9]+종" "$f" | grep -v "$count" || true)
  if [ -n "$bad" ]; then
    echo "✖ $f 의 스킬 개수 표기가 실제(${count}개)와 다릅니다:"
    echo "$bad" | sed 's/^/    /'
    fail=1
  fi
done

# 스테일 저장소 URL — 정본은 contentscoin/social-ai-team-custom
stale=$(grep -rn "stevenflanagan1/social-ai-team\|contentscoin/social-ai-team[^-]" \
  README.md SETUP.md TEAM.md desktop/README.md install.sh install.bat 2>/dev/null || true)
if [ -n "$stale" ]; then
  echo "✖ 스테일 저장소 URL이 남아 있습니다 (정본: contentscoin/social-ai-team-custom):"
  echo "$stale" | sed 's/^/    /'
  fail=1
fi

if [ "$fail" -eq 0 ]; then
  echo "✓ drift 없음 — 스킬 ${count}종, 설치 스크립트·문서·URL 정합"
fi
exit "$fail"
