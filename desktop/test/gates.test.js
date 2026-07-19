// gates.js — 승인 게이트 계산·영속화 테스트.
// computeGates는 순수(보드+게이트 데이터 in → 노드/현재 out), load/approve는 임시 디렉터리로.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const gates = require('../lib/gates');

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'gates-test-'));

// 보드 최소 골격 — 필요한 증거만 덮어쓴다
function board(overrides = {}) {
  return {
    foundation: { brand: false },
    hasCalendar: false,
    posts: [],
    lanes: { creatives: [] },
    compliance: null,
    calendarHash: 'abc123',
    ...overrides,
  };
}
const empty = { approvals: [] };
const nodeOf = (g, key) => g.nodes.find((n) => n.key === key);

test('빈 보드 — current 0, 포스트 없는 shortform/visuals만 공허참으로 충족', () => {
  const g = gates.computeGates(board(), empty);
  assert.equal(g.nodes.length, gates.NODES.length);
  // 포스트가 0개면 "릴스 없음"·"비주얼 계획 없음" 조건이 공허하게 참 — 그 외에는 전부 미완
  const vacuous = new Set(['shortform', 'visuals']);
  for (const n of g.nodes) assert.equal(n.done, vacuous.has(n.key), n.key);
  assert.equal(g.current, 0);
});

test('done은 노드별 증거와 정확히 일치한다 (특성화 — gates.js:64 정리 후 동작 고정)', () => {
  const b = board({
    foundation: { brand: true },
    hasCalendar: true,
    posts: [{ stage: 'copy', isReel: false, visual: '' }],
  });
  const g = gates.computeGates(b, empty);
  assert.equal(nodeOf(g, 'foundation').done, true);
  assert.equal(nodeOf(g, 'calendar').done, true);
  assert.equal(nodeOf(g, 'copy').done, true);
  // 릴스가 없으면 shortform은 자동 충족
  assert.equal(nodeOf(g, 'shortform').done, true);
  assert.equal(nodeOf(g, 'publish').done, false);
});

test('승인 도장 없는 calendar에서 current가 멈춘다', () => {
  const b = board({ foundation: { brand: true }, hasCalendar: true });
  const g = gates.computeGates(b, empty);
  // foundation은 도장 불필요 — calendar까지 진입, calendar는 도장 대기
  assert.equal(g.current, 1);
});

test('calendar 도장이 찍히면 current가 전진한다', () => {
  const b = board({ foundation: { brand: true }, hasCalendar: true });
  const g = gates.computeGates(b, { approvals: [{ node: 'calendar', calendarHash: 'abc123' }] });
  assert.equal(g.current > 1, true);
});

test('다른 calendarHash의 도장은 스테일 — 무시된다', () => {
  const b = board({ foundation: { brand: true }, hasCalendar: true });
  const g = gates.computeGates(b, { approvals: [{ node: 'calendar', calendarHash: 'DIFFERENT' }] });
  assert.equal(nodeOf(g, 'calendar').approved, false);
  assert.equal(g.current, 1);
});

test('approvedSet — 해시 없는 도장은 항상 유효, 해시 불일치만 걸러진다', () => {
  const g = {
    approvals: [
      { node: 'copy' }, // 구버전 도장 (해시 없음)
      { node: 'calendar', calendarHash: 'h1' },
      { node: 'compliance', calendarHash: 'h2' },
    ],
  };
  const s = gates.approvedSet(g, 'h1');
  assert.equal(s.has('copy'), true);
  assert.equal(s.has('calendar'), true);
  assert.equal(s.has('compliance'), false);
});

test('verify 노드 — 검증 리포트(board.verify)가 있으면 done, 도장 전엔 visuals로 못 넘어간다', () => {
  const b = board({
    foundation: { brand: true }, hasCalendar: true,
    posts: [{ stage: 'copy', isReel: false, visual: '' }],
    verify: { pass: 3, revise: 0, file: { rel: 'outputs/verify/x.md' } },
  });
  // calendar·copy 도장은 있지만 verify 도장은 없음 → verify에서 current가 멈춘다(visuals 잠금)
  const appr = { approvals: [{ node: 'calendar', calendarHash: 'abc123' }, { node: 'copy', calendarHash: 'abc123' }] };
  const g = gates.computeGates(b, appr);
  assert.equal(nodeOf(g, 'verify').done, true);
  const verifyIdx = g.nodes.findIndex((n) => n.key === 'verify');
  assert.equal(g.current, verifyIdx); // verify 도장 대기 — 다음(visuals)으로 못 감
  // verify 도장을 찍으면 전진
  appr.approvals.push({ node: 'verify', calendarHash: 'abc123' });
  assert.equal(gates.computeGates(b, appr).current > verifyIdx, true);
});

test('verify 노드 — 리포트 없으면 done=false', () => {
  const b = board({ foundation: { brand: true }, hasCalendar: true, posts: [{ stage: 'copy', isReel: false, visual: '' }] });
  assert.equal(nodeOf(gates.computeGates(b, empty), 'verify').done, false);
});

test('BLOCK이 있으면 publish 노드가 blocked', () => {
  const b = board({ compliance: { pass: 1, warn: 0, block: 2 } });
  const g = gates.computeGates(b, empty);
  assert.equal(nodeOf(g, 'publish').blocked, true);
});

test('approve → load 라운드트립, 같은 노드 재승인은 교체', () => {
  const dir = tmpDir();
  gates.approve(dir, { node: 'calendar', signer: 'A', calendarHash: 'h1' });
  gates.approve(dir, { node: 'calendar', signer: 'B', calendarHash: 'h1' });
  const g = gates.load(dir);
  assert.equal(g.approvals.length, 1);
  assert.equal(g.approvals[0].signer, 'B');
  assert.equal(typeof g.approvals[0].approvedAt, 'string');
});

test('깨진 gates.json은 백업(.corrupt-*) 후 빈 상태로 시작한다', () => {
  const dir = tmpDir();
  fs.mkdirSync(path.join(dir, 'context'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'context', 'gates.json'), '{not json');
  const g = gates.load(dir);
  assert.deepEqual(g, { approvals: [] });
  const backups = fs.readdirSync(path.join(dir, 'context')).filter((f) => f.startsWith('gates.json.corrupt-'));
  assert.equal(backups.length, 1);
});
