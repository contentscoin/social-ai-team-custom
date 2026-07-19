// 시안(variant) 저장 계층 — "여러 안을 만들고 잘 나온 것만 골라 쓴다" 워크플로우의 기반.
// 시안은 outputs/creatives/variants/<uid>/ 아래에 살아 보드 레인(readLane, 비재귀)에
// 잡히지 않고, pick()으로 outputs/creatives/<uid>_<slot>.<ext>에 승격되어야 카드에 나타난다.
const fs = require('fs');
const path = require('path');

const IMG_RE = /\.(png|jpe?g|webp)$/i;
const escRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function root(dir, uid) {
  return path.join(dir, 'outputs', 'creatives', 'variants', path.basename(String(uid)));
}
function ensure(dir, uid) {
  const p = root(dir, uid);
  fs.mkdirSync(p, { recursive: true });
  return p;
}
function list(dir, uid) {
  const p = root(dir, uid);
  let names = [];
  try { names = fs.readdirSync(p).filter((f) => IMG_RE.test(f)).sort(); } catch { /* 시안 없음 */ }
  const relBase = path.join('outputs', 'creatives', 'variants', path.basename(String(uid)));
  return names.map((name) => ({ name, rel: path.join(relBase, name).replace(/\\/g, '/') }));
}
function clear(dir, uid) {
  try { fs.rmSync(root(dir, uid), { recursive: true, force: true }); } catch { /* 없으면 그만 */ }
}

// 선택한 시안을 <uid>_<slot> 정식 파일로 승격 — 카드 썸네일·발행이 이 파일을 잡는다.
// 같은 슬롯의 기존 파일(다른 확장자 포함)은 교체해 옛 이미지가 보드에 남지 않게 한다.
function pick(dir, uid, name, slot = 1) {
  const src = path.join(root(dir, uid), path.basename(String(name)));
  if (!IMG_RE.test(src) || !fs.existsSync(src)) return { ok: false, error: '시안 파일을 찾지 못했습니다' };
  const n = Math.max(1, Number(slot) || 1);
  const cdir = path.join(dir, 'outputs', 'creatives');
  fs.mkdirSync(cdir, { recursive: true });
  const base = `${path.basename(String(uid))}_${n}`;
  const slotRe = new RegExp(`^${escRe(base)}\\.(png|jpe?g|webp)$`, 'i');
  for (const f of fs.readdirSync(cdir)) {
    if (slotRe.test(f)) { try { fs.unlinkSync(path.join(cdir, f)); } catch { /* best effort */ } }
  }
  const dst = path.join(cdir, `${base}${path.extname(src).toLowerCase()}`);
  fs.copyFileSync(src, dst);
  return { ok: true, rel: path.join('outputs', 'creatives', path.basename(dst)).replace(/\\/g, '/') };
}

module.exports = { ensure, list, clear, pick };
