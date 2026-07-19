// 구조화 파일 스키마 버전 프레임워크 — 기동 시 앱 소유 JSON 파일에 schemaVersion을
// 스탬프하고, 등록된 마이그레이션을 순차 적용한다. 계약 파일을 늘리는 로드맵 전체의
// 전제 인프라: 형태가 바뀌면 MIGRATIONS에 v(n)→v(n+1) 함수를 추가하고 CURRENT를 올린다.
// 각 모듈의 save는 load한 객체를 그대로 다시 쓰므로 스탬프된 schemaVersion은 유지된다.
const fs = require('fs');
const os = require('os');
const path = require('path');

// SAT_HOME / SAT_WORKROOT: 테스트 훅 — 실제 홈 디렉터리를 건드리지 않고 경로를 바꾼다
const SAT = process.env.SAT_HOME || path.join(os.homedir(), '.social-ai-team');
const WORKROOT = process.env.SAT_WORKROOT || path.join(os.homedir(), 'SocialAITeam');

// key별 현재 버전. MIGRATIONS[key][n]은 v(n) → v(n+1) 변환 — 함수가 없으면 스탬프만.
const CURRENT = { settings: 1, history: 1, clients: 1, gates: 1, publishLog: 1, publishQueue: 1, visualAssets: 1 };
const MIGRATIONS = {
  settings: [
    // v0 → v1: 클라이언트별 세션이 단일 문자열이던 과거 형태를 엔진별 객체로 정규화
    // (config.normSessions의 읽기 시점 임시 마이그레이션을 저장 형태로 흡수)
    (j) => {
      const sessions = {};
      for (const [dir, v] of Object.entries(j.sessions || {})) {
        sessions[dir] = typeof v === 'string' ? (v.startsWith('codex') ? { codex: v } : { claude: v }) : v;
      }
      return { ...j, sessions };
    },
  ],
};

function globalFiles() {
  return [
    { key: 'settings', file: path.join(SAT, 'settings.json') },
    { key: 'history', file: path.join(SAT, 'history.json') },
    { key: 'clients', file: path.join(WORKROOT, 'clients.json') },
  ];
}
function workspaceFiles(dir) {
  return [
    { key: 'gates', file: path.join(dir, 'context', 'gates.json') },
    { key: 'publishLog', file: path.join(dir, 'context', 'publish-log.json') },
    { key: 'publishQueue', file: path.join(dir, 'context', 'publish-queue.json') },
    { key: 'visualAssets', file: path.join(dir, 'context', 'visual-assets-manifest.json') },
  ];
}

// 단일 파일 마이그레이션. 없는 파일은 건너뛰고(생기면 다음 기동에 스탬프),
// 깨진 파일은 각 모듈의 corrupt-백업 처리에 맡긴다.
// 반환: 'absent' | 'skipped' | 'current' | 'stamped' | 'migrated'
function migrateFile(key, file) {
  if (!fs.existsSync(file)) return 'absent';
  let j;
  try { j = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return 'skipped'; }
  if (!j || typeof j !== 'object' || Array.isArray(j)) return 'skipped';
  const target = CURRENT[key] || 1;
  let v = Number(j.schemaVersion) || 0;
  if (v >= target) return 'current';
  const chain = MIGRATIONS[key] || [];
  let applied = 0;
  for (; v < target; v++) {
    const fn = chain[v];
    if (fn) { j = fn(j); applied++; }
  }
  j.schemaVersion = target;
  // 원자적 교체 — 마이그레이션 도중 크래시가 파일을 반쯤 쓴 채 남기지 않게
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(j, null, 2));
  fs.renameSync(tmp, file);
  return applied ? 'migrated' : 'stamped';
}

// 기동 시 1회 — 전역 파일 + 모든 워크스페이스 파일. 실패가 부팅을 막지 않는다.
function migrateAll(dirs = []) {
  const report = [];
  const run = (key, file) => {
    let result;
    try { result = migrateFile(key, file); } catch (e) { result = 'error: ' + String(e && e.message || e).slice(0, 120); }
    report.push({ key, file, result });
  };
  for (const { key, file } of globalFiles()) run(key, file);
  for (const dir of dirs) for (const { key, file } of workspaceFiles(dir)) run(key, file);
  return report;
}

module.exports = { CURRENT, migrateFile, migrateAll };
