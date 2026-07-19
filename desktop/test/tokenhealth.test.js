// tokenhealth.js — 장수 토큰(60일) 만료 추적. secrets의 _savedAt 스탬프와 함께 검증.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

function fresh(home) {
  process.env.SAT_HOME = home;
  delete require.cache[require.resolve('../lib/secrets')];
  delete require.cache[require.resolve('../lib/tokenhealth')];
  return { secrets: require('../lib/secrets'), tokenhealth: require('../lib/tokenhealth') };
}
const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tokenhealth-test-'));

test('set()이 토큰 저장 시 _savedAt 스탬프 — masked()에는 노출되지 않는다', () => {
  const { secrets } = fresh(tmpDir());
  const m = secrets.set('threads', { userId: '123', token: 'tok_abcdef1234' });
  assert.equal(m._savedAt, undefined);
  assert.ok(secrets.get('threads')._savedAt);
  assert.equal(Object.keys(secrets.masked('threads')).includes('_savedAt'), false);
});

test('check — 경과일에 따라 ok → warn → expired 전이', () => {
  const { secrets, tokenhealth } = fresh(tmpDir());
  secrets.set('threads', { userId: '1', token: 'tok_x' });
  const saved = new Date(secrets.get('threads')._savedAt);
  const at = (days) => new Date(saved.getTime() + days * 86400000);
  assert.equal(tokenhealth.check(at(10))[0].level, 'ok');
  assert.equal(tokenhealth.check(at(55))[0].level, 'warn');
  assert.equal(tokenhealth.check(at(61))[0].level, 'expired');
  assert.equal(tokenhealth.warnings(at(10)).length, 0);
  assert.equal(tokenhealth.warnings(at(61)).length, 1);
  assert.match(tokenhealth.describe(tokenhealth.check(at(61))[0]), /만료/);
});

test('_savedAt 없는 기존 토큰은 unknown, 토큰 없는 커넥터는 미추적', () => {
  const home = tmpDir();
  fs.writeFileSync(
    path.join(home, 'secrets.json'),
    JSON.stringify({ linkedin: { personId: 'p', token: 'tok_legacy' }, instagram: { userId: 'u' } })
  );
  const { tokenhealth } = fresh(home);
  const rows = tokenhealth.check();
  const li = rows.find((r) => r.connector === 'linkedin');
  assert.equal(li.level, 'unknown');
  assert.match(tokenhealth.describe(li), /다시 저장/);
  assert.equal(rows.find((r) => r.connector === 'instagram'), undefined); // 토큰 키 없음
  assert.equal(rows.find((r) => r.connector === 'threads'), undefined); // 커넥터 없음
});

test('토큰을 전부 지우면 _savedAt만 남지 않고 ns가 정리된다', () => {
  const { secrets } = fresh(tmpDir());
  secrets.set('threads', { token: 'tok_1' });
  secrets.set('threads', { token: '' });
  assert.deepEqual(secrets.get('threads'), {});
});

test.after(() => { delete process.env.SAT_HOME; });
