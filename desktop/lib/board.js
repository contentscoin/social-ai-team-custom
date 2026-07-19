// Live production board data — parses context/content-calendar.md into post cards
// and infers each post's pipeline stage from file evidence in outputs/.
// Stages: planned → copy → visual → review → ready   (cards move themselves; no manual drag)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const channelRegistry = require('./channels');
const calendarDates = require('./calendar-dates');

const STAGES = ['planned', 'copy', 'visual', 'review', 'ready'];
// 경로 키 캐시 — 같은 파일의 재기록은 엔트리를 교체하므로 누적되지 않는다
const textCache = new Map(); // path → { mtimeMs, size, text }
let cacheBytes = 0;

// ---- helpers -----------------------------------------------------------------
function read(p, cap = 512 * 1024) {
  try {
    const stat = fs.statSync(p);
    if (!stat.isFile() || stat.size > cap) return '';
    return fs.readFileSync(p, 'utf8');
  } catch { return ''; }
}
function cachedRead(fp, st) {
  const hit = textCache.get(fp);
  if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) return hit.text;
  const t = read(fp);
  if (hit) cacheBytes -= hit.text.length;
  cacheBytes += t.length;
  textCache.set(fp, { mtimeMs: st.mtimeMs, size: st.size, text: t });
  if (cacheBytes > 12 * 1024 * 1024) { // 12MB 초과 시 오래된 절반 퇴출 (삽입 순)
    let n = Math.floor(textCache.size / 2);
    for (const [k, v] of textCache) {
      if (n-- <= 0) break;
      cacheBytes -= v.text.length;
      textCache.delete(k);
    }
  }
  return t;
}
function readLane(dir, lane) {
  const p = path.join(dir, 'outputs', lane);
  let text = '';
  const files = [];
  try {
    for (const f of fs.readdirSync(p)) {
      const fp = path.join(p, f);
      const st = fs.statSync(fp);
      if (!st.isFile()) continue;
      // rel은 항상 POSIX 슬래시 — Windows에서 sat:// / HTML data-rel 깨짐 방지
      files.push({ name: f, rel: path.join('outputs', lane, f).replace(/\\/g, '/'), mtime: st.mtimeMs, size: st.size, _fp: fp });
    }
  } catch { /* lane absent */ }
  files.sort((a, b) => b.mtime - a.mtime);
  // aggregate cap: newest 40 text files / 2MB per lane — watch events must stay cheap
  // perFile: 파일별 정규화 텍스트 — 카드가 "내 카피가 어느 파일에 있는지"를 찾을 수 있게
  const perFile = [];
  let budget = 2 * 1024 * 1024, count = 0;
  for (const f of files) {
    if (!/\.(md|txt|json|srt)$/i.test(f.name)) { perFile.push({ rel: f.rel, name: f.name, norm: norm(f.name) }); continue; }
    if (++count > 40 || (budget -= f.size) < 0) break;
    const t = cachedRead(f._fp, { mtimeMs: f.mtime, size: f.size });
    text += '\n' + t;
    perFile.push({ rel: f.rel, name: f.name, norm: norm(f.name + ' ' + t) });
  }
  for (const f of files) delete f._fp;
  return { text, files, perFile };
}
// normalize for fuzzy topic matching (Korean + English, drop spaces/punctuation)
function norm(s) {
  return String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}
// 레지스트리 값(chId/mono)을 정규식에 삽입할 때 이스케이프 — etc 채널의 mono '?'가 크래시하지 않게
function escRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
// does haystack contain a meaningful chunk of the topic?
function topicIn(haystackNorm, topic) {
  const t = norm(topic);
  if (!t) return false;
  if (haystackNorm.includes(t)) return true;
  if (t.length < 12) return false;
  // sliding 12-char windows — defends against writers trimming/reflowing titles
  for (let i = 0; i + 12 <= Math.min(t.length, 42); i += 6) {
    if (haystackNorm.includes(t.slice(i, i + 12))) return true;
  }
  return false;
}

// ---- calendar parsing ----------------------------------------------------------
// 필드 라인 — "- Format: reel"/"* **Format**: reel"처럼 리스트 마커·볼드 장식이 붙어도 잡는다
const F = (name) => new RegExp(`^\\s*(?:[-*•]\\s*)?(?:\\*\\*)?${name}(?:\\*\\*)?\\s*[:：]\\s*(.+)$`, 'im');
const FIELD_RE = {
  platform: F('(?:Platform|플랫폼|채널)'),
  pillar: F('(?:Pillar|필러)'),
  format: F('(?:Format|형식|포맷)'),
  objective: F('(?:Objective|목표)'),
  topic: F('(?:Topic|주제|토픽)'),
  angle: F('(?:Angle|앵글)'),
  visual: F('(?:Visual direction|Visual|비주얼(?:\\s*디렉션)?)'),
  notes: F('(?:Notes|노트|비고)'),
};

function parsePostBlock(n, header, block) {
  const post = { n, week: '', day: '', platform: '', pillar: '', format: '', objective: '', topic: '', angle: '', visual: '', notes: '' };
  // canonical: "Week: 1 | Day: Mon" — demo variant: header "POST 1 — Week 3, Monday — Instagram — ..."
  const wk = block.match(/^Week:\s*(\S+)\s*\|\s*Day:\s*(\S+)/im) || header.match(/Week\s*(\d+)[,\s—-]+\s*(\w+)/i);
  if (wk) { post.week = String(wk[1]).replace(/^W/i, ''); post.day = wk[2]; }
  for (const [k, re] of Object.entries(FIELD_RE)) {
    const m = block.match(re);
    if (m) post[k === 'visual' ? 'visual' : k] = m[1].trim();
  }
  // header-line fallbacks (demo format: POST 1 — Week 3, Monday — Instagram — 브랜드 스토리 — single image — brand awareness)
  const parts = header.split(/\s+—\s+|\s+-\s+/).map((s) => s.trim());
  if (!post.platform) {
    const plat = parts.find((s) => /instagram|facebook|linkedin|threads|naver\s*clip|네이버\s*클립|naver\s*blog|네이버\s*블로그|카카오|kakao|naver|x$|^x\b|tiktok/i.test(s));
    if (plat) post.platform = plat;
  }
  if (!post.format) {
    const fmt = parts.find((s) => /^(single image|carousel|reel|poll|text|long-form|video|릴스|캐러셀|이미지)/i.test(s));
    if (fmt) post.format = fmt;
  }
  if (!post.topic) {
    // 구분자(—/:)는 선택 — "IG-1 홈카페 라떼 아트"처럼 공백만 있는 헤더도 토픽으로 잡는다
    const tm = header.match(/^(?:POST\s*\d+|[A-Z]{1,2}-\d+)\s*[—:–-]?\s*(.+)$/i);
    if (tm) {
      const t = tm[1].split(/\s+—\s+/)[0].replace(/^Week\s*\d+[,\s]*/i, '').trim();
      if (t) post.topic = t;
    }
  }
  post.headerRaw = header;
  return post;
}

const ID_PLATFORM = channelRegistry.ID_PLATFORM;
const CH_ID = Object.fromEntries(Object.entries(channelRegistry.REGISTRY).map(([k, v]) => [k, v.chId]));
function laneOf(platform) { return channelRegistry.laneOf(platform); }
function channelKey(platform) { return channelRegistry.channelKey(platform); }
function parseCalendar(md) {
  const posts = [];
  // 앵커 두 형태: "POST 12 …" 또는 채널-ID "IG-4 …" (헤딩/볼드 장식 허용)
  const anchors = [...md.matchAll(/^#{0,4}\s*\**\s*(?:POST\s*(\d+)|(IG|FB|LI|LN|IN|TH|X|NV|NB|TT)-(\d+))\b\**\s*(.*)$/gim)];
  for (let i = 0; i < anchors.length; i++) {
    const m = anchors[i];
    const start = m.index + m[0].length;
    const end = i + 1 < anchors.length ? anchors[i + 1].index : Math.min(md.length, start + 2500);
    const n = Number(m[1] || m[3]);
    const header = (m[2] ? m[2] + '-' + m[3] + ' ' : 'POST ' + n + ' ') + (m[4] || '');
    const post = parsePostBlock(n, header, md.slice(start, end));
    if (m[2] && !post.platform) post.platform = ID_PLATFORM[m[2].toUpperCase()] || m[2];
    posts.push(post);
  }
  if (posts.length) return dedupe(posts);
  // fallback 1: 헤더 매핑 테이블 — 모든 표를 스캔해 "캘린더 시그니처"가 가장 강한 표를 채택
  // (판정표/요약표가 '주제' 유사 헤더를 가져도 week/day/platform/format 시그니처가 없으면 탈락)
  const lines = md.split(/\r?\n/);
  let best = null;
  for (let i = 0; i < lines.length; i++) {
    if (!/^\|.*\|/.test(lines[i]) || !/^\|[\s:|-]+\|/.test(lines[i + 1] || '')) continue;
    const headers = lines[i].split('|').slice(1, -1).map((h) => h.trim().toLowerCase());
    const col = (...keys) => headers.findIndex((h) => keys.some((k) => h.includes(k)));
    // ID 컬럼은 앵커드 매칭 — 'notes'가 'no'에 걸리는 부분 문자열 오탐 방지
    const cId = headers.findIndex((h) => ['id', '#', 'no', 'no.'].includes(h) || h.startsWith('번호'));
    const cTopic = col('topic', '주제', '토픽', '제목');
    if (cTopic < 0) continue;
    const cWeek = col('week', '주차'), cDay = col('day', '요일', '날짜', 'date'),
      cPlat = col('platform', '채널', '플랫폼'), cPil = col('pillar', '필러'),
      cFmt = col('format', '형식', '포맷'), cObj = col('objective', '목표');
    const signature = [cWeek, cDay, cPlat, cFmt, cPil].filter((c) => c >= 0).length;
    if (signature < 2) continue; // 캘린더 표가 아님
    const rows = [];
    for (let r = i + 2; r < lines.length && /^\|.*\|/.test(lines[r]); r++) {
      const cells = lines[r].split('|').slice(1, -1).map((c) => c.trim().replace(/\*\*/g, ''));
      const idCell = cId >= 0 ? (cells[cId] || '') : '';
      const idm = idCell.match(/^([A-Za-z]{1,2})-?(\d+)|^(\d+)$/);
      if (cId >= 0 && !idm) continue;
      const at = (c) => (c >= 0 && cells[c]) || '';
      if (!at(cTopic)) continue;
      rows.push({
        n: Number((idm && (idm[2] || idm[3])) || rows.length + 1),
        week: at(cWeek).replace(/^W/i, ''), day: at(cDay),
        platform: at(cPlat) || (idm && idm[1] ? (ID_PLATFORM[idm[1].toUpperCase()] || '') : ''),
        pillar: at(cPil), format: at(cFmt), objective: at(cObj),
        topic: at(cTopic), angle: '', visual: '', notes: '', headerRaw: idCell,
      });
    }
    if (rows.length && (!best || signature > best.signature || (signature === best.signature && rows.length > best.rows.length))) {
      best = { signature, rows };
    }
  }
  return dedupe(best ? best.rows : posts);
}
function dedupe(posts) {
  const seen = new Map();
  for (const p of posts) {
    const key = p.n + '|' + norm(p.topic).slice(0, 24);
    if (!seen.has(key)) seen.set(key, p);
  }
  return [...seen.values()].sort((a, b) => a.n - b.n);
}

// ---- verdict parsing ---------------------------------------------------------------
const VERDICT_RANK = { PASS: 1, WARN: 2, BLOCK: 3 };
function lineCitesPostNumber(line, n) {
  // 원본 라인에서 숫자를 경계까지 정확히 비교 — norm 기반 includes('post1')는 POST 10~19에 오탐
  for (const m of line.matchAll(/POST\s*#?0*(\d+)/gi)) if (Number(m[1]) === n) return true;
  for (const m of line.matchAll(/\b[A-Z]{1,2}-0*(\d+)\b/g)) if (Number(m[1]) === n) return true;
  return false;
}
function verdictFor(complianceRaw, post) {
  if (!complianceRaw) return null;
  const lines = complianceRaw.split(/\r?\n/).filter((l) => /PASS|WARN|BLOCK/.test(l));
  let worst = null;
  for (const line of lines) {
    const ln = norm(line);
    const byTopic = topicIn(ln, post.topic);
    // fallback: "POST n"/"IG-n" 인용 + 레인/플랫폼 동시 언급 (실제 판정표 형태)
    const byNumber = lineCitesPostNumber(line, post.n) && (ln.includes(post.lane) || ln.includes(norm(post.platform)));
    if (byTopic || byNumber) {
      const m = line.match(/BLOCK|WARN|PASS/);
      if (m && (!worst || VERDICT_RANK[m[0]] > VERDICT_RANK[worst])) worst = m[0];
    }
  }
  return worst;
}

// ---- main entry ----------------------------------------------------------------------
// 기계 판독용 인덱스 — 마크다운 형식과 무관하게 보드를 보장하는 1순위 소스.
// 단, md가 인덱스보다 새로우면(인덱스를 안 만드는 경로로 재생성됨) 낡은 인덱스를 무시한다.
function loadIndex(dir) {
  try {
    const ixPath = path.join(dir, 'context', 'calendar-index.json');
    const mdPath = path.join(dir, 'context', 'content-calendar.md');
    try {
      const ixM = fs.statSync(ixPath).mtimeMs;
      const mdM = fs.statSync(mdPath).mtimeMs;
      if (mdM > ixM + 2000) return null; // md가 더 새로움 — 인덱스 스테일
    } catch { /* 둘 중 하나 없음 — 아래 파싱 시도 */ }
    const j = JSON.parse(read(ixPath));
    if (!Array.isArray(j.posts) || !j.posts.length) return null;
    return j.posts.map((p, i) => {
      const id = String(p.id || '');
      const idm = id.match(/^([A-Za-z]{1,2})-?(\d+)/);
      // 스키마 드리프트 허용 — 모델이 platform 대신 channel, n 대신 no/number로 쓰는 경우
      const nRaw = Number(p.n || p.no || p.number || (idm && idm[2]));
      return {
        n: Number.isFinite(nRaw) && nRaw > 0 ? nRaw : i + 1,
        week: String(p.week || '').replace(/^W/i, ''),
        day: String(p.day || ''),
        scheduledDate: p.scheduledDate || p.date || '',
        scheduledTime: p.scheduledTime || p.time || '',
        platform: p.platform || p.channel || (idm && ID_PLATFORM[idm[1].toUpperCase()]) || '',
        pillar: p.pillar || '', format: p.format || '', objective: p.objective || '',
        topic: p.topic || '', angle: p.angle || '', visual: p.visual || '', notes: p.notes || '',
        headerRaw: id,
      };
    });
  } catch { return null; }
}

function buildBoard(dir) {
  const calMd = read(path.join(dir, 'context', 'content-calendar.md'));
  const indexPosts = loadIndex(dir);
  const posts = indexPosts || (calMd ? parseCalendar(calMd) : []);

  const lanes = {};
  for (const lane of ['captions', 'linkedin', 'threads', 'x', 'naver', 'naver_clip', 'kakao', 'videos', 'storyboards', 'creatives', 'verify', 'compliance', 'reviews']) {
    lanes[lane] = readLane(dir, lane);
    lanes[lane].norm = norm(lanes[lane].text);
  }
  const statusRaw = read(path.join(dir, 'context', 'workflow-status.md'));
  const publishedLane = /Published via Blotato[^\n]*\[x\]|\[x\][^\n]*Published via Blotato/i.test(statusRaw)
    || /^- \[x\].*Blotato.*scheduled/im.test(statusRaw);

  const meta = calendarDates.loadCalendarMeta(dir);
  const cards = calendarDates.enrichPostsWithDates(posts, dir).map((post) => {
    const lane = laneOf(post.platform);
    const isReel = /reel|video|영상|릴스|shorts|tiktok|슬라이드|slide|클립|clip/i.test(post.format + ' ' + (post.headerRaw || ''));
    // 릴/영상 슬롯의 '카피' 산출물은 캡션이 아니라 대본·스토리보드·슬라이드 가이드다.
    // 대본이 슬롯을 인용하거나(Calendar slot:#n / REEL n) 토픽이 일치하면 카피 단계로 인정 —
    // 이게 없어서 대본이 있어도 릴 카드가 planned에 머물고 릴스/보드 게이트가 영원히 안 열렸다.
    // 대본의 명시적 캘린더 슬롯 인용만 인정한다 (reels-script/slide-video의 "Calendar slot: #n").
    // 릴 내부 인덱스(REEL 1, 씬 2…)는 캘린더 슬롯 번호와 다를 수 있어 오탐 방지 차원에서 제외.
    const scriptCitesSlot = (raw) => new RegExp(`(?:Calendar\\s*slot|캘린더\\s*슬롯)[\\s:#]*0*${post.n}(?![0-9])`, 'i').test(raw || '');
    const scriptDone = isReel && (
      topicIn(lanes.videos.norm, post.topic) || topicIn(lanes.storyboards.norm, post.topic)
      || scriptCitesSlot(lanes.videos.text) || scriptCitesSlot(lanes.storyboards.text)
    );
    const copyDone = isReel ? scriptDone : topicIn(lanes[lane].norm, post.topic);
    // 렌더 엔진 산출물 — `${chId}-${n}` / `${MONO}-${n}` / 토픽 키워드 파일명 매칭
    const chKey = channelKey(post.platform);
    const chId = CH_ID[chKey] || 'etc';
    const mono = (channelRegistry.REGISTRY[chKey] && channelRegistry.REGISTRY[chKey].mono) || '';
    const n = post.n;
    const renderRes = [
      new RegExp(`^${escRe(chId)}-0*${n}(?![0-9])`, 'i'),
      mono ? new RegExp(`^${escRe(mono)}-0*${n}(?![0-9])`, 'i') : null,
      new RegExp(`^${escRe(chKey)}[_-]?0*${n}(?![0-9])`, 'i'),
      // uid 형태: instagram-1 / ig_1
      new RegExp(`^${escRe(chKey)}-${n}(?![0-9])`, 'i'),
    ].filter(Boolean);
    const isImageName = (name) => /\.(png|jpe?g|webp|gif)$/i.test(name || '');
    const matchRenderName = (name) => renderRes.some((re) => re.test(name));
    // 파일명 순으로 정렬 — 캐러셀 슬라이드 _1,_2,… / 카드뉴스 _c1,_c2… 순서를 보드에 그대로
    let renders = (lanes.creatives.files || [])
      .filter((f) => isImageName(f.name) && matchRenderName(f.name))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    // 프리픽스 미스(에이전트 케밥 파일명) — 토픽 토큰이 파일명에 있으면 매칭
    if (!renders.length) {
      const tokens = String(post.topic || '').toLowerCase().split(/[^a-z0-9가-힣]+/).filter((t) => t.length >= 3).slice(0, 6);
      if (tokens.length) {
        renders = (lanes.creatives.files || [])
          .filter((f) => {
            if (!isImageName(f.name)) return false;
            const nn = f.name.toLowerCase();
            return tokens.some((t) => nn.includes(t));
          })
          .sort((a, b) => (b.mtime || 0) - (a.mtime || 0))
          .slice(0, 6);
      }
    }
    const videoRenders = (lanes.videos.files || []).filter((f) => matchRenderName(f.name) && /\.(mp4|webm|mov)$/i.test(f.name));
    // 릴의 'visual' 단계 = 실제 렌더된 영상(mp4)이 존재. 대본만 있으면 copy 단계에 머문다.
    // (슬라이드형은 앱이 자동 렌더 → mp4 생성 시 visual, 수동 제작형은 외부 생성 후 mp4 배치 시 visual)
    const visualDone = isReel
      ? videoRenders.length > 0
      : renders.length > 0 || (lanes.creatives.files.length > 0 && topicIn(norm(lanes.creatives.text), post.topic));
    const verdict = verdictFor(lanes.compliance.text, { ...post, lane });

    let stage = 'planned';
    if (copyDone) stage = 'copy';
    if (copyDone && visualDone) stage = 'visual';
    // verdicts only promote posts that actually have copy evidence — a stale
    // compliance file must not mark an unwritten post publish-ready
    if (copyDone && (verdict === 'WARN' || verdict === 'BLOCK')) stage = 'review';
    if (copyDone && verdict === 'PASS') stage = 'ready';

    // 이 포스트의 근거 파일들 — 인스펙터/카드에서 바로 열 수 있게 (레인 첫 파일이 아니라 실제 매칭)
    const matchFiles = (laneObj, kind, limit) => (laneObj.perFile || [])
      .filter((pf) => topicIn(pf.norm, post.topic)).slice(0, limit)
      .map((pf) => ({ rel: pf.rel, kind }));
    const files = [...matchFiles(lanes[lane], 'copy', 2)];
    if (isReel) files.push(...matchFiles(lanes.videos, 'video', 1), ...matchFiles(lanes.storyboards, 'board', 1));
    files.push(...renders.slice(0, 10).map((f) => ({ rel: f.rel, kind: 'render' }))); // 캐러셀 여러 장
    files.push(...videoRenders.slice(0, 2).map((f) => ({ rel: f.rel, kind: 'videorender' })));
    files.push(...matchFiles(lanes.creatives, 'creative', 2));
    if (verdict && (lanes.compliance.perFile || []).length) files.push({ rel: lanes.compliance.perFile[0].rel, kind: 'verdict' });

    return {
      ...post, lane, isReel, stage, verdict: copyDone ? verdict : null, channel: chKey, files,
      // 카드 썸네일 — 최신 렌더 이미지 (fs.watch가 생성 즉시 반영)
      thumb: renders[0] ? renders[0].rel : null,
      videoThumb: videoRenders[0] ? videoRenders[0].rel : null,
      chId,
    };
  });

  // 아직 썸네일이 없는 카드에, 쓰이지 않은 creatives를 채널·순서대로 배분
  // (에이전트가 ig-1.png 규칙 없이 저장한 경우 템플릿/카드에 이미지가 비는 문제 보완)
  {
    const used = new Set();
    for (const c of cards) {
      for (const f of (c.files || [])) if (f.kind === 'render' || f.kind === 'creative') used.add(f.rel);
      if (c.thumb) used.add(c.thumb);
    }
    const pool = (lanes.creatives.files || [])
      .filter((f) => /\.(png|jpe?g|webp|gif)$/i.test(f.name) && !used.has(f.rel))
      .sort((a, b) => (b.mtime || 0) - (a.mtime || 0));
    let pi = 0;
    for (const c of cards) {
      if (c.thumb || !pool[pi]) continue;
      const f = pool[pi++];
      c.thumb = f.rel;
      c.files = c.files || [];
      c.files.push({ rel: f.rel, kind: 'render' });
      if (c.stage === 'copy') c.stage = 'visual';
    }
  }

  // 채널-ID 캘린더는 IG-1과 TH-1처럼 번호가 겹친다 — 카드 식별은 uid로
  const seenUid = new Set();
  let publishLog = {};
  try { publishLog = (JSON.parse(read(path.join(dir, 'context', 'publish-log.json'))) || {}).published || {}; } catch { /* none */ }
  let calMtime = 0;
  try { calMtime = fs.statSync(path.join(dir, 'context', 'content-calendar.md')).mtimeMs; } catch { /* none */ }
  for (const c of cards) {
    let uid = `${c.channel}-${c.n}`;
    while (seenUid.has(uid)) uid += 'x';
    seenUid.add(uid);
    c.uid = uid;
    c.published = !!publishLog[uid];
    // stale: 캘린더(상위 계획)가 이 카드의 카피 산출물보다 최신 → 재생성 검토 필요
    const laneNewest = (lanes[c.lane].files[0] || {}).mtime || 0;
    c.stale = c.stage !== 'planned' && calMtime > laneNewest && laneNewest > 0;
  }

  // channel aggregates
  const channelMap = {};
  for (const c of cards) {
    const k = c.channel;
    channelMap[k] = channelMap[k] || {
      key: k, posts: 0, byStage: { planned: 0, copy: 0, visual: 0, review: 0, ready: 0 },
      warn: 0, block: 0, lane: c.lane,
      publishRoute: channelRegistry.publishRouteOf(k),
      files: [],
      primary: channelRegistry.PRIMARY_CHANNELS.includes(k),
    };
    channelMap[k].posts += 1;
    channelMap[k].byStage[c.stage] += 1;
    if (c.verdict === 'WARN') channelMap[k].warn += 1;
    if (c.verdict === 'BLOCK') channelMap[k].block += 1;
  }
  for (const ch of Object.values(channelMap)) {
    ch.files = (lanes[ch.lane] ? lanes[ch.lane].files : []).slice(0, 5);
  }

  const laneFiles = {};
  for (const [name, l] of Object.entries(lanes)) laneFiles[name] = l.files;

  return {
    hasCalendar: !!calMd || !!indexPosts,
    fromIndex: !!indexPosts,
    calendarMeta: meta,
    postsByDate: Object.fromEntries([...calendarDates.groupPostsByDate(cards, meta)]),
    calendarHash: calMd
      ? crypto.createHash('sha1').update(calMd).digest('hex').slice(0, 12)
      : (indexPosts ? crypto.createHash('sha1').update(JSON.stringify(indexPosts)).digest('hex').slice(0, 12) : null),
    posts: cards,
    stages: STAGES,
    channels: channelRegistry.sortChannels(Object.values(channelMap)),
    lanes: laneFiles,
    foundation: {
      brand: fs.existsSync(path.join(dir, 'context', 'brand-style.md')),
      voice: fs.existsSync(path.join(dir, 'context', 'kr-voice-profile.md')),
      calendar: !!calMd,
    },
    compliance: {
      file: lanes.compliance.files[0] || null,
      pass: cards.filter((c) => c.verdict === 'PASS').length,
      warn: cards.filter((c) => c.verdict === 'WARN').length,
      block: cards.filter((c) => c.verdict === 'BLOCK').length,
    },
    verify: verifySummary(lanes.verify),
  };
}

// 사실 검증 리포트의 요약 줄(`Overall: PASS n / REVISE n`)을 파싱 — 게이트 증거·배지용.
function verifySummary(lane) {
  const out = { file: (lane && lane.files[0]) || null, pass: 0, revise: 0 };
  const m = /Overall:\s*PASS\s*(\d+)\s*\/\s*REVISE\s*(\d+)/i.exec((lane && lane.text) || '');
  if (m) { out.pass = Number(m[1]); out.revise = Number(m[2]); }
  return out;
}

module.exports = { buildBoard, parseCalendar, STAGES };
