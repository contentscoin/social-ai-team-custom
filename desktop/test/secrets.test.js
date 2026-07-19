// secrets.js — safeStorage 암호화 저장·평문 이관·키체인 부재 폴백 테스트.
// 일렉트론 밖이므로 Module._load 후킹으로 safeStorage를 스텁해 암호화 경로를 검증한다.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

// 가역 스텁 — 실제 암호화 대신 접두사만 붙인다 (경로·포맷 검증이 목적)
const fakeSafeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (s) => Buffer.from('ENC:' + s, 'utf8'),
  decryptString: (buf) => {
    const s = buf.toString('utf8');
    if (!s.startsWith('ENC:')) throw new Error('bad ciphertext');
    return s.slice(4);
  },
};

let electronStub = null; // null이면 require('electron')이 실제처럼 실패
const origLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === 'electron') {
    if (electronStub) return electronStub;
    throw Object.assign(new Error("Cannot find module 'electron'"), { code: 'MODULE_NOT_FOUND' });
  }
  return origLoad.call(this, request, ...rest);
};

// SAT_HOME은 모듈 상수라 테스트마다 새로 require한다
function freshSecrets(dir) {
  process.env.SAT_HOME = dir;
  delete require.cache[require.resolve('../lib/secrets')];
  return require('../lib/secrets');
}
const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'secrets-test-'));

test('키체인 없음 — 평문(0600) 폴백으로 set/get/has 라운드트립', () => {
  electronStub = null;
  const dir = tmpDir();
  const secrets = freshSecrets(dir);
  secrets.set('x', { apiKey: 'k-1234567890', apiSecret: 'secret-value' });
  assert.equal(secrets.get('x').apiKey, 'k-1234567890');
  assert.equal(secrets.has('x', ['apiKey', 'apiSecret']), true);
  assert.equal(fs.existsSync(path.join(dir, 'secrets.json')), true);
  assert.equal(fs.existsSync(path.join(dir, 'secrets.enc')), false);
});

test('masked — 비밀은 앞 4자만, URL·ID류는 평문 노출', () => {
  electronStub = null;
  const secrets = freshSecrets(tmpDir());
  secrets.set('linkedin', { accessToken: 'AQXJ1234567890', personUrn: 'urn:li:person:42', apiUrl: 'https://api.example.com' });
  const m = secrets.masked('linkedin');
  assert.equal(m.accessToken, 'AQXJ…90');
  assert.equal(m.personUrn, 'urn:li:person:42');
  assert.equal(m.apiUrl, 'https://api.example.com');
});

test('키체인 있음 — 암호화본(secrets.enc)으로 저장, 평문 파일 없음', () => {
  electronStub = { safeStorage: fakeSafeStorage };
  const dir = tmpDir();
  const secrets = freshSecrets(dir);
  secrets.set('threads', { accessToken: 'th-token-123456' });
  assert.equal(secrets.get('threads').accessToken, 'th-token-123456');
  assert.equal(fs.existsSync(path.join(dir, 'secrets.enc')), true);
  assert.equal(fs.existsSync(path.join(dir, 'secrets.json')), false);
  // 디스크의 암호화본에 토큰 평문이 없어야 한다 (base64 봉투 안 스텁 암호문)
  const raw = fs.readFileSync(path.join(dir, 'secrets.enc'), 'utf8');
  assert.doesNotMatch(raw, /th-token-123456/);
  assert.equal(JSON.parse(raw).v, 1);
});

test('구버전 평문 secrets.json — 최초 접근 시 암호화본으로 이관 후 평문 삭제', () => {
  electronStub = { safeStorage: fakeSafeStorage };
  const dir = tmpDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'secrets.json'), JSON.stringify({ openai: { apiKey: 'sk-legacy-key' } }));
  const secrets = freshSecrets(dir);
  assert.equal(secrets.get('openai').apiKey, 'sk-legacy-key');
  assert.equal(fs.existsSync(path.join(dir, 'secrets.json')), false);
  assert.equal(fs.existsSync(path.join(dir, 'secrets.enc')), true);
  // 이관 후에도 정상 조회
  assert.equal(secrets.get('openai').apiKey, 'sk-legacy-key');
});

test('평문과 암호화본이 공존하면 평문(더 최근 기록)이 네임스페이스 단위로 우선', () => {
  electronStub = { safeStorage: fakeSafeStorage };
  const dir = tmpDir();
  const secrets = freshSecrets(dir);
  secrets.set('x', { apiKey: 'old-key-000000' });
  // 키체인 공백기에 평문으로 기록된 상황을 재현
  fs.writeFileSync(path.join(dir, 'secrets.json'), JSON.stringify({ x: { apiKey: 'new-key-111111' } }));
  assert.equal(secrets.get('x').apiKey, 'new-key-111111');
  assert.equal(fs.existsSync(path.join(dir, 'secrets.json')), false);
});

test('깨진 암호화본은 백업(.corrupt-*)하고 빈 상태로 시작한다', () => {
  electronStub = { safeStorage: fakeSafeStorage };
  const dir = tmpDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'secrets.enc'), '{broken');
  const secrets = freshSecrets(dir);
  assert.deepEqual(secrets.get('x'), {});
  const backups = fs.readdirSync(dir).filter((f) => f.startsWith('secrets.enc.corrupt-'));
  assert.equal(backups.length, 1);
});

test('키체인이 사라져도 암호화본은 보존된다 (평문 폴백으로만 동작)', () => {
  electronStub = { safeStorage: fakeSafeStorage };
  const dir = tmpDir();
  let secrets = freshSecrets(dir);
  secrets.set('facebook', { pageToken: 'fb-token-999999' });
  // 키체인 소실 재현
  electronStub = null;
  secrets = freshSecrets(dir);
  assert.deepEqual(secrets.get('facebook'), {}); // 복호화 불가 — 그러나
  assert.equal(fs.existsSync(path.join(dir, 'secrets.enc')), true); // enc는 남아 있다
  // 키체인 복구 시 다시 읽힌다
  electronStub = { safeStorage: fakeSafeStorage };
  secrets = freshSecrets(dir);
  assert.equal(secrets.get('facebook').pageToken, 'fb-token-999999');
});

test.after(() => {
  Module._load = origLoad;
  delete process.env.SAT_HOME;
});
