// 기계 품질 게이트 — LLM 검수가 아니라 코드가 잡는다(실행 비용 0).
// v1 범위: AI 상투어(ai-tells) 스캔. 사전은 gongnyang/gn-voice(MIT)에서 이식한
// lib/data/ai-tells.json — 실제 저자 코퍼스 1,000여 편에서 0회 등장한, AI 초안 특유의
// 문구들이라 판별력이 실증돼 있다("알아보겠습니다", "이번 글에서는" 류).
// 산출: context/qgates-report.json — verify 단계 프롬프트에 주입돼 교체 지시가 된다.
const fs = require('fs');
const path = require('path');

let _dict = null;
function dict() {
  if (_dict) return _dict;
  try { _dict = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'ai-tells.json'), 'utf8')); }
  catch { _dict = { groups: [] }; }
  return _dict;
}

// 한 텍스트에서 AI 상투어 히트 수집 — match:'start'는 줄 시작(문두), 'contain'은 본문 포함.
function scanText(text) {
  const s = String(text || '');
  const lines = s.split(/\r?\n/);
  const hits = [];
  for (const g of dict().groups || []) {
    for (const v of g.variants || []) {
      let count = 0;
      if (g.match === 'start') {
        for (const line of lines) if (line.trimStart().startsWith(v)) count++;
      } else {
        let i = 0;
        while ((i = s.indexOf(v, i)) !== -1) { count++; i += v.length; }
      }
      if (count > 0) hits.push({ canon: g.canon, variant: v, count, match: g.match || 'contain' });
    }
  }
  return hits;
}

// 워크스페이스 카피 산출물 스캔 — outputs/ 아래 .md 중 카피 파일만(창작물·프롬프트 로그 제외).
const SKIP_DIR_RE = /(^|[\\/])(creatives|storyboards|videos|reports)([\\/]|$)/i;
const SKIP_FILE_RE = /prompts-used|calendar|README/i;
function copyFiles(dir, cap = 200) {
  const root = path.join(dir, 'outputs');
  const out = [];
  const walk = (d) => {
    if (out.length >= cap) return;
    let entries = [];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (out.length >= cap) return;
      const abs = path.join(d, e.name);
      if (e.isDirectory()) { if (!SKIP_DIR_RE.test(abs)) walk(abs); continue; }
      if (!/\.md$/i.test(e.name) || SKIP_FILE_RE.test(e.name)) continue;
      out.push(abs);
    }
  };
  walk(root);
  return out;
}

// 전체 스캔 + 리포트 저장 — { total, files:[{rel, hits}] }. 히트 0이어도 리포트는 남긴다(스캔했다는 증거).
function report(dir) {
  const files = [];
  let total = 0;
  for (const abs of copyFiles(dir)) {
    let text = '';
    try { text = fs.readFileSync(abs, 'utf8'); } catch { continue; }
    const hits = scanText(text);
    if (hits.length) {
      const rel = path.relative(dir, abs).replace(/\\/g, '/');
      const n = hits.reduce((s, h) => s + h.count, 0);
      total += n;
      files.push({ rel, hits });
    }
  }
  const rep = { at: new Date().toISOString(), gate: 'ai-tells', total, files };
  try {
    const p = path.join(dir, 'context', 'qgates-report.json');
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(rep, null, 2));
  } catch { /* 리포트 저장 실패가 스캔을 무효로 만들진 않는다 */ }
  return rep;
}

// verify 단계 프롬프트에 붙일 지시 블록 — 히트가 있을 때만. 파일·문구를 짚어 교체를 지시한다.
function verifyDirective(dir) {
  let rep = null;
  try { rep = JSON.parse(fs.readFileSync(path.join(dir, 'context', 'qgates-report.json'), 'utf8')); } catch { return ''; }
  if (!rep || !rep.total) return '';
  const lines = (rep.files || []).slice(0, 12).map((f) => {
    const terms = [...new Set(f.hits.map((h) => `"${h.variant}"`))].slice(0, 5).join(', ');
    return `· ${f.rel}: ${terms}`;
  });
  return `\n[기계 게이트 — AI 상투어 ${rep.total}건 검출]\n` +
    `아래 파일의 해당 문구는 AI 초안 특유의 상투어다. 사실·의미는 유지하되 그 문장만 자연스러운 한국어로 다시 써라` +
    `(다른 부분은 수정 금지):\n${lines.join('\n')}\n\n`;
}

module.exports = { scanText, copyFiles, report, verifyDirective };
