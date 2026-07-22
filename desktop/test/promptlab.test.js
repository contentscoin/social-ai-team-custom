// promptlab.js — 스타일 프리셋이 컴파일 결과 프롬프트에 반영되는지(빠른 svg 패스스루 경로).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const promptlab = require('../lib/promptlab');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'promptlab-'));

test('compile — 스타일 프리셋이 프롬프트 앞에 명시된다(svg 패스스루, 엔진 호출 없음)', async () => {
  const dir = tmp();
  const r = await promptlab.compile(dir, { provider: 'claude-svg', prompt: 'a latte cup on a table', style: 'infographic' });
  assert.equal(r.ok, true);
  assert.match(r.prompt, /infographic/i);      // 스타일 지시어가 붙었다
  assert.match(r.prompt, /latte cup/i);         // 원 프롬프트 유지
  assert.equal(r.style, 'infographic');
});

test('platformDirective — 채널별 방향 주입, 영상/미지정은 빈 문자열', () => {
  const ig = promptlab._platformDirective('instagram', 'image');
  assert.match(ig, /aspirational editorial/i);
  assert.match(ig, /최우선 축/);
  const nb = promptlab._platformDirective('naver', 'image');
  assert.match(nb, /informative supporting/i);
  assert.equal(promptlab._platformDirective('instagram', 'video'), ''); // 영상 제외
  assert.equal(promptlab._platformDirective('unknown', 'image'), '');    // 미지정 채널
});

test('PLATFORM_DIRECTION — 공냥 철칙(SD어휘·무대지정 배제, 인물 피부질감)', () => {
  const banned = ['masterpiece', 'best quality', '8k', '4k', 'uhd', 'ultra-detailed', 'highly detailed', 'professional', 'polished', 'magazine-cover'];
  for (const [ch, d] of Object.entries(promptlab.PLATFORM_DIRECTION)) {
    const low = d.toLowerCase();
    for (const bad of banned) assert.equal(low.includes(bad), false, `${ch}에 금지어 "${bad}"`);
  }
  // 인물 노출 채널엔 자연 피부 질감(철칙7)
  for (const ch of ['instagram', 'facebook', 'linkedin', 'x']) {
    assert.match(promptlab.PLATFORM_DIRECTION[ch], /natural skin texture/i, `${ch} 피부질감 누락`);
  }
});

test('compile — photoreal 프리셋도 실제 적용된다(품질꼬리 단어 충돌로 무시되지 않음)', async () => {
  const dir = tmp();
  // 프롬프트에 이미 'photorealistic finish'가 들어가도 실사형 지시어 전체가 붙어야 한다
  const r = await promptlab.compile(dir, { provider: 'claude-svg', prompt: 'a cup, photorealistic finish', style: 'photoreal' });
  assert.equal(r.ok, true);
  assert.equal(r.style, 'photoreal');
  assert.match(r.prompt, /realistic photography/i); // 첫 단어만이 아니라 지시어 전체가 반영
});

test('compile — 무효 스타일은 무시(프롬프트 원본 유지)', async () => {
  const dir = tmp();
  const r = await promptlab.compile(dir, { provider: 'claude-svg', prompt: 'a latte cup', style: 'bogus' });
  assert.equal(r.ok, true);
  assert.equal(r.prompt, 'a latte cup');
  assert.equal(r.style, undefined);
});
