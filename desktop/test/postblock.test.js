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

test('extractPublishBody — 프롬프트 블록(영문·한글 라벨)이 발행 본문에 새지 않는다', () => {
  const { text } = extractPublishBody([
    'POST 1 — 라떼 아트',
    'CAPTION: 오늘의 라떼 아트',
    '',
    'IMAGE PROMPT: warm cafe interior, 50mm lens,',
    'soft morning light, photoreal texture',
    '',
    '비주얼 디렉션: 클로즈업, 따뜻한 톤',
    '프롬프트: 크레마 디테일 강조',
    'NEGATIVE PROMPT: text, watermark',
    '',
    'HASHTAGS: #홈카페',
  ].join('\n'));
  assert.match(text, /오늘의 라떼 아트/);
  assert.match(text, /#홈카페/);
  assert.doesNotMatch(text, /PROMPT|프롬프트|비주얼 디렉션|50mm|watermark/i);
});

test('extractPublishBody — 섹션 사이 빈 줄이 있는 프롬프트 블록도 끝까지 제거 (공냥 Format A)', () => {
  const { text } = extractPublishBody([
    'POST 2 — 신메뉴',
    'CAPTION: 새 메뉴가 나왔어요. 지금 매장에서 만나보세요.',
    '',
    'IMAGE PROMPT:',
    '# 1. Scene',
    'Scene: 우드톤 카페 테이블 위 신메뉴 한 잔.',
    '',
    '# 2. Camera',
    'Camera: 초근접, 얕은 심도.',
    '',
    'Color grading: 웜톤 #E8B168, #1B2440.',
    'AR 4:5',
    '',
    'HASHTAGS: #신메뉴',
  ].join('\n'));
  assert.match(text, /새 메뉴가 나왔어요/);
  assert.match(text, /#신메뉴/);
  assert.doesNotMatch(text, /Scene:|Camera:|Color grading|AR 4:5|# 2\./i);
});

test('extractPublishBody — 라벨 없는 글 꼬리의 프롬프트 필드(Scene/Camera/AR)도 제거', () => {
  const { text } = extractPublishBody([
    'POST 3 — 공지',
    '오늘 오후 6시부터 이벤트 시작합니다!',
    '',
    'Scene: 이벤트 포스터, 네온 조명.',
    'Camera: 정면 와이드.',
    'AR 1:1',
  ].join('\n'));
  assert.equal(text, '오늘 오후 6시부터 이벤트 시작합니다!');
});

test('extractPublishBody — 네이버 BODY 뒤 IMAGE SLOT + 6요소 프롬프트 제거, TAGS는 유지', () => {
  const { text } = extractPublishBody([
    'POST 1 — 동네 빵집',
    'TITLE: 우리 동네 빵집 이야기',
    'BODY:',
    '아침마다 갓 구운 빵 냄새가 골목을 채웁니다.',
    '',
    'IMAGE SLOT 1',
    'VISUAL DIRECTION: 갓 구운 빵 클로즈업',
    '',
    'SUBJECT: fresh bread on wooden board',
    'COMPOSITION: overhead flat lay',
    'LIGHTING: soft morning light',
    'AR 3:4',
    '',
    'TAGS: 빵집, 동네맛집',
  ].join('\n'));
  assert.match(text, /아침마다 갓 구운 빵/);
  assert.match(text, /#빵집 #동네맛집/);
  assert.doesNotMatch(text, /SUBJECT|COMPOSITION|LIGHTING|IMAGE SLOT|AR 3:4|VISUAL DIRECTION/i);
});

test('extractPublishBody — 한국어 프롬프트 라벨에 단어가 끼어도 제거 (이미지 생성 프롬프트:)', () => {
  const { text } = extractPublishBody([
    'POST 4 — 원두 소개',
    'CAPTION: 갓 볶은 원두, 지금 만나보세요.',
    '',
    '이미지 생성 프롬프트: a hero shot of coffee beans, 85mm, warm key light',
    '최종 이미지 프롬프트: macro, glossy beans, no text or logos',
    '',
    'HASHTAGS: #원두',
  ].join('\n'));
  assert.match(text, /갓 볶은 원두/);
  assert.match(text, /#원두/);
  assert.doesNotMatch(text, /프롬프트|hero shot|85mm|macro|no text/i);
});

test('extractPublishBody — 마크다운 헤딩으로 온 프롬프트(## 이미지 프롬프트)도 본문에 새지 않는다', () => {
  // 네이버 본문의 ## 소제목은 유지되지만, ## 이미지 프롬프트 헤딩과 그 아래 프롬프트는 제거
  const { text } = extractPublishBody([
    'POST 1 — 신상 소개',
    'BODY:',
    '이번 주 신상이 입고됐습니다.',
    '',
    '## 상세 스펙',
    '가볍고 튼튼한 소재를 썼어요.',
    '',
    '## 이미지 프롬프트',
    'A premium product hero shot, softbox lighting, 85mm, muted tones,',
    'absolutely no text, letters, logos, or watermarks.',
    '',
    'TAGS: 신상',
  ].join('\n'));
  assert.match(text, /이번 주 신상이 입고/);
  assert.match(text, /상세 스펙/);            // 진짜 소제목은 유지
  assert.match(text, /가볍고 튼튼한 소재/);
  assert.match(text, /#신상/);
  assert.doesNotMatch(text, /이미지 프롬프트|hero shot|softbox|85mm|no text/i);
});

test('extractPublishBody — 오버스트립 방지: "프롬프트"가 들어간 정상 본문/소제목은 유지', () => {
  // 글쓰기 계정: 캡션 안의 '오늘의 프롬프트:'는 렌더 계약이 아니라 정상 본문 — 지우면 안 됨
  const cap = extractPublishBody([
    'POST 1 — 글쓰기 챌린지',
    'CAPTION: 오늘의 프롬프트: 좋아하는 계절을 묘사해보세요.',
    'HASHTAGS: #글쓰기',
  ].join('\n'));
  assert.match(cap.text, /오늘의 프롬프트: 좋아하는 계절/);
  assert.match(cap.text, /#글쓰기/);
  // 네이버 본문의 '## 프롬프트 예시 3가지'는 프롬프트를 다루는 소제목 — 유지(라벨 헤딩만 제거해야 함)
  const nb = extractPublishBody([
    'POST 2 — AI 글쓰기',
    'BODY:',
    'AI로 글쓰기를 시작해봅니다.',
    '',
    '## 프롬프트 예시 3가지',
    '첫째, 구체적으로. 둘째, 맥락을. 셋째, 예시를.',
    '',
    'TAGS: AI글쓰기',
  ].join('\n'));
  assert.match(nb.text, /프롬프트 예시 3가지/);
  assert.match(nb.text, /첫째, 구체적으로/);
});

test('extractPublishBody — 프롬프트 필드 오탐 방지: 한국어 본문은 그대로 유지', () => {
  // "장소:"·"액션" 같은 한국어는 프롬프트 필드가 아니므로 보존
  const { text } = extractPublishBody([
    'POST 5 — 매장 안내',
    'CAPTION: 장소: 강남점 2층. 액션 가득한 주말 이벤트를 준비했어요.',
    'HASHTAGS: #강남카페',
  ].join('\n'));
  assert.match(text, /장소: 강남점 2층/);
  assert.match(text, /액션 가득한/);
});
