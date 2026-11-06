// 공용 세션이 2D 경기에 몰래 기대지 않는다는 것 — 이 파일 안에서 만든 아주 작은 게임(카운터)만 등록해 방장·손님을 끝까지 돌린다(2026-11-07).
// 등록부(2D 경기)를 넘기지 않으므로, 세션 어디선가 2D 경기 계산을 부르면 여기서 깨진다.
// 2D 경기로 같은 세션을 돌리는 검사(옮겨 온 예전 세션 테스트)는 game-session.test.mjs 에 그대로 있다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHostSession, createGuestSession, STEP_MS, RESULT_MS } from '../../src/react/game/net/session.ts';
import { createLoopbackHub } from '../../src/react/game/net/transport.ts';

// ── 카운터: 자리 둘. 입력 = 누르고 있나(0/1). 매 틱 누른 자리의 수가 1 오른다. len 틱이면 끝. ──
const counter = {
  id: 'counter',
  create: (config, seed) => ({ tick: 0, n: [0, 0], phase: 'play', seed }),
  step: (s, config, inputs) => {
    if (s.phase === 'end') return s;
    const tick = s.tick + 1;
    return { ...s, tick, n: s.n.map((v, i) => v + (inputs[i]?.up ? 1 : 0)), phase: tick >= config.len ? 'end' : 'play' };
  },
  idle: { up: false },
  encode: (i) => (i && i.up ? 1 : 0),
  decode: (q) => ({ up: q >= 1 }),
  codes: 2,
  okConfig: (c) => !!c && Number.isInteger(c.len) && Array.isArray(c.nums) && c.nums.length === 2,
  okState: (s, c) => !!s && Number.isInteger(s.tick) && Array.isArray(s.n) && s.n.length === c.nums.length && (s.phase === 'play' || s.phase === 'end'),
  tick: (s) => s.tick,
  ended: (s) => s.phase === 'end',
  slots: () => 2,
  slotNum: (c, i) => c.nums[i] ?? null,
  phase: (s) => s.phase,
};
/** 방 → 설정: 0 편 칸의 첫 사람이 자리 0, 1 편 칸의 첫 사람이 자리 1, 빈자리는 봇(카운터엔 botInput 이 없어 idle). */
const COUNTER = {
  adapter: counter, mode: '2d', name: '카운터', describe: '', tags: [],
  defaultSettings: { len: 240 },
  okSettings: (v) => !!v && Number.isInteger(v.len) && v.len > 0 && v.len <= 6000,
  applySettings: (cur, p) => (p && Number.isInteger(p.len) && p.len !== cur.len ? { len: p.len } : cur),
  buildConfig: (room) => {
    const seat = [0, 1].map((t) => room.members.find((m) => m.team === t) ?? null);
    return { config: { len: room.settings.len, nums: seat.map((m) => (m ? m.num : null)) }, slots: seat.map((m) => (m ? m.clientId : null)) };
  },
  startBlock: (room) => (room.members.some((m) => m.team !== null) ? null : '아무도 없습니다'),
};
const OTHER = { ...COUNTER, adapter: { ...counter, id: 'other' }, name: '다른 것', defaultSettings: { len: 99 } };
const games = (id) => ({ counter: COUNTER, other: OTHER })[id];

const roster = Array.from({ length: 6 }, (_, i) => ({ num: 100 + i, jersey: i + 1, name: `선수${i}` }));
const who = (i) => ({ clientId: `c${i}`, num: 100 + i, name: `선수${i}` });

function world() {
  const clock = { t: 1000 };
  const now = () => clock.t;
  const hub = createLoopbackHub({ delayMs: 30, now });
  const host = createHostSession({ transport: hub.endpoint(), roster, me: who(0), code: 'ABCD', now, rnd: () => 0.5, games, game: 'counter' });
  const gEp = hub.endpoint();
  const guest = createGuestSession({ transport: gEp, roster, me: who(1), code: 'ABCD', now, games });
  const run = (ms) => {
    const end = clock.t + ms;
    while (clock.t < end) { clock.t = Math.min(end, clock.t + STEP_MS); hub.pump(clock.t); host.advance(); guest.advance(); }
  };
  return { host, guest, gEp, hub, run };
}

test('가짜 게임(카운터)으로 방장·손님이 들어오고, 시작하고, 손님 입력이 방장 계산에 닿고, 끝나면 둘 다 결과 → 방으로', () => {
  const w = world();
  w.run(1500);
  assert.equal(w.guest.getView().stage, 'lobby');
  assert.equal(w.guest.getRoom().game, 'counter');
  assert.deepEqual(w.guest.getRoom().settings, { len: 240 });
  assert.match(w.host.startBlock(), /아무도/);
  w.host.move('c1', 1);
  w.host.move('c0', 0);
  w.run(200);
  assert.equal(w.host.startBlock(), null);
  assert.ok(w.host.start());
  w.run(300);
  assert.equal(w.guest.getView().stage, 'match');
  assert.equal(w.guest.getView().game, 'counter');
  assert.equal(w.guest.getView().myId, 1, '손님은 자기 번호(slotNum)로 자기 자리를 찾는다');
  assert.equal(w.host.getView().myId, 0);
  w.guest.setInputReader(() => ({ up: true }));
  w.run(1000);
  const s = w.host.getState();
  assert.ok(s.n[1] > 30, `손님 자리 ${s.n[1]}`);
  assert.equal(s.n[0], 0, '방장은 손을 뗐다');
  assert.ok(w.guest.getBase().tick > 40, '스냅샷이 손님에게 닿는다');
  assert.ok(w.guest.getState().n[1] >= w.guest.getBase().n[1], '예측은 내 입력으로 앞서 간다');
  assert.ok(w.guest.frame(), '몸 목록이 없는 게임도 그릴 것을 준다');
  w.run(3000);
  assert.ok(w.host.getView().result, '방장 결과');
  assert.ok(w.guest.getView().result, '손님 결과');
  assert.equal(w.guest.getView().result.phase, 'end');
  w.run(RESULT_MS + 500);
  assert.equal(w.host.getView().stage, 'lobby');
  assert.equal(w.guest.getView().stage, 'lobby');
});

test('가짜 게임 — 범위 밖 입력(codes 2 이상)은 방장이 버린다, 손님이 조용하면 그 자리는 idle(봇 입력이 없는 게임)', () => {
  // decode 를 일부러 너그럽게(1 이상이면 누름) — 방장이 범위 검사(acceptIn)를 안 하면 2 가 "누름"으로 계산에 들어간다.
  const w = world();
  w.run(1500);
  w.host.move('c1', 1);
  w.run(200);
  w.host.start();
  w.run(300);
  w.gEp.mute(true);   // 손님 자신의 입력(손 뗌)이 섞이지 않게
  const spy = w.hub.endpoint();
  spy.send({ t: 'in', from: 'c1', seq: 99999, i: 2 });
  w.run(1000);
  assert.equal(w.host.getState().n[1], 0, '2 는 이 게임의 입력이 아니다');
  spy.send({ t: 'in', from: 'c1', seq: 100000, i: 1 });
  w.run(1000);
  assert.ok(w.host.getState().n[1] > 30, '범위 안(1)은 받는다');
  w.run(4500);
  assert.equal(w.host.getSlots()[1].bot, true);
  const n = w.host.getState().n[1];
  w.run(1000);
  assert.equal(w.host.getState().n[1], n, '조용한 자리는 idle');
});

test('가짜 게임 둘 — 방장이 게임을 바꾸면 손님이 받고, 돌아오면 설정이 남아 있다. 모르는 게임으로는 안 바뀐다', () => {
  const w = world();
  w.run(1500);
  w.host.setSettings({ len: 500 });
  w.host.setGame('other');
  w.run(300);
  assert.equal(w.guest.getRoom().game, 'other');
  assert.deepEqual(w.guest.getRoom().settings, { len: 99 });
  w.host.setGame('nope');
  w.host.setGame('match2d');
  w.run(300);
  assert.equal(w.host.getRoom().game, 'other', '등록 안 된 게임(여기엔 2D 경기도 없다)은 무시');
  w.host.setGame('counter');
  w.run(300);
  assert.equal(w.guest.getRoom().game, 'counter');
  assert.deepEqual(w.guest.getRoom().settings, { len: 500 });
  assert.deepEqual(w.guest.getRoom().saved, { other: { len: 99 } });
  // 경기 중엔 게임을 못 바꾼다
  w.host.move('c0', 0);
  w.host.start();
  w.host.setGame('other');
  assert.equal(w.host.getRoom().game, 'counter');
});

test('손님은 모르는 게임의 start 를 받지 않는다(방장 id 로 와도)', () => {
  const w = world();
  w.run(1500);
  w.host.move('c1', 1);
  w.run(200);
  const spy = w.hub.endpoint();
  spy.send({ t: 'start', from: 'c0', game: 'nope', config: { len: 10, nums: [null, 101] }, seed: 5 });
  spy.send({ t: 'start', from: 'c0', config: { len: 10, nums: [null, 101] }, seed: 5 });   // 예전 탭의 start(게임 없음)
  w.run(300);
  assert.equal(w.guest.getView().stage, 'lobby');
  w.host.start();
  w.run(300);
  assert.equal(w.guest.getView().stage, 'match');
  assert.equal(w.guest.getView().game, 'counter');
});

test('시작 못 하는 게임 id 로 방을 열면 바로 알린다(조용히 2D 경기로 가지 않는다)', () => {
  const hub = createLoopbackHub({ now: () => 0 });
  assert.throws(() => createHostSession({ transport: hub.endpoint(), roster, me: who(0), code: 'ABCD', now: () => 0, games, game: 'match2d' }), RangeError);
});
