// OpenCrab 바인딩 — 상수 로드, 프로젝트/워크플로 실행, 채널 라우팅
const fs = require('fs');
const path = require('path');
const opencrab = require('./opencrab');

const CONST_PATH = path.join(__dirname, '..', '..', 'opencrab', 'opencrab.constants.yaml');

function parseSimpleYaml(text) {
  const out = { project: {}, workflows: {}, packs: {}, channel_routing: {}, visual_asset_kinds: {} };
  let section = null;
  let sub = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, '');
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const top = line.match(/^([a-z_]+):\s*$/);
    if (top) { section = top[1]; sub = null; continue; }
    const subKey = line.match(/^  ([a-z0-9_]+):\s*$/);
    if (subKey && section) { sub = subKey[1]; if (!out[section][sub]) out[section][sub] = {}; continue; }
    const kv = line.match(/^  ([a-z_]+):\s*(.+)$/);
    if (kv && section && !sub) { out[section][kv[1]] = kv[2].replace(/^["']|["']$/g, ''); continue; }
    const subKv = line.match(/^    ([a-z_]+):\s*(.+)$/);
    if (subKv && section && sub) {
      let val = subKv[2].replace(/^["']|["']$/g, '');
      if (val.startsWith('[')) {
        try { val = JSON.parse(val.replace(/'/g, '"')); } catch { val = val.slice(1, -1).split(',').map((s) => s.trim()); }
      }
      out[section][sub][subKv[1]] = val;
    }
  }
  return out;
}

function loadConstants() {
  try {
    const text = fs.readFileSync(CONST_PATH, 'utf8');
    return parseSimpleYaml(text);
  } catch {
    return {
      project: { id: 'f4aef485-ee91-44a0-85cf-a9a96dfa04c2', name: 'threads_top_exposure_research_ko' },
      workflows: { threads_evidence_writing: { id: 'd3a71109-a469-4217-80ff-03e423e24dbc', name: 'Threads Evidence Writing Workflow' } },
      packs: {}, channel_routing: {}, visual_asset_kinds: {},
    };
  }
}

function routeForChannel(channelKey) {
  const c = loadConstants();
  return c.channel_routing[channelKey] || { skill: 'caption-writer' };
}

async function listProjects() {
  const ep = opencrab.endpointOrThrow ? opencrab.endpointOrThrow() : null;
  if (!ep) return { ok: false, error: 'OpenCrab MCP 엔드포인트 없음' };
  try {
    const tools = await opencrab.listTools(ep);
    const runT = tools.find((t) => /project_manage|list_projects/i.test(t.name || ''));
    if (!runT) return { ok: true, projects: [loadConstants().project], via: 'constants' };
    const res = await opencrab.callTool(ep, runT.name, { action: 'list' }, 7);
    const projects = (res.projects || res.items || [res]).filter(Boolean);
    return { ok: true, projects, via: runT.name };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function runWorkflow(workflowKey, args = {}) {
  const c = loadConstants();
  const wf = c.workflows[workflowKey];
  if (!wf) return { ok: false, error: `알 수 없는 워크플로: ${workflowKey}` };
  const ep = opencrab.endpointOrThrow();
  await opencrab.init(ep);
  const tools = await opencrab.listTools(ep);
  const runT = tools.find((t) => /run_workflow|workflow_manage/i.test(t.name || ''));
  if (!runT) return { ok: false, error: 'run_workflow 도구를 찾을 수 없습니다 — MCP 연결을 확인하세요' };
  const payload = {
    workflow_id: wf.id,
    workflow_name: wf.name,
    query: args.query || args.topic || '',
    project_id: c.project.id,
    ...args,
  };
  const res = await opencrab.callTool(ep, runT.name, payload, 8);
  return { ok: true, workflow: wf.name, result: res };
}

async function searchEvidencePack(topic) {
  const c = loadConstants();
  const t = String(topic || '').toLowerCase();
  for (const [key, pack] of Object.entries(c.packs)) {
    const topics = (pack.topics || []).map((x) => String(x).toLowerCase());
    if (topics.some((x) => t.includes(x))) return { ok: true, packKey: key, ...pack };
  }
  return { ok: true, packKey: 'threads_it', ...c.packs.threads_it };
}

module.exports = {
  loadConstants,
  routeForChannel,
  listProjects,
  runWorkflow,
  searchEvidencePack,
  CONST_PATH,
};
