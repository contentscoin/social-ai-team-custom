// autovisual.js — 일괄 렌더의 조기 중단(이미지 엔진 다운 시 61개를 갈지 않음).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const autovisual = require('../lib/autovisual');

const mkPosts = (n) => Array.from({ length: n }, (_, i) => ({
  uid: `instagram-${i + 1}`, chId: 'ig', n: i + 1, channel: 'instagram', lane: 'captions',
  isReel: false, stage: 'copy', files: [], format: 'single image', topic: `주제${i + 1}`,
}));
const fakePL = { compile: async () => ({ ok: true, prompt: 'x' }) };

test('renderAll — 이미지 엔진 연결 실패가 연속되면 조기 중단(전체 안 갈고)', async () => {
  let calls = 0;
  const fakeRender = {
    defaultImageProvider: () => 'ima2',
    warmupImageProvider: async () => ({ ok: true }),
    _isInfraFailure: (e) => /unreachable/i.test(String(e)),
    generate: async () => { calls++; return { ok: false, error: "server unreachable — is 'ima2 serve' running?" }; },
  };
  const r = await autovisual.renderAll('/tmp/x', {
    provider: 'ima2', ima2: true,
    _render: fakeRender, _promptlab: fakePL, _board: { buildBoard: () => ({ posts: mkPosts(10) }) },
  }, () => {});
  assert.equal(r.ok, false);
  assert.equal(r.providerDown, true);
  assert.equal(calls, 2);           // 10개 안 갈고 2번째 인프라 실패에서 중단
  assert.equal(r.results.length, 2);
});

test('renderAll — 정상 프로바이더면 전 포스트 생성(조기중단 없음)', async () => {
  const fakeRender = {
    defaultImageProvider: () => 'ima2',
    warmupImageProvider: async () => ({ ok: true }),
    _isInfraFailure: () => false,
    generate: async (d, job) => ({ ok: true, rel: `outputs/creatives/${job.base}.png`, files: [`outputs/creatives/${job.base}.png`] }),
  };
  const r = await autovisual.renderAll('/tmp/x', {
    provider: 'ima2', ima2: true,
    _render: fakeRender, _promptlab: fakePL, _board: { buildBoard: () => ({ posts: mkPosts(3) }) },
  }, () => {});
  assert.equal(r.ok, true);
  assert.equal(r.rendered, 3);
  assert.equal(r.images, 3);
});

test('renderAll — 성공이 있으면 이후 인프라 실패에도 계속 진행(조기중단 안 함)', async () => {
  let i = 0;
  const fakeRender = {
    defaultImageProvider: () => 'ima2',
    warmupImageProvider: async () => ({ ok: true }),
    _isInfraFailure: (e) => /unreachable/i.test(String(e)),
    // 1번째 성공, 이후 전부 인프라 실패 — okCount>0라 조기중단 조건(연속2+ & okCount 0)에 안 걸린다
    generate: async (d, job) => (i++ === 0
      ? { ok: true, rel: `outputs/creatives/${job.base}.png`, files: [`outputs/creatives/${job.base}.png`] }
      : { ok: false, error: 'server unreachable' }),
  };
  const r = await autovisual.renderAll('/tmp/x', {
    provider: 'ima2', ima2: true,
    _render: fakeRender, _promptlab: fakePL, _board: { buildBoard: () => ({ posts: mkPosts(5) }) },
  }, () => {});
  assert.equal(r.providerDown, undefined); // 조기중단 안 함
  assert.equal(r.results.length, 5);       // 5개 전부 시도
  assert.equal(r.rendered, 1);
});
