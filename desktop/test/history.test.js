// history.js — 월×dir 롤업 무손실 집계·CAP trim·레거시 백필 테스트.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

// SAT_HOME은 모듈 상수라 테스트마다 새로 require한다
function freshHistory(dir) {
  process.env.SAT_HOME = dir;
  delete require.cache[require.resolve('../lib/history')];
  return require('../lib/history');
}
const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'history-test-'));
const month = new Date().toISOString().slice(0, 7);

test('append → forDir: 실행 기록과 월 비용 합계', () => {
  const history = freshHistory(tmpDir());
  history.append({ dir: '/ws/a', kind: 'stage', stage: 'copy', ok: true, ms: 1000, costUsd: 0.5 });
  history.append({ dir: '/ws/a', kind: 'chat', ok: true, ms: 500, costUsd: 0.25 });
  history.append({ dir: '/ws/b', kind: 'stage', ok: true, ms: 100, costUsd: 9 }); // 다른 워크스페이스
  const { runs, monthCost } = history.forDir('/ws/a');
  assert.equal(runs.length, 2);
  assert.equal(monthCost, 0.75);
  assert.equal(history.monthCost('/ws/a'), 0.75);
  assert.equal(history.monthCost('/ws/b'), 9);
});

test('CAP(500) 초과로 runs가 잘려도 월 비용 집계는 무손실', () => {
  const home = tmpDir();
  const history = freshHistory(home);
  for (let i = 0; i < 520; i++) history.append({ dir: '/ws/a', kind: 'stage', ok: true, ms: 1, costUsd: 0.01 });
  const saved = JSON.parse(fs.readFileSync(path.join(home, 'history.json'), 'utf8'));
  assert.equal(saved.runs.length, 500); // trim은 그대로
  assert.equal(history.monthCost('/ws/a'), 5.2); // 520 × 0.01 — 잘린 20건도 집계에 남는다
});

test('롤업 없는 레거시 history.json — 남은 runs로 백필', () => {
  const home = tmpDir();
  fs.mkdirSync(home, { recursive: true });
  fs.writeFileSync(path.join(home, 'history.json'), JSON.stringify({
    runs: [
      { dir: '/ws/a', kind: 'stage', ok: true, costUsd: 1.5, at: `${month}-01T10:00:00.000Z` },
      { dir: '/ws/a', kind: 'chat', ok: true, costUsd: 0.5, at: `${month}-02T10:00:00.000Z` },
      { dir: '/ws/a', kind: 'stage', ok: true, at: `${month}-03T10:00:00.000Z` }, // 비용 없는 실행
    ],
  }));
  const history = freshHistory(home);
  assert.equal(history.monthCost('/ws/a'), 2);
  assert.equal(history.forDir('/ws/a').monthCost, 2);
});

test('지난달 비용은 이번 달 집계에 섞이지 않는다', () => {
  const home = tmpDir();
  fs.mkdirSync(home, { recursive: true });
  fs.writeFileSync(path.join(home, 'history.json'), JSON.stringify({
    runs: [{ dir: '/ws/a', costUsd: 3, at: '2020-01-15T10:00:00.000Z' }],
  }));
  const history = freshHistory(home);
  assert.equal(history.monthCost('/ws/a'), 0);
  assert.equal(history.monthCost('/ws/a', '2020-01'), 3);
});

test.after(() => { delete process.env.SAT_HOME; });
