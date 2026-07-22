// slidevideo.js — 매니페스트 검증·타임라인·ffmpeg 인자 구성(순수 로직) 테스트.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sv = require('../lib/slidevideo');

const validManifest = () => ({
  calendarSlot: 3, aspect: '9:16', fps: 30,
  slides: [
    { i: 1, durationSec: 2.5, transition: 'cut', head: '3초면 끝', image: { rel: 'outputs/creatives/s1.png' } },
    { i: 2, durationSec: 3, transition: 'fade', prompt: 'SUBJECT latte …' },
  ],
});

test('validateManifest — 정상 매니페스트는 통과', () => {
  const r = sv.validateManifest(validManifest());
  assert.equal(r.ok, true);
  assert.equal(r.errors.length, 0);
});

test('validateManifest — calendarSlot 누락·빈 슬라이드·이미지/프롬프트 부재는 error', () => {
  assert.equal(sv.validateManifest({ slides: [] }).ok, false);
  const r = sv.validateManifest({ calendarSlot: 1, slides: [{ durationSec: 2 }] });
  assert.equal(r.ok, false);
  assert.match(r.errors.join(' '), /image.*prompt|prompt/);
  const r2 = sv.validateManifest({ slides: [{ durationSec: 2, image: { rel: 'a.png' } }] });
  assert.match(r2.errors.join(' '), /calendarSlot/);
});

test('validateManifest — 미지원 aspect/전환·과길이는 warning(비차단)', () => {
  const m = validManifest();
  m.aspect = '3:2'; m.slides[0].transition = 'wipe'; m.slides[0].durationSec = 95;
  const r = sv.validateManifest(m);
  assert.equal(r.ok, true); // warning은 차단하지 않음
  assert.match(r.warnings.join(' '), /aspect|전환|초과|wipe|폴백/);
});

test('validateManifest — 텍스트만 있어도 통과(이미지 없이), 미지원 motion·bullets 타입은 warning', () => {
  // head/bullets만 있고 이미지·프롬프트 없어도 렌더 가능 → error 아님
  const textOnly = { calendarSlot: 1, slides: [{ durationSec: 2, head: '핵심', bullets: ['a', 'b'] }] };
  assert.equal(sv.validateManifest(textOnly).ok, true);
  // 화면 텍스트·이미지·프롬프트 모두 없으면 error
  assert.equal(sv.validateManifest({ calendarSlot: 1, slides: [{ durationSec: 2 }] }).ok, false);
  // 미지원 모션·잘못된 bullets 타입은 warning(비차단)
  const m = { calendarSlot: 1, slides: [{ durationSec: 2, head: 'x', motion: 'spin', bullets: 'not-array' }] };
  const r = sv.validateManifest(m);
  assert.equal(r.ok, true);
  assert.match(r.warnings.join(' '), /모션|motion|bullets/);
});

test('framePlan/frameCount — 슬라이드별 프레임 수·상한 축소', () => {
  assert.equal(sv.frameCount(2.5, 30), 75);
  assert.equal(sv.frameCount(0, 30), 1); // 최소 1프레임
  const plan = sv.framePlan(validManifest());
  assert.equal(plan.fps, 30);
  assert.deepEqual(plan.perSlide, [75, 90]); // 2.5*30, 3*30
  assert.equal(plan.total, 165);
  // 상한 초과 시 비례 축소
  const huge = { fps: 30, slides: [{ durationSec: 200 }, { durationSec: 200 }] };
  const hp = sv.framePlan(huge);
  assert.ok(hp.total <= sv.MAX_TOTAL_FRAMES, '총 프레임이 상한 이하로 축소');
});

test('buildFramesFfmpegArgs — 프레임 시퀀스 image2 입력 + fps 고정', () => {
  const args = sv.buildFramesFfmpegArgs(validManifest(), { framePattern: '/w/.f/frame-%06d.png', outPath: '/w/o.mp4', audioPath: '/w/n.mp3' });
  const s = args.join(' ');
  assert.match(s, /-framerate 30/);
  assert.match(s, /-i \/w\/\.f\/frame-%06d\.png/);
  assert.match(s, /scale=1080:1920/);
  assert.match(s, /libx264/);
  assert.match(s, /-c:a aac/);
  assert.match(s, /-shortest/);
  assert.equal(args[args.length - 1], '/w/o.mp4');
  // 오디오 없으면 aac 없음
  const noAudio = sv.buildFramesFfmpegArgs(validManifest(), { framePattern: '/w/.f/frame-%06d.png', outPath: '/w/o.mp4' }).join(' ');
  assert.doesNotMatch(noAudio, /-c:a aac/);
});

test('timeline — 시작초·프레임수 누적', () => {
  const t = sv.timeline(validManifest());
  assert.equal(t[0].startSec, 0);
  assert.equal(t[0].frames, Math.round(2.5 * 30));
  assert.equal(t[1].startSec, 2.5);
  assert.equal(sv.totalDuration(validManifest()), 5.5);
});

test('resolveSlideImages — 워크스페이스 밖/부재 경로는 null', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sv-'));
  fs.mkdirSync(path.join(dir, 'outputs', 'creatives'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'outputs', 'creatives', 's1.png'), 'x');
  const m = { slides: [
    { durationSec: 2, image: { rel: 'outputs/creatives/s1.png' } },
    { durationSec: 2, image: { rel: '../../etc/passwd' } },
    { durationSec: 2, prompt: 'no image' },
  ] };
  const r = sv.resolveSlideImages(dir, m);
  assert.ok(r[0] && r[0].endsWith('s1.png'));
  assert.equal(r[1], null); // 경로 탈출 차단
  assert.equal(r[2], null); // 이미지 없음(프롬프트만)
});

test('buildConcatScript — 이미지별 duration + 마지막 파일 재기재(concat 규약)', () => {
  const script = sv.buildConcatScript(['/w/s1.png', '/w/s2.png'], [{ durationSec: 2.5 }, { durationSec: 3 }]);
  assert.match(script, /file '\/w\/s1\.png'\nduration 2\.5/);
  // 마지막 파일이 한 번 더 (duration 무시 회피)
  assert.equal((script.match(/\/w\/s2\.png/g) || []).length, 2);
});

test('buildFfmpegArgs — 9:16 스케일/패드 + 오디오 있으면 aac -shortest', () => {
  const args = sv.buildFfmpegArgs(validManifest(), { concatPath: '/w/c.txt', outPath: '/w/out.mp4', audioPath: '/w/n.mp3' });
  const s = args.join(' ');
  assert.match(s, /-f concat/);
  assert.match(s, /scale=1080:1920/);
  assert.match(s, /libx264/);
  assert.match(s, /-c:a aac/);
  assert.match(s, /-shortest/);
  assert.equal(args[args.length - 1], '/w/out.mp4');
  // 오디오 없으면 aac 없음
  const noAudio = sv.buildFfmpegArgs(validManifest(), { concatPath: '/w/c.txt', outPath: '/w/o.mp4' }).join(' ');
  assert.doesNotMatch(noAudio, /-c:a aac/);
});
