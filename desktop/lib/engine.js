// 선택된 엔진(Claude/Codex)으로 텍스트 프롬프트를 headless 실행하고 응답 텍스트를 돌려준다.
// 설정 → 사이드바의 Claude/Codex 토글을 존중하는 단일 진입점 — 파이프라인 밖의 일회성
// LLM 호출(이미지 SVG 디자인·프롬프트 컴파일 등)이 이걸 쓰면 codex를 골랐을 때 claude를 안 친다.
// 세션 재개가 필요한 대화 턴은 chat.js가, 스테이지 실행은 pipeline.js가 별도로 다룬다.
const os = require('os');
const fs = require('fs');
const path = require('path');
const { runCmd } = require('./proc');
const config = require('./config');

// runText(dir, prompt, { timeoutMs, json, onLine }) → runCmd 결과에 { out } 을 최종 응답 텍스트로.
// claude: -p (json 모드면 --output-format json, {result} 래핑은 호출자가 벗김).
// codex: exec -o <file> 로 최종 메시지를 파일에 받아 out으로. config/model 폴백 포함.
async function runText(dir, prompt, opts = {}) {
  const timeoutMs = opts.timeoutMs || 120_000;
  const onLine = opts.onLine || null;
  // opts.engine 오버라이드(단계별 선택) 우선, 없으면 전역 토글
  const eng = (opts.engine === 'claude' || opts.engine === 'codex') ? opts.engine : config.getEngine();
  if (eng === 'codex') {
    const outFile = path.join(os.tmpdir(), `sat-engine-codex-${Date.now()}.txt`);
    const model = config.getModels().codex;
    const build = (extra = [], useModel = true) => {
      // sandbox_mode=workspace-write: 워크스페이스 파일 쓰기 허용(read-only면 산출물을 못 씀).
      const a = ['exec', '-C', dir, '--skip-git-repo-check', '--color', 'never',
        '-c', 'sandbox_mode="workspace-write"', '-o', outFile, ...extra];
      if (model && useModel) a.push('-c', `model="${model}"`);
      a.push('-');
      return a;
    };
    const runOpts = { cwd: dir, stdinText: prompt, timeoutMs, onSpawn: opts.onSpawn };
    let r = await runCmd('codex', build(), onLine, runOpts);
    if (!r.ok && /Error loading config/i.test(r.out)) r = await runCmd('codex', build(['--ignore-user-config']), onLine, runOpts);
    if (!r.ok && model && /model.*(is )?not supported|invalid_request_error/i.test(r.out)) r = await runCmd('codex', build([], false), onLine, runOpts);
    let out = '';
    try { out = fs.readFileSync(outFile, 'utf8'); fs.unlinkSync(outFile); } catch { /* no file */ }
    return { ...r, out: out || r.out };
  }
  const model = config.getModels().claude;
  const args = ['-p'];
  if (opts.json) args.push('--output-format', 'json');
  if (dir) args.push('--add-dir', dir);
  if (model) args.push('--model', model);
  return runCmd('claude', args, onLine, { cwd: dir, stdinText: prompt, timeoutMs, onSpawn: opts.onSpawn });
}

module.exports = { runText };
