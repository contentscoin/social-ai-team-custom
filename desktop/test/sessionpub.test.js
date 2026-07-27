// sessionpub.js — 세션 브라우저 발행의 순수 헬퍼(electron 없이 테스트 가능한 부분).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sessionpub = require('../lib/sessionpub');

test('isBrowserChannel / cfgFor — 네이버·카카오만 브라우저 채널', () => {
  assert.equal(sessionpub.isBrowserChannel('naver'), true);
  assert.equal(sessionpub.isBrowserChannel('kakao_channel'), true);
  assert.equal(sessionpub.isBrowserChannel('instagram'), false);
  assert.equal(sessionpub.isBrowserChannel('threads'), false);
  assert.ok(sessionpub.cfgFor('naver').partition.startsWith('persist:'));
  assert.equal(sessionpub.cfgFor('nope'), null);
});

test('isLoggedInFromCookies — 인증 쿠키가 값과 함께 있으면 로그인', () => {
  // 네이버
  assert.equal(sessionpub.isLoggedInFromCookies('naver', [{ name: 'NID_AUT', value: 'abc' }]), true);
  assert.equal(sessionpub.isLoggedInFromCookies('naver', [{ name: 'NID_AUT', value: '' }]), false); // 빈 값 무시
  assert.equal(sessionpub.isLoggedInFromCookies('naver', [{ name: 'OTHER', value: 'x' }]), false);
  assert.equal(sessionpub.isLoggedInFromCookies('naver', []), false);
  // 카카오
  assert.equal(sessionpub.isLoggedInFromCookies('kakao_channel', [{ name: '_kawlt', value: 'tok' }]), true);
  assert.equal(sessionpub.isLoggedInFromCookies('kakao_channel', [{ name: 'NID_AUT', value: 'x' }]), false); // 채널 불일치
  // 미지원 채널
  assert.equal(sessionpub.isLoggedInFromCookies('instagram', [{ name: 'sessionid', value: 'x' }]), false);
});

test('buildComposeState — 워크스페이스 안의 존재하는 이미지만 절대경로로, 상한 20', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sessionpub-'));
  const cr = path.join(dir, 'outputs', 'creatives');
  fs.mkdirSync(cr, { recursive: true });
  fs.writeFileSync(path.join(cr, 'a.png'), 'x');
  fs.writeFileSync(path.join(cr, 'b.png'), 'x');
  const st = sessionpub.buildComposeState(dir, {
    title: '제목', text: '본문입니다',
    imageRels: ['outputs/creatives/a.png', 'outputs/creatives/b.png', 'outputs/creatives/missing.png', '../../etc/passwd'],
  });
  assert.equal(st.title, '제목');
  assert.equal(st.text, '본문입니다');
  assert.equal(st.images.length, 2); // 존재하는 2장만, 없는 파일·경로이탈 제외
  assert.ok(st.images[0].endsWith('a.png'));
  assert.ok(path.isAbsolute(st.images[0]));
  // 단일 imageRel도 수용
  const st2 = sessionpub.buildComposeState(dir, { text: 't', imageRel: 'outputs/creatives/a.png' });
  assert.equal(st2.images.length, 1);
});

test('composeInjector — 제목을 담은 JS 문자열을 만들고, throw 하지 않도록 try/catch로 감싼다', () => {
  const js = sessionpub.composeInjector('naver', { title: '헤드라인"위험', text: 'body' });
  assert.match(js, /try\{/);
  assert.match(js, /catch/);
  assert.match(js, /헤드라인/); // 제목이 JSON.stringify로 안전하게 삽입
  assert.doesNotMatch(js, /\n\s*throw /);
});

test('kakaoWriteUrl — 공개 주소·프로필 ID·관리자 URL 정규화, 카카오 밖 도메인 거부', () => {
  const f = sessionpub.kakaoWriteUrl;
  assert.equal(f('https://pf.kakao.com/_abc123'), 'https://center-pf.kakao.com/profiles/_abc123/posts');
  assert.equal(f('pf.kakao.com/_abc123'), null); // 스킴 없는 건 ID 규칙에도 안 맞음 — 거부
  assert.equal(f('_abc123'), 'https://center-pf.kakao.com/profiles/_abc123/posts');
  assert.equal(f('@_abc123'), 'https://center-pf.kakao.com/profiles/_abc123/posts');
  assert.equal(f('https://center-pf.kakao.com/profiles/_abc123/posts'), 'https://center-pf.kakao.com/profiles/_abc123/posts');
  assert.equal(f('https://evil.example.com/phish'), null); // 카카오 밖 도메인 — 세션 창 오픈 금지
  assert.equal(f(''), null);
});

test('publish-config — 클라이언트별 카카오 채널 주소 저장·되읽기', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spubcfg-'));
  assert.deepEqual(sessionpub.getPubConfig(dir), {});
  const r = sessionpub.savePubConfig(dir, { kakaoChannel: 'https://pf.kakao.com/_golfpay' });
  assert.equal(r.ok, true);
  assert.equal(sessionpub.getPubConfig(dir).kakaoChannel, 'https://pf.kakao.com/_golfpay');
  // 부분 갱신 — 다른 키 보존 구조(현재는 kakaoChannel 하나지만 병합 규약 확인)
  sessionpub.savePubConfig(dir, {});
  assert.equal(sessionpub.getPubConfig(dir).kakaoChannel, 'https://pf.kakao.com/_golfpay');
});
