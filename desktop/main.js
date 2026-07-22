// Social AI Team Desktop — Electron main process
const { app, BrowserWindow, ipcMain, dialog, shell, clipboard, Notification, protocol } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const setup = require('./lib/setup');
const workspace = require('./lib/workspace');
const pipeline = require('./lib/pipeline');
const fs = require('fs');
const os = require('os');
const config = require('./lib/config');
const chat = require('./lib/chat');
const board = require('./lib/board');
const gates = require('./lib/gates');
const publishlog = require('./lib/publishlog');
const applog = require('./lib/applog');
const locks = require('./lib/lock');
const history = require('./lib/history');
const chatlog = require('./lib/chatlog');
const autopilot = require('./lib/autopilot');
const proc = require('./lib/proc');
const secrets = require('./lib/secrets');
const render = require('./lib/render');
const pubdirect = require('./lib/pubdirect');
const opencrabBindings = require('./lib/opencrab-bindings');
const visualAssets = require('./lib/visual-assets');
const orchestrator = require('./lib/orchestrator');
const schema = require('./lib/schema');
const backup = require('./lib/backup');
const runreport = require('./lib/runreport');
const variants = require('./lib/variants');
const comments = require('./lib/comments');
const slidevideorender = require('./lib/slidevideorender');
const slidevideo = require('./lib/slidevideo');
const htmlslide = require('./lib/htmlslide');
const ffmpegResolver = require('./lib/ffmpeg');

// 중복 실행 방지 — 두 인스턴스가 settings/gates/clients.json을 서로 밟는다
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win && !win.isDestroyed()) { if (win.isMinimized()) win.restore(); win.focus(); }
  });
}
// Windows 토스트 알림에 필요 (electron-builder appId와 동일해야 함)
app.setAppUserModelId('kr.contentscoin.socialaiteam');
// sat:// 커스텀 스킴 — ready 이전에 권한 등록해야 <img src="sat://..."> 가 동작한다
try {
  protocol.registerSchemesAsPrivileged([{
    scheme: 'sat',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: true,
      corsEnabled: true,
    },
  }]);
} catch { /* already registered in reload */ }
// 앱 종료 시 실행 중인 CLI 자식들을 고아로 남기지 않는다
app.on('before-quit', () => {
  try { pipeline.stopCurrent(); } catch { /* gone */ }
  try { chat.stopCurrent(); } catch { /* gone */ }
  try { proc.killAll(); } catch { /* gone */ }
});

// ---- 프로세스 레벨 오류는 파일 + 렌더러 로그로 남긴다 (조용한 죽음 금지) ----------
process.on('uncaughtException', (e) => {
  applog.write('main-crash', (e && e.stack) || String(e));
  if (win && !win.isDestroyed()) {
    try { send('log', { source: 'main-error', line: '메인 프로세스 예외: ' + (e && e.message || e) }); } catch { /* window gone */ }
  } else {
    try { dialog.showErrorBox('Social AI Team — 내부 오류', String(e && e.stack || e).slice(0, 1000)); } catch { /* headless */ }
  }
});
process.on('unhandledRejection', (e) => {
  applog.write('main-rejection', (e && e.stack) || String(e));
  try { send('log', { source: 'main-error', line: '메인 프로세스 unhandled rejection: ' + (e && e.message || e) }); } catch { /* window gone */ }
});

// 실패를 {ok:false, error}로 정규화 — IPC reject가 렌더러 상태를 어긋내지 않게
const safe = (fn) => async (...a) => {
  try { return await fn(...a); }
  catch (e) {
    applog.write('ipc-error', (e && e.stack) || String(e));
    return { ok: false, error: String(e && e.message || e) };
  }
};

let autoUpdater = null;
try { ({ autoUpdater } = require('electron-updater')); } catch { /* dep missing in dev */ }

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1380,
    height: 860,
    minWidth: 1180,
    minHeight: 680,
    title: 'Social AI Team',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  // 워크스페이스 파일에서 온 링크가 앱 창을 원격 페이지로 끌고 가지 못하게 —
  // window.api(IPC 전체)가 붙은 창에서의 원격 내비게이션은 곧 원격 코드에 CLI 실행 권한
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win.webContents.getURL()) {
      e.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    }
  });
  win.on('closed', () => { win = null; });
  // 렌더러가 죽거나 멈추면 백지 창으로 방치하지 않는다
  win.webContents.on('render-process-gone', (_e, details) => {
    applog.write('renderer-gone', JSON.stringify(details));
    if (win && !win.isDestroyed()) win.webContents.reload();
  });
  win.on('unresponsive', () => applog.write('renderer-unresponsive', 'window unresponsive'));
}

app.whenReady().then(() => {
  applog.write('boot', `v${app.getVersion()} ${process.platform}/${process.arch} electron ${process.versions.electron}`);
  // sat:// — 워크스페이스 이미지/영상을 렌더러 <img>/<video>로 직접 서빙.
  // registerFileProtocol만 사용 (protocol.handle + Response 는 일부 Electron/Windows에서 기동·로드 오류).
  protocol.registerFileProtocol('sat', (req, cb) => {
    try {
      const u = new URL(req.url);
      const dir = decodeURIComponent(u.searchParams.get('d') || '');
      const rel = decodeURIComponent(u.searchParams.get('p') || '').replace(/\\/g, '/');
      const root = path.resolve(dir);
      const norm = (p) => (process.platform === 'win32' ? path.resolve(p).toLowerCase() : path.resolve(p));
      const known = workspace.listClients().some((c) => norm(c.dir) === norm(root));
      const abs = path.resolve(root, rel);
      const relToRoot = path.relative(root, abs);
      const escaped = !relToRoot || relToRoot.startsWith('..') || path.isAbsolute(relToRoot);
      if (!known || escaped || !/\.(png|jpe?g|webp|gif|mp4|webm)$/i.test(abs) || !fs.existsSync(abs)) {
        cb({ error: -10 });
        return;
      }
      cb({ path: abs });
    } catch {
      cb({ error: -2 });
    }
  });
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  initAutoUpdate();
  // 스키마 마이그레이션 — 스케줄러가 큐 파일을 읽기 전에. 실패가 부팅을 막지 않는다.
  try {
    const rep = schema.migrateAll(workspace.listClients().map((c) => c.dir));
    const changed = rep.filter((r) => r.result === 'stamped' || r.result === 'migrated');
    if (changed.length) applog.write('schema', `${changed.length}개 파일 스탬프/마이그레이션: ` + changed.map((r) => r.key).join(', '));
  } catch (e) { applog.write('schema', '마이그레이션 실패: ' + String(e && e.message || e)); }
  pubdirect.startScheduler({ send, notify, pushBoard: () => pushBoard() });
}).catch((e) => {
  applog.write('boot-fail', (e && e.stack) || String(e));
  try { dialog.showErrorBox('Social AI Team 시작 실패', String(e && e.message || e)); } catch { /* headless */ }
  app.quit();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

const send = (channel, payload) => {
  if (channel === 'log' && payload) applog.write(payload.source || 'log', payload.line || '');
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
};

// OS 알림 — 창이 포커스를 잃은 동안 끝난 장시간 작업을 놓치지 않게
function notify(title, body) {
  try {
    if (win && !win.isDestroyed() && win.isFocused()) return; // 보고 있으면 토스트로 충분
    if (Notification.isSupported()) new Notification({ title, body: String(body || '').slice(0, 140) }).show();
  } catch { /* 알림 실패는 치명적이지 않다 */ }
}

// 월 예산 임계 알림 — 비용이 80%/100% 선을 넘는 순간 1회씩만 울린다
function budgetNotify(dir, prevCost) {
  try {
    const budgetUsd = config.getBudget();
    if (!budgetUsd) return;
    const now = history.monthCost(dir);
    for (const [ratio, label] of [[1, '초과'], [0.8, '80% 도달']]) {
      const line = budgetUsd * ratio;
      if (prevCost < line && now >= line) {
        notify(`월 API 예산 ${label}`, `이번 달 $${now} / 예산 $${budgetUsd} — 렌더·Codex 비용은 미집계라 실제 지출은 더 클 수 있습니다`);
        break;
      }
    }
  } catch { /* 알림 실패는 치명적이지 않다 */ }
}

// ---- 렌더러 오류 수집 + 로그 파일 접근 --------------------------------------------
ipcMain.handle('app:log', (_e, source, line) => { applog.write(source, line); return { ok: true }; });
ipcMain.handle('app:openLogs', () => { shell.openPath(applog.DIR); return { ok: true }; });
ipcMain.handle('app:copyLogs', () => {
  const t = applog.tail();
  clipboard.writeText(t);
  return { ok: true, chars: t.length };
});

// ---- Auto update (electron-updater ← GitHub Releases) -----------------------
// social-ai-team-custom 은 private 저장소라 releases.atom 이 토큰 없이 404 난다.
// 해결: (A) 저장소를 Public 으로 두거나 (B) 설정→업데이트에 GitHub PAT(repo) 저장.
const UPDATE_FEED = {
  provider: 'github',
  owner: 'contentscoin',
  repo: 'social-ai-team-custom',
  private: true,
};

function updateToken() {
  const fromSecrets = (secrets.get('github') || {}).token;
  const fromEnv = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  return String(fromSecrets || fromEnv || '').trim() || null;
}

function explainUpdateError(raw) {
  const msg = String(raw || '');
  if (/releases\.atom|authentication token|404/i.test(msg)) {
    return '비공개 저장소 업데이트 피드에 접근하지 못했습니다. '
      + '저장소를 Public으로 바꾸거나, 설정→업데이트에 GitHub PAT(repo 권한)를 넣으세요. '
      + '수동 설치: https://github.com/contentscoin/social-ai-team-custom/releases';
  }
  return msg.slice(0, 300);
}

function configureAutoUpdaterFeed() {
  if (!autoUpdater) return { ok: false, reason: 'no-updater' };
  const token = updateToken();
  try {
    if (token) {
      // Private 저장소: GitHub API + PAT
      autoUpdater.setFeedURL({ ...UPDATE_FEED, private: true, token });
      return { ok: true, mode: 'private', hasToken: true };
    }
    // Public 저장소면 releases.atom 으로 동작. Private면 404 → 안내.
    autoUpdater.setFeedURL({
      provider: UPDATE_FEED.provider,
      owner: UPDATE_FEED.owner,
      repo: UPDATE_FEED.repo,
      private: false,
    });
    return { ok: true, mode: 'public', hasToken: false };
  } catch (e) {
    applog.write('update-feed', String(e && e.message || e));
    return { ok: false, reason: String(e && e.message || e) };
  }
}

function initAutoUpdate() {
  if (!autoUpdater || !app.isPackaged) return; // dev run or dep missing
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  configureAutoUpdaterFeed();
  autoUpdater.on('checking-for-update', () => send('update', { state: 'checking' }));
  autoUpdater.on('update-available', (i) => send('update', { state: 'available', version: i.version }));
  autoUpdater.on('update-not-available', () => send('update', { state: 'latest', version: app.getVersion() }));
  autoUpdater.on('download-progress', (p) => send('update', { state: 'downloading', percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (i) => send('update', { state: 'ready', version: i.version }));
  autoUpdater.on('error', (e) => {
    const raw = String(e && e.message || e);
    const message = explainUpdateError(raw);
    applog.write('update-error', message);
    send('update', {
      state: 'error',
      message,
      code: /releases\.atom|404|token/i.test(raw) ? 'private-feed' : 'other',
    });
  });
  // macOS unsigned builds cannot apply updates (Squirrel requires a signature) — the
  // error handler above surfaces that instead of crashing.
  autoUpdater.checkForUpdates().catch(() => {});
  setInterval(() => {
    configureAutoUpdaterFeed();
    autoUpdater.checkForUpdates().catch(() => {});
  }, 6 * 3600 * 1000); // 장시간 켜둔 앱도 갱신
}
ipcMain.handle('update:version', () => app.getVersion());
ipcMain.handle('update:check', async () => {
  if (!autoUpdater) return { ok: false, state: 'error', message: 'updater unavailable (dev run)' };
  if (!app.isPackaged) {
    const msg = '개발 실행(npm start)에서는 자동 업데이트가 동작하지 않습니다. 설치본에서 확인하세요.';
    send('update', { state: 'error', message: msg, code: 'dev' });
    return { ok: false, state: 'error', message: msg, code: 'dev' };
  }
  const feed = configureAutoUpdaterFeed();
  send('update', { state: 'checking', hasToken: !!feed.hasToken });
  try {
    const result = await Promise.race([
      autoUpdater.checkForUpdates(),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('업데이트 확인 시간 초과(20초). PAT 권한·네트워크를 확인하세요.')), 20000);
      }),
    ]);
    const remote = result && result.updateInfo && result.updateInfo.version;
    const cur = app.getVersion();
    if (remote && String(remote) !== String(cur)) {
      send('update', { state: 'available', version: remote });
      return { ok: true, state: 'available', version: remote, current: cur };
    }
    send('update', { state: 'latest', version: cur });
    return { ok: true, state: 'latest', version: cur };
  } catch (e) {
    const message = explainUpdateError(e && e.message || e);
    const code = /releases\.atom|404|token|시간 초과/i.test(String(e && e.message || e)) ? 'private-feed' : 'other';
    send('update', { state: 'error', message, code });
    return { ok: false, state: 'error', message, code };
  }
});
ipcMain.handle('update:install', () => { if (autoUpdater) autoUpdater.quitAndInstall(); });
ipcMain.handle('update:openReleases', () => {
  shell.openExternal('https://github.com/contentscoin/social-ai-team-custom/releases');
  return { ok: true };
});
ipcMain.handle('update:status', () => ({
  version: app.getVersion(),
  packaged: app.isPackaged,
  hasToken: !!updateToken(),
  feed: UPDATE_FEED,
}));

// ---- Setup wizard ----------------------------------------------------------
ipcMain.handle('setup:check', safe(() => setup.checkEnvironment()));
ipcMain.handle('setup:installSkills', safe(() => setup.installSkills()));
ipcMain.handle('setup:installCodex', safe(() => setup.installCodexCli((line) => send('log', { source: 'setup', line }))));
ipcMain.handle('setup:codexLogin', safe(() => setup.codexOAuthLogin((line) => send('log', { source: 'setup', line }))));
ipcMain.handle('setup:registerMcp', safe(async () => {
  const r = await setup.registerCodexMcp((line) => send('log', { source: 'setup', line }));
  channelCache = { at: 0, data: null }; // ~/.claude.json changed — re-detect channel connections
  return r;
}));
ipcMain.handle('setup:registerQrMcp', safe(() => setup.registerQrMcp((line) => send('log', { source: 'setup', line }))));
ipcMain.handle('setup:installIma2', safe(() => setup.installIma2((line) => send('log', { source: 'setup', line }))));
ipcMain.handle('setup:ima2Setup', safe(() => pipeline.openInteractiveTerminal(app.getPath('home'), 'ima2 setup')));
ipcMain.handle('setup:installVideoSkills', safe(() => setup.installVideoSkills((line) => send('log', { source: 'setup', line }))));
ipcMain.handle('setup:videoSkillsStatus', safe(() => setup.videoSkillsStatus()));
ipcMain.handle('setup:installImagePromptKit', safe(() => setup.installImagePromptKit((line) => send('log', { source: 'setup', line }))));
ipcMain.handle('setup:imagePromptKitStatus', safe(() => setup.imagePromptKitStatus()));

// ---- Workspace (clients) ---------------------------------------------------
ipcMain.handle('ws:list', safe(() => workspace.listClients()));
ipcMain.handle('ws:create', safe((_e, name) => workspace.createClient(name)));
ipcMain.handle('ws:pickFolder', safe(async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] });
  return r.canceled ? null : workspace.addExisting(r.filePaths[0]);
}));
ipcMain.handle('ws:status', safe((_e, dir) => (dir ? workspace.readStatus(dir) : { statusItems: [], statusRaw: '' })));
ipcMain.handle('ws:outputs', safe((_e, dir) => workspace.listOutputs(dir)));
ipcMain.handle('ws:readFile', safe((_e, dir, rel) => workspace.readOutputFile(dir, rel)));
ipcMain.handle('ws:readImage', safe((_e, dir, rel, maxEdge) => workspace.readImagePreview(dir, rel, maxEdge || 720)));
ipcMain.handle('ws:openFolder', (_e, dir) => shell.openPath(dir));
ipcMain.handle('ws:board', (_e, dir) => {
  try { return board.buildBoard(dir); }
  catch (e) { return { hasCalendar: false, posts: [], stages: board.STAGES, channels: [], lanes: {}, foundation: {}, compliance: { pass: 0, warn: 0, block: 0 }, error: String(e && e.message || e) }; }
});

// ---- Live board: watch the client folder, push board updates -----------------
let watchers = [];
let watchedPaths = new Set();
let watchDir = null;
let watchTimer = null;
let building = false;
function pushBoard() {
  if (!watchDir || building) return;
  building = true;
  try { send('board:update', { dir: watchDir, board: board.buildBoard(watchDir) }); } catch { /* transient fs state */ }
  building = false;
}
function addWatch(p, handler) {
  if (watchedPaths.has(p)) return;
  try {
    const w = fs.watch(p, handler);
    w.on('error', (e) => {
      applog.write('watch-error', p + ': ' + (e && e.message || e));
      try { w.close(); } catch { /* gone */ }
      watchedPaths.delete(p);
      setTimeout(() => { if (watchDir && p.startsWith(watchDir)) addWatch(p, handler); }, 3000); // 재장전 시도
    });
    watchers.push(w);
    watchedPaths.add(p);
  } catch { /* unwatchable */ }
}
function rescanSubdirs(parent) {
  try {
    for (const sub of fs.readdirSync(parent)) {
      const p = path.join(parent, sub);
      try { if (fs.statSync(p).isDirectory()) addWatch(p, onFsEvent); } catch { /* skip */ }
    }
  } catch { /* gone */ }
}
function onFsEvent() {
  clearTimeout(watchTimer);
  watchTimer = setTimeout(pushBoard, 500);
}
ipcMain.handle('ws:watch', (_e, dir) => {
  clearTimeout(watchTimer);
  for (const w of watchers) { try { w.close(); } catch { /* gone */ } }
  watchers = []; watchedPaths = new Set();
  watchDir = dir;
  if (!dir) return { ok: true, watching: false };
  const targets = [path.join(dir, 'outputs'), path.join(dir, 'context')];
  // 재귀 워처가 에러로 죽으면(EPERM, 폴더 재생성 등) 3초 후 재장전 — 보드가 조용히 멎지 않게
  const armRecursive = (t) => {
    try { fs.mkdirSync(t, { recursive: true }); } catch { /* exists */ }
    const w = fs.watch(t, { recursive: true }, onFsEvent);
    w.on('error', (e) => {
      applog.write('watch-error', t + ': ' + (e && e.message || e));
      try { w.close(); } catch { /* gone */ }
      const i = watchers.indexOf(w);
      if (i >= 0) watchers.splice(i, 1);
      setTimeout(() => {
        if (watchDir !== dir) return; // 이미 다른 워크스페이스로 이동
        try { watchers.push(armRecursive(t)); pushBoard(); } catch { /* 다음 에러 때 재시도 */ }
      }, 3000);
    });
    return w;
  };
  for (const t of targets) {
    try { fs.mkdirSync(t, { recursive: true }); } catch { /* exists */ }
    try {
      watchers.push(armRecursive(t));
    } catch {
      // Linux: no recursive watch — watch parent + subdirs, rescan for lanes created later
      addWatch(t, () => { rescanSubdirs(t); onFsEvent(); });
      rescanSubdirs(t);
    }
  }
  return { ok: true, watching: watchers.length > 0 };
});

// ---- Gates (approval stamps) ---------------------------------------------------
ipcMain.handle('gates:get', (_e, dir) => {
  try { return gates.computeGates(board.buildBoard(dir), gates.load(dir)); }
  catch (e) { return { nodes: [], current: 0, approvals: [], error: String(e && e.message || e) }; }
});
ipcMain.handle('gates:approve', (_e, dir, entry) => {
  try {
    const b = board.buildBoard(dir);
    gates.approve(dir, { ...entry, calendarHash: b.calendarHash });
    return gates.computeGates(b, gates.load(dir));
  } catch (e) { return { nodes: [], current: 0, approvals: [], error: String(e && e.message || e) }; }
});

// ---- Manual publish (네이버 등) --------------------------------------------------
ipcMain.handle('pub:mark', safe((_e, dir, uid, on) => {
  const r = publishlog.mark(dir, uid, on);
  setTimeout(pushBoard, 200);
  return { ok: true, ...r };
}));
// 레인의 모든 텍스트 파일을 스캔해 해당 포스트의 블록을 찾는다 (복사·직접 발행 초안·프롬프트 컴파일 공용).
const { findPostBlock, draftForPublish } = require('./lib/postblock');
ipcMain.handle('pub:copy', safe((_e, dir, lane, topic) => {
  // 클립보드에는 게시용 본문만 (VISUAL DIRECTION·메타 제외)
  const r = draftForPublish(dir, lane, topic);
  if (!r.ok) return r;
  clipboard.writeText(r.text);
  return { ok: true, chars: r.text.length, file: r.file, title: r.title || null };
}));

// ---- 댓글 확인 + 맥락 답글 — 초안 → 운영자 검토 → 게시 (자동 게시 없음) ------------
ipcMain.handle('cmt:list', safe((_e, dir, uid) => comments.fetchComments(dir, uid)));
ipcMain.handle('cmt:draft', async (_e, dir, payload) => {
  const lock = locks.acquire(dir, 'reply');
  if (!lock.ok) return { ok: false, error: locks.busyMessage(dir) };
  const startedAt = Date.now();
  try {
    const r = await comments.draftReply(dir, payload || {}, (line) => send('log', { source: 'reply', line, dir }));
    const prevCost = history.monthCost(dir);
    history.append({
      dir, kind: 'stage', stage: 'reply-draft', engine: 'claude', model: config.getModels().claude,
      ok: !!r.ok, ms: Date.now() - startedAt, costUsd: typeof r.costUsd === 'number' ? r.costUsd : undefined,
      startedAt, note: String((payload && payload.comment) || '').slice(0, 60),
    });
    budgetNotify(dir, prevCost);
    return r;
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  } finally { locks.release(dir, 'reply'); }
});
ipcMain.handle('cmt:reply', safe((_e, dir, payload) => comments.postReply(dir, payload || {})));

// ---- 직접 발행 (Blotato 대체) ------------------------------------------------------
// 발행 초안 — CAPTION/POST COPY/BODY만 추출, VISUAL DIRECTION·프롬프트 메타 제거.
// 운영자가 발행 전에 textarea에서 최종 확인·수정한다 (사람 게이트).
ipcMain.handle('pub2:draft', safe((_e, dir, lane, topic) => draftForPublish(dir, lane, topic)));
ipcMain.handle('pub2:status', safe(() => pubdirect.status()));
ipcMain.handle('pub2:publishNow', safe(async (_e, dir, payload) => {
  const r = await pubdirect.publishNow(dir, payload);
  if (r.ok) { send('log', { source: 'publish', line: `✔ ${payload.channel} 발행 — ${r.url || r.id || 'ok'}`, dir }); setTimeout(pushBoard, 300); }
  else send('log', { source: 'publish', line: `✖ ${payload.channel} 발행 실패 — ${r.error}`, dir });
  return r;
}));
ipcMain.handle('pub2:schedule', safe((_e, dir, payload) => pubdirect.schedule(dir, payload)));
ipcMain.handle('pub2:queue', safe((_e, dir) => pubdirect.listQueue(dir)));
ipcMain.handle('pub2:cancel', safe((_e, dir, qid) => pubdirect.cancel(dir, qid)));
ipcMain.handle('pub2:test', safe((_e, channel) => pubdirect.test(channel)));

// ---- Channel connection check (직접 발행 토큰 + 레거시 Blotato MCP) -----------------
let channelCache = { at: 0, data: null };
ipcMain.handle('channels:check', () => {
  if (channelCache.data && Date.now() - channelCache.at < 10 * 60 * 1000) return channelCache.data;
  let blotato = false;
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.claude.json'), 'utf8'));
    blotato = Object.keys(cfg.mcpServers || {}).some((k) => /blotato/i.test(k));
  } catch { /* no config */ }
  channelCache = { at: Date.now(), data: { blotato, direct: pubdirect.status() } };
  return channelCache.data;
});
// 토큰 저장 시 채널 캐시 무효화 — 배지가 바로 갱신되게
ipcMain.handle('sec:invalidateChannels', () => { channelCache = { at: 0, data: null }; return { ok: true }; });

// ---- Pipeline stages -------------------------------------------------------
const autovisual = require('./lib/autovisual');
const imagestyles = require('./lib/imagestyles');
const postassets = require('./lib/postassets');
const channelsheets = require('./lib/channelsheets');
const engine = require('./lib/engine');
const channelRegistry = require('./lib/channels');
// 워크스페이스별 비주얼 렌더 중단 플래그 — 프로세스 전역 하나면 다른 dir의 렌더를 함께 죽인다.
const renderStops = new Map(); // dir → true(중단 요청)
const stopRender = (dir) => { if (dir) renderStops.set(dir, true); };
const armRender = (dir) => { renderStops.set(dir, false); };
const isRenderStopped = (dir) => renderStops.get(dir) === true;
// ima2 설치 여부 힌트 — 렌더 프로바이더 기본값 선택에 필요 (동기 바이너리 확인).
// checkEnvironment()는 async라 여기선 쓸 수 없다 — proc.resolveCmd로 동기 감지.
function envHint() {
  let ima2 = false;
  try { ima2 = !!proc.resolveCmd('ima2'); } catch { /* PATH 밖 */ }
  return { ima2 };
}

// ffmpeg 인코딩 1회 — concat 스크립트/인자를 받아 mp4를 만든다.
function encodeOne(ffmpegPath, args) {
  return new Promise((resolve) => {
    let child;
    try { child = spawn(ffmpegPath, args, { env: proc.envWithPath() }); }
    catch (e) { return resolve({ ok: false, error: String(e && e.message || e) }); }
    let err = '';
    child.stderr && child.stderr.on('data', (d) => { err += d.toString(); if (err.length > 4000) err = err.slice(-4000); });
    child.on('error', (e) => resolve({ ok: false, error: String(e && e.message || e) }));
    child.on('close', (code) => resolve(code === 0 ? { ok: true } : { ok: false, error: (err.slice(-300) || `ffmpeg exit ${code}`) }));
  });
}

// 오프스크린 창(내장 Chromium) 하나를 만들어 재사용한다 — 슬라이드마다 loadURL, 프레임마다 seek·캡처.
const FRAME_SETTLE_MS = 14; // seek 후 컴포지터가 페인트할 시간
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function makeOffscreenWin(w, h) {
  const win = new BrowserWindow({
    width: w, height: h, show: false, useContentSize: true,
    webPreferences: { offscreen: true, sandbox: true, javascript: true },
  });
  try { win.webContents.setFrameRate(60); } catch { /* 구버전 electron */ }
  return win;
}

// 매니페스트 1건: 슬라이드마다 HTML을 프레임 단위로 seek·캡처(하이퍼프레임 애니메이션) →
// 전역 프레임 시퀀스(frame-%06d.png) → ffmpeg 고정 fps 인코딩 → mp4. 텍스트만으로도 렌더된다.
async function renderOneManifest(dir, rel, ff, onLine) {
  const base = path.resolve(dir);
  const manAbs = path.resolve(dir, rel);
  if (!manAbs.startsWith(base + path.sep)) return { ok: false, error: '워크스페이스 밖 경로' };
  let m;
  try { m = JSON.parse(fs.readFileSync(manAbs, 'utf8')); } catch { return { ok: false, error: '매니페스트 JSON 파싱 실패' }; }
  const v = slidevideo.validateManifest(m);
  if (!v.ok) return { ok: false, error: '계약 위반: ' + v.errors.join('; ') };
  const [w, h] = slidevideo.ASPECTS[m.aspect] || slidevideo.ASPECTS['9:16'];
  const baseName = path.basename(manAbs).replace(/\.json$/i, '');
  const framesDir = path.join(path.dirname(manAbs), `.${baseName}.frames`);
  try { fs.rmSync(framesDir, { recursive: true, force: true }); } catch { /* 없음 */ }
  fs.mkdirSync(framesDir, { recursive: true });
  const plan = slidevideo.framePlan(m);
  try {
    const win = await makeOffscreenWin(w, h);
    let g = 0;
    try {
      for (let i = 0; i < m.slides.length; i++) {
        if (isRenderStopped(dir)) return { ok: false, error: '중단됨' };
        const s = m.slides[i];
        // 배경 이미지(선택)를 워크스페이스 안에서만 해석
        let imgAbs = null;
        if (s.image && s.image.rel) {
          const a = path.resolve(dir, s.image.rel);
          if (a.startsWith(base + path.sep) && fs.existsSync(a)) imgAbs = a;
        }
        const html = htmlslide.slideHtml(
          { head: s.head, sub: s.sub, kicker: s.kicker, bullets: s.bullets, role: s.role, motion: s.motion, transition: s.transition, image: imgAbs ? { abs: imgAbs } : null },
          { aspect: m.aspect, brand: m.brand || {}, index: i + 1, total: m.slides.length });
        await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
        await sleep(320); // 폰트·이미지·레이아웃 안정화(슬라이드당 1회)
        const N = plan.perSlide[i] || 1;
        let lastPng = null;
        for (let f = 0; f < N; f++) {
          if (isRenderStopped(dir)) return { ok: false, error: '중단됨' };
          const p = N <= 1 ? 0 : f / (N - 1);
          try {
            await win.webContents.executeJavaScript(`window.__seek(${p})`);
            await sleep(FRAME_SETTLE_MS);
            lastPng = (await win.webContents.capturePage()).toPNG();
          } catch { /* 캡처 실패 시 직전 프레임 재사용 */ }
          if (!lastPng) continue;
          g++;
          fs.writeFileSync(path.join(framesDir, `frame-${String(g).padStart(6, '0')}.png`), lastPng);
        }
        onLine && onLine(`[슬라이드 영상] 씬 ${i + 1}/${m.slides.length} — ${N}프레임`);
      }
    } finally { try { win.destroy(); } catch { /* gone */ } }
    if (!g) return { ok: false, error: '캡처된 프레임이 없습니다' };
    const pattern = path.join(framesDir, 'frame-%06d.png');
    const outAbs = path.join(dir, 'outputs', 'videos', `${baseName}.mp4`);
    let audioAbs = null;
    if (m.audio && m.audio.audioFile) {
      const a = path.resolve(dir, m.audio.audioFile);
      if (a.startsWith(base + path.sep) && fs.existsSync(a)) audioAbs = a;
    }
    const args = slidevideo.buildFramesFfmpegArgs(m, { framePattern: pattern, outPath: outAbs, audioPath: audioAbs, startNumber: 1 });
    const r = await encodeOne(ff.path, args);
    return r.ok ? { ok: true, outRel: path.join('outputs', 'videos', `${baseName}.mp4`).replace(/\\/g, '/') } : { ok: false, error: r.error };
  } finally {
    try { fs.rmSync(framesDir, { recursive: true, force: true }); } catch { /* best effort */ }
  }
}

// 워크스페이스의 모든 slide-video 매니페스트를 mp4로 렌더. ffmpeg 부재 시 건너뛴다(발행은 사람 승인).
async function renderSlideVideos(dir, onLine) {
  const manifests = slidevideorender.listManifests(dir);
  if (!manifests.length) return { ok: true, rendered: 0, total: 0, note: '슬라이드 영상 매니페스트 없음' };
  const ff = ffmpegResolver.resolve();
  if (!ff.path) {
    onLine && onLine('[슬라이드 영상] ffmpeg가 없어 mp4 인코딩을 건너뜁니다 — 매니페스트까지 준비됨. (설치본은 ffmpeg 번들, 개발 실행은 npm install 후 ffmpeg-static)');
    return { ok: true, rendered: 0, total: manifests.length, note: 'ffmpeg 없음 — 인코딩 생략', needsFfmpeg: true };
  }
  let rendered = 0; const skipped = [];
  for (const rel of manifests) {
    if (isRenderStopped(dir)) break;
    onLine && onLine(`[슬라이드 영상] 렌더 중 (HTML→${ff.source}) → ${rel}`);
    let r;
    try { r = await renderOneManifest(dir, rel, ff, onLine); }
    catch (e) { r = { ok: false, error: String(e && e.message || e) }; }
    if (r.ok) { rendered++; onLine && onLine(`[슬라이드 영상] 완료 → ${r.outRel}`); }
    else { skipped.push(`${rel}: ${r.error}`); onLine && onLine(`[슬라이드 영상] 실패 — ${r.error}`); }
  }
  return { ok: true, rendered, total: manifests.length, skipped, source: ff.source };
}

// 공용 실행기 — 수동 실행(pipe:runStage)과 오토파일럿이 같은 계측(이벤트/기록/알림)을 쓴다.
// 잠금은 호출자 책임: 수동은 'stage', 오토파일럿은 런 전체에 'autopilot'을 잡고 들어온다.
async function execStage(dir, stage, opts) {
  const startedAt = Date.now();
  const before = runreport.snapshot(dir); // 실행 결과 리포트 — 전후 산출물 비교의 기준점
  send('stage', { state: 'start', stage, startedAt, dir });
  // 모든 종료 경로 공통: 생성·수정 파일과 (컴플라이언스면) 판정 요약을 결과에 첨부하고
  // 렌더러에 'stage:result'로 푸시 — 실행이 끝나면 "무엇이 바뀌었나"가 항상 보이게.
  const finish = (r) => {
    const changes = runreport.diff(before, runreport.snapshot(dir));
    const compliance = stage === 'compliance' ? runreport.complianceSummary(dir) : null;
    const verify = stage === 'verify' ? runreport.verifySummary(dir) : null;
    send('stage:result', {
      dir, stage, ok: !!r.ok, ms: Date.now() - startedAt,
      costUsd: typeof r.costUsd === 'number' ? r.costUsd : undefined,
      changes, compliance, verify, error: r.ok ? null : String(r.tail || '').slice(-200),
    });
    return { ...r, changes, compliance, verify };
  };
  const changeNote = (changes) => `+${changes.created.length}/~${changes.modified.length} 파일`;
  try {
    // visuals-generate 는 앱 렌더 엔진으로 라우팅 — 파이프라인 에이전트는 앱 설정의 키를
    // 못 보기 때문. 앱 엔진은 설정 키를 쓰고 포스트당 여러 장(캐러셀)을 만든다.
    if (stage === 'visuals-generate') {
      armRender(dir);
      const r = await autovisual.renderAll(dir, {
        ...envHint(), count: (opts && opts.count) || 0, style: (opts && opts.style) || config.getImageStyle(),
        stopped: () => isRenderStopped(dir),
      }, (line) => send('log', { source: stage, line, dir }));
      // 슬라이드 이미지가 준비됐으니 slide-video 매니페스트를 mp4로 자동 인코딩(ffmpeg 있으면).
      // 최종 mp4가 생기면 릴 카드가 visual 단계로 전진한다 — 발행은 여전히 사람 승인.
      let sv = { rendered: 0, total: 0 };
      try { sv = await renderSlideVideos(dir, (line) => send('log', { source: stage, line, dir })); } catch { /* 렌더 실패가 단계를 죽이지 않게 */ }
      const svNote = sv.total ? ` · 슬라이드영상 ${sv.rendered}/${sv.total}` : '';
      const fin = finish({ ...r, tail: (r.resultText || r.note || '') + svNote, startedAt });
      history.append({
        dir, kind: 'stage', stage, engine: r.provider || 'render', model: '',
        ok: !!r.ok, ms: Date.now() - startedAt, startedAt, note: `${changeNote(fin.changes)} — ${r.resultText || r.note || ''}`.slice(0, 120),
      });
      if (Date.now() - startedAt > 30_000) notify(`비주얼 생성 ${r.ok ? '완료' : '실패'}`, `${changeNote(fin.changes)} — ${r.resultText || r.note || ''}`.slice(0, 140));
      return fin;
    }
    const r = await pipeline.runStage(dir, stage, opts, (line) => send('log', { source: stage, line, dir }));
    const label = (pipeline.STAGES[stage] || {}).label || stage;
    const fin = finish({ ...r, startedAt });
    const compNote = fin.compliance ? ` · PASS ${fin.compliance.pass}/WARN ${fin.compliance.warn}/BLOCK ${fin.compliance.block}` : '';
    const prevCost = history.monthCost(dir);
    history.append({
      dir, kind: 'stage', stage, engine: 'claude', model: config.getModels().claude,
      ok: !!r.ok, ms: Date.now() - startedAt, costUsd: typeof r.costUsd === 'number' ? r.costUsd : undefined, startedAt,
      note: (changeNote(fin.changes) + compNote).slice(0, 120),
    });
    budgetNotify(dir, prevCost);
    // 30초 넘게 걸린 작업만 OS 알림 — 즉시 끝난 것까지 울리면 소음
    if (Date.now() - startedAt > 30_000) {
      notify(`${label} ${r.ok ? '완료' : '실패'}`, r.ok ? `${changeNote(fin.changes)}${compNote} — 보드에서 확인하세요.` : String(r.tail || '').slice(0, 140));
    }
    return fin;
  } catch (e) {
    return finish({ ok: false, code: -1, out: String(e && e.message || e), tail: String(e && e.message || e), startedAt });
  } finally {
    send('stage', { state: 'end', stage, startedAt, dir });
    setTimeout(pushBoard, 300); // stages write files — refresh the board promptly
  }
}
ipcMain.handle('pipe:runStage', async (_e, dir, stage, opts) => {
  const lock = locks.acquire(dir, 'stage');
  if (!lock.ok) {
    const msg = locks.busyMessage(dir);
    return { ok: false, code: -1, out: msg, tail: msg, startedAt: Date.now() };
  }
  try { return await execStage(dir, stage, opts); }
  finally { locks.release(dir, 'stage'); }
});
ipcMain.handle('pipe:stop', (_e, dir) => { stopRender(dir); return pipeline.stopCurrent(dir); });
// 슬라이드 영상 렌더 — 수동 트리거(전체 매니페스트) 또는 단일 매니페스트 렌더
ipcMain.handle('slidevideo:render', async (_e, dir, manifestRel) => {
  const lock = locks.acquire(dir, 'stage');
  if (!lock.ok) return { ok: false, error: locks.busyMessage(dir) };
  armRender(dir);
  try {
    if (manifestRel) {
      const ff = ffmpegResolver.resolve();
      if (!ff.path) return { ok: false, needsFfmpeg: true, error: 'ffmpeg가 없습니다 — 설치본은 번들됩니다. 개발 실행은 npm install 후 ffmpeg-static이 필요합니다.' };
      const r = await renderOneManifest(dir, manifestRel, ff, (line) => send('log', { source: 'slide-video', line, dir }));
      setTimeout(pushBoard, 300);
      return r.ok ? { ok: true, outRel: r.outRel, source: ff.source } : { ok: false, error: r.error };
    }
    const r = await renderSlideVideos(dir, (line) => send('log', { source: 'slide-video', line, dir }));
    setTimeout(pushBoard, 300);
    return r;
  } finally { locks.release(dir, 'stage'); }
});
ipcMain.handle('slidevideo:list', safe((_e, dir) => slidevideorender.listManifests(dir)));
// 일괄 비주얼 렌더 — "일괄 비주얼 생성" 버튼 (오토파일럿 없이 수동으로 전 포스트 이미지 생성)
ipcMain.handle('render:batch', async (_e, dir, opts) => {
  const lock = locks.acquire(dir, 'stage');
  if (!lock.ok) return { ok: false, error: locks.busyMessage(dir) };
  armRender(dir);
  const startedAt = Date.now();
  send('stage', { state: 'start', stage: 'visuals-generate', startedAt, dir });
  try {
    const style = (opts && opts.style != null) ? opts.style : config.getImageStyle();
    const r = await autovisual.renderAll(dir, { ...envHint(), ...(opts || {}), style, stopped: () => isRenderStopped(dir) }, (line) => send('log', { source: 'visuals-generate', line, dir }));
    history.append({ dir, kind: 'stage', stage: 'visuals-generate', engine: r.provider || 'render', model: '', ok: !!r.ok, ms: Date.now() - startedAt, startedAt, note: r.resultText || r.note });
    return r;
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  } finally {
    locks.release(dir, 'stage');
    send('stage', { state: 'end', stage: 'visuals-generate', startedAt, dir });
    setTimeout(pushBoard, 300);
  }
});
ipcMain.handle('pipe:openTerminal', safe((_e, dir) =>
  pipeline.openInteractiveTerminal(dir, config.getEngine(), (msg) => send('log', { source: 'terminal-error', line: msg, dir }))));

// ---- Autopilot — 승인 게이트 앞까지 자동 진행 -----------------------------------
ipcMain.handle('auto:run', async (_e, dir) => {
  const lock = locks.acquire(dir, 'autopilot');
  if (!lock.ok) return { ok: false, error: locks.busyMessage(dir) };
  const startedAt = Date.now();
  try {
    const r = await autopilot.run(dir, {
      buildBoard: (d) => board.buildBoard(d),
      runStage: (d, s) => execStage(d, s, {}),
      autoApprove: config.getAutopilotAutoApprove(),
      checkBudget: () => {
        const budgetUsd = config.getBudget();
        if (!budgetUsd) return null;
        const monthCost = history.monthCost(dir);
        return { over: monthCost >= budgetUsd, monthCost, budgetUsd };
      },
      onEvent: (ev) => {
        send('auto', ev);
        if (ev.state === 'paused') notify('오토파일럿 대기', ev.message || '승인 도장이 필요합니다.');
        else if (ev.state === 'done') notify('오토파일럿 완료', ev.message || '');
        else if (ev.state === 'failed') notify('오토파일럿 실패', ev.message || '');
      },
    });
    history.append({
      dir, kind: 'autopilot', engine: 'claude', model: config.getModels().claude,
      ok: r.state !== 'failed', ms: Date.now() - startedAt, startedAt,
      note: `${r.state}${r.ran && r.ran.length ? ' — ' + r.ran.join(',') : ''}`,
    });
    return r;
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  } finally { locks.release(dir, 'autopilot'); }
});
ipcMain.handle('auto:stop', (_e, dir) => autopilot.stop(dir, () => { stopRender(dir); pipeline.stopCurrent(dir); }));
ipcMain.handle('auto:status', (_e, dir) => autopilot.status(dir));
// 실행 중인 클라이언트 dir 목록 — 렌더러 백그라운드 배너용
ipcMain.handle('auto:runningDirs', () => autopilot.runningDirs());

// ---- 실행 기록 ----------------------------------------------------------------
ipcMain.handle('hist:list', safe((_e, dir) => history.forDir(dir)));

// ---- 인앱 렌더 엔진 (이미지/영상 실물 생성) ----------------------------------------
const renderInFlight = new Set();
// ---- 시안(variant) 생성·선택 — 여러 안을 만들고 잘 나온 것을 골라 확정하는 워크플로우 ----
// 시안마다 구도 지시를 달리해 서로 다른 안이 나오게 한다 (같은 피사체·팔레트·조명 유지)
const VARIANT_LOOKS = [
  'hero composition - subject centered with generous negative space',
  'dynamic diagonal composition, closer crop, stronger depth of field',
  'editorial mood - top-down or unexpected camera angle',
  'wide environmental shot placing the subject in context',
];
const variantDirective = (k, K) =>
  `\n\n(Proposal ${k} of ${K}: same subject, brand palette and lighting as the brief, but a distinctly different composition — ${VARIANT_LOOKS[(k - 1) % VARIANT_LOOKS.length]}. No text or logos in the image.)`;

ipcMain.handle('render:variants', async (_e, dir, job) => {
  const uid = path.basename(String((job && job.base) || ''));
  if (!uid) return { ok: false, error: '카드 ID가 없습니다' };
  const key = `${dir}::variants::${uid}`;
  if (renderInFlight.has(key)) return { ok: false, error: '이 카드의 시안 생성이 이미 진행 중입니다' };
  renderInFlight.add(key);
  const startedAt = Date.now();
  const K = Math.min(4, Math.max(2, Number(job.variants) || 3));
  try {
    variants.clear(dir, uid); // 새 시안 라운드 — 이전 라운드는 정리
    variants.ensure(dir, uid);
    const files = [];
    let firstErr = null;
    for (let k = 1; k <= K; k++) {
      send('log', { source: 'render', line: `[시안] ${k}/${K}안 생성 중…`, dir });
      const r = await render.generate(dir, {
        kind: 'image', env: envHint(), provider: job.provider, size: job.size,
        negative: job.negative || null, count: 1,
        base: `variants/${uid}/v${k}`,
        prompt: String(job.prompt || '') + variantDirective(k, K),
      });
      if (r && r.ok) files.push(r.rel);
      else { firstErr = firstErr || (r && r.error); send('log', { source: 'render', line: `[시안] ${k}안 실패: ${(r && r.error) || '?'}`, dir }); }
    }
    history.append({
      dir, kind: 'stage', stage: 'render-variants', engine: job.provider, model: '',
      ok: files.length > 0, ms: Date.now() - startedAt, startedAt, note: `${files.length}/${K} 시안 — ${uid}`,
    });
    if (!files.length) return { ok: false, error: firstErr || '시안을 만들지 못했습니다' };
    return { ok: true, files, requested: K };
  } finally { renderInFlight.delete(key); }
});
ipcMain.handle('render:listVariants', safe((_e, dir, uid) => variants.list(dir, uid)));
ipcMain.handle('render:pickVariant', safe((_e, dir, uid, name, slot) => {
  const r = variants.pick(dir, uid, name, slot || 1);
  if (r.ok) setTimeout(pushBoard, 300); // 승격된 파일이 카드 썸네일로 바로 반영되게
  return r;
}));

ipcMain.handle('render:providers', safe((_e, envHint) => render.availability(envHint || {})));
ipcMain.handle('render:generate', async (_e, dir, job) => {
  const key = `${dir}::${job && job.base}`;
  if (renderInFlight.has(key)) return { ok: false, error: '이 카드의 렌더가 이미 진행 중입니다' };
  renderInFlight.add(key);
  const startedAt = Date.now();
  try {
    // refAbs 검증 — 워크스페이스 밖 파일 참조 차단
    if (job && job.refRel) {
      const abs = path.resolve(dir, job.refRel);
      if (!abs.startsWith(path.resolve(dir) + path.sep) || !fs.existsSync(abs)) return { ok: false, error: '참조 이미지를 찾을 수 없습니다' };
      job.refAbs = abs;
    }
    const r = await render.generate(dir, { env: envHint(), ...job }, (line) => send('log', { source: 'render', line, dir }));
    history.append({
      dir, kind: 'stage', stage: `render-${job.kind}`, engine: r.provider || job.provider, model: '',
      ok: !!r.ok, ms: Date.now() - startedAt, startedAt,
      note: (r.fellBackFrom ? `[${r.fellBackFrom}→${r.provider}] ` : '') + (job.prompt || '').slice(0, 60),
    });
    if (r.ok) {
      send('log', { source: 'render', line: `✔ ${r.rel}`, dir });
      if (Date.now() - startedAt > 30_000) notify('렌더 완료', r.rel);
      setTimeout(pushBoard, 300); // 새 파일 → 카드 썸네일 즉시 반영
    }
    return r;
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  } finally { renderInFlight.delete(key); }
});

// ---- 시크릿 (채널 토큰·렌더 키) ---------------------------------------------------
ipcMain.handle('sec:get', safe((_e, ns) => secrets.masked(ns)));
ipcMain.handle('sec:set', safe((_e, ns, values) => secrets.set(ns, values)));

// ---- 프롬프트 컴파일러 + 팩 -------------------------------------------------------
const promptlab = require('./lib/promptlab');
const opencrab = require('./lib/opencrab');
ipcMain.handle('prompt:compile', safe((_e, dir, job) =>
  promptlab.compile(dir, job, (line) => send('log', { source: 'prompt', line, dir }))));
ipcMain.handle('packs:list', safe(() => promptlab.listPacks().map(({ name, file, source, size }) => ({ name, file, source, size }))));
ipcMain.handle('packs:delete', safe((_e, file) => promptlab.deletePack(file)));
ipcMain.handle('oc:search', safe((_e, query) => opencrab.search(query)));
ipcMain.handle('oc:load', safe((_e, pack) => opencrab.load(pack)));
ipcMain.handle('oc:constants', safe(() => opencrabBindings.loadConstants()));
ipcMain.handle('oc:projects', safe(() => opencrabBindings.listProjects()));
ipcMain.handle('oc:runWorkflow', safe((_e, key, args) => opencrabBindings.runWorkflow(key, args || {})));
ipcMain.handle('oc:route', safe((_e, channel) => opencrabBindings.routeForChannel(channel)));

ipcMain.handle('vassets:list', safe((_e, dir) => visualAssets.listAssets(dir)));
ipcMain.handle('vassets:ensure', safe((_e, dir) => { visualAssets.ensureDirs(dir); return { ok: true, dir: visualAssets.assetsDir(dir) }; }));
ipcMain.handle('vassets:ingest', safe((_e, dir, projectName) => visualAssets.ingestVisualAssets(dir, projectName)));

ipcMain.handle('orch:tasks', safe(() => orchestrator.listTasks()));
ipcMain.handle('orch:run', async (_e, dir, taskName, extra) => {
  const lock = locks.acquire(dir, 'stage');
  if (!lock.ok) return { ok: false, error: locks.busyMessage(dir) };
  try {
    const env = await setup.checkEnvironment();
    return await orchestrator.runTask(taskName, dir, {
      env, extra,
      onLine: (line) => send('log', { source: 'orch', line, dir }),
    });
  } finally { locks.release(dir, 'stage'); }
});

// ---- 전략 추출 + OpenCrab 인제스트 -------------------------------------------------
const strategy = require('./lib/strategy');
// 1) 채널별·주제별 전략 문서 생성 (claude, context/strategy/)
ipcMain.handle('strat:extract', async (_e, dir) => {
  const lock = locks.acquire(dir, 'stage');
  if (!lock.ok) return { ok: false, error: locks.busyMessage(dir) };
  const startedAt = Date.now();
  try {
    const r = await strategy.extract(dir, (line) => send('log', { source: 'strategy', line, dir }));
    history.append({ dir, kind: 'stage', stage: 'strategy', engine: 'claude', model: config.getModels().claude, ok: !!r.ok, ms: Date.now() - startedAt, startedAt, note: r.ok ? `${r.count}개 전략` : r.error });
    if (r.ok && Date.now() - startedAt > 30_000) notify('전략 추출 완료', `채널 ${r.channels} · 주제 ${r.topics}`);
    setTimeout(pushBoard, 300);
    return r;
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
  finally { locks.release(dir, 'stage'); }
});
ipcMain.handle('strat:list', safe((_e, dir) => strategy.listStrategies(dir).map(({ file, title, kind, chars }) => ({ file, title, kind, chars }))));
// 2) 전략을 OpenCrab 프로젝트로 인제스트 (발견 기반, 폴백 안내 포함)
ipcMain.handle('strat:ingest', safe(async (_e, dir, projectName) => {
  const items = strategy.listStrategies(dir).map((s) => ({
    text: s.text, title: s.title, source: s.file, kind: s.kind,
    channel: s.kind === 'channel' ? s.title : undefined, topic: s.kind === 'topic' ? s.title : undefined,
  }));
  if (!items.length) return { ok: false, error: '인제스트할 전략 파일이 없습니다 — 먼저 전략 추출을 실행하세요' };
  send('log', { source: 'opencrab', line: `프로젝트 생성 시도: ${projectName} (전략 ${items.length}개)`, dir });
  const proj = await opencrab.createProject(projectName, { category: 'social-strategy' });
  if (proj.unsupported) send('log', { source: 'opencrab', line: `프로젝트 생성 도구 없음 — 발견된 도구: ${(proj.tools || []).join(', ') || '없음'}`, dir });
  const projectId = proj.ok ? proj.id : null;
  const ing = await opencrab.ingest(items, projectId);
  send('log', { source: 'opencrab', line: ing.ok ? `✔ 인제스트 ${ing.ingested}/${ing.total} (도구 ${ing.tool})` : `✖ ${ing.error || '인제스트 실패'}`, dir });
  return {
    ok: ing.ok, projectId, projectTool: proj.tool, ingestTool: ing.tool,
    ingested: ing.ingested || 0, total: items.length,
    unsupported: proj.unsupported || ing.unsupported || false,
    note: ing.error || (proj.unsupported ? '엔드포인트에 쓰기 도구가 없어 전략은 로컬(context/strategy/)에만 남았습니다.' : undefined),
    fails: ing.fails,
  };
}));

// ---- 레퍼런스 사이트 분석 (온보딩 준비 레인) ---------------------------------------
const reference = require('./lib/reference');
ipcMain.handle('ref:analyze', async (_e, dir, urls) => {
  // claude가 같은 폴더에 파일을 쓴다 — 채팅/스테이지와 상호 배제
  const lock = locks.acquire(dir, 'reference');
  if (!lock.ok) return { ok: false, error: locks.busyMessage(dir) };
  const startedAt = Date.now();
  try {
    const r = await reference.analyze(dir, urls, (line) => send('log', { source: 'reference', line, dir }));
    history.append({
      dir, kind: 'stage', stage: 'reference', engine: 'claude', model: config.getModels().claude,
      ok: !!r.ok && !r.partial, ms: Date.now() - startedAt, startedAt, note: (urls || []).join(', ').slice(0, 80),
    });
    if (r.ok && Date.now() - startedAt > 30_000) notify('레퍼런스 분석 완료', r.brandDrafted ? 'brand-style.md 초안이 생성됐습니다' : '분석 리포트가 준비됐습니다');
    setTimeout(pushBoard, 300);
    return r;
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  } finally { locks.release(dir, 'reference'); }
});

// ---- 질문지 온보딩 (1차 폼 → 2차 일괄 후속질문 → 일괄 합성) -------------------------
const onboard = require('./lib/onboard');
ipcMain.handle('ob:questions', safe(() => onboard.QUESTIONNAIRE));
ipcMain.handle('ob:followups', async (_e, dir, answers) => {
  const lock = locks.acquire(dir, 'onboard');
  if (!lock.ok) return { ok: false, error: locks.busyMessage(dir) };
  try { return await onboard.followups(dir, answers, (line) => send('log', { source: 'onboard', line, dir })); }
  catch (e) { return { ok: true, questions: [], note: String(e && e.message || e) }; }
  finally { locks.release(dir, 'onboard'); }
});
ipcMain.handle('ob:finalize', async (_e, dir, answers, followupAnswers) => {
  const lock = locks.acquire(dir, 'onboard');
  if (!lock.ok) return { ok: false, error: locks.busyMessage(dir) };
  const startedAt = Date.now();
  try {
    const r = await onboard.finalize(dir, answers, followupAnswers, (line) => send('log', { source: 'onboard', line, dir }));
    history.append({
      dir, kind: 'stage', stage: 'onboard', engine: 'claude', model: config.getModels().claude,
      ok: !!r.ok, ms: Date.now() - startedAt, startedAt, note: '질문지 온보딩',
    });
    if (r.ok && Date.now() - startedAt > 30_000) notify('온보딩 완료', 'brand-style.md가 준비됐습니다');
    setTimeout(pushBoard, 300);
    return r;
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  } finally { locks.release(dir, 'onboard'); }
});

// ---- Engine + in-app director chat -----------------------------------------
ipcMain.handle('cfg:getEngine', safe(() => config.getEngine()));
ipcMain.handle('cfg:setEngine', safe((_e, engine) => config.setEngine(engine).engine));
ipcMain.handle('cfg:getStageEngines', safe(() => config.getStageEngines()));
ipcMain.handle('cfg:setStageEngine', safe((_e, stage, engine) => config.setStageEngine(stage, engine)));
ipcMain.handle('cfg:getModels', safe(() => config.getModels()));
ipcMain.handle('cfg:setModel', safe((_e, engine, model) => config.setModel(engine, model)));
ipcMain.handle('cfg:getBudget', safe(() => config.getBudget()));
ipcMain.handle('cfg:setBudget', safe((_e, usd) => config.setBudget(usd)));
// 오토파일럿 자동 승인 — 승인 게이트를 검수 없이 자동 통과할지
ipcMain.handle('cfg:getAutoApprove', safe(() => config.getAutopilotAutoApprove()));
ipcMain.handle('cfg:setAutoApprove', safe((_e, on) => config.setAutopilotAutoApprove(on)));
// 이미지 생성 스타일 프리셋 — 목록 + 기본값 get/set
ipcMain.handle('render:styles', safe(() => imagestyles.list()));
ipcMain.handle('cfg:getImageStyle', safe(() => config.getImageStyle()));
ipcMain.handle('cfg:setImageStyle', safe((_e, key) => config.setImageStyle(key)));
// 포스트별 이미지/본문 삭제 → 삭제한 부분을 기획 단계로 되돌린다(보드가 파일 증거로 재추론).
ipcMain.handle('post:deleteAssets', safe((_e, dir, uid, opts) => {
  const r = postassets.deleteAssets(dir, uid, opts || {});
  if (r.ok) setTimeout(pushBoard, 200); // 카드가 planned/copy로 즉시 되돌아가게
  return r;
}));

// ---- 채널별 캐릭터/마스터 시트 락인 ------------------------------------------------
// 채널마다 고정 비주얼 아이덴티티를 정의하고 락을 걸면, 그 채널의 모든 이미지 컴파일에 최우선 주입.
ipcMain.handle('sheet:list', safe((_e, dir) => channelsheets.list(dir)));
ipcMain.handle('sheet:get', safe((_e, dir, channel) => channelsheets.get(dir, channel)));
ipcMain.handle('sheet:save', safe((_e, dir, channel, data) => channelsheets.save(dir, channel, data || {})));
ipcMain.handle('sheet:lock', safe((_e, dir, channel, locked) => channelsheets.setLock(dir, channel, locked)));
// AI 초안 — 브랜드 컨텍스트 + 플랫폼 방향으로 마스터/캐릭터 시트 초안을 생성(저장은 사용자가 검토 후).
ipcMain.handle('sheet:generate', async (_e, dir, channel) => {
  try {
    if (!channelRegistry.REGISTRY[channel] || channel === 'etc') return { ok: false, error: '알 수 없는 채널입니다' };
    const brand = promptlab.brandContext(dir);
    const name = (channelRegistry.REGISTRY[channel] || {}).name || channel;
    const platformDir = promptlab.PLATFORM_DIRECTION[channel] || '';
    const instr = channelsheets.draftPrompt(brand, channel, name, platformDir);
    // 초안은 세 필드(마스터·캐릭터·지침) 합계 2000~3300자 마크다운 — 2분이면 자주 잘린다. 5분.
    const r = await engine.runText(dir, instr, { engine: config.getEngineFor('visuals-generate'), json: true, timeoutMs: 300_000 });
    if (!r.ok) {
      return { ok: false, error: '초안 생성에 실패했습니다' + (r.timedOut ? ' (시간 초과 5분)' : '') + (r.tail ? ` — ${String(r.tail).trim().slice(-200)}` : ' (엔진 응답 없음)') };
    }
    const draft = channelsheets.parseDraft(r.out);
    if (!draft) return { ok: false, error: '초안 파싱에 실패했습니다 — 다시 시도하세요' + (r.tail ? ` (${String(r.tail).trim().slice(-150)})` : '') };
    return { ok: true, channel, draft };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
});
// ---- 클라이언트 공용 브랜드 시트 + 로고 (전 채널 공유) ----------------------------
ipcMain.handle('sheet:getBrand', safe((_e, dir) => channelsheets.getBrand(dir)));
ipcMain.handle('sheet:saveBrand', safe((_e, dir, data) => channelsheets.saveBrand(dir, data || {})));

// outputs/creatives/<base>.<ext> → context/channel-sheets/refs/<base>.<ext> 로 격리 이동(보드 스캔·게이트에 안 잡히게)
function moveRefToSheets(dir, srcRel, base) {
  const srcAbs = path.join(dir, srcRel);
  const ext = path.extname(srcRel) || '.png';
  const refsDir = path.join(channelsheets.sheetsDir(dir), 'refs');
  fs.mkdirSync(refsDir, { recursive: true });
  const destAbs = path.join(refsDir, `${base}${ext}`);
  fs.copyFileSync(srcAbs, destAbs); fs.rmSync(srcAbs, { force: true });
  return path.relative(dir, destAbs).replace(/\\/g, '/');
}

// 브랜드 스타일 레퍼런스 이미지 생성(클라이언트 공용) — 브랜드 시트 텍스트로 스타일 보드 1장 생성.
async function genBrandRefImpl(dir) {
  const brand = channelsheets.getBrand(dir) || {};
  const text = brand.brand;
  if (!text || !text.trim()) return { ok: false, error: '브랜드 시트 내용을 먼저 저장하세요' };
  const log = (line) => send('log', { source: 'sheet', line, dir });
  const provider = render.defaultImageProvider({ ima2: true });
  const brief = `Style and mood reference board — a single representative hero frame capturing the palette, lighting character, composition and material finish. No logo, wordmark or text rendered anywhere in the image. ${text}`;
  let prompt = brief, negative = null;
  try {
    const c = await promptlab.compile(dir, { kind: 'image', provider, topic: 'brand style board', channel: '', prompt: brief, size: 'square', count: 1 }, log);
    if (c && c.ok && c.prompt) { prompt = c.prompt; negative = c.negative || null; }
  } catch { /* 브리프 원문으로 */ }
  const r = await render.generate(dir, { kind: 'image', provider, prompt, negative, base: 'brand-master', size: 'square', count: 1, env: { ima2: true } }, log);
  if (!r.ok || !r.rel) return { ok: false, error: r.error || '레퍼런스 생성에 실패했습니다' };
  let relFromDir;
  try { relFromDir = moveRefToSheets(dir, r.rel, 'brand-master'); }
  catch (e) { return { ok: false, error: '레퍼런스 저장 실패: ' + e.message }; }
  channelsheets.saveBrand(dir, { brandRef: relFromDir });
  return { ok: true, which: 'brand', rel: relFromDir };
}
ipcMain.handle('sheet:genBrandRef', async (_e, dir) => {
  try { return await genBrandRefImpl(dir); }
  catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});

// 캐릭터 레퍼런스 생성 — 캐릭터 시트 텍스트로 정면·측면·후면 턴어라운드 모델 시트 1장 생성해 저장.
// 락인하면 그 채널의 모든 이미지 생성에 ima2 --ref 앵커로 전달돼 같은 인물·제품이 픽셀로 재현된다.
// (which==='master'는 하위호환 — 공용 브랜드 레퍼런스로 위임)
ipcMain.handle('sheet:genRef', async (_e, dir, channel, which, index) => {
  try {
    if (which === 'master') return await genBrandRefImpl(dir);
    if (!channelRegistry.REGISTRY[channel] || channel === 'etc') return { ok: false, error: '알 수 없는 채널입니다' };
    const idx = Number(index) || 0;
    const sheet = channelsheets.get(dir, channel) || {};
    const chars = sheet.characters || [];
    const text = (chars[idx] || {}).text || '';
    if (!text || !text.trim()) return { ok: false, error: '캐릭터 시트 내용을 먼저 저장하세요' };
    const log = (line) => send('log', { source: 'sheet', line, dir });
    const provider = render.defaultImageProvider({ ima2: true });
    // 캐릭터 모델 시트 = 정면·3/4측면·후면 턴어라운드 + 표정 세트(레퍼런스 art). 넓은 캔버스(landscape).
    const brief = `Character model sheet / turnaround reference of ONE single character — the canonical recurring subject drawn as a multi-view model sheet on a plain neutral seamless studio background: full-body FRONT view, 3/4 SIDE view and BACK view of the SAME character standing side by side, with identical proportions, face, hairstyle, wardrobe and colors across every view; plus a small row of head close-ups showing neutral, smiling and talking expressions. Even flat model-sheet lighting, no dramatic shadows, clean character-reference layout, natural skin texture with visible pores if human. Keep the identity perfectly consistent across all views. ${text}`;
    let prompt = brief, negative = null;
    try {
      const c = await promptlab.compile(dir, { kind: 'image', provider, topic: `${channel} character turnaround`, channel, prompt: brief, size: 'landscape', count: 1 }, log);
      if (c && c.ok && c.prompt) { prompt = c.prompt; negative = c.negative || null; }
    } catch { /* 브리프 원문으로 */ }
    const base = `chref-${channel}-character-${idx}`;
    // 레퍼런스 생성 자체는 앵커 없이(fresh) — 기존 ref를 먹이지 않는다. 턴어라운드는 가로형(landscape).
    const r = await render.generate(dir, { kind: 'image', provider, prompt, negative, base, size: 'landscape', count: 1, env: { ima2: true } }, log);
    if (!r.ok || !r.rel) return { ok: false, error: r.error || '레퍼런스 생성에 실패했습니다' };
    let relFromDir;
    try { relFromDir = moveRefToSheets(dir, r.rel, base); }
    catch (e) { return { ok: false, error: '레퍼런스 저장 실패: ' + e.message }; }
    channelsheets.setCharacterRef(dir, channel, idx, relFromDir);
    return { ok: true, channel, which: 'character', index: idx, rel: relFromDir };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
});
// 로고 이미지 업로드(클라이언트 공용) — 기존 로고 파일을 골라 등록(색·스타일 근거·컴포짓용). 사진 --ref로는 쓰지 않는다.
ipcMain.handle('sheet:setLogo', async (_e, dir) => {
  try {
    const r = await dialog.showOpenDialog(win, {
      title: '로고 이미지 선택', properties: ['openFile'],
      filters: [{ name: '이미지', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
    });
    if (r.canceled || !r.filePaths || !r.filePaths[0]) return { ok: false, canceled: true };
    const src = r.filePaths[0];
    const ext = (path.extname(src) || '.png').toLowerCase();
    const refsDir = path.join(channelsheets.sheetsDir(dir), 'refs');
    fs.mkdirSync(refsDir, { recursive: true });
    const destAbs = path.join(refsDir, `brand-logo${ext}`);
    fs.copyFileSync(src, destAbs);
    const relFromDir = path.relative(dir, destAbs).replace(/\\/g, '/');
    channelsheets.saveBrand(dir, { logoRef: relFromDir });
    return { ok: true, rel: relFromDir };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
});
ipcMain.handle('sheet:clearLogo', safe((_e, dir) => channelsheets.saveBrand(dir, { logoRef: '' })));
// 참고용 레퍼런스 업로드 — AI 생성 대신 갖고 있는 이미지를 골라 브랜드/캐릭터 레퍼런스 앵커로 등록.
// which: 'brand'|'master' → 공용 브랜드 레퍼런스, 'character' → 채널별 캐릭터(index) 레퍼런스.
ipcMain.handle('sheet:uploadRef', async (_e, dir, channel, which, index) => {
  try {
    const isChar = which === 'character';
    const r = await dialog.showOpenDialog(win, {
      title: isChar ? '캐릭터 레퍼런스 이미지 선택' : '브랜드 레퍼런스 이미지 선택', properties: ['openFile'],
      filters: [{ name: '이미지', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
    });
    if (r.canceled || !r.filePaths || !r.filePaths[0]) return { ok: false, canceled: true };
    const src = r.filePaths[0];
    const ext = (path.extname(src) || '.png').toLowerCase();
    const refsDir = path.join(channelsheets.sheetsDir(dir), 'refs');
    fs.mkdirSync(refsDir, { recursive: true });
    if (isChar) {
      if (!channelRegistry.REGISTRY[channel] || channel === 'etc') return { ok: false, error: '알 수 없는 채널입니다' };
      const idx = Number(index) || 0;
      // -up 접미사: AI 생성본(chref-…)과 파일을 분리해 서로 덮어쓰지 않게
      const destAbs = path.join(refsDir, `chref-${channel}-character-${idx}-up${ext}`);
      fs.copyFileSync(src, destAbs);
      const relFromDir = path.relative(dir, destAbs).replace(/\\/g, '/');
      const sr = channelsheets.setCharacterRef(dir, channel, idx, relFromDir);
      if (!sr.ok) return sr;
      return { ok: true, channel, which: 'character', index: idx, rel: relFromDir };
    }
    const destAbs = path.join(refsDir, `brand-master-up${ext}`);
    fs.copyFileSync(src, destAbs);
    const relFromDir = path.relative(dir, destAbs).replace(/\\/g, '/');
    channelsheets.saveBrand(dir, { brandRef: relFromDir });
    return { ok: true, which: 'brand', rel: relFromDir };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
});

// ---- 워크스페이스 백업·복원 -----------------------------------------------------
ipcMain.handle('bk:create', safe((_e, dir) => backup.createBackup(dir)));
ipcMain.handle('bk:list', safe(() => backup.listBackups()));
ipcMain.handle('bk:restore', async (_e, name, dir) => {
  const lock = locks.acquire(dir, 'restore'); // 복원 중 파이프라인/채팅이 파일을 밟지 않게
  if (!lock.ok) return { ok: false, error: locks.busyMessage(dir) };
  try {
    const r = backup.restoreBackup(name, dir);
    setTimeout(pushBoard, 300); // 복원된 outputs/context를 보드에 즉시 반영
    return r;
  } finally { locks.release(dir, 'restore'); }
});
ipcMain.handle('bk:delete', safe((_e, name) => backup.deleteBackup(name)));
ipcMain.handle('bk:open', () => { shell.openPath(backup.BACKUPS); return { ok: true }; });
ipcMain.handle('chat:send', async (_e, dir, msg) => {
  const lock = locks.acquire(dir, 'chat');
  if (!lock.ok) return { ok: false, text: locks.busyMessage(dir), engine: config.getEngine() };
  const startedAt = Date.now();
  try {
    chatlog.append(dir, { role: 'user', text: msg });
    const r = await chat.send(
      dir, msg,
      (line) => send('log', { source: 'chat', line, dir }),
      (ev) => send('chat:stream', { dir, ev }),
    );
    chatlog.append(dir, { role: 'dir', text: r.text, engine: r.engine, ok: r.ok });
    const prevCost = history.monthCost(dir);
    history.append({
      dir, kind: 'chat', engine: r.engine, model: config.getModels()[r.engine] || '',
      ok: !!r.ok, ms: Date.now() - startedAt, costUsd: typeof r.costUsd === 'number' ? r.costUsd : undefined,
      startedAt, note: String(msg).slice(0, 80),
    });
    budgetNotify(dir, prevCost);
    return r;
  } catch (e) {
    return { ok: false, text: String(e && e.message || e), engine: config.getEngine() };
  } finally { locks.release(dir, 'chat'); }
});
ipcMain.handle('chat:stop', () => chat.stopCurrent());
ipcMain.handle('chat:history', safe((_e, dir) => chatlog.list(dir)));
ipcMain.handle('chat:reset', safe((_e, dir) => { chatlog.clear(dir); return chat.reset(dir); }));
