// board.js — 캘린더 파싱(순수)과 buildBoard 스테이지 추론(픽스처 디렉터리) 테스트.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildBoard, parseCalendar } = require('../lib/board');

const tmpWorkspace = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'board-test-'));
  fs.mkdirSync(path.join(dir, 'context'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'outputs'), { recursive: true });
  return dir;
};
const writeLane = (dir, lane, name, text) => {
  const p = path.join(dir, 'outputs', lane);
  fs.mkdirSync(p, { recursive: true });
  fs.writeFileSync(path.join(p, name), text);
};

test('parseCalendar — POST 앵커 + 필드 라인', () => {
  const posts = parseCalendar([
    'POST 1 — 홈카페 라떼 아트',
    'Week: 1 | Day: Mon',
    'Platform: Instagram',
    'Format: single image',
    'Topic: 홈카페 라떼 아트',
    'VISUAL DIRECTION: latte art close-up',
    '',
    'POST 2 — 신메뉴 소개',
    'Platform: Threads',
    'Topic: 신메뉴 소개',
  ].join('\n'));
  assert.equal(posts.length, 2);
  assert.equal(posts[0].platform, 'Instagram');
  assert.equal(posts[0].format, 'single image');
  assert.equal(posts[0].week, '1');
  assert.equal(posts[0].visual, 'latte art close-up');
});

test('parseCalendar — 필드 매칭은 대소문자·장식 무시 (Visual direction: 소문자 계약)', () => {
  const upper = parseCalendar('POST 1 — t\nTopic: t\nVISUAL DIRECTION: shot A\n');
  const lower = parseCalendar('POST 1 — t\nTopic: t\n- **Visual direction**: shot A\n');
  assert.equal(upper[0].visual, 'shot A');
  assert.equal(lower[0].visual, 'shot A');
});

test('parseCalendar — 채널-ID 앵커(IG-1)에서 플랫폼 추론', () => {
  const posts = parseCalendar('IG-1 홈카페 라떼 아트\nTopic: 홈카페 라떼 아트\n\nTH-1 스레드 잡담\nTopic: 스레드 잡담\n');
  assert.equal(posts.length, 2);
  assert.match(posts[0].platform, /instagram/i);
  assert.match(posts[1].platform, /threads/i);
});

test('parseCalendar — 마크다운 표 폴백 (week/platform 시그니처)', () => {
  const md = [
    '| ID | Week | Day | Platform | Format | Topic |',
    '|---|---|---|---|---|---|',
    '| IG-1 | 1 | Mon | Instagram | reel | 라떼 아트 |',
    '| LI-2 | 1 | Tue | LinkedIn | text | 브랜드 스토리 |',
  ].join('\n');
  const posts = parseCalendar(md);
  assert.equal(posts.length, 2);
  assert.equal(posts[0].platform, 'Instagram');
  assert.equal(posts[1].topic, '브랜드 스토리');
});

test('parseCalendar — 같은 번호+토픽 중복 앵커는 dedupe', () => {
  const md = 'POST 1 — 라떼 아트\nTopic: 라떼 아트\n\nPOST 1 — 라떼 아트\nTopic: 라떼 아트\n';
  assert.equal(parseCalendar(md).length, 1);
});

test('buildBoard — 카피 산출물이 있으면 stage=copy, 캘린더 해시 존재', () => {
  const dir = tmpWorkspace();
  fs.writeFileSync(path.join(dir, 'context', 'content-calendar.md'),
    'POST 1 — 홈카페 라떼 아트\nPlatform: Instagram\nTopic: 홈카페 라떼 아트\n');
  writeLane(dir, 'captions', 'ig-1.md', 'POST 1\nCAPTION: 홈카페 라떼 아트 만들기\n');
  const b = buildBoard(dir);
  assert.equal(b.hasCalendar, true);
  assert.equal(typeof b.calendarHash, 'string');
  assert.equal(b.posts.length, 1);
  assert.equal(b.posts[0].stage, 'copy');
  assert.equal(b.posts[0].uid, 'instagram-1');
});

test('buildBoard — PASS 판정은 카피 증거가 있는 포스트만 ready로 승격', () => {
  const dir = tmpWorkspace();
  fs.writeFileSync(path.join(dir, 'context', 'content-calendar.md'),
    'POST 1 — 라떼 아트\nPlatform: Instagram\nTopic: 라떼 아트\n\nPOST 2 — 미작성 포스트\nPlatform: Instagram\nTopic: 미작성 포스트\n');
  writeLane(dir, 'captions', 'ig-1.md', 'POST 1\nCAPTION: 라떼 아트 소개\n');
  writeLane(dir, 'compliance', 'report.md', 'POST 1 라떼 아트 — PASS\nPOST 2 미작성 포스트 — PASS\n');
  const b = buildBoard(dir);
  const [p1, p2] = b.posts;
  assert.equal(p1.stage, 'ready');
  // 카피가 없는 포스트는 스테일 판정으로 승격되지 않는다
  assert.equal(p2.stage, 'planned');
  assert.equal(p2.verdict, null);
});

test('buildBoard — 릴 슬롯은 대본만 있어도 copy 단계로 전진 (캡션 불필요, 맴돔 방지)', () => {
  const dir = tmpWorkspace();
  fs.writeFileSync(path.join(dir, 'context', 'content-calendar.md'),
    'POST 1 — 바리스타의 아침 루틴\nPlatform: Instagram Reels\nFormat: reel\nTopic: 바리스타의 아침 루틴\n');
  // 캡션 없음, 릴스 대본만 존재 — 대본이 카피 증거가 되어야 한다
  writeLane(dir, 'videos', 'acme-reels-july-2026.md', 'REEL 1 — 바리스타의 아침 루틴\nHOOK (0-2s): ...\n');
  const b = buildBoard(dir);
  assert.equal(b.posts[0].isReel, true);
  assert.equal(b.posts[0].stage, 'copy');
});

test('buildBoard — 대본 토픽이 달라도 "Calendar slot: #n" 인용이면 릴이 copy로 전진', () => {
  const dir = tmpWorkspace();
  fs.writeFileSync(path.join(dir, 'context', 'content-calendar.md'),
    'POST 2 — 바리스타의 아침 루틴\nPlatform: Instagram Reels\nFormat: reel\nTopic: 바리스타의 아침 루틴\n');
  writeLane(dir, 'videos', 'acme-reels-july-2026.md', 'REEL 1 — 아침을 여는 커피\nCalendar slot: #2\nHOOK (0-2s): ...\n');
  const b = buildBoard(dir);
  assert.equal(b.posts[0].stage, 'copy'); // 토픽 불일치여도 슬롯 인용으로 매칭
});

test('buildBoard — 클립/슬라이드 포맷도 릴로 인식', () => {
  const dir = tmpWorkspace();
  fs.writeFileSync(path.join(dir, 'context', 'content-calendar.md'),
    'POST 1 — 매장 클립\nPlatform: 네이버 클립\nFormat: 클립\nTopic: 매장 클립\n');
  const b = buildBoard(dir);
  assert.equal(b.posts[0].isReel, true);
});

test('buildBoard — 브리프/프롬프트 로그만 있는 creatives는 정적 포스트를 visual로 올리지 않는다', () => {
  const dir = tmpWorkspace();
  fs.writeFileSync(path.join(dir, 'context', 'content-calendar.md'),
    'POST 1 — 라떼 아트\nPlatform: Instagram\nFormat: single image\nTopic: 라떼 아트\n');
  writeLane(dir, 'captions', 'ig-1.md', 'POST 1\nCAPTION: 라떼 아트 소개\n');
  // 브리프/프롬프트 로그(.md)만 있고 실제 이미지는 없음 — 토픽을 언급해도 visual 승격 금지
  writeLane(dir, 'creatives', 'prompts-used.md', 'POST 1 라떼 아트 — SUBJECT: latte art close-up\n');
  const b = buildBoard(dir);
  assert.equal(b.posts[0].stage, 'copy');
});

test('buildBoard — creatives에 실제 이미지가 있으면 visual로 승격 + 썸네일', () => {
  const dir = tmpWorkspace();
  fs.writeFileSync(path.join(dir, 'context', 'content-calendar.md'),
    'POST 1 — 라떼 아트\nPlatform: Instagram\nFormat: single image\nTopic: 라떼 아트\n');
  writeLane(dir, 'captions', 'ig-1.md', 'POST 1\nCAPTION: 라떼 아트 소개\n');
  writeLane(dir, 'creatives', 'ig-1.png', 'PNGDATA'); // 실제 이미지 파일
  const b = buildBoard(dir);
  assert.equal(b.posts[0].stage, 'visual');
  assert.ok(b.posts[0].thumb);
});

test('buildBoard — 프리픽스 불일치 풀 이미지는 표시(thumb)만, visual 승격·render 카운트 제외', () => {
  const dir = tmpWorkspace();
  fs.writeFileSync(path.join(dir, 'context', 'content-calendar.md'),
    'POST 1 — 라떼 아트\nPlatform: Instagram\nFormat: single image\nTopic: 라떼 아트\n');
  writeLane(dir, 'captions', 'ig-1.md', 'POST 1\nCAPTION: 라떼 아트 소개\n');
  writeLane(dir, 'creatives', 'leftover-xyz.png', 'STRAY'); // 파일명 규칙 불일치 = 소유 불확실
  const b = buildBoard(dir);
  const p = b.posts[0];
  assert.equal(p.stage, 'copy');          // 차용 이미지로는 visual 승격 안 됨 (게이트 오인 방지)
  assert.ok(p.thumb);                       // 표시용 썸네일은 붙는다
  assert.equal((p.files || []).filter((f) => f.kind === 'render').length, 0); // render 카운트 0
  assert.equal((p.files || []).some((f) => f.kind === 'poolrender'), true);
});

test('buildBoard — 사실 검증 리포트의 Overall 줄을 board.verify로 파싱', () => {
  const dir = tmpWorkspace();
  fs.writeFileSync(path.join(dir, 'context', 'content-calendar.md'), 'POST 1 — t\nTopic: t\n');
  writeLane(dir, 'verify', 'acme-verify-july-2026.md', '# Content Verification\n\n## Summary\n\nOverall: PASS 4 / REVISE 2\n');
  const b = buildBoard(dir);
  assert.equal(b.verify.pass, 4);
  assert.equal(b.verify.revise, 2);
  assert.ok(b.verify.file);
});

test('buildBoard — 검증 리포트 없으면 board.verify는 0', () => {
  const dir = tmpWorkspace();
  fs.writeFileSync(path.join(dir, 'context', 'content-calendar.md'), 'POST 1 — t\nTopic: t\n');
  const b = buildBoard(dir);
  assert.deepEqual({ pass: b.verify.pass, revise: b.verify.revise }, { pass: 0, revise: 0 });
});

test('buildBoard — naver_clip 레인이 보드 레인 집합에 존재한다 (채널 배선 전제)', () => {
  const dir = tmpWorkspace();
  fs.writeFileSync(path.join(dir, 'context', 'content-calendar.md'), 'POST 1 — t\nTopic: t\n');
  const b = buildBoard(dir);
  assert.ok('naver_clip' in b.lanes);
  assert.ok('kakao' in b.lanes);
});
