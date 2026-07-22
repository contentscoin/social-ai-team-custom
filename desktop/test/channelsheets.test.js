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

test('compileDirective — 내용 있으면 락 없이도 스타일 가이드로 주입, 락하면 최우선으로 격상', () => {
  const dir = tmp();
  // 미작성 채널 → 빈 문자열
  assert.equal(channelsheets.compileDirective(dir, 'instagram'), '');
  // 저장(락 안 함) → 스타일 가이드로 주입(예전엔 락해야만 반영돼 "가이드 줘도 반영 안 됨" 문제였다)
  channelsheets.save(dir, 'instagram', { master: '팔레트 #F5F1E8 크림', character: '바리스타 1인, visible pores' });
  const guide = channelsheets.compileDirective(dir, 'instagram');
  assert.match(guide, /채널 스타일 가이드/);
  assert.match(guide, /#F5F1E8 크림/);
  assert.match(guide, /바리스타 1인/);
  assert.doesNotMatch(guide, /락인/); // 락 전엔 '락인'이 아니다
  // 락 → 최우선 격상(락인·우선 문구)
  channelsheets.setLock(dir, 'instagram', true);
  const out = channelsheets.compileDirective(dir, 'instagram');
  assert.match(out, /채널 시트 락인/);
  assert.match(out, /마스터 시트/);
  assert.match(out, /캐릭터 시트/);
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
  // 평문 (guidelines 미지정 시 '')
  let d = channelsheets.parseDraft('{"master":"M","character":"C"}');
  assert.deepEqual(d, { master: 'M', character: 'C', guidelines: '' });
  // 잡텍스트에 섞인 JSON
  d = channelsheets.parseDraft('여기 결과입니다:\n{"master":"MM","character":"CC"}\n끝');
  assert.deepEqual(d, { master: 'MM', character: 'CC', guidelines: '' });
  // claude json 모드 {result:"<inner json string>"} 래핑
  d = channelsheets.parseDraft(JSON.stringify({ result: '{"master":"RM","character":"RC"}' }));
  assert.deepEqual(d, { master: 'RM', character: 'RC', guidelines: '' });
  // 파싱 불가 / 빈 시트
  assert.equal(channelsheets.parseDraft('nope'), null);
  assert.equal(channelsheets.parseDraft('{"master":"","character":""}'), null);
});

test('guidelines(지침) — 저장·되읽기, compileDirective·draftPrompt·parseDraft에 반영', () => {
  const dir = tmp();
  channelsheets.save(dir, 'instagram', { master: 'M', guidelines: '반말 금지, 해시태그 3~5개' });
  assert.equal(channelsheets.get(dir, 'instagram').guidelines, '반말 금지, 해시태그 3~5개');
  // 락인하면 이미지 compileDirective에 지침 블록 포함
  channelsheets.setLock(dir, 'instagram', true);
  const out = channelsheets.compileDirective(dir, 'instagram');
  assert.match(out, /채널 지침 — 준수 규칙/);
  assert.match(out, /해시태그 3~5개/);
  // draftPrompt는 guidelines 필드를 요구, parseDraft는 파싱
  assert.match(channelsheets.draftPrompt({}, 'instagram', '인스타그램', ''), /"guidelines"/);
  const d = channelsheets.parseDraft('{"master":"M","character":"C","guidelines":"G"}');
  assert.deepEqual(d, { master: 'M', character: 'C', guidelines: 'G' });
  // guidelines만 있어도 parseDraft 성공(빈 시트 아님)
  assert.deepEqual(channelsheets.parseDraft('{"guidelines":"G"}'), { master: '', character: '', guidelines: 'G' });
});

test('refImages — 락인된 채널의 존재하는 레퍼런스만 abs로, 경로 탈출 차단, 락 안 되면 빈 배열', () => {
  const dir = tmp();
  const refsDir = path.join(channelsheets.sheetsDir(dir), 'refs');
  fs.mkdirSync(refsDir, { recursive: true });
  fs.writeFileSync(path.join(refsDir, 'c.png'), 'x');
  // 캐릭터 ref 존재, 마스터 ref는 없는 파일, anchorImage는 경로 탈출
  channelsheets.save(dir, 'instagram', {
    master: 'M', characterRef: 'context/channel-sheets/refs/c.png',
    masterRef: 'context/channel-sheets/refs/missing.png', anchorImage: '../../etc/passwd',
  });
  // 락 안 됐으면 빈 배열
  assert.deepEqual(channelsheets.refImages(dir, 'instagram'), []);
  channelsheets.setLock(dir, 'instagram', true);
  const refs = channelsheets.refImages(dir, 'instagram');
  assert.equal(refs.length, 1);              // 존재하는 캐릭터 ref만
  assert.ok(refs[0].endsWith('c.png'));
});

test('contentGuidelines — 락인된 채널 지침만 채널명과 함께 집계, 없으면 빈 문자열', () => {
  const dir = tmp();
  assert.equal(channelsheets.contentGuidelines(dir), '');
  channelsheets.save(dir, 'instagram', { guidelines: '존댓말만' });
  channelsheets.save(dir, 'threads', { guidelines: '질문형 훅' });
  // 저장만 하고 락 안 하면 집계 안 됨
  assert.equal(channelsheets.contentGuidelines(dir), '');
  channelsheets.setLock(dir, 'instagram', true);
  const block = channelsheets.contentGuidelines(dir);
  assert.match(block, /채널별 지침/);
  assert.match(block, /인스타그램\(instagram\): 존댓말만/);
  assert.doesNotMatch(block, /질문형 훅/); // threads는 락 안 됨 → 제외
});

test('save 원자성 — .tmp 잔여물 없이 최종 파일만 남는다', () => {
  const dir = tmp();
  channelsheets.save(dir, 'kakao_channel', { master: 'M' });
  const files = fs.readdirSync(channelsheets.sheetsDir(dir));
  assert.deepEqual(files, ['kakao_channel.json']); // .tmp 없음
});
