// Approval gate persistence + current-node computation.
// context/gates.json: { approvals: [{node, approvedAt, signer, note, warnSigned:[]}] }
const fs = require('fs');
const path = require('path');

// 스테퍼 노드 — foundation + 파이프라인 단계 (publish 노드가 review를 겸한다).
// 릴스/보드(shortform)는 독립 노드에서 '비주얼 생성'의 하위 단계로 통합(0.19.34) —
// 릴스를 편성하지 않는 달이 많은데 독립 노드·순서 요건이 진행을 막는 구간이 됐었다.
const NODES = [
  { key: 'foundation', label: '파운데이션', stage: null },
  { key: 'calendar', label: '캘린더', stage: 'calendar' },
  { key: 'copy', label: '카피', stage: 'copy' },
  { key: 'verify', label: '사실 검증', stage: 'verify' },
  { key: 'visuals', label: '비주얼 브리프', stage: 'visuals' },
  { key: 'visuals-generate', label: '비주얼 생성 (+릴스)', stage: 'visuals-generate' },
  { key: 'compliance', label: '컴플라이언스', stage: 'compliance' },
  { key: 'publish', label: '발행', stage: 'review' },
];

// 승인 도장이 필요한 노드(단일 정본) — computeGates·오토파일럿·렌더러 CTA가 이 목록을 공유한다.
// visuals(비주얼 브리프)는 이미지 생성 비용 전 사람 검수 게이트다 — 예전엔 이 목록에서 빠져
// UI엔 승인 버튼이 안 뜨는데 오토파일럿은 visuals 승인을 요구해 교착되는 버그가 있었다.
const STAMP_NODES = ['calendar', 'copy', 'verify', 'visuals', 'compliance'];
function needsStamp(key) { return STAMP_NODES.includes(key); }

// 텍스트 전용 포맷(이미지가 필요 없는 포스트) — 게이트 증거와 autovisual 렌더 대상 판정이 공유하는 정본.
function isTextOnlyFormat(format) { return /^\s*(?:text|poll|텍스트|투표)\s*$/i.test(String(format || '')); }

// 프롬프트 시트 커버리지 — dir가 주어졌을 때만(호출부가 넘김). lazy require: promptsheet가
// 이 모듈의 isTextOnlyFormat을 쓰므로 상단 require는 순환이 된다.
function psCovers(dir, posts) {
  if (!dir) return false;
  try { return require('./promptsheet').covers(dir, posts); } catch { return false; }
}

function gatesPath(dir) { return path.join(dir, 'context', 'gates.json'); }
function load(dir) {
  const p = gatesPath(dir);
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch {
    // 승인 도장은 이 앱의 핵심 안전 기록 — 깨졌으면 백업하고 새로 시작 (조용한 소실 금지)
    if (fs.existsSync(p)) { try { fs.renameSync(p, p + '.corrupt-' + Date.now()); } catch { /* best effort */ } }
    return { approvals: [] };
  }
}
function approve(dir, entry) {
  const g = load(dir);
  g.approvals = g.approvals.filter((a) => a.node !== entry.node);
  g.approvals.push({ ...entry, approvedAt: new Date().toISOString() });
  fs.mkdirSync(path.join(dir, 'context'), { recursive: true });
  // 원자적 교체 — 크래시가 도장 기록을 통째로 날리지 않게
  const p = gatesPath(dir);
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(g, null, 2));
  fs.renameSync(tmp, p);
  return g;
}
// stamps from a different calendar version are stale — a regenerated month must be re-approved
function approvedSet(g, calendarHash) {
  return new Set((g.approvals || [])
    .filter((a) => !a.calendarHash || !calendarHash || a.calendarHash === calendarHash)
    .map((a) => a.node));
}

// evidence per node from board data; approval unlocks regardless (conservative on ambiguity)
function computeGates(board, gatesData, dir) {
  const ok = approvedSet(gatesData, board.calendarHash);
  const posts = board.posts || [];
  const at = (s) => posts.filter((p) => ['planned', 'copy', 'visual', 'review', 'ready'].indexOf(p.stage) >= ['planned', 'copy', 'visual', 'review', 'ready'].indexOf(s)).length;
  // 비주얼 증거 — 브리프(프롬프트 로그·.md)와 "실제 렌더된 이미지"를 엄격히 구분한다.
  // creatives 레인에 파일이 있다고 이미지가 생성된 게 아니다(브리프만 있어도 prompts-used.md가 생긴다).
  // 실제 렌더는 카드의 render 파일(board.js가 이미지 파일만 kind:'render'로 첨부)로만 판정한다.
  const creativeFiles = (board.lanes && board.lanes.creatives) || [];
  const hasBriefFile = creativeFiles.some((f) => !/\.(png|jpe?g|webp|gif)$/i.test(f.name || ''));
  const renderCount = (p) => (p.files || []).filter((f) => f.kind === 'render').length;
  const isTextOnly = (p) => isTextOnlyFormat(p.format);
  // 이미지가 필요한 정적 포스트 = 릴/텍스트가 아니고 카피 산출물이 있는 것. 릴 영상은 별도 레인.
  const imgPosts = posts.filter((p) => p.stage !== 'planned' && !p.isReel && !isTextOnly(p));
  const anyCopy = posts.some((p) => p.stage !== 'planned');
  const evidence = {
    foundation: !!(board.foundation && board.foundation.brand),
    calendar: !!board.hasCalendar,
    copy: at('copy') > 0,
    // 사실 검증 리포트가 존재하면 done (판정이 하나라도 기록됨). 교체 루프는 디렉터가 처리.
    verify: !!(board.verify && (board.verify.pass + board.verify.revise) > 0),
    // 비주얼 브리프 = 프롬프트 시트 — 이미지가 필요한 전 포스트의 렌더 프롬프트가 시트에 올라
    // 있으면 done(승인 대상 완비). "승인한 문장 = 과금되는 문장"의 증거다. 구 신호(브리프 파일·
    // 렌더 진행)도 하위호환으로 유지. 공허참은 이미지 필요 포스트가 0일 때만.
    visuals: psCovers(dir, posts) || hasBriefFile || at('visual') > 0 || posts.every((p) => p.isReel || isTextOnly(p)),
    // 실제 생성(2차)이 끝났는가 = 이미지 필요 포스트 전부에 렌더 파일 + 편성된 릴에 대본이 있다.
    // 릴스/보드는 이 단계의 하위 단계다(독립 노드였을 땐 릴 없는 달에도 순서 요건이 진행을 막았다).
    'visuals-generate': anyCopy
      && !posts.some((p) => p.isReel && p.stage === 'planned') // 편성된 릴에 대본·보드가 나왔는가 (릴 없으면 공허참)
      && (imgPosts.length === 0 || imgPosts.every((p) => renderCount(p) > 0)),
    compliance: !!(board.compliance && (board.compliance.pass + board.compliance.warn + board.compliance.block) > 0),
    publish: posts.length > 0 && posts.every((p) => p.stage === 'ready'),
  };
  const nodes = NODES.map((n) => ({
    ...n,
    done: !!evidence[n.key],
    approved: ok.has(n.key),
    needsStamp: needsStamp(n.key), // 승인 도장이 필요한 게이트인지 — 렌더러 CTA가 이 값을 읽는다
    blocked: n.key === 'publish' && board.compliance && board.compliance.block > 0,
  }));
  // done = evidence && (auto nodes) — approval gates need a stamp to unlock the NEXT node
  let current = 0;
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    const cleared = n.done && (!n.needsStamp || n.approved);
    if (cleared) current = Math.min(i + 1, nodes.length - 1);
    else break;
  }
  return { nodes, current, approvals: gatesData.approvals || [] };
}

module.exports = { NODES, STAMP_NODES, needsStamp, isTextOnlyFormat, load, approve, approvedSet, computeGates };
