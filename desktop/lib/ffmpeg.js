// ffmpeg 바이너리 경로 해석 — 슬라이드 영상 인코딩에 쓴다.
// 우선순위: ① 번들된 ffmpeg-static(설치 시 함께 포함) → ② 시스템 PATH의 ffmpeg → ③ 없음.
// electron asar 안의 ffmpeg-static 경로는 unpack 폴더로 교정한다(바이너리는 asar에서 실행 불가).
const { spawnSync } = require('child_process');

// 의존성 주입 가능(테스트) — tryStatic()은 번들 경로|null, probeSystem()은 'ffmpeg' 실행 가능 여부
function defaultTryStatic() {
  try {
    let p = require('ffmpeg-static');
    if (!p || typeof p !== 'string') return null;
    // 패키징 시 asar 내부 경로면 unpacked로 교정
    p = p.replace('app.asar' + require('path').sep, 'app.asar.unpacked' + require('path').sep);
    return require('fs').existsSync(p) ? p : null;
  } catch { return null; }
}
function defaultProbeSystem() {
  try {
    const r = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore', timeout: 4000 });
    return r.status === 0;
  } catch { return false; }
}

function resolve(deps = {}) {
  const tryStatic = deps.tryStatic || defaultTryStatic;
  const probeSystem = deps.probeSystem || defaultProbeSystem;
  const staticPath = tryStatic();
  if (staticPath) return { path: staticPath, source: 'bundled' };
  if (probeSystem()) return { path: 'ffmpeg', source: 'system' };
  return { path: null, source: 'none' };
}

module.exports = { resolve, _defaultTryStatic: defaultTryStatic, _defaultProbeSystem: defaultProbeSystem };
