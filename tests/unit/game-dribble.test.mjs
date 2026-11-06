// 2D 드리블 훈련장(2026-11-07 게임 묶음 3단계) — 규칙 검사. 약속 검사(결정성·JSON·모양·pack)는 games-adapter.test.mjs 가 한다.
// 스펙 docs/superpowers/specs/2026-11-07-games-program-design.md §3.4
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dribble2d as g, DRIBBLE2D, COURSES, COUNT_TICKS, CONE_PENALTY, AFTER_FIRST, KEEP, LX, LY,
  crosses, passGate, passFinish, gateCones, courseCones, laneTime, medalOf, drRanking,
} from '../../src/lib/games/dribble2d.ts';
import { createRoom, join } from '../../src/lib/game/room.ts';
import { drCfg } from './fixtures/games-cases-p3.mjs';

const IDLE = { x: 0, y: 0, kick: false };
const botsIn = (s, c) => c.players.map((_, i) => g.decode(g.encode(g.botInput(s, c, i))));
function playOut(config, cap = 60 * 200) {
  let s = g.create(config, 1), t = 0;
  while (!g.ended(s) && t < cap) { s = g.step(s, config, botsIn(s, config)); t++; }
  return s;
}
/** 출발까지 손 떼고. */
function toRun(config) {
  let s = g.create(config, 1);
  while (s.phase === 'count') s = g.step(s, config, config.players.map(() => IDLE));
  return s;
}
const withLane = (s, i, patch) => ({ ...s, lanes: s.lanes.map((l, k) => (k === i ? { ...l, ...patch, p: { ...l.p, ...(patch.p ?? {}) }, b: { ...l.b, ...(patch.b ?? {}) } } : l)) });

test('선분 만남 — 지나면 참, 비켜 가면 거짓', () => {
  assert.ok(crosses({ x: -10, y: 0 }, { x: 10, y: 0 }, { x: 0, y: -5 }, { x: 0, y: 5 }));
  assert.ok(!crosses({ x: -10, y: 20 }, { x: 10, y: 20 }, { x: 0, y: -5 }, { x: 0, y: 5 }));
  assert.ok(!crosses({ x: -10, y: 0 }, { x: -5, y: 0 }, { x: 0, y: -5 }, { x: 0, y: 5 }));
});

test('3·2·1 동안은 입력을 듣지 않는다(부정 출발 없음)', () => {
  const config = drCfg(0, 1);
  let s = g.create(config, 1);
  const x0 = s.lanes[0].p.x;
  for (let t = 0; t < COUNT_TICKS - 1; t++) { s = g.step(s, config, [{ x: 1, y: 0, kick: true }]); assert.equal(s.lanes[0].p.x, x0); }
  s = g.step(s, config, [{ x: 1, y: 0, kick: true }]);
  assert.equal(s.phase, 'run');
  for (let t = 0; t < 10; t++) s = g.step(s, config, [{ x: 1, y: 0, kick: false }]);
  assert.ok(s.lanes[0].p.x > x0, '출발 뒤엔 움직인다');
});

test('문은 차례대로만 — 건너뛴 문은 안 세지고 그 문으로 돌아가야 한다, 공을 데리고 있어야 한다', () => {
  const c = COURSES[0];
  const [a0] = gateCones(c.gates[0]);
  const g1 = c.gates[1];
  // 차례가 0 인데 1 번 문을 지나도 안 센다
  assert.equal(passGate(c, 0, { x: g1.x - 20, y: g1.y }, { x: g1.x + 20, y: g1.y }, { x: g1.x, y: g1.y }, { x: g1.x + 30, y: g1.y }), false);
  // 차례인 문을 공과 함께 지나면 센다, 공이 멀면 안 센다
  const g0 = c.gates[0];
  assert.ok(passGate(c, 0, { x: g0.x - 20, y: g0.y }, { x: g0.x + 20, y: g0.y }, { x: g0.x, y: g0.y }, { x: g0.x + 30, y: g0.y }));
  assert.ok(!passGate(c, 0, { x: g0.x - 20, y: g0.y }, { x: g0.x + 20, y: g0.y }, { x: g0.x + 200, y: g0.y }, { x: g0.x + 20 + KEEP + 5, y: g0.y }));
  // 콘 바깥으로 지나면 안 센다
  assert.ok(!passGate(c, 0, { x: g0.x - 20, y: a0.y - 30 }, { x: g0.x + 20, y: a0.y - 30 }, { x: g0.x, y: a0.y - 30 }, { x: g0.x + 25, y: a0.y - 30 }));
  // step 으로: 0 번 문 차례에 몸과 공을 1 번 문 앞에 옮겨 지나게 해도 gate 는 0
  const config = drCfg(0, 1);
  let s = toRun(config);
  s = withLane(s, 0, { p: { x: g1.x - 40, y: g1.y, vx: 300, vy: 0 }, b: { x: g1.x - 12, y: g1.y, vx: 300, vy: 0 } });
  for (let t = 0; t < 20; t++) s = g.step(s, config, [{ x: 1, y: 0, kick: false }]);
  assert.equal(s.lanes[0].gate, 0);
  // 0 번 문으로 돌아가 지나면 1
  s = withLane(s, 0, { p: { x: g0.x - 40, y: g0.y, vx: 250, vy: 0 }, b: { x: g0.x - 12, y: g0.y, vx: 250, vy: 0 } });
  for (let t = 0; t < 20; t++) s = g.step(s, config, [{ x: 1, y: 0, kick: false }]);
  assert.equal(s.lanes[0].gate, 1);
});

test('콘에 닿으면 넘어지고 1초 — 콘마다 한 번만', () => {
  const config = drCfg(0, 1);
  let s = toRun(config);
  const cone = courseCones(COURSES[0])[0];
  s = withLane(s, 0, { p: { x: cone.x - 35, y: cone.y, vx: 0, vy: 0 } });
  for (let t = 0; t < 40; t++) s = g.step(s, config, [{ x: 1, y: 0, kick: false }]);
  assert.equal(s.lanes[0].pen, 1); assert.equal(s.lanes[0].hit & 1, 1);
  for (let t = 0; t < 40; t++) s = g.step(s, config, [{ x: -1, y: 0, kick: false }]);
  assert.equal(s.lanes[0].pen, 1, '같은 콘은 한 번만');
  assert.equal(laneTime({ ...s.lanes[0], fin: 600 }), (600 + CONE_PENALTY) / 60);
});

test('결승선 — 문을 다 지나고, 정한 방향으로, 공을 데리고', () => {
  const c = COURSES[0], f = c.finish;
  assert.ok(!passFinish(c, 5, { x: f.x - 5, y: 0 }, { x: f.x + 5, y: 0 }, { x: f.x + 20, y: 0 }), '문이 남았다');
  assert.ok(passFinish(c, 6, { x: f.x - 5, y: 0 }, { x: f.x + 5, y: 0 }, { x: f.x + 20, y: 0 }));
  assert.ok(!passFinish(c, 6, { x: f.x + 5, y: 0 }, { x: f.x - 5, y: 0 }, { x: f.x - 20, y: 0 }), '거꾸로는 안 된다');
  assert.ok(!passFinish(c, 6, { x: f.x - 5, y: 0 }, { x: f.x + 5, y: 0 }, { x: f.x - 300, y: 0 }), '공을 두고 오면 안 된다');
  const w = COURSES[3];
  assert.equal(w.finish.dir, -1, '왕복은 돌아와 출발 쪽 선을 넘는다');
});

test('대본 주자는 네 코스를 모두 도착한다 — 메달 기준과 맞는다', () => {
  for (let c = 0; c < COURSES.length; c++) {
    const s = playOut(drCfg(c, 1, true));
    assert.equal(s.phase, 'end');
    const l = s.lanes[0], t = laneTime(l);
    assert.ok(t !== null, `${COURSES[c].name} 도착 못 함`);
    assert.equal(l.gate, COURSES[c].gates.length);
    assert.ok(l.fin / 60 <= COURSES[c].medals[0] + 0.5, `${COURSES[c].name}: 벌점 없는 시간 ${l.fin / 60} ≈ 금 ${COURSES[c].medals[0]}`);
    assert.ok(medalOf(COURSES[c], t) !== null, `${COURSES[c].name}: 대본 기록 ${t} 는 메달 안`);
    const m = COURSES[c].medals;
    assert.ok(m[0] < m[1] && m[1] < m[2]);
  }
});

test('레인끼리는 서로 모른다 — 옆 레인이 무엇을 해도 내 레인은 같다', () => {
  const config = drCfg(1, 3);
  let a = g.create(config, 1), b = g.create(config, 1);
  for (let t = 0; t < 600; t++) {
    const mine = { x: (t % 120) < 60 ? 1 : 0.5, y: (t % 90) < 45 ? -0.5 : 0.5, kick: t % 50 === 0 };
    a = g.step(a, config, [mine, { x: 1, y: 1, kick: true }, IDLE].map((i) => g.decode(g.encode(i))));
    b = g.step(b, config, [mine, { x: -1, y: 0, kick: false }, { x: 0, y: -1, kick: true }].map((i) => g.decode(g.encode(i))));
  }
  assert.deepEqual(a.lanes[0], b.lanes[0]);
  for (const s of [a, b]) for (const l of s.lanes) {
    assert.ok(Math.abs(l.p.x) <= LX && Math.abs(l.p.y) <= LY && Math.abs(l.b.x) <= LX && Math.abs(l.b.y) <= LY, '레인 밖으로 못 나간다');
  }
});

test('끝 — 모두 도착하면, 아니면 첫 도착 뒤 30초. 순위는 기록 → 지난 문', () => {
  // 대본 주자 하나 + 가만히 있는 사람 하나
  const config = { course: 3, players: [...drCfg(3, 1, true).players, { ...drCfg(3, 1).players[0], id: 1, num: 99 }] };
  let s = g.create(config, 1), t = 0;
  while (!g.ended(s) && t < 60 * 200) { s = g.step(s, config, [g.botInput(s, config, 0), IDLE]); t++; }
  assert.ok(s.lanes[0].fin >= 0 && s.lanes[1].fin < 0);
  assert.equal(s.phaseTicks, 0); assert.equal(s.phase, 'end');
  assert.ok(Math.abs(t - COUNT_TICKS - s.first - AFTER_FIRST) <= 2, '첫 도착 뒤 30초에 끝');
  assert.deepEqual(drRanking(s), [0, 1]);
  // 둘 다 대본이면 둘 다 도착하자마자 끝
  const s2 = playOut(drCfg(3, 2, true));
  assert.ok(s2.lanes.every((l) => l.fin >= 0));
});

test('방 — 편 없이 앞 8명이 자기 레인, 코스는 방장이 고른다. 8명 스냅샷도 작다(pack)', () => {
  let room = createRoom('ABCD', { clientId: 'h', num: 100, name: '방장' }, 'dribble2d', DRIBBLE2D.defaultSettings);
  for (let i = 1; i < 10; i++) room = join(room, { clientId: `c${i}`, num: 100 + i, name: `${i}` }).room;
  room = { ...room, settings: DRIBBLE2D.applySettings(room.settings, { course: 2 }) };
  const roster = Array.from({ length: 12 }, (_, i) => ({ num: 100 + i, jersey: i + 1, name: `선수${i}`, pace: 60, dribble: 60, pass: 60, shoot: 60, defend: 60, stamina: 60, avatar: '' }));
  const { config, slots } = DRIBBLE2D.buildConfig(room, roster, () => 0.5);
  assert.equal(config.course, 2); assert.equal(slots.length, 8);
  assert.equal(DRIBBLE2D.applySettings(room.settings, { course: 9 }), room.settings);
  const s = playOut({ ...config, players: config.players.map((p) => ({ ...p, bot: true })) }, 60 * 20);
  const raw = JSON.stringify(s).length, packed = JSON.stringify(g.pack(s)).length;
  assert.ok(packed < 2000 && packed < raw * 0.7, `pack ${packed} / 그대로 ${raw}`);
});
