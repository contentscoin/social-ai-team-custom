// backup.js — 폴더 사본 백업·복원·안전 스냅샷 테스트.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

function freshBackup(workroot) {
  process.env.SAT_WORKROOT = workroot;
  delete require.cache[require.resolve('../lib/backup')];
  return require('../lib/backup');
}
const tmpDir = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));
function seedClient(root, name) {
  const dir = path.join(root, name);
  fs.mkdirSync(path.join(dir, 'context'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'outputs', 'captions'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'context', 'brand-style.md'), '# 브랜드');
  fs.writeFileSync(path.join(dir, 'outputs', 'captions', 'ig-1.md'), 'CAPTION: 원본');
  return dir;
}

test('createBackup → listBackups — 매니페스트·파일 수·정렬', () => {
  const root = tmpDir('backup-root-');
  const backup = freshBackup(root);
  const dir = seedClient(root, 'cafe-a');
  const r = backup.createBackup(dir);
  assert.equal(r.ok, true);
  assert.equal(r.files, 2);
  const items = backup.listBackups();
  assert.equal(items.length, 1);
  assert.equal(items[0].client, 'cafe-a');
  assert.equal(items[0].kind, 'manual');
  assert.equal(items[0].sourceDir, path.resolve(dir));
  // 백업 사본에 원본 파일이 들어 있다
  assert.equal(fs.readFileSync(path.join(items[0].path, 'outputs', 'captions', 'ig-1.md'), 'utf8'), 'CAPTION: 원본');
});

test('restoreBackup — 내용 복원 + pre-restore 안전 스냅샷', () => {
  const root = tmpDir('backup-root-');
  const backup = freshBackup(root);
  const dir = seedClient(root, 'cafe-b');
  const made = backup.createBackup(dir);
  // 백업 후 파일이 훼손된 상황
  fs.writeFileSync(path.join(dir, 'outputs', 'captions', 'ig-1.md'), 'CAPTION: 훼손됨');
  fs.writeFileSync(path.join(dir, 'context', 'junk.md'), 'x');
  const r = backup.restoreBackup(made.name, dir);
  assert.equal(r.ok, true);
  assert.equal(fs.readFileSync(path.join(dir, 'outputs', 'captions', 'ig-1.md'), 'utf8'), 'CAPTION: 원본');
  assert.equal(fs.existsSync(path.join(dir, 'context', 'junk.md')), false); // 폴더 교체 방식
  // 복원 직전 상태가 pre-restore 스냅샷으로 남는다 — 실수 복원 되돌리기 가능
  const snap = backup.listBackups().find((b) => b.kind === 'pre-restore');
  assert.ok(snap);
  assert.equal(fs.readFileSync(path.join(snap.path, 'outputs', 'captions', 'ig-1.md'), 'utf8'), 'CAPTION: 훼손됨');
  assert.equal(r.snapshot, snap.name);
});

test('없는 백업·없는 대상 폴더·경로 이탈 이름은 거부', () => {
  const root = tmpDir('backup-root-');
  const backup = freshBackup(root);
  const dir = seedClient(root, 'cafe-c');
  assert.equal(backup.restoreBackup('no-such-backup', dir).ok, false);
  const made = backup.createBackup(dir);
  assert.equal(backup.restoreBackup(made.name, path.join(root, 'no-dir')).ok, false);
  // basename 처리 — '../' 류 이름으로 백업 루트 밖을 가리킬 수 없다
  assert.equal(backup.restoreBackup('../../etc', dir).ok, false);
});

test('deleteBackup — 매니페스트 있는 백업만 삭제', () => {
  const root = tmpDir('backup-root-');
  const backup = freshBackup(root);
  const dir = seedClient(root, 'cafe-d');
  const made = backup.createBackup(dir);
  assert.equal(backup.deleteBackup('nope').ok, false);
  assert.equal(backup.deleteBackup(made.name).ok, true);
  assert.equal(backup.listBackups().length, 0);
});

test.after(() => { delete process.env.SAT_WORKROOT; });
