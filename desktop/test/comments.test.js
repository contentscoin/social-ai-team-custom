// comments.js — 답글 프롬프트·채널 응답 정규화 테스트 (네트워크·CLI 경로는 제외).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const comments = require('../lib/comments');

test('buildReplyPrompt — 맥락(본문·댓글)과 안전 규칙이 모두 담긴다', () => {
  const p = comments._buildReplyPrompt({
    channel: 'threads', topic: '라떼 아트', postBody: '오늘의 라떼 아트를 소개합니다',
    author: '@fan1', comment: '어디 카페인가요?',
  });
  assert.match(p, /\[채널\] threads/);
  assert.match(p, /오늘의 라떼 아트를 소개합니다/);
  assert.match(p, /어디 카페인가요\?/);
  assert.match(p, /@fan1/);
  assert.match(p, /환불·보상·법적 책임을 약속하지 말 것/);
  assert.match(p, /\[운영자 확인 필요\]/);
  assert.match(p, /답글 텍스트만/);
});

test('normFbComments — 필드 정규화, 빈 본문 제외', () => {
  const list = comments._normFbComments({
    data: [
      { id: 'c1', message: '좋아요!', from: { name: '김손님' }, created_time: '2026-07-19T10:00:00+0000' },
      { id: 'c2', message: '', from: { name: 'x' } }, // 스티커 등 빈 본문
      { id: 'c3', message: '위치 궁금해요' },
    ],
  });
  assert.equal(list.length, 2);
  assert.deepEqual(list[0], { id: 'c1', author: '김손님', text: '좋아요!', at: '2026-07-19T10:00:00+0000' });
  assert.equal(list[1].author, '(이름 비공개)');
});

test('normThreadsReplies — username 앞에 @, 빈 본문 제외', () => {
  const list = comments._normThreadsReplies({
    data: [
      { id: 't1', text: '멋져요', username: 'fan1', timestamp: '2026-07-19T10:00:00+0000' },
      { id: 't2', text: '' },
    ],
  });
  assert.equal(list.length, 1);
  assert.equal(list[0].author, '@fan1');
});

test('빈 응답·필드 누락에도 안전', () => {
  assert.deepEqual(comments._normFbComments(null), []);
  assert.deepEqual(comments._normThreadsReplies({}), []);
});
