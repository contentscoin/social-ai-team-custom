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

test('compile — 무효 스타일은 무시(프롬프트 원본 유지)', async () => {
  const dir = tmp();
  const r = await promptlab.compile(dir, { provider: 'claude-svg', prompt: 'a latte cup', style: 'bogus' });
  assert.equal(r.ok, true);
  assert.equal(r.prompt, 'a latte cup');
  assert.equal(r.style, undefined);
});
