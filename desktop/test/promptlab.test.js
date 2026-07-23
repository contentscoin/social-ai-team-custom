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

test('packContext — 광고 팩은 광고 신호(목표/포맷)일 때만 포함, 일반 이미지엔 미포함', () => {
  // 내장 광고 팩(packs/ad-campaign-pack.md)이 광고 신호에서 로드되는지 — 이름 매칭으로 확인
  const plain = promptlab.packContext('image', 12000, { objective: '일상 브이로그 소개', format: 'single-image' });
  assert.doesNotMatch(plain, /광고·캠페인 프롬프트 팩/);
  const ad = promptlab.packContext('image', 12000, { objective: '전환 · 구매 유도', format: 'promotion' });
  assert.match(ad, /광고·캠페인 프롬프트 팩/);
  // 명시 플래그로도 켜진다
  const ad2 = promptlab.packContext('image', 12000, { ad: true });
  assert.match(ad2, /광고·캠페인 프롬프트 팩/);
  // 영상 kind엔 광고 팩을 강제로 넣지 않는다(영상 팩 레인)
  const vid = promptlab.packContext('video', 12000, { objective: '광고 캠페인' });
  assert.doesNotMatch(vid, /광고·캠페인 프롬프트 팩/);
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

test('shotRecipe — 결정론적(같은 시드=같은 레시피), 시드가 다르면 대체로 분산', () => {
  assert.ok(promptlab.SHOT_RECIPES.length >= 6);
  // 같은 시드 → 같은 레시피
  assert.equal(promptlab.shotRecipe('ig-1').key, promptlab.shotRecipe('ig-1').key);
  // 여러 시드에 걸쳐 최소 절반 이상의 레시피가 등장(단조 방지 효과)
  const seen = new Set(['ig-1', 'ig-2', 'ig-3', 'ig-4', 'ig-5', 'th-1', 'nb-2', 'fb-3'].map((s) => promptlab.shotRecipe(s).key));
  assert.ok(seen.size >= 4, `분산 부족: ${seen.size}종`);
});

test('shotFraming — 같은 포스트의 슬라이드는 서로 다른 프레이밍으로 회전', () => {
  const f0 = promptlab.shotFraming(0, 'ig-1');
  const f1 = promptlab.shotFraming(1, 'ig-1');
  const f2 = promptlab.shotFraming(2, 'ig-1');
  assert.notEqual(f0.key, f1.key); // 인접 슬라이드는 프레이밍이 다르다
  assert.notEqual(f1.key, f2.key);
});

test('varietyDirective — 컷 변주 블록에 레시피와 반복금지 지시, 영상은 빈 문자열', () => {
  const v = promptlab._varietyDirective({ kind: 'image', channel: 'instagram', topic: '라떼', varietySeed: 'ig-1' });
  assert.match(v, /컷 변주/);
  assert.match(v, /뚜렷이 달라야/);
  assert.equal(promptlab._varietyDirective({ kind: 'video', channel: 'instagram', topic: '라떼' }), '');
});
