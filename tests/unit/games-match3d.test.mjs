// 3D 경기 온라인(2026-11-07 게임 묶음 4단계) — 입력 양자화·스냅샷 줄이기·방 규칙·방장/손님 세션·예측.
// 공통 어댑터 검사(결정성·JSON·okState 등)는 games-adapter.test.mjs 의 CASES 가 한다. 여기는 3D 경기에만 있는 것.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FACE64, Q3_COUNT, IDLE3, decodeInput3, encodeInput3, faceIndex, urgent3 } from '../../src/lib/game3d/quant.ts';
import { match3d, MATCH3D } from '../../src/lib/games/match3d.ts';
import { DEFAULT_3D, applySettings3d, botSeats3d, buildMatch3d, humanSlots, okSettings3d, startBlock3d } from '../../src/lib/games/match3d-room.ts';
import { createRoom, move, join, autoBalance, setBotPick } from '../../src/lib/game/room.ts';
import { BASE_PERF } from '../../src/lib/game3d/stats.ts';
import { createPredictor, applySnapshot, advance, setLead } from '../../src/lib/games/predict.ts';
import { readSnap } from '../../src/lib/games/net.ts';
import { createHostSession, createGuestSession, STEP_MS } from '../../src/react/game/net/session.ts';
import { createLoopbackHub } from '../../src/react/game/net/transport.ts';
import { rngFrom } from '../../src/react/game/views/match3d/view3d.ts';
import { gameOf } from '../../src/lib/games/registry.ts';

const g = match3d;
const near = (a, b, eps = 1e-12) => Math.abs(a - b) <= eps;

// ═══════════════════ 입력 양자화 ═══════════════════
test('보는 방향 표 — 64개 단위 벡터, 5.625° 간격, 표 값을 넣으면 그 번호, 삼각함수 없이 상수', () => {
  assert.equal(FACE64.length, 64);
  for (let k = 0; k < 64; k++) {
    const [x, y] = FACE64[k];
    assert.ok(near(x * x + y * y, 1, 1e-15), `길이 ${k}`);
    assert.ok(near(x, Math.cos((k * Math.PI) / 32), 1e-15) && near(y, Math.sin((k * Math.PI) / 32), 1e-15), `각도 ${k}`);
    assert.equal(faceIndex(x, y), k);
    assert.ok(!Object.is(x, -0) && !Object.is(y, -0), '−0 없음(JSON 을 오가도 같게)');
  }
  // 소스에 삼각함수·시계·난수 함수가 없다(표는 첫 사분면 16개 상수 + 90도 돌리기)
  for (const f of ['src/lib/game3d/quant.ts', 'src/lib/game3d/sim.ts', 'src/lib/game3d/bot.ts', 'src/lib/games/match3d.ts', 'src/lib/games/match3d-room.ts']) {
    const code = readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(code, /Math\.(sin|cos|tan|atan2?|hypot|pow|exp|log|random)\b|Date\.now|performance\.now|\*\*/, f);
  }
});

test('양자화 — 키 다섯은 각자 따로 오가고, 움직임은 16방향 × 2세기, 정지·범위 밖은 idle', () => {
  assert.equal(Q3_COUNT, 33 * 32 * 65);
  assert.equal(encodeInput3(IDLE3), 0);
  assert.deepEqual(decodeInput3(0), IDLE3);
  const keys = ['shoot', 'pass', 'through', 'lob', 'sprint'];
  for (let mask = 0; mask < 32; mask++) {
    const i = { x: 0.3, y: -0.9, shoot: false, pass: false };
    keys.forEach((k, b) => { i[k] = (mask & (1 << b)) !== 0; });
    const d = decodeInput3(encodeInput3(i));
    for (const k of keys) assert.equal(d[k], i[k], `${k} (mask ${mask})`);
    assert.equal(d.fx, undefined, '보는 방향을 안 주면 안 실린다');
  }
  // 세기: 0.15 밑은 정지, 0.75 밑은 0.5, 그 이상 1
  const mag = (x) => { const d = decodeInput3(encodeInput3({ x, y: 0, shoot: false, pass: false })); return Math.sqrt(d.x * d.x + d.y * d.y); };
  assert.equal(mag(0.1), 0); assert.equal(mag(0.5), 0.5); assert.equal(mag(0.9), 1);
  // 16방향: 22.5° 마다
  for (let k = 0; k < 16; k++) {
    const [x, y] = FACE64[k * 4];
    const d = decodeInput3(encodeInput3({ x, y, shoot: false, pass: false }));
    assert.equal(d.x, x); assert.equal(d.y, y);
  }
  for (const bad of [-1, Q3_COUNT, 2.5, NaN, null, '7']) assert.deepEqual(decodeInput3(bad), IDLE3);
  // NaN·무한 입력은 정지로
  assert.equal(encodeInput3({ x: NaN, y: Infinity, shoot: false, pass: false }), 0);
});

test('1인칭 — 보는 방향은 64방향 표 값으로 오가고, 앞으로 가기는 정확히 그 방향(보낸 값 = 예측이 쓰는 값)', () => {
  for (let k = 0; k < 64; k++) {
    const a = ((k + 0.3) * Math.PI) / 32;   // 표 사이 각도(화면 쪽 시선은 연속값이다)
    const fx = Math.cos(a), fy = Math.sin(a);
    for (const fwd of [1, 0.5, -1, 0]) {
      const q = encodeInput3({ x: fx * fwd, y: fy * fwd, shoot: false, pass: false, fx, fy });
      const d = decodeInput3(q);
      assert.deepEqual([d.fx, d.fy], [...FACE64[k]], `보는 방향 ${k}`);
      if (fwd === 0) { assert.equal(d.x, 0); assert.equal(d.y, 0); continue; }
      const m = Math.abs(fwd) < 0.75 ? 0.5 : 1;
      // 앞(뒤)으로 = 표의 보는 방향 × 세기, 곱셈만이라 정확히
      assert.ok(near(d.x, Math.sign(fwd) * FACE64[k][0] * m, 1e-15) && near(d.y, Math.sign(fwd) * FACE64[k][1] * m, 1e-15), `앞뒤 ${k} ${fwd}`);
      assert.equal(encodeInput3(d), q, '풀어 쓴 값을 다시 넣어도 같은 정수');
    }
  }
});

test('급한 입력 — 슛·패스·스루·로빙 눌림이 바뀐 것만, 질주·움직임·보는 방향은 간격을 지킨다', () => {
  const q = (o) => encodeInput3({ x: 0, y: 0, shoot: false, pass: false, ...o });
  for (const k of ['shoot', 'pass', 'through', 'lob']) assert.equal(urgent3(q({}), q({ [k]: true })), true, k);
  assert.equal(urgent3(q({}), q({ sprint: true })), false);
  assert.equal(urgent3(q({ x: 1 }), q({ x: -1 })), false);
  assert.equal(urgent3(q({ fx: 1, fy: 0 }), q({ fx: 0, fy: 1 })), false);
  assert.equal(g.urgent, urgent3);
});

// ═══════════════════ 스냅샷 크기 ═══════════════════
const cfg5 = (human = []) => ({
  minutes: 3, scoreLimit: 0,
  players: Array.from({ length: 10 }, (_, i) => ({ id: i, num: 100 + i, name: `선수이름${i}`, side: i < 5 ? 0 : 1, bot: !human.includes(i), gk: i % 5 === 0, perf: { ...BASE_PERF, maxSpeed: 6.8 * (1 + ((i % 3) - 1) * 0.0731) } })),
});

test('스냅샷 — 5대5 봇 경기 내내 한 건(메시지 통째) 2.5KB 이하, 줄이기 전의 절반 아래', () => {
  const config = cfg5();
  let s = g.create(config, 777);
  let maxMsg = 0, maxRaw = 0;
  for (let t = 0; t < 60 * 60 && !g.ended(s); t++) {
    const qs = Array.from({ length: 10 }, (_, i) => g.encode(g.botInput(s, config, i)));
    s = g.step(s, config, qs.map((q) => g.decode(q)));
    if (t % 6) continue;
    const msg = JSON.stringify({ t: 'snap', from: 'c-0123456789abcdef', seed: 4294967295, tick: s.tick, state: g.pack(s), inputs: qs, paused: false });
    maxMsg = Math.max(maxMsg, msg.length); maxRaw = Math.max(maxRaw, JSON.stringify(s).length);
  }
  assert.ok(maxMsg <= 2500, `한 건 ${maxMsg}B`);
  assert.ok(maxMsg < maxRaw / 2, `줄이기 전 ${maxRaw}B`);
});

// ═══════════════════ 방 규칙 ═══════════════════
const roster = (n = 16) => Array.from({ length: n }, (_, i) => ({
  num: 100 + i, jersey: i + 1, name: `선수${i}`, pos: '', detail: '', foot: '', vest: null, note: '',
  pace: 60 + i, dribble: 60, pass: 60, shoot: 60, defend: 60, stamina: 60, rot: null, avatar: '',
}));
const who = (i, num = 100 + i) => ({ clientId: `c${i}`, num, name: `선수${num - 100}` });
function roomWith(teams, settings = DEFAULT_3D) {
  let r = createRoom('ABCD', who(0), 'match3d', { ...settings });
  for (let i = 1; i < teams.length; i++) { const j = join(r, who(i)); assert.ok(j.ok); r = j.room; }
  teams.forEach((t, i) => { r = move(r, `c${i}`, t); });
  return r;
}

test('방 시작 — 편마다 [골키퍼 봇, 필드…], 사람은 자기 선수로 앞줄부터, 대기는 구경, 설정이 그대로', () => {
  const R = roster();
  const room = roomWith([0, 1, 0, null], { outfield: 4, minutes: 2, scoreLimit: 3 });
  const { config, slots } = buildMatch3d(room, R, rngFrom(5));
  assert.ok(g.okConfig(config));
  assert.equal(config.minutes, 2); assert.equal(config.scoreLimit, 3);
  for (const side of [0, 1]) {
    const mine = config.players.filter((p) => p.side === side);
    assert.equal(mine.length, 5);
    assert.ok(mine[0].gk && mine[0].bot, '첫 자리는 골키퍼 봇');
    assert.ok(mine.slice(1).every((p) => !p.gk));
  }
  // 사람: c0(100)·c2(102) 는 주황 앞줄(slot 3·4), c1(101) 은 흰 앞줄(slot 3) — 자기 선수 번호·이름 그대로
  const at = (side, slot) => config.players.filter((p) => p.side === side)[slot];
  assert.deepEqual([at(0, 3).num, at(0, 4).num, at(1, 3).num], [100, 102, 101]);
  assert.ok([at(0, 3), at(0, 4), at(1, 3)].every((p) => !p.bot));
  assert.equal(slots[at(0, 3).id], 'c0'); assert.equal(slots[at(1, 3).id], 'c1');
  assert.ok(!slots.includes('c3'), '대기 칸은 구경');
  assert.equal(new Set(config.players.map((p) => p.num)).size, 10, '봇이 사람·서로와 겹치지 않는다');
  assert.ok(!config.players.some((p) => p.num === 103), '대기 칸 사람의 선수는 봇으로도 안 나온다');
  assert.deepEqual(humanSlots(4), [3, 4, 1, 2]); assert.deepEqual(humanSlots(3), [2, 3, 1]); assert.deepEqual(humanSlots(2), [2, 1]);
});

test('방 시작 — 필드 수(2~4)만큼, 사람이 더 많은 편은 사람 수대로, 봇 자리 = 골키퍼 + 빈 필드', () => {
  const R = roster();
  const room = roomWith([0, 0, 0, 1], { outfield: 2, minutes: 3, scoreLimit: 0 });
  assert.deepEqual(botSeats3d(room), [1, 2]);
  const { config } = buildMatch3d(room, R, rngFrom(1));
  assert.deepEqual([0, 1].map((s) => config.players.filter((p) => p.side === s).length), [4, 3]);
  assert.ok(g.okConfig(config));
  assert.deepEqual(applySettings3d(DEFAULT_3D, { outfield: 9, minutes: 0, scoreLimit: 99 }), { outfield: 4, minutes: 1, scoreLimit: 20 });
  assert.equal(applySettings3d(DEFAULT_3D, { outfield: 4 }), DEFAULT_3D, '안 바뀌면 같은 객체');
  assert.ok(okSettings3d(DEFAULT_3D));
  for (const bad of [{ ...DEFAULT_3D, outfield: 1 }, { ...DEFAULT_3D, outfield: 5 }, { ...DEFAULT_3D, minutes: 0 }, { outfield: 4, minutes: 3 }, null]) assert.equal(okSettings3d(bad), false);
});

test('방 시작 — 고른 봇: 편마다 첫 칸이 골키퍼, 다음이 필드 봇 차례(2D 와 같은 뽑기 함수)', () => {
  const R = roster();
  let room = roomWith([0, 1]);
  room = setBotPick(room, 0, 0, 110, R.map((p) => p.num));   // 주황 골키퍼
  room = setBotPick(room, 0, 1, 111, R.map((p) => p.num));   // 주황 필드 봇 첫째
  room = setBotPick(room, 1, 0, 112, R.map((p) => p.num));   // 흰 골키퍼
  const { config } = buildMatch3d(room, R, rngFrom(9));
  const side = (s) => config.players.filter((p) => p.side === s);
  assert.equal(side(0)[0].num, 110); assert.ok(side(0)[0].gk);
  assert.equal(side(0).find((p) => p.bot && !p.gk).num, 111, '필드 봇 첫 자리(slot 1)');
  assert.equal(side(1)[0].num, 112);
  assert.equal(MATCH3D.botSeatTag(room, 0, 0), '키퍼');
  assert.equal(MATCH3D.botSeatTag(room, 0, 1), null);
});

test('방 시작을 막는 것 — 사람 9명, 한 편 필드 5명, 명단이 모자람. 자동 나누기는 한 편 4명 이하로', () => {
  const R = roster(20);
  const nine = roomWith([0, 0, 0, 0, 1, 1, 1, 1, 1]);
  assert.equal(startBlock3d(nine, R), 'humans');
  assert.throws(() => buildMatch3d(nine, R, rngFrom(1)), RangeError);
  const five = roomWith([0, 0, 0, 0, 0, 1]);
  assert.equal(startBlock3d(five, R), 'side');
  assert.ok(MATCH3D.startBlock(five, R).includes('4명'));
  const small = roomWith([0, 1]);
  assert.equal(startBlock3d(small, roster(9)), 'roster', '5대5 는 열 명이 있어야');
  assert.equal(startBlock3d({ ...small, settings: { ...small.settings, outfield: 3 } }, roster(9)), null);
  const eight = autoBalance(roomWith([null, null, null, null, null, null, null, null]), R);
  assert.deepEqual([0, 1].map((t) => eight.members.filter((m) => m.team === t).length), [4, 4]);
  assert.equal(startBlock3d(eight, R), null);
});

// ═══════════════════ 예측 = 방장 계산 ═══════════════════
test('방장 계산과 손님 예측은 같은 양자화 입력이면 스냅샷 틱마다 같다(1인칭 보는 방향·질주·슛 모으기 포함, pack 을 거쳐도)', () => {
  const config = cfg5([3]);
  const me = 3, LEAD = 9;
  const r = rngFrom(42);
  // 손님의 1인칭 조작 — 연속 시선(화면 쪽)을 돌리며 앞으로, 가끔 슛을 모았다 떼고 질주
  let heading = 0;
  const myInput = (t) => {
    heading += 0.03 * Math.sin(t / 40);
    const fwd = t % 200 < 150 ? 1 : 0.4;
    return { x: Math.cos(heading) * fwd, y: Math.sin(heading) * fwd, shoot: t % 90 > 60, pass: t % 170 === 100, sprint: t % 300 < 120, fx: Math.cos(heading), fy: Math.sin(heading) };
  };
  let host = g.create(config, 2024);
  let pred = setLead(createPredictor(g, config, me), LEAD);
  const hist = [];   // 방장 쪽: 틱마다의 상태와 그 틱에 쓴 입력 정수들
  let checked = 0;
  for (let t = 0; t < 1500; t++) {
    const mq = g.encode(myInput(t));
    // 다른 자리는 정지(봇 입력을 쓰면 예측기는 스냅샷의 입력을 이어 쓰므로 lead 동안 달라질 수 있다 — 여기선 같은 입력 조건을 시험한다)
    const qs = Array.from({ length: 10 }, (_, i) => (i === me ? mq : g.encode(g.idle)));
    hist.push({ state: host, qs });
    host = g.step(host, config, qs.map((q) => g.decode(q)));
    pred = advance(pred, mq);
    // LEAD 틱 전의 스냅샷이 지금 막 닿았다 — 그 상태 + 내 기록 LEAD 개로 다시 돌린 예측 = 지금 방장 상태
    if ((t + 1) % 6 === 0 && t + 1 > LEAD) {
      const snapAt = hist[t + 1 - LEAD];
      const msg = JSON.parse(JSON.stringify({ t: 'snap', from: 'h', seed: 1, tick: snapAt.state.tick, state: g.pack(snapAt.state), inputs: snapAt.qs, paused: false }));
      const snap = readSnap(g, config, msg);
      assert.ok(snap, '스냅샷이 풀린다');
      pred = applySnapshot(pred, snap);
      const phaseSame = hist.slice(t + 1 - LEAD).every((h) => h.state.phase === snapAt.state.phase) && host.phase === snapAt.state.phase;
      if (phaseSame) { assert.deepEqual(pred.predicted, host, `틱 ${host.tick}`); checked++; }
    }
  }
  assert.ok(checked > 150, `맞춰 본 스냅샷 ${checked}`);
  assert.ok(host.count.shots[0] + host.count.passes[0] > 0, '손님이 실제로 찼다');
  void r;
});

// ═══════════════════ 방장 + 손님 둘(메모리 길) ═══════════════════
const G = { games: gameOf, game: 'match3d' };
function world({ delayMs = 30 } = {}) {
  const clock = { t: 1000 };
  const now = () => clock.t;
  const hub = createLoopbackHub({ delayMs, now });
  const R = roster(16);
  const hostEp = hub.endpoint();
  const host = createHostSession({ transport: hostEp, roster: R, me: who(0), code: 'ABCD', now, rnd: rngFrom(7), ...G });
  const gEps = [], gs = [];
  for (let i = 1; i <= 2; i++) {
    const ep = hub.endpoint();
    gs.push(createGuestSession({ transport: ep, roster: R, me: who(i), code: 'ABCD', now, ...G }));
    gEps.push(ep);
  }
  const run = (ms) => {
    const end = clock.t + ms;
    while (clock.t < end) { clock.t = Math.min(end, clock.t + STEP_MS); hub.pump(clock.t); host.advance(); gs.forEach((x) => x.advance()); }
  };
  return { clock, hub, host, hostEp, gs, gEps, run };
}

test('방장 + 손님 둘 — 들어오기, 자동 나누기, 시작, 손님 입력(움직임·질주·1인칭 보는 방향·패스·모은 슛)이 방장 상태의 그 선수를 바꾼다', () => {
  const w = world();
  w.run(1500);
  assert.equal(w.host.getRoom().game, 'match3d');
  assert.deepEqual(w.host.getRoom().settings, DEFAULT_3D);
  for (const x of w.gs) assert.equal(x.getView().stage, 'lobby');
  w.host.autoBalance();
  w.run(200);
  for (const x of w.gs) assert.deepEqual(x.getRoom(), w.host.getRoom());
  assert.ok(w.host.start());
  w.run(400);
  const cfg = w.host.getConfig();
  assert.ok(g.okConfig(cfg));
  const g1 = w.gs[0];
  const id = g1.getPredictor().myId;
  assert.notEqual(id, null);
  assert.equal(cfg.players[id].num, 101);
  assert.equal(g1.getView().game, 'match3d');
  // 움직임 + 질주 — 경기 좌표로 +y
  w.run(3200);   // 킥오프가 풀릴 때까지(3초)
  let reader = { x: 0, y: 1, shoot: false, pass: false, sprint: true };
  g1.setInputReader(() => reader);
  const y0 = w.host.getState().players[id].y;
  w.run(700);
  const p1 = w.host.getState().players[id];
  assert.ok(p1.y - y0 > 2, `방장 상태에서 움직였다 ${y0} → ${p1.y}`);
  assert.equal(p1.sprint, true, '질주가 방장 상태에');
  // 1인칭 보는 방향 — 표 값 그대로 방장 상태에
  const k = 40;
  reader = { x: 0, y: 0, shoot: false, pass: false, fx: Math.cos((k * Math.PI) / 32 + 0.01), fy: Math.sin((k * Math.PI) / 32 + 0.01) };
  w.run(500);
  const p2 = w.host.getState().players[id];
  assert.deepEqual([p2.fx, p2.fy], [...FACE64[k]]);
  // 공을 손님 발밑에 두고(방장 디버그 패치) 슛을 모았다 뗀다 → 방장이 그 손님의 슛으로 센다
  w.host.debugPatch((s) => ({ ...s, owner: id, ball: { ...s.ball, x: p2.x + 0.6, y: p2.y, z: 0.18, vx: 0, vy: 0, vz: 0 } }));
  reader = { x: 1, y: 0, shoot: true, pass: false };
  w.run(400);
  assert.ok(w.host.getState().players[id].charge > 10, '슛을 모은다(눌림만 오가고 세기는 상태가 센다)');
  const shots0 = w.host.getState().count.shots[cfg.players[id].side];
  reader = { x: 1, y: 0, shoot: false, pass: false };
  w.run(300);
  const s3 = w.host.getState();
  assert.equal(s3.count.shots[cfg.players[id].side], shots0 + 1, '뗀 순간 슛');
  assert.equal(s3.lastKick.by, id);
  // 패스 — 다시 발밑에 두고 눌렀다 뗀다
  w.host.debugPatch((s) => ({ ...s, owner: id, ball: { ...s.ball, x: s.players[id].x + 0.6, y: s.players[id].y, z: 0.18, vx: 0, vy: 0, vz: 0 } }));
  const passes0 = w.host.getState().count.passes[cfg.players[id].side];
  reader = { x: 0, y: 0, shoot: false, pass: true }; w.run(150);
  reader = { x: 0, y: 0, shoot: false, pass: false }; w.run(300);
  assert.equal(w.host.getState().count.passes[cfg.players[id].side], passes0 + 1, '패스');
  // 스냅샷이 손님 둘에게 — base 틱이 따라오고, 예측한 내 선수는 방장 것과 가깝다
  for (const x of w.gs) assert.ok(w.host.getState().tick - x.getBase().tick < 20, '스냅샷이 계속 온다');
  const gp = g1.getState().players[id], hp = w.host.getState().players[id];
  assert.ok(Math.hypot(gp.x - hp.x, gp.y - hp.y) < 1.5, '예측이 방장 상태와 가깝다');
  // 손님이 받은 상태도 이 판의 3D 상태(풀린 것)
  assert.ok(g.okState(g1.getBase(), cfg));
});

test('방장 + 손님 — 경기가 끝나면 모두 결과, 4초 뒤 로비. 골이 손님에게 닿는다. 메시지 수와 크기', () => {
  const w = world();
  w.run(1500);
  w.host.setSettings({ minutes: 1, outfield: 2 });
  w.host.autoBalance();
  w.run(200);
  assert.ok(w.host.start());
  const sent0 = w.hostEp.sent, g0 = w.gEps[0].sent;
  let bytes = 0, snaps = 0;
  w.hub.endpoint().onMessage((m) => { if (m.t === 'snap') { snaps++; bytes += JSON.stringify(m).length; } });
  // 골이 날 때까지 — 방장 디버그로 골 바로 앞에 공을 둔다(골 장면이 손님 스냅샷 점수로 닿는지)
  w.run(3500);
  w.host.debugPatch((s) => ({ ...s, phase: 'play', owner: null, ball: { x: 17.9, y: 0, z: 0.18, vx: 8, vy: 0, vz: 0 } }));
  w.run(500);
  const sc = w.host.getState().score;
  assert.equal(sc[0] + sc[1], 1, '골');
  for (const x of w.gs) { assert.deepEqual(x.getBase().score, sc, '손님 스냅샷에 점수'); assert.equal(x.getBase().phase, 'goal'); }
  w.run(60000);
  assert.ok(w.host.getView().result, '방장 결과');
  for (const x of w.gs) assert.ok(x.getView().result, '손님 결과');
  const secs = 3.5 + 0.5 + 60;
  const hostRate = (w.hostEp.sent - sent0) / secs, guestRate = (w.gEps[0].sent - g0) / secs;
  assert.ok(hostRate <= 13, `방장 초당 ${hostRate.toFixed(1)}`);
  assert.ok(guestRate <= 4, `손님 초당 ${guestRate.toFixed(1)}`);
  assert.ok(bytes / snaps <= 2500, `스냅샷 평균 ${Math.round(bytes / snaps)}B`);
  w.run(4500);
  assert.equal(w.host.getView().stage, 'lobby');
  for (const x of w.gs) assert.equal(x.getView().stage, 'lobby');
  assert.equal(w.host.getRoom().phase, 'lobby');
});
