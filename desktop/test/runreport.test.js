// runreport.js — 실행 전후 산출물 diff와 컴플라이언스 판정 요약 테스트.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const runreport = require('../lib/runreport');

const tmpWorkspace = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'runreport-test-'));
  fs.mkdirSync(path.join(dir, 'context'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'outputs', 'captions'), { recursive: true });
  return dir;
};
const write = (dir, rel, text) => {
  const p = path.join(dir, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text);
};

test('snapshot → diff — 생성·수정 파일을 정확히 구분한다', () => {
  const dir = tmpWorkspace();
  write(dir, 'outputs/captions/ig-1.md', 'v1');
  write(dir, 'context/content-calendar.md', 'cal');
  const before = runreport.snapshot(dir);
  // 수정 (mtime이 같아도 size 변화로 감지되게 내용 길이를 바꾼다)
  write(dir, 'outputs/captions/ig-1.md', 'v2 — 더 긴 내용');
  // 생성
  write(dir, 'outputs/linkedin/li-1.md', 'new');
  write(dir, 'context/gates.json', '{}');
  const { created, modified } = runreport.diff(before, runreport.snapshot(dir));
  assert.deepEqual(created, ['context/gates.json', 'outputs/linkedin/li-1.md']);
  assert.deepEqual(modified, ['outputs/captions/ig-1.md']);
});

test('diff — 변화가 없으면 빈 목록, tmp·숨김 파일은 무시', () => {
  const dir = tmpWorkspace();
  write(dir, 'outputs/captions/ig-1.md', 'v1');
  const before = runreport.snapshot(dir);
  write(dir, 'outputs/captions/.hidden', 'x');
  write(dir, 'outputs/captions/queue.json.tmp', 'x');
  const { created, modified } = runreport.diff(before, runreport.snapshot(dir));
  assert.deepEqual(created, []);
  assert.deepEqual(modified, []);
});

test('complianceSummary — 보드 기준 PASS/WARN/BLOCK 카운트 + 포스트별 판정', () => {
  const dir = tmpWorkspace();
  write(dir, 'context/content-calendar.md', [
    'POST 1 — 라떼 아트', 'Platform: Instagram', 'Topic: 라떼 아트', '',
    'POST 2 — 신메뉴 소개', 'Platform: Instagram', 'Topic: 신메뉴 소개', '',
  ].join('\n'));
  write(dir, 'outputs/captions/ig.md', 'POST 1\nCAPTION: 라떼 아트 포스트\n\nPOST 2\nCAPTION: 신메뉴 소개 포스트\n');
  write(dir, 'outputs/compliance/report.md', 'POST 1 라떼 아트 — PASS\nPOST 2 신메뉴 소개 — WARN 표시 필요\n');
  const s = runreport.complianceSummary(dir);
  assert.equal(s.pass, 1);
  assert.equal(s.warn, 1);
  assert.equal(s.block, 0);
  assert.deepEqual(s.posts.map((p) => p.verdict), ['PASS', 'WARN']);
  assert.equal(s.posts[0].uid, 'instagram-1');
});

test('complianceSummary — 판정 파일이 없으면 0 카운트·빈 목록', () => {
  const dir = tmpWorkspace();
  write(dir, 'context/content-calendar.md', 'POST 1 — t\nTopic: t\n');
  const s = runreport.complianceSummary(dir);
  assert.deepEqual(s, { pass: 0, warn: 0, block: 0, posts: [] });
});
