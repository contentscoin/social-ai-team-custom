// Setup wizard backend — "설치했을 때 적용": skills → ~/.claude, Codex CLI + OAuth, MCP 등록
const fs = require('fs');
const os = require('os');
const path = require('path');
const { runCmd, resolveCmd } = require('./proc');

let openExternal = () => {};
try {
  const { shell } = require('electron');
  openExternal = (u) => shell.openExternal(u).catch(() => {});
} catch { /* running outside electron (tests) */ }

const HOME = os.homedir();
const CLAUDE_DIR = path.join(HOME, '.claude');
const CLAUDE_USER_CONFIG = path.join(HOME, '.claude.json');

// Where the bundled skills/agents/sop live. Packaged: resources/payload. Dev: repo root.
// imageKit: 공냥 프롬프트 킷의 앱 번들 사본(vendor/image-prompt) — git 없는 PC에서도 설치되게.
function payloadPaths() {
  const packaged = path.join(process.resourcesPath || '', 'payload');
  if (process.resourcesPath && fs.existsSync(packaged)) {
    return {
      skills: path.join(packaged, 'skills'),
      agents: path.join(packaged, 'agents'),
      sop: path.join(packaged, 'sop'),
      imageKit: path.join(packaged, 'image-prompt'),
    };
  }
  const repo = path.resolve(__dirname, '..', '..');
  return {
    skills: path.join(repo, 'skills'),
    agents: path.join(repo, '.claude', 'agents'),
    sop: path.join(repo, 'sop'),
    imageKit: path.join(repo, 'vendor', 'image-prompt'),
    dev: true,
  };
}

async function cliVersion(name) {
  const abs = resolveCmd(name);
  const r = await runCmd(name, ['--version'], null, { timeoutMs: 15000 });
  return { found: r.ok, path: abs || (r.ok ? name + ' (PATH)' : null), version: r.ok ? r.out.trim().split(/\r?\n/)[0] : null };
}

async function checkEnvironment() {
  const [claude, codex, node, ima2] = await Promise.all([
    cliVersion('claude'), cliVersion('codex'), cliVersion('node'), cliVersion('ima2'),
  ]);
  let codexAuthed = false;
  if (codex.found) {
    const r = await runCmd('codex', ['login', 'status'], null, { timeoutMs: 20000 });
    codexAuthed = /logged in using/i.test(r.out);
  }
  // ima2 setup writes ~/.ima2 — presence is the "configured" signal (OAuth details live inside)
  const ima2Configured = ima2.found && fs.existsSync(path.join(HOME, '.ima2'));
  // CLI 등록도 user-scope는 ~/.claude.json의 mcpServers에 남는다 — 존재 여부가 등록 신호
  let qrMcpRegistered = false;
  try {
    qrMcpRegistered = !!(JSON.parse(fs.readFileSync(CLAUDE_USER_CONFIG, 'utf8')).mcpServers || {}).qrcoding;
  } catch { /* 설정 파일 없음/깨짐 — 미등록으로 표시 */ }
  return {
    platform: process.platform,
    node: node.found,
    claude: claude.found,
    codex: codex.found,
    codexAuthed,
    ima2: ima2.found,
    ima2Configured,
    skillsInstalled: fs.existsSync(path.join(CLAUDE_DIR, 'skills', 'content-director', 'SKILL.md')),
    agentsInstalled: fs.existsSync(path.join(CLAUDE_DIR, 'agents', 'copywriter.md')),
    qrMcpRegistered,
    paths: { claude: claude.path, codex: codex.path, node: node.path, ima2: ima2.path },
    versions: { claude: claude.version, codex: codex.version, node: node.version, ima2: ima2.version },
    claudeInstallUrl: 'https://code.claude.com/docs/en/quickstart',
    nodeInstallUrl: 'https://nodejs.org/',
  };
}

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  fs.cpSync(src, dst, { recursive: true });
}

async function installSkills() {
  const p = payloadPaths();
  if (!fs.existsSync(p.skills)) return { ok: false, tail: `payload not found: ${p.skills}` };
  const installed = [];
  for (const name of fs.readdirSync(p.skills)) {
    const src = path.join(p.skills, name);
    if (!fs.statSync(src).isDirectory()) continue;
    copyDir(src, path.join(CLAUDE_DIR, 'skills', name));
    installed.push(name);
  }
  copyDir(p.agents, path.join(CLAUDE_DIR, 'agents'));
  copyDir(p.sop, path.join(CLAUDE_DIR, 'social-ai-team-sop'));
  return { ok: true, skills: installed, agents: fs.readdirSync(path.join(CLAUDE_DIR, 'agents')) };
}

async function installCodexCli(onLine) {
  if (resolveCmd('codex')) return { ok: true, already: true };
  const node = await cliVersion('node');
  if (!node.found) {
    return { ok: false, needNode: true, tail: 'Node.js가 없습니다 — https://nodejs.org 에서 LTS 설치 후 다시 시도하세요.' };
  }
  onLine && onLine('npm으로 @openai/codex 설치 중…');
  return runCmd('npm', ['install', '-g', '@openai/codex'], onLine, { timeoutMs: 300000 });
}

// PC에는 브라우저가 있으므로 표준 OAuth 우선. GUI에서 스폰된 프로세스가 브라우저를
// 못 여는 경우를 대비해, 출력에서 URL을 잡아 Electron이 직접 연다.
// 브라우저 콜백 흐름이 실패하면 디바이스 코드 흐름으로 폴백.
async function codexOAuthLogin(onLine) {
  if (!resolveCmd('codex') && !(await cliVersion('codex')).found) {
    return { ok: false, tail: 'codex CLI가 없습니다 — 먼저 "Codex 설치"를 실행하세요.' };
  }
  const status = await runCmd('codex', ['login', 'status'], null, { timeoutMs: 20000 });
  if (/logged in using/i.test(status.out)) return { ok: true, already: true };

  const urls = [];
  const sniff = (l) => {
    onLine && onLine(l);
    const m = l.match(/https?:\/\/\S+/);
    if (m && !urls.includes(m[0])) {
      urls.push(m[0]);
      openExternal(m[0]);
      onLine && onLine(`→ 브라우저에서 열었습니다: ${m[0]}`);
    }
  };
  const r = await runCmd('codex', ['login'], sniff, { timeoutMs: 300000 });
  if (r.ok) return { ...r, urls };
  onLine && onLine('브라우저 콜백 흐름 실패 — 디바이스 코드로 전환합니다. 아래 URL을 열고 코드를 입력하세요.');
  const r2 = await runCmd('codex', ['login', '--device-auth'], sniff, { timeoutMs: 600000 });
  return { ...r2, urls };
}

// ~/.claude.json에 MCP 서버 항목 직접 병합 — CLI 등록 실패 시 공용 폴백 (백업 후)
function writeMcpServerConfig(name, entry, onLine) {
  let cfg = {};
  if (fs.existsSync(CLAUDE_USER_CONFIG)) {
    fs.copyFileSync(CLAUDE_USER_CONFIG, CLAUDE_USER_CONFIG + '.bak');
    cfg = JSON.parse(fs.readFileSync(CLAUDE_USER_CONFIG, 'utf8'));
  }
  cfg.mcpServers = cfg.mcpServers || {};
  cfg.mcpServers[name] = entry;
  fs.writeFileSync(CLAUDE_USER_CONFIG, JSON.stringify(cfg, null, 2));
  onLine && onLine(`기록 완료: ${CLAUDE_USER_CONFIG} (백업: .bak)`);
}

// user-scope MCP 등록: CLI 우선, 실패하면 ~/.claude.json에 직접 병합 (백업 후).
async function registerCodexMcp(onLine) {
  const codexPath = resolveCmd('codex') || 'codex';
  const r = await runCmd('claude', ['mcp', 'add', '-s', 'user', 'codex', '--', codexPath, 'mcp-server'], onLine, { timeoutMs: 60000 });
  if (r.ok || /already exists/i.test(r.out)) return { ok: true, via: 'cli', already: /already exists/i.test(r.out) };

  onLine && onLine('claude CLI 등록 실패 — ~/.claude.json에 직접 기록합니다.');
  try {
    writeMcpServerConfig('codex', { type: 'stdio', command: codexPath, args: ['mcp-server'], env: {} }, onLine);
    return { ok: true, via: 'config', command: codexPath };
  } catch (e) {
    return { ok: false, tail: `CLI(${r.tail}) / 직접 기록(${e.message}) 모두 실패` };
  }
}

// QR Agent Studio (qrcoding) MCP — HTTP 트랜스포트. 팀 에이전트가 QR 생성·합성·스캔 검증
// 도구(create_qr_code, compose_qr_overlay, validate_qr_scanability 등)를 쓸 수 있게 한다.
// 인증은 대시보드 Skills & MCP 패널에서 발급한 API 키를 x-api-key 헤더로. 키 없이도 등록은
// 되지만 무료 한도/공개 기능만 동작한다. URL·키는 설정 → 렌더의 qrcoding 폼에 저장.
const QR_MCP_DEFAULT_URL = 'https://qrcoding-skill-mcp.vercel.app/mcp';
async function registerQrMcp(onLine) {
  const secrets = require('./secrets');
  const c = secrets.get('qrcoding');
  const url = (c.url || QR_MCP_DEFAULT_URL).trim();
  // 재등록 = 갱신 — 기존 항목을 지우고 현재 URL·키로 다시 추가한다 (없으면 조용히 실패)
  await runCmd('claude', ['mcp', 'remove', '-s', 'user', 'qrcoding'], null, { timeoutMs: 30000 });
  const args = ['mcp', 'add', '-s', 'user', '--transport', 'http', 'qrcoding', url];
  if (c.apiKey) args.push('--header', `x-api-key: ${c.apiKey}`);
  const r = await runCmd('claude', args, onLine, { timeoutMs: 60000 });
  if (r.ok) return { ok: true, via: 'cli', url, authed: !!c.apiKey };

  onLine && onLine('claude CLI 등록 실패 — ~/.claude.json에 직접 기록합니다.');
  try {
    writeMcpServerConfig('qrcoding', {
      type: 'http', url,
      ...(c.apiKey ? { headers: { 'x-api-key': c.apiKey } } : {}),
    }, onLine);
    return { ok: true, via: 'config', url, authed: !!c.apiKey };
  } catch (e) {
    return { ok: false, tail: `CLI(${r.tail}) / 직접 기록(${e.message}) 모두 실패` };
  }
}

async function installIma2(onLine) {
  if (resolveCmd('ima2')) return { ok: true, already: true };
  const node = await cliVersion('node');
  if (!node.found) {
    return { ok: false, needNode: true, tail: 'Node.js가 없습니다 — https://nodejs.org 에서 LTS 설치 후 다시 시도하세요.' };
  }
  onLine && onLine('npm으로 ima2-gen 설치 중…');
  return runCmd('npm', ['install', '-g', 'ima2-gen'], onLine, { timeoutMs: 300000 });
}

// 영상 렌더 에이전트 스킬 — 코딩 에이전트(코덱스/클로드)가 코드로 영상을 짜서 로컬 렌더한다.
// HyperFrames(HTML, Apache-2.0)를 기본, Remotion(React, 최고 품질)을 고급 레인으로 설치.
// `npx skills add`(vercel-labs/skills)로 ~/.claude/skills에 설치 → 모든 클라이언트 폴더에서 사용.
// 실제 렌더는 Node 22+ 와 ffmpeg 필요(앱 번들 ffmpeg는 앱 전용이라 CLI 렌더는 시스템/프로젝트 ffmpeg 사용).
const VIDEO_SKILLS = [
  { name: 'hyperframes', repo: 'heygen-com/hyperframes', extra: ['--all'], label: 'HyperFrames (HTML, 기본)' },
  { name: 'remotion', repo: 'remotion', extra: [], label: 'Remotion (React, 고급)' },
];
function nodeMajor(versionStr) {
  const m = /v?(\d+)\./.exec(String(versionStr || ''));
  return m ? Number(m[1]) : 0;
}
async function installVideoSkills(onLine) {
  const node = await cliVersion('node');
  if (!node.found) return { ok: false, needNode: true, tail: 'Node.js가 없습니다 — https://nodejs.org 에서 LTS(22+) 설치 후 다시 시도하세요.' };
  const major = nodeMajor(node.version);
  const results = [];
  for (const s of VIDEO_SKILLS) {
    onLine && onLine(`영상 스킬 설치 중: ${s.label} …`);
    // ~/.claude/skills에 설치되도록 홈에서 실행 (npx skills는 CWD의 .claude/skills에 기록)
    const args = ['-y', 'skills', 'add', s.repo, ...s.extra];
    const r = await runCmd('npx', args, onLine, { cwd: HOME, timeoutMs: 300000 });
    results.push({ name: s.name, ok: r.ok, tail: r.ok ? undefined : (r.tail || '').slice(-200) });
  }
  const okCount = results.filter((r) => r.ok).length;
  const nodeWarn = major && major < 22
    ? `설치는 됐지만 현재 Node ${major}입니다 — CLI 영상 렌더에는 Node 22+ 가 필요합니다. https://nodejs.org 에서 22 LTS로 올리세요.`
    : null;
  return { ok: okCount > 0, results, installed: okCount, total: VIDEO_SKILLS.length, nodeMajor: major, nodeWarn };
}
// 공냥 프롬프트 킷 — 이미지 생성 프롬프트를 gpt-image-2 완성 프롬프트로 컴파일하는 스킬.
// 기본 경로: 앱에 번들된 사본(vendor/image-prompt)을 ~/.claude/skills/image-prompt로 복사.
//   → git 미설치·오프라인 PC에서도 항상 설치된다(심볼릭 링크는 윈도우에서 불안정하므로 복사).
// git이 있으면 GitHub 최신본으로 업데이트를 시도하고, 실패/부재 시 번들 사본으로 폴백한다.
// 검증기(check_prompt.mjs) 실행에는 Node 필요.
const IMAGE_KIT_REPO = 'https://github.com/contentscoin/gongnyang-prompt-kit';

// git이 있으면 최신 skills/image-prompt를 받아온다. 성공 시 소스 디렉터리 경로, 실패 시 null.
async function fetchImageKitViaGit(onLine) {
  if (!resolveCmd('git')) return null;
  const vendorDir = path.join(CLAUDE_DIR, 'vendor', 'gongnyang-prompt-kit');
  const skillSrc = path.join(vendorDir, 'skills', 'image-prompt');
  let r;
  if (fs.existsSync(path.join(vendorDir, '.git'))) {
    onLine && onLine('공냥 프롬프트 킷 최신본 확인(git pull) 중…');
    r = await runCmd('git', ['-C', vendorDir, 'pull', '--ff-only'], onLine, { timeoutMs: 120000 });
  } else {
    onLine && onLine('공냥 프롬프트 킷 최신본 받는 중(git clone)…');
    try { fs.mkdirSync(path.dirname(vendorDir), { recursive: true }); } catch { /* 상위 폴더 존재 */ }
    r = await runCmd('git', ['clone', '--depth', '1', IMAGE_KIT_REPO, vendorDir], onLine, { timeoutMs: 300000 });
  }
  return (r.ok && fs.existsSync(skillSrc)) ? skillSrc : null;
}

function copyKit(src, skillDst) {
  fs.mkdirSync(path.join(CLAUDE_DIR, 'skills'), { recursive: true });
  fs.rmSync(skillDst, { recursive: true, force: true });
  fs.cpSync(src, skillDst, { recursive: true });
}

async function installImagePromptKit(onLine) {
  const skillDst = path.join(CLAUDE_DIR, 'skills', 'image-prompt');
  const bundled = payloadPaths().imageKit;
  const hasBundle = bundled && fs.existsSync(path.join(bundled, 'SKILL.md'));
  // 1) 앱 번들 사본으로 즉시 설치(항상 성공·오프라인·git 불필요) — 이게 기본 경로.
  let source = null;
  if (hasBundle) {
    onLine && onLine('번들된 공냥 프롬프트 킷 사본으로 설치합니다.');
    try { copyKit(bundled, skillDst); source = 'bundle'; }
    catch (e) { return { ok: false, tail: '스킬 복사 실패: ' + (e.message || e) }; }
  }
  // 2) git이 (curated 경로에) 있으면 GitHub 최신본으로 덧씌우기 시도 — 실패는 무시(번들 유지).
  //    git이 없거나 오프라인인 PC는 이 단계를 건너뛰므로 네트워크로 멈추지 않는다.
  //    SAT_SKIP_KIT_GIT=1 이면 번들만 사용(테스트·오프라인 강제).
  if (!process.env.SAT_SKIP_KIT_GIT && resolveCmd('git')) {
    try {
      const src = await fetchImageKitViaGit(onLine);
      if (src) { copyKit(src, skillDst); source = 'github'; }
    } catch { /* 최신화 실패 — 번들 사본을 그대로 사용 */ }
  }
  if (!source) {
    return { ok: false, tail: '공냥 프롬프트 킷을 찾지 못했습니다 — 번들 사본이 없고 git으로도 받지 못했습니다.' };
  }
  const node = await cliVersion('node');
  return {
    ok: true, path: skillDst, source,
    validatorReady: node.found,
    nodeWarn: node.found ? null : '검증기(check_prompt.mjs) 실행에는 Node.js가 필요합니다.',
  };
}
function imagePromptKitStatus() {
  return { installed: fs.existsSync(path.join(CLAUDE_DIR, 'skills', 'image-prompt', 'SKILL.md')) };
}

// 설치 여부·렌더 전제 감지 (설정 화면 배지용)
function videoSkillsStatus() {
  const skillsDir = path.join(CLAUDE_DIR, 'skills');
  const has = (frag) => { try { return fs.readdirSync(skillsDir).some((n) => n.toLowerCase().includes(frag)); } catch { return false; } };
  return {
    hyperframes: has('hyperframe'),
    remotion: has('remotion'),
    ffmpeg: !!resolveCmd('ffmpeg'),
  };
}

module.exports = { checkEnvironment, installSkills, installCodexCli, codexOAuthLogin, registerCodexMcp, registerQrMcp, installIma2, installVideoSkills, videoSkillsStatus, installImagePromptKit, imagePromptKitStatus, payloadPaths };
