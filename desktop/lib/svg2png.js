// SVG → PNG 오프스크린 렌더 — "클로드 디자인" 이미지 레인의 마지막 단계.
// Electron 메인에서만 동작 (BrowserWindow.capturePage). 외부 의존성 없음.
const fs = require('fs');
const path = require('path');

async function svgToPng(svg, width, height, outPath) {
  const { BrowserWindow } = require('electron');
  const win = new BrowserWindow({
    show: false,
    width, height,
    useContentSize: true,
    frame: false,
    webPreferences: { offscreen: true, sandbox: true, contextIsolation: true },
  });
  try {
    // self-contained SVG만 렌더 — 외부 리소스는 CSP로 차단 (프롬프트 인젝션으로 원격 로드 방지)
    const html = `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">` +
      `<style>html,body{margin:0;padding:0;overflow:hidden;width:${width}px;height:${height}px}svg{display:block;width:${width}px;height:${height}px}</style>${svg}`;
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    await new Promise((r) => setTimeout(r, 250)); // 폰트/레이아웃 안정화
    const image = await win.webContents.capturePage({ x: 0, y: 0, width, height });
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, image.toPNG());
    return { ok: true, path: outPath };
  } finally {
    try { win.destroy(); } catch { /* gone */ }
  }
}

// HTML 카드 → PNG 오프스크린 렌더 — gn-html(공냥 카드) 레인용. svgToPng와 같은 격리 규약:
// self-contained HTML만, 외부 리소스는 CSP로 차단(원격 로드 방지). html은 <body> 내부 콘텐츠+인라인 스타일.
async function htmlToPng(html, width, height, outPath) {
  const { BrowserWindow } = require('electron');
  const win = new BrowserWindow({
    show: false,
    width, height,
    useContentSize: true,
    frame: false,
    webPreferences: { offscreen: true, sandbox: true, contextIsolation: true },
  });
  try {
    const doc = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">` +
      `<style>html,body{margin:0;padding:0;overflow:hidden;width:${width}px;height:${height}px}</style>${html}`;
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(doc));
    await new Promise((r) => setTimeout(r, 250)); // 폰트/레이아웃 안정화
    const image = await win.webContents.capturePage({ x: 0, y: 0, width, height });
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, image.toPNG());
    return { ok: true, path: outPath };
  } finally {
    try { win.destroy(); } catch { /* gone */ }
  }
}

// 응답 텍스트에서 SVG 블록 추출 — 코드펜스/설명이 섞여 와도 견딘다
function sanitizeSvg(svg) {
  // 원격 참조 제거 — 렌더 창 CSP가 어차피 막지만 파일에도 남기지 않는다
  return svg.replace(/(href|src)\s*=\s*"(?!#|data:)[^"]*"/gi, '');
}
function extractSvg(text) {
  const m = String(text || '').match(/<svg[\s\S]*?<\/svg>/i);
  return m ? sanitizeSvg(m[0]) : null;
}
// 카드뉴스 등 멀티카드 — 모든 SVG 블록을 순서대로
function extractSvgAll(text) {
  return [...String(text || '').matchAll(/<svg[\s\S]*?<\/svg>/gi)].map((m) => sanitizeSvg(m[0]));
}

module.exports = { svgToPng, htmlToPng, extractSvg, extractSvgAll };
