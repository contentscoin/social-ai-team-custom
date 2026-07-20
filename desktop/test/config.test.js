// config.js — 단계별 엔진 오버라이드(getEngineFor/setStageEngine) 테스트.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

function fresh() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'config-test-'));
  process.env.SAT_HOME = home;
  delete require.cache[require.resolve('../lib/config')];
  return require('../lib/config');
}

test('getEngineFor — 오버라이드 없으면 전역 엔진을 따른다', () => {
  const config = fresh();
  assert.equal(config.getEngine(), 'claude'); // 기본
  assert.equal(config.getEngineFor('calendar'), 'claude');
  config.setEngine('codex');
  assert.equal(config.getEngineFor('calendar'), 'codex'); // 전역 변경 반영
});

test('setStageEngine — 특정 단계만 다른 엔진, 나머지는 전역', () => {
  const config = fresh();
  config.setEngine('codex'); // 전역 codex
  config.setStageEngine('calendar', 'claude'); // 캘린더만 claude
  assert.equal(config.getEngineFor('calendar'), 'claude');
  assert.equal(config.getEngineFor('copy'), 'codex'); // 나머지는 전역(codex)
  assert.deepEqual(config.getStageEngines(), { calendar: 'claude' });
});

test('setStageEngine — 빈 값/기본은 오버라이드 해제(전역 따름)', () => {
  const config = fresh();
  config.setStageEngine('copy', 'codex');
  assert.equal(config.getEngineFor('copy'), 'codex');
  config.setStageEngine('copy', ''); // 해제
  assert.equal(config.getEngineFor('copy'), 'claude'); // 전역 기본으로 복귀
  assert.deepEqual(config.getStageEngines(), {});
});

test('setStageEngine — 잘못된 엔진 값은 저장하지 않는다(해제 취급)', () => {
  const config = fresh();
  config.setStageEngine('verify', 'gpt'); // 무효
  assert.equal(config.getStageEngines().verify, undefined);
  assert.equal(config.getEngineFor('verify'), 'claude');
});

test('오버라이드는 재로드 후에도 유지된다', () => {
  const config = fresh();
  config.setStageEngine('compliance', 'codex');
  delete require.cache[require.resolve('../lib/config')];
  const reloaded = require('../lib/config');
  assert.equal(reloaded.getEngineFor('compliance'), 'codex');
});

test.after(() => { delete process.env.SAT_HOME; });
