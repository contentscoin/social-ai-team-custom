// 일괄 비주얼 렌더 — 오토파일럿의 visuals-generate와 "일괄 비주얼 생성" 버튼이 공유한다.
// 핵심: 파이프라인(creative-designer 에이전트)은 앱 설정의 프로바이더 키를 못 본다.
// 여기서 앱 렌더 엔진(lib/render.js — 설정 키를 읽음)을 직접 돌려 실제 이미지를 만든다.
// 포스트마다 프롬프트를 컴파일하고, 포맷에 따라 여러 장(캐러셀)을 생성한다.
const board = require('./board');
const promptlab = require('./promptlab');
const render = require('./render');

// 포맷 문자열로 캐러셀 여부·기본 장수 추정 — 대부분의 SNS는 여러 장을 쓴다
function inferCount(post, fallback) {
  const f = String(post.format || '').toLowerCase() + ' ' + String(post.headerRaw || '');
  if (/carousel|캐러셀|슬라이드|slide|album/i.test(f)) return 5;
  if (/multi|여러\s*장|다중|묶음/i.test(f)) return 4;
  if (/single|단일|1\s*장|피드|feed/i.test(f)) return 1;
  // 기본값은 멀티이미지 — 1장 1텍스트가 아니라 여러 장 배치가 콘텐츠 기획의 기본
  return fallback || 3;
}
// 세로 4:5가 인스타 피드 점유에 유리 — 스토리/릴스형은 9:16
function inferSize(post) {
  const f = String(post.format || '').toLowerCase();
  if (/story|스토리|9:16|세로영상/i.test(f)) return 'story';
  if (/1:1|정방|square/i.test(f)) return 'square';
  return 'portrait';
}

// opts: { provider?, count?(고정 장수 강제), ima2?, stopped?(), onlyMissing?(기본 true), style?(이미지 스타일 프리셋) }
// opts._render/_promptlab/_board: 테스트 주입 훅(미지정 시 실제 모듈).
async function renderAll(dir, opts, onLine) {
  const R = opts._render || render;
  const PL = opts._promptlab || promptlab;
  const B = opts._board || board;
  const b = B.buildBoard(dir);
  const provider = opts.provider || R.defaultImageProvider({ ima2: opts.ima2 });
  const style = opts.style || '';
  // 사진형 이미지가 필요한 포스트: 카피가 생겼고(stage ≥ copy) 릴스가 아닌 것.
  // onlyMissing이면 "필요한 장수만큼 이미 있는" 카드만 건너뛴다 — 썸네일 하나만 보고
  // 완료로 치면 2/5 상태 카드가 영영 안 채워진다. 부분 완성 카드는 대상에 포함해 top-up.
  const onlyMissing = opts.onlyMissing !== false;
  const renderCount = (p) => (p.files || []).filter((f) => f.kind === 'render').length;
  const wantCount = (p) => Number(opts.count) > 0 ? Number(opts.count) : inferCount(p, 3);
  const targets = (b.posts || []).filter((p) =>
    !p.isReel &&
    ['copy', 'visual', 'review', 'ready'].includes(p.stage) &&
    (!onlyMissing || renderCount(p) < wantCount(p)));
  if (!targets.length) {
    return { ok: true, provider, rendered: 0, results: [], note: '렌더할 포스트가 없습니다 (카피가 있고 아직 이미지가 없는 사진형 포스트 대상)' };
  }
  onLine && onLine(`[비주얼] ${targets.length}개 포스트 · 프로바이더 ${provider}`);
  // 프로바이더 예열 — ima2면 serve를 미리 띄워 첫 렌더 전에 뜰 시간을 준다.
  try { if (R.warmupImageProvider) await R.warmupImageProvider(provider, { ima2: opts.ima2 }, onLine); } catch { /* best effort */ }
  const isInfra = R._isInfraFailure || (() => false);
  const results = [];
  let okCount = 0, downStreak = 0;
  for (const p of targets) {
    if (opts.stopped && opts.stopped()) { onLine && onLine('[비주얼] 중지됨'); break; }
    const cid = `${p.chId || 'etc'}-${p.n}`;
    const count = wantCount(p);
    const size = inferSize(p);
    const brief = [p.topic, p.visual && `비주얼 디렉션: ${p.visual}`, p.angle && `앵글: ${p.angle}`, p.pillar && `필러: ${p.pillar}`].filter(Boolean).join('\n');
    onLine && onLine(`[비주얼] ${cid} — ${count}장 (${size}) 준비`);
    let prompt = brief, negative = null;
    try {
      const c = await PL.compile(dir, {
        kind: 'image', provider, topic: p.topic, channel: p.channel, format: p.format, lane: p.lane,
        prompt: brief, size, count, style,
      }, onLine);
      if (c && c.ok && c.prompt) { prompt = c.prompt; negative = c.negative || null; }
    } catch { /* 컴파일 실패 시 브리프 원문으로 진행 */ }
    let r;
    try {
      r = await R.generate(dir, { kind: 'image', provider, prompt, negative, base: cid, size, count, stopped: opts.stopped, env: { ima2: opts.ima2 } }, onLine);
      results.push({ uid: p.uid, id: cid, ok: !!r.ok, files: r.files || [], count: (r.files || []).length, error: r.error });
      onLine && onLine(r.ok ? `[비주얼] ✔ ${cid} — ${(r.files || []).length}장` : `[비주얼] ✖ ${cid} — ${r.error}`);
    } catch (e) {
      r = { ok: false, error: String(e && e.message || e) };
      results.push({ uid: p.uid, id: cid, ok: false, files: [], error: r.error });
    }
    // 조기 중단 — 성공이 하나도 없는데 인프라(엔진 서버·키) 실패가 연속되면 61개를 갈지 말고 중단.
    if (r && r.ok) { okCount += 1; downStreak = 0; }
    else if (r && isInfra(r.error)) {
      downStreak += 1;
      if (okCount === 0 && downStreak >= 2) {
        const hint = provider === 'ima2'
          ? '설정 → 환경에서 ima2 설치·로그인을 확인하거나 터미널에서 `ima2 serve`를 켜세요.'
          : '설정 → 렌더에서 이 프로바이더의 API 키/연결을 확인하세요.';
        onLine && onLine(`[비주얼] ⚠ 이미지 엔진(${provider}) 연결 실패가 반복됩니다 — 배치를 중단합니다.`);
        return {
          ok: false, provider, rendered: 0, images: 0, results, providerDown: true,
          resultText: `이미지 엔진(${provider})에 연결하지 못해 중단했습니다. ${hint} (0/${targets.length})`,
        };
      }
    } else { downStreak = 0; } // 콘텐츠성 실패(세이프티 등)는 다음 포스트 계속
  }
  const total = results.reduce((n, r) => n + (r.files ? r.files.length : 0), 0);
  return {
    ok: okCount > 0,
    provider, rendered: okCount, images: total, results,
    resultText: `${okCount}/${targets.length} 포스트 · 총 ${total}장 생성 (${provider})`,
  };
}

module.exports = { renderAll, inferCount, inferSize };
