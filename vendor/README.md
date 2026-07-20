# vendor/

앱에 번들되는 서드파티 자산. 데스크톱 앱은 오프라인·git 미설치 PC에서도
동작해야 하므로, 런타임 `git clone`에 의존하지 않고 이 폴더의 사본을 앱 패키지에
포함(`desktop/package.json`의 `extraResources`)해 배포한다.

## image-prompt (공냥 프롬프트 킷)

- 출처: https://github.com/contentscoin/gongnyang-prompt-kit — `skills/image-prompt`
- 라이선스: MIT (`vendor/image-prompt/LICENSE` 동봉)
- 고정 커밋: `2d775df72aa03c9d00a699516a26c35e5d0f40db`
- 용도: 이미지 생성 프롬프트를 gpt-image-2 완성 프롬프트로 컴파일하는 Claude Code 스킬.
  `desktop/lib/promptlab.js`가 `~/.claude/skills/image-prompt/scripts/check_prompt.mjs`로
  결과를 검증한다.

### 업데이트 방법

```sh
# 원본 레포에서 최신 skills/image-prompt를 받아 이 폴더를 덮어쓴다
rm -rf vendor/image-prompt
cp -r <clone>/gongnyang-prompt-kit/skills/image-prompt vendor/image-prompt
cp <clone>/gongnyang-prompt-kit/LICENSE vendor/image-prompt/LICENSE
# 위 '고정 커밋' 해시를 새 커밋으로 갱신
```

앱의 "이미지 프롬프트 킷 설치" 버튼(`setup.installImagePromptKit`)은 이 번들 사본을
`~/.claude/skills/image-prompt`로 복사한다. git이 설치돼 있으면 GitHub 최신본으로
업데이트를 시도하고, 실패하거나 git이 없으면 번들 사본으로 폴백한다.
