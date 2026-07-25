// 오토파일럿 — 승인 게이트 앞까지 파이프라인 단계를 자동으로 이어 달린다.
// 원칙: 도장(승인)이 필요한 경계는 절대 건너뛰지 않는다. 증거가 이미 있는 단계는
// 재실행하지 않는다(재실행은 수동 버튼으로). 이미지 생성(visuals-generate)은 비용이
// 들므로 visuals 노드 도장 없이는 진입하지 않는다.
const gates = require('./gates');

// 릴스/보드(shortform)는 독립 스테이지에서 비주얼 생성의 하위 단계로 통합(0.19.34) —
// main.js execStage가 visuals-generate 안에서 편성된 릴이 있을 때만 실행한다.
const ORDER = ['calendar', 'copy', 'verify', 'visuals', 'visuals-generate', 'compliance'];
// 단계 실행 전에 도장이 찍혀 있어야 하는 게이트 노드
const REQUIRES = {
  copy: 'calendar',
  verify: 'copy',
  visuals: 'verify', // 사실 검증 통과(도장) 후에만 비주얼로 — 교체될 콘텐츠에 비주얼 낭비 방지
  'visuals-generate': 'visuals',
};
const NODE_LABEL = { calendar: '캘린더', copy: '카피', verify: '사실 검증', visuals: '비주얼 브리프', compliance: '컴플라이언스' };

// 클라이언트(폴더)별 오토파일럿 상태 — 서로 다른 클라이언트는 동시에 오토파일럿을 돌릴 수 있다.
const states = new Map(); // dir → { running, dir, stage }
const stopFlags = new Map(); // dir → true(중지 요청)

function status(dir) {
  if (dir) return { ...(states.get(dir) || { running: false, dir: null, stage: null }) };
  // dir 없는 레거시 호출 — 실행 중인 아무 하나(없으면 idle)를 반환
  for (const s of states.values()) if (s.running) return { ...s };
  return { running: false, dir: null, stage: null };
}
// 실행 중인 모든 클라이언트 dir 목록 (백그라운드 배너용)
function runningDirs() {
  return [...states.values()].filter((s) => s.running).map((s) => s.dir);
}

// deps: { buildBoard(dir), runStage(dir, stage) → Promise<r>, onEvent(ev), stopStage(), autoApprove? }
async function run(dir, deps) {
  const autoApprove = !!deps.autoApprove; // true면 증거가 있는 승인 게이트를 자동 통과(컴플라이언스·발행 제외)
  if (states.get(dir) && states.get(dir).running) return { ok: false, error: '이 클라이언트에서 오토파일럿이 이미 실행 중입니다' };
  const state = { running: true, dir, stage: null };
  states.set(dir, state);
  stopFlags.delete(dir);
  const isStopped = () => stopFlags.get(dir) === true;
  const ran = [];
  const emit = (ev) => { try { deps.onEvent && deps.onEvent({ ...ev, dir }); } catch { /* 소비자 보호 */ } };
  const finish = (result) => {
    states.set(dir, { running: false, dir: null, stage: null });
    emit({ state: result.state, ...result });
    return { ok: true, ...result, ran };
  };

  emit({ state: 'start' });
  try {
    for (const stage of ORDER) {
      if (isStopped()) return finish({ state: 'stopped' });
      // 매 반복마다 보드/게이트를 새로 읽는다 — 직전 단계가 파일을 썼다
      const b = deps.buildBoard(dir);
      const g = gates.computeGates(b, gates.load(dir), dir);
      const node = g.nodes.find((n) => n.stage === stage);
      if (node && node.done) { emit({ state: 'skip', stage }); continue; } // 증거 있음 — 건너뜀
      const req = REQUIRES[stage];
      if (req) {
        const reqNode = g.nodes.find((n) => n.key === req);
        if (!reqNode || !reqNode.approved) {
          // 자동 승인 옵션 — 증거(done)가 있는 게이트만 자동 도장하고 계속. 증거가 없으면(스테이지가
          // 산출물을 못 냄) 자동 승인하지 않고 멈춘다(빈 게이트에 도장 금지).
          if (autoApprove && reqNode && reqNode.done) {
            gates.approve(dir, { node: req, signer: 'autopilot', note: '오토파일럿 자동 승인', calendarHash: b.calendarHash });
            emit({ state: 'auto-approve', stage, node: req, message: `${NODE_LABEL[req] || req} 자동 승인` });
          } else {
            return finish({
              state: 'paused', stage, needStamp: req,
              message: `${NODE_LABEL[req] || req} 승인 도장이 필요합니다. 도장을 찍고 오토파일럿을 다시 시작하세요.`,
            });
          }
        }
      }
      // 비용 예산 게이트 — 예산 초과 상태에서는 새 단계를 시작하지 않는다 (진행 중 단계는 완주)
      if (deps.checkBudget) {
        const b = deps.checkBudget();
        if (b && b.over) {
          return finish({
            state: 'paused', stage, budget: b,
            message: `이번 달 API 비용 $${b.monthCost}가 예산 $${b.budgetUsd}를 넘었습니다 — 오토파일럿을 중지합니다. 설정에서 예산을 조정하거나 수동으로 진행하세요.`,
          });
        }
      }
      state.stage = stage;
      emit({ state: 'stage', stage });
      const r = await deps.runStage(dir, stage);
      if (isStopped()) return finish({ state: 'stopped', stage });
      if (!r || !r.ok) {
        return finish({
          state: 'failed', stage,
          message: `${stage} 단계가 실패했습니다: ${String((r && (r.resultText || r.tail)) || '알 수 없는 오류').slice(-300)}`,
        });
      }
      ran.push(stage);
    }
    // 컴플라이언스까지 완주 — BLOCK 여부를 마지막 보드로 확인
    const b = deps.buildBoard(dir);
    const blocks = (b.compliance && b.compliance.block) || 0;
    return finish({
      state: 'done',
      message: blocks > 0
        ? `완주했지만 BLOCK ${blocks}건 — 재작업이 필요합니다. 보드에서 확인하세요.`
        : '컴플라이언스까지 완료. 발행 게이트만 남았습니다.',
    });
  } catch (e) {
    return finish({ state: 'failed', stage: state.stage, message: String(e && e.message || e) });
  }
}

// dir 지정 시 그 클라이언트만 중지. dir 없으면(레거시) 실행 중인 전부 중지.
function stop(dir, stopStage) {
  if (typeof dir === 'function') { stopStage = dir; dir = null; } // 레거시 시그니처 stop(fn)
  if (dir) {
    stopFlags.set(dir, true);
    try { stopStage && stopStage(); } catch { /* already gone */ }
    const s = states.get(dir);
    return { ok: true, wasRunning: !!(s && s.running) };
  }
  let wasRunning = false;
  for (const s of states.values()) if (s.running) { stopFlags.set(s.dir, true); wasRunning = true; }
  try { stopStage && stopStage(); } catch { /* already gone */ }
  return { ok: true, wasRunning };
}

module.exports = { run, stop, status, runningDirs, ORDER };
