# 이미지 프롬프트 팩 (내장 v2 — quality)
사진형 생성 모델(gpt-image-1, ima2, diffusion류)용. 원칙: **기획 언어가 아니라 시각 언어로 쓴다.**
프롬프트는 영어가 기본(디퓨전 계열은 한국어 이해가 약함), 브랜드/제품 고유명사만 원문 유지.
목표: 스크롤을 멈추는 **캠페인급 스틸** — 재질·조명·구도가 또렷해야 한다.

## 퀄리티 바 (항상)
- 피사체 재질이 만져질 듯해야 함 (matte / gloss / weave / condensation 등 구체 어휘)
- 조명은 방향·대비가 분명해야 함 (flat ambient만 쓰지 말 것)
- 초점면이 분명해야 함 (soft mushy blur 금지 — 의도적 bokeh만 허용)
- 색은 브랜드 팔레트에 묶되, 과채도·플라스틱 피부 금지
- 한글·영문 텍스트/로고/워터마크 절대 금지 (타이포가 필요하면 claude-svg)

## 프롬프트 골격 (이 순서로 조립 — 한 문단)
1. SUBJECT — 무엇이 보이는가 (구체적 사물/인물/장면, 수량·재질·상태)
2. SETTING — 어디서 (배경, 시간대, 계절감, 소품 1–3개)
3. COMPOSITION — 구도 (아래 뱅크에서 1개)
4. LIGHTING — 조명 (아래 뱅크에서 1개)
5. STYLE — 스타일 앵커 (아래 뱅크에서 1-2개) + 렌즈감
6. COLOR — 브랜드 팔레트 반영 ("muted terracotta and cream tones" 식으로 색 이름화)
7. FINISH — sharp focus, natural texture, professional color grading, photorealistic campaign still
8. TEXT RULE — 텍스트 규칙 (필수)

## COMPOSITION 뱅크
- rule of thirds, subject on right third, generous negative space on the left for headline overlay
- centered symmetrical composition, product hero shot, clean margin around subject
- top-down flat lay, items arranged with intentional spacing, 12–15% padding at frame edges
- close-up macro with shallow depth of field (f/1.8–2.8), background softly blurred but readable
- eye-level candid perspective, environmental context visible, subject occupies ~40–55% of frame
- three-quarter product angle showing form + label plane without distortion
- 4:5 crop safety: keep key elements inside central 80%, nothing important near edges

## LIGHTING 뱅크
- soft window light from the left, gentle shadows, airy morning mood
- golden hour warm backlight with rim light, subtle lens bloom, cozy atmosphere
- bright even softbox studio lighting with controlled speculars, crisp e-commerce hero
- moody low-key lighting, single warm key, deep but detailed shadows
- overcast diffused daylight, true-to-life colors, no harsh shadows
- dual softbox + bounce card, commercial beauty lighting for product surfaces

## STYLE 앵커 뱅크
- editorial lifestyle photography, shot on 50mm lens, natural film grain
- premium product photography, minimal styling, high-end brand campaign look, 85mm compression
- authentic UGC-style smartphone photo, believable and lightly imperfect (still sharp subject)
- warm Korean café aesthetic, kinfolk magazine restraint
- vibrant food photography, appetizing micro-texture and moisture detail
- clean D2C catalog still with elevated materials styling

## TEXT RULE (필수 — 둘 중 하나)
- 오버레이 예정: "absolutely no text, no letters, no logos in the image; leave clean negative space at {위치}"
- 텍스트 불필요: "no text, letters, logos, or watermarks anywhere"
(디퓨전/이미지 모델의 한글 렌더링은 자주 깨진다 — 이미지 안에 한글을 넣으라는 지시는 금지.
한글 타이포가 필요하면 claude-svg 레인으로 보낼 것.)

## NEGATIVE 뱅크 (기본 — 항상 포함 권장)
blurry, soft focus, low resolution, jpeg artifacts, noise, overexposed, underexposed,
oversaturated, washed out colors, plastic skin, waxy texture, deformed hands, extra fingers,
mutated anatomy, distorted face, bad proportions, watermark, signature, logo,
garbled text, letters, typography, caption overlay, UI chrome, frame border,
duplicate subjects, cut-off subject, messy background clutter, AI artifacts, uncanny valley

## 포맷별 레시피
- single image(제품): SUBJECT=제품 클로즈업+재질 강조 / COMPOSITION=hero or three-quarter / LIGHTING=softbox / STYLE=premium product / FINISH 필수
- single image(라이프스타일): 손·사용 장면 포함 / candid perspective / window light / editorial lifestyle
- carousel 표지: 강한 단일 피사체 + 좌측 여백 (헤드라인 자리) / rule of thirds / 시리즈 응집용 동일 팔레트
- carousel 이어지는 장: 같은 피사체·조명·재질 유지, 앵글·크롭만 변경
- 인포그래픽·스탯·인용 카드: 사진 레인 금지 → claude-svg 레인 사용
- food: 45도 또는 top-down / appetizing micro-texture / vibrant food photography

## 질감·디테일 어휘 (SUBJECT를 살리는 것은 재질이다)
- 표면: matte ceramic, brushed steel, soft linen weave, weathered wood grain, frosted glass, powder-coated metal
- 음식: glistening moisture, delicate steam wisps, crisp golden edges, velvety crumb, oil sheen
- 피부/손: natural skin texture, soft-focus hands, warm undertones (플라스틱 피부 방지)
- 미세 요소: subtle condensation, fine dust motes in light, gentle fabric wrinkles, micro-scratches on metal

## 채널별 노트
- 인스타 피드(1:1·4:5): 스크롤 정지력 — 강한 단일 피사체, 높은 대비 1포인트, 중앙 80% 안전
- 스토리/릴스 키프레임(9:16): 세로 중앙 60%에 피사체, 상단 18% 캡션 안전지대 비우기
- 네이버 블로그 삽입컷: 밝고 정보적, 과한 무드보다 실물 재현 우선 (신뢰가 목적)
- 카드뉴스 표지(사진형): 좌측 35–40% negative space — 제목이 올라갈 자리

## 셀프 체크 (프롬프트 완성 후 반드시)
1. 기획 언어("브랜드 인지", "목표", "필러", "engagement")가 한 단어라도 남아 있으면 제거
2. 카메라가 찍을 수 없는 추상 개념("따뜻한 브랜드 가치")이 있으면 구체 사물로 치환
3. TEXT RULE 포함 여부 확인 — 빠졌으면 실패
4. 재질 어휘 1개 이상 + 조명 방향 1개 이상 확인
5. FINISH(sharp / texture / grading) 누락 시 추가
6. 문장이 아니라 명사구 나열이어도 좋다 — 밀도가 우선

## 나쁜 예 → 좋은 예
나쁨: "홈카페 라떼 아트. 앵글: 브랜드 인지 제고. 필러: 시즌 콘텐츠"
좋음: "A ceramic cup of latte with intricate rosetta latte art, on a warm wooden café table
beside a linen napkin, soft window light from the left with gentle shadows, editorial
lifestyle photography shot on 50mm, muted terracotta and cream tones, rule of thirds with
the cup on the right third and clean negative space on the left for headline overlay,
sharp focus, natural material texture, professional color grading, photorealistic campaign still,
absolutely no text or logos in the image"
