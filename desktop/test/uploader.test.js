// uploader.js — 공개 이미지 호스트 프로바이더 레인(S3 SigV4 서명·키 정규화·공개 URL·폴백 선택).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const uploader = require('../lib/uploader');

test('signS3Put — AWS SigV4 규약(서명 헤더 구성·결정론), ACL은 옵션일 때만 서명에 포함', () => {
  const now = new Date('2026-07-26T12:00:00.000Z');
  const args = {
    endpoint: 'https://s3.ap-northeast-2.amazonaws.com', bucket: 'my-bucket', key: 'social/20260726/120000-a.png',
    region: 'ap-northeast-2', accessKeyId: 'AKIAEXAMPLE', secretAccessKey: 'SECRET',
    contentType: 'image/png', body: Buffer.from('PNGDATA'), now,
  };
  const r = uploader._signS3Put(args);
  assert.equal(r.url, 'https://s3.ap-northeast-2.amazonaws.com/my-bucket/social/20260726/120000-a.png');
  assert.equal(r.headers['x-amz-date'], '20260726T120000Z');
  assert.match(r.headers.authorization, /^AWS4-HMAC-SHA256 Credential=AKIAEXAMPLE\/20260726\/ap-northeast-2\/s3\/aws4_request/);
  assert.match(r.headers.authorization, /SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date/);
  assert.match(r.headers.authorization, /Signature=[0-9a-f]{64}$/);
  // payload 해시가 실제 바디의 sha256
  assert.equal(r.headers['x-amz-content-sha256'],
    require('crypto').createHash('sha256').update(args.body).digest('hex'));
  // 같은 입력 → 같은 서명(결정론), 바디가 바뀌면 서명도 바뀐다
  assert.equal(uploader._signS3Put(args).headers.authorization, r.headers.authorization);
  assert.notEqual(uploader._signS3Put({ ...args, body: Buffer.from('OTHER') }).headers.authorization, r.headers.authorization);
  // ACL 미지정이면 헤더·SignedHeaders에 없다 (ACL 끈 버킷에서 400 나던 함정 방지)
  assert.equal(r.headers['x-amz-acl'], undefined);
  const withAcl = uploader._signS3Put({ ...args, acl: 'public-read' });
  assert.equal(withAcl.headers['x-amz-acl'], 'public-read');
  assert.match(withAcl.headers.authorization, /SignedHeaders=content-type;host;x-amz-acl;x-amz-content-sha256;x-amz-date/);
});

test('safeKey — 안전 문자만 남기고 날짜 폴더로 분류(퍼센트 인코딩 회피)', () => {
  const k = uploader._safeKey('가을 신메뉴 (최종)!.png', '20260726T120000Z');
  assert.match(k, /^20260726\/120000-/);
  assert.match(k, /\.png$/);
  assert.doesNotMatch(k, /[^A-Za-z0-9._/-]/); // 한글·공백·괄호 제거됨
});

test('s3PublicUrl — publicBase 우선(커스텀 도메인/R2 공개 URL), 없으면 endpoint/bucket/key', () => {
  const key = 'social/20260726/a.png';
  assert.equal(uploader._s3PublicUrl({ publicBase: 'https://cdn.example.com/', endpoint: 'x', bucket: 'b' }, key),
    'https://cdn.example.com/social/20260726/a.png');
  assert.equal(uploader._s3PublicUrl({ endpoint: 'https://s3.ap-northeast-2.amazonaws.com/', bucket: 'b' }, key),
    'https://s3.ap-northeast-2.amazonaws.com/b/social/20260726/a.png');
});

test('contentTypeOf — 지원 확장자만, 그 외 null', () => {
  assert.equal(uploader.contentTypeOf('a.png'), 'image/png');
  assert.equal(uploader.contentTypeOf('a.JPG'), 'image/jpeg');
  assert.equal(uploader.contentTypeOf('a.mp4'), 'video/mp4');
  assert.equal(uploader.contentTypeOf('a.svg'), null);
  assert.equal(uploader.contentTypeOf(''), null);
});

test('호스트 미설정이면 uploadPublic이 설정 안내와 함께 실패(qrcoding 특정 요구 없음)', async () => {
  // 이 테스트 환경엔 시크릿이 없다 — 프로바이더 없음 상태의 계약 확인
  if (uploader.hostReady()) return; // 로컬에 실제 설정이 있으면 스킵
  assert.equal(uploader.activeProvider(), null);
  assert.deepEqual(uploader.hostStatus(), { ready: false, provider: null, label: '', video: false });
  const r = await uploader.uploadPublic('/tmp/nope.png');
  assert.equal(r.ok, false);
  assert.match(r.error, /S3 호환 스토리지|imgbb/); // 설정 경로를 안내
  assert.doesNotMatch(r.error, /qrcoding API 키가 없습니다/); // 더 이상 qrcoding을 특정하지 않는다
});
