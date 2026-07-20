// 포스트 블록 탐색 — 레인 파일들에서 특정 포스트의 본문 블록을 찾는다.
// pub:copy / pub2:draft (main.js)와 promptlab(VISUAL DIRECTION 추출)이 공유.
// 종료 앵커는 시작과 동종(POST/ID/1레벨 헤딩)만 — 본문 내부의 ##·---에서 끊기지 않는다.
const fs = require('fs');
const path = require('path');

const normText = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

function findPostBlock(dir, lane, topic) {
  const root = path.resolve(dir);
  const laneDir = path.resolve(dir, 'outputs', lane);
  const laneRel = path.relative(root, laneDir);
  if (!laneRel || laneRel.startsWith('..') || path.isAbsolute(laneRel)) return { ok: false, error: 'path escape' };
  const t = normText(topic).slice(0, 24);
  if (!t) return { ok: false, error: '토픽이 비어 있습니다' };
  let files = [];
  try { files = fs.readdirSync(laneDir).filter((f) => /\.(md|txt)$/i.test(f)); } catch { /* no lane */ }
  const anchorRe = /^(POST\s*\d+\b.*|[A-Z]{1,2}-\d+\b.*|#\s.*)$/gm; // 동종 앵커만
  for (const f of files) {
    const text = fs.readFileSync(path.join(laneDir, f), 'utf8');
    const anchors = [...text.matchAll(anchorRe)].map((m) => m.index);
    anchors.push(text.length);
    for (let i = 0; i < anchors.length - 1; i++) {
      const block = text.slice(anchors[i], anchors[i + 1]);
      if (normText(block).includes(t)) return { ok: true, text: block.trim(), file: f };
    }
    // 앵커가 없는 단일 포스트 파일: 파일 전체가 토픽을 담으면 통째로
    if (!anchors.length || anchors[0] === text.length) {
      if (normText(text).includes(t)) return { ok: true, text: text.trim(), file: f };
    }
  }
  return { ok: false, error: '해당 포스트의 산출 파일을 찾지 못했습니다 — 카피가 생성됐는지 확인하세요' };
}

// 카피 계약 필드: 작가들이 남긴 영문 VISUAL DIRECTION — 렌더 프롬프트의 1급 재료
function findVisualDirection(dir, lane, topic) {
  const r = findPostBlock(dir, lane, topic);
  if (!r.ok) return null;
  const m = r.text.match(/^\s*(?:[-*•]\s*)?(?:\*\*)?VISUAL DIRECTION(?:\*\*)?\s*[:：]\s*(.+(?:\n(?![A-Z*#-]).+)*)/im);
  return m ? m[1].replace(/\n\s*/g, ' ').trim().slice(0, 600) : null;
}

/** 게시 본문 섹션(서로 peer) — 여기서만 섹션을 끊는다. VISUAL DIRECTION은 끊지 않음 */
const PEER_SECTION = /^(?:CAPTION|POST COPY|BODY|TITLE(?:\s*\([^)]*\))?|HASHTAGS?|HASH\s*TAGS?|CTA|TAGS?|본문|제목|해시태그)\s*[:：]/i;
const META_LINE = /^(?:PLATFORM|OBJECTIVE|FRAMEWORK|TYPE|WORD COUNT|CHAR COUNT|글자수|문자수|MAIN KEYWORD|SUB KEYWORDS?|SPONSORED|HOOK|ANGLE|PILLAR|FORMAT|NOTES?|BLOTATO FLAG|INFOGRAPHIC|SCHEDULED\s*(?:DATE|TIME)|STYLE|MOOD|무드|스타일)\s*[:：]/i;
// 계약/프롬프트 블록 시작 — 여기부터 게시 본문이 아니다. 렌더용 프롬프트가 발행 본문에
// 딸려 나가는 유출을 막기 위해 영문·한글 라벨과 PROMPT 계열을 전부 잡는다.
// 주의: 한글 라벨 뒤에는 \b를 쓰지 않는다 — JS \b는 ASCII 단어 경계라 한글 다음에서 매칭 실패
const CONTRACT_START = /^(?:\[?\s*(?:IMAGE\s+SLOT\b|이미지\s*슬롯)|(?:\*\*)?(?:VISUAL\s+DIRECTION\b|비주얼\s*디렉션)|(?:\*\*)?(?:IMAGE\s+|FINAL\s+|NEGATIVE\s+)?PROMPT\s*[:：]|(?:\*\*)?(?:이미지\s*|네거티브\s*)?프롬프트\s*[:：])/i;
// 프롬프트 문법 필드 라벨 — gpt-image-2 킷(Format A)·sop 6요소·SUBJECT→…→NEGATIVE 팩이
// 공유하는 영문 라벨. 한국어 게시 본문엔 이 영문 라벨이 줄머리로 등장하지 않으므로 안전하게 잡는다.
const PROMPT_FIELD = /^(?:#\s*\d+\.\s*)?(?:\*\*)?(?:Scene|Camera(?:\s*\+\s*Lighting)?|Lighting|Colou?r\s*grading|Texture(?:\s*\/\s*Medium)?|Medium|Text[-\s]?in[-\s]?image|Text\s*overlay|Subject|Composition|Location|Setting|Negative(?:\s*prompt)?|Aspect\s*ratio)\s*[:：]/i;
// 끝에 붙는 AR 토큰 줄 (`AR 16:9`, `AR 4:5 SIZE 1024x1536`) — 프롬프트 잔재
const AR_TOKEN = /^(?:\*\*)?AR\s+\d{1,2}\s*:\s*\d{1,2}\b/i;
// 계약/프롬프트 라인인가 — 스킵 진입 신호
const isContractLine = (t) => CONTRACT_START.test(t) || PROMPT_FIELD.test(t) || AR_TOKEN.test(t);
// 실제 게시 섹션 재개 앵커 — 스킵은 빈 줄이 아니라 여기서만 풀린다(프롬프트 블록 중간 빈 줄에
// 속아 뒷부분을 다시 게시하지 않게). PEER 게시 섹션 / 네이버 ## 소제목 / 구분선 / 새 포스트.
const isResumeAnchor = (t) => PEER_SECTION.test(t) || /^##\s+/.test(t) || /^---+\s*$/.test(t)
  || /^(?:\*\*)?(?:POST|THREAD)\s+\d+\b/i.test(t) || /^[A-Z]{1,2}-\d+\b/.test(t);

function sectionBody(text, nameRe) {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(new RegExp(String.raw`^\s*(?:\*\*)?(${nameRe})(?:\*\*)?\s*[:：]\s*(.*)$`, 'i'));
    if (!m) continue;
    const sameLine = (m[2] || '').trim();
    const collected = [];
    if (sameLine) collected.push(sameLine);
    let skipContract = false;
    for (let j = i + 1; j < lines.length; j++) {
      const L = lines[j];
      const trimmed = L.trim();
      // 프롬프트/계약 블록 스킵 중 — 재개 앵커 전까지 빈 줄·프롬프트 줄을 전부 흡수
      if (skipContract) {
        if (isResumeAnchor(trimmed)) skipContract = false;
        else continue;
      }
      if (/^\s*---+\s*$/.test(L)) break;
      if (/^\s*(?:\*\*)?(?:POST|THREAD)\s+\d+\b/i.test(L)) break;
      // 다른 게시 섹션이 시작되면 종료 (CAPTION 다음 HASHTAGS 등)
      if (PEER_SECTION.test(trimmed) && !new RegExp(String.raw`^(?:${nameRe})\s*[:：]`, 'i').test(trimmed)) break;
      if (isContractLine(trimmed)) { skipContract = true; continue; }
      if (META_LINE.test(trimmed)) continue;
      // 네이버 본문 안 ## 소제목은 유지
      collected.push(L);
    }
    return collected.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  return null;
}

function stripVisualAndSlots(text) {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let skip = false;
  for (const L of lines) {
    const t = L.trim();
    // 스킵 중 — 재개 앵커 전까지는 빈 줄·프롬프트 줄을 전부 흡수(프롬프트 블록 중간 빈 줄에 안 속게)
    if (skip && !isResumeAnchor(t)) continue;
    skip = false;
    if (isContractLine(t)) { skip = true; continue; }
    if (/^(?:\*\*)?BLOTATO FLAG\b/i.test(t)) continue;
    if (/^(?:\*\*)?(?:Char count|Word count|글자수|문자수)\b/i.test(t)) continue;
    if (/^(?:\*\*)?(?:PASS|WARN|BLOCK)\b/i.test(t)) continue;
    out.push(L);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function stripPackageMeta(text) {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let skip = false;
  for (const L of lines) {
    const trimmed = L.trim().replace(/^\*\*|\*\*$/g, '');
    // 스킵 중 — 재개 앵커(단, 여기선 ##/PEER/META만; --- 와 POST 는 어차피 아래서 제거)까지 흡수
    if (skip && !(PEER_SECTION.test(trimmed) || /^##\s+/.test(trimmed) || META_LINE.test(trimmed))) continue;
    skip = false;
    if (/^---+\s*$/.test(trimmed)) continue;
    if (/^(?:\*\*)?(?:POST|THREAD)\s+\d+\b/i.test(trimmed)) continue;
    if (/^[A-Z]{1,2}-\d+\b/.test(trimmed) && /—|-/.test(trimmed)) continue; // IG-1 — topic
    if (/^#\s+/.test(trimmed) && /(POST|캡션|스레드)/i.test(trimmed)) continue;
    if (isContractLine(trimmed)) { skip = true; continue; }
    if (META_LINE.test(trimmed)) continue;
    if (/^\d+\s*\/\s*\d+\s*chars?\b/i.test(trimmed)) continue;
    // 라벨만 있고 내용 없는 CAPTION: 줄은 제거
    if (/^(?:CAPTION|POST COPY|BODY|TITLE|HASHTAGS?|CTA|TAGS?)\s*[:：]\s*$/i.test(trimmed)) continue;
    out.push(L);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * 패키지 블록 → 실제 게시용 본문.
 * 캡션/스레드/블로그 규약에서 CAPTION·POST COPY·BODY·TITLE만 남기고
 * VISUAL DIRECTION·메타·프롬프트 필드를 제거한다.
 * @returns {{ text: string, title: string|null }}
 */
function extractPublishBody(raw) {
  let text = String(raw || '').replace(/\r\n/g, '\n').trim();
  text = text.replace(/^---+\s*\n/, '').replace(/\n---+\s*$/, '').trim();

  const caption = sectionBody(text, 'CAPTION|POST COPY|본문');
  const body = sectionBody(text, 'BODY');
  const title = sectionBody(text, 'TITLE(?:\\s*\\([^\\n)]*\\))?|제목');
  const hashtags = sectionBody(text, 'HASHTAGS?|HASH\\s*TAGS?|해시태그');
  const cta = sectionBody(text, 'CTA');
  const tags = sectionBody(text, 'TAGS?');

  if (caption) {
    let out = caption;
    if (hashtags) out += (out ? '\n\n' : '') + hashtags;
    // CTA가 캡션에 이미 없으면 덧붙임
    if (cta && !out.replace(/\s+/g, '').includes(cta.replace(/\s+/g, '').slice(0, 24))) {
      out += (out ? '\n\n' : '') + cta;
    }
    return { text: stripVisualAndSlots(out), title: null };
  }

  if (body || title) {
    let out = '';
    if (body) out = stripVisualAndSlots(body);
    else out = stripPackageMeta(text);
    if (tags) {
      const tagLine = tags.split(/[,，]/).map((s) => s.trim()).filter(Boolean)
        .map((t) => (t.startsWith('#') ? t : '#' + t.replace(/\s+/g, ''))).join(' ');
      if (tagLine) out += (out ? '\n\n' : '') + tagLine;
    }
    return { text: out.replace(/\n{3,}/g, '\n\n').trim(), title: title || null };
  }

  // 라벨 없는 스레드/X 스타일 — 메타·계약 필드만 제거
  return { text: stripPackageMeta(text), title: null };
}

function draftForPublish(dir, lane, topic) {
  const r = findPostBlock(dir, lane, topic);
  if (!r.ok) return r;
  const { text, title } = extractPublishBody(r.text);
  if (!text) return { ok: false, error: '본문 필드를 찾지 못했습니다 — CAPTION/POST COPY/BODY를 확인하세요', file: r.file };
  return { ok: true, text, title, file: r.file, rawChars: r.text.length };
}

module.exports = {
  findPostBlock,
  findVisualDirection,
  extractPublishBody,
  draftForPublish,
  normText,
};
