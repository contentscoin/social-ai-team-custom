// render.js — 자동 캐스케이드의 실패 분류·폴백 순위 테스트.
// 실제 프로바이더 호출 없이 순수 헬퍼와 "키 없음 → 즉시 err" 경로만 검증한다.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.SAT_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'render-test-'));
delete process.env.OPENAI_API_KEY; // 환경 키가 availability를 오염시키지 않게
const render = require('../lib/render');
const secrets = require('../lib/secrets');

test('실패 분류 — 인프라성(키·크레딧·네트워크·429/5xx)만 폴백 대상', () => {
  for (const m of [
    'OpenAI API 키가 없습니다 — 설정 → 렌더에서 입력하세요',
    'X API 크레딧이 부족합니다',
    'HTTP 429', 'HTTP 503', 'quota exceeded',
    'fetch failed', 'connect ECONNREFUSED', 'ETIMEDOUT', 'The operation was aborted',
    "✗ server unreachable — is 'ima2 serve' running?", // ima2 서버 다운 → 인프라(폴백/조기중단 대상)
  ]) assert.equal(render._isInfraFailure(m), true, m);
  for (const m of [
    'safety system이 프롬프트를 거부했습니다',
    'content_policy_violation',
    '이미지를 만들지 못했습니다',
    '알 수 없는 프로바이더',
  ]) assert.equal(render._isInfraFailure(m), false, m);
});

test('ima2GenArgs — 서버 URL 지정 시 --server 인자 추가, 미지정 시 기본', () => {
  assert.deepEqual(render._ima2GenArgs('p', '/tmp/x', ''), ['gen', 'p', '-d', '/tmp/x', '--quality', 'high']);
  assert.deepEqual(render._ima2GenArgs('p', '/tmp/x', 'http://127.0.0.1:3333'),
    ['gen', 'p', '-d', '/tmp/x', '--quality', 'high', '--server', 'http://127.0.0.1:3333']);
});

test('ima2GenArgs — 레퍼런스 이미지는 --ref로 각각 추가(최대 5장)', () => {
  assert.deepEqual(render._ima2GenArgs('p', '/tmp/x', '', ['/w/a.png', '/w/b.png']),
    ['gen', 'p', '-d', '/tmp/x', '--quality', 'high', '--ref', '/w/a.png', '--ref', '/w/b.png']);
  // 6장 이상은 5장으로 절단
  const many = ['1', '2', '3', '4', '5', '6', '7'].map((n) => `/w/${n}.png`);
  const args = render._ima2GenArgs('p', '/tmp/x', '', many);
  assert.equal(args.filter((a) => a === '--ref').length, 5);
  // refs 미지정/빈배열이면 --ref 없음
  assert.doesNotMatch(render._ima2GenArgs('p', '/tmp/x', '').join(' '), /--ref/);
});

test('폴백 순위 — 가용 프로바이더만, 시도한 것과 claude-svg는 제외', () => {
  // 키가 하나도 없으면 이미지 폴백 후보 없음 (claude-svg는 항상 가용하지만 타이포 레인이라 제외)
  assert.deepEqual(render._fallbackRank('image', {}, ['openai-image']), []);
  // ima2 환경이 감지되면 후보에 들어온다
  assert.deepEqual(render._fallbackRank('image', { ima2: true }, ['openai-image']), ['ima2']);
  // 이미 시도한 프로바이더는 다시 나오지 않는다
  assert.deepEqual(render._fallbackRank('image', { ima2: true }, ['openai-image', 'ima2']), []);
  // secrets에 comfyui가 설정되면 우선순위 순서(ima2 → comfyui)로 나온다
  secrets.set('comfyui', { url: 'http://localhost:8188', workflowPath: '/wf.json' });
  assert.deepEqual(render._fallbackRank('image', { ima2: true }, ['openai-image']), ['ima2', 'comfyui']);
  secrets.set('comfyui', { url: '', workflowPath: '' }); // 정리
});

test('generate — 폴백 후보가 없으면 원래 오류를 그대로 반환 (홉 표기 없음)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'render-ws-'));
  // openai-image는 키가 없어 네트워크 호출 전에 err를 반환한다
  const r = await render.generate(dir, { kind: 'image', provider: 'openai-image', base: 'ig-1', prompt: 'p' }, null);
  assert.equal(r.ok, false);
  assert.match(r.error, /API 키가 없습니다/);
  assert.equal('tried' in r, false); // 폴백 시도 자체가 없었다
});

test('generate — noFallback이면 인프라 실패여도 캐스케이드하지 않는다', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'render-ws-'));
  const r = await render.generate(dir, { kind: 'image', provider: 'openai-image', base: 'ig-1', prompt: 'p', noFallback: true, env: { ima2: true } }, null);
  assert.equal(r.ok, false);
  assert.equal('tried' in r, false);
});

test('generate — 알 수 없는 프로바이더는 즉시 반환', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'render-ws-'));
  const r = await render.generate(dir, { kind: 'image', provider: 'nope', base: 'x', prompt: 'p' }, null);
  assert.equal(r.ok, false);
  assert.match(r.error, /알 수 없는 프로바이더/);
});

test.after(() => { delete process.env.SAT_HOME; });
