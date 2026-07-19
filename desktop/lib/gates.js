// Approval gate persistence + current-node computation.
// context/gates.json: { approvals: [{node, approvedAt, signer, note, warnSigned:[]}] }
const fs = require('fs');
const path = require('path');

// 8-node stepper — maps 1:1 to foundation + the 7 pipeline stages (publish node hosts review)
const NODES = [
  { key: 'foundation', label: '파운데이션', stage: null },
  { key: 'calendar', label: '캘린더', stage: 'calendar' },
  { key: 'copy', label: '카피', stage: 'copy' },
  { key: 'shortform', label: '릴스/보드', stage: 'shortform' },
  { key: 'verify', label: '사실 검증', stage: 'verify' },
  { key: 'visuals', label: '비주얼 브리프', stage: 'visuals' },
  { key: 'visuals-generate', label: '비주얼 생성', stage: 'visuals-generate' },
  { key: 'compliance', label: '컴플라이언스', stage: 'compliance' },
  { key: 'publish', label: '발행', stage: 'review' },
];

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
function computeGates(board, gatesData) {
  const ok = approvedSet(gatesData, board.calendarHash);
  const posts = board.posts || [];
  const at = (s) => posts.filter((p) => ['planned', 'copy', 'visual', 'review', 'ready'].indexOf(p.stage) >= ['planned', 'copy', 'visual', 'review', 'ready'].indexOf(s)).length;
  const evidence = {
    foundation: !!(board.foundation && board.foundation.brand),
    calendar: !!board.hasCalendar,
    copy: at('copy') > 0,
    // 릴스/보드 단계가 '만드는' 것은 대본·스토리보드·슬라이드 가이드다(최종 영상 렌더가 아님).
    // 따라서 모든 릴 슬롯에 대본 증거(planned 넘어섬)가 있으면 done. 릴이 없으면 공허참으로 done.
    // (예전엔 'visual'=렌더된 mp4를 요구해 대본이 있어도 노드가 안 열리고 오토파일럿이 맴돌았다)
    shortform: !posts.some((p) => p.isReel) || posts.filter((p) => p.isReel).every((p) => p.stage !== 'planned'),
    // 사실 검증 리포트가 존재하면 done (판정이 하나라도 기록됨). 교체 루프는 디렉터가 처리.
    verify: !!(board.verify && (board.verify.pass + board.verify.revise) > 0),
    visuals: at('visual') > 0 || posts.every((p) => !p.visual),
    'visuals-generate': (board.lanes && board.lanes.creatives || []).length > 0 || at('visual') > 0,
    compliance: !!(board.compliance && (board.compliance.pass + board.compliance.warn + board.compliance.block) > 0),
    publish: posts.length > 0 && posts.every((p) => p.stage === 'ready'),
  };
  const nodes = NODES.map((n) => ({
    ...n,
    done: !!evidence[n.key],
    approved: ok.has(n.key),
    blocked: n.key === 'publish' && board.compliance && board.compliance.block > 0,
  }));
  // done = evidence && (auto nodes) — approval gates: calendar/copy/compliance need a stamp to unlock the NEXT node
  let current = 0;
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    const needsStamp = ['calendar', 'copy', 'verify', 'compliance'].includes(n.key);
    const cleared = n.done && (!needsStamp || n.approved);
    if (cleared) current = Math.min(i + 1, nodes.length - 1);
    else break;
  }
  return { nodes, current, approvals: gatesData.approvals || [] };
}

module.exports = { NODES, load, approve, approvedSet, computeGates };
