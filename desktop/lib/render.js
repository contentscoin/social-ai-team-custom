// 인앱 렌더 엔진 — 프롬프트 md에서 멈추지 않고 실제 PNG/MP4를 만든다.
// 이미지: claude-svg(클로드 SVG 디자인) / gn-html(공냥 카드 — HTML 조판, 과금 0) / openai-image(gpt-image-1)
//         / ima2(ChatGPT OAuth · --ref 앵커) / codex(codex exec $imagegen 병렬) / comfyui / custom
// 영상:   runway / higgsfield / google-veo(Gemini API) / replicate(오픈모델 게이트웨이)
//         / ffmpeg(로컬 무료 슬라이드쇼·켄번즈) / comfyui(오픈소스 로컬) / custom-http / ima2-video(Grok)
// 산출 파일명은 `${chId}-${n}` 프리픽스 — board.js가 카드에 자동 매칭해 썸네일로 표시한다.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { runCmd, isWin } = require('./proc');
const secrets = require('./secrets');
const config = require('./config');
const { svgToPng, htmlToPng, extractSvg, extractSvgAll } = require('./svg2png');
const gncards = require('./gncards');
const { finalizeImagePrompt, shotFraming } = require('./promptlab');
const engine = require('./engine');

const SIZES = { square: [1080, 1080], portrait: [1080, 1350], story: [1080, 1920], landscape: [1200, 675] };

// ---- 공용 ----------------------------------------------------------------------
function outName(dir, sub, base, ext) {
  const d = path.join(dir, 'outputs', sub);
  fs.mkdirSync(d, { recursive: true });
  for (let i = 1; i < 100; i++) {
    const name = i === 1 ? `${base}.${ext}` : `${base}_v${i}.${ext}`;
    if (!fs.existsSync(path.join(d, name))) {
      return { abs: path.join(d, name), rel: path.join('outputs', sub, name).replace(/\\/g, '/') };
    }
  }
  const name = `${base}_${Date.now()}.${ext}`;
  return { abs: path.join(d, name), rel: path.join('outputs', sub, name).replace(/\\/g, '/') };
}

async function fetchJson(url, opts, timeoutMs = 120_000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: ac.signal });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* non-JSON error body */ }
    return { status: res.status, ok: res.ok, json, text };
  } finally { clearTimeout(t); }
}

async function downloadTo(url, absPath, timeoutMs = 300_000, headers) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ac.signal, headers });
    if (!res.ok) throw new Error(`download ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    fs.writeFileSync(absPath, buf);
    return buf.length;
  } finally { clearTimeout(t); }
}

function err(provider, message) { return { ok: false, provider, error: String(message).slice(0, 500) }; }

// ---- 이미지 프로바이더 -------------------------------------------------------------
// (1) 클로드 디자인 — claude가 브랜드 스타일 기반 SVG를 설계하고 앱이 PNG로 굽는다.
//     API 키가 하나도 없어도 동작하는 기본 레인. 텍스트 카드·인포그래픽에 강함.
async function genClaudeSvg(dir, job, onLine) {
  const [w, h] = SIZES[job.size] || SIZES.square;
  const cards = Math.min(10, Math.max(1, Number(job.cards) || 1));
  // 디자인 팩(레이아웃 아키타입·한글 타이포 규칙 + 카드뉴스 문법) 주입
  let designPack = '';
  try { designPack = require('./promptlab').packContext('svg', cards > 1 ? 9000 : 6000); } catch { /* 팩 없이도 동작 */ }
  const cardRule = cards > 1
    ? `- 이것은 ${cards}장짜리 카드뉴스다. 디자인 팩의 카드뉴스 문법을 따르라: 표지 1장(후킹) + 본문 ${cards - 2}장(카드당 메시지 1개·진행표시 01/${String(cards).padStart(2, '0')} 형식) + 엔딩 1장(요약+CTA).\n` +
      `- 전 카드 동일 그리드·팔레트·타이포 스케일 (시리즈 일관성 규칙 준수)\n` +
      `- 정확히 ${cards}개의 <svg> 블록을 순서대로 출력하고, 각 블록 사이에 <!--CARD--> 주석 한 줄을 넣어라\n`
    : `- 디자인 팩의 아키타입 중 포스트 성격에 맞는 것 하나를 고르고, 한글 타이포·색·여백 규칙을 그대로 지켜라\n`;
  // 채널 SOUL §9(무엇을 찍는가/보여주나) — SVG 카드도 채널의 피사체·구성 원칙을 따른다.
  let soulBlock = '';
  try { const s = require('./souls').visualBlock(dir, job.channel); if (s) soulBlock = `\n[채널 원칙 — 무엇을 보여주나]\n${s}\n`; } catch { /* 없음 */ }
  const prompt =
    `${dir}/context/brand-style.md 를 읽고(없으면 모던·미니멀 기본), 아래 소셜 포스트의 ${cards > 1 ? `카드뉴스 ${cards}장` : '피드 이미지'}를 SVG로 디자인하라.\n` +
    soulBlock +
    `규칙:\n- 캔버스 정확히 ${w}x${h} (viewBox="0 0 ${w} ${h}", width/height 명시)\n` +
    cardRule +
    `- 브랜드 팔레트와 무드 반영, 사진 대신 도형·그라디언트·패턴 일러스트 구성\n` +
    `- 한글 텍스트 font-family="Pretendard, 'Noto Sans KR', 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif"\n` +
    `- 외부 이미지/폰트/스크립트 참조 절대 금지 (완전 self-contained)\n` +
    `- 출력은 SVG 코드만. 설명·코드펜스 금지.\n\n` +
    `[포스트]\n${job.prompt}` +
    (designPack ? `\n\n[디자인 팩]\n${designPack}` : '');
  const stageEng = config.getEngineFor('visuals-generate');
  onLine && onLine(`[render] ${stageEng === 'codex' ? 'Codex' : '클로드'} 디자인 — ${cards > 1 ? `카드뉴스 ${cards}장` : 'SVG'} 설계 중…`);
  const r = await engine.runText(dir, prompt, { engine: stageEng, timeoutMs: (cards > 1 ? 12 : 5) * 60_000 });
  const svgs = extractSvgAll(r.out);
  if (!svgs.length) return err('claude-svg', 'SVG를 받지 못했습니다: ' + (r.tail || '').slice(-200));
  if (cards > 1 && svgs.length < cards) onLine && onLine(`[render] 요청 ${cards}장 중 ${svgs.length}장만 수신 — 받은 만큼 렌더합니다`);
  const files = [];
  for (let i = 0; i < Math.min(svgs.length, cards); i++) {
    const suffix = cards > 1 ? `${job.base}_c${i + 1}` : job.base;
    const { abs, rel } = outName(dir, 'creatives', suffix, 'png');
    onLine && onLine(`[render] SVG → PNG 변환 중… (${i + 1}/${Math.min(svgs.length, cards)})`);
    await svgToPng(svgs[i], w, h, abs);
    try { fs.writeFileSync(abs.replace(/\.png$/, '.svg'), svgs[i]); } catch { /* 소스 보존 실패는 무시 */ }
    files.push(rel);
  }
  return { ok: true, provider: 'claude-svg', rel: files[0], files };
}

// 공냥 카드(gn-html) — 카드뉴스·인포·데이터 카드를 슬라이드 계약(JSON) + 결정론 HTML 조판으로 만든다.
// 이미지 모델 호출 0 (엔진 텍스트 1회가 전부) — 과금 없음, 한글 타이포 정확, 수치는 그린 그대로.
// 슬라이드 계약은 <base>.cards.json 으로 보존된다 — 카피만 고쳐 재조판하는 부분 재작업 지점.
async function genGnHtml(dir, job, onLine) {
  const [w, h] = SIZES[job.size] || SIZES.portrait;
  const cards = Math.min(8, Math.max(1, Number(job.cards) || Number(job.count) || 5));
  let brandSummary = '';
  try { const b = require('./channelsheets').getBrand(dir); brandSummary = String((b && b.brand) || '').slice(0, 400); } catch { /* 브랜드 없음 */ }
  const stageEng = config.getEngineFor('visuals-generate');
  onLine && onLine(`[render] 공냥 카드 — 슬라이드 계약 설계 중… (${cards}장 · ${stageEng})`);
  const r = await engine.runText(dir, gncards.buildSlidesPrompt({ prompt: job.prompt, topic: job.topic, count: cards }, brandSummary),
    { engine: stageEng, json: true, timeoutMs: 8 * 60_000 });
  const slides = gncards.parseSlides(r.out, cards);
  if (!slides) return err('gn-html', '슬라이드 계약(JSON)을 받지 못했습니다: ' + (r.tail || '').slice(-200));
  const tokens = gncards.tokensFor(dir);
  const htmls = gncards.renderAllHtml(slides, tokens, { w, h });
  const files = [];
  for (let i = 0; i < htmls.length; i++) {
    const suffix = htmls.length > 1 ? `${job.base}_c${i + 1}` : job.base;
    const { abs, rel } = outName(dir, 'creatives', suffix, 'png');
    onLine && onLine(`[render] 카드 조판 → PNG (${i + 1}/${htmls.length})`);
    await htmlToPng(htmls[i], w, h, abs);
    try { fs.writeFileSync(abs.replace(/\.png$/, '.html'), htmls[i]); } catch { /* 소스 보존 실패는 무시 */ }
    files.push(rel);
  }
  try {
    fs.writeFileSync(path.join(dir, 'outputs', 'creatives', `${job.base}.cards.json`),
      JSON.stringify({ slides, tokens: { bg: tokens.bg, fg: tokens.fg, accent: tokens.accent } }, null, 2));
  } catch { /* 계약 보존 실패는 렌더를 막지 않는다 */ }
  return { ok: true, provider: 'gn-html', rel: files[0], files };
}

// ---- codex 이미지 레인 (gongnyang/codex-fleet 패턴 이식, MIT) --------------------------
// codex exec 1회 = 이미지 1장. codex가 ~/.codex/generated_images/ 에 떨군 PNG를 원자적
// rename(claim)으로 회수한다 — 병렬 워커가 같은 파일을 두 번 가져가는 레이스를 rename의
// 원자성이 중재한다. 샌드박스는 read-only 최소 권한($imagegen은 셸이 아니라 내장 도구라 충분).
const CODEX_IMG_BASE = () => path.join(os.homedir(), '.codex', 'generated_images');
function codexSizeSpec(size) {
  if (size === 'portrait' || size === 'story') return { ar: '2:3', px: '1024x1536' };
  if (size === 'landscape') return { ar: '3:2', px: '1536x1024' };
  return { ar: '1:1', px: '1024x1024' };
}
function codexImgPrompt(prompt, size) {
  const s = codexSizeSpec(size);
  return `Use $imagegen to generate ONE image.\nAspect ratio: ${s.ar}\nSize: ${s.px}\nPrompt: ${prompt}\n` +
    `After the image is generated, do NOT run any shell commands and do NOT write any files. Just generate and end your turn.`;
}
// baseDir 아래 ig_*.png 중 sinceMs 이후 것들 — 오래된 순(먼저 나온 파일부터 공정하게 claim).
function collectGenerated(baseDir, sinceMs) {
  const out = [];
  const walk = (d, depth) => {
    if (depth > 3) return;
    let entries = [];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const abs = path.join(d, e.name);
      if (e.isDirectory()) { walk(abs, depth + 1); continue; }
      if (!/^ig_.*\.png$/i.test(e.name)) continue;
      try { const st = fs.statSync(abs); if (st.mtimeMs >= sinceMs) out.push({ abs, mtimeMs: st.mtimeMs }); } catch { /* 사라짐 */ }
    }
  };
  walk(baseDir, 0);
  return out.sort((a, b) => a.mtimeMs - b.mtimeMs);
}
// 원자적 claim 이동 — rename 성공 = 내 것. 실패(ENOENT)는 다른 워커가 이미 가져간 것.
// EXDEV(홈과 워크스페이스가 다른 볼륨)면 같은 볼륨 안 rename으로 먼저 claim한 뒤 복사한다.
function claimTo(srcAbs, destAbs) {
  fs.mkdirSync(path.dirname(destAbs), { recursive: true });
  try { fs.renameSync(srcAbs, destAbs); return true; }
  catch (e) {
    if (e && e.code === 'EXDEV') {
      const tag = srcAbs + `.claim-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
      try { fs.renameSync(srcAbs, tag); } catch { return false; } // 여기서 지면 남의 것
      try { fs.copyFileSync(tag, destAbs); fs.rmSync(tag, { force: true }); return true; }
      catch { try { fs.renameSync(tag, srcAbs); } catch { /* 복구 실패 */ } return false; }
    }
    return false;
  }
}
async function genCodexImg(dir, job, onLine) {
  if (job.refs && job.refs.length) onLine && onLine('[render] codex 레인은 --ref 앵커 미지원 — 캐릭터·제품 고정이 필요한 채널은 ima2를 쓰세요');
  const started = Date.now() - 2000; // mtime 시계 오차 여유
  const instr = codexImgPrompt(job.prompt + (job.negative ? `\nAvoid: ${job.negative}` : ''), job.size);
  const r = await runCmd('codex', ['exec', '--skip-git-repo-check', '-s', 'read-only', instr], onLine, { cwd: dir, timeoutMs: 8 * 60_000 });
  if (/rate.?limit|429|too many requests/i.test(String(r.out || ''))) {
    return err('codex', '계정 rate limit — 잠시 후 재시도하거나 설정에서 병렬도를 낮추세요');
  }
  // 파일 회수 — exec 종료 직후 파일 쓰기가 늦을 수 있어 최대 15초 폴링.
  const dest = outName(dir, 'creatives', job.base, 'png');
  for (let i = 0; i < 15; i++) {
    for (const cand of collectGenerated(CODEX_IMG_BASE(), started)) {
      if (claimTo(cand.abs, dest.abs)) return { ok: true, provider: 'codex', rel: dest.rel, files: [dest.rel] };
    }
    if (i === 0 && !r.ok) break; // exec 자체가 실패했고 파일도 없다 — 즉시 실패 보고
    await new Promise((res) => setTimeout(res, 1000));
  }
  return err('codex', (String(r.tail || r.out || '').slice(-200)) || '이미지 파일을 회수하지 못했습니다 (모더레이션 거부였을 수 있음 — 프롬프트를 완화해 보세요)');
}

// 제한 병렬 풀 — limit개 워커가 items를 나눠 처리. 결과는 입력 순서 유지, 개별 실패는 {ok:false}.
async function asyncPool(limit, items, worker) {
  const results = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await Promise.resolve(worker(items[i], i)).catch((e) => ({ ok: false, error: String(e && e.message || e) }));
    }
  });
  await Promise.all(runners);
  return results;
}

// (2) OpenAI 이미지 (gpt-image-1) — "코덱스 이미지" 직결 레인. OPENAI_API_KEY 필요.
async function genOpenAI(dir, job, onLine) {
  const key = secrets.get('openai').apiKey || process.env.OPENAI_API_KEY;
  if (!key) return err('openai-image', 'OpenAI API 키가 없습니다 — 설정 → 렌더에서 입력하세요');
  const [w, h] = SIZES[job.size] || SIZES.square;
  const apiSize = w === h ? '1024x1024' : (h > w ? '1024x1536' : '1536x1024');
  const prompt = finalizeImagePrompt(job.prompt, job.negative);
  onLine && onLine(`[render] OpenAI gpt-image-1 생성 중… (${apiSize}, quality=high)`);
  const body = {
    model: 'gpt-image-1',
    prompt,
    size: apiSize,
    n: 1,
    quality: 'high',
  };
  const r = await fetchJson('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, 300_000);
  if (!r.ok) {
    // quality 미지원 구버전/게이트웨이 대비 — quality 없이 1회 재시도
    if (/quality|unknown parameter|unsupported/i.test((r.json && r.json.error && r.json.error.message) || r.text || '')) {
      onLine && onLine('[render] quality=high 미지원 — 기본 품질로 재시도');
      delete body.quality;
      const r2 = await fetchJson('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }, 300_000);
      if (!r2.ok) return err('openai-image', (r2.json && r2.json.error && r2.json.error.message) || `HTTP ${r2.status}`);
      const b64r = r2.json && r2.json.data && r2.json.data[0] && r2.json.data[0].b64_json;
      if (!b64r) return err('openai-image', '응답에 이미지가 없습니다');
      const out = outName(dir, 'creatives', job.base, 'png');
      fs.writeFileSync(out.abs, Buffer.from(b64r, 'base64'));
      return { ok: true, provider: 'openai-image', rel: out.rel, files: [out.rel] };
    }
    return err('openai-image', (r.json && r.json.error && r.json.error.message) || `HTTP ${r.status}`);
  }
  const b64 = r.json && r.json.data && r.json.data[0] && r.json.data[0].b64_json;
  if (!b64) return err('openai-image', '응답에 이미지가 없습니다');
  const { abs, rel } = outName(dir, 'creatives', job.base, 'png');
  fs.writeFileSync(abs, Buffer.from(b64, 'base64'));
  return { ok: true, provider: 'openai-image', rel, files: [rel] };
}

// (3) ima2 — ChatGPT OAuth 이미지 (설치 마법사의 ima2 레인 재사용)
// ima2 gen은 로컬 `ima2 serve` 데몬이 필요하다 — 죽어 있으면 자동 기동 후 1회 재시도.
let ima2ServeLastStart = 0;
// 서버가 응답하는지 확인 — `ima2 ping`은 서버가 뜨면 빠르게 성공한다(콜드스타트 폴링용).
async function ima2Ping(serverUrl) {
  try {
    const args = ['ping', ...(serverUrl ? ['--server', serverUrl] : [])];
    const r = await runCmd('ima2', args, null, { timeoutMs: 8000 });
    return !!r.ok;
  } catch { return false; }
}
async function ensureIma2Serve(onLine) {
  if (Date.now() - ima2ServeLastStart < 2 * 60_000) return false; // 2분 내 재기동 반복 금지(스폰 폭주 방지)
  ima2ServeLastStart = Date.now();
  onLine && onLine('[render] ima2 serve가 꺼져 있음 — 자동 시작합니다…');
  try {
    const { spawn } = require('child_process');
    const { resolveCmd, envWithPath } = require('./proc');
    const cmd = resolveCmd('ima2') || 'ima2';
    const p = spawn(cmd, ['serve'], { detached: true, stdio: 'ignore', env: envWithPath(), shell: isWin, windowsHide: true });
    p.unref();
  } catch { return false; }
  // 고정 8초 대기 대신 ping 폴링(최대 ~12초) — 서버가 일찍 뜨면 바로 진행해 콜드스타트 지연을 줄인다.
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    if (await ima2Ping('')) { onLine && onLine(`[render] ima2 serve 준비됨 (${i + 1}s)`); return true; }
  }
  return true;
}
// 설정된 ima2 서버 URL(사용자가 watchdog 등으로 직접 유지하는 서버). 있으면 앱은 자기 serve를
// 띄우지 않고 이 주소로 붙는다(--server). 비었으면 기존처럼 자동 기동.
function ima2ServerUrl() { try { return String((secrets.get('ima2') || {}).server || '').trim(); } catch { return ''; } }
// quality: low|medium|high (기본 high — 기존 동작·테스트 호환). 시트 레퍼런스 등은 medium을 넘겨 속도를 낸다.
function ima2GenArgs(prompt, tmp, serverUrl, refs, quality) {
  const q = ['low', 'medium', 'high'].includes(quality) ? quality : 'high';
  const a = ['gen', prompt, '-d', tmp, '--quality', q];
  if (serverUrl) a.push('--server', serverUrl);
  // 레퍼런스 이미지(--ref, 최대 5장) — 채널 캐릭터/마스터 앵커로 인물·제품 픽셀 일관성 확보
  for (const r of (Array.isArray(refs) ? refs : []).slice(0, 5)) a.push('--ref', r);
  return a;
}
// 배치 시작 전 프로바이더 예열 — ima2면 serve를 미리 띄워 첫 렌더 전에 뜰 시간을 준다.
// 단, 사용자가 서버 URL을 지정했으면(직접 유지 중) 앱이 자동 기동하지 않는다.
// 이미 응답 중이면 재기동하지 않아 예열 비용이 0에 수렴한다.
async function warmupImageProvider(provider, env, onLine) {
  if (provider === 'ima2' && !ima2ServerUrl()) {
    try { if (!(await ima2Ping(''))) await ensureIma2Serve(onLine); } catch { /* best effort */ }
  }
  return { ok: true };
}
const IMA2_DOWN = /server unreachable|ima2 serve/i;
// 생성 대기 초과 — ima2 gen이 잡을 제출(requestId)하고 내부 대기를 하다 초과되면 abort하지만
// 잡은 서버에서 계속 돈다. 이 신호를 잡아 고아 잡을 취소하고 레퍼런스를 줄여 재시도한다.
const IMA2_TIMEOUT = /aborted due to timeout|operation was aborted|generation in progress|timed?\s*out|\btimeout\b/i;
async function genIma2(dir, job, onLine) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sat-ima2-'));
  const prompt = finalizeImagePrompt(job.prompt, job.negative);
  const serverUrl = ima2ServerUrl();
  // 레퍼런스 앵커 수집 — job.refAbs(단일) + job.refs(배열). 실제 존재하는 파일만, 중복 제거, 최대 5장.
  const refCand = [];
  if (job.refAbs) refCand.push(job.refAbs);
  if (Array.isArray(job.refs)) for (const r of job.refs) if (r) refCand.push(r);
  let refs = [...new Set(refCand)].filter((p) => { try { return fs.existsSync(p); } catch { return false; } }).slice(0, 5);
  // 품질 — job.quality 우선, 없으면 설정 기본(발행 이미지는 high, 시트 레퍼런스는 호출부에서 medium).
  const quality = ['low', 'medium', 'high'].includes(job.quality) ? job.quality : config.getImageQuality();
  onLine && onLine(`[render] ima2 생성 중… (quality=${quality} + negative fused${refs.length ? ` · 레퍼런스 ${refs.length}장` : ''}${serverUrl ? ' · ' + serverUrl : ''})`);
  // 시도당 타임아웃 10분 → 5분: 서버가 느린 날 "조용한 30분(10분×재시도)"을 차단. 정상 생성은 수십초~수분.
  const run = () => runCmd('ima2', ima2GenArgs(prompt, tmp, serverUrl, refs, quality), onLine, { cwd: dir, timeoutMs: 5 * 60_000 });
  const hasImg = () => (fs.existsSync(tmp) ? fs.readdirSync(tmp) : []).filter((f) => /\.(png|jpe?g|webp)$/i.test(f));
  let r = await run();
  // 서버가 죽어 있으면: URL 미지정 시 자동 기동, 지정 시 사용자 서버가 뜰 때까지만 몇 번 재시도.
  if (!r.ok && !hasImg().length && IMA2_DOWN.test(r.out)) {
    if (!serverUrl) await ensureIma2Serve(onLine);
    for (let i = 0; i < 4 && !r.ok && IMA2_DOWN.test(r.out); i++) {
      if (job.stopped && job.stopped()) break;
      await new Promise((res) => setTimeout(res, 4000));
      r = await run();
    }
  }
  // 생성 대기 초과 → 고아 잡(requestId) 취소 + 레퍼런스 축소 후 1회 재시도.
  // (재시도 2→1: 시도당 5분이라 5분×3=15분 대신 최대 10분으로 상한을 낮춘다. 대부분 첫 재시도에서 붙거나 실패로 확정.)
  if (!r.ok && !hasImg().length && IMA2_TIMEOUT.test(r.out)) {
    if (!(job.stopped && job.stopped())) {
      const id = (String(r.out).match(/req[_a-z0-9]+/i) || [])[0];
      if (id) { try { await runCmd('ima2', ['cancel', id, ...(serverUrl ? ['--server', serverUrl] : [])], null, { cwd: dir, timeoutMs: 20_000 }); } catch { /* best effort */ } }
      if (refs.length > 1) { refs = refs.slice(0, 1); onLine && onLine('[render] 대기 초과 — 레퍼런스를 1장으로 줄여 재시도'); }
      onLine && onLine('[render] ima2 생성 대기 초과 — 재시도 1/1');
      await new Promise((res) => setTimeout(res, 3000));
      r = await run();
    }
  }
  const made = hasImg();
  if (!r.ok || !made.length) {
    const timedOut = IMA2_TIMEOUT.test(r.out || '') || r.timedOut;
    const msg = timedOut
      ? 'ima2 생성이 서버 대기 시간을 초과했습니다(timeout) — 서버가 느리거나 레퍼런스가 많을 수 있습니다. `ima2 ps --json`으로 진행 상태를 확인하거나, 다시 시도하거나, 레퍼런스를 줄이세요.'
      : (r.tail || 'ima2가 이미지를 만들지 못했습니다');
    return err('ima2', msg);
  }
  const { abs, rel } = outName(dir, 'creatives', job.base, path.extname(made[0]).slice(1));
  fs.copyFileSync(path.join(tmp, made[0]), abs);
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* tmp */ }
  return { ok: true, provider: 'ima2', rel, files: [rel] };
}

// ---- 영상 프로바이더 --------------------------------------------------------------
// (4) Runway — image_to_video. 키프레임(생성 이미지)을 data URI로 넣는다 (이미지 ≤5MB).
//     출력 URL은 24~48시간 내 만료 — 즉시 다운로드해 저장한다.
async function genRunway(dir, job, onLine) {
  const s = secrets.get('runway');
  if (!s.apiKey) return err('runway', 'Runway API 키가 없습니다 — 설정 → 렌더에서 입력하세요');
  if (!job.refAbs) return err('runway', '키프레임 이미지가 필요합니다 — 먼저 이미지 레인으로 키프레임을 생성하세요');
  const buf = fs.readFileSync(job.refAbs);
  if (buf.length > 4.8 * 1024 * 1024) return err('runway', '키프레임이 5MB를 넘습니다 — 더 작은 이미지를 사용하세요');
  const mime = /\.png$/i.test(job.refAbs) ? 'image/png' : 'image/jpeg';
  const headers = { Authorization: `Bearer ${s.apiKey}`, 'X-Runway-Version': s.version || '2024-11-06', 'Content-Type': 'application/json' };
  const ratio = job.size === 'story' || job.size === 'portrait' ? '720:1280' : (job.size === 'landscape' ? '1280:720' : '960:960');
  onLine && onLine('[render] Runway 태스크 제출 중…');
  const create = await fetchJson('https://api.dev.runwayml.com/v1/image_to_video', {
    method: 'POST', headers,
    body: JSON.stringify({
      model: s.model || 'gen4_turbo', // 5크레딧/초 — 가장 저렴한 i2v 모델
      promptImage: `data:${mime};base64,${buf.toString('base64')}`,
      promptText: job.prompt.slice(0, 1000),
      ratio, duration: Number(job.duration) || 5,
    }),
  });
  if (!create.ok) return err('runway', (create.json && (JSON.stringify(create.json.error || create.json).slice(0, 200))) || `HTTP ${create.status}`);
  const id = create.json && create.json.id;
  if (!id) return err('runway', '태스크 id를 받지 못했습니다');
  // 폴링 — 5초 간격(공식 권장 최소), 보통 1~3분. THROTTLED/PENDING/RUNNING은 계속 대기.
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const st = await fetchJson(`https://api.dev.runwayml.com/v1/tasks/${id}`, { headers });
    const status = st.json && st.json.status;
    if (i % 6 === 0) onLine && onLine(`[render] Runway ${status || '…'}${st.json && st.json.progress ? ` ${Math.round(st.json.progress * 100)}%` : ''} (${Math.round(i * 5 / 60)}분)`);
    if (status === 'SUCCEEDED') {
      const url = st.json.output && st.json.output[0];
      if (!url) return err('runway', '출력 URL이 없습니다');
      const { abs, rel } = outName(dir, 'videos', job.base, 'mp4');
      onLine && onLine('[render] 영상 다운로드 중…');
      await downloadTo(url, abs);
      return { ok: true, provider: 'runway', rel, files: [rel] };
    }
    if (status === 'FAILED' || status === 'CANCELLED') return err('runway', st.json.failure || st.json.failureCode || '태스크 실패');
  }
  return err('runway', '10분 내에 완료되지 않았습니다');
}

// (4b) Higgsfield — DoP image2video. 업로드 URL 발급 → PUT → public_url로 생성.
//     인증: `Authorization: Key KEY_ID:KEY_SECRET`. 403 = 크레딧 부족(권한 오류 아님).
async function genHiggsfield(dir, job, onLine) {
  const s = secrets.get('higgsfield');
  if (!s.keyId || !s.keySecret) return err('higgsfield', 'Higgsfield Key ID/Secret이 필요합니다 — 설정 → 렌더');
  if (!job.refAbs) return err('higgsfield', '키프레임 이미지가 필요합니다 — 먼저 이미지 레인으로 키프레임을 생성하세요');
  const auth = { Authorization: `Key ${s.keyId}:${s.keySecret}` };
  const base = 'https://platform.higgsfield.ai';
  try {
    // 1) 로컬 키프레임 업로드
    onLine && onLine('[render] Higgsfield 키프레임 업로드 중…');
    const mime = /\.png$/i.test(job.refAbs) ? 'image/png' : 'image/jpeg';
    const up = await fetchJson(`${base}/files/generate-upload-url`, {
      method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content_type: mime }),
    });
    if (!up.ok || !up.json || !up.json.upload_url) return err('higgsfield', up.status === 403 ? '크레딧이 부족합니다' : (up.text || `HTTP ${up.status}`).slice(0, 200));
    const putRes = await fetch(up.json.upload_url, { method: 'PUT', headers: { 'Content-Type': mime }, body: fs.readFileSync(job.refAbs) });
    if (!putRes.ok) return err('higgsfield', `업로드 실패 HTTP ${putRes.status}`);
    // 2) DoP 생성 제출
    onLine && onLine('[render] Higgsfield DoP 생성 제출 중…');
    const create = await fetchJson(`${base}/v1/image2video/dop`, {
      method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: s.model || 'dop-turbo',
        prompt: job.prompt.slice(0, 1500),
        input_images: [{ type: 'image_url', image_url: up.json.public_url }],
        enhance_prompt: true,
      }),
    });
    if (!create.ok || !create.json || !create.json.request_id) {
      return err('higgsfield', create.status === 403 ? '크레딧이 부족합니다' : ((create.json && JSON.stringify(create.json.detail || create.json)) || `HTTP ${create.status}`).slice(0, 250));
    }
    const statusUrl = create.json.status_url || `${base}/requests/${create.json.request_id}/status`;
    // 3) 폴링
    for (let i = 0; i < 150; i++) {
      await new Promise((r) => setTimeout(r, 4000));
      const st = await fetchJson(statusUrl, { headers: auth });
      const status = st.json && st.json.status;
      if (i % 8 === 0) onLine && onLine(`[render] Higgsfield ${status || '…'} (${Math.round(i * 4 / 60)}분)`);
      if (status === 'completed') {
        const url = st.json.video && st.json.video.url;
        if (!url) return err('higgsfield', '응답에 video.url이 없습니다');
        const { abs, rel } = outName(dir, 'videos', job.base, 'mp4');
        onLine && onLine('[render] 영상 다운로드 중…');
        await downloadTo(url, abs);
        return { ok: true, provider: 'higgsfield', rel, files: [rel] };
      }
      if (status === 'failed') return err('higgsfield', '생성 실패 (크레딧은 환불됩니다)');
      if (status === 'nsfw') return err('higgsfield', 'NSFW 판정으로 거부됨 (크레딧은 환불됩니다)');
    }
    return err('higgsfield', '10분 내에 완료되지 않았습니다');
  } catch (e) { return err('higgsfield', e.message); }
}

// (4c) Google Veo — Gemini API predictLongRunning. text→video / image→video 모두 지원.
//     모델명은 설정으로 교체 가능 (기본 veo-3.0-fast-generate-001; veo-3.1 프리뷰 등 입력 가능).
async function genVeo(dir, job, onLine) {
  const s = secrets.get('google');
  if (!s.apiKey) return err('google-veo', 'Google AI(Gemini) API 키가 없습니다 — 설정 → 렌더');
  const model = s.model || 'veo-3.0-fast-generate-001';
  const headers = { 'x-goog-api-key': s.apiKey, 'Content-Type': 'application/json' };
  const body = {
    instances: [{ prompt: job.prompt }],
    parameters: { aspectRatio: (job.size === 'story' || job.size === 'portrait') ? '9:16' : '16:9' },
  };
  if (job.refAbs) {
    body.instances[0].image = {
      bytesBase64Encoded: fs.readFileSync(job.refAbs).toString('base64'),
      mimeType: /\.png$/i.test(job.refAbs) ? 'image/png' : 'image/jpeg',
    };
  }
  onLine && onLine(`[render] Veo(${model}) 제출 중…`);
  const create = await fetchJson(`https://generativelanguage.googleapis.com/v1beta/models/${model}:predictLongRunning`, {
    method: 'POST', headers, body: JSON.stringify(body),
  }, 120_000);
  if (!create.ok || !create.json || !create.json.name) {
    return err('google-veo', ((create.json && create.json.error && create.json.error.message) || `HTTP ${create.status}`) + ' — 모델명이 계정에서 지원되는지 확인하세요 (설정 → 렌더)');
  }
  const opName = create.json.name;
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 6000));
    const st = await fetchJson(`https://generativelanguage.googleapis.com/v1beta/${opName}`, { headers });
    if (i % 5 === 0) onLine && onLine(`[render] Veo 생성 중… (${Math.round(i * 6 / 60)}분)`);
    if (st.json && st.json.done) {
      if (st.json.error) return err('google-veo', st.json.error.message || JSON.stringify(st.json.error).slice(0, 200));
      // 응답 형태가 버전에 따라 다르다 — 두 스키마 모두 수용
      const resp = st.json.response || {};
      const sample = (resp.generateVideoResponse && resp.generateVideoResponse.generatedSamples && resp.generateVideoResponse.generatedSamples[0])
        || (resp.generatedVideos && resp.generatedVideos[0]) || null;
      const uri = sample && sample.video && (sample.video.uri || sample.video.url);
      if (!uri) return err('google-veo', '응답에서 영상 URI를 찾지 못했습니다');
      const { abs, rel } = outName(dir, 'videos', job.base, 'mp4');
      onLine && onLine('[render] 영상 다운로드 중…');
      const dl = uri.includes('?') ? `${uri}&key=${encodeURIComponent(s.apiKey)}` : `${uri}?key=${encodeURIComponent(s.apiKey)}`;
      await downloadTo(dl, abs, 300_000, { 'x-goog-api-key': s.apiKey });
      return { ok: true, provider: 'google-veo', rel, files: [rel] };
    }
  }
  return err('google-veo', '12분 내에 완료되지 않았습니다');
}

// (4d) Replicate — 오픈모델 게이트웨이. 토큰 하나로 Wan/Kling/Hunyuan/LTX 등 어떤 호스팅 모델이든.
//     설정: token, model("owner/name"), imageKey(모델별 이미지 입력 필드명, 기본 image).
async function genReplicate(dir, job, onLine) {
  const s = secrets.get('replicate');
  if (!s.token) return err('replicate', 'Replicate API 토큰이 없습니다 — 설정 → 렌더');
  if (!s.model || !s.model.includes('/')) return err('replicate', '모델을 "owner/name" 형식으로 설정하세요 (예: wan-video/wan-2.2-i2v-a14b) — replicate.com/collections/text-to-video 참고');
  const headers = { Authorization: `Bearer ${s.token}`, 'Content-Type': 'application/json', Prefer: 'wait=10' };
  const input = { prompt: job.prompt };
  if (job.negative) input.negative_prompt = job.negative;
  if (job.refAbs) {
    const mime = /\.png$/i.test(job.refAbs) ? 'image/png' : 'image/jpeg';
    input[s.imageKey || 'image'] = `data:${mime};base64,${fs.readFileSync(job.refAbs).toString('base64')}`;
  }
  onLine && onLine(`[render] Replicate ${s.model} 제출 중…`);
  const create = await fetchJson(`https://api.replicate.com/v1/models/${s.model}/predictions`, {
    method: 'POST', headers, body: JSON.stringify({ input }),
  }, 120_000);
  if (!create.ok || !create.json || !create.json.id) {
    return err('replicate', ((create.json && (create.json.detail || create.json.title)) || `HTTP ${create.status}`).toString().slice(0, 250));
  }
  const getUrl = create.json.urls && create.json.urls.get;
  let pred = create.json;
  for (let i = 0; i < 240 && !['succeeded', 'failed', 'canceled'].includes(pred.status); i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const st = await fetchJson(getUrl, { headers: { Authorization: `Bearer ${s.token}` } });
    if (st.json) pred = st.json;
    if (i % 6 === 0) onLine && onLine(`[render] Replicate ${pred.status || '…'} (${Math.round(i * 5 / 60)}분)`);
  }
  if (pred.status !== 'succeeded') return err('replicate', (pred.error || pred.status || '실패').toString().slice(0, 250));
  // output은 모델마다 문자열/배열/객체 — URL을 재귀 탐색
  const findUrl = (v) => {
    if (typeof v === 'string' && /^https?:\/\//.test(v)) return v;
    if (Array.isArray(v)) { for (const x of v) { const u = findUrl(x); if (u) return u; } }
    else if (v && typeof v === 'object') { for (const x of Object.values(v)) { const u = findUrl(x); if (u) return u; } }
    return null;
  };
  const url = findUrl(pred.output);
  if (!url) return err('replicate', '출력에서 URL을 찾지 못했습니다');
  const isImg = /\.(png|jpe?g|webp)(\?|$)/i.test(url);
  const { abs, rel } = outName(dir, isImg ? 'creatives' : 'videos', job.base, isImg ? 'png' : 'mp4');
  onLine && onLine('[render] 결과 다운로드 중…');
  await downloadTo(url, abs);
  return { ok: true, provider: 'replicate', rel, files: [rel] };
}

// (4e) ffmpeg — 로컬 무료 조립 레인. 렌더된 이미지 1장이면 켄번즈, 여러 장이면 크로스페이드 슬라이드쇼.
let ffmpegCached = null;
function hasFfmpeg() {
  if (ffmpegCached !== null) return ffmpegCached;
  try { ffmpegCached = spawnSync(isWin ? 'where' : 'which', ['ffmpeg'], { windowsHide: true }).status === 0; }
  catch { ffmpegCached = false; }
  return ffmpegCached;
}
async function genFfmpeg(dir, job, onLine) {
  if (!hasFfmpeg()) return err('ffmpeg', 'ffmpeg가 설치돼 있지 않습니다 — Windows: winget install ffmpeg / macOS: brew install ffmpeg');
  // 이 포스트의 렌더 이미지 수집 (refAbs 우선 + base 프리픽스 렌더들)
  const imgs = [];
  if (job.refAbs) imgs.push(job.refAbs);
  try {
    const cdir = path.join(dir, 'outputs', 'creatives');
    const prefix = new RegExp(`^${job.base}(?![0-9])`, 'i');
    for (const f of fs.readdirSync(cdir).sort()) {
      if (prefix.test(f) && /\.(png|jpe?g|webp)$/i.test(f)) {
        const p2 = path.join(cdir, f);
        if (!imgs.includes(p2)) imgs.push(p2);
      }
    }
  } catch { /* 레인 없음 */ }
  if (!imgs.length) return err('ffmpeg', '이 카드의 렌더 이미지가 없습니다 — 먼저 이미지 레인으로 생성하세요');
  imgs.splice(4); // 최대 4장
  const [w, h] = job.size === 'story' || job.size === 'portrait' ? [1080, 1920] : (job.size === 'landscape' ? [1920, 1080] : [1080, 1080]);
  const dur = Math.min(30, Math.max(3, Number(job.duration) || 6));
  const { abs, rel } = outName(dir, 'videos', job.base, 'mp4');
  let args;
  if (imgs.length === 1) {
    // 켄번즈 — 천천히 줌인
    const frames = dur * 30;
    args = ['-y', '-loop', '1', '-i', imgs[0], '-vf',
      `scale=${w * 2}:${h * 2}:force_original_aspect_ratio=increase,crop=${w * 2}:${h * 2},` +
      `zoompan=z='min(zoom+0.0008,1.18)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${w}x${h}:fps=30,format=yuv420p`,
      '-t', String(dur), '-r', '30', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-movflags', '+faststart', abs];
  } else {
    // 슬라이드쇼 + 크로스페이드
    const fade = 0.5;
    const per = dur / imgs.length;
    const inputs = imgs.flatMap((i) => ['-loop', '1', '-t', String((per + fade).toFixed(2)), '-i', i]);
    let fc = imgs.map((_, i) => `[${i}:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1[v${i}]`).join(';');
    let last = 'v0';
    for (let i = 1; i < imgs.length; i++) {
      const out = `x${i}`;
      fc += `;[${last}][v${i}]xfade=transition=fade:duration=${fade}:offset=${Math.max(0.1, per * i - fade / 2).toFixed(2)}[${out}]`;
      last = out;
    }
    fc += `;[${last}]format=yuv420p[final]`;
    args = ['-y', ...inputs, '-filter_complex', fc, '-map', '[final]',
      '-t', String(dur), '-r', '30', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-movflags', '+faststart', abs];
  }
  onLine && onLine(`[render] ffmpeg ${imgs.length === 1 ? '켄번즈' : imgs.length + '장 슬라이드쇼'} 조립 중… (${dur}s ${w}x${h})`);
  const r = await runCmd('ffmpeg', args, null, { timeoutMs: 5 * 60_000 });
  if (!r.ok || !fs.existsSync(abs)) return err('ffmpeg', (r.tail || 'ffmpeg 실패').slice(-300));
  return { ok: true, provider: 'ffmpeg', rel, files: [rel] };
}

// (5) ComfyUI — 오픈소스 로컬 엔진 브릿지 (Wan/HunyuanVideo 등 사용자가 띄운 워크플로)
//     설정: url(예 http://127.0.0.1:8188), workflowPath(API 포맷 JSON, "__PROMPT__" 플레이스홀더)
async function genComfy(dir, job, onLine) {
  const s = secrets.get('comfyui');
  if (!s.url || !s.workflowPath) return err('comfyui', 'ComfyUI URL과 워크플로 JSON 경로가 필요합니다 — 설정 → 렌더');
  let wf;
  try { wf = fs.readFileSync(s.workflowPath, 'utf8'); } catch (e) { return err('comfyui', '워크플로 파일을 읽지 못했습니다: ' + e.message); }
  wf = wf.split('__PROMPT__').join(job.prompt.replace(/"/g, '\\"'));
  wf = wf.split('__NEGATIVE__').join(String(job.negative || '').replace(/"/g, '\\"'));
  let wfJson;
  try { wfJson = JSON.parse(wf); } catch { return err('comfyui', '워크플로 JSON 파싱 실패 — API 포맷(Save (API Format))으로 내보냈는지 확인'); }
  onLine && onLine('[render] ComfyUI 큐 제출 중…');
  const q = await fetchJson(`${s.url.replace(/\/$/, '')}/prompt`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: wfJson }),
  });
  if (!q.ok || !q.json || !q.json.prompt_id) return err('comfyui', q.text || `HTTP ${q.status}`);
  const pid = q.json.prompt_id;
  for (let i = 0; i < 360; i++) { // 로컬 생성은 오래 걸릴 수 있다 — 30분
    await new Promise((r) => setTimeout(r, 5000));
    const h = await fetchJson(`${s.url.replace(/\/$/, '')}/history/${pid}`, {});
    const entry = h.json && h.json[pid];
    if (i % 12 === 0) onLine && onLine(`[render] ComfyUI 진행 중… (${Math.round(i * 5 / 60)}분)`);
    if (entry && entry.outputs) {
      for (const node of Object.values(entry.outputs)) {
        const media = (node.videos || node.gifs || node.images || [])[0];
        if (media) {
          const ext = (media.filename.match(/\.(\w+)$/) || [])[1] || 'mp4';
          const { abs, rel } = outName(dir, /png|jpe?g|webp/i.test(ext) ? 'creatives' : 'videos', job.base, ext);
          const vu = `${s.url.replace(/\/$/, '')}/view?filename=${encodeURIComponent(media.filename)}&subfolder=${encodeURIComponent(media.subfolder || '')}&type=${media.type || 'output'}`;
          await downloadTo(vu, abs);
          return { ok: true, provider: 'comfyui', rel, files: [rel] };
        }
      }
      if (entry.status && entry.status.status_str === 'error') return err('comfyui', '워크플로 실행 오류 — ComfyUI 콘솔 확인');
    }
  }
  return err('comfyui', '30분 내에 완료되지 않았습니다');
}

// (6) 커스텀 HTTP — Higgsfield 등 아직 내장하지 않은 API를 사용자가 브릿지.
//     POST {prompt, image_b64?, duration} → {video_url|image_url|video_b64|image_b64} 규약.
async function genCustom(dir, job, onLine) {
  const s = secrets.get('custom-video');
  if (!s.url) return err('custom', '커스텀 엔드포인트 URL이 없습니다 — 설정 → 렌더');
  let headers = { 'Content-Type': 'application/json' };
  if (s.headers) { try { headers = { ...headers, ...JSON.parse(s.headers) }; } catch { return err('custom', '헤더 JSON 파싱 실패'); } }
  const body = { prompt: job.prompt, duration: Number(job.duration) || 5 };
  if (job.refAbs) body.image_b64 = fs.readFileSync(job.refAbs).toString('base64');
  onLine && onLine('[render] 커스텀 엔드포인트 호출 중…');
  const r = await fetchJson(s.url, { method: 'POST', headers, body: JSON.stringify(body) }, 30 * 60_000);
  if (!r.ok || !r.json) return err('custom', r.text ? r.text.slice(0, 300) : `HTTP ${r.status}`);
  const isImg = !!(r.json.image_url || r.json.image_b64);
  const { abs, rel } = outName(dir, isImg ? 'creatives' : 'videos', job.base, isImg ? 'png' : 'mp4');
  if (r.json.video_url || r.json.image_url) await downloadTo(r.json.video_url || r.json.image_url, abs);
  else if (r.json.video_b64 || r.json.image_b64) fs.writeFileSync(abs, Buffer.from(r.json.video_b64 || r.json.image_b64, 'base64'));
  else return err('custom', '응답에 video_url/image_url/…_b64가 없습니다');
  return { ok: true, provider: 'custom', rel, files: [rel] };
}

// (7) ima2 영상 (Grok) — 기존 설치 레인 재사용
async function genIma2Video(dir, job, onLine) {
  const args = ['video', job.prompt];
  if (job.refAbs) args.push('--ref', job.refAbs);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sat-ima2v-'));
  args.push('-d', tmp);
  onLine && onLine('[render] ima2(Grok) 영상 생성 중…');
  const runV = () => runCmd('ima2', args, onLine, { cwd: dir, timeoutMs: 20 * 60_000 });
  let r = await runV();
  if (!r.ok && IMA2_DOWN.test(r.out) && await ensureIma2Serve(onLine)) r = await runV();
  const made = (fs.existsSync(tmp) ? fs.readdirSync(tmp) : []).filter((f) => /\.(mp4|webm|mov)$/i.test(f));
  if (!r.ok || !made.length) return err('ima2-video', r.tail || 'ima2가 영상을 만들지 못했습니다');
  const { abs, rel } = outName(dir, 'videos', job.base, path.extname(made[0]).slice(1));
  fs.copyFileSync(path.join(tmp, made[0]), abs);
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* tmp */ }
  return { ok: true, provider: 'ima2-video', rel, files: [rel] };
}

// ---- 디스패치 ----------------------------------------------------------------------
const IMAGE_PROVIDERS = { 'claude-svg': genClaudeSvg, 'gn-html': genGnHtml, 'openai-image': genOpenAI, ima2: genIma2, codex: genCodexImg, comfyui: genComfy, custom: genCustom };
// 병렬 안전 프로바이더 — 슬라이드를 워커 풀로 동시 생성해도 회수가 섞이지 않는 레인(claim 회수).
const PARALLEL_SAFE = { codex: true };
const VIDEO_PROVIDERS = {
  ffmpeg: genFfmpeg, runway: genRunway, higgsfield: genHiggsfield, 'google-veo': genVeo,
  replicate: genReplicate, comfyui: genComfy, custom: genCustom, 'ima2-video': genIma2Video,
};

// 사용 가능 여부 — 설정 UI와 생성 패널의 프로바이더 선택지에 쓴다
function availability(env) {
  return {
    // 순서 = 기본 선택 우선순위 (렌더러가 첫 번째 사용 가능 항목을 기본값으로 고른다)
    // 운영자 지정: 이미지는 Codex 계열 imagegen이 기본
    image: {
      'openai-image': { ok: secrets.has('openai', ['apiKey']) || !!process.env.OPENAI_API_KEY, label: 'Codex 이미지 · gpt-image-1 (기본)' },
      ima2: { ok: !!(env && env.ima2), label: 'Codex 이미지 · ima2 (ChatGPT OAuth · --ref 앵커 지원)' },
      codex: { ok: !!(env && env.codex), label: 'Codex 이미지 · codex exec 병렬 ($imagegen — 캐러셀 동시 생성)' },
      'claude-svg': { ok: true, label: '클로드 디자인 — 한글 타이포 카드 전용 (SVG→PNG)' },
      'gn-html': { ok: true, label: '공냥 카드 — 카드뉴스·인포·데이터 (HTML 조판 · 과금 0)' },
      comfyui: { ok: secrets.has('comfyui', ['url', 'workflowPath']), label: 'ComfyUI (오픈소스 로컬)' },
      custom: { ok: secrets.has('custom-video', ['url']), label: '커스텀 HTTP' },
    },
    video: {
      ffmpeg: { ok: hasFfmpeg(), label: 'ffmpeg 슬라이드쇼·켄번즈 (로컬 무료 — 렌더 이미지 조립)' },
      runway: { ok: secrets.has('runway', ['apiKey']), label: 'Runway (image→video · veo3.1 모델 선택 가능)' },
      higgsfield: { ok: secrets.has('higgsfield', ['keyId', 'keySecret']), label: 'Higgsfield DoP (image→video)' },
      'google-veo': { ok: secrets.has('google', ['apiKey']), label: 'Google Veo (Gemini API · text/image→video)' },
      replicate: { ok: secrets.has('replicate', ['token', 'model']), label: 'Replicate (Wan/Kling/Hunyuan 등 오픈모델 게이트웨이)' },
      'ima2-video': { ok: !!(env && env.ima2), label: 'ima2 · Grok (text/image→video)' },
      comfyui: { ok: secrets.has('comfyui', ['url', 'workflowPath']), label: 'ComfyUI (오픈소스 로컬 — Wan/Hunyuan 등)' },
      custom: { ok: secrets.has('custom-video', ['url']), label: '커스텀 HTTP 브릿지 (신생 서비스 연결용)' },
    },
  };
}

// job: {kind:'image'|'video', provider, base, prompt, size, duration?, refAbs?}
// 캐러셀 슬라이드 지시 — 한 세트로 응집되되 슬라이드마다 프레이밍을 뚜렷이 달리한다(단조 방지).
// seed(부모 base)로 슬라이드별 프레이밍을 회전시켜, 같은 정면·같은 거리의 반복을 막는다.
function slideDirective(i, n, seed) {
  const f = shotFraming(i, seed);
  return `\n\n(Carousel slide ${i} of ${n}: keep the SAME subject, brand palette, lighting character and material finish as one cohesive premium series, but make THIS slide's framing distinct — ${f.en}. Vary angle, crop, distance and background from the other slides so they read as a set, never near-duplicates. Keep one hero detail in sharp focus. No text or logos in the image.)`;
}
// 단일 프로바이더 1회 시도 — 캐스케이드는 generate()가 담당
async function generateOnce(dir, job, onLine) {
  const table = job.kind === 'video' ? VIDEO_PROVIDERS : IMAGE_PROVIDERS;
  const fn = table[job.provider];
  if (!fn) return err(job.provider, '알 수 없는 프로바이더');
  const count = Math.min(10, Math.max(1, Number(job.count) || 1));
  // claude-svg·gn-html은 자체 멀티카드(cards) 경로로 N장 — count를 cards로 위임 (안 하면 1장으로 붕괴)
  const CARD_LANES = ['claude-svg', 'gn-html'];
  if (job.kind === 'image' && count > 1 && CARD_LANES.includes(job.provider) && !job.cards) {
    return fn(dir, { ...job, cards: count }, onLine).catch((e) => err(job.provider, e && e.message || e));
  }
  // 사진형 프로바이더는 count번 호출해 base_1..base_N 으로 저장 (보드 프리픽스 매칭 유지).
  // 이미 존재하는 슬라이드는 건너뛴다 — 중단·부분 실패 후 재실행 시 빠진 장만 채운다(top-up).
  if (job.kind === 'image' && count > 1 && !CARD_LANES.includes(job.provider)) {
    const cdir = path.join(dir, 'outputs', 'creatives');
    const hasSlide = (i) => { try { return fs.readdirSync(cdir).some((f) => new RegExp(`^${job.base}_${i}\\.(png|jpe?g|webp)$`, 'i').test(f)); } catch { return false; } };
    const existRel = (i) => { try { const f = fs.readdirSync(cdir).find((x) => new RegExp(`^${job.base}_${i}\\.(png|jpe?g|webp)$`, 'i').test(x)); return f ? path.join('outputs', 'creatives', f) : null; } catch { return null; } };
    const files = [];
    let firstErr = null, made = 0;
    const missing = [];
    for (let i = 1; i <= count; i++) {
      if (hasSlide(i)) { const r = existRel(i); if (r) files.push(r); continue; } // 이미 있음 — top-up 스킵
      missing.push(i);
    }
    const slideJob = (i) => ({ ...job, count: 1, base: `${job.base}_${i}`, prompt: job.prompt + slideDirective(i, count, job.base) });
    const runOne = async (i) => { try { return await fn(dir, slideJob(i), onLine); } catch (e) { return err(job.provider, e && e.message || e); } };
    // 병렬 안전 레인(codex — claim 회수라 워커가 섞여도 안전)은 첫 장을 프로브로 먼저 굽고(설정
    // 문제 즉시 감지), 나머지를 워커 풀로 동시 생성한다. 그 외 레인은 기존 순차 유지.
    const par = PARALLEL_SAFE[job.provider] ? Math.max(1, Math.min(8, Number(job.parallel) || config.getCodexParallel())) : 1;
    if (par > 1 && missing.length > 1) {
      const probe = missing.shift();
      onLine && onLine(`[render] ${probe}/${count}장 생성 중… (프로브 — 이후 ${Math.min(par, missing.length)}병렬)`);
      const pr = await runOne(probe);
      if (!pr.ok && made === 0 && files.length === 0) return pr; // 첫 장부터 실패 — 설정 문제, 즉시 중단
      if (pr.ok) { files.push(...(pr.files || [pr.rel])); made++; } else firstErr = pr.error;
      const rest = (job.stopped && job.stopped()) ? [] : missing;
      const results = await asyncPool(par, rest, async (i) => {
        if (job.stopped && job.stopped()) return { ok: false, error: '중지됨' };
        onLine && onLine(`[render] ${i}/${count}장 생성 중… (병렬)`);
        return runOne(i);
      });
      for (const r of results) {
        if (r && r.ok) { files.push(...(r.files || [r.rel])); made++; }
        else if (r) { firstErr = firstErr || r.error; onLine && onLine(`[render] 일부 실패 — 계속: ${r.error}`); }
      }
    } else {
      for (const i of missing) {
        if (job.stopped && job.stopped()) break;
        onLine && onLine(`[render] ${i}/${count}장 생성 중…`);
        const r = await runOne(i);
        if (r.ok) { files.push(...(r.files || [r.rel])); made++; }
        else if (made === 0 && files.length === 0 && i === missing[0]) return r; // 첫 장부터 실패하면 설정 문제 — 즉시 중단
        else { firstErr = firstErr || r.error; onLine && onLine(`[render] ${i}장째 실패 — 계속: ${r.error}`); }
      }
    }
    if (!files.length) return err(job.provider, firstErr || '이미지를 만들지 못했습니다');
    // 파일명 순 정렬 — _1,_2,… 순서 보장
    files.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    return { ok: true, provider: job.provider, rel: files[0], files, count: files.length, requested: count };
  }
  try { return await fn(dir, job, onLine); }
  catch (e) { return err(job.provider, e && e.message || e); }
}

// ---- 자동 캐스케이드 --------------------------------------------------------------
// 인프라성 실패(키 미설정·만료, 크레딧/쿼터, 네트워크·타임아웃, 429/5xx)만 폴백 대상.
// 콘텐츠성 실패(세이프티 거부, 프롬프트 문제)는 다른 프로바이더도 같은 결과이거나
// 사람이 고쳐야 하므로 그대로 반환한다. 프로바이더별 오류 형태가 제각각이라 문자열 분류.
const INFRA_FAIL_RE = /api\s*키|api\s*key|키가 없습니다|키.{0,6}필요|토큰이 필요|설정 →|401|403|429|5\d\d|quota|rate\s*limit|billing|credit|크레딧|fetch failed|network|socket|ECONN|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|abort|timed?\s*out|타임아웃|연결(?:하지 못|실패|할 수 없)|unavailable|unreachable|ima2 serve/i;
function isInfraFailure(error) { return INFRA_FAIL_RE.test(String(error || '')); }

// 폴백 순위 — availability 선언 순서가 곧 우선순위(데스크톱 레인의 단일 정본).
// 가용(ok)하고 아직 시도하지 않은 프로바이더만. claude-svg는 사진이 아니라 타이포
// 카드(SVG) 레인이라 스타일 계약이 다르다 — 지명했을 때만 쓰고 자동 폴백에선 제외.
function fallbackRank(kind, env, tried) {
  const av = availability(env || {});
  const table = kind === 'video' ? VIDEO_PROVIDERS : IMAGE_PROVIDERS;
  return Object.entries(kind === 'video' ? av.video : av.image)
    .filter(([k, v]) => v.ok && table[k] && !tried.includes(k) && k !== 'claude-svg' && k !== 'gn-html') // 카드 레인은 지명 시에만 — 사진 폴백에서 제외
    .map(([k]) => k);
}

const MAX_FALLBACK_HOPS = 2; // 비용 연쇄 방지 — 지명 프로바이더 + 폴백 2회까지

async function generate(dir, job, onLine) {
  let last = await generateOnce(dir, job, onLine);
  if (last.ok || job.noFallback) return last;
  const tried = [job.provider];
  // 멀티슬라이드 배치도 통째로 재시도 — top-up이 이미 만든 슬라이드는 건너뛰므로 안전
  while (tried.length <= MAX_FALLBACK_HOPS && isInfraFailure(last.error)) {
    const next = fallbackRank(job.kind, job.env, tried)[0];
    if (!next) break;
    onLine && onLine(`[render] ${tried[tried.length - 1]} 실패(${String(last.error).slice(0, 80)}) → ${next}(으)로 자동 폴백`);
    last = await generateOnce(dir, { ...job, provider: next }, onLine);
    tried.push(next);
  }
  if (tried.length > 1) {
    return last.ok
      ? { ...last, fellBackFrom: job.provider, tried }
      : { ...last, tried, error: `${last.error} (시도: ${tried.join(' → ')})` };
  }
  return last;
}

// 기본 이미지 프로바이더 — availability 순서상 첫 번째 사용 가능 항목 (Codex 이미지 우선, 없으면 claude-svg)
function defaultImageProvider(env) {
  const av = availability(env || {});
  const hit = Object.entries(av.image).find(([, v]) => v.ok);
  return hit ? hit[0] : 'claude-svg';
}

module.exports = {
  generate, availability, SIZES, defaultImageProvider, warmupImageProvider,
  // 테스트 전용 내부 노출
  _isInfraFailure: isInfraFailure, _fallbackRank: fallbackRank, _ima2GenArgs: ima2GenArgs,
  _codexImgPrompt: codexImgPrompt, _codexSizeSpec: codexSizeSpec, _collectGenerated: collectGenerated, _claimTo: claimTo, _asyncPool: asyncPool,
};
