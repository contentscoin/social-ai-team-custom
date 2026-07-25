// 공냥 카드(gn-html) — 카드뉴스·인포·데이터 카드를 HTML/CSS로 결정론 렌더한다.
// 공냥 생태계(gongnyang/gongnangi-chart-skill·cardprinter, MIT)의 핵심 패턴을 이식:
//  1) 텍스트·수치가 주인공인 컷은 이미지 모델로 굽지 않는다 — HTML 렌더는 과금 0, 한글 타이포 정확, 수치 왜곡 0.
//  2) 카피는 "계약"이다 — 엔진이 슬라이드 JSON을 쓰고, 렌더는 그 계약을 결정론으로 조판한다(사진처럼 다시 뽑을 필요 없음).
//  3) 기계 게이트 — 글자 예산(오버플로 방지)·WCAG 대비를 렌더 전에 코드로 강제한다. LLM 검수가 아니다.
// LLM 호출은 buildSlidesPrompt 지시문을 받는 쪽(render.js gn-html 레인)이 1회 수행하고,
// 이 모듈 자체는 순수 함수만 담아 node:test로 검증한다.
const channelsheets = require('./channelsheets');

// ---- 라우팅 ------------------------------------------------------------------------
// 카드형 포맷 판별 — 명시적 카드·인포·데이터 신호만. carousel/캐러셀 단독은 사진 캐러셀일 수
// 있어 제외한다(카드뉴스라고 쓴 경우에만 카드 레인).
const CARD_FORMAT_RE = /카드\s*뉴스|cardnews|card\s*news|비교표|비교\s*카드|인포그래픽|infographic|데이터\s*카드|차트|chart|체크리스트|checklist|리스티클|listicle/i;
function isCardFormat(format) { return CARD_FORMAT_RE.test(String(format || '')); }

// ---- 색·대비 (WCAG) ----------------------------------------------------------------
function hexToRgb(hex) {
  const m = String(hex || '').trim().match(/^#?([0-9a-f]{6})$/i);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function luminance(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
// WCAG 대비비 — 1(동일)~21(흑백). 본문 4.5, 큰 글자 3.0이 통과선.
function contrastRatio(a, b) {
  const la = luminance(a), lb = luminance(b);
  if (la == null || lb == null) return null;
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

// ---- 브랜드 토큰 -------------------------------------------------------------------
// 클라이언트 공용 브랜드(_brand.json)의 텍스트에서 HEX 팔레트를 추출해 카드 토큰을 만든다.
// 대비가 부족한 조합은 코드로 보정한다(cardprinter G6의 발상 — 사람 눈이 아니라 수치로).
const DARK = { bg: '#14161a', fg: '#f2f0eb', muted: '#9aa0a8', line: '#2c3038' };
const LIGHT = { bg: '#faf8f4', fg: '#1c1a17', muted: '#6f6a61', line: '#e4dfd4' };
function tokensFor(dir, opts = {}) {
  let palette = [];
  try {
    const b = channelsheets.getBrand(dir);
    palette = [...new Set(String((b && b.brand) || '').match(/#[0-9a-fA-F]{6}\b/g) || [])];
  } catch { /* 브랜드 없음 → 기본 토큰 */ }
  // 배경: 팔레트 중 가장 밝거나 가장 어두운 색(중간톤 배경은 가독이 죽는다). 없으면 라이트 기본.
  let bg = null;
  for (const hex of palette) {
    const l = luminance(hex);
    if (l == null) continue;
    if (l >= 0.7 || l <= 0.08) { bg = hex; break; }
  }
  const base = bg ? (luminance(bg) >= 0.5 ? { ...LIGHT, bg } : { ...DARK, bg }) : { ...LIGHT };
  // 악센트: 배경과 대비 3.0 이상인 첫 팔레트 색. 없으면 전경색 강조로 대체(브랜드색을 억지로 쓰지 않는다).
  let accent = palette.find((hex) => hex !== base.bg && (contrastRatio(hex, base.bg) || 0) >= 3);
  if (!accent) accent = luminance(base.bg) >= 0.5 ? '#b4541e' : '#e8b168';
  return { ...base, accent, handle: String(opts.handle || '').slice(0, 30) };
}

// ---- 슬라이드 계약 -----------------------------------------------------------------
// 카피 예산(글자) — 넘치면 렌더가 아니라 여기서 잘린다. 오버플로 게이트의 사전 차단판.
const BUDGET = { kicker: 24, title: 40, body: 130, bullet: 52, bulletMax: 4, barLabel: 12, barsMax: 5, statValue: 14, statLabel: 40 };
const TYPES = ['cover', 'point', 'list', 'stat', 'bars', 'end'];

function buildSlidesPrompt(job, brandSummary) {
  const cards = Math.min(8, Math.max(3, Number(job.count) || 5));
  return (
    `너는 한국어 SNS 카드뉴스 에디터다. 아래 포스트를 ${cards}장짜리 카드 시퀀스로 설계하라.\n` +
    `카드는 코드가 조판한다 — 너는 카피(텍스트)와 구조만 쓴다. 디자인 지시·색·폰트는 쓰지 마라.\n\n` +
    `[포스트]\n${String(job.prompt || job.topic || '').slice(0, 2000)}\n` +
    (brandSummary ? `\n[브랜드 톤]\n${String(brandSummary).slice(0, 500)}\n` : '') +
    `\n[규칙]\n` +
    `- 1장: type "cover" — 스크롤을 멈추는 후킹 제목(사실 기반, 낚시 금지).\n` +
    `- 마지막 장: type "end" — 요약 한 줄 + 행동 유도 한 줄.\n` +
    `- 본문 장: type "point"(제목+짧은 본문) / "list"(불릿 2~${BUDGET.bulletMax}) / "stat"(핵심 숫자 1개) / "bars"(항목 2~${BUDGET.barsMax} 수치 비교) 중 내용에 맞게.\n` +
    `- 수치는 포스트에 있는 것만 쓴다 — 새 숫자를 만들지 마라(날조 금지).\n` +
    `- 글자 예산: kicker ${BUDGET.kicker}자 · title ${BUDGET.title}자 · body ${BUDGET.body}자 · 불릿 ${BUDGET.bullet}자.\n` +
    `- 출력은 JSON 하나만: {"slides":[{"type":"cover","kicker":"...","title":"...","body":"..."},` +
    `{"type":"list","title":"...","bullets":["..."]},{"type":"stat","title":"...","stat":{"value":"73%","label":"..."}},` +
    `{"type":"bars","title":"...","bars":[{"label":"...","value":30}]},{"type":"end","title":"...","body":"..."}]} — 코드펜스 금지.`
  );
}

const clamp = (s, n) => String(s == null ? '' : s).trim().slice(0, n);
function parseSlides(out, maxCards = 8) {
  const s = String(out || '');
  const tryParse = (t) => { try { return JSON.parse(t); } catch { return null; } };
  let j = tryParse(s.trim());
  if (!j) { const m = s.match(/\{[\s\S]*\}/); if (m) j = tryParse(m[0]); }
  if (j && typeof j.result === 'string') { // claude json 모드 {result:"..."} 래핑
    const inner = tryParse(j.result.trim()) || (() => { const m = j.result.match(/\{[\s\S]*\}/); return m ? tryParse(m[0]) : null; })();
    if (inner) j = inner;
  }
  const raw = j && Array.isArray(j.slides) ? j.slides : null;
  if (!raw || !raw.length) return null;
  const slides = raw.slice(0, maxCards).map((c) => {
    const type = TYPES.includes(c && c.type) ? c.type : 'point';
    const slide = {
      type,
      kicker: clamp(c.kicker, BUDGET.kicker),
      title: clamp(c.title, BUDGET.title),
      body: clamp(c.body, BUDGET.body),
    };
    if (type === 'list') {
      slide.bullets = (Array.isArray(c.bullets) ? c.bullets : []).slice(0, BUDGET.bulletMax)
        .map((b) => clamp(b, BUDGET.bullet)).filter(Boolean);
    }
    if (type === 'stat' && c.stat) {
      slide.stat = { value: clamp(c.stat.value, BUDGET.statValue), label: clamp(c.stat.label, BUDGET.statLabel) };
    }
    if (type === 'bars') {
      slide.bars = (Array.isArray(c.bars) ? c.bars : []).slice(0, BUDGET.barsMax)
        .map((b) => ({ label: clamp(b && b.label, BUDGET.barLabel), value: Math.max(0, Number(b && b.value) || 0) }))
        .filter((b) => b.label);
    }
    return slide;
  }).filter((c) => c.title || (c.bullets && c.bullets.length) || c.stat);
  return slides.length ? slides : null;
}

// ---- 결정론 조판 -------------------------------------------------------------------
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const FONT = `'Pretendard', 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif`;

// 슬라이드 1장 → self-contained HTML(인라인 스타일만 — svg2png.htmlToPng의 CSP와 정합).
function renderCardHtml(slide, tokens, opts = {}) {
  const w = Number(opts.w) || 1080, h = Number(opts.h) || 1350;
  const t = tokens || tokensFor('');
  const idx = Number(opts.index) || 1, total = Number(opts.total) || 1;
  const pad = Math.round(w * 0.085);
  const isCover = slide.type === 'cover', isEnd = slide.type === 'end';
  const titleSize = isCover ? Math.round(w * 0.072) : Math.round(w * 0.055);
  const progress = total > 1 && !isCover
    ? `<div style="font-family:${FONT};font-size:${Math.round(w * 0.02)}px;letter-spacing:.14em;color:${t.muted}">${String(idx).padStart(2, '0')} / ${String(total).padStart(2, '0')}</div>`
    : '';
  const kicker = slide.kicker
    ? `<div style="font-family:${FONT};font-size:${Math.round(w * 0.024)}px;font-weight:700;letter-spacing:.12em;color:${t.accent};text-transform:uppercase;margin-bottom:${Math.round(h * 0.02)}px">${esc(slide.kicker)}</div>`
    : '';
  const title = slide.title
    ? `<div style="font-family:${FONT};font-size:${titleSize}px;font-weight:800;line-height:1.28;letter-spacing:-.02em;color:${t.fg};word-break:keep-all;margin-bottom:${Math.round(h * 0.03)}px">${esc(slide.title)}</div>`
    : '';
  const body = slide.body
    ? `<div style="font-family:${FONT};font-size:${Math.round(w * 0.031)}px;line-height:1.7;color:${t.fg};opacity:.88;word-break:keep-all;max-width:${Math.round(w * 0.78)}px">${esc(slide.body)}</div>`
    : '';
  let middle = '';
  if (slide.type === 'list' && slide.bullets && slide.bullets.length) {
    middle = `<div style="display:flex;flex-direction:column;gap:${Math.round(h * 0.028)}px;margin-top:${Math.round(h * 0.01)}px">` +
      slide.bullets.map((b, i) =>
        `<div style="display:flex;gap:${Math.round(w * 0.025)}px;align-items:baseline">` +
        `<div style="font-family:${FONT};font-size:${Math.round(w * 0.026)}px;font-weight:800;color:${t.accent};min-width:${Math.round(w * 0.05)}px">${String(i + 1).padStart(2, '0')}</div>` +
        `<div style="font-family:${FONT};font-size:${Math.round(w * 0.032)}px;line-height:1.55;color:${t.fg};word-break:keep-all">${esc(b)}</div></div>`).join('') +
      `</div>`;
  }
  if (slide.type === 'stat' && slide.stat) {
    middle = `<div style="margin:${Math.round(h * 0.02)}px 0">` +
      `<div style="font-family:${FONT};font-size:${Math.round(w * 0.17)}px;font-weight:800;letter-spacing:-.03em;line-height:1;color:${t.accent}">${esc(slide.stat.value)}</div>` +
      `<div style="font-family:${FONT};font-size:${Math.round(w * 0.03)}px;color:${t.muted};margin-top:${Math.round(h * 0.02)}px;word-break:keep-all">${esc(slide.stat.label)}</div></div>`;
  }
  if (slide.type === 'bars' && slide.bars && slide.bars.length) {
    // 슬림 수평 바(공냥이 차트 문법) — 0 기준, 최대값 대비 비율. 표시 문자열이 곧 데이터(과장 불가).
    const max = Math.max(...slide.bars.map((b) => b.value), 1);
    middle = `<div style="display:flex;flex-direction:column;gap:${Math.round(h * 0.026)}px;margin-top:${Math.round(h * 0.012)}px">` +
      slide.bars.map((b) => {
        const pct = Math.round((b.value / max) * 100);
        return `<div><div style="display:flex;justify-content:space-between;margin-bottom:6px">` +
          `<span style="font-family:${FONT};font-size:${Math.round(w * 0.026)}px;color:${t.fg}">${esc(b.label)}</span>` +
          `<span style="font-family:${FONT};font-size:${Math.round(w * 0.026)}px;font-variant-numeric:tabular-nums;color:${t.muted}">${b.value}</span></div>` +
          `<div style="height:8px;background:${t.line};border-radius:4px"><div style="height:8px;width:${pct}%;background:${t.accent};border-radius:4px"></div></div></div>`;
      }).join('') + `</div>`;
  }
  const footer = `<div style="position:absolute;left:${pad}px;right:${pad}px;bottom:${Math.round(h * 0.045)}px;display:flex;justify-content:space-between;align-items:center;border-top:1px solid ${t.line};padding-top:${Math.round(h * 0.02)}px">` +
    `<span style="font-family:${FONT};font-size:${Math.round(w * 0.022)}px;color:${t.muted}">${esc(t.handle || '')}</span>` +
    `${isEnd ? `<span style="font-family:${FONT};font-size:${Math.round(w * 0.022)}px;font-weight:700;color:${t.accent}">더 보기 →</span>` : ''}</div>`;
  return `<div style="position:relative;width:${w}px;height:${h}px;background:${t.bg};overflow:hidden">` +
    `<div style="position:absolute;left:${pad}px;top:${Math.round(h * 0.055)}px;right:${pad}px">${progress}</div>` +
    `<div style="position:absolute;left:${pad}px;right:${pad}px;top:${Math.round(h * (isCover ? 0.3 : 0.16))}px">` +
    kicker + title + body + middle +
    `</div>${footer}</div>`;
}

function renderAllHtml(slides, tokens, opts = {}) {
  return slides.map((s, i) => renderCardHtml(s, tokens, { ...opts, index: i + 1, total: slides.length }));
}

module.exports = { isCardFormat, contrastRatio, tokensFor, buildSlidesPrompt, parseSlides, renderCardHtml, renderAllHtml, BUDGET };
