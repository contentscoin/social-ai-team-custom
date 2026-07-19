// 실행 결과 리포트 — 스테이지/오토파일럿 실행 전후의 산출물 변화와 컴플라이언스 판정 요약.
// "실행했는데 뭐가 바뀌었는지 알 수 없다"를 없애는 계측 계층: execStage가 실행 전
// snapshot()을 찍고, 끝난 뒤 diff()로 생성·수정 파일 목록을 결과에 첨부한다.
const fs = require('fs');
const path = require('path');
const board = require('./board');

const CAP_FILES = 400; // 스냅샷 상한 — 워크스페이스가 비정상적으로 커도 리포트가 실행을 막지 않게

// outputs/·context/의 파일 서명(mtime:size) 맵 — 실행 전후 비교용
function snapshot(dir) {
  const snap = new Map();
  const walk = (p, rel) => {
    if (snap.size >= CAP_FILES) return;
    let entries = [];
    try { entries = fs.readdirSync(p, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name.startsWith('.') || e.name.endsWith('.tmp')) continue;
      const ap = path.join(p, e.name);
      const r = rel + '/' + e.name;
      if (e.isDirectory()) walk(ap, r);
      else {
        try { const st = fs.statSync(ap); snap.set(r, st.mtimeMs + ':' + st.size); } catch { /* 삭제 경합 */ }
        if (snap.size >= CAP_FILES) return;
      }
    }
  };
  for (const root of ['outputs', 'context']) walk(path.join(dir, root), root);
  return snap;
}

// 전후 스냅샷 비교 → { created: [rel...], modified: [rel...] } (정렬됨)
function diff(before, after) {
  const created = [];
  const modified = [];
  for (const [rel, sig] of after) {
    if (!before.has(rel)) created.push(rel);
    else if (before.get(rel) !== sig) modified.push(rel);
  }
  created.sort();
  modified.sort();
  return { created, modified };
}

// 컴플라이언스 실행 직후 보드 기준 판정 요약 — 포스트별 PASS/WARN/BLOCK 표
function complianceSummary(dir) {
  try {
    const b = board.buildBoard(dir);
    const c = b.compliance || { pass: 0, warn: 0, block: 0 };
    const posts = (b.posts || [])
      .filter((p) => p.verdict)
      .map((p) => ({ uid: p.uid, topic: p.topic, verdict: p.verdict }))
      .slice(0, 40);
    return { pass: c.pass, warn: c.warn, block: c.block, posts };
  } catch { return null; }
}

// 사실 검증 실행 직후 요약 — 보드가 파싱한 PASS/REVISE
function verifySummary(dir) {
  try {
    const b = board.buildBoard(dir);
    const v = b.verify || { pass: 0, revise: 0 };
    return { pass: v.pass, revise: v.revise, file: v.file ? v.file.rel || v.file.name : null };
  } catch { return null; }
}

module.exports = { snapshot, diff, complianceSummary, verifySummary };
