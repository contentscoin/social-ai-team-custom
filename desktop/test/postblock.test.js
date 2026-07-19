// postblock.js — 포스트 블록 탐색·발행 본문 추출 테스트.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { findPostBlock, findVisualDirection, extractPublishBody } = require('../lib/postblock');

const tmpWorkspace = () => fs.mkdtempSync(path.join(os.tmpdir(), 'postblock-test-'));
const writeLane = (dir, lane, name, text) => {
  const p = path.join(dir, 'outputs', lane);
  fs.mkdirSync(p, { recursive: true });
  fs.writeFileSync(path.join(p, name), text);
};

test('findPostBlock — 앵커(POST n) 사이에서 토픽 블록을 찾는다', () => {
  const dir = tmpWorkspace();
  writeLane(dir, 'captions', 'week1.md', [
    'POST 1 — 라떼 아트',
    'CAPTION: 라떼 아트 첫 포스트',
    '',
    'POST 2 — 신메뉴',
    'CAPTION: 신메뉴 소개 포스트',
  ].join('\n'));
  const r = findPostBlock(dir, 'captions', '신메뉴');
  assert.equal(r.ok, true);
  assert.match(r.text, /신메뉴 소개/);
  assert.doesNotMatch(r.text, /라떼 아트/);
});

test('findPostBlock — 본문 내부 ##/---에서 블록이 끊기지 않는다', () => {
  const dir = tmpWorkspace();
  writeLane(dir, 'naver', 'post.md', 'NB-1 브랜드 스토리\nBODY:\n인트로\n## 소제목\n본문 계속 브랜드 스토리\n');
  const r = findPostBlock(dir, 'naver', '브랜드 스토리');
  assert.equal(r.ok, true);
  assert.match(r.text, /소제목/);
  assert.match(r.text, /본문 계속/);
});

test('findPostBlock — 레인 경로 이탈은 거부', () => {
  const dir = tmpWorkspace();
  const r = findPostBlock(dir, '../../etc', 'x');
  assert.equal(r.ok, false);
  assert.match(r.error, /escape/);
});

test('findVisualDirection — 대문자·소문자 표기 모두 매칭 (case-insensitive 계약)', () => {
  const dir = tmpWorkspace();
  writeLane(dir, 'captions', 'a.md', 'POST 1 — 토픽A\nCAPTION: 토픽A 캡션\nVISUAL DIRECTION: warm cafe interior\n');
  writeLane(dir, 'captions', 'b.md', 'POST 9 — 토픽B\nCAPTION: 토픽B 캡션\nVisual direction: minimal flat lay\n');
  assert.equal(findVisualDirection(dir, 'captions', '토픽A'), 'warm cafe interior');
  assert.equal(findVisualDirection(dir, 'captions', '토픽B'), 'minimal flat lay');
});

test('extractPublishBody — CAPTION + HASHTAGS 결합, VISUAL DIRECTION·메타 제거', () => {
  const { text, title } = extractPublishBody([
    'POST 1 — 라떼 아트',
    'PLATFORM: Instagram',
    'CAPTION: 오늘의 라떼 아트를 소개합니다',
    'VISUAL DIRECTION: latte art close-up, morning light',
    '',
    'HASHTAGS: #홈카페 #라떼아트',
    'Char count: 42',
  ].join('\n'));
  assert.match(text, /오늘의 라떼 아트/);
  assert.match(text, /#홈카페 #라떼아트/);
  assert.doesNotMatch(text, /VISUAL DIRECTION|latte art close-up/i);
  assert.doesNotMatch(text, /PLATFORM|Char count/i);
  assert.equal(title, null);
});

test('extractPublishBody — TITLE/BODY 규약(블로그)과 TAGS 해시태그화', () => {
  const { text, title } = extractPublishBody([
    'TITLE: 겨울 홈카페 가이드',
    'BODY:',
    '따뜻한 겨울 음료 레시피.',
    'TAGS: 홈카페, 겨울음료',
  ].join('\n'));
  assert.equal(title, '겨울 홈카페 가이드');
  assert.match(text, /따뜻한 겨울 음료/);
  assert.match(text, /#홈카페 #겨울음료/);
});

test('extractPublishBody — 라벨 없는 스레드 스타일은 메타만 제거하고 본문 유지', () => {
  const { text } = extractPublishBody('THREAD 1\n오늘도 좋은 하루.\nVISUAL DIRECTION: none\nWORD COUNT: 9\n');
  assert.equal(text, '오늘도 좋은 하루.');
});
