// imagestyles.js — 이미지 스타일 프리셋 목록/검증.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const imagestyles = require('../lib/imagestyles');

test('list — key/label 쌍만 노출(directive 비노출), 충분한 프리셋', () => {
  const l = imagestyles.list();
  assert.ok(l.length >= 6, '프리셋이 여러 개여야 한다');
  assert.ok(l.every((s) => s.key && s.label && s.directive === undefined));
  // 사용자가 요청한 대표 스타일이 포함되는지
  const keys = new Set(l.map((s) => s.key));
  for (const k of ['photoreal', 'infographic', 'animation', 'studio_photo', 'clean']) {
    assert.ok(keys.has(k), `프리셋 ${k} 필요`);
  }
});

test('isValid/directiveFor — 유효 키만', () => {
  assert.equal(imagestyles.isValid('photoreal'), true);
  assert.equal(imagestyles.isValid('nope'), false);
  assert.equal(imagestyles.isValid(''), false);
  assert.match(imagestyles.directiveFor('photoreal'), /photorealistic/i);
  assert.equal(imagestyles.directiveFor('nope'), '');
  assert.equal(imagestyles.labelFor('infographic'), '인포그래픽형');
});
