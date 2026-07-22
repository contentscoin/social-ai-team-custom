// 채널별 캐릭터/마스터 시트 + 락인.
// 채널마다 고정 비주얼 아이덴티티를 정의하고 락을 걸면, 그 채널의 모든 이미지 컴파일에 시트가
// 최우선 일관성 지침으로 주입된다 — 채널 톤·팔레트·조명·반복 등장 주체를 프레임 간 고정.
//  - master:    마스터 시트(전체 스타일·무드·팔레트 HEX·조명·구도 규약)
//  - character: 캐릭터 시트(반복 등장하는 주체/모델/페르소나의 외형·복장·분위기)
//  - anchorImage: (선택) 앵커 레퍼런스 이미지 rel — edit/composite 레인에서 픽셀 일관성용
//  - locked:    true면 컴파일에 주입(락인)
// 저장 위치: <client>/context/channel-sheets/<channel>.json (클라이언트별·채널별)
const fs = require('fs');
const path = require('path');
const channelRegistry = require('./channels');

function sheetsDir(dir) { return path.join(dir, 'context', 'channel-sheets'); }
function fileFor(dir, channel) { return path.join(sheetsDir(dir), `${channel}.json`); }
function validChannel(channel) { return !!(channelRegistry.REGISTRY[channel] && channel !== 'etc'); }

function get(dir, channel) {
  try { return JSON.parse(fs.readFileSync(fileFor(dir, channel), 'utf8')); } catch { return null; }
}

function save(dir, channel, data = {}) {
  if (!validChannel(channel)) return { ok: false, error: '알 수 없는 채널입니다' };
  const cur = get(dir, channel) || {};
  const str = (v, fb, cap) => (typeof v === 'string' ? v.slice(0, cap) : fb);
  const rel = (v, fb) => (v != null ? String(v).slice(0, 300) : (fb || ''));
  const next = {
    master: str(data.master, cur.master || '', 4000),
    character: str(data.character, cur.character || '', 4000),
    guidelines: str(data.guidelines, cur.guidelines || '', 4000), // 지침 — 이미지·카피에 공통 적용되는 채널 규칙
    // 레퍼런스 이미지 rel — ima2 --ref 앵커로 인물·제품 픽셀 일관성. 텍스트 시트로 부족한 부분을 실제 이미지로 고정.
    characterRef: rel(data.characterRef, cur.characterRef),
    masterRef: rel(data.masterRef, cur.masterRef),
    anchorImage: rel(data.anchorImage, cur.anchorImage), // (구) 단일 앵커 — 하위호환
    locked: data.locked != null ? !!data.locked : !!cur.locked,
    updatedAt: new Date().toISOString(),
  };
  fs.mkdirSync(sheetsDir(dir), { recursive: true });
  const p = fileFor(dir, channel);
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2));
  fs.renameSync(tmp, p); // 원자적 교체
  return { ok: true, channel, sheet: next };
}

function setLock(dir, channel, locked) {
  if (!get(dir, channel)) return { ok: false, error: '먼저 시트 내용을 저장하세요' };
  return save(dir, channel, { locked: !!locked });
}

// 전 채널 시트 요약(설정 UI 목록용)
function list(dir) {
  return Object.keys(channelRegistry.REGISTRY)
    .filter(validChannel)
    .map((ch) => {
      const s = get(dir, ch);
      return {
        channel: ch,
        name: channelRegistry.REGISTRY[ch].name,
        has: !!(s && (s.master || s.character || s.guidelines)),
        locked: !!(s && s.locked),
        characterRef: (s && s.characterRef) || '',
        masterRef: (s && s.masterRef) || '',
        anchorImage: (s && s.anchorImage) || '',
        updatedAt: (s && s.updatedAt) || null,
      };
    });
}

// AI 초안 지시문 — 브랜드 컨텍스트 + 플랫폼 방향으로 마스터/캐릭터 시트 초안을 만든다(순수 함수).
// brand: promptlab.brandContext(dir) 결과. platformDir: PLATFORM_DIRECTION[channel] (없으면 '').
function draftPrompt(brand = {}, channel = '', channelName = '', platformDir = '') {
  const b = brand || {};
  const palette = (b.palette && b.palette.length) ? b.palette.join(' ') : '(팔레트 미지정 — 무드에서 추론)';
  return (
    `너는 SNS 채널의 비주얼 아트 디렉터다. 아래 브랜드 자료와 플랫폼 방향을 종합해, 이 채널의 모든 이미지가 ` +
    `프레임 간 일관되게 따를 "마스터 시트"와 "캐릭터 시트"를 작성하라.\n\n` +
    `[채널] ${channelName || channel} (${channel})\n` +
    (platformDir ? `[플랫폼 방향]\n${platformDir}\n\n` : '') +
    `[브랜드 무드]\n${b.summary || '-'}\n` +
    (b.photography ? `[브랜드 포토 스타일]\n${b.photography}\n` : '') +
    (b.dos ? `[브랜드 DO]\n${b.dos}\n` : '') +
    (b.donts ? `[브랜드 DON'T]\n${b.donts}\n` : '') +
    `브랜드 팔레트: ${palette}\n\n` +
    `[작성 규칙]\n` +
    `- 마스터 시트: 전체 스타일·무드·팔레트(HEX 3~5색을 색 이름과 함께)·조명 성격·구도 규약·재질 언어를 고정한다. ` +
    `카메라/조명은 장비명이 아니라 결과로 서술(shallow DoF, warm key + cool rim 등). SD 구식 어휘(masterpiece/8k/best quality) 금지.\n` +
    `- 캐릭터 시트: 이 채널에 반복 등장하는 주체(모델·마스코트·제품 페르소나)의 외형·복장·연령대·분위기·표정 톤을 고정한다. ` +
    `등장 주체가 사람이면 natural skin texture, visible pores를 명시. 반복 주체가 없으면 "반복 주체 없음 — 오브젝트/손 중심" 원칙을 적는다.\n` +
    `- 지침(guidelines): 이 채널 콘텐츠 전반의 규칙 — 카피 톤·어미, 해시태그·이모지 규칙, 금지 표현, 포맷 규약, 이미지 연출 금지사항 등 카피와 이미지 모두에 적용될 채널 운영 지침을 적는다.\n` +
    `- 한국어로 서술하되 시각 키워드(HEX·렌즈감·재질)는 영어를 섞어도 된다. 이미지 안 텍스트/로고 금지 원칙을 마스터에 포함.\n` +
    `- 마스터·캐릭터는 각 250~500자, 지침은 150~400자. 추상어는 구체 사물·제스처로 환원.\n` +
    `- 출력은 JSON 하나만: {"master":"...","character":"...","guidelines":"..."} (코드펜스 금지)`
  );
}

// AI 초안 응답 파싱 — {master, character, guidelines} 추출. 실패 시 null.
function parseDraft(out) {
  const s = String(out || '');
  const tryParse = (t) => { try { return JSON.parse(t); } catch { return null; } };
  let j = tryParse(s.trim());
  if (!j) { const m = s.match(/\{[\s\S]*\}/); if (m) j = tryParse(m[0]); }
  // claude json 모드는 {result:"..."} 래핑 — 내부 JSON을 다시 파싱
  if (j && typeof j.result === 'string') {
    const inner = tryParse(j.result.trim()) || (() => { const m = j.result.match(/\{[\s\S]*\}/); return m ? tryParse(m[0]) : null; })();
    if (inner) j = inner;
  }
  if (!j) return null;
  const master = typeof j.master === 'string' ? j.master.trim() : '';
  const character = typeof j.character === 'string' ? j.character.trim() : '';
  const guidelines = typeof j.guidelines === 'string' ? j.guidelines.trim() : '';
  if (!master && !character && !guidelines) return null;
  return { master: master.slice(0, 4000), character: character.slice(0, 4000), guidelines: guidelines.slice(0, 4000) };
}

// 락인된 채널 시트를 이미지 프롬프트 컴파일에 주입할 지시문. 락 안 됐거나 비었으면 ''.
function compileDirective(dir, channel) {
  const s = get(dir, channel);
  if (!s || !s.locked) return '';
  const parts = [];
  if (s.master && s.master.trim()) parts.push(`[마스터 시트 — 고정 비주얼 아이덴티티]\n${s.master.trim()}`);
  if (s.character && s.character.trim()) parts.push(`[캐릭터 시트 — 반복 등장 주체 고정]\n${s.character.trim()}`);
  if (s.guidelines && s.guidelines.trim()) parts.push(`[채널 지침 — 준수 규칙]\n${s.guidelines.trim()}`);
  if (!parts.length) return '';
  const refNote = (s.characterRef || s.masterRef || s.anchorImage)
    ? `이 채널은 잠금된 레퍼런스 이미지가 있어 생성 시 --ref 앵커로 전달된다 — 그 레퍼런스의 인물·제품 외형을 그대로 유지하라. `
    : '';
  return `\n[채널 시트 락인 — ${channel} · 반드시 준수]\n`
    + `이 채널의 모든 이미지는 아래 마스터/캐릭터 시트를 일관되게 따른다(팔레트·조명·스타일·등장 주체를 프레임 간 고정). ${refNote}`
    + `VISUAL DIRECTION·플랫폼 방향보다 이 락인 시트가 우선한다.\n`
    + parts.join('\n\n') + '\n\n';
}

// 락인된 채널의 레퍼런스 이미지 절대경로 배열(캐릭터→마스터→구 앵커 순). 워크스페이스 안·실제 파일만.
// ima2 --ref 앵커로 전달해 인물·제품 픽셀 일관성을 확보한다. 락 안 됐거나 없으면 [].
function refImages(dir, channel) {
  const s = get(dir, channel);
  if (!s || !s.locked) return [];
  const base = path.resolve(dir);
  const out = [];
  for (const relPath of [s.characterRef, s.masterRef, s.anchorImage]) {
    if (!relPath) continue;
    const abs = path.resolve(dir, relPath);
    if (abs.startsWith(base + path.sep) && !out.includes(abs)) {
      try { if (fs.existsSync(abs)) out.push(abs); } catch { /* skip */ }
    }
  }
  return out.slice(0, 5);
}

// 락인된 전 채널의 '지침'을 카피/영상 단계 프롬프트에 주입할 집계 블록. 없으면 ''.
function contentGuidelines(dir) {
  const lines = [];
  for (const ch of Object.keys(channelRegistry.REGISTRY).filter(validChannel)) {
    const s = get(dir, ch);
    if (s && s.locked && s.guidelines && s.guidelines.trim()) {
      const name = channelRegistry.REGISTRY[ch].name;
      lines.push(`· ${name}(${ch}): ${s.guidelines.trim().replace(/\s+/g, ' ')}`);
    }
  }
  if (!lines.length) return '';
  return `[채널별 지침 — 락인, 반드시 준수]\n각 채널의 카피·영상은 아래 해당 채널 지침을 최우선으로 따른다.\n${lines.join('\n')}\n\n`;
}

module.exports = { get, save, setLock, list, compileDirective, refImages, contentGuidelines, draftPrompt, parseDraft, sheetsDir };
