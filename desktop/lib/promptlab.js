// 프롬프트 컴파일러 — "기획 언어"를 "시각 언어"로 바꾼다.
// 재료: 브랜드 팔레트(brand-style.md) + 캘린더 필드 + 카피의 영문 VISUAL DIRECTION + 프롬프트 팩.
// 1차: claude -p 컴파일(엄격 JSON) → 실패 시 2차: 규칙 기반 템플릿 조립 (오프라인 폴백).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { runCmd } = require('./proc');
const config = require('./config');
const engine = require('./engine');
const imagestyles = require('./imagestyles');
const channelsheets = require('./channelsheets');
const { findVisualDirection } = require('./postblock');

// ---- 팩 로딩 ----------------------------------------------------------------------
const BUILTIN_DIR = path.join(__dirname, '..', 'packs');
const USER_DIR = path.join(os.homedir(), '.social-ai-team', 'packs');

// 채널별 이미지 아트 디렉션 — 플랫폼 특성(인스타=부러운 연출 사진 우선, 스레드=스크롤 멈추는
// 단독컷+체인 시퀀스, 블로그=깔끔한 정보 보조컷)을 컴파일에 최우선 축으로 주입한다.
// 공냥 9철칙 준수: 무대지정(전문가처럼/세련된)·SD어휘 없이 재질·조명·색을 '결과'로 서술,
// 이미지 내 텍스트/로고 금지(앱이 따로 얹음).
const PLATFORM_DIRECTION = {
  instagram:
    'aspirational editorial hero frame — one confident focal subject with everything else subordinate to it, '
    + 'cinematic shallow depth of field, soft directional daylight raking from one side casting long gentle shadows, '
    + 'muted palette drawn from #F5F1E8 #1C1A17 #8C7B6B, generous clean negative space around the subject, tight editorial crop, '
    + 'matte film-grain finish, natural skin texture with visible pores, an enviable effortless-lifestyle moment that stops the scroll on its own — the photograph itself carries the hook',
  threads:
    'scroll-stopping single frame that reads instantly in a fast feed, one oversized focal subject held with a decisive crop, '
    + 'high-contrast accent light, calm uncluttered surround so the subject dominates, natural skin texture with visible pores; '
    + 'one beat in a continuing chain — hold the same setting, lighting character and palette (HEX carried from the chain DNA) steady across frames while sweeping only angle, distance and detail; '
    + 'lead with hands, objects and space rather than a repeated face, favor honest curiosity over glossy perfection',
  naver:
    'clean brightly and evenly lit informative supporting photograph illustrating one specific article section and nothing more, '
    + 'true-to-life documentary detail with honest color, seamless neutral stage around #FAFAFA carrying a single soft grounding shadow, '
    + 'tidy calm composition with the key detail centered and legible, real-world surfaces described by how they catch light '
    + '(matte paper grain, soft fabric nap, gentle product sheen), supportive and unobtrusive',
  facebook:
    'warm approachable real-moment photograph, one clear relatable subject in soft natural light, authentic everyday warmth, '
    + 'honest color and natural texture, natural skin texture with visible pores',
  linkedin:
    'composed credible editorial photograph, one subject in even soft light, restrained cool-neutral palette, '
    + 'clean uncluttered framing, calm trustworthy composition, natural skin texture with visible pores',
  x:
    'bold high-contrast single frame that reads instantly at thumbnail scale, one focal subject with strong graphic clarity, '
    + 'decisive crisp lighting and clean shape separation, natural skin texture with visible pores when a person is shown, immediate at small size',
};
// 컴파일 지시문에 넣을 플랫폼 아트 디렉션 블록(영상은 제외). 없으면 ''.
function platformDirective(channel, kind) {
  if (kind === 'video') return '';
  const d = PLATFORM_DIRECTION[channel];
  return d
    ? `\n[플랫폼 아트 디렉션 — ${channel} · 최우선 축]\n${d}\n`
      + `이 방향을 장면의 최우선 축으로 삼되 VISUAL DIRECTION·브랜드 무드와 결합하라. 이미지 안에는 텍스트/로고를 넣지 말라(앱이 따로 얹는다).\n\n`
    : '';
}

/** 사진형 모델 공통 — 디테일·사실감 앵커 (프롬프트 꼬리에 합침). 일반어("ultra detailed") 대신
 *  구체적 질감·초점·빛 언어로 실제 디테일을 끌어낸다. */
const QUALITY_TAIL =
  'crisp fine detail with true-to-life material textures, one hero element in sharp focus with ' +
  'gentle depth-of-field falloff, natural light shaping highlights and soft shadows, faithful color ' +
  'rendition, clean noise-free finish, photorealistic campaign still';

// ---- 컷 변주(단조로움 방지) ---------------------------------------------------------
// 포스트마다 다른 구도·앵글·거리를 결정론적으로 배정해, 같은 채널의 컷들이 정면·중앙·같은 배경으로
// 수렴하는 문제를 막는다. 주체·팔레트·브랜드 톤은 유지하고 '어떻게 보여주는가'만 바꾼다.
const SHOT_RECIPES = [
  { key: 'establishing', en: 'wide establishing shot with real environmental context, the subject placed within a layered scene, deep background' },
  { key: 'macro', en: 'tight macro close-up on the key detail, extreme shallow depth of field, texture forward' },
  { key: 'overhead', en: 'top-down overhead flat-lay, clean geometric arrangement, even orthographic framing' },
  { key: 'candid', en: 'candid in-hands or over-the-shoulder angle with a sense of motion, subject off-center' },
  { key: 'lowhero', en: 'low-angle hero shot looking slightly up, bold aspirational presence, strong foreground' },
  { key: 'negative', en: 'minimalist composition with generous negative space, subject on a rule-of-thirds line, calm and airy' },
  { key: 'diagonal', en: 'dynamic diagonal composition with leading lines and energetic asymmetry' },
  { key: 'story', en: 'medium shot pairing the subject with one supporting prop that tells a small human story' },
];
function hashSeed(s) { let h = 0; const str = String(s || ''); for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0; return h; }
function shotRecipe(seed) { return SHOT_RECIPES[hashSeed(seed) % SHOT_RECIPES.length]; }
// 카루셀 i번째 슬라이드 프레이밍 — 포스트 시드로 시작점을 흩뿌려 시리즈끼리도 프레이밍이 겹치지 않게.
function shotFraming(i, seed) { return SHOT_RECIPES[(hashSeed(seed) + (Number(i) || 0)) % SHOT_RECIPES.length]; }

// 컴파일 지시문에 넣을 컷 변주 블록(영상 제외).
function varietyDirective(job) {
  if (job.kind === 'video') return '';
  const r = shotRecipe(job.varietySeed || `${job.channel || ''}-${job.topic || ''}`);
  return `\n[컷 변주 — 단조로움 방지 · 구도 최우선 축]\n`
    + `이 컷의 구도·앵글·거리는 다음을 기본 축으로 장면에 맞게 적용하라: ${r.en}.\n`
    + `같은 채널의 다른 컷들과 프레이밍·시점·거리·시간대·배경이 뚜렷이 달라야 한다 — 정면·아이레벨·중앙배치·같은 배경의 반복을 피하라. 주체·팔레트·브랜드 톤은 유지하되 '어떻게 보여주는가'를 매 컷 바꿔라.\n\n`;
}

// 디테일 레이어 — 구체 표면질감·깊이·히어로 초점으로 정밀도를 끌어올린다(영상 제외).
const DETAIL_BLOCK =
  `\n[디테일 레이어 — 사실감·정밀도]\n`
  + `주체에 어울리는 구체적 표면 질감을 최소 2가지 명시하라(예: 유리의 결로·물방울, 원단의 짜임, 나무 결, 빵의 크럼 구조, 브러시드 메탈 그레인, 피부의 모공·솜털). `
  + `전경·중경·배경의 깊이 단서를 넣고 초점이 맞는 히어로 디테일 1곳을 지정하라. 빛이 재질에 닿아 만드는 하이라이트·미세 그림자·반투명감을 서술해 촉각적 사실감을 높여라.\n\n`;

const DEFAULT_NEGATIVE =
  'blurry, soft focus, low resolution, jpeg artifacts, noise, overexposed, underexposed, ' +
  'oversaturated, washed out colors, plastic skin, waxy texture, deformed hands, extra fingers, ' +
  'mutated anatomy, distorted face, bad proportions, watermark, signature, logo, ' +
  'garbled text, letters, typography, caption overlay, UI chrome, frame border, ' +
  'duplicate subjects, cut-off subject, messy background clutter, AI artifacts, uncanny valley';

function listPacks() {
  const packs = [];
  const scan = (dir, source) => {
    try {
      for (const f of fs.readdirSync(dir)) {
        if (!/\.(md|txt|json)$/i.test(f)) continue;
        const p = path.join(dir, f);
        const st = fs.statSync(p);
        if (st.size > 512 * 1024) continue; // 팩은 참조 노트다 — 거대 파일 제외
        packs.push({ name: f.replace(/\.(md|txt|json)$/i, ''), file: f, source, size: st.size, path: p });
      }
    } catch { /* 폴더 없음 */ }
  };
  scan(BUILTIN_DIR, 'builtin');
  scan(USER_DIR, 'user');
  return packs;
}
function deletePack(file) {
  // 사용자 팩만 삭제 가능 (내장 팩은 앱 자산)
  const p = path.join(USER_DIR, path.basename(file));
  try { fs.unlinkSync(p); return { ok: true }; } catch (e) { return { ok: false, error: e.message }; }
}
function savePack(name, content) {
  fs.mkdirSync(USER_DIR, { recursive: true });
  const safe = String(name).replace(/[^\w가-힣 .-]/g, '').slice(0, 80) || 'pack';
  const p = path.join(USER_DIR, safe + '.md');
  fs.writeFileSync(p, String(content).slice(0, 512 * 1024));
  return { ok: true, file: safe + '.md' };
}
// kind에 맞는 팩 본문을 합쳐 컴파일 컨텍스트로 (예산 내 절단)
function packContext(kind, budget = 12000, opts = {}) {
  const want = kind === 'video' ? /video|영상|모션|motion/i
    : (kind === 'svg' ? /svg|디자인|design|typo|cardnews|카드뉴스/i
      : /image|이미지|photo|프롬프트|prompt/i);
  const all = listPacks();
  let picked = all.filter((p) => want.test(p.name) || want.test(p.file));
  // 캐러셀·카드뉴스면 카드뉴스 팩도 함께 (표지 여백·시리즈 응집)
  if (opts.carousel || /carousel|카드뉴스|cardnews|슬라이드/i.test(String(opts.format || ''))) {
    const extra = all.filter((p) => /cardnews|카드뉴스/i.test(p.name + p.file));
    for (const e of extra) if (!picked.find((x) => x.path === e.path)) picked.push(e);
  }
  // 매칭이 없으면 이름과 무관하게 전부 (사용자가 팩 이름을 자유롭게 지었을 수 있다)
  const use = picked.length ? picked : all;
  let out = '';
  for (const p of use) {
    if (out.length > budget) break;
    try { out += `\n\n===== PACK: ${p.name} (${p.source}) =====\n` + fs.readFileSync(p.path, 'utf8').slice(0, budget - out.length); } catch { /* skip */ }
  }
  return out.trim();
}

// ---- 브랜드 컨텍스트 추출 ------------------------------------------------------------
function sectionSlice(md, titles, max = 900) {
  const lines = String(md || '').split(/\r?\n/);
  const titleRe = new RegExp(String.raw`^#{1,3}\s*(?:${titles})\b`, 'i');
  let i = lines.findIndex((l) => titleRe.test(l.trim()));
  if (i < 0) return '';
  const out = [];
  for (let j = i + 1; j < lines.length; j++) {
    if (/^#{1,3}\s+/.test(lines[j])) break;
    out.push(lines[j]);
  }
  return out.join('\n').trim().slice(0, max);
}
function brandContext(dir) {
  let md = '';
  try { md = fs.readFileSync(path.join(dir, 'context', 'brand-style.md'), 'utf8'); } catch { /* 없음 */ }
  if (!md) return { palette: [], summary: '', dos: '', donts: '', photography: '', identity: '' };
  const palette = [...new Set([...md.matchAll(/#[0-9a-f]{6}\b/gi)].map((m) => m[0]))].slice(0, 6);
  // 요약: 무드/톤/타깃 관련 줄만 앞쪽에서 추림
  const lines = md.split(/\r?\n/).filter((l) => /무드|톤|mood|tone|타깃|target|personality|퍼스낼리티|스타일|aesthetic|팔레트|color|photography|비주얼/i.test(l)).slice(0, 14);
  const dos = sectionSlice(md, 'DO|Dos|해야\\s*할|권장');
  const donts = sectionSlice(md, "DON'?T|Donts|하지\\s*말|금지|피해야");
  const photography = sectionSlice(md, 'Visual Photography Style|Photography|비주얼|사진\\s*스타일|Visual Style');
  // 브랜드 정체성 — 회사명·취급 제품/서비스·로고. 마스터 시트에 반영할 사실(이미지엔 텍스트로 굽지 않음).
  const idSection = sectionSlice(md, 'Brand Identity|브랜드\\s*정체성|회사|기업|소개|About|제품|서비스|Products?|Services?|Company|취급\\s*품목|업종');
  const idLines = md.split(/\r?\n/).filter((l) => /회사명|상호|브랜드명|제품명|제품\s*[:：]|서비스\s*[:：]|로고|logo|메뉴|판매|취급|업종/i.test(l)).slice(0, 12).join('\n');
  return {
    palette,
    summary: lines.join('\n').slice(0, 1400),
    dos: dos.slice(0, 700),
    donts: donts.slice(0, 700),
    photography: photography.slice(0, 700),
    identity: (idSection || idLines).slice(0, 800),
  };
}

function sizeCropNote(size) {
  if (size === 'story') return '9:16 vertical: keep subject in central 60% height, leave top 18% clear for captions, avoid edge-critical details';
  if (size === 'portrait') return '4:5 portrait: keep hero elements inside central 80%, leave soft negative space for optional headline';
  if (size === 'landscape') return '16:9-ish landscape: strong horizontal read, subject slightly off-center, clean sky/ground separation';
  return '1:1 square: single dominant subject, high contrast focal point, margins clean';
}

// ---- 규칙 기반 폴백 컴파일러 -----------------------------------------------------------
const RECIPES = {
  image: {
    product: {
      setting: 'seamless studio set with subtle reflective surface',
      comp: 'centered product hero shot, clean margins, subject fills ~55% of frame',
      light: 'bright even softbox key light with soft fill, controlled specular highlights',
      style: 'premium product photography, high-end brand campaign still, 85mm look, tack-sharp detail',
    },
    lifestyle: {
      setting: 'lived-in real environment with believable props and depth',
      comp: 'rule of thirds, subject on the right third, generous negative space on the left for headline overlay',
      light: 'soft window light from the left, gentle shadows, airy morning mood',
      style: 'editorial lifestyle photography, shot on 50mm, natural film grain, Kinfolk-adjacent restraint',
    },
    food: {
      setting: 'styled tabletop with complementary props, no clutter',
      comp: '45-degree or top-down flat lay with 12–15% padding at frame edges',
      light: 'overcast diffused daylight, true-to-life colors, appetizing speculars',
      style: 'vibrant food photography, micro-texture emphasis, steam or moisture where natural',
    },
  },
  videoCam: 'Slow dolly-in toward the subject',
  videoAtmo: 'light shifts warmer, dust particles drifting softly in the light beam',
};
function templateCompile(job, brand, vd) {
  const paletteStr = brand.palette.length ? `brand color tones ${brand.palette.join(' ')}` : 'cohesive natural palette';
  if (job.kind === 'video') {
    const base = vd || job.prompt || job.topic || 'the subject in the keyframe';
    return {
      prompt: `${RECIPES.videoCam} as the scene comes alive: ${base}. Subtle natural motion only — steam, light, or fabric. ${RECIPES.videoAtmo}. No new objects, no scene cuts, no text.`,
      negative: '',
      via: 'template',
    };
  }
  const blob = `${job.prompt || ''} ${job.topic || ''} ${job.format || ''} ${vd || ''}`;
  const fmt = /food|음식|카페|베이커리|디저트|맛집/i.test(blob) ? 'food'
    : (/product|제품|언박싱|상세|패키지|bottle|pack/i.test(blob) ? 'product' : 'lifestyle');
  const r = RECIPES.image[fmt];
  const subject = vd || job.prompt || job.topic || 'the described scene';
  const avoid = [DEFAULT_NEGATIVE];
  if (brand.donts) avoid.push(brand.donts.replace(/\n+/g, ', ').slice(0, 280));
  return {
    prompt: [
      subject.replace(/\s+/g, ' ').trim(),
      `Setting: ${r.setting}`,
      `Composition: ${r.comp}`,
      `Lighting: ${r.light}`,
      `Style: ${r.style}`,
      `Color: ${paletteStr}`,
      sizeCropNote(job.size),
      QUALITY_TAIL,
      'absolutely no text, letters, logos, or watermarks in the image',
    ].join('. ') + '.',
    negative: avoid.join(', '),
    via: 'template',
  };
}

// ---- Claude 컴파일 (1차 경로) ----------------------------------------------------------
function parseJsonLoose(out) {
  try { return JSON.parse(out.trim()); } catch { /* fall through */ }
  const m = String(out).match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch { /* nope */ } }
  return null;
}
// 공냥 프롬프트 킷 — 설치돼 있으면 앱 이미지 프롬프트도 이 킷 문법으로 컴파일한다.
const KIT_SKILL = path.join(os.homedir(), '.claude', 'skills', 'image-prompt', 'SKILL.md');
const KIT_VALIDATOR = path.join(os.homedir(), '.claude', 'skills', 'image-prompt', 'scripts', 'check_prompt.mjs');
function kitInstalled() { try { return fs.existsSync(KIT_SKILL); } catch { return false; } }

// 킷 검증기(check_prompt.mjs)로 프롬프트 본문을 점검 — { ok, errors[] }. 실패해도 생성은 막지 않고 신호만.
// 검증기는 인자 없이 실행하면 stdin(fd 0)을 읽는다. 앱 프롬프트는 킷의 Format A 평문이 아니라
// 6요소 콤마형이라 형식 어휘 오류(E-*-LANG/E-AR-END/E-CAT-LANG 등)가 늘 뜬다 — 이는 품질 문제가
// 아니므로 무시하고, 보편적으로 나쁜 오류(SD 구식 어휘·부정문 누수·슬롯 토큰 누수)만 신호로 남긴다.
const KIT_CRITICAL = /SD-VOCAB|NEG-TIER|NEG-SECTION|SLOT-LEAK|WEIGHT|SLASH/i;
async function validateWithKit(promptText) {
  if (!fs.existsSync(KIT_VALIDATOR)) return null;
  try {
    const r = await runCmd('node', [KIT_VALIDATOR], null, { stdinText: promptText, timeoutMs: 20000 });
    const j = JSON.parse((r.out || '').trim().split('\n').filter(Boolean).pop() || '{}');
    const errors = (j.errors || []).map((e) => e.code || e.msg).filter((c) => KIT_CRITICAL.test(String(c)));
    return { ok: errors.length === 0, errors: errors.slice(0, 6) };
  } catch { return null; }
}

async function claudeCompile(dir, job, brand, vd, onLine) {
  const kitOn = job.kind !== 'video' && kitInstalled();
  const packs = packContext(job.kind === 'video' ? 'video' : 'image', 12000, {
    format: job.format,
    carousel: /carousel|카드뉴스|cardnews|슬라이드/i.test(String(job.format || '')) || Number(job.count) > 1,
  });
  const target = job.kind === 'video'
    ? `${job.provider} (image-to-video/text-to-video 영상 모델)`
    : `${job.provider} (사진형 이미지 생성 모델)`;
  const kitDirective = kitOn
    ? `\n[공냥 프롬프트 킷 적용 — 필수]\n`
      + `먼저 ${KIT_SKILL} 를 읽고 그 라우팅 표로 카테고리를 정한 뒤, 9 철칙을 지켜 컴파일하라:\n`
      + `- 장면 배제는 전부 긍정형(부정문 금지 — 군중 대신 "인물 한 명, 단독", 빈 배경 대신 "깨끗한 단색 배경").\n`
      + `- SD 구식 어휘 금지: masterpiece/best quality/8k/4k/uhd/ultra-detailed/highly detailed/"sharp focus" 나열/(word:1.3) 가중치/--ar/--v.\n`
      + `- HEX 팔레트 3~5색을 색 이름과 함께 명시. 카메라·조명은 장비명(EXIF/렌즈명) 대신 결과로 서술(shallow DoF, warm key + cool rim).\n`
      + `- 이상적 피부 금지 → natural skin texture, visible pores. 추상어는 구체 사물·제스처로 환원. 앞머리 [AR/SIZE] 브래킷 금지.\n`
      + `단, 이 앱의 사진형 이미지 모델용이므로: 프롬프트는 영어, 이미지 내 텍스트/로고 렌더 금지(TEXT RULE — 텍스트는 앱이 따로 얹는다), negative는 아래 JSON의 negative 필드로 분리한다. SD 퀄리티 꼬리(sharp focus 등)는 붙이지 말고 킷 문법의 재질·조명·색으로 퀄리티를 낸다.\n\n`
    : '';
  const platformBlock = platformDirective(job.channel, job.kind);
  // 채널 시트 — 마스터/캐릭터/지침 텍스트를 주입(락 걸리면 최우선+레퍼런스 앵커, 아니면 스타일 가이드).
  const sheetBlock = job.kind !== 'video' ? channelsheets.compileDirective(dir, job.channel) : '';
  const varietyBlock = varietyDirective(job); // 컷 변주(단조 방지)
  const detailBlock = job.kind !== 'video' ? DETAIL_BLOCK : ''; // 디테일 레이어
  const instr =
    `너는 시니어 비주얼 프롬프트 엔지니어다. 아래 재료로 ${target}에 넣을 **고퀄리티** 최종 생성 프롬프트를 만들어라.\n` +
    kitDirective +
    sheetBlock +
    platformBlock +
    varietyBlock +
    detailBlock +
    `[규칙]\n` +
    `- 기획 언어(목표/필러/앵글/engagement)를 그대로 옮기지 말고 카메라가 찍을 수 있는 시각 언어로 번역하라.\n` +
    `- 채널 스타일 시트·플랫폼 아트 디렉션은 스타일의 하드 제약이다 — 팔레트·조명·무드·주체를 그대로 따르고, 운영자 브리프·VD와 스타일이 충돌하면 시트가 우선한다.\n` +
    `- 프롬프트는 영어 (브랜드·제품 고유명사는 원문 유지).\n` +
    `- 이미지 프롬프트는 반드시 이 6요소를 한 문단(또는 콤마 연결)으로 포함:\n` +
    `  1) SUBJECT 구체 사물·수량·재질·상태  2) SETTING/장소·시간대  3) COMPOSITION 구도(위 컷 변주 축 반영)\n` +
    `  4) LIGHTING 조명  5) STYLE+렌즈감  6) COLOR(브랜드 팔레트 색 이름화)\n` +
    (kitOn
      ? `- 프롬프트 본문은 전부 긍정형 — "no text/no logo" 같은 부정문을 본문에 넣지 말라. 텍스트·로고·워터마크 회피는 JSON의 negative 필드에만 넣는다.\n`
      : `- 마지막에 TEXT RULE 필수: absolutely no text, letters, logos, or watermarks.\n`
      + `- 퀄리티 앵커를 자연스럽게 포함: sharp focus, natural material texture, professional color grading, photorealistic campaign still.\n`) +
    `- 추상 개념("따뜻한 브랜드 가치")은 구체 사물·제스처·소품으로 치환.\n` +
    `- 대상 사이즈 ${job.size || 'square'} — ${sizeCropNote(job.size)}.\n` +
    `- VISUAL DIRECTION이 있으면 최우선 재료. 팩의 COMPOSITION/LIGHTING/STYLE 뱅크에서 1개씩 고르되 장면과 맞을 것.\n` +
    `- 브랜드 DON'T가 있으면 negative에 영문 키워드로 반영.\n` +
    `- 영상이면 카메라 1개 + 피사체 모션 1-2개 + 분위기 1개, 3문장 이내. negative는 "".\n` +
    `- 셀프체크: 기획 언어 잔존 제거, 추상→구체, TEXT RULE 확인, 재질 어휘 1개 이상.\n` +
    `- 출력은 JSON 하나만: {"prompt":"...","negative":"..."} (코드펜스 금지)\n\n` +
    `[포스트 재료]\n주제: ${job.topic || '-'}\n채널/포맷: ${job.channel || '-'} / ${job.format || '-'}\n운영자 브리프: ${job.prompt || '-'}\n` +
    (vd ? `카피라이터의 VISUAL DIRECTION (가장 중요한 재료): ${vd}\n` : '') +
    (brand.summary ? `\n[브랜드 무드]\n${brand.summary}\n` : '') +
    (brand.photography ? `\n[브랜드 포토 스타일]\n${brand.photography}\n` : '') +
    (brand.dos ? `\n[브랜드 DO]\n${brand.dos}\n` : '') +
    (brand.donts ? `\n[브랜드 DON'T — negative에 반영]\n${brand.donts}\n` : '') +
    (brand.palette.length ? `브랜드 팔레트: ${brand.palette.join(' ')}\n` : '') +
    `\n[프롬프트 팩]\n${packs}`;
  // 선택 엔진으로 — '비주얼 생성' 단계 엔진을 따른다(단계별 오버라이드 존중)
  const r = await engine.runText(dir, instr, { engine: config.getEngineFor('visuals-generate'), json: true, timeoutMs: 120_000 });
  if (!r.ok) return null;
  let outer = parseJsonLoose(r.out);
  // claude json 모드는 {result: "..."} 래핑 — 내부 JSON을 다시 파싱 (codex는 원본 JSON이라 그대로)
  const inner = outer && typeof outer.result === 'string' ? parseJsonLoose(outer.result) : outer;
  if (inner && typeof inner.prompt === 'string' && inner.prompt.length > 20) {
    let prompt = inner.prompt.trim();
    if (kitOn) {
      // 킷 켜짐: 본문은 긍정형 유지 — 텍스트/SD 꼬리를 본문에 안 붙인다. 검증기로 본문을 점검.
      const v = await validateWithKit(prompt);
      onLine && onLine(v ? `[prompt] 컴파일 완료 (공냥 킷 적용 · 검증 ${v.ok ? 'PASS' : 'WARN: ' + v.errors.join(',')})` : '[prompt] 컴파일 완료 (공냥 킷 적용)');
    } else {
      // 킷 꺼짐: 기존 동작 — 본문에 TEXT RULE·퀄리티 꼬리 보강
      if (!/no text|no letters|no logos/i.test(prompt)) {
        prompt += ', absolutely no text, letters, logos, or watermarks in the image';
      }
      if (!/sharp focus|photoreal|ultra detailed|high detail/i.test(prompt)) {
        prompt += `, ${QUALITY_TAIL}`;
      }
      onLine && onLine('[prompt] 컴파일 완료 (claude · quality v2)');
    }
    let negative = String(inner.negative || '').trim();
    // 킷 켜짐: 텍스트 회피를 본문 대신 negative 필드로 (본문 긍정형 유지, 제공자 negative 파라미터로 전달)
    if (kitOn && !/text|letters|logo|watermark/i.test(negative)) {
      negative = negative ? `${negative}, text, letters, logos, watermark` : 'text, letters, logos, watermark';
    }
    if (!negative) negative = DEFAULT_NEGATIVE;
    else if (!/blurry|deformed|watermark/i.test(negative)) negative = `${negative}, ${DEFAULT_NEGATIVE}`;
    if (brand.donts) {
      const d = brand.donts.replace(/[#*\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
      if (d) negative += `, avoid brand don'ts: ${d}`;
    }
    return { prompt: prompt.slice(0, 3200), negative: negative.slice(0, 900), via: 'claude' };
  }
  return null;
}

/**
 * OpenAI/ima2처럼 native negative가 약한 레인용 —
 * 프롬프트 본문에 회피 지시를 합쳐 전달한다.
 */
function finalizeImagePrompt(prompt, negative) {
  let p = String(prompt || '').trim();
  const neg = String(negative || '').trim();
  if (!p) return p;
  if (!/no text|no letters|no logos/i.test(p)) {
    p += ', absolutely no text, letters, logos, or watermarks in the image';
  }
  if (!/sharp focus|photoreal|ultra detailed/i.test(p)) {
    p += `, ${QUALITY_TAIL}`;
  }
  if (neg) {
    // 중복 Avoid 블록 방지
    if (!/\bAvoid:\s*/i.test(p)) p += `. Avoid: ${neg}`;
  }
  return p.replace(/\s+/g, ' ').trim().slice(0, 3800);
}

// 선택된 스타일 프리셋을 최종 프롬프트 앞부분에 명시(컴파일러가 바꿔도 스타일은 보장).
// 이미 같은 계열 단어가 있으면 중복하지 않는다.
function applyStyle(c, styleKey, onLine) {
  const dir = imagestyles.directiveFor(styleKey);
  if (!dir || !c || !c.prompt) return c;
  // 지시어 '전체'가 이미 있을 때만 중복 생략 — 첫 단어(예: 'photorealistic')로 판단하면
  // 품질 꼬리(QUALITY_TAIL)의 'photorealistic finish'와 충돌해 실사형 프리셋이 통째로 무시됐다.
  if (String(c.prompt).toLowerCase().includes(dir.toLowerCase())) return c;
  onLine && onLine(`[prompt] 스타일 프리셋 적용 · ${imagestyles.labelFor(styleKey)}`);
  return { ...c, prompt: `${dir}. ${c.prompt}`.replace(/\s+/g, ' ').trim().slice(0, 3800), style: styleKey };
}

// job: {kind:'image'|'video', provider, topic, channel, format, lane, prompt(운영자 브리프), size, duration, count?, style?}
async function compile(dir, job, onLine) {
  const brand = brandContext(dir);
  const styleKey = imagestyles.isValid(job.style) ? job.style : '';
  let vd = null;
  if (job.lane && job.topic) {
    try { vd = findVisualDirection(dir, job.lane, job.topic); } catch { /* 없음 */ }
    if (vd) onLine && onLine('[prompt] 카피의 VISUAL DIRECTION 발견 — 1급 재료로 사용');
  }
  // claude-svg 레인은 컴파일 대상이 아니다 — 자체 디자인 브리프를 쓴다 (render.js에서 팩 주입)
  if (job.provider === 'claude-svg') {
    return applyStyle({ ok: true, prompt: job.prompt, negative: '', via: 'svg-passthrough', vd }, styleKey, onLine);
  }
  onLine && onLine('[prompt] 프롬프트 컴파일 중… (quality v2)');
  try {
    const c = await claudeCompile(dir, job, brand, vd, onLine);
    if (c) return applyStyle({ ok: true, ...c, vd }, styleKey, onLine);
  } catch { /* 폴백으로 */ }
  onLine && onLine('[prompt] claude 컴파일 실패 — 템플릿 폴백 사용');
  return applyStyle({ ok: true, ...templateCompile(job, brand, vd), vd }, styleKey, onLine);
}

module.exports = {
  compile,
  listPacks,
  deletePack,
  savePack,
  packContext,
  brandContext,
  finalizeImagePrompt,
  QUALITY_TAIL,
  DEFAULT_NEGATIVE,
  PLATFORM_DIRECTION,
  SHOT_RECIPES,
  shotRecipe,
  shotFraming,
  _platformDirective: platformDirective,
  _varietyDirective: varietyDirective,
};
