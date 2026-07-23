# 광고·캠페인 프롬프트 팩 (내장 v1 — ad/campaign)
사진형 생성 모델(gpt-image-1, ima2, diffusion류)용 **광고·프로모션 키비주얼** 문법.
원칙: **광고는 "예쁜 사진"이 아니라 "한 가지 메시지를 파는 장면"이다.** 오퍼·후킹·욕망을 시각으로 번역한다.
프롬프트는 영어 기본(브랜드/제품 고유명사만 원문). image-prompt-pack의 골격·뱅크를 상속하고 아래 광고 문법을 덧댄다.

## 광고 이미지가 일반 이미지와 다른 점 (항상)
- **주인공은 오퍼(offer)다** — 제품/혜택/변화가 프레임을 지배해야 한다(배경·모델은 조연).
- **한 컷 = 한 메시지** — 여러 셀링포인트를 한 장에 우겨넣지 않는다. 후속 컷/캐러셀로 분산.
- **카피 자리(copy space)를 반드시 비운다** — 헤드라인·오퍼·CTA가 앱에서 얹힌다. 이미지 안엔 텍스트/로고/가격표 렌더 금지.
- **1초 후킹** — 썸네일 크기에서도 "무엇을 파는지" 즉시 읽혀야 한다(강한 단일 초점 + 고대비 1포인트).
- **행동 유발** — 손·사용 순간·결과(before→after)·희소성(마지막 재고/한정)으로 클릭 욕구를 만든다.

## 광고 앵글(컨셉) 뱅크 — objective/offer에서 1개 선택
- HERO PRODUCT: 제품 단독 히어로, 재질·디테일 극대화, 프리미엄 스튜디오 라이팅, 제품이 프레임 55–70%
- IN-USE / MOMENT: 손·사람이 제품을 쓰는 결정적 순간(따르기·바르기·베어물기), 결과가 보이게
- BEFORE→AFTER: 좌/우 또는 상/하 대비 프레이밍, 변화가 즉시 읽히게 동일 조명·앵글 유지
- LIFESTYLE ASPIRATION: 제품이 만드는 이상적 라이프스타일 장면, 동경 유발, 제품은 자연스럽게 히어로
- HYPERREAL DETAIL: 매크로로 texture·moisture·sheen 극대(음식·뷰티·소재), "먹고 싶다/만지고 싶다"
- FLAT LAY OFFER SET: 제품 + 구성품/사은품을 정돈 배치, 상단·측면에 카피 자리, 세트 가치 전달
- SEASONAL / PROMO: 시즌 소품·컬러로 프로모션 무드(신년·여름·명절), 오퍼 분위기, 과하지 않게
- SOCIAL PROOF: 다수의 제품/사용 흔적/리필 스택으로 "많이 쓴다"는 신뢰 신호(리뷰 수치는 텍스트로 앱이 얹음)
- URGENCY / SCARCITY: 마지막 한 개·재고 소진 연출(빈 진열·손이 집는 순간), 결핍의 시각화

## 카피 자리(copy space) 레시피 — 반드시 하나
- 좌측 35–45% 비움: 세로 헤드라인 + 오퍼 배지 자리 (제품은 우측 배치)
- 상단 25% 비움: 큰 헤드라인 밴드 자리 (제품은 하단 2/3)
- 하단 30% 비움: 오퍼·가격·CTA 밴드 자리 (제품은 상단 2/3)
- 중앙 제품 + 4:5/1:1 안전여백: 사방 15% 여백에 배지·태그 오버레이 여지
- 9:16(스토리/릴): 상단 18%·하단 15% 자막 안전지대 비우고 중앙 60%에 제품

## 오퍼 시각 신호 (텍스트 없이 오퍼를 암시)
- 세트/증정: 제품 + 사은품을 같은 프레임에 정돈, "더 준다"는 물량감
- 할인/프로모: 시즌 컬러·리본·택 없는 깔끔한 프로모 무드(가격표·%는 렌더 금지 — 앱이 얹음)
- 신제품: 클린 스튜디오 + spotlight, "처음 보는" 신선함, 개봉 순간·언박싱 결
- 리뉴얼/업그레이드: 신·구 대비 또는 강조 디테일 클로즈업(개선점이 보이게)
- 한정판: 특별 패키지·컬러 강조, 희소한 조명(rim light spotlight)

## 채널별 광고 노트
- 인스타/페북 피드(1:1·4:5): 강한 단일 히어로 + 좌/상 카피 자리, 썸네일 후킹 최우선
- 스토리/릴 키프레임(9:16): 첫 프레임에 제품·후킹, 자막 안전지대 확보, 손/모션 암시
- 카카오채널 메시지 카드: 작게 보임 — 제품 크게, 배경 단순, 오퍼 한 개만
- 네이버 블로그/클립 썸네일: 정보+욕망 균형, 실물 재현 우선(과장 톤 자제, 신뢰가 전환을 만든다)
- X: 작은 썸네일 즉시 판독 — 고대비, 형태 분리 뚜렷, 악센트 1색

## 광고 셀프 체크 (image-prompt 셀프체크에 더해)
1. 이 컷이 파는 "한 가지"가 무엇인지 한 문장으로 말할 수 있는가? (없으면 초점 분산 → 다시)
2. 헤드라인/오퍼/CTA가 들어갈 **빈 자리**를 명시했는가? (copy space 누락 = 실패)
3. 제품/혜택이 프레임의 주인공인가? (모델·배경이 제품을 잡아먹으면 조정)
4. 썸네일 크기로 줄였을 때도 "무엇을 파는지" 읽히는가?
5. 이미지 안에 가격·%·로고·문구를 렌더하려 하지 않았는가? (전부 앱이 얹는다 — negative에 반영)
6. objective/offer의 의도가 앵글 선택에 반영됐는가? (인지=ASPIRATION/HERO, 전환=IN-USE/URGENCY/BEFORE-AFTER, 신뢰=SOCIAL PROOF)

## objective → 광고 앵글 매핑 (기획 의도를 컨셉으로 번역)
- 브랜드 인지·도달 → LIFESTYLE ASPIRATION / HERO PRODUCT (동경·프리미엄감)
- 전환·판매·구매 유도 → IN-USE MOMENT / BEFORE-AFTER / URGENCY (행동·결과·결핍)
- 신제품 출시 → HYPERREAL DETAIL / HERO PRODUCT (신선함·디테일)
- 프로모션·세일 → SEASONAL PROMO / FLAT LAY OFFER SET (오퍼·물량감)
- 신뢰·재구매 → SOCIAL PROOF / IN-USE MOMENT (증거·일상성)

## 나쁜 예 → 좋은 예 (광고)
나쁨: "여름 세일 홍보 이미지. 목표: 전환율 상승. 20% 할인." (기획 언어 + 텍스트 렌더 요구)
좋음: "A single chilled glass bottle of iced brew as the clear hero, beads of cold condensation
catching light, on a sun-bleached summer table with a few ice cubes and a sprig of mint,
bright even softbox light with crisp speculars, vibrant summer palette of aqua and cream,
product placed on the right third with generous clean negative space on the upper-left for a
headline and offer badge, shallow depth of field, hyperreal moisture and glass texture,
professional color grading, photorealistic advertising still, absolutely no text, price tags,
percentages, or logos anywhere in the image."
