// 슬라이드 영상 렌더 오케스트레이션 — 매니페스트 → (검증·이미지 확인·concat 작성) → ffmpeg 실행 계획.
// 실제 spawn은 주입받는다(테스트에서 스텁). prepare()까지는 순수하게 테스트 가능하다.
const fs = require('fs');
const path = require('path');
const sv = require('./slidevideo');

// 매니페스트 rel을 워크스페이스 안에서만 해석
function resolveInWs(dir, rel) {
  const base = path.resolve(dir);
  const abs = path.resolve(dir, rel);
  return abs.startsWith(base + path.sep) ? abs : null;
}

// 렌더 준비 — 성공 시 { ok:true, plan:{ concatPath, outRel, outAbs, argsFor(ffmpegPath) } }
// 실패 시 { ok:false, reason, needsImages? }
function prepare(dir, manifestRel) {
  const manAbs = resolveInWs(dir, manifestRel);
  if (!manAbs || !fs.existsSync(manAbs)) return { ok: false, reason: '매니페스트 파일을 찾지 못했습니다: ' + manifestRel };
  let m;
  try { m = JSON.parse(fs.readFileSync(manAbs, 'utf8')); }
  catch { return { ok: false, reason: '매니페스트 JSON 파싱 실패' }; }

  const v = sv.validateManifest(m);
  if (!v.ok) return { ok: false, reason: '매니페스트 계약 위반: ' + v.errors.join('; '), warnings: v.warnings };

  // 모든 슬라이드에 렌더된 이미지가 있어야 인코딩 가능 — 프롬프트만 있는 슬라이드는 먼저 이미지 렌더 필요
  const images = sv.resolveSlideImages(dir, m);
  const missing = [];
  images.forEach((abs, i) => { if (!abs) missing.push(i + 1); });
  if (missing.length) {
    return { ok: false, reason: `슬라이드 이미지가 없습니다(슬롯 ${missing.join(',')}) — 먼저 creative-designer로 슬라이드 이미지를 렌더하세요`, needsImages: missing };
  }

  // concat 스크립트를 워크스페이스 내부에 기록(경로 안전)
  const baseName = path.basename(manAbs).replace(/\.json$/i, '');
  const concatAbs = path.join(path.dirname(manAbs), `.${baseName}.concat.txt`);
  fs.writeFileSync(concatAbs, sv.buildConcatScript(images, m.slides), 'utf8');

  const outRel = path.join('outputs', 'videos', `${baseName}.mp4`).replace(/\\/g, '/');
  const outAbs = path.join(dir, 'outputs', 'videos', `${baseName}.mp4`);
  // 나레이션 오디오: TTS가 mp3로 렌더돼 있으면 합친다(선택)
  const audioRel = m.audio && m.audio.audioFile;
  const audioAbs = audioRel ? resolveInWs(dir, audioRel) : null;

  return {
    ok: true,
    warnings: v.warnings,
    plan: {
      concatPath: concatAbs,
      outRel, outAbs,
      audioPath: audioAbs && fs.existsSync(audioAbs) ? audioAbs : null,
      argsFor: (/* ffmpegPath used by caller as argv[0] */) => sv.buildFfmpegArgs(m, {
        concatPath: concatAbs, outPath: outAbs,
        audioPath: audioAbs && fs.existsSync(audioAbs) ? audioAbs : null,
      }),
    },
  };
}

// 워크스페이스의 slide-video 매니페스트 목록 (outputs/videos/*-slidevideo-*.json)
function listManifests(dir) {
  const vdir = path.join(dir, 'outputs', 'videos');
  let names = [];
  try { names = fs.readdirSync(vdir); } catch { return []; }
  return names
    .filter((n) => /-slidevideo-.*\.json$/i.test(n))
    .map((n) => path.join('outputs', 'videos', n).replace(/\\/g, '/'));
}

module.exports = { prepare, listManifests, _resolveInWs: resolveInWs };
