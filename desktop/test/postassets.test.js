// postassets.js — 포스트별 이미지/본문 삭제 + 재기획 리셋(형제·공유 파일 안전 보호).
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
const IG1 = [/^ig-0*1(?![0-9])/i];

test('exciseBlockFromFile — 형제가 본문에서 토픽을 언급해도, n을 가리키는 헤더 블록만 제거', () => {
  const dir = tmp();
  const f = path.join(dir, 'outputs', 'captions', 'aug.md');
  writeLane(dir, 'captions', 'aug.md',
    'POST 1 — 여름 세일\nCAPTION: 여름 세일 안내, 곧 가을 신상도 나옵니다\n\nPOST 2 — 가을 신상\nCAPTION: 가을 신상 소개\n');
  const r = postassets.exciseBlockFromFile(f, 'aug.md', '가을 신상', 2, IG1);
  assert.equal(r.changed, true);
  const after = fs.readFileSync(f, 'utf8');
  assert.match(after, /여름 세일 안내/);        // 형제(POST 1) 보존 — 예전엔 이게 잘못 삭제됐다
  assert.doesNotMatch(after, /가을 신상 소개/);   // 대상(POST 2)만 제거
});

test('exciseBlockFromFile — 장식 헤더(## POST / **POST**)도 블록만 제거, 파일 통삭제 안 함', () => {
  const dir = tmp();
  const f = path.join(dir, 'outputs', 'captions', 'dec.md');
  writeLane(dir, 'captions', 'dec.md',
    '## POST 1 — 라떼\nCAPTION: a\n\n**POST 2** — 신메뉴\nCAPTION: b\n');
  const r = postassets.exciseBlockFromFile(f, 'dec.md', '라떼', 1, IG1);
  assert.equal(r.excised, true);
  assert.equal(fs.existsSync(f), true);
  assert.match(fs.readFileSync(f, 'utf8'), /신메뉴/); // 형제 보존
});

test('exciseBlockFromFile — 본문 속 "# 소제목"은 앵커가 아니다(부분 삭제 없음)', () => {
  const dir = tmp();
  const f = path.join(dir, 'outputs', 'captions', 'one.md');
  writeLane(dir, 'captions', 'one.md', 'POST 1 — 라떼\nCAPTION: a\n# 오늘의 팁\n본문 계속\n');
  const r = postassets.exciseBlockFromFile(f, 'one.md', '라떼', 1, IG1);
  assert.equal(r.deletedFile, true); // 단일 포스트 → 파일 삭제(H1으로 쪼개지지 않음)
  assert.equal(fs.existsSync(f), false);
});

test('exciseBlockFromFile — 앵커 없는 파일: 포스트 전용 파일명만 삭제, 공유 파일명은 보존', () => {
  const dir = tmp();
  const own = path.join(dir, 'outputs', 'captions', 'ig-1.md');
  const shared = path.join(dir, 'outputs', 'captions', 'august.md');
  writeLane(dir, 'captions', 'ig-1.md', 'CAPTION: 라떼 본문\n');
  writeLane(dir, 'captions', 'august.md', 'CAPTION: 라떼 본문\n');
  assert.equal(postassets.exciseBlockFromFile(own, 'ig-1.md', '라떼', 1, IG1).deletedFile, true);
  assert.equal(fs.existsSync(own), false);
  const r2 = postassets.exciseBlockFromFile(shared, 'august.md', '라떼', 1, IG1);
  assert.equal(r2.changed, false); // 공유 파일명 + 앵커 없음 → 안전하게 미삭제
  assert.equal(fs.existsSync(shared), true);
});

test('deleteAssets — 이미지 삭제는 이 포스트 프리픽스 파일만; 형제/풀/브리프는 보존', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'context', 'content-calendar.md'),
    'POST 1 — 라떼\nPlatform: Instagram\nFormat: single image\nTopic: 라떼\n\nPOST 2 — 신메뉴\nPlatform: Instagram\nFormat: single image\nTopic: 신메뉴\n');
  writeLane(dir, 'captions', 'ig-1.md', 'POST 1\nCAPTION: 라떼 소개\n');
  writeLane(dir, 'creatives', 'ig-1.png', 'A');
  writeLane(dir, 'creatives', 'ig-2.png', 'B');       // 형제 포스트 이미지
  writeLane(dir, 'creatives', 'leftover.png', 'C');   // 프리픽스 불일치(풀/잔상)
  writeLane(dir, 'creatives', 'prompts-used.md', '라떼 신메뉴 브리프'); // 공유 브리프
  const r = postassets.deleteAssets(dir, 'instagram-1', { image: true });
  assert.equal(r.ok, true);
  assert.equal(fs.existsSync(path.join(dir, 'outputs', 'creatives', 'ig-1.png')), false); // 대상 삭제
  assert.equal(fs.existsSync(path.join(dir, 'outputs', 'creatives', 'ig-2.png')), true);  // 형제 보존
  assert.equal(fs.existsSync(path.join(dir, 'outputs', 'creatives', 'leftover.png')), true); // 잔상 보존
  assert.equal(fs.existsSync(path.join(dir, 'outputs', 'creatives', 'prompts-used.md')), true); // 브리프 보존
});

test('deleteAssets — 본문 블록을 특정 못 하면 취소(이미지도 삭제 안 함)', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'context', 'content-calendar.md'),
    'POST 1 — 라떼\nPlatform: Instagram\nFormat: single image\nTopic: 라떼\n');
  // 카피 파일은 board가 본문 토픽으로 붙이지만, 헤더는 POST 9(다른 번호)·다른 주제라 특정 불가
  writeLane(dir, 'captions', 'shared.md', 'POST 9 — 다른 주제\nCAPTION: 여기에 라떼 언급이 있음\n');
  writeLane(dir, 'creatives', 'ig-1.png', 'A');
  const r = postassets.deleteAssets(dir, 'instagram-1', { copy: true });
  assert.equal(r.ok, false); // 본문 특정 실패 → 취소
  assert.equal(fs.existsSync(path.join(dir, 'outputs', 'creatives', 'ig-1.png')), true); // 이미지 파괴 안 됨
  assert.equal(fs.existsSync(path.join(dir, 'outputs', 'captions', 'shared.md')), true); // 공유 파일 보존
});

test('deleteAssets — 본문 삭제 성공 시 이미지도 함께, 카드가 planned로', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'context', 'content-calendar.md'),
    'POST 1 — 라떼\nPlatform: Instagram\nFormat: single image\nTopic: 라떼\n');
  writeLane(dir, 'captions', 'ig-1.md', 'POST 1 라떼\nCAPTION: 라떼 소개\n');
  writeLane(dir, 'creatives', 'ig-1.png', 'A');
  let b = board.buildBoard(dir);
  assert.equal(b.posts[0].stage, 'visual');
  const r = postassets.deleteAssets(dir, 'instagram-1', { copy: true });
  assert.equal(r.ok, true);
  assert.equal(r.reset, 'planned');
  b = board.buildBoard(dir);
  assert.equal(b.posts[0].stage, 'planned');
});

test('deleteAssets — 지울 게 없으면 ok:false (거짓 성공 금지)', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'context', 'content-calendar.md'),
    'POST 1 — 라떼\nPlatform: Instagram\nFormat: single image\nTopic: 라떼\n');
  writeLane(dir, 'captions', 'ig-1.md', 'POST 1\nCAPTION: 라떼\n'); // 이미지 없음
  const r = postassets.deleteAssets(dir, 'instagram-1', { image: true });
  assert.equal(r.ok, false);
});

test('deleteAssets — 없는 uid는 실패', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'context', 'content-calendar.md'), 'POST 1 — t\nTopic: t\n');
  assert.equal(postassets.deleteAssets(dir, 'nope-9', { image: true }).ok, false);
});
