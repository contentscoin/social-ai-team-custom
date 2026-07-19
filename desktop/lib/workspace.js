// Client workspace management — one folder per client (SETUP.md convention)
const fs = require('fs');
const os = require('os');
const path = require('path');
const setup = require('./setup');

const HOME = os.homedir();
const ROOT = path.join(HOME, 'SocialAITeam');           // default clients root
const REGISTRY = path.join(ROOT, 'clients.json');

function loadRegistry() {
  try { return JSON.parse(fs.readFileSync(REGISTRY, 'utf8')); } catch { return { clients: [] }; }
}
function saveRegistry(reg) {
  fs.mkdirSync(ROOT, { recursive: true });
  fs.writeFileSync(REGISTRY, JSON.stringify(reg, null, 2));
}

function listClients() {
  const reg = loadRegistry();
  reg.clients = reg.clients.filter((c) => fs.existsSync(c.dir));
  return reg.clients;
}

function seedClientFolder(dir) {
  for (const sub of ['context', 'assets/products', 'assets/lifestyle', 'outputs']) {
    fs.mkdirSync(path.join(dir, sub), { recursive: true });
  }
  // Arm the SOP hook (image-qa + codex render lane) — social-creative-designer Phase 0 reads sop/creative-designer/
  const p = setup.payloadPaths();
  if (fs.existsSync(p.sop)) fs.cpSync(p.sop, path.join(dir, 'sop'), { recursive: true });
}

function createClient(name) {
  const safe = String(name || '').trim().replace(/[^\w가-힣 -]/g, '').replace(/\s+/g, '-').toLowerCase();
  if (!safe) return { ok: false, error: 'invalid name' };
  const dir = path.join(ROOT, safe);
  fs.mkdirSync(dir, { recursive: true });
  seedClientFolder(dir);
  const reg = loadRegistry();
  if (!reg.clients.find((c) => c.dir === dir)) reg.clients.push({ name: safe, dir });
  saveRegistry(reg);
  return { ok: true, name: safe, dir };
}

function addExisting(dir) {
  seedClientFolder(dir); // idempotent — only fills gaps
  const name = path.basename(dir);
  const reg = loadRegistry();
  if (!reg.clients.find((c) => c.dir === dir)) reg.clients.push({ name, dir });
  saveRegistry(reg);
  return { ok: true, name, dir };
}

// Parse context/workflow-status.md checkboxes + key context files into a dashboard model
function readStatus(dir) {
  const ctx = (f) => fs.existsSync(path.join(dir, 'context', f));
  const statusPath = path.join(dir, 'context', 'workflow-status.md');
  let items = [];
  let raw = '';
  if (fs.existsSync(statusPath)) {
    raw = fs.readFileSync(statusPath, 'utf8');
    items = [...raw.matchAll(/^- \[( |x)\] (.+)$/gm)].map((m) => ({ done: m[1] === 'x', label: m[2] }));
  }
  return {
    brand: ctx('brand-style.md'),
    voiceProfile: ctx('kr-voice-profile.md'),
    calendar: ctx('content-calendar.md'),
    statusItems: items,
    statusRaw: raw,
  };
}

const OUTPUT_LANES = ['captions', 'linkedin', 'threads', 'x', 'naver', 'naver_clip', 'kakao', 'creatives', 'videos', 'storyboards', 'compliance', 'reviews'];

function listOutputs(dir) {
  const lanes = {};
  for (const lane of OUTPUT_LANES) {
    const p = path.join(dir, 'outputs', lane);
    lanes[lane] = fs.existsSync(p)
      ? fs.readdirSync(p).filter((f) => !f.startsWith('.')).map((f) => path.join('outputs', lane, f))
      : [];
  }
  return lanes;
}

function resolveInside(dir, rel) {
  const root = path.resolve(dir);
  const abs = path.resolve(root, String(rel || '').replace(/\\/g, '/'));
  const relToRoot = path.relative(root, abs);
  if (!relToRoot || relToRoot.startsWith('..') || path.isAbsolute(relToRoot)) {
    return { ok: false, error: 'path escape blocked' };
  }
  return { ok: true, root, abs, rel: relToRoot.replace(/\\/g, '/') };
}

function readOutputFile(dir, rel) {
  const loc = resolveInside(dir, rel);
  if (!loc.ok) return loc;
  if (!fs.existsSync(loc.abs)) return { ok: false, error: 'not found' };
  const stat = fs.statSync(loc.abs);
  const ext = path.extname(loc.abs).toLowerCase();
  const isImg = ['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext);
  // 원본 전체 base64는 렌더러 OOM을 유발할 수 있음 — 큰 이미지는 미리보기 API 사용 권장
  const max = isImg ? 4 * 1024 * 1024 : 2 * 1024 * 1024;
  if (stat.size > max) return { ok: false, error: 'file too large — use readImagePreview' };
  if (isImg) {
    const mime = ext === '.jpg' ? 'jpeg' : ext.slice(1);
    return { ok: true, kind: 'image', dataUrl: `data:image/${mime};base64,${fs.readFileSync(loc.abs).toString('base64')}`, rel: loc.rel };
  }
  return { ok: true, kind: 'text', text: fs.readFileSync(loc.abs, 'utf8') };
}

/** 템플릿/카드용 — Electron nativeImage로 긴 변 maxEdge 이하 썸네일 data URL */
function readImagePreview(dir, rel, maxEdge = 720) {
  const loc = resolveInside(dir, rel);
  if (!loc.ok) return loc;
  if (!fs.existsSync(loc.abs)) return { ok: false, error: 'not found', rel: String(rel || '') };
  const ext = path.extname(loc.abs).toLowerCase();
  if (!['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext)) {
    return { ok: false, error: 'not an image', rel: loc.rel };
  }
  try {
    const { nativeImage } = require('electron');
    let img = nativeImage.createFromPath(loc.abs);
    if (img.isEmpty()) {
      // gif/webp 일부는 nativeImage 실패 — 작은 파일만 원본 fallback
      const st = fs.statSync(loc.abs);
      if (st.size <= 2 * 1024 * 1024) return readOutputFile(dir, loc.rel);
      return { ok: false, error: 'decode failed', rel: loc.rel };
    }
    const size = img.getSize();
    const edge = Math.max(1, Number(maxEdge) || 720);
    if (Math.max(size.width, size.height) > edge) {
      const scale = edge / Math.max(size.width, size.height);
      img = img.resize({
        width: Math.max(1, Math.round(size.width * scale)),
        height: Math.max(1, Math.round(size.height * scale)),
        quality: 'better',
      });
    }
    // PNG data URL — JPEG보다 호환 안정
    const dataUrl = img.toDataURL();
    return {
      ok: true,
      kind: 'image',
      dataUrl,
      rel: loc.rel,
      width: img.getSize().width,
      height: img.getSize().height,
    };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e), rel: loc.rel };
  }
}

module.exports = { listClients, createClient, addExisting, readStatus, listOutputs, readOutputFile, readImagePreview, resolveInside };
