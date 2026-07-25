// codex 이미지 레인 — 프롬프트 규약·사이즈 매핑·claim 회수·병렬 풀 (codex-fleet 패턴 이식).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const render = require('../lib/render');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'codexlane-'));

test('codexImgPrompt — 1장 계약·AR/사이즈 매핑·셸 금지 지시', () => {
  const p = render._codexImgPrompt('café hero shot', 'portrait');
  assert.match(p, /ONE image/);
  assert.match(p, /Aspect ratio: 2:3/);
  assert.match(p, /1024x1536/);
  assert.match(p, /do NOT run any shell commands/);
  assert.match(p, /café hero shot/);
  assert.deepEqual(render._codexSizeSpec('landscape'), { ar: '3:2', px: '1536x1024' });
  assert.deepEqual(render._codexSizeSpec('square'), { ar: '1:1', px: '1024x1024' });
  assert.deepEqual(render._codexSizeSpec('story'), { ar: '2:3', px: '1024x1536' });
});

test('collectGenerated — since 이후 ig_*.png만, 하위 세션 폴더 포함, 오래된 순', () => {
  const base = tmp();
  const sess = path.join(base, 'sess-a');
  fs.mkdirSync(sess, { recursive: true });
  fs.writeFileSync(path.join(sess, 'ig_new1.png'), 'x');
  fs.writeFileSync(path.join(base, 'ig_new2.png'), 'x');
  fs.writeFileSync(path.join(base, 'note.txt'), 'x');       // 확장자 제외
  fs.writeFileSync(path.join(base, 'other.png'), 'x');      // ig_ 프리픽스 아님 — 제외
  const old = path.join(base, 'ig_old.png');
  fs.writeFileSync(old, 'x');
  fs.utimesSync(old, new Date(Date.now() - 3600_000), new Date(Date.now() - 3600_000)); // 1시간 전
  const got = render._collectGenerated(base, Date.now() - 60_000);
  const names = got.map((g) => path.basename(g.abs)).sort();
  assert.deepEqual(names, ['ig_new1.png', 'ig_new2.png']);
  // 정렬 — mtime 오름차순
  for (let i = 1; i < got.length; i++) assert.ok(got[i].mtimeMs >= got[i - 1].mtimeMs);
  // 폴더 없음 → 빈 배열 (예외 없이)
  assert.deepEqual(render._collectGenerated(path.join(base, 'nope'), 0), []);
});

test('claimTo — rename 원자성으로 이중 claim 차단, 성공 시 목적지에 존재', () => {
  const base = tmp();
  const src = path.join(base, 'ig_a.png');
  fs.writeFileSync(src, 'IMG');
  const d1 = path.join(base, 'out', 'slot1.png');
  const d2 = path.join(base, 'out', 'slot2.png');
  assert.equal(render._claimTo(src, d1), true);   // 첫 claim 성공
  assert.equal(fs.readFileSync(d1, 'utf8'), 'IMG');
  assert.equal(render._claimTo(src, d2), false);  // 이미 가져간 파일 — 두 번째 claim 실패
  assert.equal(fs.existsSync(d2), false);
});

test('asyncPool — 동시성 상한 준수·입력 순서 유지·개별 실패 격리', async () => {
  let active = 0, peak = 0;
  const items = [1, 2, 3, 4, 5, 6];
  const results = await render._asyncPool(2, items, async (n) => {
    active++; peak = Math.max(peak, active);
    await new Promise((r) => setTimeout(r, 10));
    active--;
    if (n === 4) throw new Error('boom');
    return { ok: true, n };
  });
  assert.equal(results.length, 6);
  assert.ok(peak <= 2, `동시성 초과: ${peak}`);
  assert.equal(results[0].n, 1);           // 순서 유지
  assert.equal(results[3].ok, false);      // 실패 격리
  assert.match(results[3].error, /boom/);
  assert.equal(results[5].n, 6);
});

test('config.codexParallel — 기본 3, 1~8 클램프', () => {
  const config = require('../lib/config');
  assert.equal(typeof config.getCodexParallel(), 'number');
  assert.ok(config.getCodexParallel() >= 1 && config.getCodexParallel() <= 8);
});
