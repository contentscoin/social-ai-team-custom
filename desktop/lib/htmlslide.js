// 슬라이드 → 자기완결 HTML 문서. Electron 오프스크린 창이 이 HTML을 렌더해 PNG로 캡처하고,
// 그 이미지들을 ffmpeg로 이어붙여 mp4를 만든다(하이퍼프레임과 같은 HTML→영상 방식을,
// 앱에 내장된 Chromium으로 추가 설치 없이 수행). 화면 텍스트는 HTML로 네이티브 렌더되므로
// 한글이 깨지지 않고, 배경 이미지는 선택이다(텍스트만으로도 슬라이드가 성립).
const path = require('path');

const ASPECTS = { '9:16': [1080, 1920], '1:1': [1080, 1080], '16:9': [1920, 1080], '4:5': [1080, 1350] };
// 한글 안전 폰트 스택 — 설치본/OS에 흔한 한글 폰트로 폴백
const FONT_STACK = "'Pretendard','Noto Sans KR','Malgun Gothic','Apple SD Gothic Neo','맑은 고딕',sans-serif";

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

// slide: { head, sub, transition, image?:{abs} }  opts: { aspect, brand:{primary,font}, index, total }
function slideHtml(slide, opts = {}) {
  const [w, h] = ASPECTS[opts.aspect] || ASPECTS['9:16'];
  const brand = opts.brand || {};
  const primary = /^#?[0-9a-fA-F]{3,8}$/.test(String(brand.primary || '')) ? (brand.primary[0] === '#' ? brand.primary : '#' + brand.primary) : '#111111';
  const font = brand.font ? `'${String(brand.font).replace(/['\\<>]/g, '')}',${FONT_STACK}` : FONT_STACK;
  const bgUrl = slide.image && slide.image.abs ? fileUrl(slide.image.abs) : null;
  const hasImg = !!bgUrl;
  const head = esc(slide.head);
  const sub = esc(slide.sub);
  // 이미지가 있으면 하단 그라디언트 위 텍스트, 없으면 브랜드색 배경 중앙 텍스트
  const bg = hasImg
    ? `background:#000 url("${bgUrl}") center/cover no-repeat;`
    : `background:linear-gradient(160deg, ${primary}, #000);`;
  const textBlock = `
      <div class="wrap ${hasImg ? 'onimg' : 'solid'}">
        ${head ? `<div class="head">${head}</div>` : ''}
        ${sub ? `<div class="sub">${sub}</div>` : ''}
      </div>`;
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html,body { width:${w}px; height:${h}px; overflow:hidden; }
  body { ${bg} font-family:${font}; color:#fff; }
  .wrap { position:absolute; left:0; right:0; padding:0 8%; display:flex; flex-direction:column; gap:${Math.round(h * 0.018)}px; }
  .wrap.solid { top:50%; transform:translateY(-50%); text-align:center; align-items:center; }
  .wrap.onimg { bottom:9%; text-align:left; align-items:flex-start;
    text-shadow:0 2px 18px rgba(0,0,0,.75); }
  .wrap.onimg::before { content:''; position:absolute; left:0; right:0; bottom:-9%; height:60%;
    background:linear-gradient(0deg, rgba(0,0,0,.72), transparent); z-index:-1; }
  .head { font-size:${Math.round(h * 0.058)}px; font-weight:800; line-height:1.18; letter-spacing:-0.01em; word-break:keep-all; }
  .sub  { font-size:${Math.round(h * 0.034)}px; font-weight:500; line-height:1.4; opacity:.94; word-break:keep-all; }
</style></head>
<body>${textBlock}</body></html>`;
}

module.exports = { slideHtml, fileUrl, ASPECTS, _esc: esc };
