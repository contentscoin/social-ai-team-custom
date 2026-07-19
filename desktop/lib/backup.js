// 워크스페이스 백업·복원 — 의존성 없이 폴더 사본으로.
// 백업 대상은 클라이언트 폴더의 context/outputs/assets/sop 전부. 토큰·API 키는
// 워크스페이스 밖(~/.social-ai-team)에 있어 백업에 절대 포함되지 않는다.
// 백업은 상대 구조만 담으므로 다른 경로의 워크스페이스로도 복원 가능(절대경로 재매핑 불필요).
const fs = require('fs');
const os = require('os');
const path = require('path');

// SAT_WORKROOT: 테스트 훅 — 실제 홈 디렉터리를 건드리지 않고 경로를 바꾼다
const WORKROOT = process.env.SAT_WORKROOT || path.join(os.homedir(), 'SocialAITeam');
const BACKUPS = path.join(WORKROOT, 'backups');
const SUBS = ['context', 'outputs', 'assets', 'sop'];

const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

function countFiles(p) {
  let n = 0;
  for (const e of fs.readdirSync(p, { withFileTypes: true })) {
    n += e.isDirectory() ? countFiles(path.join(p, e.name)) : 1;
  }
  return n;
}

function createBackup(dir, kind = 'manual') {
  const src = path.resolve(String(dir || ''));
  if (!src || !fs.existsSync(src)) return { ok: false, error: '워크스페이스 폴더가 없습니다' };
  const name = `${path.basename(src)}-${stamp()}${kind === 'manual' ? '' : '-' + kind}`;
  const dst = path.join(BACKUPS, name);
  if (fs.existsSync(dst)) return { ok: false, error: '같은 이름의 백업이 이미 있습니다 — 잠시 후 다시 시도하세요' };
  fs.mkdirSync(dst, { recursive: true });
  let files = 0;
  for (const sub of SUBS) {
    const s = path.join(src, sub);
    if (!fs.existsSync(s)) continue;
    fs.cpSync(s, path.join(dst, sub), { recursive: true });
    files += countFiles(path.join(dst, sub));
  }
  const manifest = { backupVersion: 1, kind, createdAt: new Date().toISOString(), sourceDir: src, client: path.basename(src), files };
  fs.writeFileSync(path.join(dst, 'backup-manifest.json'), JSON.stringify(manifest, null, 2));
  return { ok: true, name, path: dst, files };
}

function listBackups() {
  if (!fs.existsSync(BACKUPS)) return [];
  const out = [];
  for (const name of fs.readdirSync(BACKUPS)) {
    try {
      const mf = JSON.parse(fs.readFileSync(path.join(BACKUPS, name, 'backup-manifest.json'), 'utf8'));
      out.push({ name, path: path.join(BACKUPS, name), ...mf });
    } catch { /* 매니페스트 없는 폴더는 백업이 아님 */ }
  }
  return out.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

// 복원 — 대상 워크스페이스의 현재 상태를 pre-restore 스냅샷으로 먼저 남긴 뒤
// (실수 복원도 한 번 더 복원하면 돌아온다), 백업의 하위 폴더로 대상을 교체한다.
function restoreBackup(backupName, targetDir) {
  const src = path.join(BACKUPS, path.basename(String(backupName || ''))); // basename — 경로 이탈 방지
  if (!fs.existsSync(path.join(src, 'backup-manifest.json'))) return { ok: false, error: '백업을 찾지 못했습니다' };
  const dst = path.resolve(String(targetDir || ''));
  if (!dst || !fs.existsSync(dst)) return { ok: false, error: '복원 대상 워크스페이스 폴더가 없습니다' };
  const snap = createBackup(dst, 'pre-restore');
  if (!snap.ok) return { ok: false, error: '복원 전 안전 스냅샷 실패: ' + snap.error };
  for (const sub of SUBS) {
    const s = path.join(src, sub);
    if (!fs.existsSync(s)) continue;
    fs.rmSync(path.join(dst, sub), { recursive: true, force: true });
    fs.cpSync(s, path.join(dst, sub), { recursive: true });
  }
  return { ok: true, restored: path.basename(src), snapshot: snap.name };
}

function deleteBackup(backupName) {
  const src = path.join(BACKUPS, path.basename(String(backupName || '')));
  if (!fs.existsSync(path.join(src, 'backup-manifest.json'))) return { ok: false, error: '백업을 찾지 못했습니다' };
  fs.rmSync(src, { recursive: true, force: true });
  return { ok: true };
}

module.exports = { BACKUPS, createBackup, listBackups, restoreBackup, deleteBackup };
