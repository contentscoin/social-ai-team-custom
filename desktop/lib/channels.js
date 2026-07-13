// 채널 레지스트리 — UI·보드·발행·OpenCrab 전략이 공유하는 단일 진실
// 메인 채널(한국 시장): 인스타그램, 스레드, 네이버 블로그, 네이버 클립, 카카오채널

/** @type {readonly string[]} */
const PRIMARY_CHANNELS = Object.freeze([
  'instagram',
  'threads',
  'naver',
  'naver_clip',
  'kakao_channel',
]);

/** @type {Record<string, { name: string, mono: string, chId: string, lane: string, publishRoute: 'api'|'manual', primary?: boolean }>} */
const REGISTRY = Object.freeze({
  instagram: { name: '인스타그램', mono: 'IG', chId: 'ig', lane: 'captions', publishRoute: 'manual', primary: true },
  threads: { name: '스레드', mono: 'TH', chId: 'th', lane: 'threads', publishRoute: 'api', primary: true },
  naver: { name: '네이버 블로그', mono: 'NB', chId: 'nb', lane: 'naver', publishRoute: 'manual', primary: true },
  naver_clip: { name: '네이버 클립', mono: 'NC', chId: 'nc', lane: 'naver_clip', publishRoute: 'manual', primary: true },
  kakao_channel: { name: '카카오채널', mono: 'KK', chId: 'kk', lane: 'kakao', publishRoute: 'manual', primary: true },
  facebook: { name: '페이스북', mono: 'FB', chId: 'fb', lane: 'captions', publishRoute: 'api' },
  linkedin: { name: '링크드인', mono: 'IN', chId: 'li', lane: 'linkedin', publishRoute: 'api' },
  x: { name: 'X', mono: 'X', chId: 'x', lane: 'x', publishRoute: 'api' },
  tiktok: { name: '틱톡', mono: 'TT', chId: 'tt', lane: 'captions', publishRoute: 'manual' },
  etc: { name: '기타', mono: '?', chId: 'etc', lane: 'captions', publishRoute: 'manual' },
});

const ID_PLATFORM = Object.freeze({
  IG: 'Instagram',
  FB: 'Facebook',
  LI: 'LinkedIn',
  LN: 'LinkedIn',
  IN: 'LinkedIn',
  TH: 'Threads',
  X: 'X',
  NB: 'Naver Blog',
  NV: 'Naver Blog',
  NC: 'Naver Clip',
  KK: 'Kakao Channel',
  TT: 'TikTok',
});

function channelKey(platform) {
  const p = String(platform || '').toLowerCase();
  if (/instagram|인스타/.test(p)) return 'instagram';
  if (/threads|스레드|쓰레드/.test(p)) return 'threads';
  if (/네이버\s*클립|naver\s*clip|클립/.test(p)) return 'naver_clip';
  if (/카카오|kakao/.test(p)) return 'kakao_channel';
  if (/네이버\s*블로그|naver\s*blog|^naver$|네이버/.test(p)) return 'naver';
  if (/facebook|페이스북/.test(p)) return 'facebook';
  if (/linkedin|링크드/.test(p)) return 'linkedin';
  if (/tiktok|틱톡/.test(p)) return 'tiktok';
  if (/twitter|^x\b|(^|\W)x(\W|$)/.test(p)) return 'x';
  return 'etc';
}

function laneOf(platform) {
  const key = channelKey(platform);
  return (REGISTRY[key] && REGISTRY[key].lane) || 'captions';
}

function chIdOf(platform) {
  const key = channelKey(platform);
  return (REGISTRY[key] && REGISTRY[key].chId) || 'etc';
}

function publishRouteOf(key) {
  return (REGISTRY[key] && REGISTRY[key].publishRoute) || 'manual';
}

function sortChannels(channels) {
  const order = (k) => {
    const i = PRIMARY_CHANNELS.indexOf(k);
    return i >= 0 ? i : 100 + k.charCodeAt(0);
  };
  return [...channels].sort((a, b) => order(a.key) - order(b.key) || b.posts - a.posts);
}

function namesForRenderer() {
  const CH_NAME = {};
  const CH_MONO = {};
  for (const [k, v] of Object.entries(REGISTRY)) {
    CH_NAME[k] = v.name;
    CH_MONO[k] = v.mono;
  }
  return { CH_NAME, CH_MONO, PRIMARY_CHANNELS };
}

module.exports = {
  PRIMARY_CHANNELS,
  REGISTRY,
  ID_PLATFORM,
  channelKey,
  laneOf,
  chIdOf,
  publishRouteOf,
  sortChannels,
  namesForRenderer,
};
