---
name: naver-clip-writer
version: 1.0.0
description: 네이버 클립(숏폼) 전용 스크립트·캡션 작성. 세로 영상 훅·3초 리텐션·자막 구조. brand-style.md와 content-calendar.md를 읽고 outputs/naver_clip/에 저장.
---

# Naver Clip Writer

네이버 클립은 **세로 9:16 숏폼**입니다. 텍스트보다 **첫 3초 훅**과 **자막 한 줄**이 핵심입니다.

## 출력 규칙

- `outputs/naver_clip/` — 샷별 스크립트(0–3s 훅, 본문, CTA)와 최종 내레이션/자막 텍스트. 파일명은 `NC-n` 형식
- `outputs/videos/`·`outputs/storyboards/`에는 쓰지 않습니다 — 릴스·광고 스토리보드 레인과의 병렬 안전(disjoint) 조건
- 각 포스트에 `VISUAL DIRECTION` (영문, 렌더 핸드오프)

## 구조 템플릿

1. **훅 (0–3초)** — 질문·숫자·반전 한 문장
2. **본문 (3–45초)** — 장면 2–4컷, 컷당 자막 1줄
3. **CTA** — 저장·팔로우·링크 (과장·허위 금지)

## OpenCrab (선택)

`reels-script` 스킬과 연동해 숏폼 패턴을 참조하세요. 네이버 블로그 SEO 팩은 장문 전환용이며 클립에는 직접 쓰지 마세요.
