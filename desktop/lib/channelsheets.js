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

const clampStr = (v, fb, cap) => (typeof v === 'string' ? v.slice(0, cap) : fb);
const clampRel = (v, fb) => (v != null ? String(v).slice(0, 300) : (fb || ''));

// 캐릭터 배열 정규화 — {name, text, ref}[] (최대 5, 빈 항목 제거).
function normChars(arr) {
  if (!Array.isArray(arr)) return null;
  return arr.slice(0, 5)
    .map((c) => ({ name: clampStr(c && c.name, '', 60) || '캐릭터', text: clampStr(c && c.text, '', 4000), ref: clampRel(c && c.ref, '') }))
    .filter((c) => c.text.trim() || c.ref);
}
// 저장 데이터 마이그레이션 — 구 단일 character/characterRef를 characters[]로 승격(비파괴, 읽기 시).
function normalize(s) {
  if (!s || typeof s !== 'object') return s;
  if (!Array.isArray(s.characters)) {
    const legacy = [];
    if ((s.character && String(s.character).trim()) || s.characterRef) {
      legacy.push({ name: '캐릭터 1', text: s.character || '', ref: s.characterRef || '' });
    }
    s.characters = legacy;
  } else {
    s.characters = normChars(s.characters) || [];
  }
  return s;
}

function get(dir, channel) {
  try { return normalize(JSON.parse(fs.readFileSync(fileFor(dir, channel), 'utf8'))); } catch { return null; }
}

// 여러 캐릭터 시트 + 단일 마스터 시트를 채널당 저장. 캐릭터는 characters[](각 name/text/ref).
// data.characters를 주면 배열을 통째 교체, 없으면 기존 유지. 구 character/characterRef도 계속 받는다.
function save(dir, channel, data = {}) {
  if (!validChannel(channel)) return { ok: false, error: '알 수 없는 채널입니다' };
  const cur = get(dir, channel) || {};
  const str = clampStr, rel = clampRel;
  // 캐릭터: characters 배열 우선, 없으면 구 character/characterRef 단일 갱신을 characters[0]에 반영.
  let characters;
  if (data.characters != null) {
    characters = normChars(data.characters) || [];
  } else if (data.character != null || data.characterRef != null) {
    characters = (cur.characters || []).slice();
    const first = characters[0] || { name: '캐릭터 1', text: '', ref: '' };
    if (data.character != null) first.text = str(data.character, first.text, 4000);
    if (data.characterRef != null) first.ref = rel(data.characterRef, first.ref);
    characters[0] = first;
    characters = normChars(characters) || [];
  } else {
    characters = cur.characters || [];
  }
  const next = {
    master: str(data.master, cur.master || '', 4000), // 브랜드 시트(전체 비주얼 아이덴티티/스타일 가이드)
    guidelines: str(data.guidelines, cur.guidelines || '', 4000), // 가이드 시트(콘텐츠·편집 지침)
    characters, // 캐릭터 시트 여러 개 [{name, text, ref}]
    masterRef: rel(data.masterRef, cur.masterRef), // 브랜드 레퍼런스(스타일 보드) 앵커
    logoRef: rel(data.logoRef, cur.logoRef), // 로고 이미지 자산 rel (업로드/생성) — 색·스타일 근거·컴포짓용
    logoNote: str(data.logoNote, cur.logoNote || '', 2000), // 로고 사용 규칙(여백·색·이미지 내 렌더 금지 등)
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

// ---- 클라이언트 공용 브랜드(전 채널 공유) ----------------------------------------------
// 브랜드 시트(전체 룩)와 로고는 채널 무관하게 하나로 관리한다: <client>/context/channel-sheets/_brand.json
function brandFile(dir) { return path.join(sheetsDir(dir), '_brand.json'); }
function getBrand(dir) {
  try { return JSON.parse(fs.readFileSync(brandFile(dir), 'utf8')); }
  catch {
    // 마이그레이션(비파괴): _brand.json이 없으면 마스터/로고가 있던 첫 채널에서 승격해 읽는다.
    for (const ch of Object.keys(channelRegistry.REGISTRY).filter(validChannel)) {
      const s = get(dir, ch);
      if (s && (s.master || s.masterRef || s.logoRef || s.logoNote)) {
        return { brand: s.master || '', brandRef: s.masterRef || '', logoRef: s.logoRef || '', logoNote: s.logoNote || '', updatedAt: null };
      }
    }
    return null;
  }
}
function saveBrand(dir, data = {}) {
  const cur = getBrand(dir) || {};
  const next = {
    brand: clampStr(data.brand, cur.brand || '', 4000), // 브랜드 시트(전체 비주얼 아이덴티티)
    brandRef: clampRel(data.brandRef, cur.brandRef),     // 브랜드 스타일 레퍼런스 이미지 rel
    logoRef: clampRel(data.logoRef, cur.logoRef),        // 로고 이미지 자산 rel
    logoNote: clampStr(data.logoNote, cur.logoNote || '', 2000),
    updatedAt: new Date().toISOString(),
  };
  fs.mkdirSync(sheetsDir(dir), { recursive: true });
  const p = brandFile(dir);
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2));
  fs.renameSync(tmp, p);
  return { ok: true, brand: next };
}

// 특정 캐릭터(index)의 레퍼런스 이미지 rel을 설정 — 레퍼런스 생성 IPC가 사용.
function setCharacterRef(dir, channel, index, rel) {
  const s = get(dir, channel);
  if (!s) return { ok: false, error: '시트가 없습니다' };
  const chars = (s.characters || []).slice();
  const i = Number(index) || 0;
  if (!chars[i]) return { ok: false, error: '해당 캐릭터가 없습니다' };
  chars[i] = { ...chars[i], ref: clampRel(rel, chars[i].ref) };
  return save(dir, channel, { characters: chars });
}

// 전 채널 시트 요약(설정 UI 목록용)
function list(dir) {
  return Object.keys(channelRegistry.REGISTRY)
    .filter(validChannel)
    .map((ch) => {
      const s = get(dir, ch);
      const chars = (s && s.characters) || [];
      return {
        channel: ch,
        name: channelRegistry.REGISTRY[ch].name,
        has: !!(s && (s.master || s.guidelines || chars.length || s.logoRef || s.logoNote)),
        locked: !!(s && s.locked),
        characterCount: chars.length,
        hasLogo: !!(s && (s.logoRef || s.logoNote)),
        refCount: [(s && s.masterRef), ...chars.map((c) => c.ref), (s && s.anchorImage)].filter(Boolean).length,
        masterRef: (s && s.masterRef) || '',
        anchorImage: (s && s.anchorImage) || '',
        updatedAt: (s && s.updatedAt) || null,
      };
    });
}

// 채널별 시트 방향 — 각 채널의 비주얼 전략에 맞게 마스터/캐릭터 시트가 무엇을 담아야 하는지.
// AI 초안이 채널마다 뚜렷이 다른 시트를 쓰도록 이 방향을 주입한다.
// chars: AI 초안이 만들 캐릭터 시트의 권장 개수·구성 — 채널 전략상 반복 등장이 필요한 주체 수.
const CHANNEL_SHEET_GUIDE = {
  instagram: {
    focus: '부러움을 유발하는 화보형 피드 — 연출과 사진 자체가 후킹.',
    master: '동경을 자아내는 에디토리얼 화보 아이덴티티: 절제된 통일 팔레트(HEX 3~5), 부드러운 방향광·골든아워 조명 무드, 매트 필름그레인 마감, 단일 주체+넉넉한 여백의 타이트 크롭. "남들이 부러워할 순간"이 매 장면에 담기게.',
    character: '피드의 얼굴이 되는 동경형 인물/모델 또는 제품-히어로. 일관된 스타일링·복장·분위기, natural skin texture·visible pores. 매 컷 같은 주체로 등장해 브랜드의 이상적 라이프스타일을 체현.',
    chars: '2개 — ① 메인 모델(동경형 인물) ② 제품 히어로(대표 제품/메뉴의 고정 연출)',
  },
  threads: {
    focus: '텍스트·화두 중심 — 스크롤을 멈추는 단독컷 + 댓글형 이미지 체인.',
    master: '즉시 읽히는 고대비 단독 프레임 아이덴티티: 강한 그래픽 명료성, 체인 전반에 고정되는 DNA 팔레트/악센트(HEX), 과장 없는 솔직·호기심 톤. 시리즈가 한 세트로 읽히되 매 컷 프레이밍은 다르게.',
    character: '반복되는 화려한 얼굴이 아니라 — 시리즈에 계속 등장하는 손·오브젝트·소품·공간을 고정한다. 인물이 나오면 손/제스처 위주로 부수적. "반복 오브젝트/손/장소"를 정의(모델보다 이쪽).',
    chars: '1개 — 반복 오브젝트/손·공간 세트(인물형 캐릭터 없음)',
  },
  naver: {
    focus: '정보 전달·디테일·신뢰 — 소제목을 뒷받침하는 깔끔한 정보컷.',
    master: '밝고 균일한 조명의 정보성 다큐멘터리 아이덴티티: 사실 그대로의 정직한 색, 정돈된 중립 스테이징, 보조적·비주장적. 각 이미지는 본문 한 구간을 정확히 설명하도록.',
    character: '페르소나보다 "제품·대상 자체"를 정보용으로 일관되게 제시(각도·배경 규약 고정). 인물이 필요하면 신뢰가는 안내자형, 매 글 같은 톤.',
    chars: '1개 — 제품/대상 히어로(브랜드 특성상 안내자가 필요하면 안내자형 인물 1개 추가)',
  },
  naver_clip: {
    focus: '세로 숏폼 영상 — 다이나믹·모션·썸네일 가독.',
    master: '세로 숏폼 모션 친화 아이덴티티: 모션에 맞는 프레이밍, 썸네일/커버에서 튀는 브랜드 악센트색, 첫 프레임 후킹, 안전 여백(자막 영역).',
    character: '클립 시리즈를 이끄는 일관된 진행자/등장 주체 — 활기차고 친근, 매 클립 같은 인물/톤.',
    chars: '1개 — 시리즈 진행자(필요시 대표 제품 1개 추가)',
  },
  kakao_channel: {
    focus: '친근한 소식·프로모션 — 메시지 카드로 작게 보임.',
    master: '친근하고 따뜻한 프로모션 아이덴티티: 초대하는 따뜻한 팔레트, 명확한 초점(오퍼/주체), 작은 카드에서도 읽히는 단순·깔끔 구성.',
    character: '따뜻하고 친숙한 브랜드 페르소나/마스코트 또는 대표 제품 — 일관된 다정한 제시.',
    chars: '2개 — ① 브랜드 마스코트/페르소나 ② 대표 제품',
  },
  facebook: {
    focus: '공감·커뮤니티·실제 순간.',
    master: '따뜻하고 다가가기 쉬운 실제 순간 아이덴티티: 부드러운 자연광, 일상적 진정성, 정직한 색·질감.',
    character: '공감가는 일상형 인물/가족 — 매 컷 자연스러운 동일 인물, natural skin texture.',
    chars: '1개 — 일상형 인물(브랜드 특성상 필요하면 가족/동료 1개 추가)',
  },
  linkedin: {
    focus: '신뢰·전문성(과장 없이).',
    master: '차분하고 믿음직한 에디토리얼 아이덴티티: 균일한 소프트 조명, 절제된 쿨-뉴트럴 팔레트, 정돈된 프레이밍.',
    character: '신뢰가는 대변인/전문가형 인물 — 일관된 차림·톤, natural skin texture.',
    chars: '1개 — 대변인/전문가형 인물',
  },
  x: {
    focus: '썸네일에서 즉시 읽히는 강한 한 컷.',
    master: '작은 크기에서도 즉시 읽히는 고대비 아이덴티티: 강한 그래픽 명료성, 뚜렷한 형태 분리, 일관된 악센트색.',
    character: '강하고 아이코닉한 반복 주체/마크 — 즉각 인지되는 일관 제시.',
    chars: '1개 — 아이코닉 반복 주체',
  },
  _default: {
    focus: '이 채널 콘텐츠 목적에 맞는 일관된 비주얼 아이덴티티.',
    master: '통일된 팔레트(HEX 3~5)·조명 무드·구도·재질 언어를 정의한 브랜드 비주얼 아이덴티티.',
    character: '반복 등장하는 주체(인물/제품/오브젝트)를 일관되게 고정. 사람이면 natural skin texture.',
    chars: '1개 — 핵심 반복 주체(필요시 보조 주체 1개 추가)',
  },
};

// AI 초안 지시문 — 채널별 시트 방향 + 브랜드 정체성(제품·서비스·로고·회사명) + 무드로 초안 작성(순수 함수).
// brand: promptlab.brandContext(dir) 결과(identity 포함). platformDir: PLATFORM_DIRECTION[channel] (없으면 '').
function draftPrompt(brand = {}, channel = '', channelName = '', platformDir = '') {
  const b = brand || {};
  const palette = (b.palette && b.palette.length) ? b.palette.join(' ') : '(팔레트 미지정 — 무드에서 추론)';
  const g = CHANNEL_SHEET_GUIDE[channel] || CHANNEL_SHEET_GUIDE._default;
  return (
    `너는 SNS 채널의 비주얼 아트 디렉터다. 이 채널의 특성에 맞는 "마스터 시트"와 "캐릭터 시트(여러 개)", "지침"을 작성하라. ` +
    `채널마다 결과가 뚜렷이 달라야 한다.\n\n` +
    `[채널] ${channelName || channel} (${channel})\n` +
    `[이 채널의 전략] ${g.focus}\n` +
    (platformDir ? `[플랫폼 방향(참고)] ${platformDir}\n` : '') +
    `\n[이 채널 마스터 시트 방향]\n${g.master}\n` +
    `\n[이 채널 캐릭터 시트 방향]\n${g.character}\n` +
    `\n[캐릭터 구성 — 이 채널 권장]\n${g.chars || '1개 — 핵심 반복 주체'}\n` +
    (b.identity ? `\n[브랜드 정체성 — 마스터 시트에 반영]\n${b.identity}\n` : '') +
    `\n[브랜드 무드]\n${b.summary || '-'}\n` +
    (b.photography ? `[브랜드 포토 스타일]\n${b.photography}\n` : '') +
    (b.dos ? `[브랜드 DO]\n${b.dos}\n` : '') +
    (b.donts ? `[브랜드 DON'T]\n${b.donts}\n` : '') +
    `브랜드 팔레트: ${palette}\n\n` +
    `[작성 규칙 — 마크다운 구조로 상세히]\n` +
    `- 세 필드(master, characters[], guidelines)를 각각 마크다운(## 소제목 + 불릿)으로 구조화해 상세히 작성한다. 아래 섹션 골격을 채우되 이 채널에 무의미한 섹션은 생략하고, 필요하면 섹션을 추가한다.\n` +
    `- 위 "이 채널 마스터/캐릭터 방향"을 이 채널에 맞게 구체화하고 브랜드 정체성·무드·팔레트와 결합한다. 채널마다 결과가 뚜렷이 달라야 한다.\n` +
    `- characters는 1~3개: 위 "캐릭터 구성 권장"을 기본으로 하되, 브랜드 특성상 불필요한 주체는 빼고 꼭 필요한 주체만 만든다. ` +
    `첫 번째 항목이 이 채널의 주(主) 반복 주체다(필수). 각 항목은 {"name":"...","text":"..."} — name은 짧은 한국어 식별명(20자 이내, 예: "바리스타 지은", "시그니처 라떼"), text가 그 캐릭터의 모델 시트다.\n\n` +
    `[master 섹션 골격 — 스타일 가이드/아트 바이블: 모든 이미지에 적용될 "룩의 규칙"]\n` +
    `## 스타일·무드 / ## 조명(setup) / ## 색·그레이딩 / ## 구도·프레이밍 / ## 피사체·배경·소품 규약 / ## 재질·질감 / ## 브랜드 정체성 반영 / ## DO · DON'T\n` +
    `  · 조명은 bright·airy vs moody를 정하고 셋업을 구체적으로(방향·소프트/하드·색온도 예 5000~5500K·그림자 성격). 색은 HEX 3~5색을 색 이름·용도와 함께(따뜻함/채도 bias 포함). ` +
    `구도는 선호 앵글(정면/45°/오버헤드 플랫레이)·여백·피사체 배치·렌즈감을 규약으로. 카메라는 장비명이 아니라 결과로 서술(shallow DoF, warm key + cool rim). ` +
    `**브랜드 정체성(회사명·취급 제품/서비스·로고에서 온 색·무드·상징)을 반영**하되 이미지 안에 로고·회사명·텍스트를 렌더하지는 말라(앱이 따로 얹는다 — 로고는 색/스타일 근거로만). SD 구식 어휘(masterpiece/8k/best quality) 금지.\n\n` +
    `[characters[] 각 항목의 text 섹션 골격 — 캐릭터 모델 시트: 반복 주체를 매 컷 동일하게 재현할 "정체의 규칙"]\n` +
    `## 정체(누구/무엇) / ## 턴어라운드(정면·3/4·측면·후면에서 유지할 실루엣·볼륨) / ## 비율·구성(키·두상 비율·체형·핵심 형태) / ## 외형·피부·헤어 / ## 복장·스타일링·소품(부위별 색 콜아웃) / ## 표정 세트 / ## 시그니처 고정점(매 컷 절대 유지) / ## DO · DON'T\n` +
    `  · 사람이면 natural skin texture, visible pores 명시. 제품/오브젝트면 턴어라운드·표정 대신 각도·배경·스테이징 규약을 적는다. ` +
    `반복 주체가 없어야 하는 채널이면 캐릭터 1개에 "반복 주체 없음 — 오브젝트/손 중심" 원칙과 고정할 오브젝트/공간·시그니처 디테일을 적는다.\n\n` +
    `[guidelines 섹션 골격 — 전략별 세부 지침]\n` +
    `이 채널 전략("${g.focus}")에 맞춰 각 항목을 전략별로 상세히 작성한다:\n` +
    `## 콘텐츠 전략 / ## 톤앤매너(문체·어미) / ## 후킹·오프닝 전략 / ## 본문 구조·포맷 / ## 해시태그 전략 / ## 이모지 규칙 / ## CTA 전략 / ## 금지 표현 / ## 이미지 연출 규칙 / ## 발행·운영 팁\n` +
    `  · 각 섹션은 실행 가능한 불릿 2~4개로, 구체 예시(예: 실제 문구·해시태그 샘플·시간대)를 포함한다. 이 채널에 안 맞는 섹션은 뺀다.\n\n` +
    `[공통]\n` +
    `- 한국어로 서술하되 시각 키워드(HEX·렌즈감·재질)는 영어 혼용 가능. 추상어는 구체 사물·제스처·예시로 환원.\n` +
    `- 분량: master는 500~900자, 캐릭터 text는 각 400~800자, guidelines는 800~1500자(전략별 세부까지 채운다).\n` +
    `- 출력은 JSON 하나만: {"master":"...","characters":[{"name":"...","text":"..."}],"guidelines":"..."} — master·text·guidelines 값은 소제목·불릿·줄바꿈을 포함한 마크다운 문자열이다. 코드펜스 금지.`
  );
}

// AI 초안 응답 파싱 — {master, characters[], guidelines} 추출(구 단일 character도 수용). 실패 시 null.
// characters: [{name, text}] 최대 5개(시트 상한과 동일). character는 첫 캐릭터 text의 하위호환 별칭.
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
  const guidelines = typeof j.guidelines === 'string' ? j.guidelines.trim() : '';
  let characters = (Array.isArray(j.characters) ? j.characters : [])
    .map((c, i) => ({
      name: (typeof (c && c.name) === 'string' && c.name.trim() ? c.name.trim() : `캐릭터 ${i + 1}`).slice(0, 60),
      text: (typeof (c && c.text) === 'string' ? c.text.trim() : '').slice(0, 4000),
    }))
    .filter((c) => c.text)
    .slice(0, 5);
  if (!characters.length && typeof j.character === 'string' && j.character.trim()) {
    characters = [{ name: '캐릭터 1', text: j.character.trim().slice(0, 4000) }];
  }
  if (!master && !characters.length && !guidelines) return null;
  return {
    master: master.slice(0, 4000),
    character: characters.length ? characters[0].text : '', // 하위호환(구 호출자)
    characters,
    guidelines: guidelines.slice(0, 4000),
  };
}

// 채널 시트를 이미지 프롬프트 컴파일에 주입할 지시문. 내용(마스터/캐릭터/지침 텍스트)이 있으면
// 락 여부와 무관하게 주입한다 — 채워두면 바로 스타일에 반영된다(예전엔 락해야만 반영돼 "가이드를
// 줘도 반영 안 됨" 문제가 있었다). 락이 걸리면 '반드시·최우선 + 레퍼런스 앵커'로 격상한다.
function compileDirective(dir, channel) {
  const brand = getBrand(dir);        // 클라이언트 공용(브랜드 시트 + 로고) — 전 채널 공유
  const s = get(dir, channel);        // 채널별(캐릭터 시트 + 가이드 시트)
  const chars = (s && s.characters) || [];
  const parts = [];
  // 브랜드 시트·로고는 클라이언트 공용에서 가져온다(채널 무관).
  if (brand && brand.brand && brand.brand.trim()) parts.push(`[브랜드 시트 — 고정 비주얼 아이덴티티(클라이언트 공용)]\n${brand.brand.trim()}`);
  // 로고: 색·스타일 근거로만 반영, 이미지 안에 로고·워드마크를 렌더하지는 말라(앱이 따로 얹는다).
  if (brand && brand.logoNote && brand.logoNote.trim()) parts.push(`[로고 — 색·스타일 근거로만 반영, 이미지 내 로고·텍스트 렌더 금지]\n${brand.logoNote.trim()}`);
  chars.forEach((c) => { if (c.text && c.text.trim()) parts.push(`[캐릭터 시트 · ${c.name} — 반복 등장 주체 고정]\n${c.text.trim()}`); });
  if (s && s.guidelines && s.guidelines.trim()) parts.push(`[가이드 시트 — 준수 규칙]\n${s.guidelines.trim()}`);
  if (!parts.length) return '';
  const locked = !!(s && s.locked);
  if (locked) {
    const hasRef = (brand && brand.brandRef) || (s && s.anchorImage) || chars.some((c) => c.ref);
    const refNote = hasRef
      ? `이 채널은 잠금된 레퍼런스 이미지가 있어 생성 시 --ref 앵커로 전달된다 — 그 레퍼런스의 인물·제품 외형을 그대로 유지하라. `
      : '';
    return `\n[채널 시트 락인 — ${channel} · 반드시 준수]\n`
      + `이 채널의 모든 이미지는 아래 브랜드/캐릭터 시트를 일관되게 따른다(팔레트·조명·스타일·등장 주체를 프레임 간 고정). ${refNote}`
      + `VISUAL DIRECTION·플랫폼 방향보다 이 락인 시트가 우선한다.\n`
      + parts.join('\n\n') + '\n\n';
  }
  // 락 안 됨 — 텍스트 가이드로 반영(강한 스타일 기준이되 최우선은 아님)
  return `\n[채널 스타일 가이드 — ${channel} · 반영]\n`
    + `이 채널 이미지는 아래 시트의 팔레트·조명·무드·주체를 스타일 기준으로 따른다.\n`
    + parts.join('\n\n') + '\n\n';
}

// 락인된 채널의 레퍼런스 이미지 절대경로 배열(캐릭터→마스터→구 앵커 순). 워크스페이스 안·실제 파일만.
// ima2 --ref 앵커로 전달해 인물·제품 픽셀 일관성을 확보한다. 락 안 됐거나 없으면 [].
function refImages(dir, channel) {
  const s = get(dir, channel);
  if (!s || !s.locked) return [];
  const brand = getBrand(dir); // 클라이언트 공용 브랜드 레퍼런스(전 채널 공유)
  const base = path.resolve(dir);
  const out = [];
  // 여러 캐릭터 레퍼런스 + 브랜드 레퍼런스(공용) + 구 앵커 — 존재하는 파일만, 최대 5장(ima2 --ref 상한).
  const rels = [...(s.characters || []).map((c) => c.ref), (brand && brand.brandRef), s.anchorImage];
  for (const relPath of rels) {
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

module.exports = { get, save, setLock, setCharacterRef, getBrand, saveBrand, list, compileDirective, refImages, contentGuidelines, draftPrompt, parseDraft, sheetsDir, CHANNEL_SHEET_GUIDE };
