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

test('exciseBlockFromFile — 본문 속 "B-5"(임의 2글자-숫자)는 앵커가 아니다(형제 하이재킹 방지)', () => {
  const dir = tmp();
  const f = path.join(dir, 'outputs', 'captions', 'week3.md');
  writeLane(dir, 'captions', 'week3.md',
    'IG-3 — 봄 신상\nCAPTION: a\n\nIG-7 — 비타민 세럼 루틴\nCAPTION: b\n## B-5 비타민이 필요한 이유\n효능 설명\n');
  // 존재하지 않는 IG-5 삭제 시도 — B-5가 앵커로 잡혀 IG-7 본문을 지우면 안 된다
  const r = postassets.exciseBlockFromFile(f, 'week3.md', '없는주제xyz', 5, IG1, 'instagram');
  assert.equal(r.changed, false);
  assert.match(fs.readFileSync(f, 'utf8'), /비타민이 필요한 이유/); // IG-7 본문 보존
});

test('exciseBlockFromFile — 같은 레인·같은 번호라도 채널이 맞는 블록만 (IG-4 vs FB-4)', () => {
  const dir = tmp();
  const f = path.join(dir, 'outputs', 'captions', 'jan.md');
  writeLane(dir, 'captions', 'jan.md',
    'IG-4 — 인스타 포스트\nCAPTION: 인스타 본문\n\nFB-4 — 페북 포스트\nCAPTION: 페북 본문\n');
  const r = postassets.exciseBlockFromFile(f, 'jan.md', '페북 포스트', 4, [/^fb-0*4/i], 'facebook');
  assert.equal(r.changed, true);
  const after = fs.readFileSync(f, 'utf8');
  assert.match(after, /인스타 본문/);      // IG-4 보존
  assert.doesNotMatch(after, /페북 본문/);  // FB-4만 제거
});

test('exciseBlockFromFile — 앵커 앞 머리말은 파일 통삭제하지 않고 보존', () => {
  const dir = tmp();
  const f = path.join(dir, 'outputs', 'captions', 'campaign.md');
  writeLane(dir, 'captions', 'campaign.md',
    '# 이번 주 캠페인 개요\n브랜드 인지도 상승이 목표\n\n## FB-2 — 여름 세일\n세일 본문\n');
  const r = postassets.exciseBlockFromFile(f, 'campaign.md', '여름 세일', 2, [/^fb-0*2/i], 'facebook');
  assert.equal(r.excised, true);
  assert.equal(fs.existsSync(f), true);
  assert.match(fs.readFileSync(f, 'utf8'), /캠페인 개요/); // 머리말 보존
  assert.doesNotMatch(fs.readFileSync(f, 'utf8'), /세일 본문/);
});

test('exciseBlockFromFile — n 헤더가 없으면(형제 헤더에만 토픽이 있어도) 취소 — 토픽 폴백 없음', () => {
  const dir = tmp();
  const f = path.join(dir, 'outputs', 'captions', 'may.md');
  // IG-5 앵커는 없고, 형제 IG-3 헤더에 캠페인 테마어(여름세일)만 들어 있다
  writeLane(dir, 'captions', 'may.md',
    '## IG-3 — 여름세일 예고 이벤트\nCAPTION: 곧 여름세일이 시작됩니다\n\n## IG-4 — 신제품 소개\nCAPTION: 신제품 본문\n');
  const r = postassets.exciseBlockFromFile(f, 'may.md', '여름세일', 5, [/^ig-0*5/i], 'instagram');
  assert.equal(r.changed, false); // n=5 강한 헤더 없음 → 취소(형제 삭제 금지)
  assert.match(fs.readFileSync(f, 'utf8'), /여름세일 예고 이벤트/); // IG-3 보존
});

test('exciseBlockFromFile — 본문 문장이 "IG-5 …"로 시작해도 앵커 아님(진짜 헤더만 제거)', () => {
  const dir = tmp();
  const f = path.join(dir, 'outputs', 'captions', 'jul.md');
  writeLane(dir, 'captions', 'jul.md',
    'IG-4 — 라떼\nCAPTION: 신메뉴 안내\nIG-5 할인 코드도 곧 공개\n추가 본문 라인\n\nIG-5 — 여름세일\nCAPTION: 진짜 IG5 본문\n');
  const r = postassets.exciseBlockFromFile(f, 'jul.md', '여름세일', 5, [/^ig-0*5/i], 'instagram');
  assert.equal(r.changed, true);
  const after = fs.readFileSync(f, 'utf8');
  assert.match(after, /추가 본문 라인/);      // IG-4 본문 꼬리 보존(가짜 앵커에 안 잘림)
  assert.doesNotMatch(after, /진짜 IG5 본문/); // 진짜 IG-5 헤더 블록만 제거
});

test('exciseBlockFromFile — 장식 없는 형제 헤더(POST 2 신메뉴)도 경계로 보존(파일 통삭제 금지)', () => {
  const dir = tmp();
  const f = path.join(dir, 'outputs', 'captions', 'monthly.md');
  writeLane(dir, 'captions', 'monthly.md',
    '## POST 1 — 라떼\nCAPTION: 라떼 소개\n\nPOST 2 신메뉴\nCAPTION: 신메뉴 소개 본문\n');
  const r = postassets.exciseBlockFromFile(f, 'monthly.md', '라떼', 1, IG1, 'instagram');
  assert.equal(r.changed, true);
  assert.equal(fs.existsSync(f), true);                 // 파일 통삭제 안 됨
  assert.match(fs.readFileSync(f, 'utf8'), /신메뉴 소개 본문/); // 장식 없는 형제 보존
});

test('exciseBlockFromFile — 강한/약한 헤더 사이 형제도 대상 블록에 삼켜지지 않음', () => {
  const dir = tmp();
  const f = path.join(dir, 'outputs', 'captions', 'mix.md');
  writeLane(dir, 'captions', 'mix.md',
    '## POST 1 — 라떼\nCAPTION: a\n\nPOST 2 신메뉴\nCAPTION: 신메뉴 본문\n\n## POST 3 — 세일\nCAPTION: 세일 본문\n');
  const r = postassets.exciseBlockFromFile(f, 'mix.md', '라떼', 1, IG1, 'instagram');
  assert.equal(r.changed, true);
  const after = fs.readFileSync(f, 'utf8');
  assert.match(after, /신메뉴 본문/); // 장식 없는 중간 형제 보존
  assert.match(after, /세일 본문/);   // 뒤 형제 보존
  assert.doesNotMatch(after, /라떼/);  // POST 1만 제거
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

test('deleteAssets — 프리픽스로 시작하는 공유 파일(ig-1-2주차.md)은 통삭제 금지, 형제 보존', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'context', 'content-calendar.md'),
    'IG-1 — 라떼아트\nPlatform: Instagram\nFormat: single image\nTopic: 라떼아트\n\nIG-2 — 신메뉴\nPlatform: Instagram\nFormat: single image\nTopic: 신메뉴\n');
  // 파일명이 ig-1 로 시작하지만 실제로는 IG-1·IG-2가 함께 든 공유 파일
  writeLane(dir, 'captions', 'ig-1-2주차.md',
    'IG-1 — 라떼아트\nCAPTION: 라떼아트 본문\n\nIG-2 — 신메뉴\nCAPTION: 신메뉴 본문\n');
  const r = postassets.deleteAssets(dir, 'instagram-1', { copy: true });
  assert.equal(r.ok, true);
  const f = path.join(dir, 'outputs', 'captions', 'ig-1-2주차.md');
  assert.equal(fs.existsSync(f), true);                 // 파일 통삭제 안 됨
  assert.match(fs.readFileSync(f, 'utf8'), /신메뉴 본문/); // IG-2 형제 보존
  assert.doesNotMatch(fs.readFileSync(f, 'utf8'), /라떼아트 본문/); // IG-1만 제거
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

test('deleteOneImage — creatives의 이미지 1장만 삭제(다른 파일 보존)', () => {
  const dir = tmp();
  const cr = path.join(dir, 'outputs', 'creatives');
  fs.mkdirSync(cr, { recursive: true });
  fs.writeFileSync(path.join(cr, 'ig-1_1.png'), 'x');
  fs.writeFileSync(path.join(cr, 'ig-1_2.png'), 'x');
  const r = postassets.deleteOneImage(dir, 'outputs/creatives/ig-1_1.png');
  assert.equal(r.ok, true);
  assert.equal(fs.existsSync(path.join(cr, 'ig-1_1.png')), false);
  assert.equal(fs.existsSync(path.join(cr, 'ig-1_2.png')), true); // 나머지 보존
});

test('deleteOneImage — 안전 가드: 경로 이탈·비이미지·본문·바깥 폴더 거부', () => {
  const dir = tmp();
  const cr = path.join(dir, 'outputs', 'creatives');
  fs.mkdirSync(cr, { recursive: true });
  fs.writeFileSync(path.join(cr, 'note.md'), 'copy');           // 본문
  fs.writeFileSync(path.join(dir, 'context', 'brand.png'), 'x'); // outputs 밖
  assert.equal(postassets.deleteOneImage(dir, '../../etc/passwd').ok, false);        // 경로 이탈
  assert.equal(postassets.deleteOneImage(dir, 'outputs/creatives/note.md').ok, false); // 비이미지(.md)
  assert.equal(postassets.deleteOneImage(dir, 'context/brand.png').ok, false);       // creatives/videos 밖
  assert.equal(postassets.deleteOneImage(dir, 'outputs/creatives/nope.png').ok, false); // 없는 파일
  assert.equal(fs.existsSync(path.join(cr, 'note.md')), true); // 보존
});
