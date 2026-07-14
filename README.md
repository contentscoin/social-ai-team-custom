# Social AI Team Custom

한국 시장용 **소셜 미디어 AI 팀** 커스텀 배포판입니다.  
Claude Code 스킬 + Electron 데스크톱(온에어 데스크) + OpenCrab + pumasi 오케스트레이션을 한 저장소에서 운영합니다.

| 항목 | 내용 |
|------|------|
| 버전 | **Desktop v0.17.0** (main) |
| 저장소 | https://github.com/contentscoin/social-ai-team-custom |
| 라이선스 | Apache-2.0 (원본 포크 계열) |
| 기준 포크 | [contentscoin/social-ai-team](https://github.com/contentscoin/social-ai-team) ← upstream [stevenflanagan1/social-ai-team](https://github.com/stevenflanagan1/social-ai-team) |

> **모토:** 한국어로 말하고, 영어로 계약한다.  
> 운영 대화·승인·요약은 한국어. 스킬 계약 필드(`VISUAL DIRECTION`, `BLOTATO FLAG`, `PASS`/`WARN`/`BLOCK` 등)는 기존 영문 규약을 유지합니다.

---

## 목차

1. [한눈에 보기](#1-한눈에-보기)
2. [설치본 다운로드 (릴리즈)](#2-설치본-다운로드-릴리즈)
3. [무엇이 v0.17에서 달라졌나](#3-무엇이-v017에서-달라졌나)
4. [메인 채널](#4-메인-채널)
5. [월간 캘린더](#5-월간-캘린더)
6. [OpenCrab 연동](#6-opencrab-연동)
7. [비주얼 자산 인제스트](#7-비주얼-자산-인제스트)
8. [pumasi / CLI 오케스트레이션](#8-pumasi--cli-오케스트레이션)
9. [스킬·에이전트 구성](#9-스킬에이전트-구성)
10. [빠른 시작](#10-빠른-시작)
11. [데스크톱 앱 사용 흐름](#11-데스크톱-앱-사용-흐름)
12. [폴더·파일 구조](#12-폴더파일-구조)
13. [설정 가이드](#13-설정-가이드)
14. [빌드·릴리즈](#14-빌드리리즈)
15. [관련 문서](#15-관련-문서)
16. [문제 해결](#16-문제-해결)

---

## 1. 한눈에 보기

```
[브랜드 온보딩] → [콘텐츠 캘린더] → [채널별 카피]
        │                │                 │
        ▼                ▼                 ▼
  brand-style.md   calendar-index.json   outputs/{채널}/
        │                │                 │
        └──── OpenCrab 팩 / 워크플로 ──────┘
                         │
              [비주얼 생성 · 검수 · 발행]
                         │
         월간 캘린더 UI (하루 · 다중 채널 표기)
```

**이 커스텀판이 해결하는 것**

- 한국 실무 메인 채널 5개를 UI·보드·스킬에서 1순위로 취급
- 요일·날짜가 보이는 **월간 캘린더**, 하루 여러 채널 포스팅 겹침 표기
- OpenCrab 팩·프로젝트·워크플로를 설정 화면에서 연결해 근거 기반 글쓰기
- 마스터시트 / 캐릭터시트 / 콘텐츠 베이스 → OpenCrab 인제스트
- Cursor Auto + pumasi로 Claude / Codex / MCP를 단계별 라우팅

---

## 2. 설치본 다운로드 (릴리즈)

### 2.1 이 저장소 공식 릴리즈 (권장)

데스크톱 설치본(Windows / macOS / Linux)은 GitHub Releases에 올라갑니다.

| 구분 | 링크 |
|------|------|
| **전체 릴리즈 목록** | https://github.com/contentscoin/social-ai-team-custom/releases |
| **최신 릴리즈** | https://github.com/contentscoin/social-ai-team-custom/releases/latest |
| **v0.17.0 태그** (빌드 완료 시) | https://github.com/contentscoin/social-ai-team-custom/releases/tag/v0.17.0 |
| Actions 빌드 기록 | https://github.com/contentscoin/social-ai-team-custom/actions/workflows/desktop-build.yml |

`main`에 `desktop/**` 변경이 푸시되면 Actions가 설치본을 빌드·발행합니다.  
릴리즈가 아직 안 보이면 위 Actions 페이지에서 **Run workflow**(`workflow_dispatch`)를 실행하세요.

### 2.2 OS별 예상 파일명 (v0.17.0)

| OS | 파일 | 용도 |
|----|------|------|
| Windows | `Social-AI-Team-Setup-0.17.0.exe` | NSIS 설치 프로그램 |
| macOS | `Social-AI-Team-0.17.0-arm64.dmg` | Apple Silicon DMG |
| Linux | `Social-AI-Team-0.17.0.AppImage` | AppImage 실행 파일 |

다운로드 예 (릴리즈 자산이 올라온 뒤):

- Windows: https://github.com/contentscoin/social-ai-team-custom/releases/download/v0.17.0/Social-AI-Team-Setup-0.17.0.exe
- macOS: https://github.com/contentscoin/social-ai-team-custom/releases/download/v0.17.0/Social-AI-Team-0.17.0-arm64.dmg
- Linux: https://github.com/contentscoin/social-ai-team-custom/releases/download/v0.17.0/Social-AI-Team-0.17.0.AppImage

> CI는 매트릭스 3개가 동시에 `--publish`하지 않도록 고쳤습니다(경쟁으로 전부 실패하던 원인).  
> 빌드 → artifact 모으기 → `softprops/action-gh-release`로 한 번만 릴리즈합니다.

### 2.3 이전 세대 설치본 ( upstream, v0.16 )

v0.17 커스텀 릴리즈가 준비되기 전에는 아래 upstream 빌드를 참고할 수 있습니다.  
(**월간 캘린더·5채널·OpenCrab/pumasi v0.17 기능은 포함되지 않음**)

| 구분 | 링크 |
|------|------|
| upstream Releases | https://github.com/contentscoin/social-ai-team/releases |
| **v0.16.0** | https://github.com/contentscoin/social-ai-team/releases/tag/v0.16.0 |
| Windows 0.16 | https://github.com/contentscoin/social-ai-team/releases/download/v0.16.0/Social-AI-Team-Setup-0.16.0.exe |
| macOS 0.16 | https://github.com/contentscoin/social-ai-team/releases/download/v0.16.0/Social-AI-Team-0.16.0-arm64.dmg |
| Linux 0.16 | https://github.com/contentscoin/social-ai-team/releases/download/v0.16.0/Social-AI-Team-0.16.0.AppImage |

### 2.4 소스에서 바로 실행 (개발/검증)

```bash
git clone https://github.com/contentscoin/social-ai-team-custom.git
cd social-ai-team-custom/desktop
npm install
npm start
```

---

## 3. 무엇이 v0.17에서 달라졌나

| 영역 | 내용 |
|------|------|
| 채널 | `instagram`, `threads`, `naver`, `naver_clip`, `kakao_channel` 메인 고정 (`desktop/lib/channels.js`) |
| 캘린더 | `scheduledDate`/`scheduledTime` + week/day 해석, **월간 42셀 그리드**, 하루 다채널 스택 |
| OpenCrab | `opencrab/opencrab.constants.yaml` SSOT, 설정 탭에서 프로젝트/워크플로 실행 |
| 비주얼 자산 | `context/visual-assets/{master_sheet,character_sheet,content_base}/` → 인제스트 |
| 오케스트레이션 | `pumasi.config.yaml` + Claude/Codex/MCP 라우트 |
| 스킬 | `naver-clip-writer`, `kakao-channel-writer` 추가 (`install.sh` 반영) |
| UI | 보드 **월간** 뷰 기본, 채널 뱃지 색상(클립/카카오) |

PR: [#1](https://github.com/contentscoin/social-ai-team-custom/pull/1) → `main` 머지 완료 (`4d09764` 포함).

---

## 4. 메인 채널

채널은 다양하게 등록할 수 있지만, **운영·캘린더·오토파일럿의 1순위**는 아래 5개입니다.

| ID | 표시명 | 레인 | 발행 |
|----|--------|------|------|
| `instagram` | 인스타그램 | captions | 수동 체크리스트 (공개 이미지 URL 제약) |
| `threads` | 스레드 | threads | API (텍스트 + 댓글형 체인) |
| `naver` | 네이버 블로그 | naver | 수동 |
| `naver_clip` | 네이버 클립 | naver_clip | 수동 |
| `kakao_channel` | 카카오채널 | kakao | 수동 |

부가 채널: Facebook, LinkedIn, X, TikTok 등 (`desktop/lib/channels.js` REGISTRY).

스킬 예:

- `/threads-writer` — OpenCrab 근거 기반 짧은 문장
- `/naver-blog-writer` — 검색 유입형 장문
- `/naver-clip-writer` — 숏폼 클립 훅·대본
- `/kakao-channel-writer` — 카카오채널 소식/카드형 카피

---

## 5. 월간 캘린더

### 왜 필요한가

주간 텍스트만으로는 “무슨 요일인지”, “하루에 채널이 몇 개나 겹치는지”가 불명확합니다.  
v0.17은 **실제 YYYY-MM-DD**로 해석하고, 월간 그리드에 채널 뱃지를 쌓아 보여 줍니다.

### 데이터

1. `context/calendar-meta.json` — 연/월, `anchor`, `weekStartsOn`(기본 월요일)
2. `context/calendar-index.json` — 포스트별 `week`, `day`, `scheduledDate`, `scheduledTime`, `platform`, `topic`
3. 보드 → `postsByDate` → UI `renderMonthCalendar()`

### UI

- 앱 보드 상단 **월간** 탭 (기본)
- ◀ / ▶ 로 달 이동, 오늘로 이동
- 각 칸: 날짜 숫자 + N건 + 채널 모노 뱃지(겹치면 세로 스택)

관련 코드: `desktop/lib/calendar-dates.js`, `desktop/src/renderer.js`.

---

## 6. OpenCrab 연동

OpenCrab은 팩·노드·워크플로로 **근거 있는 글쓰기**를 돕습니다.

| 파일 | 역할 |
|------|------|
| `opencrab/opencrab.constants.yaml` | 프로젝트/워크플로/팩 ID SSOT |
| `desktop/lib/opencrab-bindings.js` | 상수 로드, 워크플로 실행 헬퍼 |
| `desktop/lib/opencrab.js` | MCP 도구 호출 |

설정 앱에서:

1. OpenCrab MCP 엔드포인트 입력
2. 베이스 팩 연결
3. Threads Evidence Writing 등 워크플로 실행
4. 산출물을 `outputs/threads/` 등에 반영

노드 간 연결(브랜드 ↔ 토픽 ↔ 채널 전략)은 인제스트된 팩을 검색·인용하는 구조로 확장합니다.

---

## 7. 비주얼 자산 인제스트

이미지 생성 일관성을 위해 시트·베이스를 정리하고 OpenCrab 팩으로 올립니다.

권장 경로:

```
context/visual-assets/
  master_sheet/      # 브랜드 마스터(로고·팔레트·금지사항)
  character_sheet/   # 캐릭터/페르소나 비주얼
  content_base/      # 반복 쓰는 구도·소품·배경 레퍼런스
```

`desktop/lib/visual-assets.js` + pumasi 태스크 `visual-asset-ingest`로 MCP ingest를 돌립니다.

---

## 8. pumasi / CLI 오케스트레이션

`pumasi.config.yaml`이 단계 → 엔진 우선순위를 정의합니다.

예:

| 태스크 | 라우트 | 엔진 후보 |
|--------|--------|-----------|
| `calendar-index` | calendar | Claude |
| `threads-evidence-write` | copy_threads | Claude → Codex |
| `visual-asset-ingest` | opencrab_ingest | MCP |

Cursor Auto가 전체 흐름을 리드하고, 단계마다 `orchestrator.js`가 Claude CLI / Codex CLI / OpenCrab MCP를 고릅니다.  
OAuth·로컬 CLI·MCP가 준비되어 있어야 합니다(앱 출근 마법사 참고).

---

## 9. 스킬·에이전트 구성

### 설치

```bash
bash install.sh
# Windows: install.bat
```

스킬은 `~/.claude/skills/`, 에이전트는 `~/.claude/agents/`로 복사됩니다.

### 레이어 요약

| 구분 | 내용 |
|------|------|
| 디렉터 | `/content-director`, `/social-media-manager` |
| 서브에이전트 | copywriter, creative-designer, video-producer, compliance-reviewer |
| 한국어/KR | `/kr-guardrail-check`, `/kr-voice-localizer`, `/naver-blog-writer`, `/naver-clip-writer`, `/kakao-channel-writer` |
| 숏폼·광고 | `/reels-script`, `/ad-storyboard` |
| 원본 10종 | brand / calendar / caption / creative / linkedin / threads / x / publisher / review 등 |
| 렌더 | `/ima2` + `sop/creative-designer/` |

상세 운영 매뉴얼: [TEAM.md](TEAM.md)

---

## 10. 빠른 시작

### A. 설치본

1. [Releases](https://github.com/contentscoin/social-ai-team-custom/releases/latest)에서 OS별 파일 다운로드  
2. 설치 후 앱 실행 → **출근 준비 마법사**  
3. 클라이언트 생성 → 채널·캘린더·OpenCrab 설정

### B. Claude Code만

```bash
git clone https://github.com/contentscoin/social-ai-team-custom.git
cd social-ai-team-custom
bash install.sh
```

Claude Code에서 `/content-director` 또는 `/social-media-manager`로 시작.  
초보 가이드: [SETUP.md](SETUP.md)

### C. 데스크톱 개발 모드

```bash
cd desktop && npm install && npm start
```

---

## 11. 데스크톱 앱 사용 흐름

앱은 **온에어 데스크**로 불립니다. 자세한 UI 설명은 [desktop/README.md](desktop/README.md).

대략적 루프:

1. **클라이언트 생성** — 브랜드 URL·질문지 온보딩  
2. **캘린더 생성** — `content-calendar` → `calendar-index.json` (+ `calendar-meta.json`)  
3. **월간 보드**에서 날짜·채널 겹침 확인  
4. **오토파일럿 / 단계 실행** — 카피 → 비주얼 → 검수  
5. **게이트 도장** — 승인 후에만 다음 단계  
6. **발행** — API 지원 채널은 직접 발행, 인스타·네이버·클립·카카오는 수동 체크리스트  
7. **OpenCrab / 전략 인제스트** — 다음 달 재사용

---

## 12. 폴더·파일 구조

```
social-ai-team-custom/
├── README.md                 ← 이 문서 (한국어)
├── TEAM.md                   ← 팀 운영 매뉴얼
├── SETUP.md                  ← 초보 설치
├── install.sh / install.bat
├── pumasi.config.yaml        ← CLI/MCP 라우트
├── opencrab/
│   └── opencrab.constants.yaml
├── skills/                   ← Claude Code 스킬
├── sop/                      ← 렌더·QA SOP
├── .claude/agents/           ← 서브에이전트
├── desktop/                  ← Electron 앱
│   ├── lib/channels.js
│   ├── lib/calendar-dates.js
│   ├── lib/opencrab*.js
│   ├── lib/orchestrator.js
│   ├── lib/visual-assets.js
│   └── src/                  ← 월간 캘린더 UI
└── .github/workflows/desktop-build.yml
```

클라이언트 워크스페이스(앱이 관리) 예:

```
{client}/
  context/
    brand-style.md
    content-calendar.md
    calendar-index.json
    calendar-meta.json
    visual-assets/
    strategy/
  outputs/
    captions/ threads/ naver/ ...
```

---

## 13. 설정 가이드

| 위치 | 설정 |
|------|------|
| 설정 → 엔진 | Claude / Codex 모델 |
| 설정 → 채널 | X / Facebook / Threads / LinkedIn 토큰 |
| 설정 → 렌더 | OpenCrab MCP URL, 이미지·영상 프로바이더 |
| OpenCrab 탭 | 프로젝트·워크플로·팩 |
| `~/.social-ai-team/secrets.json` | 토큰 저장(권한 0600) |
| `~/.social-ai-team/logs` | 오류 로그 |

---

## 14. 빌드·릴리즈

```bash
cd desktop
npm install
npm run dist:win    # Windows
npm run dist:mac    # macOS
npm run dist:linux  # Linux
```

CI: `.github/workflows/desktop-build.yml`  
- `main` + `desktop/**` 변경 시  
- Windows exe / macOS dmg / Linux AppImage  
- GitHub Releases에 publish (`electron-updater` 피드)

앱 내 업데이트: 사이드바 → 업데이트 확인.  
macOS 미서명 빌드는 수동 dmg 설치가 필요할 수 있습니다.

> **참고:** `desktop/package.json`의 `build.publish.repo`는 이 저장소(`social-ai-team-custom`)를 가리키도록 맞춰 두는 것이 좋습니다. 릴리즈·자동 업데이트가 이 repo로 모입니다.

---

## 15. 관련 문서

| 문서 | 설명 |
|------|------|
| [TEAM.md](TEAM.md) | 한국어 팀 운영 매뉴얼 (전체) |
| [SETUP.md](SETUP.md) | Claude Code·MCP 초보 가이드 |
| [desktop/README.md](desktop/README.md) | 온에어 데스크 상세 |
| [pumasi.config.yaml](pumasi.config.yaml) | 오케스트레이션 라우트 |
| [opencrab/opencrab.constants.yaml](opencrab/opencrab.constants.yaml) | OpenCrab 상수 |

외부:

- [ima2-gen](https://github.com/lidge-jun/ima2-gen) — 이미지/영상 OAuth 생성
- [OpenCrab](https://github.com/contentscoin) / MCP — 팩·워크플로
- [threads-writer-opencrab](https://github.com/contentscoin/threads-writer-opencrab) — Threads 근거 글쓰기 팩 참고

---

## 16. 문제 해결

| 증상 | 확인 |
|------|------|
| 월간에 포스트가 안 보임 | `calendar-index.json`의 `scheduledDate` / `calendar-meta.json` 연·월 |
| OpenCrab 실패 | MCP URL, 도구 권한(쓰기), `opencrab.constants.yaml` ID |
| CLI가 안 붙음 | Claude/Codex 설치·로그인, 앱 엔진 설정 |
| 릴리즈 파일이 없음 | Actions 워크플로 실행 여부, Releases 페이지 refresh |
| 자동 업데이트 안 됨 | publish repo가 `social-ai-team-custom`인지, macOS 서명 여부 |

이슈: https://github.com/contentscoin/social-ai-team-custom/issues

---

## 감사

원본 Social AI Team 기여자와, 한국어 팀 레이어·데스크톱·OpenCrab 확장을 이어 온 contentscoin 작업물에 기반합니다.
