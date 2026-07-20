// 포스트별 산출물 삭제 + 재기획 리셋.
// 보드가 파일 증거로 stage를 추론하므로, 파일을 지우면 카드가 자동으로 planned/copy로 되돌아간다.
//  - 이미지 삭제: 포스트별 이미지/영상 렌더 파일 + 시안 폴더를 통째로 삭제(안전 — 포스트 전용 파일).
//  - 본문 삭제: 카피/대본은 월간 공유 파일에 여러 포스트가 함께 들어 있을 수 있으므로,
//    앵커(POST n / ID-n / 헤딩) 기준으로 이 포스트 블록만 잘라낸다(형제 포스트 보존).
//    본문을 지우면 이미지도 근거가 사라지므로 함께 삭제한다.
const fs = require('fs');
const path = require('path');
const board = require('./board');

const IMG_KINDS = new Set(['render', 'videorender', 'creative']);
const COPY_KINDS = new Set(['copy', 'video', 'board']);
const norm = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

// 워크스페이스(dir) 밖 경로 차단
function safeInside(dir, rel) {
  const root = path.resolve(dir);
  const abs = path.resolve(root, String(rel || ''));
  return (abs === root || abs.startsWith(root + path.sep)) ? abs : null;
}

// 앵커 시작 위치들(줄머리 POST n / ID-n / '# ' 헤딩)
function anchorPositions(text) {
  const re = /^(?:POST\s*\d+\b.*|[A-Z]{1,2}-\d+\b.*|#\s.*)$/gm;
  const pos = [];
  let m;
  while ((m = re.exec(text)) !== null) { pos.push(m.index); if (m.index === re.lastIndex) re.lastIndex++; }
  return pos;
}
function hasAnchor(text) { return /^(?:POST\s*\d+\b|[A-Z]{1,2}-\d+\b|#\s)/m.test(text); }

// 공유 파일에서 이 포스트 블록만 제거. 남은 포스트가 없으면 파일 자체를 삭제.
// 반환: { changed, excised?, deletedFile? }
function exciseBlockFromFile(abs, topic, n) {
  let text;
  try { text = fs.readFileSync(abs, 'utf8'); } catch { return { changed: false }; }
  const t = norm(topic).slice(0, 24);
  const citesN = (block) => Number(n) > 0
    && new RegExp(`(?:POST\\s*#?0*${n}(?![0-9])|\\b[A-Z]{1,2}-0*${n}(?![0-9]))`, 'i').test(block);
  const pos = anchorPositions(text);
  if (pos.length) {
    const head = text.slice(0, pos[0]);
    const bounds = [...pos, text.length];
    let removed = false;
    const kept = [];
    for (let i = 0; i < bounds.length - 1; i++) {
      const block = text.slice(bounds[i], bounds[i + 1]);
      const target = (!!t && norm(block).includes(t)) || citesN(block);
      if (target && !removed) { removed = true; continue; } // 이 포스트 블록(첫 매칭)만 제거
      kept.push(block);
    }
    if (!removed) return { changed: false };
    const rest = (head + kept.join('')).replace(/\n{3,}/g, '\n\n').trim();
    if (!rest || !hasAnchor(rest)) { // 남은 포스트가 없으면 파일 삭제
      try { fs.unlinkSync(abs); return { changed: true, deletedFile: true }; } catch { return { changed: false }; }
    }
    try { fs.writeFileSync(abs, rest + '\n'); return { changed: true, excised: true }; } catch { return { changed: false }; }
  }
  // 앵커 없는 단일 포스트 파일 — 토픽을 담으면 통째로 삭제
  if (t && norm(text).includes(t)) {
    try { fs.unlinkSync(abs); return { changed: true, deletedFile: true }; } catch { return { changed: false }; }
  }
  return { changed: false };
}

// dir/uid의 이미지/본문 산출물을 삭제하고 카드를 재기획 단계로 되돌린다.
// opts: { image?:bool, copy?:bool }. copy를 지우면 image도 함께(본문이 이미지의 근거).
function deleteAssets(dir, uid, opts = {}) {
  const b = board.buildBoard(dir);
  const card = (b.posts || []).find((p) => p.uid === uid);
  if (!card) return { ok: false, error: '해당 포스트를 찾지 못했습니다', uid };
  const wantCopy = !!opts.copy;
  const wantImage = !!opts.image || wantCopy;
  if (!wantImage && !wantCopy) return { ok: false, error: '삭제할 대상이 없습니다 (image/copy)', uid };
  const deleted = [];
  const failed = [];

  // 1) 이미지/영상 렌더 (+ 시안 폴더) — 포스트 전용 파일이라 통째 삭제
  if (wantImage) {
    const rels = new Set();
    for (const f of (card.files || [])) if (IMG_KINDS.has(f.kind)) rels.add(f.rel);
    if (card.thumb) rels.add(card.thumb);
    if (card.videoThumb) rels.add(card.videoThumb);
    for (const rel of rels) {
      const abs = safeInside(dir, rel);
      if (!abs) { failed.push({ rel, error: '경로 이탈' }); continue; }
      try { if (fs.existsSync(abs)) { fs.unlinkSync(abs); deleted.push(rel); } }
      catch (e) { failed.push({ rel, error: e.message }); }
    }
    const vrel = path.join('outputs', 'variants', uid);
    const vabs = safeInside(dir, vrel);
    if (vabs && fs.existsSync(vabs)) {
      try { fs.rmSync(vabs, { recursive: true, force: true }); deleted.push('outputs/variants/' + uid + '/'); }
      catch (e) { failed.push({ rel: vrel, error: e.message }); }
    }
  }

  // 2) 본문(카피/대본/스토리보드) — 공유 파일이면 이 포스트 블록만 잘라낸다
  if (wantCopy) {
    const rels = new Set();
    for (const f of (card.files || [])) if (COPY_KINDS.has(f.kind)) rels.add(f.rel);
    for (const rel of rels) {
      const abs = safeInside(dir, rel);
      if (!abs) { failed.push({ rel, error: '경로 이탈' }); continue; }
      const r = exciseBlockFromFile(abs, card.topic, card.n);
      if (r.changed) deleted.push(rel + (r.deletedFile ? ' (파일 삭제)' : ' (블록 제거)'));
      else failed.push({ rel, error: '이 포스트 블록을 특정하지 못함' });
    }
  }

  return { ok: true, uid, deleted, failed, reset: wantCopy ? 'planned' : 'copy' };
}

module.exports = { deleteAssets, exciseBlockFromFile };
