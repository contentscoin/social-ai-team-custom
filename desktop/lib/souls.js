// 채널 SOUL — "이 채널에서 우리는 누구이고, 무엇을 말하고, 무엇을 하면 벌을 받는가."
// 말·기획 축의 정본이다. 시각 축(팔레트 HEX·조명·캐릭터 외형)은 channel-sheets가 정본이며
// soul엔 §9(무엇을 찍는가)만 둔다 — 네 번째 중복 정의를 만들지 않기 위한 경계선.
//
// 저장 계층: <client>/context/souls/<channel>.md (클라이언트 정본, 사장님이 고침)
//        → 없으면 lib/data/souls/<channel>.md (제품 스타터 — 브랜드 무관, 채널 물성만)
//
// 주입 원칙(하드캡 불변식): "곱해지는 자리에는 얇게, 안 곱해지는 자리에는 두껍게."
//   기획(사이클당 1회)   planningBlock  §3·§5·§6·§7·§8  채널당 900자
//   카피(사이클당 1회)   copyBlock      §3·§4·§6·§7     채널당 700자
//   이미지(포스트마다)   visualBlock    §9              채널당 250자
// soul 파일이 아무리 두꺼워져도 각 주입량은 캡에서 잘린다 — 지침 비대가 호출 비용 비대로
// 이어지는 것을 코드로 막는다(테스트가 이 불변식을 강제).
const fs = require('fs');
const path = require('path');
const channelRegistry = require('./channels');

const STARTER_DIR = path.join(__dirname, 'data', 'souls');
const CAPS = { planning: 900, copy: 700, visual: 250 };
const SECTIONS = { planning: [3, 5, 6, 7, 8], copy: [3, 4, 6, 7], visual: [9] };
const PRECEDENCE = '법·가드레일 > 플랫폼 하드제약 > 채널 SOUL > 브랜드 공용 > 모델 재량';

function validChannel(ch) { return !!(channelRegistry.REGISTRY[ch] && ch !== 'etc'); }
function clientPath(dir, ch) { return path.join(dir, 'context', 'souls', `${ch}.md`); }
function starterPath(ch) { return path.join(STARTER_DIR, `${ch}.md`); }

// soul 텍스트 읽기 — 클라이언트 정본 우선, 없으면 스타터. origin으로 출처를 알린다.
function read(dir, ch) {
  if (!validChannel(ch)) return { text: '', origin: null };
  try {
    const t = fs.readFileSync(clientPath(dir, ch), 'utf8');
    if (t.trim()) return { text: t, origin: 'client' };
  } catch { /* 클라이언트 정본 없음 */ }
  try { return { text: fs.readFileSync(starterPath(ch), 'utf8'), origin: 'starter' }; }
  catch { return { text: '', origin: null }; }
}

function save(dir, ch, text) {
  if (!validChannel(ch)) return { ok: false, error: '알 수 없는 채널입니다' };
  const p = clientPath(dir, ch);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, String(text || '').slice(0, 12000));
  fs.renameSync(tmp, p);
  return { ok: true, channel: ch, origin: 'client' };
}

// 클라이언트 정본 삭제 → 스타터로 복귀
function reset(dir, ch) {
  if (!validChannel(ch)) return { ok: false, error: '알 수 없는 채널입니다' };
  try { fs.rmSync(clientPath(dir, ch), { force: true }); } catch { /* 없음 */ }
  return { ok: true, channel: ch, origin: 'starter' };
}

function list(dir) {
  return Object.keys(channelRegistry.REGISTRY).filter(validChannel).map((ch) => {
    const { origin } = read(dir, ch);
    return { channel: ch, name: channelRegistry.REGISTRY[ch].name, origin };
  });
}

// "## 1. 화자" 형식의 번호 섹션으로 분해 — {1: '...', 2: '...'}
function sections(text) {
  const out = {};
  const parts = String(text || '').split(/^##\s+/m);
  for (const p of parts) {
    const m = p.match(/^(\d+)[.)]?\s*[^\n]*\n([\s\S]*)$/);
    if (m) out[Number(m[1])] = m[2].trim();
  }
  return out;
}

// 지정 섹션들을 합쳐 캡까지 — 섹션 단위로 넣다가 캡을 넘기는 섹션에서 중단(문장 중간 절단 최소화),
// 첫 섹션부터 넘치면 하드 절단. 어떤 경우에도 반환 길이 ≤ cap (불변식).
function pick(text, keys, cap) {
  const sec = sections(text);
  let out = '';
  for (const k of keys) {
    const body = sec[k];
    if (!body) continue;
    const piece = (out ? '\n' : '') + body;
    if (out.length + piece.length > cap) { if (!out) out = piece.slice(0, cap); break; }
    out += piece;
  }
  return out.slice(0, cap);
}

// 주입 대상 채널 — 메인(primary) 채널 + 클라이언트가 직접 soul을 쓴 채널.
// 전 채널 9종을 다 실으면 기획 프롬프트가 편성에 없는 채널 지침으로 붐빈다.
function targetChannels(dir) {
  const primary = Object.entries(channelRegistry.REGISTRY)
    .filter(([k, v]) => k !== 'etc' && v.primary).map(([k]) => k);
  const out = [...primary];
  for (const ch of Object.keys(channelRegistry.REGISTRY).filter(validChannel)) {
    if (!out.includes(ch)) { try { if (fs.existsSync(clientPath(dir, ch))) out.push(ch); } catch { /* skip */ } }
  }
  return out;
}

function block(dir, channels, kind, label) {
  const chs = (channels && channels.length ? channels : targetChannels(dir)).filter(validChannel);
  const rows = [];
  for (const ch of chs) {
    const { text, origin } = read(dir, ch);
    if (!text) continue;
    const body = pick(text, SECTIONS[kind], CAPS[kind]);
    if (!body.trim()) continue;
    const name = channelRegistry.REGISTRY[ch].name;
    rows.push(`· ${name}(${ch})${origin === 'client' ? ' — 클라이언트 정의' : ''}:\n${body}`);
  }
  if (!rows.length) return '';
  return `[채널 SOUL — ${label} · 우선순위: ${PRECEDENCE}]\n${rows.join('\n\n')}\n\n`;
}

// 기획(캘린더)용 — 임무·필러 배분·훅·금지·성공지표. 편성 자체를 바꾸는 제약이다.
function planningBlock(dir, channels) { return block(dir, channels, 'planning', '기획 반영(각 채널의 임무·배분·금지가 편성 제약이다)'); }
// 카피용 — 임무·문장 규약·훅·금지. 각 채널 담당 작성엔 해당 채널 줄만 전달하라.
function copyBlock(dir, channels) {
  const b = block(dir, channels, 'copy', '카피 반영');
  return b ? b.replace('\n\n', '\n각 채널 담당 copywriter에게는 해당 채널 줄만 전달하라 — 다른 채널 규약을 섞지 마라.\n\n') : '';
}
// 이미지 컴파일용 — §9(무엇을 찍는가)만, 단일 채널. 포스트마다 곱해지므로 가장 얇다.
function visualBlock(dir, channel) {
  if (!validChannel(channel)) return '';
  const { text } = read(dir, channel);
  if (!text) return '';
  return pick(text, SECTIONS.visual, CAPS.visual);
}

module.exports = { read, save, reset, list, sections, pick, targetChannels, planningBlock, copyBlock, visualBlock, CAPS, SECTIONS, PRECEDENCE };
