// qgates.js — AI 상투어 기계 게이트(스캔·리포트·verify 주입).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const qgates = require('../lib/qgates');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'qgates-'));

test('scanText — contain은 본문 어디서든, start는 문두에서만 잡는다', () => {
  // "알아보겠습니다"(contain) — 문장 중간에서도 검출
  let hits = qgates.scanText('오늘은 원두 보관법을 알아보겠습니다. 그리고 추출 온도도.');
  assert.ok(hits.some((h) => h.canon === '알아보겠습니다'));
  // "안녕하세요"(start) — 문두일 때만
  hits = qgates.scanText('안녕하세요 여러분');
  assert.ok(hits.some((h) => h.canon === '안녕하세요'));
  hits = qgates.scanText('그분이 안녕하세요 라고 인사했다');
  assert.ok(!hits.some((h) => h.canon === '안녕하세요'));
  // 변형형도 같은 canon으로 — "알아볼게요"
  hits = qgates.scanText('원두 보관법 알아볼게요');
  assert.ok(hits.some((h) => h.canon === '알아보겠습니다' && h.variant === '알아볼게요'));
  // 깨끗한 글은 0건
  assert.equal(qgates.scanText('원두는 냉동 보관이 정답이 아닙니다. 산패는 산소가 만듭니다.').length, 0);
});

test('report — outputs/ 카피만 스캔(창작물·프롬프트 로그 제외), 리포트 저장', () => {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, 'outputs', 'instagram'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'outputs', 'creatives'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'outputs', 'instagram', 'week1.md'), '이번 글에서는 원두 이야기를 해봅니다.\n좋은 원두란?');
  fs.writeFileSync(path.join(dir, 'outputs', 'instagram', 'clean.md'), '원두는 로스팅 후 2주가 절정입니다.');
  fs.writeFileSync(path.join(dir, 'outputs', 'creatives', 'prompts-used.md'), '이번 글에서는 — 프롬프트 로그라 제외돼야 함');
  const rep = qgates.report(dir);
  assert.equal(rep.total, 1);
  assert.equal(rep.files.length, 1);
  assert.equal(rep.files[0].rel, 'outputs/instagram/week1.md');
  // 리포트 파일 저장 확인
  const saved = JSON.parse(fs.readFileSync(path.join(dir, 'context', 'qgates-report.json'), 'utf8'));
  assert.equal(saved.total, 1);
  assert.equal(saved.gate, 'ai-tells');
});

test('verifyDirective — 히트가 있으면 파일·문구를 짚는 지시 블록, 없으면 빈 문자열', () => {
  const dir = tmp();
  assert.equal(qgates.verifyDirective(dir), ''); // 리포트 없음
  fs.mkdirSync(path.join(dir, 'outputs', 'threads'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'outputs', 'threads', 'post.md'), '오늘은 함께 살펴보겠습니다');
  qgates.report(dir);
  const d = qgates.verifyDirective(dir);
  assert.match(d, /기계 게이트/);
  assert.match(d, /outputs\/threads\/post\.md/);
  assert.match(d, /살펴보겠습니다/);
  assert.match(d, /다른 부분은 수정 금지/);
  // 깨끗해지면 다시 빈 문자열 ("핵심은"조차 사전에 있는 상투어라 피해서 쓴다 — 사전이 이 테스트 문장도 잡아냈다)
  fs.writeFileSync(path.join(dir, 'outputs', 'threads', 'post.md'), '반복 노출이 답입니다.');
  qgates.report(dir);
  assert.equal(qgates.verifyDirective(dir), '');
});
