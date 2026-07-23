// 세션 기반 브라우저 발행 — 공개 API가 없는 채널(네이버 블로그·카카오톡 채널)을 Electron 내장
// 창으로 처리한다. 방식:
//   1) 채널별 영속 파티션(persist:pub-<channel>)에 1회 수동 로그인 → 세션(쿠키) 저장
//   2) 이후 로그인된 창으로 작성 페이지를 열고, 본문을 클립보드에 복사 + 이미지 폴더를 열어
//      첨부를 돕고, 가능한 범위에서 제목/본문을 프리필한다(best-effort).
//   3) 최종 발행은 사용자가 창에서 검토 후 직접 누른다 — 플랫폼 DOM 변경에 안전하고, 자동
//      클릭으로 인한 오발행을 막는다. (헤드리스 자동 발행은 네이버/카카오의 에디터·봇탐지·
//      2FA 때문에 신뢰할 수 없다.)
// electron은 함수 안에서 지연 require — 순수 헬퍼(쿠키 판정·컴포즈 상태)는 node에서 테스트 가능.
const fs = require('fs');
const path = require('path');

// 채널 설정 — 로그인/작성 URL, 파티션, 로그인 판정용 인증 쿠키.
const CHANNELS = {
  naver: {
    label: '네이버 블로그',
    partition: 'persist:pub-naver',
    loginUrl: 'https://nid.naver.com/nidlogin.login?url=https%3A%2F%2Fblog.naver.com',
    writeUrl: 'https://blog.naver.com/GoBlogWrite.naver',
    authCookies: ['NID_AUT', 'NID_SES'],
  },
  kakao_channel: {
    label: '카카오톡 채널',
    partition: 'persist:pub-kakao',
    loginUrl: 'https://accounts.kakao.com/login/?continue=https%3A%2F%2Fcenter-pf.kakao.com%2Fmine',
    // 채널 id를 앱이 알 수 없어 관리자 홈까지 연다 — 사용자가 대상 채널 → 소식 작성으로 이동.
    writeUrl: 'https://center-pf.kakao.com/mine',
    authCookies: ['_kawlt', '_kawltea', '_karmt', '_karmtea'],
  },
};

function cfgFor(channel) { return CHANNELS[channel] || null; }
function isBrowserChannel(channel) { return !!CHANNELS[channel]; }

// 쿠키 목록에서 로그인 여부 추정 — 값이 있는 인증 쿠키가 하나라도 있으면 로그인으로 본다.
function isLoggedInFromCookies(channel, cookies) {
  const cfg = cfgFor(channel);
  if (!cfg) return false;
  const names = new Set((cookies || []).filter((c) => c && c.value).map((c) => c.name));
  return cfg.authCookies.some((n) => names.has(n));
}

// 발행 재료 — 제목/본문/이미지 절대경로를 워크스페이스(dir) 안에서만 해석(경로 이탈 차단).
function buildComposeState(dir, payload) {
  const p = payload || {};
  const title = String(p.title || '').slice(0, 300);
  const text = String(p.text || '');
  const rels = Array.isArray(p.imageRels) ? p.imageRels : (p.imageRel ? [p.imageRel] : []);
  const root = path.resolve(dir);
  const images = rels
    .map((rel) => path.resolve(dir, String(rel || '')))
    .filter((abs) => {
      if (abs !== root && !abs.startsWith(root + path.sep)) return false;
      try { return fs.existsSync(abs); } catch { return false; }
    })
    .slice(0, 20);
  return { title, text, images };
}

// best-effort 프리필 인젝터(페이지 컨텍스트에서 실행할 JS 문자열). 실패해도 클립보드/폴더로
// 마무리할 수 있으므로 절대 throw 하지 않는다(try/catch로 감싸 no-op).
function composeInjector(channel, state) {
  const title = JSON.stringify(String((state && state.title) || ''));
  return `(function(){try{
    var t=${title};
    if(t){
      var ti=document.querySelector('input[placeholder*="제목"],input[name="title"],input#subject,textarea[placeholder*="제목"]');
      if(ti){ti.focus();ti.value=t;ti.dispatchEvent(new Event('input',{bubbles:true}));}
    }
    var ed=document.querySelector('[contenteditable="true"],.se-content,.editor_body,textarea[name="content"]');
    if(ed){ed.focus();}
    return !!ed;
  }catch(e){return false;}})();`;
}

// ---- Electron 실행부(지연 require) ---------------------------------------------------
function electron() { return require('electron'); }
function sessionFor(channel) {
  const cfg = cfgFor(channel);
  return electron().session.fromPartition(cfg.partition);
}

async function sessionStatus(channel) {
  const cfg = cfgFor(channel);
  if (!cfg) return { connected: false, error: '지원하지 않는 채널입니다' };
  try {
    const cookies = await sessionFor(channel).cookies.get({});
    return { connected: isLoggedInFromCookies(channel, cookies), label: cfg.label };
  } catch (e) { return { connected: false, error: e.message, label: cfg.label }; }
}

function openWin(channel, url, opts = {}) {
  const cfg = cfgFor(channel);
  const win = new (electron().BrowserWindow)({
    width: 1180, height: 920, show: opts.show !== false,
    title: `${cfg.label} — 로그인/작성`,
    webPreferences: { partition: cfg.partition, contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.loadURL(url);
  return win;
}

// 1회 수동 로그인 — 로그인 페이지를 보이는 창으로 열고, 사용자가 로그인 후 창을 닫으면 세션 확인.
async function login(channel) {
  const cfg = cfgFor(channel);
  if (!cfg) return { ok: false, error: '지원하지 않는 채널입니다' };
  return new Promise((resolve) => {
    let win;
    try { win = openWin(channel, cfg.loginUrl, { show: true }); }
    catch (e) { resolve({ ok: false, error: e.message }); return; }
    let settled = false;
    const finish = async () => {
      if (settled) return; settled = true;
      const st = await sessionStatus(channel).catch(() => ({ connected: false }));
      resolve({ ok: true, connected: !!st.connected, label: cfg.label });
    };
    win.on('closed', finish);
  });
}

async function logout(channel) {
  const cfg = cfgFor(channel);
  if (!cfg) return { ok: false, error: '지원하지 않는 채널입니다' };
  try { await sessionFor(channel).clearStorageData(); return { ok: true }; }
  catch (e) { return { ok: false, error: e.message }; }
}

// 작성 창 열기 — 로그인 세션으로 작성 페이지를 열고, 본문을 클립보드에 복사 + 이미지 폴더를
// 연다. best-effort 프리필 후, 최종 발행은 사용자가 창에서 마무리한다.
async function publish(dir, payload, onLine) {
  const cfg = cfgFor(payload && payload.channel);
  if (!cfg) return { ok: false, error: '이 채널은 브라우저 발행을 지원하지 않습니다' };
  const st = await sessionStatus(payload.channel);
  if (!st.connected) {
    return { ok: false, needsLogin: true, channel: payload.channel, error: `${cfg.label} 로그인이 필요합니다 — 설정 → 채널에서 먼저 로그인하세요` };
  }
  const state = buildComposeState(dir, payload);
  if (!state.text.trim() && !state.title.trim()) return { ok: false, error: '발행할 본문이 없습니다' };
  const { clipboard, shell } = electron();
  try { clipboard.writeText(state.text); } catch { /* best effort */ }
  if (state.images[0]) { try { shell.showItemInFolder(state.images[0]); } catch { /* best effort */ } }
  onLine && onLine(`[publish] ${cfg.label} 작성 창을 엽니다 — 본문 클립보드 복사됨, 이미지 ${state.images.length}장 폴더 열림`);
  let win;
  try { win = openWin(payload.channel, cfg.writeUrl, { show: true }); }
  catch (e) { return { ok: false, error: '작성 창을 열지 못했습니다: ' + e.message }; }
  win.webContents.once('did-finish-load', async () => {
    try { await win.webContents.executeJavaScript(composeInjector(payload.channel, state), true); }
    catch { /* DOM/iframe 변경 — 클립보드·폴더 백업으로 충분 */ }
  });
  return {
    ok: true, assisted: true, channel: payload.channel, label: cfg.label,
    images: state.images.length,
    message: `${cfg.label} 로그인 창을 열었습니다. 본문은 클립보드에 복사됐고(붙여넣기 Ctrl/⌘+V) 이미지 폴더가 열렸습니다 — 이미지 첨부 후 발행하세요.`,
  };
}

module.exports = {
  CHANNELS, cfgFor, isBrowserChannel, isLoggedInFromCookies, buildComposeState, composeInjector,
  sessionStatus, login, logout, publish,
};
