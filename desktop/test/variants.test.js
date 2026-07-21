// variants.js — 시안 저장·목록·선택(승격)·정리 테스트.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const variants = require('../lib/variants');
const autovisual = require('../lib/autovisual');
const { inferCount } = autovisual;

const tmpWorkspace = () => fs.mkdtempSync(path.join(os.tmpdir(), 'variants-test-'));

test('ensure → list — 시안은 variants/<uid>/ 아래에만, 정렬된 목록', () => {
  const dir = tmpWorkspace();
  const vdir = variants.ensure(dir, 'ig-1');
  fs.writeFileSync(path.join(vdir, 'v2.png'), 'b');
  fs.writeFileSync(path.join(vdir, 'v1.png'), 'a');
  fs.writeFileSync(path.join(vdir, 'notes.txt'), 'x'); // 이미지 아님 — 제외
  const items = variants.list(dir, 'ig-1');
  assert.deepEqual(items.map((v) => v.name), ['v1.png', 'v2.png']);
  assert.equal(items[0].rel, 'outputs/creatives/variants/ig-1/v1.png');
});

test('pick — 선택한 시안이 <uid>_<slot>으로 승격되고 기존 슬롯 파일은 교체된다', () => {
  const dir = tmpWorkspace();
  const vdir = variants.ensure(dir, 'ig-1');
  fs.writeFileSync(path.join(vdir, 'v1.png'), 'new-image');
  // 기존 슬롯 파일(다른 확장자)이 남아 있으면 보드가 옛 이미지를 잡는다 — 교체돼야 한다
  fs.mkdirSync(path.join(dir, 'outputs', 'creatives'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'outputs', 'creatives', 'ig-1_1.webp'), 'old');
  const r = variants.pick(dir, 'ig-1', 'v1.png');
  assert.equal(r.ok, true);
  assert.equal(r.rel, 'outputs/creatives/ig-1_1.png');
  assert.equal(fs.readFileSync(path.join(dir, r.rel), 'utf8'), 'new-image');
  assert.equal(fs.existsSync(path.join(dir, 'outputs', 'creatives', 'ig-1_1.webp')), false);
  // 시안 원본은 남는다 — 다른 안으로 바꿔 고를 수 있게
  assert.equal(fs.existsSync(path.join(vdir, 'v1.png')), true);
});

test('pick — 없는 시안·경로 이탈 이름은 거부', () => {
  const dir = tmpWorkspace();
  variants.ensure(dir, 'ig-1');
  assert.equal(variants.pick(dir, 'ig-1', 'nope.png').ok, false);
  assert.equal(variants.pick(dir, '../../etc', 'v1.png').ok, false);
});

test('clear — 시안 라운드 정리', () => {
  const dir = tmpWorkspace();
  const vdir = variants.ensure(dir, 'ig-1');
  fs.writeFileSync(path.join(vdir, 'v1.png'), 'a');
  variants.clear(dir, 'ig-1');
  assert.deepEqual(variants.list(dir, 'ig-1'), []);
});

test('inferCount — 멀티이미지가 기본, 명시 포맷은 존중', () => {
  assert.equal(inferCount({ format: '' }, 3), 3); // 기본 = 여러 장
  assert.equal(inferCount({ format: 'multi-image (2-4 images)' }, 3), 4);
  assert.equal(inferCount({ format: 'carousel' }, 3), 5);
  assert.equal(inferCount({ format: 'single image' }, 3), 1); // 기획자가 단일을 명시하면 1장
  assert.equal(inferCount({ format: 'reel' }, 3), 3);
});
