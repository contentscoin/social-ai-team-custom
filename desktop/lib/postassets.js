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

// 이 포스트의 렌더 파일명 프리픽스 정규식 — board.js의 renders 매칭과 동일 규약(이미지 파일용).
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

// '이 포스트 전용 파일' 판정용 — 파일 stem(확장자 제외)이 프리픽스와 '정확히' 일치할 때만.
// ig-1 / ig-1_2(캐러셀 슬롯)는 전용, ig-1-2주차(월간 공유)는 아니다. 공유 파일 통삭제 방지.
function perPostStemRes(card) {
  const chKey = card.channel || 'etc';
  const chId = card.chId || 'etc';
  const mono = (channelRegistry.REGISTRY[chKey] && channelRegistry.REGISTRY[chKey].mono) || '';
  const n = card.n;
  return [
    new RegExp(`^${escRe(chId)}-0*${n}([_-]\\d+)?$`, 'i'),
    mono ? new RegExp(`^${escRe(mono)}-0*${n}([_-]\\d+)?$`, 'i') : null,
    new RegExp(`^${escRe(chKey)}[_-]0*${n}([_-]\\d+)?$`, 'i'),
  ].filter(Boolean);
}

// 블록 경계 = 모든 포스트 헤더(board.parseCalendar와 동일 관용: #{0,4}·** 장식, 채널 모노
// 화이트리스트 또는 POST). 이 '느슨한 경계'가 형제 포스트를 서로 다른 블록으로 갈라 놓아, 대상
// 블록이 형제(장식 없는 'POST 2 신메뉴' 포함)를 삼키지 않게 한다. 'B-5'(비타민 B5) 같은
// 화이트리스트 밖 2글자-숫자는 경계도 대상도 아니다. 캡처: [full, heading, bold, postNum, mono, idNum, rest].
const ANCHOR_RE = /^[ \t]*(#{1,4}[ \t]*)?(\*\*[ \t]*)?(?:POST[ \t]*(\d+)|(IG|FB|LI|LN|IN|TH|X|NV|NB|NC|KK|TT)-(\d+))\b([^\n]*)$/gim;
const SEP_START = /^[—–‒·\-:|]/; // — – ‒ · - : |
function headerAnchors(text) {
  const out = [];
  for (const m of text.matchAll(ANCHOR_RE)) {
    const rest = (m[6] || '').replace(/^\*\*/, '').trimStart();
    // strong = 진짜 헤더 신호(헤딩/볼드/번호 뒤 구분자 또는 줄 끝). 본문 문장 'IG-5 …'는 경계는
    // 되지만(주변 텍스트 무손실 보존) strong=false라 삭제 대상으로는 뽑히지 않는다.
    const strong = !!m[1] || !!m[2] || rest === '' || SEP_START.test(rest);
    out.push({ index: m.index, mono: m[4] || '', num: Number(m[3] || m[5]), strong });
  }
  return out;
}
// 앵커의 채널-ID(모노)를 채널 키로. POST 형식(모노 없음)이면 null(채널 무관).
function anchorChannel(mono) {
  if (!mono) return null;
  const plat = channelRegistry.ID_PLATFORM[mono.toUpperCase()];
  return plat ? channelRegistry.channelKey(plat) : undefined; // 매핑 불가 = undefined(불일치 취급)
}

// 이 포스트(n·channel) 블록만 제거.
//  1) 파일명이 이 포스트 전용 프리픽스면(예: ig-1.md) 파일 전체가 이 포스트 것 → 파일 삭제.
//  2) 공유 파일이면: n을 가리키는 '강한 헤더'가 채널 일치로 정확히 하나일 때만 그 블록 제거.
//     없거나 모호(2개+)하면 아무것도 지우지 않는다(형제·공유 파일 보호).
function exciseBlockFromFile(abs, filename, topic, n, perPostRes, channelKey) {
  // 1) 포스트 전용 파일 — stem이 정확히 이 포스트 프리픽스일 때만 통째 삭제(공유 파일은 제외)
  const stem = String(filename).replace(/\.[^.]+$/, '');
  if (perPostRes && perPostRes.some((re) => re.test(stem))) {
    try { fs.unlinkSync(abs); return { changed: true, deletedFile: true }; } catch { return { changed: false }; }
  }
  // 2) 공유 파일 — 강한 헤더로 n을 유일하게 특정
  let text;
  try { text = fs.readFileSync(abs, 'utf8'); } catch { return { changed: false }; }
  const anchors = headerAnchors(text); // 느슨한 경계(형제 보존) — 대상 선택만 strong으로 좁힌다
  if (!anchors.length) return { changed: false }; // 공유 파일인데 헤더 없음 → 특정 불가, 취소
  const channelOk = (a) => {
    const ch = anchorChannel(a.mono);
    return ch === null || !channelKey || ch === channelKey;
  };
  const nMatch = anchors.filter((a) => a.strong && a.num === Number(n) && channelOk(a));
  if (nMatch.length !== 1) return { changed: false }; // 0개·모호(2개+) → 취소(토픽 폴백 없음)
  const targetIdx = anchors.indexOf(nMatch[0]);
  const bounds = anchors.map((a) => a.index);
  bounds.push(text.length);
  const head = text.slice(0, bounds[0]);
  let kept = '';
  for (let i = 0; i < anchors.length; i++) {
    if (i === targetIdx) continue; // 대상 블록만 빼고 나머지는 그대로 이어 붙인다(형제 무손실)
    kept += text.slice(bounds[i], bounds[i + 1]);
  }
  const rest = (head + kept).replace(/\n{3,}/g, '\n\n').trim();
  if (!rest) { // 남은 내용이 전혀 없을 때만 파일 삭제 (앵커 앞 머리말이 있으면 보존)
    try { fs.unlinkSync(abs); return { changed: true, deletedFile: true }; } catch { return { changed: false }; }
  }
  try { fs.writeFileSync(abs, rest + '\n'); return { changed: true, excised: true }; } catch { return { changed: false }; }
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
  const prefixRes = renderPrefixRes(card);   // 이미지 파일명 매칭(느슨)
  const perPostRes = perPostStemRes(card);   // 카피 파일 통삭제 판정(엄격 stem)
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
      const r = exciseBlockFromFile(abs, rel.split('/').pop(), card.topic, card.n, perPostRes, card.channel);
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
    // 시안(variant)은 outputs/creatives/variants/<uid> 에 있다 (variants.js).
    const vabs = safeInside(dir, path.join('outputs', 'creatives', 'variants', uid));
    if (vabs && fs.existsSync(vabs)) {
      try { fs.rmSync(vabs, { recursive: true, force: true }); deleted.push('outputs/creatives/variants/' + uid + '/'); }
      catch (e) { failed.push({ rel: 'outputs/creatives/variants/' + uid, error: e.message }); }
    }
  }

  if (!deleted.length) {
    return { ok: false, uid, deleted, failed, error: '삭제할 파일을 찾지 못했습니다 (이 포스트 소유의 이미지/본문 없음).' };
  }
  // 삭제 후 실제 카드 단계를 보드에서 재확인해 정직하게 보고(카피+PASS 카드는 이미지만 지워도
  // ready로 남을 수 있으므로, 가정값이 아니라 실제 stage를 돌려준다).
  let reset = wantCopy ? 'planned' : 'copy';
  try {
    const c2 = (board.buildBoard(dir).posts || []).find((p) => p.uid === uid);
    if (c2) reset = c2.stage;
  } catch { /* 재빌드 실패 — 가정값 유지 */ }
  return { ok: true, uid, deleted, failed, reset };
}

// 개별 이미지 1장만 삭제 — 카드 전체가 아니라 지정한 파일 하나. 안전 가드:
//  - 워크스페이스(dir) 안이어야 하고, outputs/creatives 또는 outputs/videos(및 그 하위 variants) 소속이어야 한다.
//  - 이미지/영상 확장자만. 본문(.md/.txt)·브리프는 이 경로로 지울 수 없다.
// 카드 전체 리셋을 하지 않으므로, 남은 이미지가 있으면 카드 stage는 그대로 유지된다.
function deleteOneImage(dir, rel) {
  const abs = safeInside(dir, rel);
  if (!abs) return { ok: false, error: '워크스페이스 밖 경로입니다', rel };
  // 정규화된(../ 해소된) 실제 경로로 판정 — 'outputs/creatives/../../context/x.png' 같은
  // 문자열 우회를 막는다(안전 가드는 원문 문자열이 아니라 resolve 결과로 검사해야 한다).
  const norm = path.relative(path.resolve(dir), abs).replace(/\\/g, '/');
  const inCreatives = /^outputs\/creatives\//.test(norm);
  const inVideos = /^outputs\/videos\//.test(norm);
  if (!inCreatives && !inVideos) return { ok: false, error: 'outputs/creatives 또는 outputs/videos 안의 파일만 삭제할 수 있습니다', rel };
  if (!(IMG_EXT.test(norm) || VID_EXT.test(norm))) return { ok: false, error: '이미지·영상 파일만 삭제할 수 있습니다', rel };
  try {
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return { ok: false, error: '파일이 없습니다', rel };
    fs.unlinkSync(abs);
    return { ok: true, deleted: norm };
  } catch (e) { return { ok: false, error: e.message, rel }; }
}

module.exports = { deleteAssets, deleteOneImage, exciseBlockFromFile, renderPrefixRes };
