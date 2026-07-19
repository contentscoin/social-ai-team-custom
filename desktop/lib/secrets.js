// API 키·토큰 저장소 — ~/.social-ai-team/secrets.enc (Electron safeStorage, OS 키체인)
// 발행 채널 토큰과 렌더 프로바이더 키를 로컬에만 보관한다. 값은 렌더러로 마스킹해서만 보낸다.
// 구버전 평문 secrets.json은 최초 접근 시 암호화본으로 병합 이관 후 삭제한다.
// 키체인이 없는 환경(리눅스 키링 부재, 일렉트론 밖 테스트)은 기존 평문(0600) 동작으로 폴백.
const fs = require('fs');
const os = require('os');
const path = require('path');

// SAT_HOME: 테스트 훅 — 실제 홈 디렉터리를 건드리지 않고 저장 경로를 바꾼다
const DIR = process.env.SAT_HOME || path.join(os.homedir(), '.social-ai-team');
const FILE = path.join(DIR, 'secrets.json'); // 평문 폴백 + 구버전 이관 소스
const ENC_FILE = path.join(DIR, 'secrets.enc'); // { v: 1, data: base64(safeStorage 암호문) }

let warned = false;
function warnFallback(msg) {
  if (warned) return;
  warned = true;
  try { require('./applog').write('secrets', msg); } catch { /* 일렉트론 밖 */ }
  console.warn('[secrets] ' + msg);
}
function keychain() {
  try {
    const { safeStorage } = require('electron');
    if (safeStorage && safeStorage.isEncryptionAvailable()) return safeStorage;
  } catch { /* 일렉트론 밖(테스트·CLI) */ }
  return null;
}

function readPlain() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')) || {}; }
  catch {
    if (fs.existsSync(FILE)) { try { fs.renameSync(FILE, FILE + '.corrupt-' + Date.now()); } catch { /* best effort */ } }
    return {};
  }
}
// 원자적 쓰기 공통 — 크래시가 키 저장소를 통째로 날리지 않게
function writeAtomic(file, text) {
  fs.mkdirSync(DIR, { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, text, { mode: 0o600 });
  fs.renameSync(tmp, file);
  try { fs.chmodSync(file, 0o600); } catch { /* windows: ACL 상속 */ }
}
function saveEnc(ss, all) {
  const buf = ss.encryptString(JSON.stringify(all));
  writeAtomic(ENC_FILE, JSON.stringify({ v: 1, data: buf.toString('base64') }));
}

function load() {
  const ss = keychain();
  if (!ss) {
    if (fs.existsSync(ENC_FILE)) {
      // 암호화본이 있는데 키체인이 없다 — 복호화 불가. enc는 보존하고 평문만 읽는다
      warnFallback('OS 키체인 사용 불가 — secrets.enc를 읽지 못해 평문 폴백으로 동작합니다');
    }
    return readPlain();
  }
  let data = null;
  if (fs.existsSync(ENC_FILE)) {
    try {
      const env = JSON.parse(fs.readFileSync(ENC_FILE, 'utf8'));
      data = JSON.parse(ss.decryptString(Buffer.from(env.data, 'base64'))) || {};
    } catch {
      // 깨진 암호화본은 백업하고 새로 시작 (조용한 소실 금지 — 평문 이관분이 남아 있을 수 있다)
      try { fs.renameSync(ENC_FILE, ENC_FILE + '.corrupt-' + Date.now()); } catch { /* best effort */ }
      data = null;
    }
  }
  if (data === null) data = {};
  if (fs.existsSync(FILE)) {
    // 구버전 평문(또는 키체인 공백기의 기록)을 암호화본에 병합 후 평문 삭제
    data = { ...data, ...readPlain() };
    try { saveEnc(ss, data); fs.unlinkSync(FILE); } catch { /* 다음 접근에서 재시도 */ }
  }
  return data;
}
function save(all) {
  const ss = keychain();
  if (ss) {
    saveEnc(ss, all);
    try { if (fs.existsSync(FILE)) fs.unlinkSync(FILE); } catch { /* best effort */ }
    return;
  }
  warnFallback('OS 키체인 사용 불가 — 토큰을 평문(0600) secrets.json으로 저장합니다');
  writeAtomic(FILE, JSON.stringify(all, null, 2));
}

// ns: 'x' | 'facebook' | 'threads' | 'linkedin' | 'openai' | 'runway' | 'higgsfield' | 'comfyui' | 'custom-video'
function get(ns) { return load()[ns] || {}; }
function set(ns, values) {
  const all = load();
  all[ns] = { ...(all[ns] || {}) };
  for (const [k, v] of Object.entries(values || {})) {
    const s = String(v == null ? '' : v).trim();
    if (s) all[ns][k] = s; else delete all[ns][k];
  }
  if (!Object.keys(all[ns]).length) delete all[ns];
  save(all);
  return masked(ns);
}
// 렌더러 표시용 — 앞 4자만 남기고 가린다
function masked(ns) {
  const v = get(ns);
  const out = {};
  for (const [k, val] of Object.entries(v)) {
    // URL·ID류는 그대로 보여줘도 된다 (비밀 아님)
    out[k] = /url|id$|^user|^page|^person|workflow/i.test(k)
      ? val
      : (val.length > 8 ? val.slice(0, 4) + '…' + val.slice(-2) : '••••');
  }
  return out;
}
function has(ns, keys) {
  const v = get(ns);
  return (keys || []).every((k) => !!v[k]);
}

module.exports = { get, set, masked, has };
