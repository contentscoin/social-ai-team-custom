// 슬라이드 → 애니메이션 HTML 장면(하이퍼프레임 방식). Electron 오프스크린 창이 이 HTML을
// 프레임 단위로 seek·캡처하고(window.__seek(p)), 캡처한 프레임들을 ffmpeg로 이어붙여 mp4로 만든다.
// 핵심: 모든 시각 요소(켄번스 줌·키네틱 타이포·카드뉴스 불릿 순차 등장·진입 전환)를 진행값
// --p(0→1)의 함수로 표현한다 → 프레임이 결정적이고, 애니메이션 타이밍에 의존하지 않는다.
// 화면 텍스트는 HTML로 네이티브 렌더되므로 한글이 깨지지 않고, 배경 이미지는 선택이다.
const path = require('path');

const ASPECTS = { '9:16': [1080, 1920], '1:1': [1080, 1080], '16:9': [1920, 1080], '4:5': [1080, 1350] };
// 한글 안전 폰트 스택 — 설치본/OS에 흔한 한글 폰트로 폴백
const FONT_STACK = "'Pretendard','Noto Sans KR','Malgun Gothic','Apple SD Gothic Neo','맑은 고딕',sans-serif";
const MOTIONS = new Set(['kenburns', 'panLeft', 'panRight', 'kinetic', 'static']);

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// 배경 이미지 절대경로 → file:// URL (Windows 역슬래시·공백 안전)
function fileUrl(absPath) {
  if (!absPath) return null;
  let p = String(absPath).replace(/\\/g, '/');
  if (!p.startsWith('/')) p = '/' + p;
  return 'file://' + encodeURI(p).replace(/#/g, '%23');
}

function normHex(v, fb) {
  return /^#?[0-9a-fA-F]{3,8}$/.test(String(v || '')) ? (String(v)[0] === '#' ? v : '#' + v) : fb;
}

// 모션 파라미터 — 배경 트랜스폼(켄번스/팬)에 쓸 상수. hasImg=false면 정지.
// dScale: 진행 중 추가 확대량, dx/dy: 진행 중 이동(px, 프레임 기준). base: 초기 확대(크롭 여백 확보).
function motionParams(motion, hasImg, w, h) {
  if (!hasImg) return { base: 1, dScale: 0, dx: 0, dy: 0 };
  const mx = Math.round(w * 0.045), my = Math.round(h * 0.04);
  switch (motion) {
    case 'static': return { base: 1.0, dScale: 0, dx: 0, dy: 0 };
    case 'panLeft': return { base: 1.08, dScale: 0.01, dx: mx, dy: 0 };
    case 'panRight': return { base: 1.08, dScale: 0.01, dx: -mx, dy: 0 };
    case 'kinetic': return { base: 1.05, dScale: 0.05, dx: 0, dy: -my };
    case 'kenburns':
    default: return { base: 1.05, dScale: 0.09, dx: -Math.round(mx * 0.5), dy: -my };
  }
}

// slide: { head, sub, kicker, bullets:[...], role, motion, transition, image?:{abs} }
// opts: { aspect, brand:{primary,font}, index, total }
// 반환: 자기완결 HTML 문서 — window.__seek(p:0..1) 로 프레임을 결정적으로 이동.
function slideHtml(slide, opts = {}) {
  const [w, h] = ASPECTS[opts.aspect] || ASPECTS['9:16'];
  const brand = opts.brand || {};
  const primary = normHex(brand.primary, '#111111');
  const accent = normHex(brand.accent, primary);
  const font = brand.font ? `'${String(brand.font).replace(/['\\<>]/g, '')}',${FONT_STACK}` : FONT_STACK;
  const bgUrl = slide.image && slide.image.abs ? fileUrl(slide.image.abs) : null;
  const hasImg = !!bgUrl;
  const motion = MOTIONS.has(slide.motion) ? slide.motion : (hasImg ? 'kenburns' : 'static');
  const trans = slide.transition && ['cut', 'fade', 'slide', 'zoom'].includes(slide.transition) ? slide.transition : 'fade';
  const mp = motionParams(motion, hasImg, w, h);

  const kicker = esc(slide.kicker);
  const head = esc(slide.head);
  const sub = esc(slide.sub);
  const bullets = Array.isArray(slide.bullets) ? slide.bullets.filter((b) => b != null && String(b).trim()).slice(0, 6) : [];
  const index = Number(opts.index) || 1;
  const total = Number(opts.total) || 1;

  // 배경 레이어 — 이미지면 켄번스 트랜스폼, 없으면 브랜드색 그라디언트(정지)
  const bgLayer = hasImg
    ? `<div class="bg"></div><div class="scrim"></div>`
    : '';
  const bodyBg = hasImg
    ? 'background:#000;'
    : `background:radial-gradient(120% 100% at 50% 0%, ${primary} 0%, #0b0b0d 78%);`;

  // 진입 전환에 따른 스테이지 초기 오프셋(enter=0..1로 보간)
  const enterTransform = {
    cut: 'none',
    fade: 'none',
    slide: 'translateY(calc((1 - var(--enter)) * 48px))',
    zoom: 'scale(calc(0.94 + var(--enter) * 0.06))',
  }[trans];

  // 카드뉴스 정렬: 이미지 있으면 하단 정렬(자막), 없으면 중앙(타이틀 카드)
  const stageJustify = hasImg ? 'flex-end' : 'center';
  const stageAlign = hasImg ? 'flex-start' : 'center';
  const textAlign = hasImg ? 'left' : 'center';

  const bulletItems = bullets.map((b, i) => {
    // 각 불릿이 켜지는 진행 임계값 — 헤드/서브 뒤(0.30)부터 균등 분포
    const at = (0.30 + (i * 0.52) / Math.max(1, bullets.length)).toFixed(3);
    return `<li style="--b:${at}"><span class="mk"></span><span class="tx">${esc(b)}</span></li>`;
  }).join('');

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<style>
  :root { --p:0; --enter:0; --kb:0; }
  * { margin:0; padding:0; box-sizing:border-box; }
  html,body { width:${w}px; height:${h}px; overflow:hidden; }
  body { ${bodyBg} font-family:${font}; color:#fff; -webkit-font-smoothing:antialiased; }
  .bg { position:absolute; inset:0; background:#000 url("${bgUrl || ''}") center/cover no-repeat;
    transform: scale(calc(${mp.base} + ${mp.dScale} * var(--kb)))
      translate3d(calc(${mp.dx}px * var(--kb)), calc(${mp.dy}px * var(--kb)), 0);
    transform-origin:50% 50%; will-change:transform; }
  .scrim { position:absolute; inset:0;
    background:linear-gradient(0deg, rgba(0,0,0,.82) 3%, rgba(0,0,0,.20) 40%, rgba(0,0,0,.42) 100%); }
  .stage { position:absolute; inset:0; padding:0 8% ${hasImg ? '13%' : '0'};
    display:flex; flex-direction:column; justify-content:${stageJustify}; align-items:${stageAlign};
    text-align:${textAlign}; gap:${Math.round(h * 0.02)}px;
    opacity: var(--enter); transform:${enterTransform}; }
  .kicker { font-size:${Math.round(h * 0.026)}px; font-weight:700; letter-spacing:.14em;
    text-transform:uppercase; color:${accent}; opacity: clamp(0, calc((var(--p) - 0.03) * 12), 1);
    ${hasImg ? '' : 'filter:brightness(1.7);'} }
  .head { font-size:${Math.round(h * 0.062)}px; font-weight:800; line-height:1.16; letter-spacing:-0.015em;
    word-break:keep-all; text-shadow:${hasImg ? '0 2px 22px rgba(0,0,0,.78)' : 'none'};
    opacity: clamp(0, calc((var(--p) - 0.07) * 8), 1);
    transform: translateY(calc((1 - clamp(0, calc((var(--p) - 0.07) * 6), 1)) * 18px)); }
  .sub { font-size:${Math.round(h * 0.033)}px; font-weight:500; line-height:1.42; opacity:.96;
    word-break:keep-all; text-shadow:${hasImg ? '0 2px 16px rgba(0,0,0,.7)' : 'none'};
    opacity: clamp(0, calc((var(--p) - 0.15) * 8), 1);
    transform: translateY(calc((1 - clamp(0, calc((var(--p) - 0.15) * 6), 1)) * 14px)); }
  .bullets { list-style:none; display:flex; flex-direction:column; gap:${Math.round(h * 0.016)}px;
    margin-top:${Math.round(h * 0.01)}px; width:100%; align-items:${stageAlign}; }
  .bullets li { display:flex; align-items:center; gap:14px; font-size:${Math.round(h * 0.032)}px;
    font-weight:600; line-height:1.3; word-break:keep-all; text-shadow:${hasImg ? '0 2px 14px rgba(0,0,0,.7)' : 'none'};
    opacity: clamp(0, calc((var(--p) - var(--b)) * 10), 1);
    transform: translateX(calc((1 - clamp(0, calc((var(--p) - var(--b)) * 8), 1)) * 20px)); }
  .bullets .mk { flex:none; width:${Math.round(h * 0.014)}px; height:${Math.round(h * 0.014)}px;
    border-radius:50%; background:${accent}; box-shadow:0 0 0 4px ${accent}22; }
  .progress { position:absolute; left:0; bottom:0; height:${Math.max(5, Math.round(h * 0.006))}px;
    width: calc(var(--p) * 100%); background:${accent}; opacity:.9; }
  .dots { position:absolute; top:5.5%; right:8%; display:flex; gap:8px; opacity: clamp(0, calc(var(--enter)), 1); }
  .dots i { width:${Math.round(h * 0.008)}px; height:${Math.round(h * 0.008)}px; border-radius:50%;
    background:#fff; opacity:.35; }
  .dots i.on { opacity:1; background:${accent}; }
</style></head>
<body>
  ${bgLayer}
  <div class="stage">
    ${kicker ? `<div class="kicker">${kicker}</div>` : ''}
    ${head ? `<div class="head">${head}</div>` : ''}
    ${sub ? `<div class="sub">${sub}</div>` : ''}
    ${bulletItems ? `<ul class="bullets">${bulletItems}</ul>` : ''}
  </div>
  ${total > 1 ? `<div class="dots">${Array.from({ length: total }, (_, i) => `<i class="${i === index - 1 ? 'on' : ''}"></i>`).join('')}</div>` : ''}
  <div class="progress"></div>
  <script>
    window.__seek = function (p) {
      p = Math.max(0, Math.min(1, +p || 0));
      // 진입 전환: 앞 18% 구간에서 0→1 smoothstep
      var e = Math.min(1, p / 0.18); e = e * e * (3 - 2 * e);
      var r = document.documentElement.style;
      r.setProperty('--p', String(p));
      r.setProperty('--enter', String(e));
      r.setProperty('--kb', String(p)); // 켄번스는 선형 팬
    };
    window.__seek(0);
  </script>
</body></html>`;
}

module.exports = { slideHtml, sceneHtml: slideHtml, fileUrl, motionParams, ASPECTS, MOTIONS, _esc: esc };
