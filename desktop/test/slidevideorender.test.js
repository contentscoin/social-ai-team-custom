// slidevideorender.js — 렌더 준비 오케스트레이션 + ffmpeg 리졸버 우선순위 테스트.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const svr = require('../lib/slidevideorender');
const ffmpeg = require('../lib/ffmpeg');

function ws() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'svr-'));
  fs.mkdirSync(path.join(dir, 'outputs', 'videos'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'outputs', 'creatives'), { recursive: true });
  return dir;
}
function writeManifest(dir, name, m) {
  fs.writeFileSync(path.join(dir, 'outputs', 'videos', name), JSON.stringify(m));
  return path.join('outputs', 'videos', name).replace(/\\/g, '/');
}

test('prepare — 이미지가 모두 있으면 concat 작성 + 렌더 계획 반환', () => {
  const dir = ws();
  fs.writeFileSync(path.join(dir, 'outputs', 'creatives', 's1.png'), 'x');
  fs.writeFileSync(path.join(dir, 'outputs', 'creatives', 's2.png'), 'x');
  const rel = writeManifest(dir, 'acme-slidevideo-3-july-2026.json', {
    calendarSlot: 3, aspect: '9:16', fps: 30,
    slides: [
      { durationSec: 2.5, image: { rel: 'outputs/creatives/s1.png' } },
      { durationSec: 3, image: { rel: 'outputs/creatives/s2.png' } },
    ],
  });
  const r = svr.prepare(dir, rel);
  assert.equal(r.ok, true);
  assert.ok(fs.existsSync(r.plan.concatPath)); // concat 스크립트 실제 기록
  assert.match(r.plan.outRel, /outputs\/videos\/acme-slidevideo-3-july-2026\.mp4$/);
  const args = r.plan.argsFor();
  assert.match(args.join(' '), /-f concat.*libx264/);
});

test('prepare — 프롬프트만 있는(이미지 없는) 슬라이드는 needsImages로 차단', () => {
  const dir = ws();
  fs.writeFileSync(path.join(dir, 'outputs', 'creatives', 's1.png'), 'x');
  const rel = writeManifest(dir, 'acme-slidevideo-4-july-2026.json', {
    calendarSlot: 4, slides: [
      { durationSec: 2, image: { rel: 'outputs/creatives/s1.png' } },
      { durationSec: 2, prompt: 'SUBJECT …(아직 렌더 안 됨)' },
    ],
  });
  const r = svr.prepare(dir, rel);
  assert.equal(r.ok, false);
  assert.deepEqual(r.needsImages, [2]);
});

test('prepare — 매니페스트 없음/계약 위반은 사유와 함께 실패', () => {
  const dir = ws();
  assert.match(svr.prepare(dir, 'outputs/videos/none.json').reason, /찾지 못/);
  const rel = writeManifest(dir, 'bad-slidevideo-1-july-2026.json', { slides: [] });
  assert.match(svr.prepare(dir, rel).reason, /계약 위반/);
});

test('prepare — 워크스페이스 밖 매니페스트 경로는 거부', () => {
  const dir = ws();
  assert.match(svr.prepare(dir, '../../etc/passwd').reason, /찾지 못|파싱/);
});

test('listManifests — slidevideo 매니페스트만 수집', () => {
  const dir = ws();
  fs.writeFileSync(path.join(dir, 'outputs', 'videos', 'acme-slidevideo-1-july-2026.json'), '{}');
  fs.writeFileSync(path.join(dir, 'outputs', 'videos', 'acme-reels-july-2026.md'), 'x');
  fs.writeFileSync(path.join(dir, 'outputs', 'videos', 'other.json'), '{}');
  const list = svr.listManifests(dir);
  assert.equal(list.length, 1);
  assert.match(list[0], /slidevideo-1/);
});

test('ffmpeg.resolve — 번들 우선, 없으면 시스템, 둘 다 없으면 none', () => {
  assert.deepEqual(
    ffmpeg.resolve({ tryStatic: () => '/bundled/ffmpeg', probeSystem: () => true }),
    { path: '/bundled/ffmpeg', source: 'bundled' });
  assert.deepEqual(
    ffmpeg.resolve({ tryStatic: () => null, probeSystem: () => true }),
    { path: 'ffmpeg', source: 'system' });
  assert.deepEqual(
    ffmpeg.resolve({ tryStatic: () => null, probeSystem: () => false }),
    { path: null, source: 'none' });
});

test('prepare — BOM·코드펜스·잡텍스트 오염 매니페스트도 파싱, 진짜 깨진 건 파일 머리를 사유에 표시', () => {
  const dir = ws();
  fs.writeFileSync(path.join(dir, 'outputs', 'creatives', 's1.png'), 'x');
  const good = { calendarSlot: 7, slides: [{ durationSec: 2, image: { rel: 'outputs/creatives/s1.png' } }] };
  // 에이전트가 흔히 쓰는 오염: ```json 펜스 + 앞뒤 설명 + BOM
  const dirty = '﻿다음은 매니페스트입니다:\n```json\n' + JSON.stringify(good) + '\n```\n끝.';
  fs.writeFileSync(path.join(dir, 'outputs', 'videos', 'acme-slidevideo-7-july-2026.json'), dirty);
  const r = svr.prepare(dir, 'outputs/videos/acme-slidevideo-7-july-2026.json');
  assert.equal(r.ok, true); // 파싱 통과 → 렌더 계획까지
  // 진짜 깨진 파일 — "왜"가 보이게 파일 머리를 사유에 싣는다 (56개가 이유 없이 실패하던 문제)
  fs.writeFileSync(path.join(dir, 'outputs', 'videos', 'acme-slidevideo-8-july-2026.json'), '# 마크다운 문서\n슬라이드 계획...');
  const bad = svr.prepare(dir, 'outputs/videos/acme-slidevideo-8-july-2026.json');
  assert.equal(bad.ok, false);
  assert.match(bad.reason, /파싱 실패/);
  assert.match(bad.reason, /마크다운 문서/); // 파일 머리 노출
});
