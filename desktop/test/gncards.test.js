// gncards.js — 카드형 라우팅·슬라이드 계약 파싱·결정론 조판·대비 게이트.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const gncards = require('../lib/gncards');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'gncards-'));

test('isCardFormat — 카드·인포·데이터 신호만 카드 레인, 사진 캐러셀·일반 포맷은 제외', () => {
  for (const f of ['카드뉴스 6장', 'cardnews', '비교표', '인포그래픽', '데이터 카드', '차트', '체크리스트', 'listicle']) {
    assert.equal(gncards.isCardFormat(f), true, `카드형이어야: ${f}`);
  }
  for (const f of ['carousel', '캐러셀 5장', 'single', '피드', 'story', 'reel', '', null]) {
    assert.equal(gncards.isCardFormat(f), false, `사진형이어야: ${f}`);
  }
});

test('contrastRatio — WCAG 흑백 21, 동일색 1, 잘못된 입력 null', () => {
  assert.equal(Math.round(gncards.contrastRatio('#000000', '#ffffff')), 21);
  assert.equal(gncards.contrastRatio('#888888', '#888888'), 1);
  assert.equal(gncards.contrastRatio('nope', '#ffffff'), null);
});

test('tokensFor — 브랜드 팔레트에서 배경·악센트 추출, 대비 미달 악센트는 기본값으로 보정', () => {
  const dir = tmp();
  // 브랜드 없음 → 라이트 기본 + 기본 악센트, 본문 대비 4.5 이상 보장
  const t0 = gncards.tokensFor(dir);
  assert.ok(gncards.contrastRatio(t0.fg, t0.bg) >= 4.5);
  assert.ok(gncards.contrastRatio(t0.accent, t0.bg) >= 3);
  // 어두운 배경 + 대비 좋은 악센트가 브랜드에 있으면 그대로 채택
  const sheets = path.join(dir, 'context', 'channel-sheets');
  fs.mkdirSync(sheets, { recursive: true });
  fs.writeFileSync(path.join(sheets, '_brand.json'), JSON.stringify({ brand: '팔레트: #14161a 배경, #e8b168 골드 악센트' }));
  const t1 = gncards.tokensFor(dir);
  assert.equal(t1.bg, '#14161a');
  assert.equal(t1.accent, '#e8b168');
  assert.ok(gncards.contrastRatio(t1.fg, t1.bg) >= 4.5);
  // 중간톤만 있는 팔레트 → 배경으로 안 쓰고 기본 배경 유지
  fs.writeFileSync(path.join(sheets, '_brand.json'), JSON.stringify({ brand: '#888888 #999999' }));
  const t2 = gncards.tokensFor(dir);
  assert.notEqual(t2.bg, '#888888');
});

test('parseSlides — 평문·잡텍스트·claude {result} 래핑 파싱, 글자 예산 절단, 타입 보정', () => {
  const json = JSON.stringify({ slides: [
    { type: 'cover', title: '커피가 잠을 깨우는 진짜 원리', kicker: 'coffee science' },
    { type: 'list', title: '체크리스트', bullets: ['아데노신 수용체 차단', '반감기 5시간', ''] },
    { type: 'stat', title: '수치', stat: { value: '73%', label: '성인 카페인 섭취 비율' } },
    { type: 'bars', title: '비교', bars: [{ label: '아메리카노', value: 125 }, { label: '콜드브루', value: 200 }] },
    { type: 'end', title: '오늘 마지막 잔은 2시 전에', body: '수면의 질이 달라집니다' },
  ] });
  let s = gncards.parseSlides(json);
  assert.equal(s.length, 5);
  assert.equal(s[1].bullets.length, 2); // 빈 불릿 제거
  assert.equal(s[3].bars[1].value, 200);
  // 잡텍스트 + claude {result} 래핑
  s = gncards.parseSlides('결과:\n' + json);
  assert.equal(s.length, 5);
  s = gncards.parseSlides(JSON.stringify({ result: json }));
  assert.equal(s.length, 5);
  // 글자 예산 절단 — title 40자
  const long = gncards.parseSlides(JSON.stringify({ slides: [{ type: 'cover', title: 'x'.repeat(100) }] }));
  assert.equal(long[0].title.length, gncards.BUDGET.title);
  // 미지의 타입은 point로 보정, 파싱 불가·빈 배열은 null
  assert.equal(gncards.parseSlides(JSON.stringify({ slides: [{ type: 'wat', title: 'T' }] }))[0].type, 'point');
  assert.equal(gncards.parseSlides('nope'), null);
  assert.equal(gncards.parseSlides(JSON.stringify({ slides: [] })), null);
});

test('renderCardHtml — self-contained 조판(외부 참조 0), 진행표시·핸들·데이터 표기', () => {
  const tokens = { bg: '#faf8f4', fg: '#1c1a17', muted: '#6f6a61', line: '#e4dfd4', accent: '#b4541e', handle: '@moveementlab' };
  const htmls = gncards.renderAllHtml([
    { type: 'cover', kicker: 'PILATES', title: '허리가 아픈 사람의 운동 순서' },
    { type: 'bars', title: '카페인 비교', bars: [{ label: '아메리카노', value: 125 }, { label: '콜드브루', value: 200 }] },
    { type: 'end', title: '저장해 두세요', body: '다음 글에서 이어집니다' },
  ], tokens, { w: 1080, h: 1350 });
  assert.equal(htmls.length, 3);
  // 외부 리소스 참조 없음 — CSP(default-src 'none')와 정합
  for (const h of htmls) {
    assert.doesNotMatch(h, /https?:\/\//);
    assert.doesNotMatch(h, /<script/i);
  }
  assert.match(htmls[0], /허리가 아픈 사람의 운동 순서/);
  assert.match(htmls[1], /02 \/ 03/);          // 진행표시(표지 제외)
  assert.doesNotMatch(htmls[0], /01 \/ 03/);   // 표지엔 진행표시 없음
  assert.match(htmls[1], />200</);             // 표시 문자열 = 데이터 그대로
  assert.match(htmls[2], /@moveementlab/);     // 핸들 푸터
  assert.match(htmls[2], /더 보기/);           // 엔딩 CTA
  // XSS 이스케이프
  const x = gncards.renderCardHtml({ type: 'point', title: '<img src=x>' }, tokens, { w: 1080, h: 1350 });
  assert.doesNotMatch(x, /<img/);
});

test('buildSlidesPrompt — 장수·예산·JSON 계약 요구, 수치 날조 금지 명시', () => {
  const p = gncards.buildSlidesPrompt({ prompt: '커피 원두 이야기', count: 6 }, '따뜻한 미니멀');
  assert.match(p, /6장/);
  assert.match(p, /"slides"/);
  assert.match(p, /날조 금지/);
  assert.match(p, /따뜻한 미니멀/);
  assert.match(p, new RegExp(`title ${gncards.BUDGET.title}자`));
});
