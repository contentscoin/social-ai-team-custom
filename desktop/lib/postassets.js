// 포스트별 산출물 삭제 + 재기획 리셋.
// 안전 원칙(형제 포스트·공유 파일 보호):
//  - 이미지 삭제: outputs/creatives(이미지)·outputs/videos(영상)에서 파일명이 이 포스트의
//    렌더 프리픽스(chId-n / mono-n / channelKey-n)와 일치하는 것만 지운다. 보드가 토픽/풀
//    배분으로 "빌려온" 이미지(다른 포스트 것일 수 있음)·브리프(.md)는 절대 건드리지 않는다.
//    시안 폴더(outputs/variants/<uid>)는 uid 전용이라 함께 정리.
//  - 본문 삭제: 카피/대본은 월간 공유 파일일 수 있으므로, 앵커(POST n / ID-n) 헤더가 이
//    포스트 n을 가리키는 블록만 잘라낸다(형제 보존). 특정하지 못하면 아무것도 지우지 않고
//    삭제를 취소한다. 본문을 지우면 이미지도 함께 리셋한다.
// 보드가 파일 증거로 stage를 재추론하므로, 지우면 카드가 자동으로 planned/copy로 돌아간다.
const fs = require('fs');
const path = require('path');
const board = require('./board');
const channelRegistry = require('./channels');

const COPY_KINDS = new Set(['copy', 'video', 'board']);
const IMG_EXT = /\.(png|jpe?g|webp|gif)$/i;
const VID_EXT = /\.(mp4|webm|mov)$/i;
const escRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// 워크스페이스(dir) 밖 경로 차단
function safeInside(dir, rel) {
  const root = path.resolve(dir);
  const abs = path.resolve(root, String(rel || ''));
  return (abs === root || abs.startsWith(root + path.sep)) ? abs : null;
}

// 이 포스트의 렌더 파일명 프리픽스 정규식 — board.js의 renders 매칭과 동일 규약.
function renderPrefixRes(card) {
  const chKey = card.channel || 'etc';
  const chId = card.chId || 'etc';
  const mono = (channelRegistry.REGISTRY[chKey] && channelRegistry.REGISTRY[chKey].mono) || '';
  const n = card.n;
  return [
    new RegExp(`^${escRe(chId)}-0*${n}(?![0-9])`, 'i'),
    mono ? new RegExp(`^${escRe(mono)}-0*${n}(?![0-9])`, 'i') : null,
    new RegExp(`^${escRe(chKey)}[_-]?0*${n}(?![0-9])`, 'i'),
    new RegExp(`^${escRe(chKey)}-${n}(?![0-9])`, 'i'),
  ].filter(Boolean);
}

// '강한 헤더' 앵커만 인식한다. 파괴적 삭제라, 본문 문장이 우연히 'IG-5 …'/'POST 5 …'로
// 시작해도 앵커로 오인하면 형제 본문이 날아간다. 그래서 다음 중 하나여야 헤더로 본다:
//   (a) 마크다운 헤딩(# ~ ####),  (b) 볼드(**…),  (c) 번호 뒤가 헤더 구분자(— – - : | ·)로
//   시작하거나 줄 끝. 채널 모노는 board와 동일 화이트리스트로 제한(임의 2글자-숫자 배제).
// 반환: [{ index, mono, num }] — 강한 헤더만.
const ANCHOR_RE = /^[ \t]*(#{1,4}[ \t]*)?(\*\*[ \t]*)?(?:POST[ \t]*(\d+)|(IG|FB|LI|LN|IN|TH|X|NV|NB|NC|KK|TT)-(\d+))\b([^\n]*)$/gim;
const SEP_START = /^[—–‒·\-:|]/; // — – ‒ · - : |
function headerAnchors(text) {
  const out = [];
  for (const m of text.matchAll(ANCHOR_RE)) {
    const heading = !!m[1];
    const bold = !!m[2];
    const rest = (m[6] || '').replace(/^\*\*/, '').trimStart();
    if (heading || bold || rest === '' || SEP_START.test(rest)) {
      out.push({ index: m.index, mono: m[4] || '', num: Number(m[3] || m[5]) });
    }
  }
  return out;
}
// 앵커의 채널-ID(모노)를 채널 키로. POST 형식(모노 없음)이면 null(채널 무관).
function anchorChannel(mono) {
  if (!mono) return null;
  const plat = channelRegistry.ID_PLATFORM[mono.toUpperCase()];
  return plat ? channelRegistry.channelKey(plat) : undefined; // 매핑 불가 = undefined(불일치 취급)
}

// 공유 파일에서 이 포스트(n·channel) 블록만 제거. n을 가리키는 강한 헤더가 채널 일치로 '정확히
// 하나'일 때만 제거하고, 없거나 모호(2개+)하면 아무것도 지우지 않는다(형제·공유 파일 보호).
// 헤더가 전혀 없으면 파일명이 이 포스트 전용 프리픽스일 때만 파일 삭제.
function exciseBlockFromFile(abs, filename, topic, n, prefixRes, channelKey) {
  let text;
  try { text = fs.readFileSync(abs, 'utf8'); } catch { return { changed: false }; }
  const anchors = headerAnchors(text);
  if (anchors.length) {
    const channelOk = (a) => {
      const ch = anchorChannel(a.mono);
      return ch === null || !channelKey || ch === channelKey;
    };
    // n을 가리키고 채널도 맞는 강한 헤더가 유일할 때만 대상 확정 (토픽 부분일치 폴백 없음).
    const nMatch = anchors.filter((a) => a.num === Number(n) && channelOk(a));
    if (nMatch.length !== 1) return { changed: false };
    const targetIdx = anchors.indexOf(nMatch[0]);
    const bounds = anchors.map((a) => a.index);
    bounds.push(text.length);
    const head = text.slice(0, bounds[0]);
    let kept = '';
    for (let i = 0; i < anchors.length; i++) {
      if (i === targetIdx) continue;
      kept += text.slice(bounds[i], bounds[i + 1]);
    }
    const rest = (head + kept).replace(/\n{3,}/g, '\n\n').trim();
    if (!rest) { // 남은 내용이 전혀 없을 때만 파일 삭제 (앵커 앞 머리말이 있으면 보존)
      try { fs.unlinkSync(abs); return { changed: true, deletedFile: true }; } catch { return { changed: false }; }
    }
    try { fs.writeFileSync(abs, rest + '\n'); return { changed: true, excised: true }; } catch { return { changed: false }; }
  }
  // 강한 헤더가 없는 파일 — 파일명이 이 포스트 전용 프리픽스일 때만 삭제(공유 파일 오삭제 방지)
  if (prefixRes && prefixRes.some((re) => re.test(filename))) {
    try { fs.unlinkSync(abs); return { changed: true, deletedFile: true }; } catch { return { changed: false }; }
  }
  return { changed: false };
}

// outputs/<lane>에서 프리픽스 일치 파일만 삭제(이 포스트 소유 증명). 삭제한 rel 목록 반환.
function deletePrefixMatched(dir, lane, extRe, prefixRes, deleted, failed) {
  const laneAbs = safeInside(dir, path.join('outputs', lane));
  if (!laneAbs) return;
  let names = [];
  try { names = fs.readdirSync(laneAbs); } catch { return; }
  for (const name of names) {
    if (!extRe.test(name) || !prefixRes.some((re) => re.test(name))) continue;
    const abs = path.join(laneAbs, name);
    try {
      if (!fs.statSync(abs).isFile()) continue;
      fs.unlinkSync(abs);
      deleted.push('outputs/' + lane + '/' + name);
    } catch (e) { failed.push({ rel: 'outputs/' + lane + '/' + name, error: e.message }); }
  }
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
  const prefixRes = renderPrefixRes(card);
  const deleted = [];
  const failed = [];

  // 1) 본문 먼저 — 블록을 특정하지 못하면 이미지도 건드리지 않고 취소(부분 파괴 방지)
  if (wantCopy) {
    const copyRels = new Set();
    for (const f of (card.files || [])) if (COPY_KINDS.has(f.kind)) copyRels.add(f.rel);
    let excisedAny = false;
    for (const rel of copyRels) {
      const abs = safeInside(dir, rel);
      if (!abs) { failed.push({ rel, error: '경로 이탈' }); continue; }
      const r = exciseBlockFromFile(abs, rel.split('/').pop(), card.topic, card.n, prefixRes, card.channel);
      if (r.changed) { excisedAny = true; deleted.push(rel + (r.deletedFile ? ' (파일 삭제)' : ' (블록 제거)')); }
    }
    if (!excisedAny) {
      return { ok: false, uid, error: '이 포스트의 본문 블록을 특정하지 못해 삭제를 취소했습니다 (공유 파일 안전 보호).', deleted: [], failed };
    }
  }

  // 2) 이미지/영상 — 파일명이 이 포스트 프리픽스와 일치하는 것만. 브리프·풀 이미지·형제 제외.
  if (wantImage) {
    deletePrefixMatched(dir, 'creatives', IMG_EXT, prefixRes, deleted, failed);
    deletePrefixMatched(dir, 'videos', VID_EXT, prefixRes, deleted, failed);
    const vabs = safeInside(dir, path.join('outputs', 'variants', uid));
    if (vabs && fs.existsSync(vabs)) {
      try { fs.rmSync(vabs, { recursive: true, force: true }); deleted.push('outputs/variants/' + uid + '/'); }
      catch (e) { failed.push({ rel: 'outputs/variants/' + uid, error: e.message }); }
    }
  }

  if (!deleted.length) {
    return { ok: false, uid, deleted, failed, error: '삭제할 파일을 찾지 못했습니다 (이 포스트 소유의 이미지/본문 없음).' };
  }
  return { ok: true, uid, deleted, failed, reset: wantCopy ? 'planned' : 'copy' };
}

module.exports = { deleteAssets, exciseBlockFromFile, renderPrefixRes };
