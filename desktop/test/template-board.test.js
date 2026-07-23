// template-board.js — 채널 미리보기 목업 + Threads 댓글 체인 분할.
const { test } = require('node:test');
const assert = require('node:assert/strict');

// IIFE가 globalThis.SatTemplate 를 붙인다(브라우저 모듈이지만 node에서도 로드됨).
require('../src/template-board');
const { splitThreadChain, channelMockHTML } = globalThis.SatTemplate;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

test('splitThreadChain — 짧은 글은 단일 세그먼트', () => {
  assert.deepEqual(splitThreadChain('오늘도 좋은 하루 보내세요.'), ['오늘도 좋은 하루 보내세요.']);
  assert.deepEqual(splitThreadChain(''), []);
});

test('splitThreadChain — Post n/N: 마커로 분할하고 마커는 제거', () => {
  const segs = splitThreadChain('Post 1/3: 첫 번째 이야기.\nPost 2/3: 두 번째 이야기.\nPost 3/3: 마지막.');
  assert.equal(segs.length, 3);
  assert.equal(segs[0], '첫 번째 이야기.');
  assert.equal(segs[2], '마지막.');
  assert.doesNotMatch(segs.join('\n'), /Post \d\/\d/);
});

test('splitThreadChain — --- / === 구분선으로 분할', () => {
  const segs = splitThreadChain('메인 글입니다.\n---\n첫 답글.\n===\n둘째 답글.');
  assert.deepEqual(segs, ['메인 글입니다.', '첫 답글.', '둘째 답글.']);
});

test('splitThreadChain — 마커 없는 장문은 480자 이하 세그먼트로 문단 분할', () => {
  const para = (n) => `문단${n} ` + '가'.repeat(300); // 각 ~305자
  const long = [para(1), para(2), para(3)].join('\n\n');
  const segs = splitThreadChain(long);
  assert.ok(segs.length >= 3, `장문이 여러 세그먼트로: ${segs.length}`);
  for (const s of segs) assert.ok(s.length <= 480, `세그먼트 ${s.length}자 ≤ 480`);
});

test('splitThreadChain — 한 문단이 한도를 넘으면 단어 단위로 더 쪼갠다', () => {
  const words = Array.from({ length: 200 }, (_, i) => `단어${i}`).join(' '); // 공백 포함 장문 한 문단
  const segs = splitThreadChain(words);
  assert.ok(segs.length > 1);
  for (const s of segs) assert.ok(s.length <= 480);
});

test('channelMockHTML — threads: 장문이면 메인글 + 답글 체인 렌더', () => {
  const long = '메인 후킹 문장입니다.\n---\n답글 하나.\n---\n답글 둘.';
  const html = channelMockHTML('threads', { text: long, handle: 'brand', esc, satUrl: (r) => r });
  assert.match(html, /스레드 체인/);
  assert.match(html, /답글 1\/2/);
  assert.match(html, /답글 2\/2/);
});

test('channelMockHTML — threads: 짧은 글은 단일 노트(체인 없음)', () => {
  const html = channelMockHTML('threads', { text: '짧은 한 줄.', handle: 'brand', esc, satUrl: (r) => r });
  assert.doesNotMatch(html, /스레드 체인/);
  assert.match(html, /짧은 한 줄/);
});
