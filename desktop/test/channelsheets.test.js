// channelsheets.js — 채널별 마스터/캐릭터 시트 저장·락·컴파일 주입.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const channelsheets = require('../lib/channelsheets');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'chsheets-'));

test('save/get — 저장 후 되읽기, 미지의 채널은 거부', () => {
  const dir = tmp();
  const r = channelsheets.save(dir, 'instagram', { master: '따뜻한 미니멀 #F5F1E8', character: '바리스타 1인' });
  assert.equal(r.ok, true);
  assert.equal(r.channel, 'instagram');
  const s = channelsheets.get(dir, 'instagram');
  assert.equal(s.master, '따뜻한 미니멀 #F5F1E8');
  assert.equal(s.character, '바리스타 1인');
  assert.equal(s.locked, false);
  assert.ok(s.updatedAt);
  // 파일 위치 확인
  assert.equal(fs.existsSync(path.join(channelsheets.sheetsDir(dir), 'instagram.json')), true);
  // 미지의 채널 / etc 는 저장 거부
  assert.equal(channelsheets.save(dir, 'etc', { master: 'x' }).ok, false);
  assert.equal(channelsheets.save(dir, 'myspace', { master: 'x' }).ok, false);
});

test('save — 부분 갱신은 기존 필드를 보존하고 길이 제한', () => {
  const dir = tmp();
  channelsheets.save(dir, 'threads', { master: 'M1', character: 'C1' });
  // master만 갱신 — character 보존
  channelsheets.save(dir, 'threads', { master: 'M2' });
  const s = channelsheets.get(dir, 'threads');
  assert.equal(s.master, 'M2');
  assert.equal(s.character, 'C1');
  // 4000자 초과는 절단
  const big = 'x'.repeat(5000);
  channelsheets.save(dir, 'threads', { master: big });
  assert.equal(channelsheets.get(dir, 'threads').master.length, 4000);
});

test('setLock — 저장 안 된 채널은 락 거부, 저장 후 락/해제 토글', () => {
  const dir = tmp();
  assert.equal(channelsheets.setLock(dir, 'naver', true).ok, false); // 내용 없음
  channelsheets.save(dir, 'naver', { master: '정보 보조컷' });
  assert.equal(channelsheets.setLock(dir, 'naver', true).ok, true);
  assert.equal(channelsheets.get(dir, 'naver').locked, true);
  assert.equal(channelsheets.setLock(dir, 'naver', false).ok, true);
  assert.equal(channelsheets.get(dir, 'naver').locked, false);
});

test('compileDirective — 락 걸린 채널만 주입, 아니면 빈 문자열', () => {
  const dir = tmp();
  // 미작성 채널
  assert.equal(channelsheets.compileDirective(dir, 'instagram'), '');
  // 저장했지만 락 안 함 → 빈 문자열
  channelsheets.save(dir, 'instagram', { master: '팔레트 #F5F1E8 크림', character: '바리스타 1인, visible pores' });
  assert.equal(channelsheets.compileDirective(dir, 'instagram'), '');
  // 락 → 주입 텍스트에 마스터·캐릭터·우선순위 문구 포함
  channelsheets.setLock(dir, 'instagram', true);
  const out = channelsheets.compileDirective(dir, 'instagram');
  assert.match(out, /채널 시트 락인/);
  assert.match(out, /instagram/);
  assert.match(out, /마스터 시트/);
  assert.match(out, /캐릭터 시트/);
  assert.match(out, /#F5F1E8 크림/);
  assert.match(out, /바리스타 1인/);
  assert.match(out, /우선/); // 플랫폼 방향보다 우선한다는 지시
});

test('compileDirective — 락은 걸렸지만 시트가 비면 빈 문자열', () => {
  const dir = tmp();
  channelsheets.save(dir, 'instagram', { master: '내용' });
  channelsheets.setLock(dir, 'instagram', true);
  // 내용을 공백으로 비운 뒤에도 락 유지 → 주입할 게 없으면 ''
  channelsheets.save(dir, 'instagram', { master: '   ', character: '' });
  assert.equal(channelsheets.compileDirective(dir, 'instagram'), '');
});

test('list — etc 제외, 전 채널 요약(has/locked)', () => {
  const dir = tmp();
  channelsheets.save(dir, 'instagram', { master: 'M' });
  channelsheets.setLock(dir, 'instagram', true);
  const l = channelsheets.list(dir);
  assert.ok(l.length >= 5);
  assert.ok(!l.some((x) => x.channel === 'etc'));
  const ig = l.find((x) => x.channel === 'instagram');
  assert.equal(ig.has, true);
  assert.equal(ig.locked, true);
  assert.equal(ig.name, '인스타그램');
  const th = l.find((x) => x.channel === 'threads');
  assert.equal(th.has, false);
  assert.equal(th.locked, false);
});

test('draftPrompt — 브랜드·플랫폼 재료를 넣고 JSON 출력 형식을 요구', () => {
  const p = channelsheets.draftPrompt(
    { summary: '따뜻한 미니멀', palette: ['#F5F1E8', '#1C1A17'], photography: '자연광' },
    'instagram', '인스타그램', 'aspirational editorial hero frame');
  assert.match(p, /인스타그램/);
  assert.match(p, /#F5F1E8 #1C1A17/);
  assert.match(p, /따뜻한 미니멀/);
  assert.match(p, /aspirational editorial hero frame/);
  assert.match(p, /"master"/);
  assert.match(p, /"character"/);
});

test('parseDraft — 평문 JSON / 코드펜스 감싼 JSON / claude {result} 래핑 모두 파싱', () => {
  // 평문
  let d = channelsheets.parseDraft('{"master":"M","character":"C"}');
  assert.deepEqual(d, { master: 'M', character: 'C' });
  // 잡텍스트에 섞인 JSON
  d = channelsheets.parseDraft('여기 결과입니다:\n{"master":"MM","character":"CC"}\n끝');
  assert.deepEqual(d, { master: 'MM', character: 'CC' });
  // claude json 모드 {result:"<inner json string>"} 래핑
  d = channelsheets.parseDraft(JSON.stringify({ result: '{"master":"RM","character":"RC"}' }));
  assert.deepEqual(d, { master: 'RM', character: 'RC' });
  // 파싱 불가 / 빈 시트
  assert.equal(channelsheets.parseDraft('nope'), null);
  assert.equal(channelsheets.parseDraft('{"master":"","character":""}'), null);
});

test('save 원자성 — .tmp 잔여물 없이 최종 파일만 남는다', () => {
  const dir = tmp();
  channelsheets.save(dir, 'kakao_channel', { master: 'M' });
  const files = fs.readdirSync(channelsheets.sheetsDir(dir));
  assert.deepEqual(files, ['kakao_channel.json']); // .tmp 없음
});
