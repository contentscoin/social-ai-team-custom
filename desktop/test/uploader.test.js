// uploader.js — 콘텐츠 타입 판별·API 베이스 유추 테스트 (네트워크 경로 제외).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

function freshUploader(home) {
  process.env.SAT_HOME = home;
  delete require.cache[require.resolve('../lib/uploader')];
  delete require.cache[require.resolve('../lib/secrets')];
  return require('../lib/uploader');
}
const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'uploader-test-'));

test('contentTypeOf — 확장자 기반 판별, 미지원은 null', () => {
  const uploader = freshUploader(tmpDir());
  assert.equal(uploader.contentTypeOf('/x/ig-1.PNG'), 'image/png');
  assert.equal(uploader.contentTypeOf('a.jpeg'), 'image/jpeg');
  assert.equal(uploader.contentTypeOf('clip.mp4'), 'video/mp4');
  assert.equal(uploader.contentTypeOf('doc.svg'), null);
});

test('apiBase — apiUrl 우선, 없으면 MCP URL에서 /mcp 제거, 둘 다 없으면 기본 게이트웨이', () => {
  const home = tmpDir();
  const uploader = freshUploader(home);
  const secrets = require('../lib/secrets');
  assert.equal(uploader._apiBase(), 'https://qrcoding-skill-mcp.vercel.app');
  secrets.set('qrcoding', { url: 'https://my-qr.example.com/mcp' });
  assert.equal(uploader._apiBase(), 'https://my-qr.example.com');
  secrets.set('qrcoding', { apiUrl: 'https://svc.example.com/' });
  assert.equal(uploader._apiBase(), 'https://svc.example.com');
});

test('uploadPublic — 키 없음·미지원 형식은 네트워크 전에 거부', async () => {
  const uploader = freshUploader(tmpDir());
  const noKey = await uploader.uploadPublic('/tmp/a.png');
  assert.equal(noKey.ok, false);
  assert.match(noKey.error, /API 키/);
  const secrets = require('../lib/secrets');
  secrets.set('qrcoding', { apiKey: 'qras_test' });
  const badType = await uploader.uploadPublic('/tmp/a.txt');
  assert.equal(badType.ok, false);
  assert.match(badType.error, /지원하지 않는 파일 형식/);
});

test.after(() => { delete process.env.SAT_HOME; });
