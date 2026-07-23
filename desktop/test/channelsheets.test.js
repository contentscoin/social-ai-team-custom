// channelsheets.js — 채널별 마스터/캐릭터 시트 저장·락·컴파일 주입.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const channelsheets = require('../lib/channelsheets');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'chsheets-'));

test('save/get — 저장 후 되읽기(구 character는 characters[0]로 승격), 미지의 채널은 거부', () => {
  const dir = tmp();
  const r = channelsheets.save(dir, 'instagram', { master: '따뜻한 미니멀 #F5F1E8', character: '바리스타 1인' });
  assert.equal(r.ok, true);
  assert.equal(r.channel, 'instagram');
  const s = channelsheets.get(dir, 'instagram');
  assert.equal(s.master, '따뜻한 미니멀 #F5F1E8');
  assert.equal(s.characters[0].text, '바리스타 1인'); // 구 단일 character → characters[]
  assert.equal(s.locked, false);
  assert.ok(s.updatedAt);
  assert.equal(fs.existsSync(path.join(channelsheets.sheetsDir(dir), 'instagram.json')), true);
  // 미지의 채널 / etc 는 저장 거부
  assert.equal(channelsheets.save(dir, 'etc', { master: 'x' }).ok, false);
  assert.equal(channelsheets.save(dir, 'myspace', { master: 'x' }).ok, false);
});

test('save — 부분 갱신은 기존 필드를 보존하고 길이 제한', () => {
  const dir = tmp();
  channelsheets.save(dir, 'threads', { master: 'M1', character: 'C1' });
  // master만 갱신 — 캐릭터 보존
  channelsheets.save(dir, 'threads', { master: 'M2' });
  const s = channelsheets.get(dir, 'threads');
  assert.equal(s.master, 'M2');
  assert.equal(s.characters[0].text, 'C1');
  // 4000자 초과는 절단
  const big = 'x'.repeat(5000);
  channelsheets.save(dir, 'threads', { master: big });
  assert.equal(channelsheets.get(dir, 'threads').master.length, 4000);
});

test('여러 캐릭터 시트 — characters[] 저장·컴파일 주입·레퍼런스 앵커(락인 시)', () => {
  const dir = tmp();
  const refsDir = path.join(channelsheets.sheetsDir(dir), 'refs');
  fs.mkdirSync(refsDir, { recursive: true });
  fs.writeFileSync(path.join(refsDir, 'a.png'), 'x');
  fs.writeFileSync(path.join(refsDir, 'b.png'), 'x');
  fs.writeFileSync(path.join(refsDir, 'c.png'), 'x');
  channelsheets.save(dir, 'instagram', {
    master: '마스터 룩',
    characters: [
      { name: '바리스타 지은', text: '20대 여성 바리스타', ref: 'context/channel-sheets/refs/a.png' },
      { name: '시그니처 라떼', text: '라떼아트가 있는 잔', ref: 'context/channel-sheets/refs/b.png' },
      { name: '빈칸', text: '', ref: '' }, // 빈 항목은 제거
    ],
  });
  const s = channelsheets.get(dir, 'instagram');
  assert.equal(s.characters.length, 2); // 빈 항목 제거
  assert.equal(s.characters[1].name, '시그니처 라떼');
  // setCharacterRef — 특정 캐릭터의 ref 설정(다른 캐릭터와 겹치지 않게 c.png)
  channelsheets.setCharacterRef(dir, 'instagram', 0, 'context/channel-sheets/refs/c.png');
  assert.equal(channelsheets.get(dir, 'instagram').characters[0].ref, 'context/channel-sheets/refs/c.png');
  // 락인 → 컴파일에 두 캐릭터 모두 주입, 레퍼런스 2장 앵커
  channelsheets.setLock(dir, 'instagram', true);
  const out = channelsheets.compileDirective(dir, 'instagram');
  assert.match(out, /바리스타 지은/);
  assert.match(out, /시그니처 라떼/);
  assert.equal(channelsheets.refImages(dir, 'instagram').length, 2);
  // 최대 5개까지만
  channelsheets.save(dir, 'instagram', { characters: Array.from({ length: 8 }, (_, i) => ({ name: `C${i}`, text: `t${i}` })) });
  assert.equal(channelsheets.get(dir, 'instagram').characters.length, 5);
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
  assert.match(out, /브랜드 시트/);
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
  assert.match(p, /"characters"/);
});

test('draftPrompt — 채널별 캐릭터 개수·구성 권장을 주입(1~3개 상한)', () => {
  // 모든 등록 채널 가이드에 캐릭터 구성(chars)이 정의돼 있다
  for (const [ch, g] of Object.entries(channelsheets.CHANNEL_SHEET_GUIDE)) {
    assert.ok(g.chars && /개/.test(g.chars), `캐릭터 구성 누락: ${ch}`);
  }
  // 채널마다 권장 구성이 프롬프트에 다르게 들어간다
  const ig = channelsheets.draftPrompt({}, 'instagram', '인스타그램', '');
  assert.match(ig, /캐릭터 구성 — 이 채널 권장/);
  assert.match(ig, /2개 — ① 메인 모델/);
  const th = channelsheets.draftPrompt({}, 'threads', '스레드', '');
  assert.match(th, /1개 — 반복 오브젝트/);
  // 개수 상한과 항목 형식({name, text})을 규칙으로 요구
  assert.match(ig, /1~3개/);
  assert.match(ig, /"name"/);
  assert.match(ig, /"text"/);
});

test('draftPrompt — 전문 구조(마스터=스타일가이드·캐릭터=모델시트) + 전략별 지침을 마크다운으로 요구', () => {
  const p = channelsheets.draftPrompt({}, 'instagram', '인스타그램', '');
  assert.match(p, /마크다운/);            // md 구조 요구
  // 마스터 = 스타일 가이드/아트 바이블 섹션
  assert.match(p, /조명\(setup\)/);
  assert.match(p, /색·그레이딩/);
  assert.match(p, /DO · DON'T/);
  // 캐릭터 = 캐릭터 모델 시트 섹션
  assert.match(p, /턴어라운드/);
  assert.match(p, /표정 세트/);
  assert.match(p, /시그니처 고정점/);
  // 지침 = 전략별 세부
  assert.match(p, /전략별 세부/);
  assert.match(p, /해시태그 전략/);
});

test('draftPrompt — 채널별 시트 방향이 다르게 반영되고, 브랜드 정체성(제품·로고)을 마스터에 반영', () => {
  const ig = channelsheets.draftPrompt({ identity: '회사명: 콩볶는집 · 제품: 스페셜티 원두 · 로고: 갈색 원형' }, 'instagram', '인스타그램', '');
  const th = channelsheets.draftPrompt({}, 'threads', '스레드', '');
  const nb = channelsheets.draftPrompt({}, 'naver', '네이버 블로그', '');
  // 채널마다 시트 방향이 다르다
  assert.match(ig, /화보|동경/);
  assert.match(th, /손|오브젝트|고대비/);
  assert.match(nb, /정보성|다큐멘터리/);
  // 브랜드 정체성(회사명·제품)이 재료로 들어가고, 로고는 이미지에 렌더하지 않음
  assert.match(ig, /콩볶는집/);
  assert.match(ig, /스페셜티 원두/);
  assert.match(ig, /브랜드 정체성/);
  assert.match(ig, /렌더하지는 말라/);
  // 채널 가이드는 모든 등록 채널을 커버
  for (const ch of ['instagram', 'threads', 'naver', 'naver_clip', 'kakao_channel']) {
    assert.ok(channelsheets.CHANNEL_SHEET_GUIDE[ch], `가이드 누락: ${ch}`);
  }
});

test('parseDraft — 평문 JSON / 코드펜스 감싼 JSON / claude {result} 래핑 모두 파싱 (구 단일 character 승격)', () => {
  // 평문 (guidelines 미지정 시 '', 구 character는 characters[0]로 승격)
  let d = channelsheets.parseDraft('{"master":"M","character":"C"}');
  assert.deepEqual(d, { master: 'M', character: 'C', characters: [{ name: '캐릭터 1', text: 'C' }], guidelines: '' });
  // 잡텍스트에 섞인 JSON
  d = channelsheets.parseDraft('여기 결과입니다:\n{"master":"MM","character":"CC"}\n끝');
  assert.equal(d.master, 'MM');
  assert.equal(d.characters[0].text, 'CC');
  // claude json 모드 {result:"<inner json string>"} 래핑
  d = channelsheets.parseDraft(JSON.stringify({ result: '{"master":"RM","character":"RC"}' }));
  assert.equal(d.master, 'RM');
  assert.equal(d.character, 'RC');
  // 파싱 불가 / 빈 시트
  assert.equal(channelsheets.parseDraft('nope'), null);
  assert.equal(channelsheets.parseDraft('{"master":"","character":""}'), null);
});

test('parseDraft — characters[] 배열: 이름 보정·빈 항목 제거·상한 5·하위호환 별칭', () => {
  // 여러 캐릭터 + 이름 없음 보정 + 빈 text 제거
  let d = channelsheets.parseDraft(JSON.stringify({
    master: 'M',
    characters: [
      { name: '바리스타 지은', text: '20대 바리스타' },
      { text: '라떼 잔' },              // 이름 없음 → '캐릭터 2'
      { name: '빈칸', text: '  ' },     // 빈 text → 제거
    ],
    guidelines: 'G',
  }));
  assert.equal(d.characters.length, 2);
  assert.deepEqual(d.characters[0], { name: '바리스타 지은', text: '20대 바리스타' });
  assert.equal(d.characters[1].name, '캐릭터 2');
  assert.equal(d.character, '20대 바리스타'); // 하위호환 별칭 = 첫 캐릭터 text
  // 상한 5개 (시트 저장 상한과 동일)
  d = channelsheets.parseDraft(JSON.stringify({ characters: Array.from({ length: 8 }, (_, i) => ({ name: `C${i}`, text: `t${i}` })) }));
  assert.equal(d.characters.length, 5);
  // claude {result} 래핑 안의 characters[]도 파싱
  d = channelsheets.parseDraft(JSON.stringify({ result: JSON.stringify({ master: 'M', characters: [{ name: 'A', text: 'a' }, { name: 'B', text: 'b' }] }) }));
  assert.equal(d.characters.length, 2);
  // characters만 있어도 성공(빈 시트 아님), parseDraft 결과를 그대로 save에 넘겨도 동작
  const dir = tmp();
  channelsheets.save(dir, 'instagram', { characters: d.characters });
  assert.equal(channelsheets.get(dir, 'instagram').characters.length, 2);
});

test('refinePrompt — 현재 시트 전문 + 요청을 넣고 바뀐 필드만 완성본으로 요구', () => {
  const p = channelsheets.refinePrompt(
    { identity: '회사명: 콩볶는집', summary: '따뜻한 미니멀' },
    'instagram', '인스타그램',
    { brand: '팔레트 #F5F1E8', characters: [{ name: '바리스타 지은', text: '20대 바리스타' }], guidelines: '존댓말만' },
    '캐릭터를 30대 남성으로 바꿔줘');
  assert.match(p, /인스타그램/);
  assert.match(p, /콩볶는집/);
  assert.match(p, /팔레트 #F5F1E8/);      // 현재 브랜드 시트 주입
  assert.match(p, /바리스타 지은/);        // 현재 캐릭터 주입
  assert.match(p, /존댓말만/);             // 현재 지침 주입
  assert.match(p, /30대 남성으로 바꿔줘/); // 사용자 요청
  assert.match(p, /"reply"/);
  assert.match(p, /바뀐 것만 포함/);
  assert.match(p, /characters 배열 전체/); // 부분 조각 금지 규칙
});

test('parseRefine — reply만(질문 답변) / 일부 필드만 수정 / {result} 래핑, 실패 시 null', () => {
  // 질문에 대한 답만 — 시트 필드 없음
  let r = channelsheets.parseRefine('{"reply":"현재 팔레트는 따뜻한 크림 톤 중심입니다."}');
  assert.match(r.reply, /크림 톤/);
  assert.equal(r.master, '');
  assert.deepEqual(r.characters, []);
  // 캐릭터만 수정 — 나머지 필드는 빈 값
  r = channelsheets.parseRefine(JSON.stringify({ reply: '캐릭터를 교체했습니다', characters: [{ name: '로스터 준호', text: '30대 남성 로스터' }] }));
  assert.equal(r.characters.length, 1);
  assert.equal(r.characters[0].name, '로스터 준호');
  assert.equal(r.guidelines, '');
  // claude {result} 래핑
  r = channelsheets.parseRefine(JSON.stringify({ result: '{"reply":"지침을 보강했습니다","guidelines":"## 해시태그\\n- 3~5개"}' }));
  assert.match(r.reply, /보강/);
  assert.match(r.guidelines, /해시태그/);
  // 파싱 불가 / 빈 응답
  assert.equal(channelsheets.parseRefine('nope'), null);
  assert.equal(channelsheets.parseRefine('{"reply":""}'), null);
});

test('guidelines(지침) — 저장·되읽기, compileDirective·draftPrompt·parseDraft에 반영', () => {
  const dir = tmp();
  channelsheets.save(dir, 'instagram', { master: 'M', guidelines: '반말 금지, 해시태그 3~5개' });
  assert.equal(channelsheets.get(dir, 'instagram').guidelines, '반말 금지, 해시태그 3~5개');
  // 락인하면 이미지 compileDirective에 지침 블록 포함
  channelsheets.setLock(dir, 'instagram', true);
  const out = channelsheets.compileDirective(dir, 'instagram');
  assert.match(out, /가이드 시트 — 준수 규칙/);
  assert.match(out, /해시태그 3~5개/);
  // draftPrompt는 guidelines 필드를 요구, parseDraft는 파싱
  assert.match(channelsheets.draftPrompt({}, 'instagram', '인스타그램', ''), /"guidelines"/);
  const d = channelsheets.parseDraft('{"master":"M","character":"C","guidelines":"G"}');
  assert.equal(d.master, 'M');
  assert.equal(d.guidelines, 'G');
  // guidelines만 있어도 parseDraft 성공(빈 시트 아님)
  assert.deepEqual(channelsheets.parseDraft('{"guidelines":"G"}'), { master: '', character: '', characters: [], guidelines: 'G' });
});

test('로고 — logoRef/logoNote 저장, compileDirective에 로고 노트 주입, 사진 --ref로는 미사용', () => {
  const dir = tmp();
  const refsDir = path.join(channelsheets.sheetsDir(dir), 'refs');
  fs.mkdirSync(refsDir, { recursive: true });
  fs.writeFileSync(path.join(refsDir, 'chlogo-instagram.png'), 'x');
  channelsheets.save(dir, 'instagram', {
    master: '브랜드 룩',
    logoRef: 'context/channel-sheets/refs/chlogo-instagram.png',
    logoNote: '로고 갈색 #8C6B4F를 팔레트 근거로. 이미지 내 워드마크 금지.',
  });
  const s = channelsheets.get(dir, 'instagram');
  assert.equal(s.logoRef, 'context/channel-sheets/refs/chlogo-instagram.png');
  assert.match(s.logoNote, /워드마크 금지/);
  channelsheets.setLock(dir, 'instagram', true);
  const out = channelsheets.compileDirective(dir, 'instagram');
  assert.match(out, /로고 — 색·스타일 근거로만/); // 로고 노트 주입
  assert.match(out, /#8C6B4F/);
  // 로고는 사진 --ref 앵커에 포함되지 않는다(로고가 이미지에 렌더되는 것 방지)
  assert.equal(channelsheets.refImages(dir, 'instagram').length, 0);
  // list에 hasLogo 노출
  assert.equal(channelsheets.list(dir).find((x) => x.channel === 'instagram').hasLogo, true);
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

test('브랜드 공용 — saveBrand/getBrand 저장·되읽기(_brand.json), 부분 갱신 보존', () => {
  const dir = tmp();
  assert.equal(channelsheets.getBrand(dir), null); // 아무것도 없으면 null
  const r = channelsheets.saveBrand(dir, { brand: '따뜻한 미니멀 #F5F1E8', logoNote: '갈색 #8C6B4F 팔레트 근거' });
  assert.equal(r.ok, true);
  const b = channelsheets.getBrand(dir);
  assert.equal(b.brand, '따뜻한 미니멀 #F5F1E8');
  assert.match(b.logoNote, /8C6B4F/);
  assert.ok(b.updatedAt);
  assert.equal(fs.existsSync(path.join(channelsheets.sheetsDir(dir), '_brand.json')), true);
  // 부분 갱신 — logoNote만 바꿔도 brand 보존
  channelsheets.saveBrand(dir, { logoNote: '새 규칙' });
  assert.equal(channelsheets.getBrand(dir).brand, '따뜻한 미니멀 #F5F1E8');
  assert.equal(channelsheets.getBrand(dir).logoNote, '새 규칙');
});

test('브랜드 공용 — 한 번 저장하면 전 채널 compileDirective·refImages에 공유 반영', () => {
  const dir = tmp();
  const refsDir = path.join(channelsheets.sheetsDir(dir), 'refs');
  fs.mkdirSync(refsDir, { recursive: true });
  fs.writeFileSync(path.join(refsDir, 'brand-master.png'), 'x');
  channelsheets.saveBrand(dir, {
    brand: '팔레트 #F5F1E8 크림',
    brandRef: 'context/channel-sheets/refs/brand-master.png',
    logoNote: '로고 갈색 #8C6B4F. 이미지 내 워드마크 금지.',
  });
  // 서로 다른 두 채널 모두 공용 브랜드를 스타일 가이드로 반영(락 전에도)
  for (const ch of ['instagram', 'threads']) {
    const out = channelsheets.compileDirective(dir, ch);
    assert.match(out, /#F5F1E8 크림/, `${ch} 브랜드 반영`);
    assert.match(out, /로고 — 색·스타일 근거로만/, `${ch} 로고 노트 반영`);
    assert.match(out, /클라이언트 공용/, `${ch} 공용 라벨`);
  }
  // 채널에 캐릭터만 넣고 락 → 공용 브랜드 레퍼런스가 --ref 앵커에 포함
  channelsheets.save(dir, 'instagram', { characters: [{ name: '지은', text: '바리스타' }] });
  channelsheets.setLock(dir, 'instagram', true);
  const refs = channelsheets.refImages(dir, 'instagram');
  assert.equal(refs.length, 1);
  assert.ok(refs[0].endsWith('brand-master.png')); // 공용 브랜드 레퍼런스가 앵커로
});

test('브랜드 공용 — _brand.json 없으면 레거시 채널 master/logo에서 비파괴 승격(마이그레이션)', () => {
  const dir = tmp();
  // 구버전: 브랜드가 채널별로 저장돼 있던 상태
  channelsheets.save(dir, 'naver', {
    master: '레거시 브랜드 룩 #123456',
    logoRef: 'context/channel-sheets/refs/old-logo.png',
    logoNote: '레거시 로고 규칙',
  });
  // _brand.json이 없어도 getBrand가 레거시 채널에서 승격해 읽는다
  const b = channelsheets.getBrand(dir);
  assert.match(b.brand, /레거시 브랜드 룩 #123456/);
  assert.match(b.logoNote, /레거시 로고 규칙/);
  assert.equal(b.logoRef, 'context/channel-sheets/refs/old-logo.png');
  // 원본 채널 파일은 그대로(비파괴)
  assert.equal(fs.existsSync(path.join(channelsheets.sheetsDir(dir), '_brand.json')), false);
});
