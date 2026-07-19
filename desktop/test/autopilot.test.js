// autopilot.js — 승인 게이트 앞 자동 진행 로직 테스트 (deps 주입, 게이트는 임시 디렉터리).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const autopilot = require('../lib/autopilot');
const gates = require('../lib/gates');

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'autopilot-test-'));

// 증거 세트 → computeGates가 기대하는 보드 골격
function boardWith(evidence = {}) {
  return {
    foundation: { brand: true },
    hasCalendar: !!evidence.calendar,
    posts: evidence.copy ? [{ stage: 'copy', isReel: false, visual: '' }] : [],
    lanes: { creatives: [] },
    compliance: evidence.compliance ? { pass: 1, warn: 0, block: evidence.block || 0 } : null,
    calendarHash: 'h1',
  };
}

test('도장 없는 경계에서 paused — calendar 실행 후 copy 진입 전 멈춘다', async () => {
  const dir = tmpDir();
  const ranStages = [];
  let hasCalendar = false;
  const r = await autopilot.run(dir, {
    buildBoard: () => boardWith({ calendar: hasCalendar }),
    runStage: async (_d, stage) => { ranStages.push(stage); if (stage === 'calendar') hasCalendar = true; return { ok: true }; },
  });
  assert.equal(r.state, 'paused');
  assert.equal(r.needStamp, 'calendar');
  assert.deepEqual(ranStages, ['calendar']);
});

test('증거가 있는 단계는 재실행하지 않는다(skip), 도장이 있으면 다음 단계로', async () => {
  const dir = tmpDir();
  gates.approve(dir, { node: 'calendar', calendarHash: 'h1' });
  const ranStages = [];
  const events = [];
  const r = await autopilot.run(dir, {
    buildBoard: () => boardWith({ calendar: true }),
    runStage: async (_d, stage) => { ranStages.push(stage); return { ok: true }; },
    onEvent: (ev) => events.push(ev.state),
  });
  // calendar는 증거 있음 → skip, copy부터 실행 시작
  assert.ok(events.includes('skip'));
  assert.deepEqual(ranStages, ['copy']);
  // shortform/visuals는 포스트 0개라 공허참 증거로 skip — done 검사가 도장 검사보다
  // 먼저라 copy 도장은 확인되지 않고, 실행이 필요한 visuals-generate 앞(visuals 도장)에서 멈춘다
  assert.equal(r.state, 'paused');
  assert.equal(r.needStamp, 'visuals');
});

test('단계 실패 시 failed로 종료하고 이후 단계를 실행하지 않는다', async () => {
  const dir = tmpDir();
  const ranStages = [];
  const r = await autopilot.run(dir, {
    buildBoard: () => boardWith({}),
    runStage: async (_d, stage) => { ranStages.push(stage); return { ok: false, resultText: '캘린더 생성 실패' }; },
  });
  assert.equal(r.state, 'failed');
  assert.equal(r.stage, 'calendar');
  assert.deepEqual(ranStages, ['calendar']);
});

test('예산 초과 — 새 단계를 시작하지 않고 paused로 멈춘다', async () => {
  const dir = tmpDir();
  const ranStages = [];
  const r = await autopilot.run(dir, {
    buildBoard: () => boardWith({}),
    runStage: async (_d, stage) => { ranStages.push(stage); return { ok: true }; },
    checkBudget: () => ({ over: true, monthCost: 12.5, budgetUsd: 10 }),
  });
  assert.equal(r.state, 'paused');
  assert.deepEqual(r.budget, { over: true, monthCost: 12.5, budgetUsd: 10 });
  assert.deepEqual(ranStages, []); // 예산 초과 상태에서는 어떤 단계도 실행되지 않는다
});

test('예산 이내 — checkBudget이 있어도 정상 진행한다', async () => {
  const dir = tmpDir();
  const ranStages = [];
  const r = await autopilot.run(dir, {
    buildBoard: () => boardWith({}),
    runStage: async (_d, stage) => { ranStages.push(stage); return { ok: false } ; },
    checkBudget: () => ({ over: false, monthCost: 1, budgetUsd: 10 }),
  });
  assert.equal(r.state, 'failed'); // 예산이 아니라 단계 실패로 종료
  assert.deepEqual(ranStages, ['calendar']);
});

test('stop() — 실행 중 중지하면 stopped로 종료한다', async () => {
  const dir = tmpDir();
  const r = await autopilot.run(dir, {
    buildBoard: () => boardWith({}),
    runStage: async () => { autopilot.stop(); return { ok: true }; },
  });
  assert.equal(r.state, 'stopped');
  assert.equal(autopilot.status().running, false);
});

test('종료 후 상태가 리셋되어 재실행 가능하다', async () => {
  const dir = tmpDir();
  const deps = { buildBoard: () => boardWith({}), runStage: async () => ({ ok: false }) };
  await autopilot.run(dir, deps);
  const r2 = await autopilot.run(dir, deps);
  assert.equal(r2.ok, true); // '이미 실행 중' 에러가 아니어야 한다
  assert.equal(r2.state, 'failed');
});

test('실행 중 중복 run은 거부된다', async () => {
  const dir = tmpDir();
  let release;
  const gate = new Promise((res) => { release = res; });
  const p1 = autopilot.run(dir, {
    buildBoard: () => boardWith({}),
    runStage: async () => { await gate; return { ok: false }; },
  });
  await new Promise((res) => setTimeout(res, 10)); // p1이 runStage에 진입할 시간
  const r2 = await autopilot.run(dir, {});
  assert.equal(r2.ok, false);
  release();
  await p1;
});
