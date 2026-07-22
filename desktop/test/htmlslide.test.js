// htmlslide.js — 애니메이션 슬라이드 HTML 생성(순수) 테스트. 오프스크린 캡처는 Electron 런타임 필요라 제외.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const hs = require('../lib/htmlslide');

test('slideHtml — 한글 텍스트가 그대로 들어가고 치수는 aspect 기준', () => {
  const html = hs.slideHtml({ head: '3초면 끝', sub: '홈카페 라떼 아트' }, { aspect: '9:16' });
  assert.match(html, /3초면 끝/);
  assert.match(html, /홈카페 라떼 아트/);
  assert.match(html, /width:1080px; height:1920px/);
  assert.match(html, /Noto Sans KR/); // 한글 폰트 폴백
});

test('slideHtml — 애니메이션 seek 훅과 진행값(--p) 구동', () => {
  const html = hs.slideHtml({ head: 'x', sub: 'y' }, {});
  assert.match(html, /window\.__seek\s*=\s*function/); // 프레임 seek 훅
  assert.match(html, /--p/);                            // 진행값 변수로 구동
  assert.match(html, /--enter/);                        // 진입 전환 변수
  assert.match(html, /clamp\(0, calc\(\(var\(--p\)/);   // 요소 등장이 --p 함수
  assert.match(html, /class="progress"/);               // 진행바
});

test('slideHtml — 카드뉴스 불릿 순차 등장(각 불릿에 --b 임계값)', () => {
  const html = hs.slideHtml({ head: '핵심 3가지', bullets: ['첫째 요점', '둘째 요점', '셋째 요점'] }, {});
  assert.match(html, /첫째 요점/);
  assert.match(html, /둘째 요점/);
  assert.match(html, /셋째 요점/);
  // 각 불릿은 서로 다른 진행 임계값(--b)에서 켜진다
  const bs = [...html.matchAll(/--b:([0-9.]+)/g)].map((m) => Number(m[1]));
  assert.equal(bs.length, 3);
  assert.ok(bs[0] < bs[1] && bs[1] < bs[2], '불릿 임계값이 순차 증가해야 한다');
});

test('slideHtml — kicker/역할/도트 인디케이터', () => {
  const html = hs.slideHtml({ kicker: '카페 운영 팁', head: '오픈 3개월' }, { index: 2, total: 5 });
  assert.match(html, /카페 운영 팁/);
  assert.match(html, /class="kicker"/);
  assert.match(html, /class="dots"/);                   // total>1이면 슬라이드 도트
  assert.equal((html.match(/<i class=/g) || []).length, 5); // 5개 도트
});

test('slideHtml — 텍스트 이스케이프(매니페스트 주입 방지)', () => {
  const html = hs.slideHtml({ head: '<script>alert(1)</script>', sub: 'a & b "x"', bullets: ['<b>x</b>'] }, {});
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /a &amp; b/);
  assert.match(html, /&lt;b&gt;x&lt;\/b&gt;/); // 불릿도 이스케이프
});

test('slideHtml — 이미지 있으면 켄번스 배경+scrim, 없으면 브랜드색 그라디언트', () => {
  const withImg = hs.slideHtml({ head: 'x', image: { abs: '/w/s1.png' } }, { brand: { primary: '#ff0066' } });
  assert.match(withImg, /class="bg"/);
  assert.match(withImg, /url\("file:\/\/\/w\/s1\.png"\)/);
  assert.match(withImg, /class="scrim"/);
  assert.match(withImg, /scale\(calc\(1\.05 \+ 0\.09 \* var\(--kb\)\)\)/); // 켄번스 기본 모션
  const noImg = hs.slideHtml({ head: 'x' }, { brand: { primary: 'ff0066' } });
  assert.match(noImg, /radial-gradient\(120% 100% at 50% 0%, #ff0066/); // # 없어도 정규화
  assert.doesNotMatch(noImg, /class="bg"/);
});

test('slideHtml — 모션 프리셋: static은 배경 트랜스폼 없음, panLeft는 이동', () => {
  const stat = hs.slideHtml({ head: 'x', motion: 'static', image: { abs: '/w/s.png' } }, {});
  assert.match(stat, /scale\(calc\(1 \+ 0 \* var\(--kb\)\)\)/); // 확대·이동 0
  const pan = hs.slideHtml({ head: 'x', motion: 'panLeft', image: { abs: '/w/s.png' } }, { aspect: '9:16' });
  assert.match(pan, /translate3d\(calc\(49px \* var\(--kb\)\)/); // 1080*0.045=48.6→49px 팬 이동
});

test('slideHtml — 잘못된 brand.primary는 안전 기본색으로', () => {
  const html = hs.slideHtml({ head: 'x' }, { brand: { primary: 'red; }body{display:none' } });
  assert.doesNotMatch(html, /display:none/); // CSS 주입 차단
  assert.match(html, /#111111/);
});

test('motionParams — hasImg=false면 정지, kenburns는 확대+이동', () => {
  assert.deepEqual(hs.motionParams('kenburns', false, 1080, 1920), { base: 1, dScale: 0, dx: 0, dy: 0 });
  const kb = hs.motionParams('kenburns', true, 1080, 1920);
  assert.ok(kb.dScale > 0 && kb.dy !== 0);
});

test('fileUrl — 윈도우 역슬래시·공백·해시 안전', () => {
  assert.equal(hs.fileUrl('C:\\a b\\s#1.png'), 'file:///C:/a%20b/s%231.png');
  assert.equal(hs.fileUrl(null), null);
});
