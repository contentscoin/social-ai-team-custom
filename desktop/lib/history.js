// 실행 기록 — ~/.social-ai-team/history.json: 스테이지/채팅/오토파일럿 실행의
// 시간·소요·비용·결과를 남긴다. 워크스페이스 폴더에 쓰지 않는 이유: outputs/context에
// 쓰면 fs.watch가 보드 리빌드를 돌려 기록 한 줄마다 리렌더가 도는 루프가 생긴다.
// runs는 CAP으로 잘리지만 rollup(월×dir 집계)은 append 시점에 누적되어 무손실이다.
const fs = require('fs');
const os = require('os');
const path = require('path');

// SAT_HOME: 테스트 훅 — 실제 홈 디렉터리를 건드리지 않고 저장 경로를 바꾼다
const DIR = process.env.SAT_HOME || path.join(os.homedir(), '.social-ai-team');
const FILE = path.join(DIR, 'history.json');
const CAP = 500;

function addRollup(rollup, r) {
  const month = String(r.at || '').slice(0, 7);
  if (!month || !r.dir) return;
  const m = rollup[month] = rollup[month] || {};
  const d = m[r.dir] = m[r.dir] || { runs: 0, costUsd: 0 };
  d.runs += 1;
  if (typeof r.costUsd === 'number') d.costUsd = Math.round((d.costUsd + r.costUsd) * 10000) / 10000;
}

function load() {
  try {
    const j = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    if (!Array.isArray(j.runs)) return { runs: [], rollup: {} };
    // 롤업 백필 — 롤업 도입 전 파일이면 남아 있는 runs로 1회 초기화 (이미 잘린 기록은 복원 불가)
    if (!j.rollup) { j.rollup = {}; for (const r of j.runs) addRollup(j.rollup, r); }
    return j;
  } catch { return { runs: [], rollup: {} }; }
}

// entry: { dir, kind:'stage'|'chat'|'autopilot', stage?, engine, model, ok, ms, costUsd?, startedAt, note? }
function append(entry) {
  try {
    const h = load();
    const rec = { ...entry, at: new Date().toISOString() };
    h.runs.push(rec);
    addRollup(h.rollup, rec); // CAP trim보다 먼저 — 잘려도 월 집계는 남는다
    if (h.runs.length > CAP) h.runs = h.runs.slice(-CAP);
    fs.mkdirSync(DIR, { recursive: true });
    const tmp = FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(h, null, 2));
    fs.renameSync(tmp, FILE);
  } catch { /* 기록 실패가 실행을 막으면 안 된다 */ }
}

// 이번 달(기본) 워크스페이스 비용 — 롤업 기반이라 CAP과 무관하게 정확.
// 주의: claude CLI 실행만 costUsd를 남긴다 — 렌더·codex 비용은 미집계(하한선으로 취급).
function monthCost(dir, month = new Date().toISOString().slice(0, 7)) {
  const h = load();
  const d = h.rollup[month] && h.rollup[month][dir];
  return d ? d.costUsd : 0;
}

// 워크스페이스별 최근 기록 + 이번 달 비용 합계
function forDir(dir, limit = 60) {
  const h = load();
  const runs = h.runs.filter((r) => r.dir === dir).slice(-limit).reverse();
  const month = new Date().toISOString().slice(0, 7);
  const d = h.rollup[month] && h.rollup[month][dir];
  return { runs, monthCost: d ? d.costUsd : 0 };
}

module.exports = { append, forDir, monthCost };
