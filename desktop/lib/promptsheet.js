// 프롬프트 시트 — "승인한 문장 = 과금되는 문장"을 만드는 계약 파일 (진단서 2단계 · cardprinter 계약 패턴).
// 비주얼 브리프(visuals) 단계에서 포스트별 렌더 프롬프트를 미리 컴파일해 저장하고,
// 사람이 검토·수정·승인한 뒤 비주얼 생성(visuals-generate)은 승인된 문장을 그대로 쓴다.
//  - 예전엔 게이트가 "브리프 파일 존재"만 봤고, 실제 과금 프롬프트는 생성 직전에 따로 조립돼
//    사람이 한 번도 못 본 채 API로 나갔다. 이 시트가 그 간극을 없앤다.
//  - 재작업 시 컴파일(포스트당 LLM 1회)이 재발생하지 않는 것이 가장 큰 확정 절감이다.
// 저장: <client>/context/prompt-sheet.json { builtAt, entries: [{cid, uid, channel, ...}] }
const fs = require('fs');
const path = require('path');
const board = require('./board');
const promptlab = require('./promptlab');
const render = require('./render');
const gates = require('./gates');
const gncards = require('./gncards');
const config = require('./config');

function fileFor(dir) { return path.join(dir, 'context', 'prompt-sheet.json'); }

// ---- autovisual과 공유하는 순수 헬퍼 (단일 정본 — autovisual이 여기서 가져다 쓴다) ----
// 이미지가 필요한 포스트인가 — 릴·텍스트 전용 제외, 카피 이후 단계.
function isImageTarget(p) {
  return !p.isReel && !gates.isTextOnlyFormat(p.format) && ['copy', 'visual', 'review', 'ready'].includes(p.stage);
}
// 렌더 브리프 조립 — 캘린더 필드 + (선택) 사용자 공통 지시.
function briefFor(p, extraContext) {
  return [
    p.topic,
    p.visual && `비주얼 디렉션: ${p.visual}`,
    p.angle && `앵글: ${p.angle}`,
    p.pillar && `필러: ${p.pillar}`,
    extraContext && `공통 지시(사용자): ${String(extraContext).slice(0, 500)}`,
  ].filter(Boolean).join('\n');
}
// 포맷 → 장수/사이즈 (autovisual이 여기서 가져다 쓰는 단일 정본)
function inferCount(post, fallback) {
  const f = String(post.format || '').toLowerCase() + ' ' + String(post.headerRaw || '');
  if (/carousel|캐러셀|슬라이드|slide|album/i.test(f)) return 5;
  if (/multi|여러\s*장|다중|묶음/i.test(f)) return 4;
  if (/single|단일|1\s*장|피드|feed/i.test(f)) return 1;
  return fallback || 3;
}
function inferSize(post) {
  const f = String(post.format || '').toLowerCase();
  if (/story|스토리|9:16|세로영상/i.test(f)) return 'story';
  if (/1:1|정방|square/i.test(f)) return 'square';
  return 'portrait';
}

function get(dir) {
  try { return JSON.parse(fs.readFileSync(fileFor(dir), 'utf8')); } catch { return null; }
}
function save(dir, sheet) {
  const p = fileFor(dir);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(sheet, null, 2));
  fs.renameSync(tmp, p);
  return sheet;
}

// 시트 생성 — 대상 포스트마다 컴파일 1회(비주얼 생성에서 하던 것을 승인 앞으로 당김).
// 기존 시트의 승인·컴파일 결과는 같은 cid면 재사용한다(재실행이 승인·토큰을 날리지 않게).
async function build(dir, opts = {}, onLine) {
  const b = (opts._board || board).buildBoard(dir);
  const PL = opts._promptlab || promptlab;
  const provider = opts.provider || render.defaultImageProvider({ ima2: opts.ima2 });
  const prev = get(dir);
  const prevBy = new Map(((prev && prev.entries) || []).map((e) => [e.cid, e]));
  const targets = (b.posts || []).filter(isImageTarget);
  const entries = [];
  let compiled = 0, kept = 0;
  for (const p of targets) {
    if (opts.stopped && opts.stopped()) break;
    const cid = `${p.chId || 'etc'}-${p.n}`;
    const count = Number(opts.count) > 0 ? Number(opts.count) : inferCount(p, 3);
    const size = inferSize(p);
    const pvProvider = (opts.gnhtml !== false && gncards.isCardFormat(p.format)) ? 'gn-html' : provider;
    const brief = briefFor(p, opts.extraContext);
    // 같은 카드가 이미 시트에 있으면 컴파일·승인 유지 (topic이 바뀌었으면 새로 컴파일)
    const old = prevBy.get(cid);
    if (old && old.topic === p.topic && old.count === count && old.size === size) {
      entries.push(old); kept++; continue;
    }
    let prompt = brief, negative = null;
    if (pvProvider !== 'gn-html') { // gn-html은 브리프가 곧 입력(슬라이드 설계가 따로 돈다)
      try {
        const c = await PL.compile(dir, {
          kind: 'image', provider: pvProvider, topic: p.topic, channel: p.channel, format: p.format, lane: p.lane,
          prompt: brief, size, count, style: opts.style || config.getImageStyle(), varietySeed: cid,
        }, onLine);
        if (c && c.ok && c.prompt) { prompt = c.prompt; negative = c.negative || null; }
      } catch { /* 컴파일 실패 → 브리프 원문 (승인 화면에서 사람이 다듬을 수 있다) */ }
    }
    compiled++;
    onLine && onLine(`[프롬프트시트] ${cid} — ${pvProvider}${pvProvider === 'gn-html' ? ' (카드형 · 브리프 원문)' : ''} 컴파일 완료`);
    entries.push({
      cid, uid: p.uid, channel: p.channel, topic: p.topic, format: p.format || '',
      provider: pvProvider, size, count, prompt, negative,
      approvedPrompt: null, approvedAt: null, builtAt: new Date().toISOString(),
    });
  }
  const sheet = save(dir, { builtAt: new Date().toISOString(), entries });
  return { ok: true, total: entries.length, compiled, kept, sheet };
}

// 승인 — 카드별 수정(edits)과 전체 공통 지시(common)를 반영해 approvedPrompt를 확정한다.
// 이후 비주얼 생성은 이 문장을 그대로 쓴다(컴파일 재발생 없음).
function approve(dir, { common = '', edits = [] } = {}) {
  const sheet = get(dir);
  if (!sheet || !sheet.entries || !sheet.entries.length) return { ok: false, error: '프롬프트 시트가 없습니다 — 비주얼 브리프를 먼저 실행하세요' };
  const editBy = new Map((edits || []).map((e) => [e.cid, String(e.prompt || '')]));
  const commonNote = String(common || '').trim().slice(0, 500);
  const at = new Date().toISOString();
  for (const e of sheet.entries) {
    const base = (editBy.get(e.cid) || e.prompt || '').trim();
    if (!base) continue;
    e.approvedPrompt = base + (commonNote ? `\n\n(Applies to every image in this batch: ${commonNote})` : '');
    e.approvedAt = at;
  }
  save(dir, sheet);
  return { ok: true, approved: sheet.entries.filter((e) => e.approvedPrompt).length, total: sheet.entries.length };
}

// 생성 단계 조회 — cid의 승인된 프롬프트(없으면 null → 생성 쪽이 종전대로 컴파일).
function approvedFor(dir, cid) {
  const sheet = get(dir);
  if (!sheet) return null;
  const e = (sheet.entries || []).find((x) => x.cid === cid);
  return e && e.approvedPrompt ? e : null;
}

// 게이트 증거 — 이미지가 필요한 모든 포스트가 시트에 올라 있는가(승인 여부와 무관, 검토 대상 완비).
function covers(dir, posts) {
  const sheet = get(dir);
  if (!sheet || !sheet.entries || !sheet.entries.length) return false;
  const have = new Set(sheet.entries.map((e) => e.cid));
  const need = (posts || []).filter(isImageTarget);
  return need.length > 0 && need.every((p) => have.has(`${p.chId || 'etc'}-${p.n}`));
}

module.exports = { build, approve, approvedFor, covers, get, isImageTarget, briefFor, inferCount, inferSize };
