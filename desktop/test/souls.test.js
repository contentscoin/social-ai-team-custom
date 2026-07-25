// souls.js — 채널 SOUL: 스타터 폴백·클라이언트 오버라이드·섹션 선택 주입·하드캡 불변식.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const souls = require('../lib/souls');
const channels = require('../lib/channels');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'souls-'));

test('스타터 폴백 — 전 채널(etc 제외)에 스타터가 존재하고 read가 starter origin으로 돌려준다', () => {
  const dir = tmp();
  for (const ch of Object.keys(channels.REGISTRY).filter((c) => c !== 'etc')) {
    const r = souls.read(dir, ch);
    assert.equal(r.origin, 'starter', `${ch} 스타터 누락`);
    assert.ok(r.text.length > 500, `${ch} 스타터가 너무 짧음`);
    // 9섹션 골격 — 주입 대상 섹션(3·4·6·7·8·9)이 전부 있어야 한다
    const sec = souls.sections(r.text);
    for (const n of [3, 4, 6, 7, 8, 9]) assert.ok(sec[n], `${ch} §${n} 누락`);
  }
  assert.equal(souls.read(dir, 'etc').origin, null);
  assert.equal(souls.read(dir, 'myspace').origin, null);
});

test('클라이언트 오버라이드 — save 후 client origin, reset 후 starter 복귀', () => {
  const dir = tmp();
  const r = souls.save(dir, 'instagram', '## 3. 임무\n동네 단골 만들기\n\n## 4. 문장 규약\n해요체');
  assert.equal(r.ok, true);
  const got = souls.read(dir, 'instagram');
  assert.equal(got.origin, 'client');
  assert.match(got.text, /동네 단골/);
  // list에 origin 반영
  assert.equal(souls.list(dir).find((x) => x.channel === 'instagram').origin, 'client');
  // reset → 스타터 복귀
  souls.reset(dir, 'instagram');
  assert.equal(souls.read(dir, 'instagram').origin, 'starter');
  // 미지의 채널 거부
  assert.equal(souls.save(dir, 'myspace', 'x').ok, false);
});

test('하드캡 불변식 — soul이 아무리 두꺼워져도 주입량은 캡 이하 (planning 900 · copy 700 · visual 250)', () => {
  const dir = tmp();
  // 섹션마다 1,200자짜리 비대한 soul을 저장 (save의 파일 상한 12,000자 안에서 전 섹션 유지)
  const fat = [3, 4, 5, 6, 7, 8, 9].map((n) => `## ${n}. 섹션${n}\n${'가'.repeat(1200)}`).join('\n\n');
  souls.save(dir, 'instagram', fat);
  const p = souls.pick(fat, souls.SECTIONS.planning, souls.CAPS.planning);
  const c = souls.pick(fat, souls.SECTIONS.copy, souls.CAPS.copy);
  const v = souls.visualBlock(dir, 'instagram');
  assert.ok(p.length <= souls.CAPS.planning, `planning ${p.length} > ${souls.CAPS.planning}`);
  assert.ok(c.length <= souls.CAPS.copy, `copy ${c.length} > ${souls.CAPS.copy}`);
  assert.ok(v.length <= souls.CAPS.visual, `visual ${v.length} > ${souls.CAPS.visual}`);
  assert.ok(v.length > 0);
  // 스타터들도 캡 안에서 의미 있는 양이 나온다
  for (const ch of ['instagram', 'threads', 'naver']) {
    const { text } = souls.read(tmp(), ch);
    assert.ok(souls.pick(text, souls.SECTIONS.copy, souls.CAPS.copy).length > 100, `${ch} copy 주입이 빈약`);
  }
});

test('섹션 선택 — planning은 §3·5·6·7·8, copy는 §3·4·6·7, visual은 §9만', () => {
  const text = [3, 4, 5, 6, 7, 8, 9].map((n) => `## ${n}. 제목${n}\n내용${n}`).join('\n\n');
  const p = souls.pick(text, souls.SECTIONS.planning, 900);
  assert.match(p, /내용3/); assert.match(p, /내용5/); assert.match(p, /내용8/);
  assert.doesNotMatch(p, /내용4/); assert.doesNotMatch(p, /내용9/);
  const c = souls.pick(text, souls.SECTIONS.copy, 700);
  assert.match(c, /내용4/); assert.doesNotMatch(c, /내용5/); assert.doesNotMatch(c, /내용9/);
  const v = souls.pick(text, souls.SECTIONS.visual, 250);
  assert.equal(v, '내용9');
});

test('블록 조립 — primary 채널 + 클라이언트 정의 채널만, 우선순위 헤더, copy엔 채널 격리 지시', () => {
  const dir = tmp();
  const pb = souls.planningBlock(dir);
  assert.match(pb, /채널 SOUL/);
  assert.match(pb, /우선순위/);
  assert.match(pb, /인스타그램\(instagram\)/);
  assert.match(pb, /카카오/); // primary 채널 포함
  assert.doesNotMatch(pb, /\(linkedin\)/); // 비주력·오버라이드 없음 → 제외
  // linkedin에 클라이언트 soul을 쓰면 대상에 들어온다
  souls.save(dir, 'linkedin', '## 3. 임무\nB2B 신뢰 구축');
  assert.match(souls.planningBlock(dir), /\(linkedin\) — 클라이언트 정의/);
  // copyBlock엔 채널 격리 지시
  assert.match(souls.copyBlock(dir), /해당 채널 줄만 전달/);
});

test('strategy.digest — channel-*.md 요약 연결, 파일 없으면 빈 문자열', () => {
  const strategy = require('../lib/strategy');
  const dir = tmp();
  assert.equal(strategy.digest(dir), '');
  const sdir = path.join(dir, 'context', 'strategy');
  fs.mkdirSync(sdir, { recursive: true });
  fs.writeFileSync(path.join(sdir, 'channel-instagram.md'), '# 인스타 전략\n\n동경형 화보 피드로 발견을 만든다.\n' + 'x'.repeat(1000));
  fs.writeFileSync(path.join(sdir, 'topic-menu.md'), '주제 전략 — digest 대상 아님');
  const d = strategy.digest(dir, 200);
  assert.match(d, /채널 전략 요약/);
  assert.match(d, /instagram/);
  assert.match(d, /동경형 화보/);
  assert.doesNotMatch(d, /digest 대상 아님/); // topic-*은 제외
  // 파일당 캡 — 200자 + 라벨 이내
  assert.ok(d.length < 400);
});
