// schema.js — schemaVersion 스탬프·마이그레이션 체인·멱등성 테스트.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

// SAT_HOME/SAT_WORKROOT는 모듈 상수라 테스트마다 새로 require한다
function freshSchema(home, workroot) {
  process.env.SAT_HOME = home;
  process.env.SAT_WORKROOT = workroot;
  delete require.cache[require.resolve('../lib/schema')];
  return require('../lib/schema');
}
const tmpDir = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));

test('레거시 파일 스탬프 — 형태 보존 + schemaVersion 1', () => {
  const home = tmpDir('schema-home-');
  const schema = freshSchema(home, tmpDir('schema-root-'));
  const file = path.join(home, 'gates.json');
  fs.writeFileSync(file, JSON.stringify({ approvals: [{ node: 'calendar' }] }));
  assert.equal(schema.migrateFile('gates', file), 'stamped');
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(j.schemaVersion, 1);
  assert.deepEqual(j.approvals, [{ node: 'calendar' }]);
  // 멱등 — 두 번째 실행은 current
  assert.equal(schema.migrateFile('gates', file), 'current');
});

test('settings v0→v1 — 문자열 세션을 엔진별 객체로 정규화', () => {
  const home = tmpDir('schema-home-');
  const schema = freshSchema(home, tmpDir('schema-root-'));
  const file = path.join(home, 'settings.json');
  fs.writeFileSync(file, JSON.stringify({
    engine: 'claude',
    sessions: { '/ws/a': 'sess-123', '/ws/b': 'codex-started', '/ws/c': { claude: 'x1' } },
  }));
  assert.equal(schema.migrateFile('settings', file), 'migrated');
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(j.schemaVersion, 1);
  assert.deepEqual(j.sessions['/ws/a'], { claude: 'sess-123' });
  assert.deepEqual(j.sessions['/ws/b'], { codex: 'codex-started' });
  assert.deepEqual(j.sessions['/ws/c'], { claude: 'x1' }); // 이미 객체면 그대로
  assert.equal(j.engine, 'claude');
});

test('없는 파일·깨진 파일·배열 JSON은 건드리지 않는다', () => {
  const home = tmpDir('schema-home-');
  const schema = freshSchema(home, tmpDir('schema-root-'));
  assert.equal(schema.migrateFile('gates', path.join(home, 'none.json')), 'absent');
  const broken = path.join(home, 'broken.json');
  fs.writeFileSync(broken, '{nope');
  assert.equal(schema.migrateFile('gates', broken), 'skipped');
  assert.equal(fs.readFileSync(broken, 'utf8'), '{nope'); // 원본 그대로
  const arr = path.join(home, 'arr.json');
  fs.writeFileSync(arr, '[1,2]');
  assert.equal(schema.migrateFile('gates', arr), 'skipped');
});

test('migrateAll — 전역 + 워크스페이스 파일을 훑고 리포트를 낸다', () => {
  const home = tmpDir('schema-home-');
  const root = tmpDir('schema-root-');
  const schema = freshSchema(home, root);
  fs.writeFileSync(path.join(home, 'settings.json'), JSON.stringify({ engine: 'claude', sessions: {} }));
  fs.writeFileSync(path.join(root, 'clients.json'), JSON.stringify({ clients: [] }));
  const ws = tmpDir('schema-ws-');
  fs.mkdirSync(path.join(ws, 'context'), { recursive: true });
  fs.writeFileSync(path.join(ws, 'context', 'gates.json'), JSON.stringify({ approvals: [] }));
  const rep = schema.migrateAll([ws]);
  const byKey = Object.fromEntries(rep.map((r) => [r.key, r.result]));
  assert.equal(byKey.settings, 'migrated'); // v0→v1 정규화 체인 통과
  assert.equal(byKey.clients, 'stamped');
  assert.equal(byKey.gates, 'stamped');
  assert.equal(byKey.history, 'absent');
  assert.equal(byKey.publishQueue, 'absent');
});

test('스탬프된 gates.json은 기존 모듈과 호환 — approve가 schemaVersion을 보존한다', () => {
  const home = tmpDir('schema-home-');
  const schema = freshSchema(home, tmpDir('schema-root-'));
  const gates = require('../lib/gates');
  const ws = tmpDir('schema-ws-');
  fs.mkdirSync(path.join(ws, 'context'), { recursive: true });
  const file = path.join(ws, 'context', 'gates.json');
  fs.writeFileSync(file, JSON.stringify({ approvals: [] }));
  schema.migrateFile('gates', file);
  gates.approve(ws, { node: 'calendar', signer: 'A' });
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(j.schemaVersion, 1); // load→save 라운드트립에서 유실되지 않는다
  assert.equal(j.approvals.length, 1);
});

test.after(() => { delete process.env.SAT_HOME; delete process.env.SAT_WORKROOT; });
