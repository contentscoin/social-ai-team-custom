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
// 계약/프롬프트 블록 시작 — 여기부터 빈 줄까지는 게시 본문이 아니다. 렌더용 프롬프트가
// 발행 본문에 딸려 나가는 유출을 막기 위해 영문·한글 라벨과 PROMPT 계열을 전부 잡는다.
// 주의: 한글 라벨 뒤에는 \b를 쓰지 않는다 — JS \b는 ASCII 단어 경계라 한글 다음에서 매칭 실패
const CONTRACT_START = /^(?:\[?\s*(?:IMAGE\s+SLOT\b|이미지\s*슬롯)|(?:\*\*)?(?:VISUAL\s+DIRECTION\b|비주얼\s*디렉션)|(?:\*\*)?(?:IMAGE\s+|FINAL\s+|NEGATIVE\s+)?PROMPT\s*[:：]|(?:\*\*)?(?:이미지\s*|네거티브\s*)?프롬프트\s*[:：])/i;

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
      if (/^\s*---+\s*$/.test(L)) break;
      if (/^\s*(?:\*\*)?(?:POST|THREAD)\s+\d+\b/i.test(L)) break;
      // 다른 게시 섹션이 시작되면 종료 (CAPTION 다음 HASHTAGS 등)
      if (PEER_SECTION.test(trimmed) && !new RegExp(String.raw`^(?:${nameRe})\s*[:：]`, 'i').test(trimmed)) break;
      if (CONTRACT_START.test(trimmed)) { skipContract = true; continue; }
      if (skipContract) {
        if (!trimmed) { skipContract = false; continue; }
        if (/^\s*##\s+/.test(L) || PEER_SECTION.test(trimmed) || META_LINE.test(trimmed)) {
          skipContract = false;
        } else {
          continue;
        }
      }
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
    if (CONTRACT_START.test(L.trim())) {
      skip = true;
      continue;
    }
    if (skip) {
      // VISUAL DIRECTION 연속 줄 스킵 — 빈 줄·새 헤더·소제목에서 해제
      if (!L.trim()) { skip = false; continue; }
      // (SECTION_HEAD 미정의 잠복 버그 수정 — 의도는 게시 섹션 시작에서 스킵 해제)
      if (/^\s*##\s+/.test(L) || PEER_SECTION.test(L.trim()) || /^\s*---+\s*$/.test(L)) {
        skip = false;
      } else {
        continue;
      }
    }
    if (/^\s*(?:\*\*)?BLOTATO FLAG\b/i.test(L)) continue;
    if (/^\s*(?:\*\*)?(?:Char count|Word count|글자수|문자수)\b/i.test(L)) continue;
    if (/^\s*(?:\*\*)?(?:PASS|WARN|BLOCK)\b/i.test(L)) continue;
    out.push(L);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function stripPackageMeta(text) {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let skipVd = false;
  for (const L of lines) {
    const trimmed = L.trim().replace(/^\*\*|\*\*$/g, '');
    if (/^\s*---+\s*$/.test(L)) continue;
    if (/^\s*(?:\*\*)?(?:POST|THREAD)\s+\d+\b/i.test(L)) continue;
    if (/^\s*[A-Z]{1,2}-\d+\b/.test(L) && /—|-/.test(L)) continue; // IG-1 — topic
    if (/^\s*#\s+/.test(L) && /(POST|캡션|스레드)/i.test(L)) continue;
    if (CONTRACT_START.test(trimmed)) { skipVd = true; continue; }
    if (skipVd) {
      if (!trimmed) { skipVd = false; continue; }
      if (/^\s*##\s+/.test(L) || PEER_SECTION.test(trimmed) || META_LINE.test(trimmed)) skipVd = false;
      else continue;
    }
    if (META_LINE.test(trimmed)) continue;
    if (/^\s*\d+\s*\/\s*\d+\s*chars?\b/i.test(L)) continue;
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
