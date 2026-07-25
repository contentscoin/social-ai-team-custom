// promptsheet.js — 프롬프트 시트: 빌드(컴파일 선실행)·승인·생성 재사용·커버리지 증거.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const psheet = require('../lib/promptsheet');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'psheet-'));
const post = (over = {}) => ({
  uid: 'u1', chId: 'IG', n: 1, channel: 'instagram', topic: '가을 신메뉴', format: 'multi-image',
  stage: 'copy', isReel: false, visual: '따뜻한 톤', angle: '앵글A', pillar: '필러B', ...over,
});

test('isImageTarget·briefFor — 릴·텍스트 전용 제외, 브리프에 캘린더 필드+공통 지시', () => {
  assert.equal(psheet.isImageTarget(post()), true);
  assert.equal(psheet.isImageTarget(post({ isReel: true })), false);
  assert.equal(psheet.isImageTarget(post({ format: 'text' })), false);
  assert.equal(psheet.isImageTarget(post({ stage: 'planned' })), false);
  const b = psheet.briefFor(post(), '밝게 가자');
  assert.match(b, /가을 신메뉴/);
  assert.match(b, /비주얼 디렉션: 따뜻한 톤/);
  assert.match(b, /공통 지시\(사용자\): 밝게 가자/);
});

test('build — 대상 포스트마다 컴파일 1회, 카드형은 브리프 원문(gn-html), 재실행 시 기존 유지', async () => {
  const dir = tmp();
  let compileCalls = 0;
  const fakeBoard = { buildBoard: () => ({ posts: [
    post(),                                                        // 사진형 → 컴파일
    post({ uid: 'u2', chId: 'NB', n: 2, channel: 'naver', format: '카드뉴스 6장', topic: '원두 비교' }), // 카드형 → gn-html, 컴파일 생략
    post({ uid: 'u3', chId: 'RL', n: 3, isReel: true }),           // 릴 → 제외
  ] }) };
  const fakePL = { compile: async () => { compileCalls++; return { ok: true, prompt: 'COMPILED-PROMPT', negative: 'neg' }; } };
  const r = await psheet.build(dir, { _board: fakeBoard, _promptlab: fakePL, provider: 'ima2' });
  assert.equal(r.ok, true);
  assert.equal(r.total, 2);
  assert.equal(compileCalls, 1); // 사진형 1건만 컴파일
  const sheet = psheet.get(dir);
  const ig = sheet.entries.find((e) => e.cid === 'IG-1');
  const nb = sheet.entries.find((e) => e.cid === 'NB-2');
  assert.equal(ig.prompt, 'COMPILED-PROMPT');
  assert.equal(ig.provider, 'ima2');
  assert.equal(nb.provider, 'gn-html');
  assert.match(nb.prompt, /원두 비교/); // 브리프 원문
  // 재실행 — 같은 topic·count·size면 컴파일 재발생 없이 유지
  const r2 = await psheet.build(dir, { _board: fakeBoard, _promptlab: fakePL, provider: 'ima2' });
  assert.equal(compileCalls, 1);
  assert.equal(r2.kept, 2);
});

test('approve — 개별 수정 + 공통 지시 반영해 확정, approvedFor로 생성이 재사용', async () => {
  const dir = tmp();
  const fakeBoard = { buildBoard: () => ({ posts: [post()] }) };
  const fakePL = { compile: async () => ({ ok: true, prompt: 'ORIGINAL', negative: null }) };
  await psheet.build(dir, { _board: fakeBoard, _promptlab: fakePL, provider: 'ima2' });
  // 시트 없을 땐 approvedFor null
  assert.equal(psheet.approvedFor(dir, 'IG-1'), null);
  const r = psheet.approve(dir, { common: '전체적으로 밝게', edits: [{ cid: 'IG-1', prompt: 'EDITED' }] });
  assert.equal(r.ok, true);
  assert.equal(r.approved, 1);
  const ap = psheet.approvedFor(dir, 'IG-1');
  assert.match(ap.approvedPrompt, /^EDITED/);
  assert.match(ap.approvedPrompt, /전체적으로 밝게/); // 공통 지시가 꼬리에 붙는다
  // 빈 시트 승인 거부
  assert.equal(psheet.approve(tmp(), {}).ok, false);
});

test('covers — 이미지 필요 전 포스트가 시트에 있어야 true (게이트 visuals 증거)', async () => {
  const dir = tmp();
  const posts = [post(), post({ uid: 'u2', chId: 'TH', n: 2, channel: 'threads' })];
  const fakePL = { compile: async () => ({ ok: true, prompt: 'P' }) };
  // 시트 없음 → false
  assert.equal(psheet.covers(dir, posts), false);
  // 1건만 있는 시트 → false
  await psheet.build(dir, { _board: { buildBoard: () => ({ posts: [posts[0]] }) }, _promptlab: fakePL, provider: 'ima2' });
  assert.equal(psheet.covers(dir, posts), false);
  // 전부 커버 → true (릴·텍스트 전용은 요구 안 함)
  await psheet.build(dir, { _board: { buildBoard: () => ({ posts }) }, _promptlab: fakePL, provider: 'ima2' });
  assert.equal(psheet.covers(dir, posts), true);
  assert.equal(psheet.covers(dir, [...posts, post({ uid: 'u3', chId: 'RL', n: 9, isReel: true })]), true);
});
