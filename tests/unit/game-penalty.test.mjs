// 2D 승부차기(2026-11-07 게임 묶음 2단계) — 규칙 검사. 약속 검사(결정성·JSON·모양)는 games-adapter.test.mjs 가 한다.
// 스펙 docs/superpowers/specs/2026-11-07-games-program-design.md §3.1
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  penalty2d as g, PENALTY2D, buildPenalty, decided, deviationOf, speedOf, shotSkill,
  AIM_TICKS, AUTO_POWER, CHARGE_TICKS, DEV_MAX, DEV_MIN, DIVE_TICKS, KEEPER_X_MAX, KEEPER_Y, LIE_TICKS, READY_TICKS, SD_MAX, SPOT_Y,
} from '../../src/lib/games/penalty2d.ts';
import { BASE_PERF } from '../../src/lib/game/stats.ts';
import { createRoom, join, move } from '../../src/lib/game/room.ts';
import { penInput, AIM_START } from '../../src/react/game/views/penalty2d/aim.ts';
import { penCfg } from './fixtures/games-cases-p2.mjs';

const IDLE = { x: 0, kick: false, aim: null };
const botsAll = (s, c) => c.players.map((_, i) => g.decode(g.encode(g.botInput(s, c, i))));
/** 봇끼리 끝까지. */
function playOut(config, seed) {
  let s = g.create(config, seed), t = 0;
  while (!g.ended(s) && t < 60 * 60 * 20) { s = g.step(s, config, botsAll(s, config)); t++; }
  return s;
}
/** 조준 단계까지 아무도 안 누르고 간다. */
function toAim(config, seed) {
  let s = g.create(config, seed);
  const idle = config.players.map(() => IDLE);
  while (s.phase !== 'aim') s = g.step(s, config, idle);
  return s;
}
const roster = Array.from({ length: 14 }, (_, i) => ({ num: 100 + i, jersey: i + 1, name: `선수${i}`, pace: 60, dribble: 60, pass: 60, shoot: 40 + i * 4, defend: 60, stamina: 60, avatar: '' }));
const rngOf = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

test('번갈아 찬다 — 두 편 사람 수가 달라도 키커는 그 편 차례대로, 키퍼는 상대 편 차례대로', () => {
  // 0 편 2명(자리 0·1), 1 편 3명(2·3·4), 0 편 먼저.
  const config = penCfg(2, 3, 5, 0, 5);
  for (let seed = 1; seed <= 30; seed++) {
    const s = playOut(config, seed);
    s.log.forEach((e, k) => assert.equal(e.side, k % 2, `${seed}: ${k} 번째 차기 편`));
    const by = (side) => s.log.filter((e) => e.side === side);
    by(0).forEach((e, j) => { assert.equal(e.kicker, [0, 1][j % 2]); assert.equal(e.keeper, [2, 3, 4][j % 3]); });
    by(1).forEach((e, j) => { assert.equal(e.kicker, [2, 3, 4][j % 3]); assert.equal(e.keeper, [0, 1][j % 2]); });
  }
  // 1 편 먼저면 1 편이 첫 차기
  assert.equal(playOut(penCfg(2, 3, 5, 1, 5), 3).log[0].side, 1);
});

test('혼자 — 사람 한 명이 우리 편 차기를 모두 차고, 상대 차기를 모두 막는다', () => {
  const config = penCfg(1, 5, 5, 0, 1);
  const s = playOut(config, 9);
  for (const e of s.log) {
    if (e.side === 0) assert.equal(e.kicker, 0); else assert.equal(e.keeper, 0);
  }
});

test('일찍 끝남 — 남은 차기를 다 넣어도 못 따라잡으면 끝, 아니면 계속', () => {
  assert.equal(decided([3, 3], [3, 0], 5), 0);      // 0:3, 1 편 남은 2번 다 넣어도 2
  assert.equal(decided([3, 2], [3, 0], 5), null);   // 1 편 남은 3번 → 3 이면 같다
  assert.equal(decided([3, 3], [0, 3], 5), 1);
  assert.equal(decided([2, 2], [2, 0], 3), 0);      // 3번씩: 1 편 남은 1번 다 넣어도 1 < 2
  assert.equal(decided([2, 2], [1, 0], 3), null);   // 1 편이 넣고 0 편이 못 넣으면 같아진다
  assert.equal(decided([3, 2], [3, 1], 3), 0);      // 1 편 마지막 하나 넣어도 2 < 3
  assert.equal(decided([5, 5], [4, 3], 5), 0);
  assert.equal(decided([5, 4], [4, 4], 5), null);   // 1 편이 아직 하나
  // 봇끼리에서도 다섯 번을 다 차기 전에 끝나는 판이 나온다
  let early = 0;
  for (let seed = 1; seed <= 60; seed++) { const s = playOut(penCfg(1, 1, 5, 0, 0), seed); if (s.taken[0] + s.taken[1] < 10) early++; }
  assert.ok(early > 0, '일찍 끝난 판이 하나도 없다');
});

test('서든데스 — 같으면 한 쌍씩 더, 쌍이 끝났을 때 다르면 끝. 너무 길면 무승부', () => {
  assert.equal(decided([5, 5], [3, 3], 5), null);
  assert.equal(decided([6, 5], [4, 3], 5), null, '먼저 찬 편이 넣어도 상대가 하나 남았다');
  assert.equal(decided([6, 6], [4, 3], 5), 0);
  assert.equal(decided([6, 6], [4, 4], 5), null);
  assert.equal(decided([6, 5], [3, 3], 5), null);
  assert.equal(decided([5 + SD_MAX, 5 + SD_MAX], [9, 9], 5), 'draw');
  let sd = 0;
  for (let seed = 1; seed <= 80; seed++) {
    const s = playOut(penCfg(1, 1, 3, 0, 0), seed);
    if (s.taken[0] > 3) {
      sd++;
      assert.equal(s.taken[0], s.taken[1], '서든데스는 쌍으로 끝난다');
      assert.notEqual(s.scored[0], s.scored[1]);
    }
  }
  assert.ok(sd > 0, '서든데스까지 간 판이 없다');
});

test('5초 안에 안 차면 약한 가운데 슛이 나간다', () => {
  const config = penCfg(1, 1, 5, 0, 2);
  let s = toAim(config, 5);
  const idle = config.players.map(() => IDLE);
  for (let t = 0; t < AIM_TICKS - 1; t++) { s = g.step(s, config, idle); assert.equal(s.phase, 'aim'); }
  s = g.step(s, config, idle);
  assert.equal(s.phase, 'flight');
  assert.equal(s.power, AUTO_POWER);
  const sp = Math.hypot(s.ball.vx, s.ball.vy);
  assert.ok(Math.abs(sp - speedOf(AUTO_POWER)) < 1e-6);
  const tx = s.ball.x + s.ball.vx * (s.ball.y / -s.ball.vy);
  assert.ok(Math.abs(tx) <= deviationOf(AUTO_POWER, BASE_PERF) + 1e-6, `가운데에서 흔들림 안: ${tx}`);
});

test('세기 ↔ 흔들림 — 세기가 클수록 빠르고 흔들림이 커진다(범위 안), 실제 슛도 그 폭 안', () => {
  let last = -1, lastV = -1;
  for (let p = 0; p <= 1.0001; p += 0.05) {
    const d = deviationOf(p, BASE_PERF), v = speedOf(p);
    assert.ok(d >= last && v > lastV, `세기 ${p.toFixed(2)}`);
    assert.ok(d >= DEV_MIN * 0.9 - 1e-9 && d <= DEV_MAX * 1.1 + 1e-9);
    last = d; lastV = v;
  }
  assert.ok(deviationOf(1, BASE_PERF) > deviationOf(0.3, BASE_PERF) * 3);
  // 실제 슛 — 조준 60 에 세기를 바꿔 가며 씨앗 여럿: 골라인에서 조준과의 차이는 그 세기의 폭 안
  const config = penCfg(1, 1, 5, 0, 2);
  for (const hold of [6, 30, 72]) for (let seed = 1; seed <= 25; seed++) {
    let s = toAim(config, seed);
    for (let t = 0; t < hold; t++) s = g.step(s, config, [{ x: 0, kick: true, aim: null }, IDLE]);
    s = g.step(s, config, [{ x: 0, kick: false, aim: 60 }, IDLE]);
    assert.equal(s.phase, 'flight');
    const tx = s.ball.x + s.ball.vx * (s.ball.y / -s.ball.vy);
    assert.ok(Math.abs(tx - 60) <= deviationOf(hold / CHARGE_TICKS, BASE_PERF) + 1e-6, `hold ${hold} seed ${seed}: ${tx}`);
  }
});

test('능력치(슈팅)는 흔들림을 ±10% 안에서만 바꾼다', () => {
  const lo = { ...BASE_PERF, kick: BASE_PERF.kick * 0.5 }, hi = { ...BASE_PERF, kick: BASE_PERF.kick * 2 };
  assert.equal(shotSkill(lo), 0.9); assert.equal(shotSkill(hi), 1.1); assert.equal(shotSkill(BASE_PERF), 1);
  for (const p of [0, 0.5, 1]) {
    const base = deviationOf(p, BASE_PERF);
    assert.ok(Math.abs(deviationOf(p, lo) / base - 1.1) < 1e-9);
    assert.ok(Math.abs(deviationOf(p, hi) / base - 0.9) < 1e-9);
  }
});

test('키퍼는 줄을 못 벗어난다 — 아무렇게나 움직이고 던져도 y 는 줄, x 는 기둥 바깥 조금까지', () => {
  const config = penCfg(1, 1, 5, 0, 2);
  const r = rngOf(4);
  let s = g.create(config, 2);
  for (let t = 0; t < 60 * 120 && !g.ended(s); t++) {
    const rand = { x: r() * 2 - 1, kick: r() < 0.2, aim: r() < 0.5 ? null : (r() * 2 - 1) * 200 };
    s = g.step(s, config, [rand, { x: r() < 0.5 ? -1 : 1, kick: r() < 0.1, aim: null }].map((i) => g.decode(g.encode(i))));
    assert.equal(s.gk.y, KEEPER_Y);
    assert.ok(Math.abs(s.gk.x) <= KEEPER_X_MAX + 1e-9, `틱 ${t}: ${s.gk.x}`);
  }
});

test('몸 던지기 — 누른 쪽으로 빠르게, 그다음 누워 있고(못 움직임), 일어나면 걷는다. 한 차기에 한 번', () => {
  const config = penCfg(1, 1, 5, 0, 2);
  let s = toAim(config, 1);
  const keep = (i) => [IDLE, i];
  s = g.step(s, config, keep({ x: 1, kick: false, aim: null }));   // 뗀 적이 있어야 던질 수 있다
  const x0 = s.gk.x;
  s = g.step(s, config, keep({ x: 1, kick: true, aim: null }));
  assert.equal(s.gk.dived, true); assert.equal(s.gk.dive, 1);
  for (let t = 1; t < DIVE_TICKS; t++) s = g.step(s, config, keep({ x: -1, kick: true, aim: null }));
  assert.ok(s.gk.x > x0 + 60, `던져서 오른쪽으로: ${x0} → ${s.gk.x}`);
  assert.equal(s.gk.diveT, 0); assert.equal(s.gk.lie, LIE_TICKS);
  const xl = s.gk.x;
  for (let t = 0; t < LIE_TICKS; t++) s = g.step(s, config, keep({ x: -1, kick: false, aim: null }));
  assert.equal(s.gk.x, xl, '누워 있는 동안은 안 움직인다');
  s = g.step(s, config, keep({ x: -1, kick: true, aim: null }));
  assert.equal(s.gk.diveT, 0, '두 번째 던지기는 없다');
  for (let t = 0; t < 30; t++) s = g.step(s, config, keep({ x: -1, kick: false, aim: null }));
  assert.ok(s.gk.x < xl - 20, '일어나서 걷는다');
});

test('앞 차기에서 누른 채 넘어온 킥은 바로 나가지 않는다(뗐다 눌러야 센다)', () => {
  const config = penCfg(1, 1, 5, 0, 2);
  let s = g.create(config, 3);
  const hold = [{ x: 0, kick: true, aim: null }, { x: 1, kick: true, aim: null }];
  while (s.phase === 'ready') s = g.step(s, config, hold);
  for (let t = 0; t < 30; t++) s = g.step(s, config, hold);
  assert.equal(s.st.charge, 0, '키커 세기가 안 모인다');
  assert.equal(s.gk.dived, false, '키퍼도 안 던진다');
});

test('조준은 차기 전엔 상태에도 입력(방송되는 정수)에도 없다 — 왼쪽을 겨눈 판과 오른쪽을 겨눈 판이 차는 순간까지 같다', () => {
  const config = penCfg(1, 1, 5, 0, 2);
  // 키커 화면(penInput)이 스틱을 받아 입력을 만든다 — 한 판은 왼쪽으로, 한 판은 오른쪽으로 1초 겨누고, 0.5초 모았다가 뗀다.
  function run(stickX) {
    let s = g.create(config, 11), local = { ...AIM_START, kickNo: 0 };
    const states = [], qs = [];
    for (let t = 0; t < 600; t++) {
      const inAim = s.phase === 'aim';
      const h = { x: inAim && s.phaseTicks < 60 ? stickX : 0, kick: inAim && s.phaseTicks >= 60 && s.phaseTicks < 90 };
      const r = penInput(local, h, 'kick', s.phase); local = r.local;
      const q = [g.encode(r.input), g.encode(IDLE)];
      const next = g.step(s, config, q.map((x) => g.decode(x)));
      if (next.phase === 'flight') return { states, qs, struck: next };
      states.push(JSON.stringify(s)); qs.push(q.join(','));
      s = next;
    }
    throw new Error('안 찼다');
  }
  const L = run(-1), R = run(1);
  assert.deepEqual(L.states, R.states, '차기 전 상태가 같다');
  assert.deepEqual(L.qs, R.qs, '차기 전 입력 정수가 같다');
  assert.ok(L.struck.ball.vx < 0 && R.struck.ball.vx > 0, '찬 순간에야 갈린다');
});

test('봇끼리 많은 판 — 성공률이 65~80% 근처, 늘 같은 점수가 아니다', () => {
  let goals = 0, kicks = 0;
  const finals = new Set();
  for (let seed = 1; seed <= 200; seed++) {
    const s = playOut(penCfg(5, 5, 5, seed % 2, 0), seed * 7919);
    assert.ok(g.ended(s));
    goals += s.log.filter((e) => e.out === 'goal').length; kicks += s.log.length;
    finals.add(`${s.scored[0]}-${s.scored[1]}`);
  }
  const rate = goals / kicks;
  assert.ok(rate > 0.6 && rate < 0.85, `성공률 ${rate.toFixed(3)}`);
  assert.ok(finals.size >= 8, `점수 가짓수 ${finals.size}`);
  assert.ok(!finals.has('0-0'), '0:0 은 끝날 수 없다');
});

test('방 — 사람 없는 편은 봇 편(차는 횟수만큼), 사람 편은 사람만, 대기 칸은 구경', () => {
  let room = createRoom('ABCD', { clientId: 'h', num: 100, name: '방장' }, 'penalty2d', PENALTY2D.defaultSettings);
  room = join(room, { clientId: 'a', num: 101, name: 'A' }).room;
  room = join(room, { clientId: 'b', num: 102, name: 'B' }).room;
  room = move(room, 'h', 0); room = move(room, 'a', 0);
  assert.deepEqual(PENALTY2D.botSeats(room), [0, 5]);
  assert.equal(PENALTY2D.startBlock(room, roster), null);
  const { config, slots } = PENALTY2D.buildConfig(room, roster, rngOf(1));
  assert.ok(g.okConfig(config));
  assert.deepEqual(slots.slice(0, 2), ['h', 'a']);
  assert.equal(config.players.filter((p) => p.side === 1).length, 5);
  assert.ok(config.players.filter((p) => p.side === 1).every((p) => p.bot && ![100, 101, 102].includes(p.num)), '봇은 방 사람 선수가 아니다');
  assert.equal(slots.indexOf('b'), -1, '대기 칸은 자리가 없다');
  // 등번호가 설정에 실린다(화면에 보이는 번호)
  assert.equal(config.players[0].jersey, 1);
  // 설정 고치기
  assert.equal(PENALTY2D.applySettings(PENALTY2D.defaultSettings, {}), PENALTY2D.defaultSettings);
  assert.deepEqual(PENALTY2D.applySettings(PENALTY2D.defaultSettings, { kicks: 3, first: 1 }), { kicks: 3, first: 1 });
  assert.deepEqual(PENALTY2D.applySettings(PENALTY2D.defaultSettings, { kicks: 4, first: 'x' }), PENALTY2D.defaultSettings);
  // 사람 9명이면 못 시작
  let big = createRoom('ABCD', { clientId: 'c0', num: 100, name: '0' }, 'penalty2d', PENALTY2D.defaultSettings);
  for (let i = 1; i < 9; i++) big = join(big, { clientId: `c${i}`, num: 100 + i, name: String(i) }).room;
  for (let i = 0; i < 9; i++) big = move(big, `c${i}`, i % 2);
  assert.match(PENALTY2D.startBlock(big, roster), /8명/);
});

test('buildPenalty — 명단이 모자라면 있는 만큼 봇, 하나도 없으면 막힌다', () => {
  const two = roster.slice(0, 2);
  const { config } = buildPenalty({ humans: [[{ num: 100, name: 'a', clientId: null }], []], kicks: 5, first: 0, roster: two, rnd: rngOf(2) });
  assert.equal(config.players.length, 2);
  assert.throws(() => buildPenalty({ humans: [[{ num: 100, name: 'a', clientId: null }], []], kicks: 5, first: 0, roster: roster.slice(0, 1), rnd: rngOf(2) }), RangeError);
});

test('공은 페널티 점에서, 차기마다 제자리로', () => {
  const config = penCfg(1, 1, 3, 0, 0);
  let s = g.create(config, 1);
  assert.equal(s.ball.y, SPOT_Y);
  let k = s.kickNo;
  for (let t = 0; t < 60 * 60 && !g.ended(s); t++) {
    s = g.step(s, config, botsAll(s, config));
    if (s.kickNo !== k) { k = s.kickNo; assert.equal(s.phase, 'ready'); assert.deepEqual([s.ball.x, s.ball.y, s.ball.vx], [0, SPOT_Y, 0]); assert.equal(s.phaseTicks, 0); }
  }
  assert.ok(READY_TICKS > 0);
});
