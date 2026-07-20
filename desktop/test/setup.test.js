// setup.js — 공냥 프롬프트 킷 설치가 git 없이(번들 사본으로) 동작하는지 검증.
// git 미설치 PC에서 "git이 없습니다"로 막히던 회귀를 방지한다.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

function freshSetup(home) {
  // os.homedir() 기준점을 임시 폴더로. POSIX는 HOME, Windows는 USERPROFILE을 읽으므로 둘 다 세팅.
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  process.env.SAT_SKIP_KIT_GIT = '1'; // git 최신화 단계를 강제로 끔(네트워크·환경 비의존)
  delete require.cache[require.resolve('../lib/setup')];
  return require('../lib/setup');
}

test('payloadPaths().imageKit — 번들된 공냥 킷 경로가 실재한다(SKILL.md 포함)', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'setup-kit-'));
  const setup = freshSetup(home);
  const p = setup.payloadPaths();
  assert.ok(p.imageKit, 'imageKit 경로가 노출되어야 한다');
  assert.ok(fs.existsSync(path.join(p.imageKit, 'SKILL.md')), '번들 킷에 SKILL.md가 있어야 한다');
});

test('installImagePromptKit — git 없이 번들 사본으로 설치된다', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'setup-kit-'));
  const setup = freshSetup(home);
  const r = await setup.installImagePromptKit();
  assert.equal(r.ok, true, '설치가 성공해야 한다');
  assert.equal(r.source, 'bundle', 'git 스킵 시 소스는 번들이어야 한다');
  const dst = path.join(home, '.claude', 'skills', 'image-prompt');
  assert.ok(fs.existsSync(path.join(dst, 'SKILL.md')), 'SKILL.md가 복사되어야 한다');
  // promptlab이 호출하는 검증기가 함께 복사되어야 한다
  assert.ok(fs.existsSync(path.join(dst, 'scripts', 'check_prompt.mjs')), '검증기가 복사되어야 한다');
});

test('imagePromptKitStatus — 설치 후 installed=true', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'setup-kit-'));
  const setup = freshSetup(home);
  assert.equal(setup.imagePromptKitStatus().installed, false); // 설치 전
  await setup.installImagePromptKit();
  assert.equal(setup.imagePromptKitStatus().installed, true);  // 설치 후
});

test.after(() => {
  delete process.env.HOME;
  delete process.env.USERPROFILE;
  delete process.env.SAT_SKIP_KIT_GIT;
});
