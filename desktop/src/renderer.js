/* ══ 온에어 데스크 renderer — IIFE 섹션: util/state/rail/topbar/channels/board/gates/sheets/dock/drawer/settings/boot ══ */
(() => {
'use strict';
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => [...(r || document).querySelectorAll(s)];

// 전역 오류 캡처는 최상단에 — 아래 DOM 바인딩이 로드 중 throw해도 잡히게
function reportError(kind, message) {
  try {
    if (typeof logLine === 'function') logLine('renderer-error', `${kind}: ${message}`);
    if (typeof toast === 'function') toast('오류가 발생했습니다 — 로그 탭에서 확인 (로그 복사로 신고 가능)');
    if (window.api && window.api.app) window.api.app.log('renderer-' + kind, message);
  } catch { /* 오류 처리기가 또 죽지 않게 */ }
}
window.addEventListener('error', (e) => reportError('error', `${e.message} @ ${e.filename}:${e.lineno}`));
window.addEventListener('unhandledrejection', (e) => reportError('rejection', String(e.reason && e.reason.message || e.reason).slice(0, 500)));
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const relTime = (ms) => {
  const d = Date.now() - ms;
  if (d < 60e3) return '방금'; if (d < 3600e3) return Math.floor(d / 60e3) + '분 전';
  if (d < 86400e3) return Math.floor(d / 3600e3) + '시간 전'; return Math.floor(d / 86400e3) + '일 전';
};
const fmtDur = (ms) => { const s = Math.floor(ms / 1000); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
const fmtCost = (usd) => (typeof usd === 'number' && usd > 0 ? '$' + (usd < 0.01 ? usd.toFixed(4) : usd.toFixed(2)) : '');

// 안전 마크다운 렌더러 — 항상 esc() 먼저, 태그는 우리가 만든 것만. 카피/캘린더 md 미리보기용.
function md(src) {
  const inline = (s) => esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<i>$2</i>')
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2">$1</a>');
  const lines = String(src || '').split(/\r?\n/);
  let out = '', code = false, list = null, table = null, para = [];
  const flushPara = () => { if (para.length) { out += `<p>${para.map(inline).join('<br>')}</p>`; para = []; } };
  const flushList = () => { if (list) { out += `</${list}>`; list = null; } };
  const flushTable = () => { if (table) { out += '</tbody></table></div>'; table = null; } };
  for (const raw of lines) {
    const line = raw;
    if (/^```/.test(line)) { flushPara(); flushList(); flushTable(); code = !code; out += code ? '<pre><code>' : '</code></pre>'; continue; }
    if (code) { out += esc(line) + '\n'; continue; }
    const h = line.match(/^(#{1,4})\s+(.*)/);
    if (h) { flushPara(); flushList(); flushTable(); out += `<h${h[1].length + 2}>${inline(h[2])}</h${h[1].length + 2}>`; continue; }
    if (/^\s*(---+|\*\*\*+)\s*$/.test(line)) { flushPara(); flushList(); flushTable(); out += '<hr>'; continue; }
    if (/^\s*\|.*\|\s*$/.test(line)) {
      flushPara(); flushList();
      const cells = line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue; // 헤더 구분선
      if (!table) { table = true; out += `<div class="md-scroll"><table><tbody>`; }
      out += `<tr>${cells.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`;
      continue;
    }
    flushTable();
    const li = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)/);
    if (li) { flushPara(); const want = /^\s*\d/.test(line) ? 'ol' : 'ul'; if (list !== want) { flushList(); out += `<${want}>`; list = want; } out += `<li>${inline(li[1])}</li>`; continue; }
    flushList();
    if (!line.trim()) { flushPara(); continue; }
    para.push(line);
  }
  flushPara(); flushList(); flushTable();
  if (code) out += '</code></pre>';
  return out;
}
// 텍스트 미리보기 — .md는 렌더링, 그 외는 pre (모든 미리보기 패널이 공유)
function previewHTML(r, rel) {
  if (!r || !r.ok) return `<p class="muted">${esc((r && r.error) || '읽기 실패')}</p>`;
  if (r.kind === 'image') return `<img src="${r.dataUrl}" class="zoomable">`;
  if (/\.md$/i.test(rel || '')) return `<div class="md">${md(r.text)}</div>`;
  return `<pre>${esc(r.text)}</pre>`;
}
// 미리보기 이미지 클릭 → 라이트박스 확대
document.addEventListener('click', (e) => {
  const img = e.target.closest && e.target.closest('img.zoomable');
  if (img) { const lb = $('#lightbox'); lb.innerHTML = `<img src="${img.src}">`; lb.classList.remove('hidden'); }
  else if (e.target.closest && e.target.closest('#lightbox')) $('#lightbox').classList.add('hidden');
});
// 키보드 조작 — div/article로 만든 버튼형 요소에 Enter/Space 활성화
function pressable(el) {
  el.tabIndex = 0;
  if (!el.getAttribute('role')) el.setAttribute('role', 'button');
  el.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); el.click(); }
  });
}

// ---- state --------------------------------------------------------------------
const S = {
  clients: [], client: null, board: null, prevStages: new Map(),
  gates: null, engine: 'claude', view: 'month',
  running: null, runStart: 0, lastRunStart: {}, runTimer: null,
  // 클라이언트(폴더)별 실행 상태 — 백그라운드 동시 실행의 진실. 뷰 클라이언트 값은 여기서 파생.
  runByDir: {}, autoByDir: {},
  filter: null, chips: [], chatBusy: false, env: null, blotato: false,
  viewDirty: { timeline: false, kanban: false, month: false, template: false },
  viewMonth: null, templateCh: null, auto: false, monthCost: 0, selectSeq: 0,
};
const STAGE_LABEL = { planned: '기획', copy: '카피', visual: '비주얼/영상', review: '검수', ready: '발행준비' };
const STAGE2COL = { calendar: 'planned', copy: 'copy', shortform: 'visual', verify: 'review', visuals: 'visual', 'visuals-generate': 'visual', compliance: 'review', review: 'ready' };
const CH_NAME = { instagram: '인스타그램', threads: '스레드', naver: '네이버 블로그', naver_clip: '네이버 클립', kakao_channel: '카카오채널', facebook: '페이스북', linkedin: '링크드인', x: 'X', tiktok: '틱톡', etc: '기타' };
const CH_MONO = { instagram: 'IG', threads: 'TH', naver: 'NB', naver_clip: 'NC', kakao_channel: 'KK', facebook: 'FB', linkedin: 'IN', x: 'X', tiktok: 'TT', etc: '?' };
const PRIMARY_CHANNELS = ['instagram', 'threads', 'naver', 'naver_clip', 'kakao_channel'];
const DOW_KO = ['일', '월', '화', '수', '목', '금', '토'];

// ---- toast / popover -------------------------------------------------------------
function toast(msg) {
  const box = $('#toasts');
  // 중복/폭주 방지 — 같은 문구는 갱신만, 최대 4개 유지
  for (const t of box.children) if (t.textContent === msg) { t.remove(); break; }
  while (box.children.length >= 4) box.firstChild.remove();
  const d = document.createElement('div');
  d.className = 'toast'; d.textContent = msg;
  box.appendChild(d);
  setTimeout(() => d.remove(), 4200);
}
let popTarget = null;
function popover(anchor, html) {
  const p = $('#popover');
  if (popTarget === anchor && !p.classList.contains('hidden')) { hidePopover(); return false; }
  popTarget = anchor;
  p.innerHTML = html; p.classList.remove('hidden');
  const r = anchor.getBoundingClientRect();
  p.style.left = Math.min(r.left, innerWidth - p.offsetWidth - 12) + 'px';
  p.style.top = (r.top - p.offsetHeight - 8 > 0 ? r.top - p.offsetHeight - 8 : r.bottom + 8) + 'px';
  return true;
}
function hidePopover() { $('#popover').classList.add('hidden'); popTarget = null; }
document.addEventListener('click', (e) => { if (popTarget && !$('#popover').contains(e.target) && e.target !== popTarget && !popTarget.contains(e.target)) hidePopover(); });

// ---- overlay stack -----------------------------------------------------------------
function openSheet(id) { $('#overlay').classList.remove('hidden'); $$('#overlay > .sheet, #overlay > .fullscreen').forEach((s) => s.classList.add('hidden')); $(id).classList.remove('hidden'); }
function closeOverlay() {
  if (typeof currentStampReset === 'function') currentStampReset(); // ESC 중 도장 진행 취소
  S.approveNode = null;
  $('#overlay').classList.add('hidden'); $$('#overlay > *').forEach((s) => s.classList.add('hidden'));
}
$('#overlay').addEventListener('click', (e) => { if (e.target === $('#overlay')) closeOverlay(); });
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  hidePopover();
  const lb = $('#lightbox');
  if (lb && !lb.classList.contains('hidden')) { lb.classList.add('hidden'); return; }
  // 설정 마법사는 ESC로 닫히지 않는다 — 건너뛰기 버튼만이 wizardDone을 기록하므로
  if (!$('#wizard').classList.contains('hidden')) return;
  closeOverlay();
});

// ---- rail: clients ------------------------------------------------------------------
async function refreshClients() {
  S.clients = await window.api.ws.list();
  const box = $('#rail-clients'); box.innerHTML = '';
  for (const c of S.clients) {
    const a = document.createElement('div');
    a.className = 'avatar' + (S.client && S.client.dir === c.dir ? ' active' : '');
    a.textContent = c.name.slice(0, 2).toUpperCase();
    a.title = c.name;
    a.onclick = () => {
      // 실행 중이어도 전환 가능 — 떠난 클라이언트는 백그라운드에서 계속 돈다 (폴더별 독립 실행).
      if (S.chatBusy) { toast('디렉터 응답을 기다리는 중에는 전환할 수 없습니다'); return; }
      selectClient(c);
    };
    if (S.runByDir[c.dir] || S.autoByDir[c.dir]) a.classList.add('running-avatar');
    pressable(a);
    box.appendChild(a);
  }
}
$('#rail-add').onclick = (e) => {
  if (popover(e.currentTarget, `
  <div style="display:flex;flex-direction:column;gap:8px;min-width:180px">
    <button id="pop-new">+ 새 클라이언트</button>
    <button id="pop-pick">기존 폴더 추가</button>
  </div>`)) bindAddPop();
};
function bindAddPop() {
  // Electron 렌더러에는 window.prompt가 없다 — 팝오버 인라인 입력 사용
  $('#pop-new').onclick = () => {
    $('#popover').innerHTML = `<b>새 클라이언트</b>
      <input id="pop-name" placeholder="이름 (영문/한글)" style="width:100%;margin-top:8px;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:7px 9px;color:var(--text);font-size:12.5px">
      <textarea id="pop-refs" rows="3" placeholder="레퍼런스 사이트 URL (선택, 줄바꿈 구분)&#10;홈페이지·블로그·경쟁사 — 넣으면 분석해 브랜드 초안을 준비합니다" style="width:100%;margin-top:8px;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:7px 9px;color:var(--text);font-size:12px;resize:vertical"></textarea>
      <button id="pop-create" style="margin-top:8px;width:100%">만들기</button>`;
    const go = async () => {
      const name = $('#pop-name').value.trim();
      if (!name) return;
      const urls = $('#pop-refs').value.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
      hidePopover();
      const r = await window.api.ws.create(name);
      if (r.ok) {
        await refreshClients();
        await selectClient(r);
        if (urls.length) runRefAnalysis(r.dir, urls);
      }
      else toast('생성 실패: ' + (r.error || '이름을 확인하세요'));
    };
    $('#pop-create').onclick = go;
    $('#pop-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    $('#pop-name').focus();
  };
  $('#pop-pick').onclick = async () => {
    hidePopover();
    const r = await window.api.ws.pickFolder();
    if (r && r.ok) { await refreshClients(); selectClient(r); }
  };
}
// 레퍼런스 사이트 분석 실행 — 수집(스냅샷)과 종합(claude)을 로그 탭으로 중계
async function runRefAnalysis(dir, urls) {
  switchDock('log');
  toast(`레퍼런스 사이트 ${urls.length}개 분석 시작 — 로그 탭에서 진행 확인`);
  try {
    const r = await window.api.ref.analyze(dir, urls);
    if (r && r.ok) {
      if (r.brandDrafted) toast('✔ 분석 완료 — brand-style.md 초안이 생성됐습니다 (온보딩 인터뷰로 확정하세요)');
      else if (r.partial) toast(r.note || '스냅샷만 저장됨 — 종합 분석은 재시도 필요');
      else toast(`✔ 분석 완료 — ${r.analysis || 'context/references/'} (스냅샷 ${r.snapshots}개)`);
      if (r.failed && r.failed.length) logLine('reference', '수집 실패: ' + r.failed.join(' / '));
    } else toast('분석 실패: ' + ((r && r.error) || '알 수 없음'));
  } catch (e) { toast('분석 실패: ' + e.message); }
  if (S.client && S.client.dir === dir) refreshBoard(false);
}
$('#rail-folder').onclick = () => S.client && window.api.ws.openFolder(S.client.dir);
$('#rail-term').onclick = () => S.client && window.api.pipe.openTerminal(S.client.dir);
$('#rail-settings').onclick = () => openSettings();

async function selectClient(c) {
  const seq = S.selectSeq = (S.selectSeq || 0) + 1; // 빠른 연속 전환 시 낡은 continuation이 상태를 덮지 않게
  S.client = c; S.filter = null; S.prevStages = new Map();
  // 새 클라이언트의 실행 상태를 폴더별 맵에서 복원 — 백그라운드로 돌던 클라이언트로 돌아오면
  // 진행 중인 단계/오토파일럿이 그대로 툴바에 다시 뜬다.
  const run = S.runByDir[c.dir];
  S.auto = !!S.autoByDir[c.dir];
  setRunning(run ? run.stage : null, run ? run.start : 0);
  updateAutoBtn();
  $('#tb-name').textContent = c.name;
  $('#tb-path').textContent = c.dir;
  $('#rail-folder').disabled = $('#rail-term').disabled = false;
  $('#chat-log').innerHTML = ''; S.chips = []; renderChips();
  await refreshClients();
  if (seq !== S.selectSeq) return;
  // 이 클라이언트의 지난 대화 복원 — CLI 세션은 살아있는데 화면만 비는 desync 방지
  try {
    const hist = await window.api.chat.history(c.dir);
    if (seq !== S.selectSeq) return;
    for (const m of (hist || []).slice(-40)) addMsg(m.role === 'user' ? 'user' : (m.ok === false ? 'err' : 'dir'), m.text);
  } catch { /* 기록 없음 */ }
  // 승인 시트의 "이번 실행 산출물" 컷오프를 재시작 후에도 유지
  try {
    const h = await window.api.hist.list(c.dir);
    if (seq !== S.selectSeq) return;
    S.lastRunStart = {};
    for (const r of (h && h.runs || []).slice().reverse()) if (r.kind === 'stage' && r.stage && !S.lastRunStart[r.stage]) S.lastRunStart[r.stage] = r.startedAt;
    S.monthCost = h ? h.monthCost : 0;
  } catch { S.lastRunStart = {}; }
  const w = await window.api.ws.watch(c.dir);
  if (seq !== S.selectSeq) return;
  clearInterval(S.pollTimer);
  if (!w || !w.watching) {
    // 파일 감시 실패(네트워크 드라이브 등) — 15초 폴링으로 라이브 보드 유지
    toast('파일 감시를 시작하지 못해 15초 주기 새로고침으로 동작합니다');
    S.pollTimer = setInterval(() => refreshBoard(false), 15000);
  }
  await refreshBoard(true);
}

// ---- topbar -------------------------------------------------------------------------
for (const b of $$('#view-seg button')) b.onclick = () => {
  S.view = b.dataset.view;
  applyViewSeg();
  // 템플릿은 fingerprint로 불필요 재빌드를 건너뛰므로 dirty/전환 시 갱신
  if (S.board && (S.viewDirty[S.view] || S.view === 'template')) renderBoardViews(false);
  renderHero();
};
for (const b of $$('#engine-seg button')) b.onclick = async () => {
  if (S.running) { toast('실행 중에는 엔진을 바꿀 수 없습니다'); return; }
  S.engine = await window.api.engine.set(b.dataset.engine);
  applyEngine();
};
function applyEngine() {
  $$('#engine-seg button').forEach((x) => x.classList.toggle('active', x.dataset.engine === S.engine));
  const m = (S.models || {})[S.engine];
  $('#dock-engine').textContent = (S.engine === 'codex' ? 'Codex' : 'Claude') + (m ? ` · ${m}` : '');
}
$('#tb-update').onclick = () => window.api.update.install();
$('#tb-drawer').onclick = () => openDrawer();

// 뷰 클라이언트의 실행 상태를 설정하고 폴더별 맵에도 반영. startAt을 주면(백그라운드에서
// 돌던 걸 다시 열 때) 경과 시간을 실제 시작 시각 기준으로 표시한다.
function setRunning(stage, startAt) {
  const dir = S.client && S.client.dir;
  S.running = stage;
  if (dir) {
    if (stage) S.runByDir[dir] = { stage, start: startAt || (S.runByDir[dir] && S.runByDir[dir].start) || Date.now() };
    else delete S.runByDir[dir];
  }
  $('#tb-running').classList.toggle('hidden', !stage);
  if (stage) {
    S.runStart = (dir && S.runByDir[dir] && S.runByDir[dir].start) || Date.now();
    clearInterval(S.runTimer);
    S.runTimer = setInterval(() => {
      const d = fmtDur(Date.now() - S.runStart);
      $('#tb-running-label').textContent = `${stage} 실행 중 · ${d}`;
      const ctaLabel = $('#gate-cta span');
      if (S.running && ctaLabel) ctaLabel.textContent = `중지 · ${d}`;
    }, 1000);
    $('#tb-running-label').textContent = `${stage} 실행 중`;
  } else clearInterval(S.runTimer);
  renderGateBar();
  updateBgBanner();
}

// 백그라운드(현재 뷰가 아닌) 클라이언트의 실행 상태만 갱신 — 뷰 툴바는 건드리지 않는다.
function trackBgRun(dir, stage) {
  if (!dir) return;
  if (stage) S.runByDir[dir] = { stage, start: (S.runByDir[dir] && S.runByDir[dir].start) || Date.now() };
  else delete S.runByDir[dir];
  updateBgBanner();
}

// "다른 클라이언트 N곳 실행 중" 배너 — 클릭하면 그 클라이언트로 이동
function updateBgBanner() {
  const el = $('#tb-bg-runs');
  if (!el) return;
  const viewed = S.client && S.client.dir;
  const active = new Set([...Object.keys(S.runByDir), ...Object.keys(S.autoByDir)].filter((d) => d && d !== viewed));
  if (!active.size) { el.classList.add('hidden'); el.onclick = null; return; }
  const names = [...active].map((d) => {
    const c = S.clients.find((x) => x.dir === d);
    return c ? c.name : d.split(/[\\/]/).pop();
  });
  el.classList.remove('hidden');
  el.textContent = `⚡ 다른 클라이언트 ${active.size}곳 실행 중`;
  el.title = names.join(', ') + ' — 클릭하면 이동';
  el.onclick = () => {
    const first = [...active][0];
    const c = S.clients.find((x) => x.dir === first);
    if (c) selectClient(c);
  };
  el.style.cursor = 'pointer';
}

// ---- channels (존 A) -------------------------------------------------------------------
function donutSVG(pass, warn, block, size = 40) {
  const total = Math.max(pass + warn + block, 1);
  const C = 2 * Math.PI * 15;
  let off = 0;
  const seg = (n, color) => {
    const len = (n / total) * C;
    const s = `<circle cx="20" cy="20" r="15" fill="none" stroke="${color}" stroke-width="6" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}" transform="rotate(-90 20 20)"/>`;
    off += len; return n ? s : '';
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 40 40"><circle cx="20" cy="20" r="15" fill="none" stroke="var(--raised)" stroke-width="6"/>${seg(pass, 'var(--ok)')}${seg(warn, 'var(--warn)')}${seg(block, 'var(--bad)')}</svg>`;
}
function sparkSVG(posts, chKey) {
  const weeks = [0, 0, 0, 0, 0];
  for (const p of posts) { const w = parseInt(p.week) || 1; if (p.channel === chKey) weeks[Math.min(w, 5) - 1]++; }
  const max = Math.max(...weeks, 1);
  return `<svg width="80" height="22" viewBox="0 0 80 22">${weeks.map((v, i) =>
    `<rect x="${i * 16 + 2}" y="${20 - (v / max) * 16}" width="10" height="${(v / max) * 16 + 1}" rx="2" fill="var(--accent)" opacity="${v ? .85 : .18}"/>`).join('')}</svg>`;
}
function renderChannels() {
  const b = S.board; if (!b) return;
  $('#ct-count').textContent = b.posts.length || '–';
  $('#ct-donut').innerHTML = donutSVG(b.compliance.pass, b.compliance.warn, b.compliance.block);
  const ready = b.posts.filter((p) => p.stage === 'ready').length;
  $('#ct-ready').innerHTML = `<span style="color:var(--ok)">발행준비 ${ready}</span> / ${b.posts.length}`;
  $('#client-tile').onclick = () => setFilter(null);

  const box = $('#channel-scroll'); box.innerHTML = '';
  const sorted = [...b.channels].sort((a, c) => {
    const ai = PRIMARY_CHANNELS.indexOf(a.key), ci = PRIMARY_CHANNELS.indexOf(c.key);
    const ao = ai >= 0 ? ai : 99, co = ci >= 0 ? ci : 99;
    return ao - co || c.posts - a.posts;
  });
  for (const ch of sorted) {
    const el = $('#tpl-channel-card').content.firstElementChild.cloneNode(true);
    const color = `var(--ch-${ch.key})`;
    el.dataset.ch = ch.key;
    const tile = $('.mono-tile', el);
    tile.textContent = CH_MONO[ch.key] || '?';
    tile.style.background = `color-mix(in srgb, ${color} 16%, transparent)`;
    tile.style.color = color;
    $('.cc-name', el).textContent = CH_NAME[ch.key] || ch.key;
    const badge = $('.cc-badge', el);
    const direct = (S.channels && S.channels.direct && S.channels.direct[ch.key]) || {};
    if (ch.publishRoute === 'manual') {
      badge.textContent = '수동 발행'; badge.style.cursor = 'pointer'; badge.style.color = 'var(--warn)';
      badge.title = '수동 발행 체크리스트 열기';
      badge.onclick = (e) => { e.stopPropagation(); openPublishPanel(ch.key); };
      pressable(badge);
    } else if (direct.connected) {
      const tl = direct.tokenLevel;
      badge.textContent = tl === 'expired' ? '토큰 만료 의심' : tl === 'warn' ? '토큰 갱신 임박' : 'API 연결됨';
      badge.style.color = tl === 'expired' || tl === 'warn' ? 'var(--warn)' : 'var(--ok)';
      badge.style.cursor = 'pointer';
      badge.title = direct.tokenNote || '발행 패널 열기';
      badge.onclick = (e) => { e.stopPropagation(); openPublishPanel(ch.key); };
      pressable(badge);
    } else if (S.blotato) {
      badge.textContent = 'Blotato(레거시)'; badge.style.color = 'var(--muted)';
    } else {
      badge.textContent = '연결 필요'; badge.style.color = 'var(--warn)'; badge.style.cursor = 'pointer';
      badge.title = '설정 → 채널에서 API 토큰 연결';
      badge.onclick = (e) => { e.stopPropagation(); openSettings('channels'); };
      pressable(badge);
      el.classList.add('unplugged');
    }
    $('.cc-count', el).textContent = ch.posts;
    $('.cc-ready', el).textContent = `발행준비 ${ch.byStage.ready}`;
    $('.cc-meter', el).innerHTML = S.board.stages.map((s) =>
      `<span class="m-${s}" style="width:${(ch.byStage[s] / ch.posts) * 100}%"></span>`).join('');
    $('.cc-spark', el).innerHTML = sparkSVG(b.posts, ch.key);
    $('.cc-dots', el).innerHTML = (ch.warn ? `<span class="dot WARN" title="WARN ${ch.warn}"></span>` : '') + (ch.block ? `<span class="dot BLOCK" title="BLOCK ${ch.block}"></span>` : '');
    const f = ch.files[0];
    $('.cc-row5', el).textContent = f ? `${f.name} · ${relTime(f.mtime)}` : '산출물 없음';
    el.classList.toggle('focus', S.filter === ch.key);
    el.classList.toggle('dim', !!S.filter && S.filter !== ch.key);
    // 템플릿 보드 진입 버튼
    let tbBtn = $('.cc-template', el);
    if (!tbBtn) {
      tbBtn = document.createElement('button');
      tbBtn.type = 'button';
      tbBtn.className = 'chip tiny cc-template';
      tbBtn.textContent = '템플릿';
      tbBtn.title = '채널 템플릿 보드 — 포스팅 전 작성 모습';
      $('.cc-row1', el).appendChild(tbBtn);
    }
    tbBtn.onclick = (e) => { e.stopPropagation(); openTemplateBoard(ch.key); };
    el.onclick = () => setFilter(S.filter === ch.key ? null : ch.key);
    el.ondblclick = (e) => { e.stopPropagation(); openTemplateBoard(ch.key); };
    pressable(el);
    box.appendChild(el);
  }
  const ghost = document.createElement('button');
  ghost.className = 'ghost-card';
  ghost.innerHTML = `<svg><use href="#i-plus"/></svg><span class="small">채널 연결</span>`;
  ghost.onclick = (e) => {
    if (popover(e.currentTarget, `<b>채널은 캘린더에서 자동 인식됩니다</b><p class="muted" style="margin-top:6px">콘텐츠 캘린더의 Platform 값에 새 채널을 편성하면 카드가 생깁니다.</p><button id="pop-ask" style="margin-top:10px">디렉터에게 채널 편성 요청</button>`))
      $('#pop-ask').onclick = () => { hidePopover(); prefillChat('콘텐츠 캘린더에 새 채널을 편성하고 싶어. 어떤 채널이 좋을지 제안해줘: '); };
  };
  box.appendChild(ghost);
  drawWire();
}
function setFilter(ch) {
  S.filter = ch;
  const chip = $('#tb-filter');
  chip.classList.toggle('hidden', !ch);
  if (ch) { chip.textContent = (CH_NAME[ch] || ch) + ' ×'; chip.onclick = () => setFilter(null); }
  renderChannels(); renderBoardViews(false);
}
// 발행 경로 라이브 와이어 (채널 포커스 → 게이트 '발행' 노드)
function drawWire() {
  const layer = $('#wire-layer'); layer.innerHTML = '';
  if (!S.filter) return;
  try {
    const card = $(`.channel-card[data-ch="${S.filter}"]`);
    const target = $$('.gate-node').pop();
    if (!card || !target) return;
    const zr = $('#zone-channels').getBoundingClientRect();
    const cr = card.getBoundingClientRect(); const tr = target.getBoundingClientRect();
    const x1 = cr.left + cr.width / 2 - zr.left, y1 = cr.bottom - zr.top;
    const x2 = tr.left + 12 - zr.left, y2 = zr.height + 4;
    const manual = S.board.channels.find((c) => c.key === S.filter)?.publishRoute === 'manual';
    layer.innerHTML = `<path class="wire ${manual && !S.blotato ? 'manual' : (manual ? 'manual' : 'auto')}" d="M${x1},${y1} C${x1},${y1 + 40} ${x2},${y2 - 30} ${x2},${y2}"/>` +
      (manual ? `<text x="${(x1 + x2) / 2}" y="${y1 + 24}" fill="var(--warn)" font-size="10">수동 업로드</text>` : '');
  } catch { /* wire is decorative */ }
}

// ---- board (존 B) --------------------------------------------------------------------
async function refreshBoard(first) {
  if (!S.client) return;
  const b = await window.api.ws.board(S.client.dir);
  applyBoard(b, first);
  S.gates = await window.api.gates.get(S.client.dir);
  renderGateBar();
}
function applyBoard(b, first) {
  if (b && b.error) logLine('board-error', b.error);
  const prev = S.prevStages;
  S.board = b;
  const moved = [];
  for (const p of b.posts) {
    const was = prev.get(p.uid);
    if (was && was !== p.stage && b.stages.indexOf(p.stage) > b.stages.indexOf(was)) moved.push(p);
    prev.set(p.uid, p.stage);
  }
  renderChannels();
  renderBoardViews(!first && moved.length > 0, moved);
  renderHero();
  if (!first && moved.length) {
    const label = moved.length === 1 ? cardId(moved[0]) : `${cardId(moved[0])} 외 ${moved.length - 1}건`;
    toast(`${STAGE_LABEL[moved[0].stage]}로 이동 — ${label}`);
  }
}
function cardId(p) { return (CH_MONO[p.channel] || '?') + '-' + p.n; }
// 워크스페이스 미디어 직접 서빙 URL (main의 sat:// 프로토콜 — 등록 폴더 내 미디어만 허용)
function satUrl(rel) {
  // Windows 경로 구분자를 URL에서 통일 — sat:// 프로토콜이 파일을 못 찾는 경우 방지
  const p = String(rel || '').replace(/\\/g, '/');
  return 'sat://f?d=' + encodeURIComponent(S.client.dir) + '&p=' + encodeURIComponent(p);
}
function makeCard(p) {
  const el = $('#tpl-post-card').content.firstElementChild.cloneNode(true);
  const color = `var(--ch-${p.channel})`;
  el.dataset.key = p.uid;
  el.style.borderLeftColor = color;
  const tile = $('.mono-tile', el);
  tile.textContent = CH_MONO[p.channel]; tile.style.background = `color-mix(in srgb, ${color} 16%, transparent)`; tile.style.color = color;
  $('.pc-id', el).textContent = cardId(p);
  $('.pc-when', el).textContent = p.scheduledDate
    ? `${p.scheduledDate.slice(5).replace('-', '/')} ${p.scheduledTime || ''}`.trim()
    : `${p.week || '?'}주 ${p.day || ''}`;
  $('.pc-topic', el).textContent = p.topic || '(제목 없음)';
  // 렌더된 실제 이미지 — 여러 장이면 썸네일 스트립, 한 장이면 단일 (프롬프트 md가 아니라 결과물)
  const renders = (p.files || []).filter((f) => f.kind === 'render').map((f) => f.rel);
  if (renders.length > 1) {
    const im = $('.pc-thumb', el);
    const strip = document.createElement('div');
    strip.className = 'pc-thumbs';
    strip.innerHTML = renders.slice(0, 4).map((r) => `<img src="${satUrl(r)}" class="zoomable" alt="" loading="lazy">`).join('')
      + (renders.length > 4 ? `<span class="more">+${renders.length - 4}</span>` : '');
    im.replaceWith(strip);
  } else if (p.thumb) {
    const im = $('.pc-thumb', el);
    im.src = satUrl(p.thumb);
    im.classList.remove('hidden');
    im.classList.add('zoomable');
  }
  $('.pc-format', el).textContent = p.format || '—';
  const v = $('.pc-verdict', el);
  if (p.verdict) v.classList.add(p.verdict); else v.remove();
  if (p.published) {
    const pub = document.createElement('span');
    pub.className = 'chip tiny'; pub.textContent = '발행됨'; pub.style.color = 'var(--ok)'; pub.style.borderColor = 'var(--ok)';
    $('.pc-row3', el).insertBefore(pub, $('.pc-dots', el));
  }
  if (p.stale && !p.published) {
    const st = document.createElement('span');
    st.className = 'chip tiny'; st.textContent = '↻ 계획 변경됨'; st.style.color = 'var(--warn)'; st.style.borderColor = 'var(--warn)';
    st.title = '캘린더가 이 카드의 산출물보다 최신입니다 — 카피 재생성을 검토하세요';
    $('.pc-row3', el).insertBefore(st, $('.pc-dots', el));
  }
  const idx = S.board.stages.indexOf(p.stage);
  $('.pc-dots', el).innerHTML = S.board.stages.map((s, i) =>
    `<span class="stage-dot ${i <= idx ? 'done' : ''} ${i === idx ? 'cur' : ''}" title="${STAGE_LABEL[s]}"></span>`).join('');
  if (p.verdict === 'BLOCK') el.classList.add('blocked');
  if (S.running && STAGE2COL[S.running] === p.stage) el.classList.add('running-card');
  if (S.filter && p.channel !== S.filter) el.classList.add('dim');
  el.onclick = () => openInspector(p);
  pressable(el);
  el.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/sat-card', JSON.stringify({ uid: p.uid, id: cardId(p), topic: p.topic, stage: p.stage })));
  return el;
}
function renderMonthCalendar() {
  const b = S.board;
  const root = $('#month-cal');
  root.innerHTML = '';
  const meta = b.calendarMeta || { year: new Date().getFullYear(), month: new Date().getMonth() + 1 };
  if (!S.viewMonth) S.viewMonth = { year: meta.year, month: meta.month };
  const { year, month } = S.viewMonth;
  const weekStartsOn = meta.weekStartsOn === 0 ? 0 : 1;
  const grid = monthGridClient(year, month, weekStartsOn);
  const byDate = b.postsByDate || {};
  const today = new Date().toISOString().slice(0, 10);

  const bar = document.createElement('div');
  bar.className = 'month-toolbar';
  bar.innerHTML = `<button id="mc-prev" class="chip">◀</button><h3>${year}년 ${month}월</h3><button id="mc-next" class="chip">▶</button>
    <span class="muted small">메인 채널: ${PRIMARY_CHANNELS.map((k) => CH_NAME[k]).join(' · ')}</span>
    <button id="mc-today" class="chip" style="margin-left:auto">오늘</button>`;
  root.appendChild(bar);
  $('#mc-prev', bar).onclick = () => { shiftMonth(-1); renderMonthCalendar(); };
  $('#mc-next', bar).onclick = () => { shiftMonth(1); renderMonthCalendar(); };
  $('#mc-today', bar).onclick = () => { const n = new Date(); S.viewMonth = { year: n.getFullYear(), month: n.getMonth() + 1 }; renderMonthCalendar(); };

  const g = document.createElement('div');
  g.className = 'month-grid';
  const dows = weekStartsOn === 1 ? ['월', '화', '수', '목', '금', '토', '일'] : DOW_KO;
  for (const d of dows) { const h = document.createElement('div'); h.className = 'month-dow'; h.textContent = d; g.appendChild(h); }

  for (const cell of grid.cells) {
    const el = document.createElement('div');
    el.className = 'month-cell' + (cell.inMonth ? '' : ' out') + (cell.date === today ? ' today' : '');
    const posts = (byDate[cell.date] || []).filter((p) => !S.filter || p.channel === S.filter);
    el.innerHTML = `<div class="month-cell-head"><b>${cell.dayNum}</b><span>${posts.length ? posts.length + '건' : ''}</span></div>`;
    const stack = document.createElement('div');
    stack.className = 'month-stack';
    const show = posts.slice(0, 5);
    for (const p of show) {
      const chip = document.createElement('div');
      chip.className = 'month-chip' + (S.filter && p.channel !== S.filter ? ' dim' : '');
      const color = `var(--ch-${p.channel})`;
      chip.style.borderLeftColor = color;
      chip.title = `${CH_NAME[p.channel] || p.channel}: ${p.topic}`;
      chip.innerHTML = `<span class="time">${p.scheduledTime ? esc(p.scheduledTime) + ' ' : ''}</span><b>${esc(CH_MONO[p.channel] || '?')}</b> ${esc((p.topic || '').slice(0, 28))}`;
      chip.onclick = () => openInspector(p);
      pressable(chip);
      stack.appendChild(chip);
    }
    if (posts.length > 5) {
      const more = document.createElement('div');
      more.className = 'month-more';
      more.textContent = `+${posts.length - 5} 더보기`;
      more.onclick = () => { S.view = 'timeline'; applyViewSeg(); renderBoardViews(false); };
      stack.appendChild(more);
    }
    el.appendChild(stack);
    g.appendChild(el);
  }
  root.appendChild(g);
}
function monthGridClient(year, month, weekStartsOn) {
  const first = new Date(year, month - 1, 1);
  const startPad = (first.getDay() - weekStartsOn + 7) % 7;
  const cells = [];
  const start = new Date(first);
  start.setDate(start.getDate() - startPad);
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    cells.push({ date: d.toISOString().slice(0, 10), inMonth: d.getMonth() === month - 1, dayNum: d.getDate() });
  }
  return { year, month, cells };
}
function shiftMonth(delta) {
  if (!S.viewMonth) S.viewMonth = { year: new Date().getFullYear(), month: new Date().getMonth() + 1 };
  let { year, month } = S.viewMonth;
  month += delta;
  if (month < 1) { month = 12; year--; }
  if (month > 12) { month = 1; year++; }
  S.viewMonth = { year, month };
}
function applyViewSeg() {
  $$('#view-seg button').forEach((b) => b.classList.toggle('active', b.dataset.view === S.view));
  $('#timeline').classList.toggle('hidden', S.view !== 'timeline');
  $('#kanban').classList.toggle('hidden', S.view !== 'kanban');
  $('#month-cal').classList.toggle('hidden', S.view !== 'month');
  const tb = $('#template-board');
  if (tb) tb.classList.toggle('hidden', S.view !== 'template');
}
function brandHandle() {
  const n = (S.client && (S.client.name || S.client.id)) || 'brand';
  return String(n).replace(/\s+/g, '').slice(0, 24) || 'brand';
}
function mockOpts(chKey, { text, topic, title, images, imageSrcs, compact }) {
  return {
    text: text || '',
    topic: topic || '',
    title: title || '',
    handle: brandHandle(),
    images: images || [],
    imageSrcs: imageSrcs || [],
    compact: !!compact,
    esc,
    satUrl,
  };
}
function channelMock(chKey, opts) {
  if (globalThis.SatTemplate && SatTemplate.channelMockHTML) {
    return SatTemplate.channelMockHTML(chKey, mockOpts(chKey, opts));
  }
  return `<p class="muted">템플릿 모듈을 불러오지 못했습니다</p>`;
}
/** 템플릿/미리보기용 — nativeImage 썸네일(작음). 실패 시 sat:// 폴백 */
async function resolveImageSrcs(rels) {
  const list = (rels || []).slice(0, 6);
  const out = await Promise.all(list.map(async (rel) => {
    try {
      const readImg = window.api.ws.readImage
        ? (r) => window.api.ws.readImage(S.client.dir, r, 720)
        : (r) => window.api.ws.readFile(S.client.dir, r);
      const r = await readImg(rel);
      if (r && r.ok && r.dataUrl) return r.dataUrl;
      return satUrl(rel);
    } catch {
      return satUrl(rel);
    }
  }));
  return out;
}
function templateBoardFingerprint(chKey) {
  const b = S.board;
  if (!b) return '';
  const posts = (b.posts || []).filter((p) => p.channel === chKey);
  const creatives = ((b.lanes && b.lanes.creatives) || [])
    .map((f) => `${f.rel}:${f.mtime || 0}:${f.size || 0}`).join('|');
  const postSig = posts.map((p) => {
    const files = (p.files || []).filter((f) => f.kind === 'render' || f.kind === 'creative').map((f) => f.rel).join(',');
    return `${p.uid}:${p.stage}:${p.thumb || ''}:${files}`;
  }).join(';');
  return `${chKey}::${creatives}::${postSig}`;
}
function renderTimeline() {
  const b = S.board;
  const tl = $('#timeline'); tl.innerHTML = '';
  const weeks = {};
  for (const p of b.posts) (weeks[p.week || '?'] = weeks[p.week || '?'] || []).push(p);
  const DAY_IDX = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6, 월: 0, 화: 1, 수: 2, 목: 3, 금: 4, 토: 5, 일: 6 };
  for (const w of Object.keys(weeks).sort()) {
    const posts = weeks[w].sort((a, c) => (DAY_IDX[String(a.day).slice(0, 3).toLowerCase()] ?? 9) - (DAY_IDX[String(c.day).slice(0, 3).toLowerCase()] ?? 9));
    const done = posts.filter((p) => p.stage === 'ready').length;
    const sec = document.createElement('section');
    sec.className = 'week-section';
    sec.innerHTML = `<div class="week-head">${esc(w)}주차 <span class="muted">${posts.length}개</span><span class="week-bar"><span style="width:${(done / posts.length) * 100}%"></span></span></div>`;
    const grid = document.createElement('div'); grid.className = 'tl-grid';
    for (const p of posts) grid.appendChild(makeCard(p));
    sec.appendChild(grid); tl.appendChild(sec);
  }
}
function renderKanban() {
  const b = S.board;
  const kb = $('#kanban'); kb.innerHTML = '';
  for (const s of b.stages) {
    const posts = b.posts.filter((p) => p.stage === s);
    const col = document.createElement('div'); col.className = 'kb-col'; col.dataset.col = s;
    const runningHere = S.running && STAGE2COL[S.running] === s;
    col.innerHTML = `<div class="kb-head">${STAGE_LABEL[s]} <span class="kb-count chip tiny">${posts.length}</span>
      <svg style="width:12px;height:12px;color:var(--faint)" title="상태는 outputs/ 파일 증거로 자동 계산됩니다"><use href="#i-lock"/></svg></div>` +
      (runningHere ? `<div class="kb-ticker" data-ticker="${s}">…</div>` : '');
    const cards = document.createElement('div'); cards.className = 'kb-cards';
    for (const p of posts) cards.appendChild(makeCard(p));
    if (s !== 'planned' && !posts.length && b.posts.length) {
      for (let i = 0; i < Math.min(2, b.posts.length); i++) { const g = document.createElement('div'); g.className = 'ghost-post'; cards.appendChild(g); }
    }
    col.appendChild(cards); kb.appendChild(col);
    col.addEventListener('dragover', (e) => e.preventDefault());
    col.addEventListener('drop', (e) => {
      e.preventDefault();
      const key = (() => { try { return JSON.parse(e.dataTransfer.getData('text/sat-card')).uid; } catch { return null; } })();
      const el = $(`.post-card[data-key="${key}"]`, kb);
      if (el) { el.classList.add('shake'); setTimeout(() => el.classList.remove('shake'), 400); }
      toast('카드 상태는 파일 증거로 자동 계산됩니다 — 디렉터에게 작업을 지시하세요');
    });
  }
}

// ---- 채널 템플릿 보드 (포스팅 전 작성 모습) -------------------------------------------------
function openTemplateBoard(chKey) {
  if (chKey) {
    S.templateCh = chKey;
    S.filter = chKey;
  } else if (S.filter) {
    S.templateCh = S.filter;
  } else if (!S.templateCh) {
    S.templateCh = PRIMARY_CHANNELS[0];
  }
  S.view = 'template';
  applyViewSeg();
  renderChannels();
  renderTemplateBoard(true);
  renderHero();
}
async function renderTemplateBoard(force) {
  const root = $('#template-board');
  if (!root || !S.board) return;
  const channels = [...S.board.channels]
    .map((c) => c.key)
    .filter(Boolean);
  const ordered = [
    ...PRIMARY_CHANNELS.filter((k) => channels.includes(k)),
    ...channels.filter((k) => !PRIMARY_CHANNELS.includes(k)),
  ];
  if (!ordered.length) {
    root.innerHTML = '<div class="tm-empty muted">캘린더 포스트가 생기면 채널별 템플릿 보드가 표시됩니다.</div>';
    renderTemplateBoard._fp = '';
    return;
  }
  if (!S.templateCh || !ordered.includes(S.templateCh)) {
    S.templateCh = (S.filter && ordered.includes(S.filter)) ? S.filter : ordered[0];
  }
  const chKey = S.templateCh;
  // 파일 감시가 보드를 자주 밀어넣어도, 내용이 같으면 DOM을 부수지 않음 (이미지 로드 중단 방지)
  const fp = templateBoardFingerprint(chKey);
  if (!force && renderTemplateBoard._fp === fp) return;
  renderTemplateBoard._fp = fp;
  const posts = S.board.posts.filter((p) => p.channel === chKey);
  const allCreatives = ((S.board.lanes && S.board.lanes.creatives) || [])
    .filter((f) => /\.(png|jpe?g|webp|gif)$/i.test(f.name || f.rel || ''))
    .sort((a, b) => (b.mtime || 0) - (a.mtime || 0));
  root.dataset.hydrated = '0';
  root.innerHTML = `
    <div class="tm-toolbar">
      <div class="tm-tabs">${ordered.map((k) => `
        <button type="button" class="tm-tab ${k === chKey ? 'active' : ''}" data-ch="${esc(k)}">
          <span class="mono-tile tiny" style="color:var(--ch-${k})">${CH_MONO[k] || '?'}</span>
          ${esc(CH_NAME[k] || k)}
          <span class="chip tiny">${S.board.posts.filter((p) => p.channel === k).length}</span>
        </button>`).join('')}</div>
      <p class="muted small tm-hint">포스팅 전 미리보기 — 실제 ${esc(CH_NAME[chKey] || chKey)}에 올라갈 글·이미지 배치를 확인하세요.</p>
      <div class="tm-pool">
        <b class="small">outputs/creatives ${allCreatives.length}장</b>
        ${allCreatives.length
          ? `<div class="tm-pool-strip" id="tm-pool">${allCreatives.slice(0, 24).map((f) =>
            `<img class="tm-pool-thumb" data-rel="${esc(String(f.rel || '').replace(/\\/g, '/'))}" src="${satUrl(f.rel)}" alt="${esc(f.name || '')}" title="${esc(f.name || f.rel)}" loading="lazy">`).join('')}</div>`
          : '<span class="chip tiny pub-ready no">아직 생성된 이미지 파일이 없습니다 — 비주얼 생성을 실행하세요</span>'}
        <button type="button" class="chip" id="tm-open-creatives">이미지 폴더 열기</button>
        <button type="button" class="chip" id="tm-reload-previews">미리보기 새로고침</button>
      </div>
    </div>
    <div class="tm-feed" id="tm-feed">
      ${posts.length ? posts.map((p) => `
        <div class="tm-slot" data-uid="${esc(p.uid)}">
          <div class="tm-slot-meta">
            <b>${cardId(p)}</b>
            <span class="chip tiny">${STAGE_LABEL[p.stage] || p.stage}</span>
            ${p.published ? '<span class="chip tiny pub-ready ok">발행됨</span>' : ''}
            ${readinessChips(p)}
          </div>
          <div class="tm-mock" data-uid="${esc(p.uid)}"><p class="muted small">미리보기 준비 중…</p></div>
          <div class="tm-asset-bar" data-uid="${esc(p.uid)}"><span class="muted small">이미지 연결 중…</span></div>
          <p class="muted small tm-loading" data-uid="${esc(p.uid)}">본문·이미지 불러오는 중…</p>
          <div class="tm-slot-actions">
            <button type="button" class="chip accent tm-review" data-uid="${esc(p.uid)}">발행 검토</button>
            <button type="button" class="chip tm-insp" data-uid="${esc(p.uid)}">카드 상세</button>
            <button type="button" class="chip tm-visual" data-uid="${esc(p.uid)}">비주얼 생성</button>
          </div>
        </div>`).join('') : `<div class="tm-empty muted">${esc(CH_NAME[chKey] || chKey)} 포스트가 없습니다. 캘린더에 편성하거나 필터를 바꿔보세요.</div>`}
    </div>`;
  const openCr = $('#tm-open-creatives', root);
  if (openCr) openCr.onclick = () => window.api.ws.openFolder(S.client.dir + '/outputs/creatives');
  const reloadBtn = $('#tm-reload-previews', root);
  if (reloadBtn) reloadBtn.onclick = () => renderTemplateBoard(true);
  // 풀 썸네일 — 작은 미리보기 IPC (원본 base64는 OOM 유발)
  (async () => {
    const thumbs = $$('.tm-pool-thumb', root);
    await Promise.all(thumbs.map(async (im) => {
      const rel = (im.dataset.rel || '').replace(/\\/g, '/');
      if (!rel) return;
      try {
        const r = window.api.ws.readImage
          ? await window.api.ws.readImage(S.client.dir, rel, 160)
          : await window.api.ws.readFile(S.client.dir, rel);
        if (r && r.ok && r.dataUrl) im.src = r.dataUrl;
      } catch { /* keep sat */ }
    }));
  })();
  for (const btn of $$('.tm-tab', root)) {
    btn.onclick = () => {
      S.templateCh = btn.dataset.ch;
      S.filter = S.templateCh;
      renderChannels();
      renderTemplateBoard(true);
    };
  }
  for (const btn of $$('.tm-review', root)) {
    btn.onclick = () => {
      const p = S.board.posts.find((x) => x.uid === btn.dataset.uid);
      if (!p) return;
      const direct = (S.channels && S.channels.direct && S.channels.direct[p.channel]) || {};
      openPublishPanel(p.channel);
      setTimeout(() => openCompose(p.channel, p, direct), 0);
    };
  }
  for (const btn of $$('.tm-insp', root)) {
    btn.onclick = () => {
      const p = S.board.posts.find((x) => x.uid === btn.dataset.uid);
      if (p) openInspector(p);
    };
  }
  for (const btn of $$('.tm-visual', root)) {
    btn.onclick = () => {
      const p = S.board.posts.find((x) => x.uid === btn.dataset.uid);
      if (!p) return;
      openInspector(p);
      setTimeout(() => openRenderPanel(p), 0);
    };
  }
  // 본문·이미지를 병렬로 주입 (draft 대기에 이미지 로드가 막히지 않게)
  renderTemplateBoard._gen = (renderTemplateBoard._gen || 0) + 1;
  const gen = renderTemplateBoard._gen;
  await Promise.all(posts.map(async (p) => {
    try {
      const imgs = postRenderRels(p);
      const [draft, srcs] = await Promise.all([
        window.api.pub2.draft(S.client.dir, p.lane, p.topic).catch((e) => ({ ok: false, error: String(e && e.message || e) })),
        resolveImageSrcs(imgs),
      ]);
      if (renderTemplateBoard._gen !== gen || S.view !== 'template') return;
      const mock = $$('.tm-mock', root).find((el) => el.dataset.uid === p.uid);
      const load = $$('.tm-loading', root).find((el) => el.dataset.uid === p.uid);
      const bar = $$('.tm-asset-bar', root).find((el) => el.dataset.uid === p.uid);
      if (load) load.remove();
      if (!mock) return;
      mock.innerHTML = channelMock(chKey, {
        text: draft && draft.ok ? draft.text : '',
        title: draft && draft.ok ? (draft.title || '') : '',
        topic: p.topic,
        images: imgs,
        imageSrcs: srcs,
        compact: false,
      });
      if (bar) {
        if (!imgs.length) {
          bar.innerHTML = '<span class="chip tiny pub-ready no">이미지 없음 — 「비주얼 생성」또는 상단 creatives 확인</span>';
        } else {
          const shown = srcs.filter(Boolean).length;
          bar.innerHTML = `<span class="chip tiny pub-ready ${shown ? 'ok' : 'no'}">이미지 ${imgs.length}장${shown ? ` · 표시 ${shown}` : ' · 로드 실패'}</span>`
            + srcs.slice(0, 4).map((src, i) =>
              `<img class="tm-asset-thumb" src="${src}" alt="${esc((imgs[i] || '').split(/[\\/]/).pop() || '')}" title="${esc(imgs[i] || '')}" loading="lazy">`).join('')
            + `<span class="muted small">${esc(imgs.map((r) => r.split(/[\\/]/).pop()).join(', '))}</span>`;
        }
      }
      if (!draft || !draft.ok) {
        const note = document.createElement('p');
        note.className = 'muted small';
        note.style.color = 'var(--warn)';
        note.textContent = '본문 초안 없음 — 토픽만 표시 중. 카피 단계를 실행하세요.';
        mock.after(note);
      }
    } catch (e) {
      const mock = $$('.tm-mock', root).find((el) => el.dataset.uid === p.uid);
      if (mock) mock.innerHTML = `<p class="muted small" style="color:var(--warn)">미리보기 실패: ${esc(e.message || e)}</p>`;
    }
  }));
  if (renderTemplateBoard._gen === gen) root.dataset.hydrated = '1';
}
function renderBoardViews(flip, moved) {
  const b = S.board; if (!b) return;
  const rects = new Map();
  const root = S.view === 'kanban' ? '#kanban ' : (S.view === 'month' ? '#month-cal ' : (S.view === 'template' ? '#template-board ' : '#timeline '));
  if (flip && S.view !== 'month' && S.view !== 'template') for (const el of $$(root + '.post-card')) rects.set(el.dataset.key, el.getBoundingClientRect());
  if (S.view === 'kanban') { renderKanban(); S.viewDirty.timeline = true; S.viewDirty.month = true; S.viewDirty.template = true; }
  else if (S.view === 'month') { renderMonthCalendar(); S.viewDirty.timeline = true; S.viewDirty.kanban = true; S.viewDirty.template = true; }
  else if (S.view === 'template') { renderTemplateBoard(false); S.viewDirty.timeline = true; S.viewDirty.kanban = true; S.viewDirty.month = true; }
  else { renderTimeline(); S.viewDirty.kanban = true; S.viewDirty.month = true; S.viewDirty.template = true; }
  S.viewDirty[S.view] = false;
  // FLIP — 읽기(rect)를 전부 모은 뒤 쓰기(transform) — 카드당 강제 리플로우 방지
  if (flip && rects.size) {
    requestAnimationFrame(() => {
      const moves = [];
      for (const el of $$(root + '.post-card')) {
        const old = rects.get(el.dataset.key);
        if (!old || (!old.width && !old.height)) continue; // hidden-view zero rects
        const now = el.getBoundingClientRect();
        const dx = old.left - now.left, dy = old.top - now.top;
        if (dx || dy) moves.push([el, dx, dy]);
      }
      moves.forEach(([el, dx, dy], i) => {
        el.style.transform = `translate(${dx}px,${dy}px)`;
        el.style.transition = 'none';
        setTimeout(() => {
          el.style.transition = 'transform .35s cubic-bezier(.2,.8,.2,1)';
          el.style.transform = '';
        }, 80 * (i % 5) + 20);
      });
    });
  }
}
const INDEX_PROMPT = 'context/content-calendar.md를 읽고, 앱 보드가 파싱할 수 있게 context/calendar-index.json과 context/calendar-meta.json을 만들어줘. index 형식: {"posts":[{"id":"IG-1","week":1,"day":"화","scheduledDate":"YYYY-MM-DD","scheduledTime":"HH:mm","platform":"Instagram","pillar":"...","format":"multi-image","objective":"...","topic":"...","angle":"...","visual":"...","notes":"..."}]}. meta 형식: {"year":숫자,"month":숫자,"anchor":"YYYY-MM-DD","weekStartsOn":"monday"}. scheduledDate는 캘린더 본문의 주차·요일을 실제 달력 날짜로 환산해 채워 — 예시 문자열을 복사하지 말고, 캘린더에 명시된 월이 없으면 오늘 날짜 기준 미래 날짜로. 메인 채널: Instagram, Threads, Naver Blog, Naver Clip, Kakao Channel. 같은 날 여러 채널 포스트는 scheduledDate를 같게 두고 scheduledTime으로 구분. JSON 외 다른 내용은 파일에 넣지 마.';
function renderHero() {
  const b = S.board;
  const hero = $('#hero');
  const parseFailed = !!(S.client && b && b.hasCalendar && !b.posts.length);
  const showHero = !S.client || !b || !b.hasCalendar || parseFailed;
  hero.classList.toggle('hidden', !showHero);
  $('#timeline').classList.toggle('hidden', showHero || S.view !== 'timeline');
  $('#kanban').classList.toggle('hidden', showHero || S.view !== 'kanban');
  $('#month-cal').classList.toggle('hidden', showHero || S.view !== 'month');
  const tb = $('#template-board');
  if (tb) tb.classList.toggle('hidden', showHero || S.view !== 'template');
  if (!showHero) return;
  if (!S.client) {
    hero.innerHTML = `<div class="hero-card"><h3>클라이언트로 시작하세요</h3><p>좌측 레일의 + 버튼으로 클라이언트 폴더를 만들면, 팀이 그 폴더 안에서 브랜드·캘린더·콘텐츠를 관리합니다.</p></div>`;
    return;
  }
  if (b && b.error) {
    // 보드 계산 실패를 '빈 프로젝트'로 위장하지 않는다
    hero.innerHTML = `<div class="hero-card" style="width:420px"><h3>보드를 계산하지 못했어요</h3>
      <p>${esc(String(b.error).slice(0, 200))}</p>
      <div class="btn-grid"><button id="hero-retry">다시 읽기</button><button id="hero-logs">로그 폴더 열기</button></div></div>`;
    $('#hero-retry').onclick = () => refreshBoard(true);
    $('#hero-logs').onclick = () => window.api.app.openLogs();
    return;
  }
  if (parseFailed) {
    const laneCounts = Object.entries(b.lanes || {}).filter(([, f]) => f.length).map(([l, f]) => `${l} ${f.length}`).join(' · ');
    hero.innerHTML = `<div class="hero-card" style="width:420px"><h3>캘린더는 있는데, 보드가 읽지 못했어요</h3>
      <p>content-calendar.md의 형식이 파서와 달라 포스트를 추출하지 못했습니다.<br>
      아래 버튼을 누르면 디렉터가 <b>보드용 인덱스(calendar-index.json)</b>를 만들어주고, 파일이 생기는 즉시 카드가 나타납니다.${laneCounts ? `<br><br>발견된 산출물: ${laneCounts} — 우측 상단 서랍 아이콘에서 내용 확인 가능` : ''}</p>
      <div class="btn-grid"><button data-act="chat" data-t="${esc(INDEX_PROMPT)}">디렉터에게 보드 인덱스 생성 요청</button>
      <button data-act="drawer">산출물 서랍 열기</button></div></div>`;
    for (const btn of $$('#hero button[data-act]')) {
      btn.onclick = () => {
        if (btn.dataset.act === 'chat') {
          if (S.chatBusy) { toast('디렉터가 이미 작업 중입니다 — 완료를 기다려주세요'); switchDock('chat'); return; }
          prefillChat(btn.dataset.t); sendChat();
        }
        else if (btn.dataset.act === 'drawer') openDrawer();
      };
    }
    return;
  }
  const f = b.foundation;
  const card = (title, done, desc, btns) => `
    <div class="hero-card"><h3>${title} <span class="badge ${done ? 'ok' : 'no'}" style="float:right">${done ? '완료' : '필요'}</span></h3><p>${desc}</p>
    <div class="btn-grid">${btns}</div></div>`;
  hero.innerHTML =
    card('① 브랜드 스타일', f.brand, '브랜드의 목소리·팔레트·필러를 담는 팀의 단일 진실 공급원입니다. 질문지에 한 번에 답하면 인터뷰 없이 완성됩니다.',
      `<button data-act="obsheet" class="cta" style="padding:8px 14px">📋 질문지로 온보딩 (빠름)</button><button data-act="refsite">레퍼런스 사이트 분석</button><button data-act="chat" data-t="브랜드 온보딩 인터뷰를 시작해줘. 질문을 하나씩 해줘.">대화형 인터뷰</button>`) +
    card('② 보이스 프로파일', f.voice, '해요체/합쇼체, 금지 표현, 이모지 정책 — 질문지 온보딩이 초안까지 함께 만듭니다.',
      `<button data-act="chat" data-t="kr-voice-localizer 보이스 프로파일 인테이크를 시작해줘.">정밀 인테이크 (선택)</button>`) +
    card('③ 콘텐츠 캘린더', f.calendar, '이번 달 포스트 편성표. 이게 생기면 보드에 카드가 나타납니다.',
      `<button data-act="stage" data-s="calendar" ${f.brand ? '' : 'disabled title="브랜드 스타일이 먼저 필요합니다"'}>캘린더 생성 실행</button>`);
  for (const btn of $$('#hero button[data-act]')) {
    btn.onclick = (e) => {
      if (btn.dataset.act === 'chat') prefillChat(btn.dataset.t);
      else if (btn.dataset.act === 'obsheet') openOnboardSheet();
      else if (btn.dataset.act === 'term') window.api.pipe.openTerminal(S.client.dir);
      else if (btn.dataset.act === 'stage') runStage(btn.dataset.s);
      else if (btn.dataset.act === 'refsite') {
        if (popover(e.currentTarget, `<b>레퍼런스 사이트 분석</b>
          <p class="muted small" style="margin:6px 0">홈페이지·블로그·경쟁사 URL을 넣으면 수집·분석해 브랜드 초안을 준비합니다. (SNS 페이지는 수집이 제한될 수 있어요)</p>
          <textarea id="pop-ref-urls" rows="3" placeholder="https://…&#10;줄바꿈으로 여러 개" style="width:100%;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:7px 9px;color:var(--text);font-size:12px;resize:vertical"></textarea>
          <button id="pop-ref-go" style="margin-top:8px;width:100%">분석 시작</button>`)) {
          $('#pop-ref-go').onclick = () => {
            const urls = $('#pop-ref-urls').value.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
            if (!urls.length) { toast('URL을 입력하세요'); return; }
            hidePopover();
            runRefAnalysis(S.client.dir, urls);
          };
          $('#pop-ref-urls').focus();
        }
      }
    };
  }
}

// ---- 질문지 온보딩 시트 (1차 폼 → 2차 일괄 후속질문 → 합성) ---------------------------------
let obSeq = 0; // 시트를 닫고 다시 열었을 때 이전 시트의 미완료 async 콜백이 새 시트를 덮지 않게
async function openOnboardSheet() {
  if (!S.client) { toast('클라이언트를 먼저 선택하세요'); return; }
  const session = ++obSeq;
  const sheet = $('#sheet-onboard');
  const dir = S.client.dir;
  // 이 시트 인스턴스가 아직 화면의 주인인가 — 아니면 DOM을 건드리지 않는다
  const live = () => session === obSeq && !sheet.classList.contains('hidden');
  const qs = await window.api.ob.questions();
  if (!Array.isArray(qs)) { toast('질문지를 불러오지 못했습니다'); return; }

  const field = (it) => {
    if (it.type === 'multi') return `<div class="ob-chips" data-id="${it.id}">${it.options.map((o) => `<button type="button" class="chip ob-opt" data-v="${esc(o)}">${esc(o)}</button>`).join('')}</div>`;
    if (it.type === 'choice') return `<div class="ob-chips ob-single" data-id="${it.id}">${it.options.map((o) => `<button type="button" class="chip ob-opt" data-v="${esc(o)}">${esc(o)}</button>`).join('')}</div>`;
    if (it.type === 'textarea') return `<textarea class="rp-input ob-in" data-id="${it.id}" rows="2" placeholder="${esc(it.ph || '')}"></textarea>`;
    return `<input class="rp-input ob-in" data-id="${it.id}" placeholder="${esc(it.ph || '')}">`;
  };
  sheet.innerHTML = `
    <div class="sheet-head"><h2>질문지 온보딩 — ${esc(S.client.name)}</h2>
      <span class="chip tiny muted">아는 것만 답하세요 — 빈칸은 레퍼런스 분석과 기본값으로 보완됩니다</span>
      <button class="icon-btn" id="ob-close"><svg><use href="#i-close"/></svg></button></div>
    <div class="sheet-body" id="ob-body">
      ${qs.map((sec) => `<div class="ob-section"><b>${esc(sec.section)}</b>
        ${sec.items.map((it) => `<div class="ob-row"><label class="small">${esc(it.q)}</label>${field(it)}</div>`).join('')}
      </div>`).join('')}
    </div>
    <div class="appr-foot">
      <span class="muted small" id="ob-status"></span>
      <div style="flex:1"></div>
      <button id="ob-next" class="accent" style="padding:10px 18px">다음 → 후속 질문 (한 번에)</button>
    </div>`;
  $('#ob-close').onclick = closeOverlay;
  // 칩 토글 (multi) / 단일 선택 (choice)
  for (const box of $$('.ob-chips', sheet)) {
    for (const b of $$('.ob-opt', box)) b.onclick = () => {
      if (box.classList.contains('ob-single')) $$('.ob-opt', box).forEach((x) => x.classList.toggle('on', x === b && !b.classList.contains('on')));
      else b.classList.toggle('on');
    };
  }
  const collect = (root) => {
    const answers = {};
    for (const inp of $$('.ob-in', root)) if (inp.value.trim()) answers[inp.dataset.id] = inp.value.trim();
    for (const box of $$('.ob-chips', root)) {
      const on = $$('.ob-opt.on', box).map((b) => b.dataset.v);
      if (on.length) answers[box.dataset.id] = box.classList.contains('ob-single') ? on[0] : on;
    }
    return answers;
  };

  $('#ob-next').onclick = async () => {
    const answers = collect(sheet);
    if (!Object.keys(answers).length && !confirm2('아무것도 답하지 않았습니다. 레퍼런스 분석과 기본값만으로 진행할까요?')) return;
    const btn = $('#ob-next');
    btn.disabled = true; btn.textContent = '후속 질문 생성 중… (1회 생각으로 한꺼번에)';
    $('#ob-status').textContent = '답변의 공백·모호한 부분만 골라 묻습니다';
    let fu = { questions: [] };
    try { fu = await window.api.ob.followups(dir, answers); } catch { /* 후속 없이 진행 */ }
    // 시트가 닫혔거나 새 시트가 열렸으면 여기서 멈춘다 — 자동 합성으로 이어가지 않는다
    if (!live()) { toast('온보딩 시트가 닫혀 진행을 중단했습니다 — 다시 열면 답변부터 재시작합니다'); return; }
    if (fu && fu.error) { toast(fu.error); btn.disabled = false; btn.textContent = '다음 → 후속 질문 (한 번에)'; return; }
    renderFollowups(answers, (fu && fu.questions) || [], fu && fu.note);
  };

  // 간단 확인 (window.confirm은 Electron에서 포커스 문제가 있어 인라인로).
  // 답변을 입력하고 누르면 확인 플래그를 초기화한다 — 한 번 빈손으로 눌렀다고 영구 통과되지 않게.
  function confirm2(msg) {
    const btn = $('#ob-next');
    const again = btn.dataset.again === '1';
    btn.dataset.again = '1';
    setTimeout(() => { btn.dataset.again = '0'; }, 8000); // 8초 내 재클릭만 인정
    if (!again) $('#ob-status').textContent = msg + ' — 다시 누르면 진행합니다';
    return again;
  }

  function renderFollowups(answers, questions, note) {
    if (!questions.length) {
      // 실패로 인한 0개(note 있음)와 "답변 충분" 0개를 구별해 보이게
      toast(note || '답변이 충분해 후속 질문 없이 바로 합성합니다');
      runFinalize(answers, {});
      return;
    }
    $('#ob-body').innerHTML = `
      <p class="muted small" style="margin-bottom:12px">답변을 검토해 <b>${questions.length}개</b>만 더 묻습니다 — 전부 한 번에 답하면 끝납니다.${note ? ' (' + esc(note) + ')' : ''}</p>
      ${questions.map((f) => `<div class="ob-row"><label class="small">${esc(f.q)}</label>
        ${f.type === 'choice'
          ? `<div class="ob-chips ob-single" data-id="${esc(f.id)}" data-q="${esc(f.q)}">${(f.options || []).map((o) => `<button type="button" class="chip ob-opt" data-v="${esc(o)}">${esc(o)}</button>`).join('')}</div>
             <input class="rp-input ob-in" data-id="${esc(f.id)}__free" data-q="${esc(f.q)}" placeholder="또는 직접 입력">`
          : `<input class="rp-input ob-in" data-id="${esc(f.id)}" data-q="${esc(f.q)}" placeholder="모르면 비워두세요">`}
      </div>`).join('')}`;
    for (const box of $$('.ob-chips', sheet)) for (const b of $$('.ob-opt', box)) b.onclick = () => $$('.ob-opt', box).forEach((x) => x.classList.toggle('on', x === b && !b.classList.contains('on')));
    const btn = $('#ob-next');
    btn.disabled = false; btn.textContent = '온보딩 완성 (일괄 합성)';
    $('#ob-status').textContent = '';
    btn.onclick = () => {
      const fa = {};
      for (const inp of $$('.ob-in', $('#ob-body'))) if (inp.value.trim()) fa[inp.dataset.q || inp.dataset.id] = inp.value.trim();
      for (const box of $$('.ob-chips', $('#ob-body'))) {
        const on = $$('.ob-opt.on', box)[0];
        if (on && !fa[box.dataset.q]) fa[box.dataset.q || box.dataset.id] = on.dataset.v;
      }
      runFinalize(answers, fa);
    };
  }

  async function runFinalize(answers, followupAnswers) {
    const btn = $('#ob-next');
    btn.disabled = true; btn.textContent = '합성 중… brand-style + 보이스 초안';
    $('#ob-status').textContent = '질의응답 없이 문서를 한 번에 만듭니다 (수 분 소요)';
    try {
      const r = await window.api.ob.finalize(dir, answers, followupAnswers);
      if (!live()) {
        // 시트가 닫혔어도 합성은 main에서 완료됐다 — 결과만 알리고 DOM은 건드리지 않는다
        if (r && r.ok) { toast('✔ 온보딩이 백그라운드에서 완료됐습니다 — brand-style.md 준비됨'); if (S.client && S.client.dir === dir) refreshBoard(false); }
        else toast('온보딩 합성 실패: ' + ((r && r.error) || '알 수 없음'));
        return;
      }
      if (r && r.ok) {
        $('#ob-body').innerHTML = `<div class="hero-card" style="margin:20px auto;max-width:460px"><h3>✔ 온보딩 완료</h3>
          <p style="line-height:1.7">brand-style.md가 준비됐습니다.${r.voiceDrafted ? '<br>kr-voice-profile.md 초안도 함께 생성됐습니다.' : ''}<br>
          답변 원본은 <code>${esc(r.record)}</code>에 저장됐습니다.<br><br>이제 게이트 바에서 <b>캘린더 생성</b>을 실행하세요.</p></div>`;
        btn.textContent = '닫기'; btn.disabled = false;
        btn.onclick = () => { closeOverlay(); refreshBoard(true); };
        refreshBoard(false);
      } else {
        toast((r && r.error) || '합성 실패');
        btn.disabled = false; btn.textContent = '다시 시도';
        btn.onclick = () => runFinalize(answers, followupAnswers);
      }
    } catch (e) {
      if (!live()) { toast('온보딩 합성 실패: ' + e.message); return; }
      toast('합성 실패: ' + e.message);
      btn.disabled = false; btn.textContent = '다시 시도';
      btn.onclick = () => runFinalize(answers, followupAnswers);
    }
  }

  openSheet('#sheet-onboard');
}

// ---- gates (존 D) ----------------------------------------------------------------------
function renderGateBar() {
  const g = S.gates; const box = $('#gate-steps'); box.innerHTML = '';
  if (!g) { $('#gate-cta').disabled = true; return; }
  g.nodes.forEach((n, i) => {
    const el = document.createElement('div');
    el.className = 'gate-node' + (i < g.current ? ' done' : '') + (i === g.current ? ' current' : '') + (n.blocked ? ' blockedd' : '');
    el.innerHTML = `<span class="gn-circle">${i < g.current ? '<svg><use href="#i-check"/></svg>' : (n.blocked ? '<svg><use href="#i-warn"/></svg>' : i + 1)}</span><span class="gn-label">${n.label}</span>` + (i < g.nodes.length - 1 ? `<span class="gn-link ${i < g.current ? 'done' : ''}"></span>` : '');
    el.title = n.approved ? '승인됨' : (n.done ? '증거 확인됨' : '대기');
    el.onclick = () => showGateInfo(el, n, i);
    pressable(el);
    box.appendChild(el);
  });
  renderCTA();
  drawWire();
}
function showGateInfo(el, n, i) {
  const appr = (S.gates.approvals || []).find((a) => a.node === n.key);
  // 실행 버튼은 도달 가능한 노드까지만 — 앞 게이트의 도장을 우회해 뒷 단계를 돌리지 못하게
  const reachable = typeof i === 'number' ? i <= S.gates.current : true;
  popover(el, `<b>${n.label}</b><p class="muted" style="margin-top:4px">${n.done ? '파일 증거 확인됨' : '아직 산출물 없음'}${appr ? `<br>승인: ${new Date(appr.approvedAt).toLocaleString('ko-KR')}` : ''}</p>` + (n.stage && !S.running && reachable ? `<button id="pop-run" style="margin-top:8px">이 단계 실행</button>` : (n.stage && !reachable ? '<p class="muted small" style="margin-top:6px">앞 게이트 승인 후 실행할 수 있습니다</p>' : '')));
  const b = $('#pop-run'); if (b) b.onclick = () => { hidePopover(); runStage(n.stage); };
}
function renderCTA() {
  const cta = $('#gate-cta'); const label = $('span', cta); const icon = $('use', cta);
  cta.classList.remove('stop', 'approve');
  if (!S.client || !S.gates) { cta.disabled = true; label.textContent = '—'; return; }
  const nodeCheck = S.gates.nodes && S.gates.nodes[S.gates.current];
  if (!nodeCheck) { cta.disabled = true; label.textContent = S.gates.error ? '게이트 오류 — 로그 확인' : '—'; return; }
  cta.disabled = false;
  if (S.running) {
    cta.classList.add('stop'); icon.setAttribute('href', '#i-stop');
    label.textContent = `중지 · ${fmtDur(Date.now() - S.runStart)}`;
    cta.onclick = async () => {
      const dir = S.client && S.client.dir;
      if (S.auto) { await window.api.auto.stop(dir); } // 오토파일럿 중이면 파일럿째 중지 (다음 단계로 안 넘어가게)
      else await window.api.pipe.stop(dir);
      setRunning(null);
    };
    return;
  }
  icon.setAttribute('href', '#i-play');
  const n = S.gates.nodes[S.gates.current];
  const needsStamp = ['calendar', 'copy', 'verify', 'compliance'].includes(n.key);
  if (n.key === 'foundation') { label.textContent = '온보딩 인터뷰 시작'; cta.onclick = () => prefillChat('브랜드 온보딩 인터뷰를 시작해줘. 질문을 하나씩 해줘.'); }
  else if (n.done && needsStamp && !n.approved) { cta.classList.add('approve'); icon.setAttribute('href', '#i-stamp'); label.textContent = `${n.label} 검토 → 승인`; cta.onclick = () => openApproveSheet(n); }
  else if (n.key === 'publish') {
    label.textContent = '발행 · 월말 리뷰';
    cta.onclick = (e) => {
      const direct = (S.channels && S.channels.direct) || {};
      const connected = Object.entries(direct).filter(([, v]) => v.connected).map(([k]) => CH_NAME[k] || k);
      if (popover(e.currentTarget, `<b>발행 단계</b><p class="muted" style="margin:6px 0">${connected.length
        ? `API 연결: ${connected.join(', ')} — 채널 카드의 배지에서 발행 패널을 여세요.`
        : '설정 → 채널에서 API 토큰을 연결하면 앱에서 바로 발행·예약할 수 있습니다.'}<br>Instagram·네이버는 수동 체크리스트로 발행합니다.</p>
        <div style="display:flex;flex-direction:column;gap:6px">
        ${connected.length ? '' : '<button id="pop-connect">채널 API 연결하기</button>'}
        <button id="pop-review">월말 성과 리뷰 실행</button></div>`)) {
        const pc = $('#pop-connect'); if (pc) pc.onclick = () => { hidePopover(); openSettings('channels'); };
        $('#pop-review').onclick = () => { hidePopover(); runStage('review'); };
      }
    };
  }
  else if (n.stage) { label.textContent = `${n.label} 실행`; cta.onclick = (e) => confirmRun(e.currentTarget, n.stage, n.label); }
  else { cta.disabled = true; label.textContent = n.label; }
}
function confirmRun(anchor, stage, name) {
  popover(anchor, `<b>${name} 실행</b><p class="muted" style="margin:6px 0">팀이 클라이언트 폴더에서 작업을 시작합니다.</p>
    <input id="pop-extra" placeholder="추가 지시 (선택)" style="width:100%;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:7px 9px;color:var(--text);font-size:12px">
    <button id="pop-go" style="margin-top:8px;width:100%">▶ 실행</button>`);
  $('#pop-go').onclick = () => { const extra = $('#pop-extra').value.trim(); hidePopover(); runStage(stage, extra); };
}
async function runStage(stage, extra) {
  if (S.running) { toast('다른 단계가 실행 중입니다'); return; }
  if (S.auto) { toast('오토파일럿 실행 중입니다 — 중지 후 개별 실행하세요'); return; }
  if (S.chatBusy) { toast('디렉터 응답을 기다리는 중입니다 — 잠시 후 실행하세요'); return; }
  setRunning(stage);
  switchDock('log');
  logLine(stage, `▶ 실행 시작 — ${S.client.name}`);
  try {
    const r = await window.api.pipe.runStage(S.client.dir, stage, extra ? { extraContext: extra } : {});
    S.lastRunStart[stage] = r.startedAt || Date.now() - 60000;
    logLine(stage, r.ok ? '✔ 완료' : `✖ 실패 (${r.code ?? '-'}): ${(r.tail || r.out || r.error || '').slice(0, 200)}`);
    if (!r.ok && (r.tail || r.out || r.error)) toast((r.tail || r.out || r.error).slice(0, 120));
  } catch (e) {
    logLine(stage, '✖ 오류: ' + e.message);
  } finally {
    if (S.running === stage) setRunning(null);
  }
  await refreshBoard(false);
}
$('#gate-checklist').onclick = async (e) => {
  if (!S.client) { toast('클라이언트를 먼저 선택하세요'); return; }
  const st = await window.api.ws.status(S.client.dir);
  const items = (st.statusItems || []).map((i) => `<div style="padding:2px 0">${i.done ? '✅' : '⬜'} ${esc(i.label)}</div>`).join('') || '<span class="muted">기록 없음</span>';
  popover(e.currentTarget, `<b>워크플로 체크리스트</b><div style="margin-top:8px;max-height:300px;overflow-y:auto;font-size:12px">${items}</div>`);
};
// ---- 오토파일럿: 승인 게이트 앞까지 자동 진행 --------------------------------------
$('#gate-auto').onclick = (e) => {
  if (!S.client) { toast('클라이언트를 먼저 선택하세요'); return; }
  if (S.auto) { window.api.auto.stop(S.client.dir); return; } // 실행 중이면 중지
  if (S.running) { toast('단계 실행 중에는 오토파일럿을 시작할 수 없습니다'); return; }
  const b = S.board;
  if (!b || !b.foundation || !b.foundation.brand) { toast('브랜드 스타일이 먼저 필요합니다 — 온보딩을 진행하세요'); return; }
  popover(e.currentTarget, `<b>오토파일럿</b>
    <p class="muted small" style="margin:6px 0;line-height:1.6">캘린더 → 카피 → 릴스 → 비주얼 브리프 → 컴플라이언스까지, 증거가 없는 단계를 자동으로 이어서 실행합니다.
    <b>승인 도장이 필요한 지점(캘린더·카피·비주얼)에서는 멈추고</b> 알림을 보냅니다. 이미지 생성은 비주얼 브리프 승인 후에만 진행합니다.</p>
    <button id="pop-auto-go" style="margin-top:6px;width:100%">▶ 오토파일럿 시작</button>`);
  $('#pop-auto-go').onclick = () => { hidePopover(); startAutopilot(); };
};
async function startAutopilot() {
  const dir = S.client.dir;
  S.autoByDir[dir] = true;
  if (S.client && S.client.dir === dir) { S.auto = true; updateAutoBtn(); }
  updateBgBanner();
  switchDock('log');
  logLine('autopilot', '▶ 오토파일럿 시작 — 승인 게이트 앞까지 자동 진행');
  try {
    const r = await window.api.auto.run(dir);
    if (r && r.error) toast('오토파일럿: ' + r.error);
  } catch (e) {
    logLine('autopilot', '✖ 오류: ' + e.message);
  } finally {
    delete S.autoByDir[dir];
    if (S.client && S.client.dir === dir) { S.auto = false; updateAutoBtn(); await refreshBoard(false); }
    updateBgBanner();
  }
}
function updateAutoBtn() {
  const btn = $('#gate-auto');
  btn.classList.toggle('active', S.auto);
  btn.innerHTML = S.auto
    ? '<svg style="width:13px;height:13px;vertical-align:-2px"><use href="#i-stop"/></svg> 오토파일럿 중지'
    : '<svg style="width:13px;height:13px;vertical-align:-2px"><use href="#i-auto"/></svg> 오토파일럿';
}
window.api.onAuto((ev) => {
  if (!ev || !ev.dir) return;
  // 모든 클라이언트의 오토파일럿 상태를 맵에 추적 (백그라운드 포함)
  const terminal = ['done', 'failed', 'stopped', 'paused'].includes(ev.state);
  if (ev.state === 'start' || ev.state === 'stage') S.autoByDir[ev.dir] = true;
  else if (terminal) delete S.autoByDir[ev.dir];
  if (S.client && ev.dir === S.client.dir) { S.auto = !!S.autoByDir[ev.dir]; if (terminal) updateAutoBtn(); }
  updateBgBanner();
  if (!S.client || ev.dir !== S.client.dir) return; // 로그는 뷰 클라이언트만
  if (ev.state === 'stage') logLine('autopilot', `▸ ${STAGE_LABEL[STAGE2COL[ev.stage]] || ev.stage} 단계 실행`);
  else if (ev.state === 'skip') logLine('autopilot', `⤳ ${STAGE_LABEL[STAGE2COL[ev.stage]] || ev.stage} — 이미 완료됨, 건너뜀`);
  else if (ev.state === 'paused') { logLine('autopilot', `⏸ 일시정지 — ${ev.message}`); toast(ev.message); }
  else if (ev.state === 'done') { logLine('autopilot', `✔ ${ev.message}`); toast(ev.message); }
  else if (ev.state === 'failed') { logLine('autopilot', `✖ ${ev.message}`); toast('오토파일럿 중단: ' + ev.message); }
  else if (ev.state === 'stopped') logLine('autopilot', '■ 사용자 중지');
});

// ---- approval sheet + 도장 ------------------------------------------------------------------
function reopenApproveSheet(node) {
  if (S.stampHolding) return; // 도장을 누르는 중 — 재구성으로 홀드를 끊지 않는다
  const checked = new Set($$('.warn-sign').filter((c) => c.checked).map((c) => c.dataset.n));
  const selRel = ($('#appr-list .file-row.sel') || {}).dataset ? $('#appr-list .file-row.sel').dataset.rel : null;
  openApproveSheet(node, selRel);
  for (const c of $$('.warn-sign')) if (checked.has(c.dataset.n)) c.checked = true;
}
function openApproveSheet(node, restoreRel) {
  // innerHTML 교체 전에 진행 중인 도장 타이머를 반드시 끊는다 — 고아 인터벌이
  // detach된 버튼으로 승인을 강행하는 사고 방지
  if (typeof currentStampReset === 'function') currentStampReset();
  const sheet = $('#sheet-approve');
  const isCompliance = node.key === 'compliance';
  const isVerify = node.key === 'verify';
  S.approveNode = node.key;
  let files = [];
  if (node.key === 'calendar') {
    files = [{ name: 'content-calendar.md', rel: 'context/content-calendar.md', mtime: Date.now(), lane: 'context' }];
  } else {
    const since = S.lastRunStart[node.stage] || Date.now() - 24 * 3600e3;
    for (const [lane, fl] of Object.entries(S.board.lanes || {})) for (const f of fl) if (f.mtime >= since) files.push({ ...f, lane });
    files.sort((a, b) => b.mtime - a.mtime);
    if (!files.length) { // 컷오프에 걸리는 파일이 없으면 최근 산출물로 폴백 — 빈 시트에 도장 찍게 하지 않는다
      for (const [lane, fl] of Object.entries(S.board.lanes || {})) for (const f of fl) files.push({ ...f, lane });
      files.sort((a, b) => b.mtime - a.mtime);
      files = files.slice(0, 12);
    }
  }
  const warnPosts = S.board.posts.filter((p) => p.verdict === 'WARN');
  const blockPosts = S.board.posts.filter((p) => p.verdict === 'BLOCK');

  sheet.innerHTML = `
    <div class="sheet-head"><h2>${node.label} 승인 게이트</h2>
      ${isCompliance ? `<span class="chip" style="color:var(--ok)">PASS ${S.board.compliance.pass}</span><span class="chip" style="color:var(--warn)">WARN ${S.board.compliance.warn}</span><span class="chip" style="color:var(--bad)">BLOCK ${S.board.compliance.block}</span>` : isVerify ? `<span class="chip" style="color:var(--ok)">PASS ${(S.board.verify || {}).pass || 0}</span><span class="chip" style="color:var(--warn)">REVISE ${(S.board.verify || {}).revise || 0}</span>` : `<span class="chip">${files.length}개 파일</span>`}
      <button class="icon-btn" id="appr-close"><svg><use href="#i-close"/></svg></button></div>
    <div class="appr-split">
      <div class="appr-files">${isCompliance ? `
        ${blockPosts.map((p) => `<div class="verdict-row BLOCK"><span class="dot BLOCK"></span><b>${cardId(p)}</b> ${esc(p.topic.slice(0, 30))}<button class="chip" data-rework="${esc(p.uid)}" style="margin-left:auto">재작업 지시</button></div>`).join('')}
        ${warnPosts.map((p) => `<div class="verdict-row WARN"><input type="checkbox" class="warn-sign" data-n="${esc(p.uid)}"><span class="dot WARN"></span><b>${cardId(p)}</b> ${esc(p.topic.slice(0, 30))}</div>`).join('')}
        ${warnPosts.length ? '<p class="muted small" style="margin:8px 0">WARN 사유를 확인했다면 각 항목에 서명(체크)하세요.</p>' : ''}
        <div style="margin-top:10px" id="appr-list"></div>` : '<div id="appr-list"></div>'}
      </div>
      <div class="appr-preview" id="appr-preview"><p class="muted">파일을 선택하면 미리보기가 열립니다</p></div>
    </div>
    <div class="appr-foot">
      <button id="appr-reject">반려 — 디렉터에게 수정 지시</button>
      <label class="small muted" style="display:flex;align-items:center;gap:6px"><input type="checkbox" id="appr-next" checked> 승인과 동시에 다음 단계 실행</label>
      <div style="flex:1"></div>
      <button class="stamp-btn" id="stamp"><span class="ring"></span><svg><use href="#i-stamp"/></svg><span>길게 눌러<br>승인</span></button>
    </div>`;
  const list = $('#appr-list', sheet);
  const preview = $('#appr-preview', sheet);
  const complianceFile = S.board.compliance.file;
  const verifyFile = (S.board.verify || {}).file;
  const showFiles = isCompliance && complianceFile ? [{ ...complianceFile, lane: 'compliance' }]
    : isVerify && verifyFile ? [{ ...verifyFile, lane: 'verify' }] : files;
  for (const f of showFiles.slice(0, 30)) {
    const row = $('#tpl-file-row').content.firstElementChild.cloneNode(true);
    row.dataset.rel = f.rel;
    $('.fr-name', row).textContent = f.name;
    $('.fr-time', row).textContent = relTime(f.mtime);
    row.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/sat-file', f.rel));
    row.onclick = async () => {
      $$('.file-row.sel', list).forEach((x) => x.classList.remove('sel'));
      row.classList.add('sel');
      const r = await window.api.ws.readFile(S.client.dir, f.rel);
      preview.innerHTML = previewHTML(r, f.rel);
    };
    pressable(row);
    list.appendChild(row);
  }
  // 보드 갱신으로 재구성됐어도 보던 파일을 유지 — 없으면 첫 파일
  const keep = restoreRel && $(`.file-row[data-rel="${CSS.escape(restoreRel)}"]`, list);
  if (keep) keep.click();
  else if (showFiles[0] && list.firstElementChild) list.firstElementChild.click();
  $('#appr-close').onclick = closeOverlay;
  $('#appr-reject').onclick = () => { closeOverlay(); prefillChat(`${node.label} 산출물에 수정이 필요해: `); };
  for (const b of $$('[data-rework]', sheet)) b.onclick = () => {
    const p = S.board.posts.find((x) => x.uid === b.dataset.rework);
    closeOverlay(); prefillChat(`「${cardId(p)} · ${p.topic}」가 BLOCK 판정이야. 컴플라이언스 사유를 확인하고 재작업해줘.`);
  };
  bindStamp($('#stamp', sheet), node, isCompliance);
  openSheet('#sheet-approve');
}
function bindStamp(btn, node, isCompliance) {
  const canStamp = () => {
    // 시트가 열린 뒤 보드가 갱신될 수 있으므로 판정 수는 항상 라이브로 계산
    const blocks = S.board.posts.filter((p) => p.verdict === 'BLOCK').length;
    if (isCompliance && blocks > 0) return 'BLOCK 카드가 있어 승인할 수 없습니다 — 재작업이 먼저입니다';
    if (isCompliance && $$('.warn-sign').some((c) => !c.checked)) return 'WARN 항목에 모두 서명해야 승인할 수 있습니다';
    return null;
  };
  let timer = null, p = 0;
  const reset = () => { clearInterval(timer); timer = null; p = 0; S.stampHolding = false; btn.style.setProperty('--p', 0); };
  currentStampReset = reset;
  const begin = () => {
    if (timer) return; // 멀티터치/펜 중복 진입 차단
    const why = canStamp();
    if (why) { toast(why); return; }
    S.stampHolding = true; // 도장 누르는 중엔 보드 갱신이 시트를 재구성하지 못하게
    timer = setInterval(async () => {
      if (!btn.isConnected) { reset(); return; } // 시트 재구성으로 detach된 버튼 — 승인 진행 금지
      p += 100 / (600 / 30);
      btn.style.setProperty('--p', Math.min(p, 100));
      if (p >= 100) {
        reset();
        btn.classList.add('stamped');
        const warnSigned = $$('.warn-sign').filter((c) => c.checked).map((c) => c.dataset.n);
        const g = await window.api.gates.approve(S.client.dir, { node: node.key, signer: S.client.name, warnSigned });
        if (g && g.error) { toast('승인 저장 실패: ' + g.error); btn.classList.remove('stamped'); return; }
        S.gates = g;
        toast(`${node.label} 승인 완료`);
        setTimeout(async () => {
          closeOverlay();
          renderGateBar();
          if ($('#appr-next') && $('#appr-next').checked) {
            const next = S.gates.nodes[S.gates.current];
            if (next && next.stage && !S.running) runStage(next.stage);
          }
        }, 500);
      }
    }, 30);
  };
  btn.addEventListener('pointerdown', begin);
  btn.addEventListener('pointerup', reset);
  btn.addEventListener('pointerleave', reset);
  btn.addEventListener('pointercancel', reset);
  // 키보드 도장 — Space/Enter를 누르고 있으면 동일한 길게-눌러-승인 (A11y)
  btn.addEventListener('keydown', (e) => {
    if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); begin(); }
  });
  btn.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') reset(); });
  btn.addEventListener('blur', reset);
}
let currentStampReset = null;

// ---- dock: chat / log / inspector ---------------------------------------------------------
function switchDock(name) {
  S.inspectorN = null;
  S.publishCh = null;
  $$('#dock-seg button').forEach((b) => b.classList.toggle('active', b.dataset.dock === name));
  $('#dock-chat').classList.toggle('hidden', name !== 'chat');
  $('#dock-log').classList.toggle('hidden', name !== 'log');
  $('#dock-history').classList.toggle('hidden', name !== 'history');
  $('#dock-inspector').classList.add('hidden');
  if (name === 'history') renderHistory();
}
for (const b of $$('#dock-seg button')) b.onclick = () => switchDock(b.dataset.dock);

async function renderHistory() {
  const box = $('#dock-history');
  if (!S.client) { box.innerHTML = '<p class="muted" style="padding:14px">클라이언트를 선택하세요</p>'; return; }
  box.innerHTML = '<p class="muted" style="padding:14px">불러오는 중…</p>';
  const h = await window.api.hist.list(S.client.dir);
  const runs = (h && h.runs) || [];
  const KIND = { stage: '단계', chat: '대화', autopilot: '오토파일럿' };
  const rows = runs.map((r) => {
    const when = new Date(r.at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const dur = r.ms ? fmtDur(r.ms) : '';
    const cost = fmtCost(r.costUsd);
    const label = r.stage ? (STAGE_LABEL[STAGE2COL[r.stage]] || r.stage) : (KIND[r.kind] || r.kind);
    const note = r.note ? ` · ${esc(r.note.slice(0, 40))}` : '';
    return `<div class="hist-row ${r.ok ? '' : 'bad'}">
      <span class="hist-dot ${r.ok ? 'ok' : 'bad'}"></span>
      <b>${esc(label)}</b>
      <span class="muted small" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(KIND[r.kind] || r.kind)}${note}</span>
      <span class="muted small">${dur}${cost ? ' · ' + cost : ''}</span>
      <span class="muted small">${when}</span></div>`;
  }).join('') || '<p class="muted" style="padding:14px">아직 실행 기록이 없습니다</p>';
  const month = h && h.monthCost ? fmtCost(h.monthCost) : '';
  box.innerHTML = `<div class="hist-head"><b>실행 기록</b>${month ? `<span class="chip tiny" title="이번 달 누적 API 비용">이번 달 ${month}</span>` : ''}</div>
    <div class="hist-list">${rows}</div>`;
}

function addMsg(kind, text) {
  const d = document.createElement('div');
  d.className = `msg ${kind}`;
  if (kind === 'dir') d.innerHTML = md(text); // 디렉터 응답은 마크다운 — 표/헤딩이 원문 기호로 보이지 않게
  else d.textContent = text;
  const log = $('#chat-log');
  log.appendChild(d);
  while (log.children.length > 120) log.firstChild.remove(); // 장시간 세션 DOM 캡
  log.scrollTop = log.scrollHeight;
  return d;
}
function renderChips() {
  const box = $('#chat-chips'); box.innerHTML = '';
  S.chips.forEach((c, i) => {
    const s = document.createElement('span');
    s.className = 'chip'; s.textContent = c.label + ' ×';
    s.onclick = () => { S.chips.splice(i, 1); renderChips(); };
    box.appendChild(s);
  });
}
function prefillChat(text) {
  switchDock('chat');
  $('#chat-input').value = text;
  $('#chat-input').focus();
}
// 스트리밍 수신 상태 — chat:stream 이벤트가 진행 중 턴의 라이브 버블/활동 라인을 채운다
const chatStream = { dir: null, live: null, act: null, buf: '' };
window.api.onChatStream(({ dir, ev }) => {
  if (!ev || chatStream.dir !== dir || !S.client || S.client.dir !== dir) return;
  const log = $('#chat-log');
  if (ev.kind === 'text' && ev.text) {
    if (!chatStream.live) { chatStream.live = document.createElement('div'); chatStream.live.className = 'msg dir'; log.insertBefore(chatStream.live, chatStream.act); }
    chatStream.buf += (chatStream.buf ? '\n\n' : '') + ev.text;
    chatStream.live.innerHTML = md(chatStream.buf);
    log.scrollTop = log.scrollHeight;
  } else if (ev.kind === 'tool' && chatStream.act) {
    chatStream.act.dataset.tool = `▸ ${ev.name}${ev.target ? ' — ' + ev.target : ''}`;
  } else if (ev.kind === 'raw' && chatStream.act) {
    const t = ev.text.trim();
    if (t && !/^\W*$/.test(t)) chatStream.act.dataset.tool = t.slice(0, 80); // codex 진행 라인
  }
});
async function sendChat() {
  if (!S.client) { toast('클라이언트를 먼저 선택하세요'); return; }
  if (S.running) { toast('단계 실행 중에는 디렉터 대화를 보낼 수 없습니다 (같은 폴더를 동시에 편집하게 됩니다)'); return; }
  const input = $('#chat-input');
  let msg = input.value.trim();
  if (!msg) return;
  if (S.chatBusy) { toast('디렉터가 응답 중입니다 — 완료 후 다시 시도하세요'); return; }
  if (S.chips.length) msg = S.chips.map((c) => c.context).join('\n') + '\n\n' + msg;
  const dir = S.client.dir; // 전송 시점의 클라이언트 — 응답이 다른 클라이언트에 새지 않게
  S.chatBusy = true; $('#btn-chat-send').disabled = true;
  $('#chat-stop').classList.remove('hidden');
  input.value = ''; S.chips = []; renderChips();
  addMsg('user', msg);
  const think = addMsg('think', '디렉터 작업 중…');
  chatStream.dir = dir; chatStream.live = null; chatStream.act = think; chatStream.buf = '';
  const t0 = Date.now();
  const tick = setInterval(() => {
    const tool = think.dataset.tool ? ` · ${think.dataset.tool}` : '';
    think.textContent = `디렉터 작업 중… ${fmtDur(Date.now() - t0)}${tool}`;
  }, 1000);
  try {
    const r = await window.api.chat.send(dir, msg);
    if (S.client && S.client.dir === dir) {
      // 최종 응답으로 라이브 버블을 교체 — 스트림 조각과 최종본의 중복 방지
      if (chatStream.live) chatStream.live.remove();
      const done = addMsg(r.ok ? 'dir' : 'err', r.text);
      const meta = [fmtCost(r.costUsd), r.durationMs ? Math.round(r.durationMs / 1000) + 's' : ''].filter(Boolean).join(' · ');
      if (r.ok && meta) { const m = document.createElement('div'); m.className = 'msg-meta muted small'; m.textContent = meta; done.appendChild(m); }
    }
  } catch (e) {
    addMsg('err', '전송 실패: ' + e.message);
  } finally {
    clearInterval(tick); think.remove();
    chatStream.dir = null; chatStream.live = null; chatStream.act = null; chatStream.buf = '';
    S.chatBusy = false; $('#btn-chat-send').disabled = false;
    $('#chat-stop').classList.add('hidden');
  }
  if (S.client && S.client.dir === dir) { input.focus(); await refreshBoard(false); }
}
$('#chat-stop').onclick = async () => {
  const r = await window.api.chat.stop();
  if (r && r.wasRunning) toast('디렉터 턴을 중지했습니다');
};
$('#btn-chat-send').onclick = sendChat;
$('#chat-input').addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); sendChat(); } });
$('#chat-reset').onclick = async () => {
  if (!S.client) return;
  if (S.chatBusy) { toast('응답을 기다리는 중에는 초기화할 수 없습니다'); return; }
  await window.api.chat.reset(S.client.dir);
  $('#chat-log').innerHTML = '';
  addMsg('think', '새 대화를 시작합니다 (세션 초기화)');
};
// 카드/파일 → 채팅 드롭
const ci = $('#chat-input');
ci.addEventListener('dragover', (e) => { e.preventDefault(); ci.classList.add('droptarget'); });
ci.addEventListener('dragleave', () => ci.classList.remove('droptarget'));
ci.addEventListener('drop', (e) => {
  e.preventDefault(); ci.classList.remove('droptarget');
  const card = e.dataTransfer.getData('text/sat-card');
  const file = e.dataTransfer.getData('text/sat-file');
  if (card) { const c = JSON.parse(card); S.chips.push({ label: c.id, context: `[카드 ${c.id} · ${c.topic} · 현재 단계 ${STAGE_LABEL[c.stage]}]` }); }
  if (file) { S.chips.push({ label: file.split(/[\\/]/).pop(), context: `[파일 ${file}]` }); }
  renderChips(); switchDock('chat'); ci.focus();
});

$('#btn-log-folder').onclick = () => window.api.app.openLogs();
$('#btn-log-copy').onclick = async () => {
  const r = await window.api.app.copyLogs();
  toast(r.ok ? `오늘 로그 ${Math.round(r.chars / 1024)}KB 복사됨 — 붙여넣어 공유하세요` : '복사 실패');
};

function logLine(source, line) {
  const pane = $('#log-pane');
  // 위쪽부터 잘라낸다 — 장시간 실행 중 로그 전체가 증발하지 않게 (라인당 노드 2개)
  while (pane.childNodes.length > 8000) { pane.removeChild(pane.firstChild); pane.removeChild(pane.firstChild); }
  const atBottom = pane.scrollTop + pane.clientHeight >= pane.scrollHeight - 40;
  const span = document.createElement('span');
  span.innerHTML = `<span class="src">[${esc(source)}]</span> `;
  pane.appendChild(span);
  pane.appendChild(document.createTextNode(line + '\n'));
  if (atBottom) pane.scrollTop = pane.scrollHeight;
  // 칸반 티커는 실행 중인 스테이지의 라인만 — 무관한 오류/채팅 로그가 진행상황으로 위장하지 않게
  if (S.running && source === S.running) {
    const t = $(`[data-ticker]`);
    if (t) t.textContent = line;
  }
}

function openInspector(p) {
  S.inspectorN = p.uid;
  S.publishCh = null;
  $('#dock-chat').classList.add('hidden'); $('#dock-log').classList.add('hidden');
  $$('#dock-seg button').forEach((b) => b.classList.remove('active'));
  const box = $('#dock-inspector');
  box.classList.remove('hidden');
  const color = `var(--ch-${p.channel})`;
  const stageIdx = S.board.stages.indexOf(p.stage);
  // 이 포스트에 실제 매칭된 파일(board가 토픽으로 찾음) — 없을 때만 레인 최신 파일로 폴백
  const mine = (kinds) => (p.files || []).filter((f) => kinds.includes(f.kind))
    .map((f) => ({ rel: f.rel, name: f.rel.split(/[\\/]/).pop() }));
  const laneFallback = (lane) => (S.board.lanes[lane] || []).slice(0, 2);
  const copyFiles = mine(['copy']);
  const visFiles = mine(['video', 'board', 'creative']);
  const stepFiles = {
    planned: [],
    copy: copyFiles.length ? copyFiles : laneFallback(p.lane),
    visual: visFiles.length ? visFiles : (p.isReel ? laneFallback('videos') : laneFallback('creatives')),
    review: mine(['verdict']).length ? mine(['verdict']) : laneFallback('compliance'),
    ready: [],
  };
  box.innerHTML = `
    <div class="insp-head"><button class="icon-btn" id="insp-back"><svg><use href="#i-back"/></svg></button>
      <span class="mono-tile" style="background:color-mix(in srgb, ${color} 16%, transparent);color:${color}">${CH_MONO[p.channel]}</span>
      <span class="insp-topic">${esc(p.topic)}</span>
      ${p.verdict ? `<span class="dot ${p.verdict}"></span>` : ''}</div>
    <div class="chip" style="align-self:flex-start">${STAGE_LABEL[p.stage]} 단계</div>
    <dl class="insp-meta">
      <dt>일정</dt><dd>${esc(p.week)}주차 ${esc(p.day)}</dd>
      <dt>필러</dt><dd>${esc(p.pillar || '—')}</dd>
      <dt>포맷</dt><dd>${esc(p.format || '—')}</dd>
      <dt>목표</dt><dd>${esc(p.objective || '—')}</dd>
      <dt>앵글</dt><dd>${esc(p.angle || '—')}</dd>
      <dt>비주얼</dt><dd>${esc(p.visual || '—')}</dd>
      ${p.notes ? `<dt>노트</dt><dd>${esc(p.notes)}</dd>` : ''}
    </dl>
    <div class="insp-steps">${S.board.stages.map((s, i) => `
      <div class="insp-step ${i <= stageIdx ? 'done' : ''}"><b style="min-width:70px">${STAGE_LABEL[s]}</b>
      <span>${(stepFiles[s] || []).map((f) => `<a href="#" class="insp-file" data-rel="${esc(f.rel)}" style="color:var(--info)">${esc(f.name)}</a>`).join('<br>') || '<span class="muted">—</span>'}</span></div>`).join('')}
    </div>
    ${(() => {
      const imgs = (p.files || []).filter((f) => f.kind === 'render' || f.kind === 'poolrender').map((f) => f.rel);
      if (!imgs.length && p.thumb) imgs.push(p.thumb);
      return imgs.length ? `<div class="insp-strip">${imgs.map((r) => `<img class="zoomable" src="${satUrl(r)}" alt="렌더" loading="lazy">`).join('')}</div>` : '';
    })()}
    ${p.videoThumb ? `<video class="insp-render" src="${satUrl(p.videoThumb)}" controls preload="metadata"></video>` : ''}
    <div id="insp-preview"></div>
    ${p.verdict && p.verdict !== 'PASS' ? `<div class="insp-verdict ${p.verdict}"><b>${p.verdict}</b> — 컴플라이언스 판정. 상세 사유는 검수 파일에서 확인하세요.</div>` : ''}
    <div class="insp-actions">
      <button id="insp-publish" class="accent">발행 검토</button>
      <button id="insp-render">🎨 비주얼 생성</button>
      <button id="insp-comments-btn">💬 댓글</button>
      <button id="insp-chat">디렉터에게 지시</button>
      <button id="insp-folder">레인 폴더 열기</button>
    </div>
    <div class="insp-actions" style="margin-top:2px">
      <button id="insp-del-image" title="이 포스트의 생성된 이미지를 삭제하고 이미지 단계부터 다시">🗑 이미지 삭제</button>
      <button id="insp-del-copy" title="이 포스트의 본문(+이미지)을 삭제하고 기획부터 다시">🗑 본문 삭제</button>
    </div>
    <div id="insp-comments" class="hidden" style="display:flex;flex-direction:column;gap:8px"></div>
    <div id="insp-render-panel" class="hidden"></div>`;
  $('#insp-back').onclick = () => switchDock('chat');
  $('#insp-publish').onclick = () => {
    const direct = (S.channels && S.channels.direct && S.channels.direct[p.channel]) || {};
    openPublishPanel(p.channel);
    // 패널 렌더 직후 해당 포스트 검토창 열기
    setTimeout(() => openCompose(p.channel, p, direct), 0);
  };
  $('#insp-render').onclick = () => openRenderPanel(p);
  const delAssets = async (opts) => {
    const what = opts.copy ? '본문과 이미지' : '이미지';
    const back = opts.copy ? '기획(본문)' : '이미지';
    if (!confirm(`${cardId(p)}의 ${what}을(를) 삭제하고 ${back} 단계부터 다시 시작할까요?\n\n삭제한 부분은 되돌릴 수 없으며 다시 생성/작성해야 합니다.`)) return;
    const r = await window.api.post.deleteAssets(S.client.dir, p.uid, opts);
    if (!r || !r.ok) { toast('삭제 실패: ' + ((r && r.error) || '알 수 없음')); return; }
    toast(`${what} 삭제 완료 — ${r.reset === 'planned' ? '기획' : '카피'} 단계로 되돌렸습니다 (${(r.deleted || []).length}건)`);
    refreshBoard(false); // 카드가 planned/copy로 되돌아가고 인스펙터도 갱신
  };
  $('#insp-del-image').onclick = () => delAssets({ image: true });
  $('#insp-del-copy').onclick = () => delAssets({ copy: true });
  $('#insp-comments-btn').onclick = () => openCommentsPanel(p);
  $('#insp-chat').onclick = () => { S.chips.push({ label: cardId(p), context: `[카드 ${cardId(p)} · ${p.topic} · 현재 단계 ${STAGE_LABEL[p.stage]}]` }); renderChips(); switchDock('chat'); $('#chat-input').focus(); };
  $('#insp-folder').onclick = () => window.api.ws.openFolder(S.client.dir + '/outputs/' + p.lane);
  for (const a of $$('.insp-file', box)) a.onclick = async (e) => {
    e.preventDefault();
    const r = await window.api.ws.readFile(S.client.dir, a.dataset.rel);
    if (r && r.ok && r.kind === 'text') r.text = r.text.slice(0, 6000);
    $('#insp-preview').innerHTML = `<div class="insp-prev-box">${previewHTML(r, a.dataset.rel)}</div>`;
  };
}

// ---- 댓글 패널 (인스펙터 내부) — 확인 → 맥락 답글 초안 → 검토 → 게시/복사 ------------------
async function openCommentsPanel(p) {
  const box = $('#insp-comments');
  if (!box) return;
  box.classList.remove('hidden');
  box.innerHTML = '<p class="muted small">댓글 확인 중…</p>';
  const dir = S.client.dir;
  const r = await window.api.cmt.list(dir, p.uid);
  if (!r || (r.ok === false)) { box.innerHTML = `<p class="muted small">댓글 조회 실패: ${esc((r && r.error) || '알 수 없음')}</p>`; return; }

  const draftBlock = (idx) => `
    <div class="hidden" data-cdraft="${idx}" style="display:flex;flex-direction:column;gap:6px;margin:4px 0 8px">
      <textarea class="rp-input" rows="3" data-ctext="${idx}"></textarea>
      <div style="display:flex;gap:6px">
        <button class="small accent" data-cpost="${idx}">답글 게시</button>
        <button class="small" data-ccopy="${idx}">복사</button>
        <span class="muted small" data-cflag="${idx}"></span>
      </div>
    </div>`;
  const apiChannel = r.channel && !r.manual;
  const rows = (r.comments || []).map((c, i) => `
    <div style="border-top:1px solid var(--line);padding-top:6px">
      <div class="small"><b>${esc(c.author)}</b> <span class="muted">${esc(String(c.at).slice(0, 16).replace('T', ' '))}</span></div>
      <div class="small" style="margin:2px 0">${esc(c.text)}</div>
      <button class="small" data-cdo="${i}" data-cid="${esc(c.id)}" data-cauthor="${esc(c.author)}">맥락 답글 초안</button>
      ${draftBlock(i)}
    </div>`).join('');

  box.innerHTML = `
    <div class="rp-head"><b>💬 댓글 — ${cardId(p)}</b></div>
    ${apiChannel
    ? (rows || '<p class="muted small">아직 댓글이 없습니다.</p>')
    : '<p class="muted small">이 채널은 댓글 API가 없어 수동 확인입니다 — 받은 댓글을 아래에 붙여넣으면 맥락 답글 초안을 만들어 드립니다.</p>'}
    <div style="border-top:1px solid var(--line);padding-top:6px">
      <div class="small muted" style="margin-bottom:4px">댓글 직접 붙여넣기 (수동 채널·기타)</div>
      <textarea class="rp-input" rows="2" id="cmt-paste" placeholder="받은 댓글을 붙여넣으세요"></textarea>
      <button class="small" id="cmt-paste-go" style="margin-top:4px">맥락 답글 초안</button>
      ${draftBlock('p')}
    </div>`;

  const makeDraft = async (idx, commentText, author, commentId) => {
    const btnList = $$(`[data-cdo="${idx}"], #cmt-paste-go`, box);
    btnList.forEach((b) => { b.disabled = true; });
    toast('답글 초안 생성 중…');
    const d = await window.api.cmt.draft(dir, { channel: r.channel || p.channel, topic: p.topic, lane: p.lane, author, comment: commentText });
    btnList.forEach((b) => { b.disabled = false; });
    const wrap = $(`[data-cdraft="${idx}"]`, box);
    if (!d || !d.ok) { toast('초안 실패: ' + ((d && d.error) || '알 수 없음')); return; }
    wrap.classList.remove('hidden');
    $(`[data-ctext="${idx}"]`, box).value = d.reply;
    $(`[data-cflag="${idx}"]`, box).textContent = d.needsReview ? '⚠ 민감 댓글 — 게시 전 반드시 검토' : '';
    // 게시 버튼은 API 채널 + 대상 댓글이 있을 때만 — 나머지는 복사로
    const postBtn = $(`[data-cpost="${idx}"]`, box);
    if (!apiChannel || !commentId) postBtn.classList.add('hidden');
    postBtn.onclick = async () => {
      const txt = $(`[data-ctext="${idx}"]`, box).value.trim();
      if (!txt) { toast('답글 내용이 비어 있습니다'); return; }
      if (!confirm('이 답글을 게시할까요?\n\n' + txt.slice(0, 200))) return;
      postBtn.disabled = true;
      const pr = await window.api.cmt.reply(dir, { channel: r.channel, commentId, text: txt });
      postBtn.disabled = false;
      toast(pr && pr.ok ? '답글 게시됨' : '게시 실패: ' + ((pr && pr.error) || '알 수 없음'));
      if (pr && pr.ok) openCommentsPanel(p); // 목록 갱신
    };
    $(`[data-ccopy="${idx}"]`, box).onclick = async () => {
      await navigator.clipboard.writeText($(`[data-ctext="${idx}"]`, box).value);
      toast('답글이 클립보드에 복사됐습니다');
    };
  };
  for (const b of $$('[data-cdo]', box)) b.onclick = () => {
    const i = Number(b.dataset.cdo);
    makeDraft(i, (r.comments[i] || {}).text || '', b.dataset.cauthor, b.dataset.cid);
  };
  $('#cmt-paste-go').onclick = () => {
    const t = $('#cmt-paste').value.trim();
    if (!t) { toast('댓글을 붙여넣으세요'); return; }
    makeDraft('p', t, null, null);
  };
}

// ---- 비주얼 생성 패널 (인스펙터 내부) ---------------------------------------------------------
async function openRenderPanel(p) {
  const box = $('#insp-render-panel');
  if (!box) return;
  box.classList.remove('hidden');
  box.innerHTML = '<p class="muted small">프로바이더 확인 중…</p>';
  const av = await window.api.render.providers({ ima2: !!(S.env && S.env.ima2) });
  if (av && av.error) { box.innerHTML = `<p class="muted small">${esc(av.error)}</p>`; return; }
  // 이미지 스타일 프리셋 — 목록 + 저장된 기본값
  let styleList = [], defStyle = '';
  try { styleList = await window.api.render.styles() || []; defStyle = await window.api.engine.getImageStyle() || ''; } catch { /* 목록 없음 */ }
  const styleOpts = ['<option value="">스타일 자동</option>']
    .concat(styleList.map((s) => `<option value="${esc(s.key)}" ${s.key === defStyle ? 'selected' : ''}>${esc(s.label)}</option>`)).join('');
  const kind0 = p.isReel ? 'video' : 'image';
  const opts = (kind) => Object.entries(av[kind])
    .map(([k, v]) => `<option value="${k}" ${!v.ok ? 'disabled' : ''}>${esc(v.label)}${v.ok ? '' : ' — 설정 필요'}</option>`).join('');
  const prefill = [p.topic, p.angle && `앵글: ${p.angle}`, p.visual && `비주얼 디렉션: ${p.visual}`, p.pillar && `필러: ${p.pillar}`]
    .filter(Boolean).join('\n');
  box.innerHTML = `
    <div class="rp-head"><b>비주얼 생성 — ${cardId(p)}</b>
      <div class="seg mini" id="rp-kind">
        <button data-k="image" class="${kind0 === 'image' ? 'active' : ''}">이미지</button>
        <button data-k="cardnews">카드뉴스</button>
        <button data-k="video" class="${kind0 === 'video' ? 'active' : ''}">영상</button>
      </div></div>
    <select id="rp-provider" class="rp-input">${opts(kind0)}</select>
    <div style="display:flex;gap:8px">
      <select id="rp-size" class="rp-input" style="flex:1">
        <option value="square">정방형 1:1 (피드)</option>
        <option value="portrait">세로 4:5 (피드)</option>
        <option value="story">세로 9:16 (릴스/스토리)</option>
        <option value="landscape">가로 16:9</option>
      </select>
      <select id="rp-imgcount" class="rp-input" style="width:96px" title="생성할 이미지 장수 — 여러 장 배치가 기본입니다">
        <option value="1">1장</option><option value="2">2장</option><option value="3" selected>3장</option><option value="4">4장</option><option value="5">5장</option>
      </select>
      <select id="rp-variants" class="rp-input" style="width:100px" title="대표컷 시안 수 — 시안 중 하나를 고르면 1번으로 확정하고 나머지 장수를 이어 생성합니다">
        <option value="3" selected>시안 3안</option><option value="2">시안 2안</option><option value="0">바로 생성</option>
      </select>
      <select id="rp-cards" class="rp-input hidden" style="width:90px" title="카드 수 (표지+본문+엔딩)">
        <option value="5">5장</option><option value="6">6장</option><option value="7">7장</option><option value="8">8장</option>
      </select>
      <select id="rp-dur" class="rp-input hidden" style="width:90px">
        <option value="5">5초</option><option value="8">8초</option><option value="10">10초</option><option value="15">15초</option><option value="30">30초</option>
      </select>
    </div>
    <label class="small muted" id="rp-style-row" style="display:flex;gap:6px;align-items:center">이미지 스타일
      <select id="rp-style" class="rp-input" style="flex:1" title="생성 이미지의 기본 스타일 — 선택하면 컴파일 프롬프트에 반영되고 기본값으로 저장됩니다">${styleOpts}</select>
    </label>
    <textarea id="rp-prompt" class="rp-input" rows="4" placeholder="브리프 (컴파일하면 시각 언어 프롬프트로 변환됩니다)">${esc(prefill)}</textarea>
    <div style="display:flex;gap:8px;align-items:center">
      <button id="rp-compile" style="flex:1">✨ 프롬프트 컴파일</button>
      <label class="small muted" style="display:flex;gap:5px;align-items:center;white-space:nowrap">
        <input type="checkbox" id="rp-auto" checked> 생성 전 자동 컴파일</label>
    </div>
    <textarea id="rp-negative" class="rp-input hidden" rows="2" placeholder="네거티브 프롬프트 (지원 모델만)"></textarea>
    <div class="small muted" id="rp-ref">${p.thumb ? `키프레임: ${esc(p.thumb.split(/[\\/]/).pop())} 사용` : '키프레임 없음 — 영상 레인은 먼저 이미지를 생성하면 그걸 참조합니다'}</div>
    <button id="rp-go" class="accent" style="width:100%">▶ 생성</button>
    <div id="rp-varea" class="hidden" style="margin-top:8px">
      <p class="small muted" style="margin:4px 0">시안을 선택하면 대표컷(1번)으로 확정하고, 설정한 장수만큼 나머지를 이어서 생성합니다.</p>
      <div id="rp-vlist" style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px"></div>
    </div>
    <p class="muted small" style="margin-top:4px">컴파일러는 브랜드 팔레트·카피의 VISUAL DIRECTION·프롬프트 팩을 재료로 씁니다. 결과는 수정 가능합니다.</p>`;
  const syncKind = (kind) => {
    if (kind === 'cardnews') {
      // 카드뉴스는 한글 타이포가 핵심 — claude-svg 레인 전용 (사진 모델은 한글이 깨진다)
      $('#rp-provider').innerHTML = `<option value="claude-svg">${esc(av.image['claude-svg'].label)}</option>`;
      $('#rp-provider').value = 'claude-svg';
      $('#rp-size').value = 'portrait';
      $('#rp-prompt').placeholder = '카드뉴스 주제와 담을 내용 (표지 훅·본문 요점들·CTA를 적으면 카드로 배분됩니다)';
    } else {
      $('#rp-provider').innerHTML = opts(kind);
      // 기본 선택 = availability 순서상 첫 번째 사용 가능 프로바이더 (이미지는 Codex 계열이 최우선)
      const firstOk = Object.entries(av[kind]).find(([, v]) => v.ok);
      if (firstOk) $('#rp-provider').value = firstOk[0];
    }
    $('#rp-cards').classList.toggle('hidden', kind !== 'cardnews');
    $('#rp-imgcount').classList.toggle('hidden', kind !== 'image'); // 캐러셀 장수는 이미지 탭만
    $('#rp-variants').classList.toggle('hidden', kind !== 'image'); // 시안 선택도 이미지 탭 전용
    $('#rp-dur').classList.toggle('hidden', kind !== 'video');
    $('#rp-style-row').classList.toggle('hidden', kind !== 'image'); // 스타일 프리셋은 사진형 이미지 탭만(카드뉴스=한글 타이포 SVG·영상 제외)
    if (kind === 'video' && p.isReel) $('#rp-size').value = 'story';
  };
  // 스타일을 바꾸면 기본값으로 저장(오토파일럿·일괄 생성도 이 값을 씀)하고 재컴파일이 필요함을 표시
  if ($('#rp-style')) $('#rp-style').onchange = () => {
    compiled = false;
    window.api.engine.setImageStyle($('#rp-style').value).catch(() => {});
  };
  for (const b of $$('#rp-kind button')) b.onclick = () => {
    $$('#rp-kind button').forEach((x) => x.classList.toggle('active', x === b));
    syncKind(b.dataset.k);
  };
  syncKind(kind0); // 첫 표시에도 기본 프로바이더 선택 적용 (이미지 = Codex 계열 우선)
  // 컴파일 — 기획 브리프를 시각 언어 프롬프트로 (브랜드 팔레트 + VISUAL DIRECTION + 팩)
  let compiled = false; // 사용자가 이후 브리프를 고치면 다시 false
  $('#rp-prompt').addEventListener('input', () => { compiled = false; });
  const doCompile = async () => {
    const kind = $('#rp-kind button.active').dataset.k;
    const btn = $('#rp-compile');
    btn.disabled = true; btn.textContent = '컴파일 중…';
    try {
      const r = await window.api.prompt.compile(S.client.dir, {
        kind, provider: $('#rp-provider').value,
        topic: p.topic, channel: p.channel, format: p.format, lane: p.lane,
        prompt: $('#rp-prompt').value.trim(),
        size: $('#rp-size').value, duration: Number($('#rp-dur').value) || 5,
        count: Number(($('#rp-count') && $('#rp-count').value) || 1) || 1,
        style: ($('#rp-style') && $('#rp-style').value) || '',
      });
      if (r && r.ok && r.prompt) {
        $('#rp-prompt').value = r.prompt;
        const neg = $('#rp-negative');
        if (r.negative) {
          neg.value = r.negative;
          neg.classList.remove('hidden');
        } else {
          neg.value = '';
          neg.classList.add('hidden');
        }
        compiled = true;
        toast(`컴파일 완료 (${r.via === 'claude' ? 'Claude' : '템플릿'}${r.vd ? ' + VISUAL DIRECTION' : ''})`);
      } else toast('컴파일 실패: ' + ((r && r.error) || '알 수 없음'));
    } catch (e) { toast('컴파일 실패: ' + e.message); }
    finally { btn.disabled = false; btn.textContent = '✨ 프롬프트 컴파일'; }
    return compiled;
  };
  $('#rp-compile').onclick = doCompile;
  // 시안 갤러리 — variants/ 폴더의 후보들을 보여주고, 선택하면 대표컷 확정 + 나머지 top-up
  const rpUid = `${p.chId || 'etc'}-${p.n}`;
  async function showVariants() {
    const items = await window.api.render.listVariants(S.client.dir, rpUid);
    const area = $('#rp-varea'), list = $('#rp-vlist');
    if (!area || !list) return;
    if (!items.length) { area.classList.add('hidden'); return; }
    area.classList.remove('hidden');
    list.innerHTML = items.map((v) => `
      <div style="display:flex;flex-direction:column;gap:4px">
        <img src="${esc(satUrl(v.rel))}" style="width:100%;border-radius:8px;border:1px solid var(--line)" alt="${esc(v.name)}">
        <button class="small" data-vpick="${esc(v.name)}">이 안 사용</button>
      </div>`).join('');
    for (const b of $$('[data-vpick]', list)) b.onclick = async () => {
      const dir = S.client.dir;
      $$('[data-vpick]', list).forEach((x) => { x.disabled = true; });
      const count = Number($('#rp-imgcount').value) || 3;
      const r = await window.api.render.pickVariant(dir, rpUid, b.dataset.vpick);
      if (!r || !r.ok) { toast('선택 실패: ' + ((r && r.error) || '알 수 없음')); $$('[data-vpick]', list).forEach((x) => { x.disabled = false; }); return; }
      toast(count > 1 ? `시안 확정 — 나머지 ${count - 1}장 생성 중…` : '시안 확정 완료');
      if (count > 1) {
        const g = await window.api.render.generate(dir, {
          kind: 'image', provider: $('#rp-provider').value, prompt: $('#rp-prompt').value.trim(),
          negative: $('#rp-negative').value.trim() || null, base: rpUid, size: $('#rp-size').value, count,
        });
        toast(g && g.ok ? `${(g.files || []).length}장 세트 완성` : '나머지 생성 실패: ' + ((g && g.error) || '알 수 없음'));
      }
      $('#rp-varea').classList.add('hidden');
      if (S.client && S.client.dir === dir) refreshBoard(false);
    };
  }
  showVariants(); // 이전 라운드의 시안이 남아 있으면 패널을 열 때 바로 보여준다
  $('#rp-go').onclick = async () => {
    const kind = $('#rp-kind button.active').dataset.k;
    const provider = $('#rp-provider').value;
    if (!$('#rp-prompt').value.trim()) { toast('프롬프트를 입력하세요'); return; }
    const go = $('#rp-go');
    // ffmpeg/claude-svg 외 레인은 자동 컴파일 (원 브리프 그대로 보내면 결과가 엉망이 된다)
    if ($('#rp-auto').checked && !compiled && provider !== 'ffmpeg' && provider !== 'claude-svg') {
      go.disabled = true; go.textContent = '컴파일 중…';
      await doCompile();
      go.disabled = false;
    }
    const prompt = $('#rp-prompt').value.trim();
    go.disabled = true; go.textContent = '생성 중… (로그 탭에서 진행 확인)';
    const dir = S.client.dir;
    try {
      // 시안 모드(기본) — 대표컷 후보 K안을 먼저 만들고, 선택 후 나머지 장수를 잇는다
      const wantVariants = kind === 'image' && Number($('#rp-variants').value) > 0;
      if (wantVariants) {
        const r = await window.api.render.variants(dir, {
          provider, prompt, negative: $('#rp-negative').value.trim() || null,
          base: rpUid, size: $('#rp-size').value, variants: Number($('#rp-variants').value),
        });
        if (r && r.ok) { toast(`시안 ${r.files.length}안 생성 — 아래에서 골라주세요`); await showVariants(); }
        else toast('시안 생성 실패: ' + ((r && r.error) || '알 수 없음'));
        return;
      }
      const r = await window.api.render.generate(dir, {
        kind: kind === 'cardnews' ? 'image' : kind,
        provider, prompt,
        cards: kind === 'cardnews' ? Number($('#rp-cards').value) || 5 : 1,
        count: kind === 'image' ? Number($('#rp-imgcount').value) || 1 : 1,
        negative: $('#rp-negative').value.trim() || null,
        base: `${p.chId || 'etc'}-${p.n}`,
        size: $('#rp-size').value,
        duration: Number($('#rp-dur').value) || 5,
        refRel: kind === 'video' ? (p.thumb || null) : null,
      });
      if (r && r.ok) toast(r.files && r.files.length > 1 ? `${r.files.length}장 생성 완료` : `생성 완료 — ${r.rel.split(/[\\/]/).pop()}`);
      else toast('생성 실패: ' + ((r && r.error) || '알 수 없음'));
    } catch (e) { toast('생성 실패: ' + e.message); }
    finally {
      go.disabled = false; go.textContent = '▶ 생성';
      if (S.client && S.client.dir === dir) refreshBoard(false);
    }
  };
}

// ---- publish panel (검토 미리보기 + API/수동 발행) ------------------------------------------
function postRenderRels(p) {
  const out = [];
  const push = (rel) => {
    if (!rel) return;
    const n = String(rel).replace(/\\/g, '/');
    if (!out.includes(n)) out.push(n);
  };
  for (const f of (p.files || [])) {
    if (f.kind === 'render' || f.kind === 'creative') push(f.rel);
  }
  push(p.thumb);
  const creatives = (S.board && S.board.lanes && S.board.lanes.creatives) || [];
  if (!out.length && Array.isArray(creatives)) {
    const id = p.chId || 'etc';
    const mono = CH_MONO[p.channel] || '';
    const n = Number(p.n) || p.n;
    const res = [
      new RegExp(`^${id}-0*${n}(?![0-9])`, 'i'),
      mono ? new RegExp(`^${mono}-0*${n}(?![0-9])`, 'i') : null,
    ].filter(Boolean);
    for (const f of creatives) {
      const name = f.name || (f.rel || '').split(/[\\/]/).pop() || '';
      if (/\.(png|jpe?g|webp|gif)$/i.test(name) && res.some((re) => re.test(name))) push(f.rel);
    }
  }
  // 그래도 없으면 채널 포스트 순서대로 creatives 풀에서 1장 배정
  if (!out.length && Array.isArray(creatives) && creatives.length) {
    const peers = (S.board.posts || []).filter((x) => x.channel === p.channel);
    const idx = Math.max(0, peers.findIndex((x) => x.uid === p.uid));
    const pool = creatives
      .filter((f) => /\.(png|jpe?g|webp|gif)$/i.test(f.name || f.rel || ''))
      .sort((a, b) => (b.mtime || 0) - (a.mtime || 0));
    if (pool[idx]) push(pool[idx].rel);
    else if (pool.length === 1) push(pool[0].rel);
  }
  return out;
}
function postCopyRels(p) {
  return (p.files || []).filter((f) => f.kind === 'copy').map((f) => f.rel);
}
function publishHowTo(chKey) {
  const map = {
    instagram: '인스타그램 → 새 게시물 → 사진 선택 → 캡션에 본문 붙여넣기 → 공유',
    threads: 'Threads → 새 스레드 → 본문 붙여넣기 → (선택) 사진 첨부 → 게시',
    naver: '네이버 블로그 글쓰기 → 본문 붙여넣기 → 이미지 업로드 → 발행',
    naver_clip: '네이버 클립 업로드 → 영상/이미지 첨부 → 설명에 본문 붙여넣기 → 등록',
    kakao_channel: '카카오톡 채널 관리자 → 소식/포스트 작성 → 본문·이미지 첨부 → 등록',
    facebook: '페이스북 → 게시물 작성 → 본문·사진 첨부 → 게시',
    linkedin: 'LinkedIn → 게시 시작 → 본문·미디어 첨부 → 게시',
    x: 'X → 게시하기 → 본문 붙여넣기 → (선택) 미디어 → 게시',
    tiktok: '틱톡 → 업로드 → 영상 선택 → 설명에 본문 붙여넣기 → 게시',
  };
  return map[chKey] || '플랫폼 에디터에 본문을 붙여넣고, 생성된 이미지를 함께 첨부하세요.';
}
function readinessChips(p) {
  const copies = postCopyRels(p);
  const renders = postRenderRels(p);
  const copyOk = copies.length > 0 || ['copy', 'visual', 'review', 'ready'].includes(p.stage);
  const imgOk = renders.length > 0;
  return `
    <span class="chip tiny pub-ready ${copyOk ? 'ok' : 'no'}" title="${copies[0] || '카피 파일 미매칭'}">카피 ${copyOk ? '✓' : '✗'}</span>
    <span class="chip tiny pub-ready ${imgOk ? 'ok' : 'no'}" title="${imgOk ? renders.map((r) => r.split(/[\\/]/).pop()).join(', ') : 'outputs/creatives 에 이미지 없음'}">이미지 ${imgOk ? renders.length + '장' : '없음'}</span>
    ${p.verdict ? `<span class="chip tiny pub-ready ${p.verdict === 'PASS' ? 'ok' : 'no'}">검수 ${esc(p.verdict)}</span>` : '<span class="chip tiny pub-ready no">검수 —</span>'}`;
}

function openPublishPanel(chKey) {
  $('#dock-chat').classList.add('hidden'); $('#dock-log').classList.add('hidden'); $('#dock-history').classList.add('hidden');
  $$('#dock-seg button').forEach((b) => b.classList.remove('active'));
  const box = $('#dock-inspector');
  box.classList.remove('hidden');
  S.inspectorN = null;
  S.publishCh = chKey; // onBoard가 보드 갱신 시 이 패널을 재구성할 수 있게
  const direct = (S.channels && S.channels.direct && S.channels.direct[chKey]) || {};
  const isApi = !!direct.connected;
  const posts = S.board.posts.filter((p) => p.channel === chKey);
  const ready = posts.filter((p) => p.stage === 'ready' || p.stage === 'review');
  box.innerHTML = `
    <div class="insp-head"><button class="icon-btn" id="insp-back"><svg><use href="#i-back"/></svg></button>
      <span class="insp-topic">${esc(CH_NAME[chKey] || chKey)} 발행 ${isApi ? '<span class="chip tiny" style="color:var(--ok)">API 연결됨</span>' : '<span class="chip tiny" style="color:var(--warn)">수동</span>'}</span></div>
    <p class="muted small" style="margin-bottom:8px">${isApi
      ? '<b>검토</b>에서 생성된 글·이미지를 확인한 뒤 바로 게시하거나 예약합니다.'
      : `<b>검토</b>에서 글·이미지를 확인 → 본문 복사·이미지 폴더 열기 → 플랫폼에 붙여넣기 → 발행 후 체크.`}</p>
    <div class="pub-howto muted small">${esc(publishHowTo(chKey))}${direct.note ? ` · ${esc(direct.note)}` : ''}</div>
    ${direct.tokenNote ? `<div class="pub-howto small" style="color:var(--warn)">⚠ ${esc(direct.tokenNote)}</div>` : ''}
    ${posts.length ? '' : '<p class="muted">이 채널의 포스트가 없습니다</p>'}
    ${posts.map((p) => {
      const renders = postRenderRels(p);
      const thumb = renders[0] || p.thumb;
      return `
      <div class="verdict-row pub-row" style="gap:8px;flex-wrap:wrap">
        <input type="checkbox" class="pub-check" data-uid="${esc(p.uid)}" ${p.published ? 'checked' : ''} title="플랫폼에 올린 뒤 체크">
        ${thumb ? `<img class="pub-row-thumb" src="${satUrl(thumb)}" alt="" loading="lazy">` : '<span class="pub-row-thumb empty">이미지 없음</span>'}
        <div class="pub-row-main">
          <div class="pub-row-title"><b>${cardId(p)}</b> <span>${esc(p.topic)}</span></div>
          <div class="pub-row-chips">${readinessChips(p)}
            ${p.stage !== 'ready' ? `<span class="chip tiny" style="color:var(--warn)">${STAGE_LABEL[p.stage]}</span>` : ''}
            ${p.published ? '<span class="chip tiny pub-ready ok">발행됨</span>' : ''}
          </div>
        </div>
        <button class="chip accent pub-review" data-uid="${esc(p.uid)}">검토</button>
        <button class="chip pub-copy" data-uid="${esc(p.uid)}">본문 복사</button>
      </div>`;
    }).join('')}
    <div id="pub-compose" class="hidden"></div>
    <div id="pub-queue"></div>
    <div class="insp-actions">
      <button id="pub-folder">본문 폴더</button>
      <button id="pub-creatives">이미지 폴더</button>
      <span class="muted small" style="align-self:center">발행 대기 ${ready.filter((p) => !p.published).length}건</span>
    </div>`;
  $('#insp-back').onclick = () => switchDock('chat');
  $('#pub-folder').onclick = () => {
    const lane = posts[0] ? posts[0].lane : 'naver';
    window.api.ws.openFolder(S.client.dir + '/outputs/' + lane);
  };
  $('#pub-creatives').onclick = () => window.api.ws.openFolder(S.client.dir + '/outputs/creatives');
  for (const c of $$('.pub-check', box)) c.onchange = async () => {
    try {
      const r = await window.api.pub.mark(S.client.dir, c.dataset.uid, c.checked);
      if (r && r.error) throw new Error(r.error);
      toast(c.checked ? '발행 기록 완료' : '발행 기록 해제');
    } catch (e) {
      c.checked = !c.checked; // 화면-파일 어긋남 방지
      toast('발행 기록 실패: ' + e.message);
    }
  };
  for (const btn of $$('.pub-copy', box)) btn.onclick = async () => {
    const p = S.board.posts.find((x) => x.uid === btn.dataset.uid);
    if (!p) { toast('포스트를 찾을 수 없습니다'); return; }
    const r = await window.api.pub.copy(S.client.dir, p.lane, p.topic);
    toast(r.ok ? `본문 복사 완료 (${r.chars}자, ${r.file}) — 에디터에 붙여넣으세요` : '복사 실패: ' + r.error);
  };
  for (const btn of $$('.pub-review', box)) btn.onclick = () => {
    const p = S.board.posts.find((x) => x.uid === btn.dataset.uid);
    if (!p) { toast('포스트를 찾을 수 없습니다'); return; }
    openCompose(chKey, p, direct);
  };
  renderPubQueue(chKey);
}

// 발행 검토 컴포저 — 생성된 글·이미지를 확인한 뒤 API 게시 또는 수동 사용
async function openCompose(chKey, p, direct) {
  const box = $('#pub-compose');
  if (!box) return;
  box.classList.remove('hidden');
  box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  box.innerHTML = '<p class="muted small">생성된 글·이미지 불러오는 중…</p>';
  const draft = await window.api.pub2.draft(S.client.dir, p.lane, p.topic);
  const limits = { x: 280, threads: 500 };
  const limit = limits[chKey];
  const isApi = !!direct.connected;
  const renders = postRenderRels(p);
  const copies = postCopyRels(p);
  const canImage = !!direct.image && renders.length > 0;
  const canChain = !!direct.chain; // Threads 등 댓글형 체인 지원 채널
  const selectedRel = renders[0] || p.thumb || null;
  const previewRels = selectedRel ? [selectedRel] : renders.slice(0, 6);
  const previewSrcs = await resolveImageSrcs(previewRels);
  box.innerHTML = `
    <div class="rp-head" style="margin-top:10px"><b>발행 검토 — ${cardId(p)}</b><button class="icon-btn" id="cmp-close"><svg><use href="#i-close"/></svg></button></div>
    <p class="muted small">${esc(p.topic)} · ${STAGE_LABEL[p.stage] || p.stage}</p>
    <div class="pub-checklist">
      <div class="pub-check-item ${draft.ok ? 'ok' : 'bad'}">${draft.ok ? '✓ 본문 생성됨' : '✗ 본문 초안 없음'} ${draft.ok && draft.file ? `<span class="muted">(${esc(String(draft.file).split(/[\\/]/).pop())})</span>` : ''}</div>
      <div class="pub-check-item ${renders.length ? 'ok' : 'bad'}">${renders.length ? `✓ 이미지 ${renders.length}장` : '✗ 이미지 없음 — 카드에서 「비주얼 생성」'}</div>
      ${copies.length ? `<div class="pub-check-item ok muted small">원본 파일: ${copies.map((r) => esc(r.split(/[\\/]/).pop())).join(', ')}</div>` : ''}
    </div>
    <div class="cmp-mock-wrap">
      <div class="cmp-mock-label muted small">포스팅 전 모습 · ${esc(CH_NAME[chKey] || chKey)}</div>
      <div id="cmp-mock">${channelMock(chKey, {
        text: draft.ok ? draft.text : '',
        title: draft.ok ? (draft.title || '') : '',
        topic: p.topic,
        images: previewRels,
        imageSrcs: previewSrcs,
        compact: false,
      })}</div>
    </div>
    ${!isApi ? `<ol class="pub-steps">
      <li>아래 <b>본문</b>을 확인한 뒤 <b>본문 복사</b></li>
      <li><b>이미지</b>를 확인하고 <b>이미지 폴더 열기</b> → 플랫폼에 업로드</li>
      <li>${esc(publishHowTo(chKey))}</li>
      <li>플랫폼 발행 후 목록의 체크박스로 <b>발행됨</b> 표시</li>
    </ol>` : ''}
    ${canChain ? `<label class="small muted" style="display:flex;gap:6px;align-items:center;margin-bottom:6px">
      <input type="checkbox" id="cmp-chain"> 댓글형 체인 (스토리라인) — "---" 또는 빈 줄로 나눈 각 조각이 이어지는 답글로 발행됩니다</label>` : ''}
    <label class="small muted" style="margin:6px 0 4px;display:block">본문 ${draft.ok ? '' : '(직접 입력)'}</label>
    <textarea id="cmp-text" class="rp-input" rows="8" placeholder="생성된 본문이 여기 표시됩니다">${esc(draft.ok ? draft.text : '')}</textarea>
    <div class="small muted" style="display:flex;justify-content:space-between">
      <span id="cmp-count"></span>${limit ? `<span>제한 ${limit}자${canChain ? ' (조각당)' : ''}</span>` : ''}
    </div>
    ${!draft.ok ? `<p class="muted small" style="color:var(--warn)">초안을 찾지 못했습니다 (${esc(draft.error || '')}). 산출물 서랍 또는 본문 폴더에서 확인하세요.</p>
      <div class="insp-actions" style="margin-top:4px"><button type="button" id="cmp-drawer">산출물 서랍</button><button type="button" id="cmp-open-lane">본문 폴더</button></div>` : ''}
    <label class="small muted" style="margin:10px 0 4px;display:block">이미지 ${renders.length ? `(${renders.length}장 — 클릭해 선택)` : ''}</label>
    ${renders.length ? `<div class="pub-media-strip" id="cmp-media">${renders.map((r, i) => `
      <button type="button" class="pub-media ${i === 0 ? 'selected' : ''}" data-rel="${esc(r)}" title="${esc(r.split(/[\\/]/).pop())}">
        <img src="${satUrl(r)}" alt="" loading="lazy">
        <span class="pub-media-name">${esc(r.split(/[\\/]/).pop())}</span>
      </button>`).join('')}</div>
      <p class="muted small" id="cmp-img-label">선택: ${esc((selectedRel || '').split(/[\\/]/).pop())}</p>`
      : `<p class="muted small" style="color:var(--warn)">렌더된 이미지가 없습니다. 카드 인스펙터 → 「비주얼 생성」으로 만든 뒤 다시 검토하세요.</p>`}
    ${isApi && direct.image ? `<label class="small muted" style="display:flex;gap:6px;align-items:center;margin:4px 0">
      <input type="checkbox" id="cmp-img" ${canImage ? 'checked' : 'disabled'}> API 발행 시 선택 이미지 첨부
    </label>` : (isApi ? `<p class="muted small">${esc(direct.imageNote || '이 채널은 텍스트만 직접 발행됩니다')}</p>` : '')}
    <div class="insp-actions" style="margin-top:8px;flex-wrap:wrap">
      <button type="button" id="cmp-copy-text">본문 복사</button>
      <button type="button" id="cmp-open-img">이미지 폴더 열기</button>
      ${selectedRel ? `<button type="button" id="cmp-reveal-img">선택 이미지 위치</button>` : ''}
    </div>
    ${isApi ? `<div style="display:flex;gap:8px;margin-top:8px">
      <button id="cmp-now" class="accent" style="flex:1">지금 발행</button>
      <input type="datetime-local" id="cmp-when" class="rp-input" style="flex:1">
      <button id="cmp-later">예약</button>
    </div>` : `<p class="muted small" style="margin-top:8px">수동 채널입니다. 위 버튼으로 복사·이미지 확인 후 플랫폼에서 발행하고, 목록 체크박스를 켜세요.</p>
      <button type="button" id="cmp-mark" class="accent" style="width:100%;margin-top:6px">${p.published ? '발행 기록 유지됨' : '플랫폼에 올렸음 — 발행됨으로 표시'}</button>`}`;
  const ta = $('#cmp-text');
  let imageRel = selectedRel;
  const refreshMock = () => {
    const mock = $('#cmp-mock');
    if (!mock) return;
    mock.innerHTML = channelMock(chKey, {
      text: ta.value,
      topic: p.topic,
      images: imageRel ? [imageRel, ...renders.filter((r) => r !== imageRel)] : renders,
      compact: false,
    });
  };
  for (const btn of $$('.pub-media', box)) {
    btn.onclick = () => {
      $$('.pub-media', box).forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      imageRel = btn.dataset.rel;
      const lab = $('#cmp-img-label');
      if (lab) lab.textContent = '선택: ' + (imageRel.split(/[\\/]/).pop() || imageRel);
      refreshMock();
    };
  }
  const chained = () => canChain && $('#cmp-chain') && $('#cmp-chain').checked;
  // 체인 모드는 운영자가 명시 선택 — "---"·빈 줄·"Post 1/n" 줄머리를 경계로 나누고,
  // 조각 앞머리 마커만 보수적으로 제거 (콜론 등이 뒤따를 때만 → "3/4"·"2026/07" 본문 보존)
  const TH_M = /^\s*(?:post\s+)?\d+\s*\/\s*(?:\[[^\]]*\]\s*[:.)]?|\d+\s*[:.)])\s*/i;
  const splitChain = (t) => t.split(/\n\s*(?:---+|===+)\s*\n|\n(?=\s*(?:post\s+)?\d+\s*\/\s*(?:\[[^\]]*\]|\d+)\s*[:.)])|\n{2,}/i)
    .map((s) => s.replace(TH_M, '').trim()).filter(Boolean);
  const updCount = () => {
    const el = $('#cmp-count');
    if (!el) return;
    if (chained()) {
      const segs = splitChain(ta.value);
      const over = segs.filter((s) => limit && s.length > limit).length;
      el.textContent = `${segs.length}개 조각${over ? ` · ${over}개 초과!` : ''}`;
      el.style.color = over ? 'var(--bad)' : '';
    } else {
      const n = ta.value.length;
      el.textContent = `${n}자`;
      el.style.color = limit && n > limit ? 'var(--bad)' : '';
    }
  };
  ta.addEventListener('input', () => { updCount(); refreshMock(); });
  box.addEventListener('change', (e) => { if (e.target.id === 'cmp-chain') updCount(); });
  updCount();
  refreshMock();
  $('#cmp-close').onclick = () => { box.classList.add('hidden'); box.innerHTML = ''; };
  const copyText = async () => {
    const text = ta.value.trim();
    if (!text) { toast('복사할 본문이 없습니다'); return; }
    try {
      await navigator.clipboard.writeText(text);
      toast(`본문 ${text.length}자 복사됨 — 플랫폼에 붙여넣으세요`);
    } catch (_) {
      const r = await window.api.pub.copy(S.client.dir, p.lane, p.topic);
      toast(r.ok ? `본문 복사 완료 (${r.chars}자)` : '복사 실패: ' + r.error);
    }
  };
  $('#cmp-copy-text').onclick = copyText;
  $('#cmp-open-img').onclick = () => window.api.ws.openFolder(S.client.dir + '/outputs/creatives');
  const reveal = $('#cmp-reveal-img');
  if (reveal) reveal.onclick = () => {
    const rel = imageRel || selectedRel;
    if (!rel) { toast('선택된 이미지가 없습니다'); return; }
    window.api.ws.openFolder(S.client.dir + '/' + rel.replace(/[\\/][^\\/]+$/, ''));
  };
  const drawerBtn = $('#cmp-drawer');
  if (drawerBtn) drawerBtn.onclick = () => openDrawer();
  const laneBtn = $('#cmp-open-lane');
  if (laneBtn) laneBtn.onclick = () => window.api.ws.openFolder(S.client.dir + '/outputs/' + p.lane);
  const markBtn = $('#cmp-mark');
  if (markBtn) markBtn.onclick = async () => {
    try {
      const r = await window.api.pub.mark(S.client.dir, p.uid, true);
      if (r && r.error) throw new Error(r.error);
      toast('발행됨으로 표시했습니다');
      box.classList.add('hidden');
      refreshBoard(false);
    } catch (e) { toast('기록 실패: ' + e.message); }
  };
  if (!isApi) return;
  const payload = () => {
    const useImg = $('#cmp-img') && $('#cmp-img').checked;
    const base = { uid: p.uid, channel: chKey, text: ta.value, imageRel: useImg ? imageRel : null };
    // 인스타그램은 선택 이미지를 앞세운 전체 렌더 세트를 캐러셀로 — 1장이면 단일 발행
    if (chKey === 'instagram' && useImg) {
      base.imageRels = (imageRel ? [imageRel, ...renders.filter((r) => r !== imageRel)] : renders).slice(0, 10);
    }
    if (chained()) base.segments = splitChain(ta.value);
    return base;
  };
  $('#cmp-now').onclick = async () => {
    if (!ta.value.trim()) { toast('본문이 비어 있습니다'); return; }
    const b = $('#cmp-now'); b.disabled = true; b.textContent = chained() ? '체인 발행 중…' : '발행 중…';
    try {
      const r = await window.api.pub2.publishNow(S.client.dir, payload());
      if (r && r.ok) { toast(`${CH_NAME[chKey] || chKey} 발행 완료${r.chain ? ` (${r.chain}개 체인)` : ''}${r.url ? ' — ' + r.url : ''}`); box.classList.add('hidden'); refreshBoard(false); }
      else toast('발행 실패: ' + ((r && r.error) || '알 수 없음'));
    } finally { b.disabled = false; b.textContent = '지금 발행'; }
  };
  $('#cmp-later').onclick = async () => {
    const when = $('#cmp-when').value;
    if (!when) { toast('예약 시각을 선택하세요'); return; }
    if (!ta.value.trim()) { toast('본문이 비어 있습니다'); return; }
    const r = await window.api.pub2.schedule(S.client.dir, { ...payload(), when: new Date(when).toISOString() });
    if (r && r.ok) { toast(`예약됨 — ${new Date(r.when).toLocaleString('ko-KR')}`); box.classList.add('hidden'); renderPubQueue(chKey); }
    else toast('예약 실패: ' + ((r && r.error) || '알 수 없음'));
  };
}

async function renderPubQueue(chKey) {
  const box = $('#pub-queue');
  if (!box) return;
  const q = await window.api.pub2.queue(S.client.dir);
  if (!q || q.error) { box.innerHTML = ''; return; }
  const mine = (list) => list.filter((i) => i.channel === chKey);
  const pend = mine(q.pending || []);
  const past = mine(q.past || []).slice(-5).reverse();
  if (!pend.length && !past.length) { box.innerHTML = ''; return; }
  box.innerHTML = `<div style="margin:10px 0"><b class="small">예약 큐</b>
    ${pend.map((i) => `<div class="verdict-row" style="gap:8px"><span class="chip tiny">${new Date(i.when).toLocaleString('ko-KR')}</span>
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(i.text.slice(0, 40))}</span>
      <button class="chip" data-qcancel="${esc(i.qid)}">취소</button></div>`).join('')}
    ${past.map((i) => `<div class="verdict-row" style="gap:8px;opacity:.7"><span class="dot ${i.status === 'done' ? 'PASS' : 'BLOCK'}"></span>
      <span class="chip tiny">${i.status === 'done' ? '발행됨' : (i.status === 'cancelled' ? '취소됨' : '실패')}</span>
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc((i.error || i.text || '').slice(0, 40))}</span></div>`).join('')}
  </div>`;
  for (const b of $$('[data-qcancel]', box)) b.onclick = async () => {
    const r = await window.api.pub2.cancel(S.client.dir, b.dataset.qcancel);
    toast(r && r.ok ? '예약 취소됨' : '취소 실패: ' + ((r && r.error) || ''));
    renderPubQueue(chKey);
  };
}

// ---- outputs drawer ------------------------------------------------------------------------
function openDrawer() {
  if (!S.client || !S.board) { toast('클라이언트를 먼저 선택하세요'); return; }
  const sheet = $('#sheet-drawer');
  const lanes = Object.entries(S.board.lanes).filter(([, f]) => f.length);
  sheet.innerHTML = `
    <div class="sheet-head"><h2>산출물 서랍</h2><input id="drawer-q" placeholder="파일명 검색" style="background:var(--card);border:1px solid var(--line);border-radius:8px;padding:6px 10px;color:var(--text);font-size:12px;width:200px"><button class="icon-btn" id="drawer-close"><svg><use href="#i-close"/></svg></button></div>
    <div class="appr-split">
      <div class="appr-files" id="drawer-list">${lanes.map(([lane, files]) => `
        <div style="margin-bottom:10px"><b class="small" style="color:var(--accent-hover)">outputs/${lane}</b>
        ${files.map((f) => `<div class="file-row" draggable="true" data-rel="${esc(f.rel)}"><svg class="fi"><use href="#i-doc"/></svg><span class="fr-name ${Date.now() - f.mtime < 86400e3 ? 'new' : ''}">${esc(f.name)}</span><span class="fr-time muted small">${relTime(f.mtime)}</span></div>`).join('')}</div>`).join('') || '<p class="muted">산출물이 아직 없습니다</p>'}
      </div>
      <div class="appr-preview" id="drawer-preview"><p class="muted">파일을 선택하세요</p></div>
    </div>`;
  $('#drawer-close').onclick = closeOverlay;
  $('#drawer-q').oninput = (e) => {
    const q = e.target.value.toLowerCase();
    for (const row of $$('.file-row', sheet)) row.style.display = row.dataset.rel.toLowerCase().includes(q) ? '' : 'none';
  };
  for (const row of $$('.file-row', sheet)) {
    // 오버레이가 독을 덮어 드래그가 닿지 않으므로 '첨부' 버튼이 확실한 경로
    const attach = document.createElement('button');
    attach.className = 'chip'; attach.textContent = '첨부';
    attach.onclick = (e) => {
      e.stopPropagation();
      S.chips.push({ label: row.dataset.rel.split(/[\\/]/).pop(), context: `[파일 ${row.dataset.rel}]` });
      renderChips(); closeOverlay(); switchDock('chat'); $('#chat-input').focus();
    };
    row.appendChild(attach);
    row.onclick = async () => {
      const r = await window.api.ws.readFile(S.client.dir, row.dataset.rel);
      $('#drawer-preview').innerHTML = previewHTML(r, row.dataset.rel);
    };
    row.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/sat-file', row.dataset.rel));
  }
  openSheet('#sheet-drawer');
}

// ---- settings + wizard -----------------------------------------------------------------------
function envRows(s) {
  const rows = [
    ['claude', 'Claude Code CLI', s.claude], ['codex', 'Codex CLI', s.codex], ['codexAuthed', 'Codex 로그인', s.codexAuthed],
    ['ima2', 'ima2 (이미지·영상)', s.ima2], ['ima2Configured', 'ima2 OAuth 설정', s.ima2Configured],
    ['skillsInstalled', '스킬 19종', s.skillsInstalled], ['agentsInstalled', '에이전트 4종', s.agentsInstalled],
    ['qrMcpRegistered', 'QR MCP (qrcoding)', s.qrMcpRegistered],
  ];
  return rows.map(([k, label, ok]) => `<div class="env-row">${label}<span class="badge ${ok ? 'ok' : 'no'}" data-env="${k}">${ok ? 'OK' : '없음'}</span></div>`).join('');
}
function envButtons() {
  return `<div class="btn-grid">
    <button data-setup="installSkills">스킬 설치/업데이트</button>
    <button data-setup="installCodex">Codex 설치</button>
    <button data-setup="codexLogin">Codex 로그인 (OAuth)</button>
    <button data-setup="registerMcp">Codex MCP 등록</button>
    <button data-setup="registerQrMcp">QR MCP 등록</button>
    <button data-setup="installIma2">ima2 설치</button>
    <button data-setup="ima2Setup">ima2 셋업 (터미널)</button>
    <button data-setup="installVideoSkills" title="HyperFrames(기본)+Remotion(고급) 영상 렌더 스킬을 ~/.claude/skills에 설치. CLI 렌더는 Node 22+·ffmpeg 필요">영상 렌더 스킬 설치</button>
    <button data-setup="installImagePromptKit" title="공냥 프롬프트 킷(image-prompt)을 ~/.claude/skills에 설치. 이미지 생성 시 gpt-image-2 완성 프롬프트로 컴파일">이미지 프롬프트 킷 설치</button>
  </div>`;
}
function bindSetupButtons(root, after) {
  for (const b of $$('[data-setup]', root)) b.onclick = async () => {
    b.disabled = true; const old = b.textContent; b.textContent = old + ' …';
    try {
      const r = await window.api.setup[b.dataset.setup]();
      if (r && r.ok === false) toast((r.tail || r.error || '실패').slice(0, 140));
      else toast(old + ' 완료');
    } catch (e) {
      toast(old + ' 실패: ' + e.message);
    } finally {
      b.disabled = false; b.textContent = old; // IPC reject에도 버튼이 영구 잠기지 않게
      after && after();
    }
  };
}
let settingsSeq = 0;
async function openSettings(section) {
  const seq = ++settingsSeq; // 빠른 재클릭 시 낡은 호출의 리스너 중복 바인딩 방지
  const s = S.env = await window.api.setup.check();
  if (seq !== settingsSeq) return;
  const v = await window.api.update.version();
  const sheet = $('#sheet-settings');
  sheet.innerHTML = `
    <div class="sheet-head"><h2>설정</h2><button class="icon-btn" id="set-close"><svg><use href="#i-close"/></svg></button></div>
    <div class="settings-nav">
      <button data-sec="env" class="active">환경</button><button data-sec="engine">엔진</button><button data-sec="channels">채널</button><button data-sec="opencrab">OpenCrab</button><button data-sec="render">렌더</button><button data-sec="backup">백업</button><button data-sec="update">업데이트</button><button data-sec="about">정보</button>
    </div>
    <div class="sheet-body">
      <div data-body="env">${envRows(s)}${envButtons()}</div>
      <div data-body="channels" class="hidden">
        <p class="muted small" style="margin-bottom:12px;line-height:1.6"><b>메인 채널</b>: 인스타그램 · 스레드 · 네이버 블로그 · 네이버 클립 · 카카오채널<br>각 플랫폼 토큰으로 Blotato 없이 직접 발행합니다. Instagram·네이버·클립·카카오는 API 제약으로 수동 체크리스트를 사용합니다.</p>
        <div id="sec-forms-ch"></div>
      </div>
      <div data-body="opencrab" class="hidden">
        <div id="sec-opencrab"></div>
      </div>
      <div data-body="render" class="hidden">
        <p class="muted small" style="margin-bottom:12px;line-height:1.6"><b>클로드 디자인</b>(SVG→PNG) 레인은 키 없이 항상 동작합니다. 아래 키를 넣으면 이미지·영상 프로바이더가 추가로 열립니다.</p>
        <div id="sec-forms-rd"></div>
      </div>
      <div data-body="engine" class="hidden">
        <p class="muted" style="margin-bottom:10px">기본 엔진을 선택합니다. 대화·파이프라인 단계·이미지 렌더가 이 엔진으로 동작하며, 아래 <b>단계별 엔진</b>에서 구간마다 따로 지정할 수 있습니다.</p>
        <div class="seg" id="set-engine"><button data-engine="claude">Claude</button><button data-engine="codex">Codex</button></div>
        <div style="margin-top:16px">
          <b class="small">단계별 엔진 (구간마다 따로 — 한도 분산)</b>
          <p class="muted small" style="margin:4px 0 8px">비워두면(기본) 위 기본 엔진을 따릅니다. 특정 단계만 다른 엔진으로 돌리려면 지정하세요.</p>
          <div id="set-stage-engines" style="display:grid;grid-template-columns:1fr auto;gap:6px 10px;align-items:center"></div>
        </div>
        <div style="margin-top:18px;display:grid;grid-template-columns:110px 1fr;gap:10px;align-items:center">
          <b class="small">Claude 모델</b>
          <input id="set-model-claude" list="dl-claude" placeholder="기본값 (비워두면 CLI 기본 모델)"
            style="background:var(--card);border:1px solid var(--line);border-radius:8px;padding:7px 10px;color:var(--text);font-size:12.5px">
          <b class="small">Codex 모델</b>
          <input id="set-model-codex" list="dl-codex" placeholder="기본값 (비워두면 CLI 기본 모델)"
            style="background:var(--card);border:1px solid var(--line);border-radius:8px;padding:7px 10px;color:var(--text);font-size:12.5px">
        </div>
        <datalist id="dl-claude">
          <option value="sonnet">Sonnet — 빠르고 균형</option>
          <option value="opus">Opus — 고성능</option>
          <option value="haiku">Haiku — 초경량·저비용</option>
        </datalist>
        <datalist id="dl-codex">
          <option value="gpt-5.6-sol"></option>
          <option value="gpt-5.5-codex"></option>
          <option value="gpt-5.5"></option>
          <option value="gpt-5-codex"></option>
        </datalist>
        <p class="muted small" style="margin-top:10px">Claude 모델은 파이프라인 단계 실행과 Claude 대화에, Codex 모델은 Codex 대화에 적용됩니다. 목록에 없는 모델명도 직접 입력할 수 있습니다.</p>
        <div style="margin-top:18px;display:grid;grid-template-columns:110px 1fr;gap:10px;align-items:center">
          <b class="small">월 예산 (USD)</b>
          <input id="set-budget" type="number" min="0" step="1" placeholder="0 — 예산 없음"
            style="background:var(--card);border:1px solid var(--line);border-radius:8px;padding:7px 10px;color:var(--text);font-size:12.5px">
        </div>
        <p class="muted small" style="margin-top:6px">이번 달 Claude CLI 비용이 예산을 넘으면 오토파일럿이 새 단계를 시작하지 않고, 80%·100% 도달 시 알림이 옵니다. 렌더·Codex 비용은 아직 집계되지 않아 실제 지출의 하한선입니다.</p>
      </div>
      <div data-body="backup" class="hidden">
        <p class="muted" style="margin-bottom:10px;line-height:1.55">클라이언트 워크스페이스(컨텍스트·산출물·에셋·SOP)를 폴더 사본으로 백업합니다. 토큰·API 키는 워크스페이스 밖에 있어 백업에 포함되지 않습니다. 복원하면 현재 상태가 <code>pre-restore</code> 스냅샷으로 자동 보관되어 한 번 더 복원하면 되돌릴 수 있습니다.</p>
        <div class="btn-grid">
          <button id="bk-create">현재 클라이언트 백업</button>
          <button id="bk-open" type="button">백업 폴더 열기</button>
        </div>
        <div id="bk-list" style="margin-top:12px"></div>
      </div>
      <div data-body="update" class="hidden">
        <p>현재 버전 <b>v${esc(v)}</b></p>
        <p class="muted small" style="margin:8px 0;line-height:1.55">
          릴리즈 저장소 <code>contentscoin/social-ai-team-custom</code>이 <b>Private</b>이면
          자동 업데이트가 <code>releases.atom</code> 404를 냅니다.
          <br>① 저장소를 <b>Public</b>으로 바꾸거나
          ② 아래 GitHub PAT(<code>repo</code> 권한)를 저장하세요.
        </p>
        <label class="small muted">GitHub PAT (업데이트 전용, 로컬만 저장)</label>
        <div style="display:flex;gap:8px;margin:6px 0 10px">
          <input id="set-gh-token" class="rp-input" type="password" placeholder="ghp_… 또는 github_pat_…" style="flex:1" autocomplete="off">
          <button id="set-gh-save" type="button">저장</button>
        </div>
        <p id="set-gh-mask" class="muted small"></p>
        <div class="btn-grid">
          <button id="set-upd-check">업데이트 확인</button>
          <button id="set-upd-releases" type="button">릴리즈 페이지 열기</button>
        </div>
        <p id="set-upd-status" class="muted" style="margin-top:8px"></p>
      </div>
      <div data-body="about" class="hidden">
        <p><b>Social AI Team — 온에어 데스크</b></p>
        <p class="muted" style="margin-top:6px;line-height:1.7">스킬 19종 + 서브에이전트 4종으로 구성된 소셜 콘텐츠 팀의 컨트롤타워.<br>카드는 드래그로 옮기는 것이 아니라, 팀의 산출물 파일이 생기면 스스로 이동합니다.</p>
      </div>
    </div>`;
  $('#set-close').onclick = closeOverlay;
  for (const nb of $$('.settings-nav button', sheet)) nb.onclick = () => {
    $$('.settings-nav button', sheet).forEach((x) => x.classList.toggle('active', x === nb));
    $$('[data-body]', sheet).forEach((x) => x.classList.toggle('hidden', x.dataset.body !== nb.dataset.sec));
  };
  bindSetupButtons(sheet, () => refreshEnvBadges(sheet));
  for (const b of $$('#set-engine button')) { b.classList.toggle('active', b.dataset.engine === S.engine); b.onclick = async () => { S.engine = await window.api.engine.set(b.dataset.engine); applyEngine(); $$('#set-engine button').forEach((x) => x.classList.toggle('active', x.dataset.engine === S.engine)); renderStageEngines(); }; }
  // 단계별 엔진 — 각 파이프라인 단계에 기본/Claude/Codex 지정
  const STAGE_ENGINE_ROWS = [
    ['calendar', '캘린더'], ['copy', '카피'], ['shortform', '릴스/영상'], ['verify', '사실 검증'],
    ['visuals', '비주얼 브리프'], ['visuals-generate', '비주얼 생성(이미지)'], ['compliance', '컴플라이언스'], ['review', '성과 리뷰'],
  ];
  async function renderStageEngines() {
    const box = $('#set-stage-engines');
    if (!box) return;
    const ov = await window.api.engine.getStageEngines();
    if (seq !== settingsSeq) return;
    box.innerHTML = STAGE_ENGINE_ROWS.map(([k, label]) => {
      const v = ov[k] || '';
      const opt = (val, txt) => `<option value="${val}"${v === val ? ' selected' : ''}>${txt}</option>`;
      return `<span class="small">${label}</span>`
        + `<select data-stage-engine="${k}" style="background:var(--card);border:1px solid var(--line);border-radius:8px;padding:5px 8px;color:var(--text);font-size:12px">`
        + opt('', `기본 (${S.engine === 'codex' ? 'Codex' : 'Claude'})`) + opt('claude', 'Claude') + opt('codex', 'Codex') + '</select>';
    }).join('');
    for (const sel of $$('#set-stage-engines select')) sel.onchange = async () => {
      await window.api.engine.setStageEngine(sel.dataset.stageEngine, sel.value);
      const lbl = (STAGE_ENGINE_ROWS.find((r) => r[0] === sel.dataset.stageEngine) || [])[1] || sel.dataset.stageEngine;
      toast(`${lbl} 엔진: ${sel.value ? (sel.value === 'codex' ? 'Codex' : 'Claude') : '기본'}`);
    };
  }
  await renderStageEngines();
  if (seq !== settingsSeq) return;
  // 엔진별 모델 선택 — 입력 후 포커스 아웃/Enter 시 저장
  S.models = await window.api.engine.getModels();
  if (seq !== settingsSeq) return;
  const bindModel = (id, engine) => {
    const inp = $(id);
    inp.value = S.models[engine] || '';
    const save = async () => {
      const v = inp.value.trim();
      if (v === (S.models[engine] || '')) return;
      S.models = await window.api.engine.setModel(engine, v);
      applyEngine();
      toast(`${engine === 'claude' ? 'Claude' : 'Codex'} 모델: ${v || '기본값'}`);
    };
    inp.addEventListener('change', save);
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
  };
  bindModel('#set-model-claude', 'claude');
  bindModel('#set-model-codex', 'codex');
  // 월 예산 — 입력 후 포커스 아웃/Enter 시 저장 (0 또는 빈값 = 해제)
  {
    const inp = $('#set-budget');
    let cur = await window.api.engine.getBudget();
    if (seq !== settingsSeq) return;
    inp.value = cur || '';
    const saveBudget = async () => {
      const v = Number(inp.value) || 0;
      if (v === cur) return;
      cur = await window.api.engine.setBudget(v);
      inp.value = cur || '';
      toast(cur ? `월 예산: $${cur}` : '월 예산 해제');
    };
    inp.addEventListener('change', saveBudget);
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveBudget(); });
  }
  // 백업 — 목록 렌더 + 생성/복원/삭제
  {
    const listEl = $('#bk-list');
    const fmtDate = (iso) => String(iso || '').slice(0, 16).replace('T', ' ');
    const renderBackups = async () => {
      const items = await window.api.backup.list();
      if (seq !== settingsSeq || !listEl) return;
      if (!items.length) { listEl.innerHTML = '<p class="muted small">백업이 없습니다.</p>'; return; }
      listEl.innerHTML = items.map((b) => `
        <div style="display:flex;gap:8px;align-items:center;padding:7px 0;border-bottom:1px solid var(--line)">
          <div style="flex:1;min-width:0">
            <b class="small">${esc(b.client)}</b>
            <span class="muted small">${esc(fmtDate(b.createdAt))} · ${Number(b.files) || 0}개 파일${b.kind !== 'manual' ? ' · ' + esc(b.kind) : ''}</span>
          </div>
          <button class="small" data-bk-restore="${esc(b.name)}" data-bk-dir="${esc(b.sourceDir)}">복원</button>
          <button class="small" data-bk-del="${esc(b.name)}">삭제</button>
        </div>`).join('');
      for (const btn of $$('[data-bk-restore]', listEl)) btn.onclick = async () => {
        const dir = btn.dataset.bkDir;
        if (!confirm(`이 백업으로 복원할까요?\n대상: ${dir}\n현재 상태는 pre-restore 스냅샷으로 보관됩니다.`)) return;
        const r = await window.api.backup.restore(btn.dataset.bkRestore, dir);
        toast(r.ok ? `복원 완료 — 스냅샷: ${r.snapshot}` : r.error);
        renderBackups();
      };
      for (const btn of $$('[data-bk-del]', listEl)) btn.onclick = async () => {
        if (!confirm('이 백업을 삭제할까요? 되돌릴 수 없습니다.')) return;
        const r = await window.api.backup.remove(btn.dataset.bkDel);
        toast(r.ok ? '백업 삭제됨' : r.error);
        renderBackups();
      };
    };
    $('#bk-create').onclick = async () => {
      if (!S.client) { toast('먼저 클라이언트를 선택하세요'); return; }
      const r = await window.api.backup.create(S.client.dir);
      toast(r.ok ? `백업 완료 — ${r.files}개 파일` : r.error);
      renderBackups();
    };
    $('#bk-open').onclick = () => window.api.backup.open();
    renderBackups();
  }
  const setUpdStatus = (text) => {
    const el = $('#set-upd-status');
    if (el) el.textContent = text;
  };
  const applyUpdResult = (r) => {
    if (!r) { setUpdStatus('응답 없음'); return; }
    if (r.state === 'latest') setUpdStatus(`최신 버전입니다 (v${r.version || ''})`);
    else if (r.state === 'available') setUpdStatus(`v${r.version} 발견 — 다운로드 중…`);
    else if (r.state === 'checking') setUpdStatus('확인 중…');
    else if (r.ok) setUpdStatus(`확인 완료${r.version ? ` (v${r.version})` : ''}`);
    else setUpdStatus(r.message || '업데이트 확인 실패');
  };
  try {
    const st = await window.api.update.status();
    if (st && !st.packaged) setUpdStatus('설치본이 아닙니다(개발 실행). 자동 업데이트는 설치 후 동작합니다.');
    else if (st && !st.hasToken) setUpdStatus('PAT 없음 — Private 저장소면 아래에 토큰을 저장하세요.');
    else setUpdStatus('「업데이트 확인」을 누르면 결과가 여기에 표시됩니다.');
  } catch { /* ignore */ }
  $('#set-upd-check').onclick = async () => {
    setUpdStatus('확인 중… (최대 20초)');
    try {
      const r = await window.api.update.check();
      applyUpdResult(r);
      toast(r && r.ok
        ? (r.state === 'available' ? `업데이트 v${r.version} 발견` : '최신 버전입니다')
        : ('업데이트: ' + (r && r.message || '실패')).slice(0, 120));
    } catch (e) {
      setUpdStatus('확인 실패: ' + e.message);
      toast('업데이트 확인 실패: ' + e.message);
    }
  };
  $('#set-upd-releases').onclick = () => window.api.update.openReleases();
  try {
    const gh = await window.api.sec.get('github');
    const mask = $('#set-gh-mask');
    if (mask) mask.textContent = gh && gh.token ? `저장됨: ${gh.token}` : '토큰 없음 — Public 저장소이거나 PAT 필요';
  } catch { /* ignore */ }
  $('#set-gh-save').onclick = async () => {
    const token = ($('#set-gh-token').value || '').trim();
    await window.api.sec.set('github', { token });
    $('#set-gh-token').value = '';
    const gh = await window.api.sec.get('github');
    $('#set-gh-mask').textContent = gh && gh.token ? `저장됨: ${gh.token}` : '토큰 삭제됨';
    toast(token ? 'GitHub 업데이트 토큰 저장됨 — 확인 중…' : '토큰 삭제됨');
    if (token) {
      setUpdStatus('토큰 저장됨 — 업데이트 확인 중…');
      try { applyUpdResult(await window.api.update.check()); }
      catch (e) { setUpdStatus('확인 실패: ' + e.message); }
    }
  };
  // 채널 토큰 폼 (직접 발행) + 렌더 프로바이더 키 폼
  buildSecretForms($('#sec-forms-ch', sheet), CH_SECRET_FORMS, true);
  buildSecretForms($('#sec-forms-rd', sheet), RD_SECRET_FORMS, false);
  renderPackSection($('#sec-forms-rd', sheet));
  renderOpenCrabSection($('#sec-opencrab', sheet));
  if (section) $(`.settings-nav button[data-sec="${section}"]`, sheet).click();
  openSheet('#sheet-settings');
}

// ---- 시크릿 폼 (채널 토큰 · 렌더 키) ---------------------------------------------------------
const CH_SECRET_FORMS = [
  { ns: 'instagram', title: 'Instagram (Graph API)', test: 'instagram', hint: '비즈니스/크리에이터 계정 전용. Meta 앱에서 instagram_business_basic + instagram_business_content_publish 권한 토큰 발급, IG User ID는 /me/accounts→instagram_business_account. 이미지는 공개 URL이 필수라 렌더 탭의 QR Agent Studio(qrcoding) API 키로 자동 업로드됩니다. 여러 장 선택 시 캐러셀 발행.',
    fields: [['userId', 'IG User ID'], ['token', '액세스 토큰']] },
  { ns: 'x', title: 'X (Twitter)', test: 'x', hint: 'console.x.com에서 앱 생성 → Keys and tokens 4종. 텍스트+이미지 발행. 2026년부터 종량제(포스트당 $0.015)라 크레딧 충전 필요.',
    fields: [['apiKey', 'API Key'], ['apiSecret', 'API Key Secret'], ['accessToken', 'Access Token'], ['accessSecret', 'Access Token Secret']] },
  { ns: 'facebook', title: 'Facebook 페이지', test: 'facebook', hint: 'developers.facebook.com 앱(개발 모드로 내 페이지 발행 가능) → 장기 사용자 토큰 → /me/accounts의 페이지 토큰(만료 없음). 텍스트+이미지.',
    fields: [['pageId', '페이지 ID'], ['pageToken', '페이지 액세스 토큰']] },
  { ns: 'threads', title: 'Threads', test: 'threads', hint: 'Meta 앱 → Threads API 유스케이스 → 테스터 초대·수락 → 장기 토큰(60일, 50일쯤 갱신). 텍스트 발행 (이미지는 공개 URL 필수라 수동).',
    fields: [['userId', 'Threads 사용자 ID'], ['token', '액세스 토큰']] },
  { ns: 'linkedin', title: 'LinkedIn', test: 'linkedin', hint: '개발자 앱에 "Share on LinkedIn" 제품 추가(즉시 승인) → OAuth로 토큰(60일 만료 시 재발급). Person ID는 /v2/userinfo의 sub 값. 텍스트+이미지.',
    fields: [['personId', 'Person ID (urn 뒷부분)'], ['token', '액세스 토큰']] },
];
const RD_SECRET_FORMS = [
  { ns: 'openai', title: 'OpenAI (이미지 gpt-image-1)', hint: 'platform.openai.com API 키 — "코덱스 이미지" 레인.',
    fields: [['apiKey', 'API Key']] },
  { ns: 'google', title: 'Google Veo (Gemini API)', hint: 'aistudio.google.com에서 발급한 Gemini API 키. text/image→video. 모델명은 계정에 열린 것으로 (예: veo-3.0-fast-generate-001, veo-3.1-generate-preview).',
    fields: [['apiKey', 'API Key'], ['model', '모델 (기본 veo-3.0-fast-generate-001)']] },
  { ns: 'runway', title: 'Runway', hint: 'dev.runwayml.com 개발자 포털 키. 키프레임 이미지→영상 (gen4_turbo 기준 5초 ≈ $0.25). 모델에 veo3.1 등 Runway 경유 모델도 입력 가능.',
    fields: [['apiKey', 'API Secret'], ['model', '모델 (기본 gen4_turbo)']] },
  { ns: 'higgsfield', title: 'Higgsfield', hint: 'platform.higgsfield.ai에서 발급한 Key ID/Secret. DoP image→video.',
    fields: [['keyId', 'Key ID'], ['keySecret', 'Key Secret'], ['model', '모델 (기본 dop-turbo)']] },
  { ns: 'replicate', title: 'Replicate (오픈모델 게이트웨이)', hint: 'replicate.com 토큰 하나로 Wan·Kling·Hunyuan·LTX 등 호스팅 모델 사용. 모델은 "owner/name" 형식 (replicate.com/collections/text-to-video 참고). 이미지 입력 필드명이 다른 모델은 imageKey로 지정.',
    fields: [['token', 'API Token'], ['model', '모델 (예: wan-video/wan-2.2-i2v-a14b)'], ['imageKey', '이미지 입력 키 (기본 image)']] },
  { ns: 'comfyui', title: 'ComfyUI (오픈소스 로컬)', hint: '로컬에 띄운 ComfyUI 주소와 API 포맷 워크플로 JSON 경로. 프롬프트 자리에 __PROMPT__ 를 넣어두면 치환됩니다.',
    fields: [['url', 'URL (예: http://127.0.0.1:8188)'], ['workflowPath', '워크플로 JSON 파일 경로']] },
  { ns: 'custom-video', title: '커스텀 HTTP 브릿지', hint: 'POST {prompt, image_b64?, duration} → {video_url|image_url|…_b64} 규약의 자체 엔드포인트 — 아직 내장되지 않은 신생 서비스(Hyperframe 등)를 여기로 연결.',
    fields: [['url', '엔드포인트 URL'], ['headers', '추가 헤더 (JSON, 선택)']] },
  { ns: 'opencrab', title: 'OpenCrab MCP (프롬프트 팩)', hint: 'opencrab.sh의 내 MCP 엔드포인트(https://opencrab.sh/api/mcp/…)를 넣으면 아래 팩 섹션에서 프롬프트·이미지·영상 팩을 검색해 컴파일러에 로드할 수 있습니다.',
    fields: [['endpoint', 'MCP 엔드포인트 URL']] },
  { ns: 'qrcoding', title: 'QR Agent Studio MCP (qrcoding)', hint: 'QR 생성·합성·스캔 검증 도구를 팀 에이전트에 제공합니다. 대시보드의 Skills & MCP 패널에서 API 키를 발급해 저장하고, 설정 → 환경의 "QR MCP 등록" 버튼으로 claude에 등록하세요. URL을 비우면 기본 게이트웨이(qrcoding-skill-mcp.vercel.app)를 씁니다.',
    fields: [['apiKey', 'API Key (x-api-key)'], ['url', 'MCP URL (선택 — 기본 게이트웨이 /mcp)'], ['apiUrl', '서비스 URL (선택 — 인스타 이미지 업로드용 /v1/uploads 배포)']] },
];

// ---- OpenCrab 연결 (설정 → OpenCrab 탭) -----------------------------------------------
async function renderOpenCrabSection(root) {
  if (!root) return;
  const c = await window.api.packs.ocConstants();
  const box = document.createElement('div');
  box.className = 'sec-form';
  box.innerHTML = `<div class="sec-head"><b>OpenCrab 프로젝트·워크플로</b><span class="muted small">에이전트 글쓰기 근거</span></div>
    <p class="muted small" style="margin:6px 0 10px;line-height:1.6">기본 프로젝트 <code>${esc(c.project && c.project.name || '')}</code> · 워크플로 <code>${esc((c.workflows && c.workflows.threads_evidence_writing && c.workflows.threads_evidence_writing.name) || 'Threads Evidence Writing Workflow')}</code><br>MCP 엔드포인트는 <b>렌더</b> 탭의 OpenCrab 설정을 사용합니다.</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">
      <button id="oc-run-threads">Threads 워크플로 실행</button>
      <button id="oc-list-proj">프로젝트 목록</button>
      <button id="oc-orch-cal" class="chip">pumasi: 캘린더 인덱스</button>
    </div>
    <p class="muted small" id="oc-run-msg"></p>
    <hr style="border:none;border-top:1px solid var(--line);margin:14px 0">
    <div class="sec-head"><b>비주얼 자산 인제스트</b><span class="muted small">마스터시트 · 캐릭터시트 · 콘텐츠 베이스</span></div>
    <p class="muted small" style="margin:6px 0 8px"><code>context/visual-assets/{master_sheet,character_sheet,content_base}/</code> 에 .md를 넣고 인제스트하세요.</p>
    <div id="va-list" class="small" style="margin-bottom:8px"></div>
    <div style="display:flex;gap:8px;align-items:center">
      <button id="va-ensure">폴더 준비</button>
      <input id="va-proj" class="rp-input" placeholder="OpenCrab 프로젝트명" style="flex:1">
      <button id="va-ingest">비주얼 팩 인제스트</button>
    </div>
    <p class="muted small" id="va-msg" style="margin-top:6px"></p>`;
  root.appendChild(box);

  const refreshVa = async () => {
    if (!S.client) { $('#va-list', box).innerHTML = '<span class="muted">클라이언트 선택 필요</span>'; return; }
    const list = await window.api.vassets.list(S.client.dir);
    $('#va-list', box).innerHTML = (list || []).length
      ? list.map((a) => `<span class="chip tiny">${esc(a.kind)}: ${esc(a.file)}</span>`).join(' ')
      : '<span class="muted">자산 없음 — [폴더 준비] 후 md 파일 추가</span>';
    if (S.client) $('#va-proj', box).value = $('#va-proj', box).value || `${S.client.name}-비주얼`;
  };
  refreshVa();

  $('#oc-run-threads', box).onclick = async () => {
    const b = $('#oc-run-threads', box); b.disabled = true;
    $('#oc-run-msg', box).textContent = '워크플로 실행 중…';
    try {
      const r = await window.api.packs.ocRunWorkflow('threads_evidence_writing', { query: '소셜 글쓰기 패턴' });
      $('#oc-run-msg', box).textContent = r && r.ok ? `✔ ${r.workflow} 실행됨` : '✖ ' + ((r && r.error) || '실패');
    } catch (e) { $('#oc-run-msg', box).textContent = '✖ ' + e.message; }
    finally { b.disabled = false; }
  };
  $('#oc-list-proj', box).onclick = async () => {
    const r = await window.api.packs.ocProjects();
    $('#oc-run-msg', box).textContent = r && r.ok
      ? (r.projects || []).map((p) => p.name || p.id).slice(0, 5).join(', ') || '프로젝트 없음'
      : '✖ ' + ((r && r.error) || '실패');
  };
  $('#oc-orch-cal', box).onclick = async () => {
    if (!S.client) { toast('클라이언트 선택 필요'); return; }
    const r = await window.api.orch.run(S.client.dir, 'calendar-index');
    $('#oc-run-msg', box).textContent = r && r.ok ? '✔ 캘린더 인덱스 태스크 완료' : '✖ ' + ((r && r.error) || (r && r.tail) || '실패');
    refreshBoard(false);
  };
  $('#va-ensure', box).onclick = async () => {
    if (!S.client) return;
    await window.api.vassets.ensure(S.client.dir);
    toast('visual-assets 폴더 준비됨');
    refreshVa();
  };
  $('#va-ingest', box).onclick = async () => {
    if (!S.client) return;
    const b = $('#va-ingest', box); b.disabled = true;
    try {
      const r = await window.api.vassets.ingest(S.client.dir, $('#va-proj', box).value.trim());
      $('#va-msg', box).textContent = r && r.ok ? `✔ ${r.ingested || r.count}/${r.total || r.count} 인제스트` : '✖ ' + ((r && r.error) || '실패');
    } catch (e) { $('#va-msg', box).textContent = '✖ ' + e.message; }
    finally { b.disabled = false; }
  };
}

// ---- 프롬프트 팩 관리 (설정 → 렌더 하단) ------------------------------------------------
async function renderPackSection(root) {
  if (!root) return;
  const box = document.createElement('div');
  box.className = 'sec-form';
  box.innerHTML = `<div class="sec-head"><b>프롬프트 팩</b><span class="muted small">컴파일러가 참조하는 시각 언어 자산</span></div>
    <div id="pack-list" class="small" style="margin:8px 0"></div>
    <div style="display:flex;gap:8px">
      <input id="oc-q" class="rp-input" placeholder="OpenCrab 팩 검색 (예: 프롬프트 이미지 영상)" style="flex:1">
      <button id="oc-search">검색</button>
    </div>
    <div id="oc-results" class="small" style="margin-top:8px"></div>`;
  root.appendChild(box);

  // ── 전략 추출 & OpenCrab 인제스트 (현재 클라이언트 기준) ──
  const sbox = document.createElement('div');
  sbox.className = 'sec-form';
  sbox.innerHTML = `<div class="sec-head"><b>전략 추출 & OpenCrab 인제스트</b><span class="muted small">채널별·주제별 재사용 전략</span></div>
    <p class="muted small" style="margin:4px 0 8px">현재 클라이언트의 브랜드·캘린더·분석 자료에서 채널별·주제별 전략을 뽑아 <code>context/strategy/</code>에 저장하고, OpenCrab MCP 프로젝트로 올립니다.</p>
    <div id="strat-list" class="small" style="margin-bottom:8px"></div>
    <div style="display:flex;gap:8px;align-items:center">
      <button id="strat-extract">전략 추출</button>
      <input id="strat-proj" class="rp-input" placeholder="OpenCrab 프로젝트명 (예: 온도-소셜전략)" style="flex:1">
      <button id="strat-ingest">인제스트</button>
    </div>
    <p class="muted small" id="strat-msg" style="margin-top:6px"></p>`;
  root.appendChild(sbox);
  const refreshStrat = async () => {
    if (!S.client) { $('#strat-list', sbox).innerHTML = '<span class="muted">클라이언트를 먼저 선택하세요</span>'; return; }
    const items = await window.api.strat.list(S.client.dir);
    const list = Array.isArray(items) ? items : [];
    $('#strat-list', sbox).innerHTML = list.length
      ? list.map((s) => `<span class="chip tiny" title="${esc(s.title)}">${s.kind === 'channel' ? '📡' : (s.kind === 'topic' ? '🎯' : '📄')} ${esc(s.title.slice(0, 24))}</span>`).join(' ')
      : '<span class="muted">아직 전략 파일 없음 — [전략 추출]을 먼저</span>';
    if (S.client) $('#strat-proj', sbox).value = $('#strat-proj', sbox).value || `${S.client.name}-소셜전략`;
  };
  refreshStrat();
  $('#strat-extract', sbox).onclick = async () => {
    if (!S.client) { toast('클라이언트를 먼저 선택하세요'); return; }
    const b = $('#strat-extract', sbox); b.disabled = true; b.textContent = '추출 중… (수 분)';
    $('#strat-msg', sbox).textContent = '브랜드·캘린더·분석 자료에서 전략을 뽑는 중입니다';
    try {
      const r = await window.api.strat.extract(S.client.dir);
      $('#strat-msg', sbox).textContent = r && r.ok ? `✔ ${r.count}개 (채널 ${r.channels} · 주제 ${r.topics})` : '✖ ' + ((r && r.error) || '실패');
      refreshStrat();
    } catch (e) { $('#strat-msg', sbox).textContent = '✖ ' + e.message; }
    finally { b.disabled = false; b.textContent = '전략 추출'; }
  };
  $('#strat-ingest', sbox).onclick = async () => {
    if (!S.client) { toast('클라이언트를 먼저 선택하세요'); return; }
    const proj = $('#strat-proj', sbox).value.trim();
    if (!proj) { toast('프로젝트명을 입력하세요'); return; }
    const b = $('#strat-ingest', sbox); b.disabled = true; b.textContent = '인제스트 중…';
    try {
      const r = await window.api.strat.ingest(S.client.dir, proj);
      if (r && r.ok) $('#strat-msg', sbox).textContent = `✔ ${r.ingested}/${r.total} 인제스트 (도구 ${r.ingestTool || '?'})`;
      else if (r && r.unsupported) $('#strat-msg', sbox).textContent = `⚠ ${r.note || '엔드포인트가 읽기 전용 — 전략은 로컬에 저장됨'}`;
      else $('#strat-msg', sbox).textContent = '✖ ' + ((r && (r.note || r.error)) || '실패');
    } catch (e) { $('#strat-msg', sbox).textContent = '✖ ' + e.message; }
    finally { b.disabled = false; b.textContent = '인제스트'; }
  };
  const refreshList = async () => {
    const packs = await window.api.packs.list();
    $('#pack-list', box).innerHTML = (Array.isArray(packs) ? packs : []).map((p) =>
      `<div class="env-row" style="padding:4px 0">${esc(p.name)} <span class="chip tiny">${p.source === 'builtin' ? '내장' : '사용자'}</span>
       ${p.source === 'user' ? `<button class="chip tiny" data-packdel="${esc(p.file)}" style="margin-left:auto">삭제</button>` : '<span style="margin-left:auto"></span>'}</div>`).join('')
      || '<p class="muted">팩 없음</p>';
    for (const b of $$('[data-packdel]', box)) b.onclick = async () => {
      await window.api.packs.delete(b.dataset.packdel);
      refreshList();
    };
  };
  refreshList();
  $('#oc-search', box).onclick = async () => {
    const res = $('#oc-results', box);
    res.innerHTML = '<span class="muted">검색 중…</span>';
    const r = await window.api.packs.ocSearch($('#oc-q', box).value || '프롬프트 이미지 영상');
    if (!r || r.error || !r.ok) { res.innerHTML = `<span style="color:var(--warn)">${esc((r && r.error) || '검색 실패 — 엔드포인트를 확인하세요')}</span>`; return; }
    res.innerHTML = r.packs.length ? r.packs.map((p, i) =>
      `<div class="env-row" style="padding:4px 0"><b>${esc(p.title)}</b> <span class="chip tiny">${esc(p.category)}</span>
       <span class="muted" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin:0 6px">${esc(p.description.slice(0, 60))}</span>
       <button class="chip tiny" data-ocload="${i}">가져오기</button></div>`).join('') : '<p class="muted">결과 없음</p>';
    for (const b of $$('[data-ocload]', box)) b.onclick = async () => {
      b.disabled = true; b.textContent = '로딩…';
      const lr = await window.api.packs.ocLoad(r.packs[Number(b.dataset.ocload)]);
      if (lr && lr.ok) { toast(`팩 저장됨: ${lr.file}${lr.via === 'metadata' ? ' (메타데이터만 — 본문 도구 미제공 서버)' : ''}`); refreshList(); }
      else toast('가져오기 실패: ' + ((lr && lr.error) || ''));
      b.disabled = false; b.textContent = '가져오기';
    };
  };
}
function buildSecretForms(root, forms, isChannel) {
  if (!root) return;
  root.innerHTML = '';
  for (const f of forms) {
    const box = document.createElement('div');
    box.className = 'sec-form';
    box.innerHTML = `<div class="sec-head"><b>${esc(f.title)}</b><span class="badge no" data-secstate="${f.ns}">미설정</span></div>
      <p class="muted small" style="margin:4px 0 8px">${esc(f.hint)}</p>
      ${f.fields.map(([k, label]) => `<input class="rp-input" data-ns="${f.ns}" data-k="${k}" placeholder="${esc(label)}" autocomplete="off" spellcheck="false" style="margin-bottom:6px">`).join('')}
      <div style="display:flex;gap:8px">
        <button data-secsave="${f.ns}">저장</button>
        ${f.test ? `<button data-sectest="${f.test}">연결 테스트</button>` : ''}
        <span class="muted small" data-secmsg="${f.ns}" style="align-self:center"></span>
      </div>`;
    root.appendChild(box);
    // 기존 값은 마스킹된 placeholder로만 보여준다 — 원문은 렌더러로 오지 않는다
    window.api.sec.get(f.ns).then((masked) => {
      if (masked && !masked.error) {
        const anySet = Object.keys(masked).length > 0;
        const badge = $(`[data-secstate="${f.ns}"]`, box);
        if (anySet && badge) { badge.className = 'badge ok'; badge.textContent = '설정됨'; }
        for (const inp of $$(`input[data-ns="${f.ns}"]`, box)) if (masked[inp.dataset.k]) inp.placeholder = `${inp.placeholder} — 저장됨: ${masked[inp.dataset.k]}`;
      }
    });
    $(`[data-secsave="${f.ns}"]`, box).onclick = async () => {
      const values = {};
      for (const inp of $$(`input[data-ns="${f.ns}"]`, box)) if (inp.value.trim()) values[inp.dataset.k] = inp.value.trim();
      if (!Object.keys(values).length) { toast('입력된 값이 없습니다'); return; }
      const r = await window.api.sec.set(f.ns, values);
      if (r && r.error) { toast('저장 실패: ' + r.error); return; }
      for (const inp of $$(`input[data-ns="${f.ns}"]`, box)) inp.value = '';
      const badge = $(`[data-secstate="${f.ns}"]`, box);
      if (badge) { badge.className = 'badge ok'; badge.textContent = '설정됨'; }
      toast(`${f.title} 저장됨`);
      if (isChannel) { await window.api.sec.invalidateChannels(); S.channels = await window.api.channels.check(); S.blotato = !!S.channels.blotato; renderChannels(); }
    };
    const tb = f.test && $(`[data-sectest="${f.test}"]`, box);
    if (tb) tb.onclick = async () => {
      const msg = $(`[data-secmsg="${f.ns}"]`, box);
      msg.textContent = '테스트 중…';
      const r = await window.api.pub2.test(f.test);
      msg.textContent = r && r.ok ? `✔ 연결됨${r.detail ? ' (' + r.detail + ')' : ''}` : `✖ ${(r && r.error) || '실패'}`;
    };
  }
}
async function refreshEnvBadges(root) {
  const s = S.env = await window.api.setup.check();
  const map = { claude: s.claude, codex: s.codex, codexAuthed: s.codexAuthed, ima2: s.ima2, ima2Configured: s.ima2Configured, skillsInstalled: s.skillsInstalled, agentsInstalled: s.agentsInstalled };
  for (const b of $$('[data-env]', root || document)) {
    const ok = !!map[b.dataset.env];
    b.className = 'badge ' + (ok ? 'ok' : 'no'); b.textContent = ok ? 'OK' : '없음';
  }
  updateHealth(s);
}
function updateHealth(s) {
  const core = s.claude && s.skillsInstalled && s.agentsInstalled;
  $('#health-dot').classList.toggle('ok', !!core);
}
async function maybeWizard() {
  const s = S.env = await window.api.setup.check();
  updateHealth(s);
  const core = s.claude && s.skillsInstalled && s.agentsInstalled;
  if (core || localStorage.getItem('wizardDone')) return;
  const wz = $('#wizard');
  wz.innerHTML = `<div class="wizard-card">
    <h2 style="text-align:center">출근 준비</h2>
    <p class="muted" style="text-align:center">소셜 콘텐츠 팀이 이 PC에서 일할 수 있게 준비합니다</p>
    <div class="wizard-steps"><span class="wz-step on"></span><span class="wz-step"></span><span class="wz-step"></span></div>
    <div id="wz-env">${envRows(s)}${envButtons()}</div>
    <div style="display:flex;gap:8px;justify-content:space-between">
      <button id="wz-skip">건너뛰기 (수동 설정)</button>
      <button id="wz-enter" class="cta" disabled>보드로 입장</button>
    </div></div>`;
  bindSetupButtons(wz, () => refreshEnvBadges(wz));
  const poll = setInterval(async () => {
    if (wz.classList.contains('hidden')) { clearInterval(poll); return; }
    await refreshEnvBadges(wz);
    const e = S.env;
    const okCore = e.claude && e.skillsInstalled && e.agentsInstalled;
    $('#wz-enter').disabled = !okCore;
    const steps = $$('.wz-step', wz);
    steps[0].classList.toggle('on', true);
    steps[1].classList.toggle('on', e.codexAuthed || e.ima2Configured);
    steps[2].classList.toggle('on', okCore);
  }, 3000);
  const done = () => { localStorage.setItem('wizardDone', '1'); closeOverlay(); };
  $('#wz-skip').onclick = done;
  $('#wz-enter').onclick = done;
  openSheet('#wizard');
}

// ---- main-process events --------------------------------------------------------------------
let lastMainErrToast = 0;
window.api.onLog(({ source, line }) => {
  logLine(source, line);
  if (source === 'main-error' && Date.now() - lastMainErrToast > 10000) {
    lastMainErrToast = Date.now();
    toast('내부 오류 발생 — 로그 탭에서 확인하세요');
  }
});
window.api.onBoard((payload) => {
  const b = payload && payload.board ? payload.board : payload;
  const dir = payload && payload.dir;
  if (!S.client || (dir && dir !== S.client.dir)) return; // 다른 클라이언트의 잔여 푸시 무시
  const dirAtEntry = S.client.dir;
  applyBoard(b, false);
  window.api.gates.get(dirAtEntry).then((g) => {
    if (!S.client || S.client.dir !== dirAtEntry) return; // resolve 중 클라이언트 전환됨
    S.gates = g; renderGateBar();
    // 열려 있는 승인 시트/인스펙터/발행 패널은 새 데이터로 재구성
    if (S.approveNode && !$('#sheet-approve').classList.contains('hidden')) {
      const fresh = (g.nodes || []).find((n) => n.key === S.approveNode);
      if (fresh) reopenApproveSheet(fresh);
    }
    if (S.inspectorN != null && !$('#dock-inspector').classList.contains('hidden')) {
      const p = S.board.posts.find((x) => x.uid === S.inspectorN);
      if (p) openInspector(p);
    }
    if (S.publishCh && !$('#dock-inspector').classList.contains('hidden')) {
      // 발행 본문을 작성 중이면 재구성하지 않는다 — 편집 내용이 날아가면 안 된다
      const cmp = $('#pub-compose');
      if (!cmp || cmp.classList.contains('hidden')) openPublishPanel(S.publishCh);
    }
  });
});
window.api.onStage(({ state, stage, dir }) => {
  if (!dir) return;
  if (S.client && dir === S.client.dir) {
    // 뷰 클라이언트 — 툴바/게이트바 갱신
    if (state === 'start') setRunning(stage);
    else if (stage === S.running) setRunning(null); // 지연 도착한 이전 스테이지 end 무시
  } else {
    // 백그라운드 클라이언트 — 맵과 배너만 갱신
    trackBgRun(dir, state === 'start' ? stage : null);
  }
});
// 실행 결과 리포트 — 단계가 끝나면 "무엇이 바뀌었나"를 로그에 구조화 블록으로 남긴다.
// 오토파일럿 중에는 단계마다 토스트를 띄우지 않는다 (로그 블록 + 종료 알림으로 충분).
window.api.onStageResult((r) => {
  if (r.dir && S.client && r.dir !== S.client.dir) return;
  const c = r.changes || { created: [], modified: [] };
  const cost = typeof r.costUsd === 'number' ? ` · $${r.costUsd.toFixed(3)}` : '';
  const head = `${r.ok ? '✅' : '❌'} ${r.stage} ${r.ok ? '완료' : '실패'} — 생성 ${c.created.length} · 수정 ${c.modified.length}${cost} · ${Math.round(r.ms / 1000)}s`;
  logLine('결과', head);
  for (const f of c.created.slice(0, 20)) logLine('결과', `  + ${f}`);
  for (const f of c.modified.slice(0, 20)) logLine('결과', `  ~ ${f}`);
  const shown = Math.min(c.created.length, 20) + Math.min(c.modified.length, 20);
  const more = c.created.length + c.modified.length - shown;
  if (more > 0) logLine('결과', `  … 외 ${more}개`);
  if (r.ok && !c.created.length && !c.modified.length) logLine('결과', '  변경된 파일 없음 — 이미 산출물이 있었거나 파일을 만들지 않는 단계입니다');
  if (!r.ok && r.error) logLine('결과', `  원인: ${r.error}`);
  if (r.compliance) {
    logLine('결과', `  판정 요약: PASS ${r.compliance.pass} · WARN ${r.compliance.warn} · BLOCK ${r.compliance.block}`);
    for (const p of (r.compliance.posts || [])) logLine('결과', `    [${p.verdict}] ${p.uid} — ${p.topic}`);
  }
  if (r.verify) {
    logLine('결과', `  사실 검증: PASS ${r.verify.pass} · REVISE ${r.verify.revise}${r.verify.revise ? ' — REVISE 포스트는 교체 필요' : ''}`);
  }
  if (!S.auto) toast(head.slice(0, 120));
});
let updErrToasted = false;
window.api.onUpdate(async (u) => {
  if (u.state === 'ready') { $('#tb-update').classList.remove('hidden'); }
  if (u.state === 'skipped') {
    logLine('update', u.message || '자동 업데이트 건너뜀 (비공개 저장소)');
  }
  if (u.state === 'error' && !updErrToasted) {
    updErrToasted = true; // 백그라운드 실패도 최소 1회는 통지
    logLine('update', '업데이트 확인 실패: ' + u.message);
  }
  const el = $('#set-upd-status');
  if (el) {
    if (u.state === 'checking') el.textContent = '확인 중…';
    else if (u.state === 'latest') el.textContent = `최신 버전입니다 (v${u.version || ''})`;
    else if (u.state === 'available') el.textContent = `v${u.version} 발견 — 다운로드 중…`;
    else if (u.state === 'downloading') el.textContent = `다운로드 중… ${u.percent}%`;
    else if (u.state === 'ready') el.textContent = `v${u.version} 준비 완료 — 재시작하면 적용됩니다`;
    else if (u.state === 'skipped') el.textContent = u.message || '자동 업데이트 비활성 (비공개 저장소)';
    else if (u.state === 'error') el.textContent = `업데이트 오류: ${u.message}`;
  }
});

// 채널 필터 와이어는 리사이즈/스크롤에서 재계산
let wireRaf = null;
const redrawWire = () => { if (!wireRaf) wireRaf = requestAnimationFrame(() => { wireRaf = null; drawWire(); }); };
window.addEventListener('resize', redrawWire);
$('#channel-scroll').addEventListener('scroll', redrawWire);

// ---- boot --------------------------------------------------------------------------------------
(async function boot() {
  // 초기화 단계별로 실패를 격리 — 하나가 죽어도 앱이 백지가 되지 않게
  try { S.engine = await window.api.engine.get(); S.models = await window.api.engine.getModels(); applyEngine(); }
  catch (e) { reportError('boot-engine', e.message); }
  try { S.channels = await window.api.channels.check(); S.blotato = !!S.channels.blotato; }
  catch (e) { reportError('boot-channels', e.message); }
  try {
    await refreshClients();
    renderHero();
    if (S.clients[0]) await selectClient(S.clients[0]);
  } catch (e) { reportError('boot-clients', e.message); toast('초기화 실패: ' + e.message); }
  try { await maybeWizard(); }
  catch (e) { reportError('boot-wizard', e.message); }
})();
})();
