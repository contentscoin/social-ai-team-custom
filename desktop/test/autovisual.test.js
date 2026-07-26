// autovisual.js — 일괄 렌더의 조기 중단(이미지 엔진 다운 시 61개를 갈지 않음) + 동일 창작물 재사용.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
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

test('renderAll — 같은 주제·사이즈는 재생성 대신 재사용(복사, 실제 생성 1회)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'autovis-'));
  fs.mkdirSync(path.join(dir, 'outputs', 'creatives'), { recursive: true });
  let calls = 0;
  const fakeRender = {
    defaultImageProvider: () => 'ima2', warmupImageProvider: async () => ({ ok: true }), _isInfraFailure: () => false,
    generate: async (d, job) => {
      calls++;
      const rel = `outputs/creatives/${job.base}.png`;
      fs.writeFileSync(path.join(d, rel), 'PNG');
      return { ok: true, rel, files: [rel] };
    },
  };
  // 두 채널이 같은 주제·포맷(→같은 size)·장수 → 두 번째는 복사 재사용
  const posts = [
    { uid: 'instagram-1', chId: 'ig', n: 1, channel: 'instagram', lane: 'captions', isReel: false, stage: 'copy', files: [], format: 'single image', topic: '여름 신메뉴' },
    { uid: 'threads-1', chId: 'th', n: 1, channel: 'threads', lane: 'threads', isReel: false, stage: 'copy', files: [], format: 'single image', topic: '여름 신메뉴' },
  ];
  const r = await autovisual.renderAll(dir, {
    provider: 'ima2', ima2: true, count: 1,
    _render: fakeRender, _promptlab: fakePL, _board: { buildBoard: () => ({ posts }) },
  }, () => {});
  assert.equal(r.rendered, 2);   // 둘 다 이미지 확보
  assert.equal(calls, 1);        // 실제 생성은 1회 — 두 번째는 재사용
  assert.equal(r.results[1].reused, true);
  assert.equal(fs.existsSync(path.join(dir, 'outputs', 'creatives', 'th-1.png')), true); // 복사본 존재
});

test('renderAll — reuse:false면 재사용하지 않고 각각 생성', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'autovis-'));
  fs.mkdirSync(path.join(dir, 'outputs', 'creatives'), { recursive: true });
  let calls = 0;
  const fakeRender = {
    defaultImageProvider: () => 'ima2', warmupImageProvider: async () => ({ ok: true }), _isInfraFailure: () => false,
    generate: async (d, job) => { calls++; const rel = `outputs/creatives/${job.base}.png`; fs.writeFileSync(path.join(d, rel), 'PNG'); return { ok: true, rel, files: [rel] }; },
  };
  const posts = [
    { uid: 'instagram-1', chId: 'ig', n: 1, channel: 'instagram', lane: 'captions', isReel: false, stage: 'copy', files: [], format: 'single image', topic: '여름 신메뉴' },
    { uid: 'threads-1', chId: 'th', n: 1, channel: 'threads', lane: 'threads', isReel: false, stage: 'copy', files: [], format: 'single image', topic: '여름 신메뉴' },
  ];
  const r = await autovisual.renderAll(dir, {
    provider: 'ima2', ima2: true, count: 1, reuse: false,
    _render: fakeRender, _promptlab: fakePL, _board: { buildBoard: () => ({ posts }) },
  }, () => {});
  assert.equal(calls, 2); // 재사용 끔 → 각각 생성
  assert.equal(r.rendered, 2);
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

test('renderAll — 예열 실패(서버 안 뜸) 시 codex 없으면 즉시 중단(생성 0회), 있으면 codex로 전환', async () => {
  // codex 없음 → 죽은 서버로 배치를 두드리지 않고 0회 호출로 중단
  let calls = 0;
  const downRender = {
    defaultImageProvider: () => 'ima2',
    warmupImageProvider: async () => ({ ok: false, reason: 'ima2 serve가 뜨지 않습니다' }),
    _isInfraFailure: () => true,
    generate: async () => { calls++; return { ok: false, error: 'x' }; },
  };
  const r = await autovisual.renderAll('/tmp/x', {
    provider: 'ima2', ima2: true,
    _render: downRender, _promptlab: fakePL, _board: { buildBoard: () => ({ posts: mkPosts(5) }) },
  }, () => {});
  assert.equal(r.ok, false);
  assert.equal(r.providerDown, true);
  assert.equal(calls, 0); // 예전엔 2포스트 × 5회를 두드린 뒤에야 중단했다
  assert.match(r.resultText, /뜨지 않습니다/); // 원인이 결과 문구에 보인다
  // codex 가용 → 배치 전체를 codex 레인으로 전환해 진행
  const jobs = [];
  const downButCodex = {
    ...downRender,
    generate: async (d, job) => { jobs.push(job.provider); return { ok: true, rel: `outputs/creatives/${job.base}.png`, files: [`outputs/creatives/${job.base}.png`] }; },
  };
  const r2 = await autovisual.renderAll('/tmp/x', {
    provider: 'ima2', ima2: true, codex: true,
    _render: downButCodex, _promptlab: fakePL, _board: { buildBoard: () => ({ posts: mkPosts(3) }) },
  }, () => {});
  assert.equal(r2.ok, true);
  assert.equal(r2.provider, 'codex');
  assert.ok(jobs.every((p) => p === 'codex'));
});
