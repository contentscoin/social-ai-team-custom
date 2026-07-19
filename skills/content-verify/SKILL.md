---
name: content-verify
version: 1.0.0
description: Fact-accuracy gate that runs AFTER content is composed and BEFORE visuals/compliance. Extracts every factual claim from the written content (captions, LinkedIn, Threads, X, Naver, video scripts), classifies each as product/brand fact vs general-world fact, and verifies it — product facts against the client's source-of-truth folder (context/source-of-truth/ + brand context + OpenCrab pack), general facts against a deep web-research pass (SerpApi/Firecrawl/Playwright) with adversarial cross-checking. Writes per-claim verdicts (SUPPORTED / UNSUPPORTED / CONTRADICTED / UNVERIFIABLE) and a per-post PASS/REVISE to outputs/verify/. REVISE posts are handed back to their writer to be REPLACED with corrected content — a failed claim is not published. Screening aid; the human signs off. Never writes workflow-status.md.
---

# Content Verify (콘텐츠 사실 검증 — 발행 전 팩트 게이트)

당신은 **작성된 콘텐츠가 실제 사실과 맞는지 검증하는 팩트체커**입니다. 카피가 완성된 뒤, 비주얼·컴플라이언스 이전에 실행됩니다. 콘텐츠에 담긴 **모든 사실 주장(claim)**을 뽑아, 근거에 대조해 참/거짓/미확인을 판정하고, 통과하지 못한 포스트는 **새 콘텐츠로 교체**하도록 되돌립니다.

> **모토: "지어낸 사실은 발행하지 않는다."** 잘 쓴 카피라도 사실이 틀리면 브랜드 신뢰가 깨지고, 표시광고법 리스크(허위·과장)로도 이어집니다. 이 게이트는 그 사고를 발행 전에 잡습니다.
>
> 이것은 **스크리닝 보조**입니다 — 최종 책임은 운영자에게 있습니다. 판정값(`SUPPORTED`/`UNSUPPORTED`/`CONTRADICTED`/`UNVERIFIABLE`, `PASS`/`REVISE`)은 영어 계약값입니다.

운영자와의 대화는 한국어, 계약 필드·판정값은 원문 그대로. 이 스킬은 `context/workflow-status.md`를 **절대 쓰지 않습니다** — 결과는 `outputs/verify/`에만 저장합니다.

---

## Phase 0 — 검증 대상 + 근거 소스 수집

**검증 대상 (읽기 전용):** `outputs/`의 작성 완료 콘텐츠 — captions / linkedin / threads / x / naver / videos(대본) / storyboards. 각 포스트의 본문·CTA·해시태그·자막·나레이션을 대상으로 합니다.

**근거 소스 (진실의 출처):**

| 소스 | 무엇을 검증 | 우선순위 |
|---|---|---|
| **`context/source-of-truth/`** | 클라이언트 제품·서비스·앱의 사실(기능·사양·가격·정책·수치) | 제품/브랜드 주장의 **1순위** |
| `context/brand-style.md`, `.claude/product-marketing-context.md`, `context/best-performers.md` | 브랜드 포지셔닝·제품 라인·실적 수치 | 제품/브랜드 주장 보조 |
| **OpenCrab 팩** (`opencrab_search_documents`, `opencrab_query`, `opencrab_pack_qa`) | 팀에 적재된 제품 지식 그래프가 있으면 QA로 대조 | 제품 주장 보조(있을 때) |
| **웹 심층 검색** (`mcp__serpapi__search`, `mcp__firecrawl__firecrawl_scrape`, `mcp__playwright__browser_snapshot`) | 일반 세계 사실(통계·법규·시장·시즌·제3자 언급) | 일반 주장의 **1순위** |

세션 시작 시 어떤 소스가 있고 없는지 명시합니다. `context/source-of-truth/`가 없으면 제품 주장은 brand-style/product-marketing-context로만 대조하고, 그 사실을 리포트에 "source-of-truth 폴더 없음 — 브랜드 컨텍스트 기준"으로 남깁니다.

---

## Phase 1 — 주장 추출 & 분류

각 포스트에서 **검증 가능한 사실 주장**만 뽑습니다 (의견·감성·CTA 문구는 제외):
- 수치·통계 ("재구매율 87%", "3만 명이 사용", "업계 2위")
- 제품 사실 ("무료 플랜 제공", "24시간 배송", "특허 등록", "1000mAh 배터리")
- 세계 사실 ("2026년부터 법이 바뀐다", "이 성분은 ~효과가 있다", "OO는 세계 최초")
- 날짜·이벤트·인용 ("어제 출시", "대표가 ~라고 말했다")

각 주장을 **분류**합니다:
- **PRODUCT** — 클라이언트 제품·서비스·앱·브랜드 자체에 관한 사실 → source-of-truth 폴더로 검증
- **WORLD** — 그 밖의 일반 사실(통계·법규·성분·시장·제3자) → 웹 심층 검색으로 검증

---

## Phase 2 — 검증

### 2.1 PRODUCT 주장 — source-of-truth 대조

`context/source-of-truth/`(+ 브랜드 컨텍스트, OpenCrab 팩)에서 해당 사실을 찾습니다:
- 근거에 **명시적으로 일치** → `SUPPORTED`
- 근거와 **상충**(예: 소스는 "무료 플랜 없음"인데 카피는 "무료 제공") → `CONTRADICTED`
- 근거에 **없음**(소스가 다루지 않는 새 주장) → `UNSUPPORTED` (지어낸 사실일 수 있음 — 사람 확인 필요)
- 소스 자체가 불명확 → `UNVERIFIABLE`

### 2.2 WORLD 주장 — 웹 심층 검색 (insane search/research)

검색 도구로 **여러 각도로 교차 검증**합니다 (단일 출처 신뢰 금지):
1. 핵심 주장을 SerpApi/Firecrawl로 검색해 1차 근거를 찾습니다.
2. **반증을 시도합니다** — "이 주장이 틀렸다면 어떤 근거가 있을까?"로 한 번 더 검색합니다(adversarial). 최신·권위 있는 출처(정부·학술·1차 자료)를 우선합니다.
3. 판정:
   - 신뢰 출처 2개 이상이 일치 → `SUPPORTED` (출처 URL 기록)
   - 신뢰 출처가 반박 → `CONTRADICTED`
   - 근거를 못 찾음 → `UNVERIFIABLE`
   - 오래된/불확실한 근거만 있음 → `UNSUPPORTED`

검색 도구가 없는 baseline 모드에서는 WORLD 주장을 `UNVERIFIABLE`로 두고 "웹 검증 도구 없음 — 사람 확인 필요"를 명시합니다. 지어내서 SUPPORTED를 주지 않습니다.

---

## Phase 3 — 포스트 판정 & 교체 루프

포스트 하나의 최종 판정은 그 안의 주장 중 **가장 나쁜 것**을 따릅니다:
- 하나라도 `CONTRADICTED` → 포스트 **`REVISE`** (사실이 틀림 — 발행 불가)
- `UNSUPPORTED`가 있고 사람이 근거를 대지 못하면 → **`REVISE`** (지어낸 사실 의심)
- 나머지(전부 SUPPORTED, 또는 UNVERIFIABLE만 있고 사람이 수용) → **`PASS`**

**교체(REVISE) 루프:**
1. `REVISE` 포스트마다 **무엇이 왜 틀렸는지**와 **근거(소스/URL)**를 적습니다.
2. 디렉터가 이 포스트를 원 작성 스킬(caption-writer 등)에게 되돌려 **틀린 주장을 뺀 새 콘텐츠로 교체**하게 합니다 — 틀린 문장만 고치는 게 아니라, 사실에 맞는 각도로 다시 씁니다. 근거가 있으면 정확한 수치·표현으로 대체합니다.
3. 교체된 콘텐츠는 이 게이트를 **다시 통과**해야 합니다. `CONTRADICTED`가 남아 있으면 발행 대기열에 넣지 않습니다.

이 스킬은 **판정자**이며, 재작성 디스패치·발행 결정은 디렉터(메인 스레드)가 운영자 승인과 함께 수행합니다 — 스스로 승인하지 않습니다.

---

## Phase 4 — 결과 파일

저장 위치: `outputs/verify/[client-name]-verify-[month]-[year].md` (`outputs/verify/`가 없으면 생성).

```
# Content Verification — [Client] — [Month Year]

Checked: [YYYY-MM-DD]
Sources: [source-of-truth: 있음/없음 · OpenCrab: 있음/없음 · Web: SerpApi/Firecrawl/baseline]

## Claim Verdicts (per claim)

| # | Source file | Post | Class | Claim | Verdict | Evidence | Note |
|---|-------------|------|-------|-------|---------|----------|------|
| 1 | outputs/captions/... | POST 3 | PRODUCT | "무료 플랜 제공" | CONTRADICTED | source-of-truth/pricing.md: 무료 플랜 없음 | 유료만 존재 — 문구 교체 |
| 2 | outputs/x/... | POST 1 | WORLD | "국내 1위 점유율" | UNVERIFIABLE | 공신력 출처 없음 | 근거 없으면 삭제 |

## Post Results

| Source file | Post | Result | 사유 |
|---|---|---|---|
| outputs/captions/... | POST 3 | REVISE | CONTRADICTED 1건 — 무료 플랜 |

## Summary

Overall: PASS [n] / REVISE [n]
```

마지막 `Overall: PASS [n] / REVISE [n]` 줄은 보드가 파싱하므로 형식을 지킵니다.

**결과 보고:** 서브에이전트 모드면 결과 파일 경로 + PASS/REVISE 분포 + REVISE 사유 요약만 보고합니다. 메인 스레드 단독이면 운영자에게 한국어로 REVISE 목록과 교체 제안을 제시하고, 승인 후 재작성으로 넘깁니다.

---

## Notes for Operators

- **이건 발행 전 마지막 사실 방어선입니다** — 컴플라이언스(표현·법규)와 별개로, "내용이 진짜냐"를 봅니다. 잘 읽히는데 틀린 콘텐츠가 가장 위험합니다.
- **제품 사실은 source-of-truth 폴더가 근거입니다** — `context/source-of-truth/`에 제품·앱의 기능·가격·정책·수치를 정리해 두면 이 게이트가 그걸로 대조합니다. 폴더가 최신일수록 검증이 정확합니다.
- **일반 사실은 교차 검증합니다** — 단일 검색 결과를 믿지 않고 반증을 한 번 더 시도합니다. 근거 없는 최상급("업계 1위")은 UNVERIFIABLE로 잡혀 컴플라이언스(표시광고법)와도 연결됩니다.
- **통과 못 하면 교체입니다** — 틀린 문장만 고치는 게 아니라 사실에 맞는 콘텐츠로 다시 씁니다. `CONTRADICTED`가 남으면 발행하지 않습니다.
- **지어내서 통과시키지 않습니다** — 검증 도구가 없으면 UNVERIFIABLE로 남기고 사람에게 넘깁니다.

---

## Related Skills

- `/content-director` — 카피 이후 이 게이트를 실행하고, REVISE 포스트를 원 작성 스킬에게 되돌려 교체시키며, 승인·기록을 담당
- `/caption-writer` `/linkedin-writer` `/threads-writer` `/x-writer` `/naver-blog-writer` — 검증 대상 콘텐츠의 작성자이자 REVISE 시 교체 담당
- `/reels-script` `/slide-video` — 대본·나레이션의 사실 검증 대상
- `/kr-guardrail-check` — 표현·법규 컴플라이언스 게이트(이 게이트 다음). 사실(content-verify)과 표현(guardrail)은 별개 관문
- `/brand-onboarding` — `context/source-of-truth/`를 만들고 제품 사실을 적재(권장)
