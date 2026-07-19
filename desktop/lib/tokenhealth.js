// 토큰 수명 추적 — Meta 계열·LinkedIn 장수 토큰은 통상 60일 수명이라 조용히 죽는다.
// secrets.set()이 찍는 _savedAt 스탬프를 근거로 만료 임박/경과를 계산해
// 발행 패널 배지와 스케줄러 일일 경고에 공급한다.
// 페이스북 페이지 토큰(장수 사용자 토큰 파생)은 자동 만료가 없어 추적하지 않는다.
// X는 OAuth 1.0a 키라 만료 개념이 없다.
const secrets = require('./secrets');

const LIFETIMES = Object.freeze({ threads: 60, instagram: 60, linkedin: 60 });
const WARN_DAYS = 7;

// now 주입은 테스트 훅 — 프로덕션 호출은 인자 없이
function check(now) {
  const at = now instanceof Date ? now : new Date();
  const out = [];
  for (const [connector, limitDays] of Object.entries(LIFETIMES)) {
    const v = secrets.get(connector);
    if (!Object.keys(v).some((k) => !k.startsWith('_') && /token/i.test(k))) continue;
    const savedAt = v._savedAt ? new Date(v._savedAt) : null;
    if (!savedAt || Number.isNaN(savedAt.getTime())) {
      out.push({ connector, limitDays, savedAt: null, ageDays: null, daysLeft: null, level: 'unknown' });
      continue;
    }
    const ageDays = Math.floor((at - savedAt) / 86400000);
    const daysLeft = limitDays - ageDays;
    const level = daysLeft <= 0 ? 'expired' : daysLeft <= WARN_DAYS ? 'warn' : 'ok';
    out.push({ connector, limitDays, savedAt: v._savedAt, ageDays, daysLeft, level });
  }
  return out;
}

function warnings(now) {
  return check(now).filter((t) => t.level === 'expired' || t.level === 'warn');
}

function describe(t) {
  if (t.level === 'expired') {
    return `토큰이 만료됐을 수 있습니다 — 저장 후 ${t.ageDays}일 경과 (통상 수명 ${t.limitDays}일). 재발급 후 설정에 다시 저장하세요`;
  }
  if (t.level === 'warn') return `토큰 갱신 임박 — 약 ${t.daysLeft}일 남음 (통상 수명 ${t.limitDays}일)`;
  if (t.level === 'unknown') return '토큰 저장 시점 기록이 없어 만료를 추적하지 못합니다 — 설정에서 토큰을 다시 저장하면 추적이 시작됩니다';
  return null;
}

module.exports = { check, warnings, describe, WARN_DAYS, LIFETIMES };
