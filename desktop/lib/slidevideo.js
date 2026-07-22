// 슬라이드형 영상 렌더 — slide-video 매니페스트(JSON)를 mp4로 만드는 계층.
// 순수 로직(매니페스트 검증·타임라인 계산·ffmpeg 인자 구성·워크스페이스 경로 안전)은
// 여기서 테스트하고, 실제 인코딩은 사용자 PC의 ffmpeg가 수행한다(바이너리 부재 시 폴백).
//
// 렌더 방식: 각 슬라이드 이미지를 durationSec만큼 보여주고 이어붙인다(concat demuxer).
// 전환은 슬라이드 경계의 페이드로 근사한다 — xfade 필터그래프의 취약함을 피한 단순·견고 경로.
// 화면 텍스트(head/sub)는 이미지에 굽지 않는다: 이미지는 배경, 텍스트 오버레이는 drawtext로
// 얹거나(폰트 있으면) 사전 합성 이미지를 쓴다. 이 모듈은 배경 이미지 시퀀싱까지 담당한다.
const fs = require('fs');
const path = require('path');

const ASPECTS = { '9:16': [1080, 1920], '1:1': [1080, 1080], '16:9': [1920, 1080], '4:5': [1080, 1350] };
const TRANSITIONS = new Set(['cut', 'fade', 'slide', 'zoom']);
const MOTIONS = new Set(['kenburns', 'panLeft', 'panRight', 'kinetic', 'static']);

// 매니페스트 검증 — 앱 렌더 전에 계약 위반을 잡는다. { ok, errors[], warnings[] }
function validateManifest(m) {
  const errors = [];
  const warnings = [];
  if (!m || typeof m !== 'object') return { ok: false, errors: ['매니페스트가 객체가 아닙니다'], warnings };
  if (!Number.isFinite(Number(m.calendarSlot))) errors.push('calendarSlot(정수)이 없습니다 — 보드 슬롯 연결 불가');
  if (m.aspect && !ASPECTS[m.aspect]) warnings.push(`aspect '${m.aspect}' 미지원 — 9:16로 폴백`);
  const fps = Number(m.fps) || 30;
  if (fps < 1 || fps > 60) warnings.push(`fps ${fps} 비정상 — 30으로 폴백`);
  const slides = Array.isArray(m.slides) ? m.slides : [];
  if (!slides.length) errors.push('slides가 비었습니다');
  slides.forEach((s, i) => {
    const d = Number(s.durationSec);
    if (!Number.isFinite(d) || d <= 0) errors.push(`슬라이드 ${i + 1}: durationSec이 양수가 아닙니다`);
    // 텍스트(head/sub/bullets/kicker) 또는 이미지·프롬프트 중 하나는 있어야 렌더된다.
    const hasText = !!(s.head || s.sub || s.kicker || (Array.isArray(s.bullets) && s.bullets.some((b) => b != null && String(b).trim())));
    if (!s.image && !s.prompt && !hasText) errors.push(`슬라이드 ${i + 1}: image.rel·prompt·화면 텍스트(head/sub/bullets) 중 하나가 필요합니다`);
    if (s.transition && !TRANSITIONS.has(s.transition)) warnings.push(`슬라이드 ${i + 1}: 전환 '${s.transition}' 미지원 — fade로 폴백`);
    if (s.motion && !MOTIONS.has(s.motion)) warnings.push(`슬라이드 ${i + 1}: 모션 '${s.motion}' 미지원 — kenburns로 폴백`);
    if (s.bullets != null && !Array.isArray(s.bullets)) warnings.push(`슬라이드 ${i + 1}: bullets는 배열이어야 합니다 — 무시됨`);
  });
  const total = totalDuration(m);
  if (total > 90) warnings.push(`총 길이 ${total.toFixed(1)}s — 릴/클립 권장 상한(60s)을 초과`);
  return { ok: errors.length === 0, errors, warnings };
}

function totalDuration(m) {
  return (Array.isArray(m.slides) ? m.slides : []).reduce((a, s) => a + (Number(s.durationSec) > 0 ? Number(s.durationSec) : 0), 0);
}

// 타임라인 — 슬라이드별 시작초/프레임수 (자막·나레이션 동기화에 사용)
function timeline(m) {
  const fps = Number(m.fps) || 30;
  let at = 0;
  return (Array.isArray(m.slides) ? m.slides : []).map((s, i) => {
    const dur = Number(s.durationSec) > 0 ? Number(s.durationSec) : 0;
    const row = { i: i + 1, startSec: at, durationSec: dur, frames: Math.round(dur * fps) };
    at += dur;
    return row;
  });
}

// 슬라이드 이미지 경로를 워크스페이스 안에서만 해석 (경로 탈출 방지)
function resolveSlideImages(dir, m) {
  const base = path.resolve(dir);
  return (Array.isArray(m.slides) ? m.slides : []).map((s) => {
    const rel = s.image && s.image.rel;
    if (!rel) return null;
    const abs = path.resolve(dir, rel);
    return abs.startsWith(base + path.sep) && fs.existsSync(abs) ? abs : null;
  });
}

// ffmpeg concat 스크립트 텍스트 — 이미지별 duration을 지정하는 concat demuxer 입력.
// (마지막 항목은 ffmpeg concat 규약상 duration이 무시되므로 파일을 한 번 더 적는다)
function buildConcatScript(imageAbsPaths, slides) {
  const lines = [];
  imageAbsPaths.forEach((abs, i) => {
    const dur = Number(slides[i] && slides[i].durationSec) > 0 ? Number(slides[i].durationSec) : 2;
    const q = abs.replace(/'/g, "'\\''");
    lines.push(`file '${q}'`);
    lines.push(`duration ${dur}`);
  });
  if (imageAbsPaths.length) {
    const last = imageAbsPaths[imageAbsPaths.length - 1].replace(/'/g, "'\\''");
    lines.push(`file '${last}'`);
  }
  return lines.join('\n') + '\n';
}

// ffmpeg 인자 배열 — concat 스크립트 → 스케일/패드(화면비 고정) → h264 mp4. 오디오(나레이션 mp3)가
// 있으면 합친다. 실제 실행은 호출자(main)가 ffmpeg 바이너리로.
function buildFfmpegArgs(m, { concatPath, outPath, audioPath }) {
  const [w, h] = ASPECTS[m.aspect] || ASPECTS['9:16'];
  const fps = Number(m.fps) || 30;
  const vf = `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black,fps=${fps},format=yuv420p`;
  const args = ['-y', '-f', 'concat', '-safe', '0', '-i', concatPath];
  if (audioPath) args.push('-i', audioPath);
  args.push('-vf', vf, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', String(fps));
  if (audioPath) args.push('-c:a', 'aac', '-shortest');
  args.push('-movflags', '+faststart', outPath);
  return args;
}

// ---- 프레임 시퀀스 렌더(하이퍼프레임 애니메이션) ---------------------------------------
// 슬라이드당 여러 프레임을 캡처하므로, 슬라이드별 프레임 수와 mp4 총 프레임 예산을 계산한다.
const MAX_TOTAL_FRAMES = 2400; // 안전 상한(예: 30fps × 80초) — 폭주 방지

function frameCount(durationSec, fps) {
  const d = Number(durationSec) > 0 ? Number(durationSec) : 0;
  const f = Number(fps) > 0 ? Number(fps) : 30;
  return Math.max(1, Math.round(d * f));
}

// 매니페스트의 슬라이드별 프레임 수(총합이 상한을 넘으면 비례 축소). { fps, perSlide[], total }
function framePlan(m) {
  const fps = Number(m.fps) > 0 ? Number(m.fps) : 30;
  const slides = Array.isArray(m.slides) ? m.slides : [];
  let perSlide = slides.map((s) => frameCount(s.durationSec, fps));
  let total = perSlide.reduce((a, b) => a + b, 0);
  if (total > MAX_TOTAL_FRAMES && total > 0) {
    const k = MAX_TOTAL_FRAMES / total;
    perSlide = perSlide.map((n) => Math.max(1, Math.round(n * k)));
    total = perSlide.reduce((a, b) => a + b, 0);
  }
  return { fps, perSlide, total };
}

// 프레임 시퀀스(frame-%06d.png)를 고정 fps로 이어붙이는 ffmpeg 인자.
// 애니메이션 경로 전용 — 각 프레임이 이미 1/fps를 차지하므로 concat-duration이 필요 없다.
function buildFramesFfmpegArgs(m, { framePattern, outPath, audioPath, startNumber = 1 }) {
  const [w, h] = ASPECTS[m.aspect] || ASPECTS['9:16'];
  const fps = Number(m.fps) > 0 ? Number(m.fps) : 30;
  const vf = `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black,format=yuv420p`;
  const args = ['-y', '-framerate', String(fps), '-start_number', String(startNumber), '-i', framePattern];
  if (audioPath) args.push('-i', audioPath);
  args.push('-vf', vf, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', String(fps));
  if (audioPath) args.push('-c:a', 'aac', '-shortest');
  args.push('-movflags', '+faststart', outPath);
  return args;
}

module.exports = {
  validateManifest, totalDuration, timeline, resolveSlideImages,
  buildConcatScript, buildFfmpegArgs,
  frameCount, framePlan, buildFramesFfmpegArgs,
  ASPECTS, TRANSITIONS, MOTIONS, MAX_TOTAL_FRAMES,
};
