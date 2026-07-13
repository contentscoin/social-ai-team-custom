// 오케스트레이터 — pumasi 라우트 + Claude/Codex/MCP/ima2 가용성에 따라 엔진 선택
const fs = require('fs');
const path = require('path');
const yaml = require('./yaml-lite');
const { runCmd } = require('./proc');
const config = require('./config');

const PUMASI_PATH = path.join(__dirname, '..', '..', 'pumasi.config.yaml');

function loadPumasi() {
  try {
    const text = fs.readFileSync(PUMASI_PATH, 'utf8');
    const parsed = yaml.parse(text).pumasi;
    if (parsed && parsed.tasks && parsed.tasks.length) return parsed;
    // 폴백 — 경량 파서가 tasks 배열을 못 읽을 때
    const tasks = [];
    const taskSec = text.match(/^\s*tasks:\s*\n([\s\S]*)$/m);
    if (taskSec) {
      const blocks = taskSec[1].split(/\n\s{4}-\s+name:\s*/).filter(Boolean);
      for (const block of blocks) {
        const lines = block.split(/\r?\n/);
        const name = lines[0].trim();
        const routeM = block.match(/route:\s*(\S+)/);
        const instM = block.match(/instruction:\s*\|\s*\n([\s\S]*?)(?=\n\s{6}gates:|\n\s{4}-\s+name:|$)/);
        tasks.push({
          name,
          route: routeM ? routeM[1] : 'calendar',
          instruction: instM ? instM[1].replace(/^ {8}/gm, '').trim() : '',
        });
      }
    }
    const routes = {};
    const routeSec = text.match(/routes:\s*\n([\s\S]*?)(?=\n\s*tasks:)/);
    if (routeSec) {
      for (const line of routeSec[1].split(/\r?\n/)) {
        const m = line.match(/^\s{4}([a-z_]+):\s*\[(.+)\]/);
        if (m) routes[m[1]] = m[2].split(',').map((s) => s.trim());
      }
    }
    return { routes, tasks };
  } catch {
    return { routes: {}, tasks: [] };
  }
}

async function detectEngines(env = {}) {
  const out = { claude: !!env.claude, codex: !!env.codex, ima2: !!env.ima2, mcp: !!env.mcp };
  return out;
}

function pickEngine(routeName, engines) {
  const routes = loadPumasi().routes || {};
  const order = routes[routeName] || ['claude'];
  for (const e of order) {
    if (engines[e]) return e;
  }
  return engines.claude ? 'claude' : (engines.codex ? 'codex' : null);
}

async function runTask(taskName, dir, opts = {}) {
  const pumasi = loadPumasi();
  const task = (pumasi.tasks || []).find((t) => t.name === taskName);
  if (!task) return { ok: false, error: `pumasi 태스크 없음: ${taskName}` };
  const engines = await detectEngines(opts.env || {});
  const engine = pickEngine(task.route, engines);
  if (!engine) return { ok: false, error: '사용 가능한 CLI 엔진이 없습니다 (Claude/Codex 설치 필요)' };

  const onLine = opts.onLine;
  const prompt = task.instruction + (opts.extra ? `\n\n${opts.extra}` : '');
  if (engine === 'codex') {
    const model = config.getModels().codex;
    const args = ['exec', '--sandbox', 'workspace-write', '--cd', dir];
    if (model) args.push('--model', model);
    return runCmd('codex', args, onLine, { cwd: dir, stdinText: prompt, timeoutMs: opts.timeoutMs || 600_000 });
  }
  const model = config.getModels().claude;
  const args = ['-p', '--permission-mode', 'acceptEdits', '--add-dir', dir];
  if (model) args.push('--model', model);
  return runCmd('claude', args, onLine, { cwd: dir, stdinText: prompt, timeoutMs: opts.timeoutMs || 600_000 });
}

function listTasks() {
  return (loadPumasi().tasks || []).map((t) => ({ name: t.name, route: t.route }));
}

module.exports = { loadPumasi, detectEngines, pickEngine, runTask, listTasks, PUMASI_PATH };
