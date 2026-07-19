// htmlslide.js — 슬라이드 HTML 생성(순수) 테스트. 오프스크린 캡처는 Electron 런타임 필요라 제외.
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

test('slideHtml — 텍스트 이스케이프(매니페스트 주입 방지)', () => {
  const html = hs.slideHtml({ head: '<script>alert(1)</script>', sub: 'a & b "x"' }, {});
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /a &amp; b/);
});

test('slideHtml — 이미지 있으면 배경, 없으면 브랜드색 그라디언트', () => {
  const withImg = hs.slideHtml({ head: 'x', image: { abs: '/w/s1.png' } }, { brand: { primary: '#ff0066' } });
  assert.match(withImg, /url\("file:\/\/\/w\/s1\.png"\)/);
  assert.match(withImg, /onimg/);
  const noImg = hs.slideHtml({ head: 'x' }, { brand: { primary: 'ff0066' } });
  assert.match(noImg, /linear-gradient\(160deg, #ff0066/); // # 없어도 정규화
  assert.match(noImg, /solid/);
});

test('slideHtml — 잘못된 brand.primary는 안전 기본색으로', () => {
  const html = hs.slideHtml({ head: 'x' }, { brand: { primary: 'red; }body{display:none' } });
  assert.doesNotMatch(html, /display:none/); // CSS 주입 차단
  assert.match(html, /#111111/);
});

test('fileUrl — 윈도우 역슬래시·공백·해시 안전', () => {
  assert.equal(hs.fileUrl('C:\\a b\\s#1.png'), 'file:///C:/a%20b/s%231.png');
  assert.equal(hs.fileUrl(null), null);
});
