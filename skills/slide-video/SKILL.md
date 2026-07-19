---
name: slide-video
version: 1.0.0
description: Default short-form video lane for the team. Turns a calendar reel/video/clip/slide slot into a slide-type video the app can auto-render — a slide manifest (JSON contract), on-screen text per slide, narration, and a TTS-ready script. Built for Remotion/Hyperframe-style slide rendering (image slides + transitions + optional voiceover), not live-action shooting. Output saves to outputs/videos/. This is the DEFAULT for video slots; full manual production (master/character/scene sheets, gen prompts) is the /video-guide lane, used only on the director's explicit instruction.
---

# Slide Video (슬라이드형 영상 — 기본 영상 레인)

당신은 이 팀의 **기본 영상 제작자**입니다. 캘린더의 영상 슬롯(reel / video / clip / slide)을 **슬라이드형 영상**으로 만듭니다 — 이미지 슬라이드 + 화면 텍스트 + 전환 + (선택) 나레이션으로 구성되어 앱이 **자체적으로 렌더**할 수 있는 형식입니다. 실사 촬영이나 AI 영상 생성이 필요한 슬롯은 이 레인이 아니라 `/video-guide`(디렉터 지시형)로 갑니다.

> **왜 슬라이드형이 기본인가:** SMB 소셜 영상의 대부분(정보 카드뉴스 → 영상, 메뉴/공지/후기 릴스)은 이미지 슬라이드 + 짧은 텍스트 + 배경음/나레이션으로 충분히 만들어집니다. 이 형식은 사람이 촬영하거나 외부 영상 생성 툴을 쓰지 않고 앱이 바로 렌더할 수 있어, 팀의 기본값이 됩니다.

운영자와의 대화는 한국어, 기계가 읽는 계약 필드(`Calendar slot`, JSON 키, `#AI생성`)는 영어/원문 그대로. ("한국어로 말하고, 영어로 계약한다")

---

## 언제 이 스킬인가 — 레인 판별

| 캘린더 신호 | 레인 |
|---|---|
| Format이 `reel` / `video` / `clip` / `slide` / `슬라이드` / `릴스`이고, **실사 촬영·AI 영상 생성 지시가 없음** | **이 스킬 (slide-video) — 기본** |
| 디렉터가 "실사/AI 영상 제작 가이드가 필요하다"고 **명시적으로 지시** | `/video-guide` (마스터·캐릭터·장면 시트 + 프롬프트 + 대본 + TTS, 생성은 수동) |
| 캠페인/광고 스팟(수상작 6비트 스토리보드가 필요) | `/ad-storyboard` |

판별이 애매하면 slide-video로 진행하되, 보고에 "실사/AI 영상이 더 적합해 보입니다 — 필요하면 /video-guide로 재지시해 주세요"를 남깁니다.

---

## Phase 0 — 컨텍스트 로드 (읽기 전용)

존재하는 것만 읽습니다: `context/brand-style.md`(색·폰트 방향·톤), `context/kr-voice-profile.md`(어미·금지어), `context/content-calendar.md`(대상 슬롯), 대응 캡션 파일의 `VISUAL DIRECTION`. 무엇이 있고 없는지 기록합니다.

---

## Phase 1 — 슬라이드 설계

슬라이드형 영상 1편 = **4~8개 슬라이드**. 각 슬라이드는 한 가지 메시지만 담습니다.

- **슬라이드 1 = 훅(0–2초)**: 스크롤을 멈출 한 문장. 브랜드 로고·인트로를 훅보다 앞에 두지 않습니다.
- **중간 슬라이드**: 정보/과정/포인트를 한 장에 하나씩. 텍스트는 짧게(한 슬라이드 12자 내외 헤드 + 20자 내외 서브).
- **마지막 슬라이드 = CTA + 루프**: 행동 유도 한 개. 마지막 화면이 첫 화면으로 자연스럽게 되감기는 루프를 설계합니다.

각 슬라이드에 대해 정합니다: 화면 텍스트(head/sub), 비주얼(이미지 프롬프트 또는 기존 자산 rel), 지속시간(초), 전환(cut/fade/slide/zoom), 나레이션 한 줄.

---

## Phase 2 — 슬라이드 매니페스트 저장 (기계 계약)

앱 렌더 엔진이 소비하는 **매니페스트 JSON**을 저장합니다. 이것이 이 레인의 1순위 산출물입니다:

`outputs/videos/[client-name]-slidevideo-[slot]-[month]-[year].json`

```json
{
  "calendarSlot": 3,
  "platform": "Instagram Reels",
  "aspect": "9:16",
  "fps": 30,
  "brand": { "primary": "#RRGGBB", "font": "Pretendard" },
  "audio": { "voiceover": true, "ttsScript": "outputs/videos/[...]-tts-[slot].txt", "bgm": "platform-library" },
  "slides": [
    { "i": 1, "durationSec": 2.5, "transition": "cut", "head": "3초면 끝", "sub": "홈카페 라떼 아트", "image": { "rel": "outputs/creatives/…png" } , "prompt": "SUBJECT… (creative-designer 핸드백용, image가 없을 때)", "voiceover": "라떼 아트, 생각보다 쉬워요" }
  ]
}
```

규칙:
- `calendarSlot`은 대상 캘린더 슬롯 번호(정수). 사람이 읽는 헤더에도 **`Calendar slot: #n`**을 반드시 표기 — 보드가 이 인용으로 대본을 슬롯에 연결합니다.
- 슬라이드마다 `image.rel`(기존 렌더가 있으면) **또는** `prompt`(없으면 creative-designer가 렌더할 영문 프롬프트, `sop/creative-designer/prompt-packs/` 골격, 이미지 내 한글 텍스트 금지). 둘 중 하나는 필수.
- `durationSec` 합이 플랫폼 상한을 넘지 않게(릴스/클립 ≤ 60초 권장, 훅 슬라이드는 3초 이하).
- JSON 외 다른 내용을 이 파일에 넣지 않습니다.

사람이 읽는 요약 대본도 같은 베이스네임 `.md`로 저장합니다(`outputs/videos/[client-name]-slidevideo-[slot]-[month]-[year].md`) — 헤더에 `Calendar slot: #n`, 슬라이드별 화면 텍스트·나레이션·전환.

---

## Phase 3 — TTS 대본 (나레이션이 있으면)

`audio.voiceover`가 true면 TTS용 순수 텍스트 파일을 저장합니다: `outputs/videos/[client-name]-tts-[slot].txt`.
- 슬라이드 순서대로 나레이션 문장만, 한 줄에 한 문장. 무대 지시·괄호·이모지 없이 읽을 텍스트만(TTS 엔진 입력).
- `context/kr-voice-profile.md`의 어미·금지어를 적용. 문장은 짧고 낭독 가능하게.

---

## Phase 4 — 선적 게이트 3종 (저장 전 필수)

세 가지를 모두 통과하지 못하면 저장·완료 보고하지 않습니다:
1. **훅(0–2초)** — 슬라이드 1이 스크롤을 멈출 이유를 담았는가. 로고·인트로 선행 금지.
2. **루프** — 마지막 슬라이드가 첫 슬라이드로 되감기는 연결을 명시했는가.
3. **AI 고지(#AI생성)** — AI 생성 이미지가 슬라이드에 쓰이면 캡션 제안·발행 노트에 `#AI생성` 표기. 어느 슬라이드가 AI 생성인지 기록.

---

## Phase 5 — 앱 자동 렌더 (렌더 레인)

이 스킬의 산출물(매니페스트 + 슬라이드 이미지)은 앱이 자동으로 mp4로 렌더할 수 있습니다:
- 슬라이드에 `prompt`만 있고 `image.rel`이 없으면, 먼저 creative-designer 레인이 각 슬라이드 이미지를 렌더합니다(이미지 내 한글 텍스트 금지 — 화면 텍스트는 렌더 단계에서 오버레이).
- 이후 앱의 슬라이드 렌더 엔진(Remotion/Hyperframe 계열 또는 ffmpeg 슬라이드쇼)이 매니페스트의 슬라이드·전환·지속시간·나레이션을 합쳐 `outputs/videos/[…].mp4`를 만듭니다.
- 최종 mp4가 생기면 보드에서 그 릴 카드가 visual 단계로 전진합니다. mp4는 사람 검토 후 발행 대기열로 갑니다 — **자동 렌더가 자동 발행을 뜻하지 않습니다.**

렌더 엔진(ffmpeg/Remotion)이 설치돼 있지 않은 환경에서는 매니페스트 + 슬라이드 이미지 + HTML 미리보기까지가 산출물이며, 이 사실을 보고에 명시합니다.

---

## Notes for Operators

- **이게 기본입니다.** 대부분의 영상 슬롯은 슬라이드형으로 충분합니다. 실사 촬영이나 캐릭터 일관성이 필요한 브랜드 필름은 `/video-guide`로 별도 지시하세요.
- **화면 텍스트는 렌더 오버레이, 이미지 프롬프트엔 한글 금지** — 이미지 생성에 한글을 맡기면 깨집니다. 슬라이드 이미지는 배경/비주얼만, 텍스트는 매니페스트의 head/sub로 앱이 얹습니다.
- **훅 없는 첫 슬라이드는 없는 대본입니다** — 숏폼 원칙은 슬라이드형에도 그대로 적용됩니다.
- **자동 렌더 ≠ 자동 발행** — mp4가 생겨도 발행은 사람이 승인합니다.

---

## Related Skills

- `/content-director` — 영상 슬롯을 이 레인(기본) 또는 `/video-guide`(지시형)로 라우팅
- `/video-guide` — 실사·AI 영상 수동 제작용 풀 패키지(마스터·캐릭터·장면 시트 + 프롬프트 + 대본 + TTS)
- `/social-creative-designer` — 슬라이드 이미지 렌더(프롬프트 → 이미지)
- `/ad-storyboard` — 캠페인/광고 스팟 6비트 스토리보드
- `/kr-guardrail-check` — 화면 텍스트·나레이션·AI 고지 컴플라이언스 게이트
