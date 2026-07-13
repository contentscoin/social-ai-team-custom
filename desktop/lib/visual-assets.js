// 비주얼 자산 — 마스터시트·캐릭터시트·콘텐츠 베이스 정리 및 OpenCrab 인제스트
const fs = require('fs');
const path = require('path');
const opencrab = require('./opencrab');
const bindings = require('./opencrab-bindings');

const KINDS = ['master_sheet', 'character_sheet', 'content_base'];

function assetsDir(dir) {
  return path.join(dir, 'context', 'visual-assets');
}

function listAssets(dir) {
  const base = assetsDir(dir);
  const out = [];
  for (const kind of KINDS) {
    const d = path.join(base, kind);
    try {
      for (const f of fs.readdirSync(d)) {
        if (!/\.(md|txt|json|png|jpe?g|webp)$/i.test(f)) continue;
        const p = path.join(d, f);
        const st = fs.statSync(p);
        if (!st.isFile()) continue;
        out.push({ kind, file: f, path: p, rel: path.relative(dir, p), mtime: st.mtimeMs, size: st.size });
      }
    } catch { /* empty */ }
  }
  return out;
}

function ensureDirs(dir) {
  for (const kind of KINDS) {
    fs.mkdirSync(path.join(assetsDir(dir), kind), { recursive: true });
  }
  const readme = path.join(assetsDir(dir), 'README.md');
  if (!fs.existsSync(readme)) {
    fs.writeFileSync(readme, `# Visual Assets

| 폴더 | 용도 |
|------|------|
| master_sheet/ | 브랜드 비주얼 마스터시트 (팔레트·타이포·그리드) |
| character_sheet/ | 캐릭터/마스코트 정체성 시트 |
| content_base/ | 제품·장면·레퍼런스 콘텐츠 베이스 |

이미지는 참조용으로 두고, 설명은 동명 .md 파일에 작성하세요. OpenCrab 인제스트 시 md/txt가 우선됩니다.
`, 'utf8');
  }
}

function buildIngestItems(dir) {
  const c = bindings.loadConstants();
  const items = [];
  for (const a of listAssets(dir)) {
    if (!/\.(md|txt|json)$/i.test(a.file)) continue;
    const text = fs.readFileSync(a.path, 'utf8');
    const meta = (c.visual_asset_kinds && c.visual_asset_kinds[a.kind]) || {};
    items.push({
      title: `${meta.label || a.kind}: ${a.file}`,
      source: a.rel,
      kind: a.kind,
      channel: 'visual',
      topic: a.kind,
      text: `# ${meta.label || a.kind}\n\n${meta.description || ''}\n\n${text}`,
    });
  }
  return items;
}

async function ingestVisualAssets(dir, projectName) {
  ensureDirs(dir);
  const items = buildIngestItems(dir);
  if (!items.length) {
    return { ok: false, error: '인제스트할 텍스트 자산이 없습니다 — visual-assets/*/ 에 .md 파일을 추가하세요' };
  }
  const proj = projectName || `${path.basename(dir)}-비주얼자산`;
  let projectId = null;
  try {
    const created = await opencrab.createProject(proj, { category: 'brand-visual', description: 'Social AI Team visual asset pack' });
    if (created.ok && created.id) projectId = created.id;
  } catch { /* optional */ }
  const ing = await opencrab.ingest(items, projectId);
  const manifest = {
    projectName: proj,
    projectId,
    ingestedAt: new Date().toISOString(),
    items: items.map((i) => ({ title: i.title, kind: i.kind, source: i.source })),
    ingest: ing,
  };
  fs.mkdirSync(path.join(dir, 'context'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'context', 'visual-assets-manifest.json'), JSON.stringify(manifest, null, 2));
  return { ok: ing.ok || ing.ingested > 0, ...ing, projectName: proj, projectId, count: items.length, manifest: 'context/visual-assets-manifest.json' };
}

module.exports = { KINDS, listAssets, ensureDirs, buildIngestItems, ingestVisualAssets, assetsDir };
