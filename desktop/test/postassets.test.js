// postassets.js — 포스트별 이미지/본문 삭제 + 재기획 리셋.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const postassets = require('../lib/postassets');
const board = require('../lib/board');

const tmp = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'postassets-'));
  fs.mkdirSync(path.join(dir, 'context'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'outputs'), { recursive: true });
  return dir;
};
const writeLane = (dir, lane, name, text) => {
  const p = path.join(dir, 'outputs', lane);
  fs.mkdirSync(p, { recursive: true });
  fs.writeFileSync(path.join(p, name), text);
};

test('exciseBlockFromFile — 여러 포스트 파일에서 대상 블록만 제거, 형제 보존', () => {
  const dir = tmp();
  const f = path.join(dir, 'outputs', 'captions', 'aug.md');
  writeLane(dir, 'captions', 'aug.md',
    'POST 1 — 라떼 아트\nCAPTION: 라떼 아트 본문입니다\n\nPOST 2 — 신메뉴 소개\nCAPTION: 신메뉴 본문입니다\n');
  const r = postassets.exciseBlockFromFile(f, '라떼 아트', 1);
  assert.equal(r.changed, true);
  assert.equal(r.excised, true);
  const after = fs.readFileSync(f, 'utf8');
  assert.equal(/라떼 아트/.test(after), false); // 대상 제거
  assert.equal(/신메뉴/.test(after), true);       // 형제 보존
});

test('exciseBlockFromFile — 마지막 포스트를 지우면 파일 자체 삭제', () => {
  const dir = tmp();
  const f = path.join(dir, 'outputs', 'captions', 'one.md');
  writeLane(dir, 'captions', 'one.md', 'POST 1 — 라떼 아트\nCAPTION: 본문입니다\n');
  const r = postassets.exciseBlockFromFile(f, '라떼 아트', 1);
  assert.equal(r.deletedFile, true);
  assert.equal(fs.existsSync(f), false);
});

test('deleteAssets — 이미지 삭제 시 렌더 파일 제거 + 카드가 copy로 되돌아간다', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'context', 'content-calendar.md'),
    'POST 1 — 라떼 아트\nPlatform: Instagram\nFormat: single image\nTopic: 라떼 아트\n');
  writeLane(dir, 'captions', 'ig-1.md', 'POST 1\nCAPTION: 라떼 아트 소개\n');
  writeLane(dir, 'creatives', 'ig-1.png', 'PNGDATA');
  let b = board.buildBoard(dir);
  const uid = b.posts[0].uid;
  assert.equal(b.posts[0].stage, 'visual'); // 이미지가 있어 visual
  const r = postassets.deleteAssets(dir, uid, { image: true });
  assert.equal(r.ok, true);
  assert.ok(r.deleted.length >= 1);
  assert.equal(r.reset, 'copy');
  b = board.buildBoard(dir);
  assert.equal(b.posts[0].stage, 'copy'); // 이미지 삭제 → copy로 리셋
  assert.equal(b.posts[0].thumb, null);
});

test('deleteAssets — 본문 삭제 시 카피 제거 + 이미지도 리셋 + 카드가 planned로', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'context', 'content-calendar.md'),
    'POST 1 — 라떼 아트\nPlatform: Instagram\nFormat: single image\nTopic: 라떼 아트\n');
  writeLane(dir, 'captions', 'ig-1.md', 'POST 1 라떼 아트\nCAPTION: 라떼 아트 소개\n');
  writeLane(dir, 'creatives', 'ig-1.png', 'PNGDATA');
  let b = board.buildBoard(dir);
  const uid = b.posts[0].uid;
  assert.equal(b.posts[0].stage, 'visual');
  const r = postassets.deleteAssets(dir, uid, { copy: true });
  assert.equal(r.ok, true);
  assert.equal(r.reset, 'planned');
  b = board.buildBoard(dir);
  assert.equal(b.posts[0].stage, 'planned'); // 본문+이미지 삭제 → planned
});

test('deleteAssets — 없는 uid는 실패', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'context', 'content-calendar.md'), 'POST 1 — t\nTopic: t\n');
  const r = postassets.deleteAssets(dir, 'nope-9', { image: true });
  assert.equal(r.ok, false);
});
