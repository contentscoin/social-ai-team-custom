---
name: slide-video
version: 1.0.0
description: Default short-form video lane for the team. Turns a calendar reel/video/clip/slide slot into a rendered MP4. Three render engines, selected per slot — HyperFrames (HTML video-as-code via the installed hyperframes agent skill), Remotion (advanced/premium slots, React video-as-code via the installed remotion agent skill), and the app's built-in Chromium capture (zero-install DEFAULT — now animated hyperframe: Ken Burns motion, kinetic typography, card-news bullet reveal, scene transitions, not static slides). Produces the slide plan, on-screen text, narration, and a TTS-ready script; the chosen engine renders to outputs/videos/*.mp4. Output saves to outputs/videos/. This is the DEFAULT for video slots; full manual production (master/character/scene sheets, gen prompts) is the /video-guide lane, used only on the director's explicit instruction.
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

## 렌더 엔진 — 슬롯별 선택 (3계층)

슬라이드 계획은 동일하게 세우고, **슬롯마다 렌더 엔진을 고릅니다.** 우선순위와 선택 규칙:

| 엔진 | 언제 | 저작 방식 | 렌더 |
|---|---|---|---|
| **앱 내장 캡처 (기본)** | 대부분의 영상 슬롯. 설치 불필요 | 이 스킬이 아래 Phase 2 매니페스트(JSON)만 저장 | 앱이 내장 Chromium으로 각 씬을 **프레임 단위 애니메이션 캡처** → mp4 (켄번스 줌·키네틱 타이포·카드뉴스 불릿 순차 등장·씬 진입 전환·진행바) |
| **HyperFrames (고급 HTML)** | 더 정교한 모션이 필요한 슬롯, 또는 디렉터 지정 | 설치된 `hyperframes` 에이전트 스킬로 **HTML 장면**을 작성 (plan→HTML→애니메이션→lint→render 루프) | `npx hyperframes render` → mp4 (로컬, Apache-2.0) |
| **Remotion (프리미엄)** | 프리미엄 슬롯 — Format에 `-pro`/`프리미엄` 표기가 있거나 Notes에 "고급/프리미엄/pro", 또는 디렉터가 지정 | 설치된 `remotion` 에이전트 스킬로 **React 컴포지션**을 작성 (스프링 물리·정밀 전환·오디오 싱크) | `npx remotion render` → mp4 (로컬) |

**엔진 판별 절차:**
1. 기본은 **앱 내장 캡처**다 — 설치 없이 애니메이션 하이퍼프레임 영상을 만든다. 대부분의 SMB 카드뉴스형 영상 슬롯에 충분하다.
2. 씬 물리·정밀 오디오 싱크 등 더 높은 제작 수준이 필요하거나 디렉터가 지정하면 **HyperFrames/Remotion** — 해당 에이전트 스킬이 설치돼 있는지 확인 후 video-as-code로 로컬 렌더. (설치: 데스크톱 앱 설정 → 셋업의 "영상 렌더 스킬 설치", 또는 `npx skills add heygen-com/hyperframes --all` / `npx skills add remotion`)
3. 어느 경로든 산출물은 `outputs/videos/*.mp4`. 보고에 어느 엔진으로 렌더했는지 명시한다.

**공통 계약(엔진 무관):** 산출 mp4는 `outputs/videos/`에, 사람이 읽는 대본/장면 노트(.md)에 **`Calendar slot: #n`**을 반드시 표기(보드 연결). 이미지 내 한글 텍스트를 굽지 말 것 — 화면 텍스트는 HTML/React가 네이티브로 렌더. AI 생성 비주얼이 있으면 `#AI생성` 고지.

---

## Phase 0 — 컨텍스트 로드 (읽기 전용)

존재하는 것만 읽습니다: `context/brand-style.md`(색·폰트 방향·톤), `context/kr-voice-profile.md`(어미·금지어), `context/content-calendar.md`(대상 슬롯), 대응 캡션 파일의 `VISUAL DIRECTION`. 무엇이 있고 없는지 기록합니다.

---

## Phase 1 — 슬라이드 설계 (카드뉴스 스토리텔링)

슬라이드형 영상 1편 = **4~8개 씬**. 사진 나열이 아니라 **하나의 서사**로 엮습니다 — 각 씬은 한 가지 메시지만 담고, 다음 씬으로 이유 있게 이어집니다.

**씬 역할(`role`)로 서사 골격을 잡습니다:**

| role | 언제 | 화면 |
|---|---|---|
| `hook` | 씬 1 (0–2초) | 스크롤을 멈출 한 문장. 로고·인트로 선행 금지. |
| `context` | 배경/문제 제기 | "왜 이게 중요한가"를 한 장에. |
| `point` | 정보/과정/포인트 | 핵심 한 개 (필요하면 `bullets`로 2~4개 순차 등장 — 카드뉴스의 요점 나열). |
| `tip` | 팁/디테일 | 실전 한 수. |
| `cta` | 마지막 씬 | 행동 유도 한 개 + **루프**(마지막 화면이 첫 화면으로 되감기게). |

**각 씬에 대해 정합니다:**
- `kicker`: 상단 눈길 라벨(선택, 8자 내외 — 예 "카페 운영 팁", "3분 레시피").
- `head`: 핵심 헤드라인(12자 내외). `sub`: 보조 문구(20자 내외).
- `bullets`: 카드뉴스 요점(선택, 2~4개, 각 12자 내외) — 화면에서 **하나씩 순차로 켜집니다**. point 씬에서 특히 유효.
- `motion`: 배경 모션 — `kenburns`(기본, 느린 줌+팬), `panLeft`/`panRight`(가로 이동), `kinetic`(텍스트 전진·상승), `static`(정지). 인물·풍경 이미지는 kenburns, 제품 클로즈업은 static/kinetic이 자연스럽습니다.
- `transition`: 씬 진입 전환 — `fade`(기본), `slide`(아래에서 올라옴), `zoom`(살짝 확대되며 등장), `cut`.
- `image`(선택): 배경 이미지 rel. 없으면 브랜드색 그라디언트 타이틀 카드로 렌더됩니다(텍스트만으로도 성립).
- `voiceover`: 나레이션 한 줄.

**모션이 서사를 만듭니다:** 앱이 이 필드들을 프레임 단위로 애니메이션합니다 — 배경은 켄번스로 살아 움직이고, 헤드→서브→불릿이 시간차로 등장하며, 하단 진행바가 씬 진행을 보여줍니다. 그래서 매니페스트는 "사진 목록"이 아니라 **씬별 연출 지시서**입니다.

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
  "brand": { "primary": "#RRGGBB", "accent": "#RRGGBB", "font": "Pretendard" },
  "audio": { "voiceover": true, "ttsScript": "outputs/videos/[...]-tts-[slot].txt", "bgm": "platform-library" },
  "slides": [
    { "i": 1, "role": "hook", "durationSec": 2.5, "transition": "zoom", "motion": "kenburns",
      "kicker": "3분 홈카페", "head": "3초면 끝", "sub": "홈카페 라떼 아트",
      "image": { "rel": "outputs/creatives/…png" }, "prompt": "SUBJECT… (image 없을 때 렌더용, 선택)",
      "voiceover": "라떼 아트, 생각보다 쉬워요" },
    { "i": 2, "role": "point", "durationSec": 4, "transition": "slide", "motion": "static",
      "kicker": "준비물", "head": "딱 3가지",
      "bullets": ["에스프레소 1샷", "따뜻한 우유", "얕은 잔"],
      "voiceover": "필요한 건 이 세 가지예요" }
  ]
}
```

규칙:
- `calendarSlot`은 대상 캘린더 슬롯 번호(정수). 사람이 읽는 헤더에도 **`Calendar slot: #n`**을 반드시 표기 — 보드가 이 인용으로 대본을 슬롯에 연결합니다.
- **화면 텍스트(`kicker`/`head`/`sub`/`bullets`)는 앱이 HTML로 네이티브 렌더**합니다 — 한글이 이미지에 굽히지 않고 깨끗하게 나오고, 프레임 단위로 애니메이션됩니다(순차 등장). 그래서 씬은 **텍스트만으로도 렌더됩니다**(배경 이미지는 선택).
- `bullets`는 **배열**(2~4개 권장). 화면에서 하나씩 순차로 켜집니다 — 카드뉴스 요점 나열에 씁니다. 배열이 아니면 무시됩니다.
- `role`(hook/context/point/tip/cta), `motion`(kenburns/panLeft/panRight/kinetic/static), `transition`(fade/slide/zoom/cut)은 Phase 1 표를 따릅니다. 미지원 값은 기본값으로 폴백(비차단 warning).
- `image.rel`(배경 이미지, 선택): 있으면 배경으로 깔리고(켄번스 등 모션 적용) 텍스트가 하단에 얹힙니다. 없으면 브랜드색 그라디언트 타이틀 카드에 중앙 텍스트. 배경 이미지는 creative-designer가 먼저 렌더한 파일의 rel을 넣습니다(이미지 내 한글 텍스트 금지 — 텍스트는 앱이 얹습니다). `prompt`는 그 배경 이미지를 나중에 렌더할 영문 프롬프트로 남겨둘 수 있습니다(선택).
- `brand.accent`(선택): 진행바·불릿 마커·kicker 강조색. 없으면 `primary`를 씁니다.
- `durationSec` 합이 플랫폼 상한을 넘지 않게(릴스/클립 ≤ 60초 권장, 훅 씬은 3초 이하). point 씬은 불릿이 다 등장할 시간을 주려면 3.5초 이상 권장.
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

## Phase 5 — 렌더

**기본 경로 (앱 내장 캡처):** 매니페스트(Phase 2 JSON)만 저장하면, 앱이 각 씬을 HTML로 조판해 **내장 Chromium(오프스크린)으로 프레임 단위 애니메이션 캡처** → **번들 ffmpeg**로 고정 fps 인코딩해 mp4를 만듭니다(켄번스 모션·키네틱 타이포·불릿 순차 등장·씬 전환·진행바, 한글 네이티브, 배경 이미지 선택). 설치 불필요.

**고급 경로 (HyperFrames/Remotion 설치됨):** 선택한 엔진의 에이전트 스킬로 video-as-code를 저작하고 로컬 렌더합니다 — HyperFrames는 HTML 장면을 짜 `npx hyperframes render`, Remotion은 React 컴포지션을 짜 `npx remotion render`. 산출 mp4를 `outputs/videos/`에 저장하고, 매니페스트(Phase 2)와 동일 베이스네임 `.md`에 `Calendar slot: #n`·장면 노트를 남깁니다.

- 두 경로 모두 최종 mp4가 생기면 보드에서 그 릴 카드가 visual 단계로 전진합니다. mp4는 사람 검토 후 발행 대기열로 갑니다 — **자동 렌더가 자동 발행을 뜻하지 않습니다.**
- 어느 경로로 렌더했는지(엔진명/폴백)와 렌더 전제 충족 여부를 보고에 명시합니다.

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
