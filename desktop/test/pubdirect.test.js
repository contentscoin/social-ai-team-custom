// pubdirect.js — 예약 큐·재시도 백오프·크래시 복구 테스트.
// 네트워크 호출은 hooks._publishNow 주입으로 대체하고 큐 상태 기계만 검증한다.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const pub = require('../lib/pubdirect');

const tmpWorkspace = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pubdirect-test-'));
  fs.mkdirSync(path.join(dir, 'context'), { recursive: true });
  return dir;
};
const queuePath = (dir) => path.join(dir, 'context', 'publish-queue.json');
const readQueue = (dir) => JSON.parse(fs.readFileSync(queuePath(dir), 'utf8'));
// 백오프 대기를 강제로 만료시켜 다음 처리 사이클을 재현한다
const expireBackoff = (dir) => {
  const q = readQueue(dir);
  for (const it of q.items) if (it.nextAt) it.nextAt = new Date(Date.now() - 1000).toISOString();
  fs.writeFileSync(queuePath(dir), JSON.stringify(q));
};
// 60초 유예 안의 살짝 과거 시각 — 등록 즉시 due가 되게
const dueNow = () => new Date(Date.now() - 30_000).toISOString();

test('schedule → listQueue 라운드트립, 과거 시각은 거부', () => {
  const dir = tmpWorkspace();
  const r = pub.schedule(dir, { uid: 'x-1', channel: 'x', text: '본문', when: new Date(Date.now() + 3600_000).toISOString() });
  assert.equal(r.ok, true);
  assert.equal(pub.listQueue(dir).pending.length, 1);
  const past = pub.schedule(dir, { uid: 'x-2', channel: 'x', text: '본문', when: new Date(Date.now() - 3600_000).toISOString() });
  assert.equal(past.ok, false);
});

test('오류 분류 — 일시(네트워크·429·5xx)만 재시도 대상', () => {
  for (const m of ['fetch failed', 'connect ECONNREFUSED', 'HTTP 429', 'HTTP 503', 'The operation was aborted']) {
    assert.equal(pub._isTransient({ error: m }), true, m);
  }
  for (const m of ['HTTP 401 Unauthorized', 'X API 크레딧이 부족합니다', '2번째 조각이 500자를 초과합니다', '발행할 본문이 비어 있습니다']) {
    assert.equal(pub._isTransient({ error: m }), false, m);
  }
});

test('백오프 — 2분 → 8분 → 32분, 60분 상한', () => {
  assert.equal(pub._backoffMs(1), 2 * 60_000);
  assert.equal(pub._backoffMs(2), 8 * 60_000);
  assert.equal(pub._backoffMs(3), 32 * 60_000);
  assert.equal(pub._backoffMs(4), 60 * 60_000);
});

test('due 아이템 발행 성공 → done', async () => {
  const dir = tmpWorkspace();
  pub.schedule(dir, { uid: 'x-1', channel: 'x', text: '본문', when: dueNow() });
  const events = [];
  await pub._processQueues([dir], {
    _publishNow: async () => ({ ok: true, channel: 'x', id: '1' }),
    send: (ch, p) => events.push(p),
  });
  const { pending, past } = pub.listQueue(dir);
  assert.equal(pending.length, 0);
  assert.equal(past[0].status, 'done');
  assert.equal(events[0].ok, true);
});

test('일시 오류 → pending 유지 + 백오프, 대기 중에는 재시도하지 않음', async () => {
  const dir = tmpWorkspace();
  pub.schedule(dir, { uid: 'x-1', channel: 'x', text: '본문', when: dueNow() });
  let calls = 0;
  const hooks = { _publishNow: async () => { calls++; return { ok: false, channel: 'x', error: 'fetch failed' }; } };
  await pub._processQueues([dir], hooks);
  let it = readQueue(dir).items[0];
  assert.equal(it.status, 'pending');
  assert.equal(it.attempts, 1);
  assert.ok(new Date(it.nextAt).getTime() > Date.now());
  assert.match(it.error, /자동 재시도 예약됨/);
  // 백오프가 안 지난 상태의 다음 틱 — 시도하지 않아야 한다
  await pub._processQueues([dir], hooks);
  assert.equal(calls, 1);
});

test('영구 오류(4xx 인증)는 재시도 없이 즉시 failed', async () => {
  const dir = tmpWorkspace();
  pub.schedule(dir, { uid: 'li-1', channel: 'linkedin', text: '본문', when: dueNow() });
  await pub._processQueues([dir], { _publishNow: async () => ({ ok: false, channel: 'linkedin', error: '토큰이 만료됐습니다 (60일) — HTTP 401' }) });
  const it = readQueue(dir).items[0];
  assert.equal(it.status, 'failed');
  assert.equal(it.attempts, 1);
  assert.equal(it.nextAt, null);
});

test('일시 오류 반복 → 최대 시도(4회) 후 failed 확정', async () => {
  const dir = tmpWorkspace();
  pub.schedule(dir, { uid: 'x-1', channel: 'x', text: '본문', when: dueNow() });
  let calls = 0;
  const hooks = { _publishNow: async () => { calls++; return { ok: false, channel: 'x', error: 'HTTP 500' }; } };
  for (let i = 0; i < 4; i++) {
    await pub._processQueues([dir], hooks);
    if (i < 3) expireBackoff(dir);
  }
  const it = readQueue(dir).items[0];
  assert.equal(calls, 4);
  assert.equal(it.status, 'failed');
  assert.equal(it.attempts, 4);
});

test('Threads 체인 부분 성공 — 재개 상태 보존, 재시도에 resume 전달, 성공 시 정리', async () => {
  const dir = tmpWorkspace();
  pub.schedule(dir, { uid: 'th-1', channel: 'threads', segments: ['1', '2', '3'], text: null, when: dueNow() });
  let resumeSeen = null;
  const hooks = {
    _publishNow: async (_d, it) => {
      if (!it.chainState) {
        return { ok: false, channel: 'threads', partial: true, published: 2, total: 3, id: 't1', lastId: 't2', error: 'HTTP 500' };
      }
      resumeSeen = it.chainState;
      return { ok: true, channel: 'threads', id: 't1', chain: 3 };
    },
  };
  await pub._processQueues([dir], hooks);
  let it = readQueue(dir).items[0];
  assert.equal(it.status, 'pending'); // 5xx → 재시도 대상
  assert.deepEqual(it.chainState, { published: 2, prevId: 't2', firstId: 't1' });
  expireBackoff(dir);
  await pub._processQueues([dir], hooks);
  it = readQueue(dir).items[0];
  assert.equal(it.status, 'done');
  assert.deepEqual(resumeSeen, { published: 2, prevId: 't2', firstId: 't1' }); // 앞 2조각을 다시 올리지 않는 근거
  assert.equal('chainState' in it, false);
});

test('크래시 복구 — publishing 고착 아이템을 failed로 표면화 (자동 재시도 금지)', () => {
  const dir = tmpWorkspace();
  fs.writeFileSync(queuePath(dir), JSON.stringify({
    items: [{ qid: 'q1', uid: 'x-1', channel: 'x', text: '본문', when: dueNow(), status: 'publishing' }],
  }));
  pub._recoverStale([dir]);
  const it = readQueue(dir).items[0];
  assert.equal(it.status, 'failed');
  assert.match(it.error, /발행 도중 종료/);
});
