// App settings + per-client conversation session ids
const fs = require('fs');
const os = require('os');
const path = require('path');

// SAT_HOME: 테스트 훅 — 실제 홈 디렉터리를 건드리지 않고 저장 경로를 바꾼다
const DIR = process.env.SAT_HOME || path.join(os.homedir(), '.social-ai-team');
const FILE = path.join(DIR, 'settings.json');

const imagestyles = require('./imagestyles');

const DEFAULTS = { engine: 'claude', sessions: {}, models: { claude: '', codex: '' }, budgetUsd: 0, stageEngines: {}, imageStyle: '', autopilotAutoApprove: false }; // engine: 'claude' | 'codex'; model '' = CLI 기본값; budgetUsd 0 = 예산 미설정; stageEngines: 단계별 엔진 오버라이드; imageStyle: 이미지 생성 기본 스타일('' = 미지정); autopilotAutoApprove: 오토파일럿이 승인 게이트를 자동 통과

function load() {
  try { return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) }; }
  catch {
    // 깨진 설정은 조용히 덮지 말고 백업 후 기본값으로 (세션/모델 복구 여지)
    if (fs.existsSync(FILE)) { try { fs.renameSync(FILE, FILE + '.corrupt-' + Date.now()); } catch { /* best effort */ } }
    return { ...DEFAULTS };
  }
}
function save(cfg) {
  fs.mkdirSync(DIR, { recursive: true });
  // 원자적 교체 — 쓰다 만 파일이 모든 세션/설정을 날리지 않게
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2));
  fs.renameSync(tmp, FILE);
  return cfg;
}

function getEngine() { return load().engine; }
function setEngine(engine) {
  if (engine !== 'claude' && engine !== 'codex') return load();
  const cfg = load(); cfg.engine = engine; return save(cfg);
}

// 단계(구간)별 엔진 오버라이드 — 값이 없으면 전역 engine을 따른다.
// 예: 캘린더는 Claude, 카피는 Codex 로 나눠 돌려 한도를 분산.
function getStageEngines() { return { ...(load().stageEngines || {}) }; }
function setStageEngine(stage, engine) {
  const cfg = load();
  cfg.stageEngines = { ...(cfg.stageEngines || {}) };
  if (engine === 'claude' || engine === 'codex') cfg.stageEngines[stage] = engine;
  else delete cfg.stageEngines[stage]; // '' | 'default' 등 → 오버라이드 해제(전역 따름)
  save(cfg);
  return cfg.stageEngines;
}
// 이 단계에 실제 적용할 엔진 — 단계 오버라이드 우선, 없으면 전역.
function getEngineFor(stage) {
  const c = load();
  const ov = (c.stageEngines || {})[stage];
  return (ov === 'claude' || ov === 'codex') ? ov : c.engine;
}

function getModels() { const c = load(); return { claude: '', codex: '', ...(c.models || {}) }; }
function setModel(engine, model) {
  if (engine !== 'claude' && engine !== 'codex') return getModels();
  const cfg = load();
  cfg.models = { claude: '', codex: '', ...(cfg.models || {}) };
  cfg.models[engine] = String(model || '').trim();
  save(cfg);
  return cfg.models;
}

// 월 API 예산(USD) — 0이면 비활성. claude CLI 비용만 집계되므로 하한선으로 취급.
function getBudget() {
  const v = Number(load().budgetUsd);
  return Number.isFinite(v) && v > 0 ? v : 0;
}
function setBudget(usd) {
  const cfg = load();
  const v = Number(usd);
  cfg.budgetUsd = Number.isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : 0;
  save(cfg);
  return cfg.budgetUsd;
}

// 이미지 생성 기본 스타일 — 렌더 프롬프트에 붙는 프리셋(imagestyles). '' = 미지정(스타일 강제 없음).
function getImageStyle() {
  const v = load().imageStyle;
  return imagestyles.isValid(v) ? v : '';
}
function setImageStyle(key) {
  const cfg = load();
  cfg.imageStyle = imagestyles.isValid(key) ? key : '';
  save(cfg);
  return cfg.imageStyle;
}

// 오토파일럿 자동 승인 — true면 승인 도장이 필요한 게이트(캘린더·카피·검증·비주얼 브리프)를
// 증거가 있을 때 자동으로 통과한다. 컴플라이언스(안전 게이트)와 발행은 대상이 아니다.
function getAutopilotAutoApprove() { return !!load().autopilotAutoApprove; }
function setAutopilotAutoApprove(on) {
  const cfg = load();
  cfg.autopilotAutoApprove = !!on;
  save(cfg);
  return cfg.autopilotAutoApprove;
}

// 클라이언트 폴더별 × 엔진별 세션 — 과거 버전은 단일 문자열이었으므로 마이그레이션:
// 'codex-started' 류는 codex 슬롯으로, 나머지는 claude 세션 id로 취급한다.
function normSessions(v) {
  if (!v) return {};
  if (typeof v === 'string') return v.startsWith('codex') ? { codex: v } : { claude: v };
  return v;
}
function getSession(dir, engine = 'claude') {
  return normSessions(load().sessions[dir])[engine] || null;
}
function setSession(dir, id, engine = 'claude') {
  const cfg = load();
  const s = normSessions(cfg.sessions[dir]);
  if (id) s[engine] = id; else delete s[engine];
  if (Object.keys(s).length) cfg.sessions[dir] = s; else delete cfg.sessions[dir];
  return save(cfg);
}
// engine 미지정 시 두 엔진 모두 삭제 (대화 초기화 버튼)
function clearSession(dir, engine) {
  if (engine) return setSession(dir, null, engine);
  const cfg = load();
  delete cfg.sessions[dir];
  return save(cfg);
}

module.exports = { load, getEngine, setEngine, getStageEngines, setStageEngine, getEngineFor, getModels, setModel, getBudget, setBudget, getImageStyle, setImageStyle, getAutopilotAutoApprove, setAutopilotAutoApprove, getSession, setSession, clearSession };
