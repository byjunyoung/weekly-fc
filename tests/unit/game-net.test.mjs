import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PHRASES, Q_IDLE, advance, applySnapshot, createPredictor, decodeInput, encodeInput, leadTicks, parseMsg, quantize, setLead,
} from '../../src/lib/game/net.ts';
import { createMatch, step, NO_INPUT } from '../../src/lib/game/sim.ts';
import { BASE_PERF } from '../../src/lib/game/stats.ts';
import { createRoom } from '../../src/lib/game/room.ts';

const cfgOf = (perSide = 2) => ({
  perSide, minutes: 2, scoreLimit: 0,
  players: Array.from({ length: perSide * 2 }, (_, i) => ({ id: i, num: 10 + i, name: `P${i}`, side: i < perSide ? 0 : 1, bot: i !== 0, perf: { ...BASE_PERF } })),
});
const deg = (a, b) => { let d = Math.abs(Math.atan2(a.y, a.x) - Math.atan2(b.y, b.x)) * 180 / Math.PI; return d > 180 ? 360 - d : d; };

test('양자화 — 66 가지 전부, 한 번 거치면 안정', () => {
  const seen = new Set();
  for (let q = 0; q < 66; q++) {
    const d = decodeInput(q);
    assert.equal(encodeInput(d), q, `코드 ${q}`);
    assert.deepEqual(decodeInput(encodeInput(d)), d);
    assert.ok(Math.sqrt(d.x * d.x + d.y * d.y) <= 1, `길이 ${q}`);
    seen.add(JSON.stringify(d));
  }
  assert.equal(seen.size, 66);
  assert.deepEqual(decodeInput(Q_IDLE), { x: 0, y: 0, kick: false });
  assert.equal(Q_IDLE, 0);
});

test('양자화 — 방향 오차 12도 이내, 세기·킥 보존, 정지는 Q_IDLE', () => {
  let max = 0;
  for (let a = 0; a < 3600; a++) {
    const r = (a / 10) * Math.PI / 180;
    for (const len of [1, 0.9, 0.3]) {
      const d = quantize({ x: Math.cos(r) * len, y: Math.sin(r) * len, kick: false });
      max = Math.max(max, deg(d, { x: Math.cos(r), y: Math.sin(r) }));
      assert.ok(Math.sqrt(d.x * d.x + d.y * d.y) <= 1);
    }
  }
  assert.ok(max <= 12, `최대 오차 ${max}`);
  assert.equal(encodeInput({ x: 0, y: 0, kick: false }), Q_IDLE);
  assert.equal(encodeInput({ x: 0.05, y: -0.05, kick: false }), Q_IDLE);
  assert.equal(encodeInput({ x: NaN, y: Infinity, kick: false }), Q_IDLE);
  assert.equal(quantize({ x: 1, y: 0, kick: true }).kick, true);
  assert.equal(quantize({ x: 1, y: 0, kick: false }).kick, false);
  assert.equal(encodeInput({ x: 0, y: 0, kick: true }), 33, '멈춰서 차기');
  assert.deepEqual(quantize({ x: 0, y: 0, kick: true }), { x: 0, y: 0, kick: true });
  const w = quantize({ x: 0.5, y: 0, kick: false }), r = quantize({ x: 1, y: 0, kick: false });
  assert.ok(w.x < r.x, '걷기 < 달리기');
  // 한 번 거친 값은 다시 거쳐도 같다
  for (let i = 0; i < 500; i++) {
    const q1 = quantize({ x: Math.sin(i) * 1.2, y: Math.cos(i * 3), kick: i % 3 === 0 });
    assert.deepEqual(quantize(q1), q1);
  }
  for (const bad of [-1, 66, 1.5, NaN, undefined, '3']) assert.deepEqual(decodeInput(bad), NO_INPUT);
});

test('leadTicks · setLead', () => {
  assert.equal(leadTicks(0), 0); assert.equal(leadTicks(150), 9); assert.equal(leadTicks(100), 6);
  assert.equal(leadTicks(5000), 20); assert.equal(leadTicks(-30), 0); assert.equal(leadTicks(NaN), 0);
  const p = createPredictor(cfgOf(), 0);
  assert.equal(setLead(p, 0), p);
  assert.equal(setLead(p, 7).lead, 7); assert.equal(setLead(p, 99).lead, 20);
});

test('PHRASES', () => assert.deepEqual([...PHRASES], ['나이스', '패스!', 'ㅋㅋㅋ', '미안', '가자', '수비!']));

test('parseMsg — 종류마다 받는다', () => {
  const cfg = cfgOf(), st = createMatch(cfg, 5);
  const room = createRoom('ABCD', { clientId: 'h', num: 1, name: '방장' });
  const good = [
    { t: 'hello', from: 'a', num: 3, name: '가' }, { t: 'deny', to: 'a', reason: 'full' },
    { t: 'room', room, roster: [1, 2, 3] }, { t: 'pick', from: 'a', num: 3, name: '가' },
    { t: 'start', config: cfg, seed: 123 }, { t: 'in', from: 'a', seq: 4, i: 65 },
    { t: 'snap', tick: 6, state: st, inputs: [0, 1, 2, 65], paused: false }, { t: 'stop' },
    { t: 'say', from: 'a', id: 2, k: 5 }, { t: 'ping', from: 'a', at: 12.5 }, { t: 'pong', to: 'a', at: 12.5 }, { t: 'bye', from: 'a' },
  ];
  for (const m of good) assert.deepEqual(parseMsg(JSON.parse(JSON.stringify(m))), m, m.t);
});

test('parseMsg — 틀린 모양은 null', () => {
  const cfg = cfgOf(), st = createMatch(cfg, 5);
  const room = createRoom('ABCD', { clientId: 'h', num: 1, name: '방장' });
  const bad = [
    null, undefined, 3, 'x', [], [{ t: 'stop' }], {}, { t: 5 }, { t: 'nope' },
    { t: 'hello', from: 'a', num: 3 }, { t: 'hello', from: 3, num: 3, name: 'x' }, { t: 'hello', from: 'a', num: '3', name: 'x' },
    { t: 'hello', from: 'a', num: -1, name: 'x' }, { t: 'hello', from: 'a', num: 1, name: 'x'.repeat(100) }, { t: 'hello', from: '', num: 1, name: 'x' },
    { t: 'deny', to: 'a', reason: 'bored' }, { t: 'deny', reason: 'full' },
    { t: 'room', room: { ...room, code: 'AB0D' }, roster: [] }, { t: 'room', room, roster: 'x' }, { t: 'room', room, roster: Array(500).fill(1) },
    { t: 'room', room: { ...room, members: Array(40).fill(room.members[0]) }, roster: [] },
    { t: 'room', room: { ...room, phase: 'x' }, roster: [] }, { t: 'room', room: { ...room, settings: { perSide: 9, minutes: 3, scoreLimit: 0 } }, roster: [] },
    { t: 'start', config: { ...cfg, players: cfg.players.slice(1) }, seed: 1 }, { t: 'start', config: cfg },
    { t: 'start', config: { ...cfg, players: cfg.players.map((p) => ({ ...p, perf: { maxSpeed: 'a' } })) }, seed: 1 },
    { t: 'in', from: 'a', seq: 1, i: 66 }, { t: 'in', from: 'a', seq: 1, i: 1.5 }, { t: 'in', from: 'a', i: 1 }, { t: 'in', from: 'a', seq: 1, i: '3' },
    { t: 'snap', tick: 1, state: st, inputs: Array(50).fill(0), paused: false }, { t: 'snap', tick: 1, state: st, inputs: [70], paused: false },
    { t: 'snap', tick: 1, state: st, inputs: [], paused: 'no' }, { t: 'snap', tick: 1, state: { ...st, phase: 'zz' }, inputs: [], paused: false },
    { t: 'snap', tick: 1, state: { ...st, players: Array(40).fill(st.players[0]) }, inputs: [], paused: false },
    { t: 'snap', tick: 1, state: { ...st, ball: { x: NaN, y: 0, vx: 0, vy: 0 } }, inputs: [], paused: false },
    { t: 'snap', tick: -1, state: st, inputs: [], paused: false }, { t: 'snap', state: st, inputs: [], paused: false },
    { t: 'say', from: 'a', id: 2, k: 6 }, { t: 'say', from: 'a', id: 99, k: 1 }, { t: 'ping', from: 'a', at: 'x' }, { t: 'pong', at: 1 }, { t: 'bye' },
  ];
  for (const m of bad) assert.equal(parseMsg(m), null, JSON.stringify(m)?.slice(0, 80));
});

// ───────────────────────── 예측 ─────────────────────────
const idleQ = (cfg) => cfg.players.map(() => Q_IDLE);
/** 방장 쪽: 모든 입력은 양자화 값. 틱 진행 후 스냅샷 모양을 돌려준다. */
const hostTick = (cfg, st, qs) => step(st, cfg, qs.map(decodeInput));

test('예측 — lead 0 이면 스냅샷 그대로, 오래된 틱은 무시(같은 객체)', () => {
  const cfg = cfgOf(), s0 = createMatch(cfg, 9);
  let s = s0; for (let i = 0; i < 10; i++) s = hostTick(cfg, s, idleQ(cfg));
  const p0 = createPredictor(cfg, 0);
  assert.equal(p0.predicted, null); assert.equal(p0.lastSnapTick, -1);
  const p1 = applySnapshot(p0, { tick: s.tick, state: s, inputs: idleQ(cfg), paused: false });
  assert.deepEqual(p1.predicted, s); assert.equal(p1.lastSnapTick, s.tick);
  assert.equal(applySnapshot(p1, { tick: s.tick, state: s0, inputs: idleQ(cfg), paused: false }), p1, '같은 틱');
  assert.equal(applySnapshot(p1, { tick: s.tick - 1, state: s0, inputs: idleQ(cfg), paused: false }), p1, '낮은 틱');
});

test('예측 — lead k 는 스냅샷에서 k 번 step(내 자리만 내 기록)', () => {
  const cfg = cfgOf(), s0 = createMatch(cfg, 9);
  const mine = 1 + 0 * 2 + 1;   // 달리기, 방향 0(+x)
  const others = [0, 5, 20, 40];
  let p = setLead(createPredictor(cfg, 0), 5);
  for (let i = 0; i < 8; i++) p = advance(p, mine);   // base 없을 땐 기록만
  assert.equal(p.predicted, null); assert.equal(p.history.length, 8);
  p = applySnapshot(p, { tick: 1, state: s0, inputs: others, paused: false });
  let want = s0;
  for (let i = 0; i < 5; i++) want = step(want, cfg, [decodeInput(mine), ...others.slice(1).map(decodeInput)]);
  assert.deepEqual(p.predicted, want);
  assert.notDeepEqual(p.predicted.players[0], s0.players[0], '내 선수는 움직였다');
  // advance 는 step(내 입력, 남의 마지막 입력) 한 번과 같다
  const a = advance(p, 3);
  assert.deepEqual(a.predicted, step(p.predicted, cfg, [decodeInput(3), ...others.slice(1).map(decodeInput)]));
  assert.equal(a.history.at(-1), 3);
  assert.equal(a.base, p.base);
});

test('예측 — 기록은 60틱까지, 이상한 입력은 정지', () => {
  let p = createPredictor(cfgOf(), 0);
  for (let i = 0; i < 100; i++) p = advance(p, i % 66);
  assert.equal(p.history.length, 60); assert.equal(p.history.at(-1), 99 % 66);
  p = advance(p, 999); assert.equal(p.history.at(-1), Q_IDLE);
});

test('예측 — 입력 배열이 짧아도 던지지 않는다', () => {
  const cfg = cfgOf(3), s0 = createMatch(cfg, 1);
  let p = setLead(createPredictor(cfg, 4), 6);
  p = applySnapshot(p, { tick: 1, state: s0, inputs: [], paused: false });
  p = applySnapshot(p, { tick: 2, state: s0, inputs: [64], paused: false });
  for (let i = 0; i < 30; i++) p = advance(p, 7);
  assert.ok(p.predicted);
  const spec = applySnapshot(createPredictor(cfg, 99), { tick: 1, state: s0, inputs: [1, 2, 3, 4, 5, 6, 7, 8, 9], paused: false });
  assert.ok(advance(spec, 5).predicted);
});

test('예측 — 멈춘 스냅샷은 그대로 보이고 advance 도 진행하지 않는다', () => {
  const cfg = cfgOf(), s0 = createMatch(cfg, 9);
  let p = setLead(createPredictor(cfg, 0), 8);
  p = advance(p, 2);
  p = applySnapshot(p, { tick: 3, state: s0, inputs: idleQ(cfg), paused: true });
  assert.deepEqual(p.predicted, s0);
  const a = advance(p, 2);
  assert.deepEqual(a.predicted, s0);
  const r = applySnapshot(a, { tick: 4, state: s0, inputs: idleQ(cfg), paused: false });
  assert.notDeepEqual(r.predicted, s0, '다시 돌기 시작');
});

test('예측 — 구경(myId null)은 내 입력을 끼우지 않는다', () => {
  const cfg = cfgOf(), s0 = createMatch(cfg, 9);
  const base = [0, 5, 20, 40];
  let p = setLead(createPredictor(cfg, null), 4);
  for (let i = 0; i < 6; i++) p = advance(p, 33 + 2);   // 눌러도 무시
  p = applySnapshot(p, { tick: 1, state: s0, inputs: base, paused: false });
  let want = s0;
  for (let i = 0; i < 4; i++) want = step(want, cfg, base.map(decodeInput));
  assert.deepEqual(p.predicted, want);
  const a = advance(p, 40);
  assert.deepEqual(a.predicted, step(p.predicted, cfg, base.map(decodeInput)));
});

test('예측 — 골로 단계가 바뀌는 틱에서 멈춘다(점수·시계·단계는 스냅샷만)', () => {
  const cfg = cfgOf(1), s0 = createMatch(cfg, 3);
  // 공을 골문 바로 앞에서 오른쪽으로 빠르게 — 몇 틱 안에 골이 난다.
  const near = JSON.parse(JSON.stringify(s0));
  near.phase = 'play'; near.ball = { x: 560, y: 0, vx: 900, vy: 0 };
  assert.equal(near.phase, 'play');
  let ref = near, ticksToGoal = 0;
  while (ref.phase === 'play' && ticksToGoal < 60) { ref = step(ref, cfg, [NO_INPUT, NO_INPUT]); ticksToGoal++; }
  assert.equal(ref.phase, 'goal', '준비한 장면이 실제로 골이 된다');
  let p = setLead(createPredictor(cfg, 0), 20);
  p = applySnapshot(p, { tick: 1, state: near, inputs: [0, 0], paused: false });
  assert.equal(p.predicted.phase, 'play');
  assert.deepEqual(p.predicted.score, [0, 0]);
  for (let i = 0; i < 30; i++) p = advance(p, 0);
  assert.equal(p.predicted.phase, 'play'); assert.deepEqual(p.predicted.score, [0, 0]);
  assert.equal(p.base.phase, 'play');
  // 스냅샷이 골을 알려 주면 그때 따라간다
  p = applySnapshot(p, { tick: 2, state: ref, inputs: [0, 0], paused: false });
  assert.equal(p.predicted.phase, 'goal'); assert.deepEqual(p.predicted.score, ref.score);
});

test('예측 — 방장과 손님(lead 0)은 스냅샷 틱마다 같다(300틱, 6틱마다 스냅샷)', () => {
  const cfg = cfgOf(2), seed = 77;
  let host = createMatch(cfg, seed);
  let guest = createPredictor(cfg, 0);
  const script = (t, i) => (i === 0 ? ((t >> 4) % 5 === 0 ? 0 : 1 + (((t >> 3) % 16) * 2) + ((t >> 5) % 2) + (t % 40 === 0 ? 33 : 0)) : ((t * 7 + i * 13) >> 3) % 66);
  let last = null, checked = 0;
  for (let t = 0; t < 300; t++) {
    const qs = cfg.players.map((_, i) => script(t, i));
    host = hostTick(cfg, host, qs);
    guest = advance(guest, qs[0]);
    if ((t + 1) % 6 === 0) {
      guest = applySnapshot(guest, { tick: host.tick, state: JSON.parse(JSON.stringify(host)), inputs: qs, paused: false });
      assert.deepEqual(guest.predicted, host, `틱 ${host.tick}`);
      checked++;
    }
    last = host;
  }
  assert.equal(checked, 50); assert.ok(last.tick === 300);
});

test('예측 — 새 스냅샷이 예측과 맞으면 화면 상태가 튀지 않는다', () => {
  const cfg = cfgOf(2), lead = 8;
  let host = createMatch(cfg, 5), guest = setLead(createPredictor(cfg, 0), lead);
  const hostQ = [], pending = [];   // 방장이 쓰는 입력(내 입력은 lead 틱 늦게 도착한다고 본다)
  const mineAt = (t) => (t < 40 ? 3 : t < 90 ? 1 + 6 * 2 + 1 : 2 + 2 * 3);
  const hostSnaps = [];
  for (let t = 0; t < 180; t++) {
    const mine = mineAt(t);
    guest = advance(guest, mine);
    // 방장은 내 입력을 lead 틱 늦게 받는다 — 손님이 lead 앞서 그리는 이유
    const delayed = t >= lead ? mineAt(t - lead) : Q_IDLE;
    const qs = [delayed, 0, 0, 0];
    host = hostTick(cfg, host, qs);
    if ((t + 1) % 6 === 0) hostSnaps.push({ tick: host.tick, state: JSON.parse(JSON.stringify(host)), inputs: qs, paused: false });
    if (hostSnaps.length && (t + 1) % 6 === 3) {   // 스냅샷이 3틱 늦게 도착
      const snap = hostSnaps.shift();
      const before = guest.predicted;
      guest = applySnapshot(guest, snap);
      if (before && snap.tick > 60) {
        const dx = Math.abs(guest.predicted.players[0].x - before.players[0].x), dy = Math.abs(guest.predicted.players[0].y - before.players[0].y);
        assert.ok(dx < 6 && dy < 6, `틱 ${snap.tick} 에서 튐 ${dx},${dy}`);
      }
    }
  }
});
