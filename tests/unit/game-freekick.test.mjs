// 2D 프리킥(2026-11-07 게임 묶음 3단계) — 규칙 검사. 약속 검사(결정성·JSON·모양)는 games-adapter.test.mjs 가 한다.
// 스펙 docs/superpowers/specs/2026-11-07-games-program-design.md §3.2
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  freekick2d as g, FREEKICK2D, FK_SPOTS, FK_MAX_POINTS, FK_AIM_SCALE, AIM_TICKS, fkTurn, fkTotal, fkRanking, fkPath, fkWall, fkCurlAim, fkKickerPlan, nearSide, keeperHome, wallAt,
} from '../../src/lib/games/freekick2d.ts';
import { AUTO_POWER, KEEPER_Y, speedOf } from '../../src/lib/games/penalty2d.ts';
import { createRoom, join } from '../../src/lib/game/room.ts';
import { fkInput, FK_LOCAL } from '../../src/react/game/views/freekick2d/aim.ts';
import { fkCfg } from './fixtures/games-cases-p3.mjs';

const IDLE = { x: 0, kick: false, aim: null };
const bots = (s, c) => c.players.map((_, i) => g.decode(g.encode(g.botInput(s, c, i))));
function playOut(config, seed) {
  let s = g.create(config, seed), t = 0;
  while (!g.ended(s) && t < 60 * 60 * 30) { s = g.step(s, config, bots(s, config)); t++; }
  return s;
}
function toAim(config, seed) {
  let s = g.create(config, seed);
  while (s.phase !== 'aim') s = g.step(s, config, config.players.map(() => IDLE));
  return s;
}
const roster = Array.from({ length: 12 }, (_, i) => ({ num: 100 + i, jersey: i + 1, name: `선수${i}`, pace: 60, dribble: 60, pass: 60, shoot: 60, defend: 60, stamina: 60, avatar: '' }));
const rngOf = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

test('차례 — 자리마다 모두가 한 번씩 차고 다음 자리로(자리 = ⌊k/n⌋, 키커 = k mod n), 모두 5n 번', () => {
  for (const n of [1, 3]) {
    const s = playOut(fkCfg(n, true), 7);
    assert.ok(g.ended(s));
    assert.equal(s.log.length, fkTotal(n));
    s.log.forEach((e, k) => { assert.equal(e.spot, Math.floor(k / n)); assert.equal(e.kicker, k % n); });
  }
  assert.deepEqual(fkTurn(7, 3), { spot: 2, kicker: 1 });
});

test('점수 — 골이면 그 자리 점수(1·2·2·3·3), 순위는 점수 → 골 수 → 먼저 찬 사람', () => {
  assert.deepEqual(FK_SPOTS.map((s) => s.pts), [1, 2, 2, 3, 3]);
  assert.equal(FK_MAX_POINTS, 11);
  for (let seed = 1; seed <= 20; seed++) {
    const s = playOut(fkCfg(2, true), seed);
    for (const i of [0, 1]) assert.equal(s.points[i], s.log.filter((e) => e.kicker === i && e.out === 'goal').reduce((t, e) => t + FK_SPOTS[e.spot].pts, 0));
  }
  assert.deepEqual(fkRanking([3, 5, 5], [{ kicker: 1, spot: 1, out: 'goal' }, { kicker: 2, spot: 3, out: 'goal' }, { kicker: 2, spot: 0, out: 'miss' }]), [1, 2, 0]);
  assert.deepEqual(fkRanking([3, 5, 5], [{ kicker: 1, spot: 3, out: 'goal' }, { kicker: 2, spot: 1, out: 'goal' }, { kicker: 2, spot: 0, out: 'goal' }]), [2, 1, 0], '같은 점수면 골이 많은 사람');
});

test('조준과 감기는 차기 전엔 상태에도 입력 정수에도 없다 — 다르게 겨누고 다르게 감은 두 판이 차는 순간까지 같다', () => {
  const config = fkCfg(1);
  function run(stickAim, stickCurl) {
    let s = g.create(config, 11), local = { ...FK_LOCAL, kickNo: 0 };
    const states = [], qs = [];
    for (let t = 0; t < 600; t++) {
      const inAim = s.phase === 'aim';
      const hold = inAim && s.phaseTicks >= 60 && s.phaseTicks < 100;
      const h = { x: inAim && s.phaseTicks < 60 ? stickAim : hold ? stickCurl : 0, kick: hold };
      const r = fkInput(local, h, true, s.phase); local = r.local;
      const q = g.encode(r.input);
      const next = g.step(s, config, [g.decode(q)]);
      if (next.phase === 'flight') return { states, qs, struck: next };
      states.push(JSON.stringify(s)); qs.push(q);
      s = next;
    }
    throw new Error('안 찼다');
  }
  const A = run(-1, 1), B = run(1, -1);
  assert.deepEqual(A.states, B.states); assert.deepEqual(A.qs, B.qs);
  assert.notEqual(A.struck.ball.vx, B.struck.ball.vx, '찬 순간에야 갈린다');
  assert.equal(A.struck.curl, 1); assert.equal(B.struck.curl, -1);
});

test('감아차기 — 스틱 쪽으로 휘고, 휘는 정도는 감기에 비례하고 한도가 있다(속도 크기는 그대로)', () => {
  for (const spot of [0, 2, 4]) {
    const straight = fkPath(spot, 0, 0.7, 0).at(-1).x, right = fkPath(spot, 0, 0.7, 1).at(-1).x, left = fkPath(spot, 0, 0.7, -1).at(-1).x, half = fkPath(spot, 0, 0.7, 0.5).at(-1).x;
    assert.ok(right > straight + 20 && left < straight - 20, `자리 ${spot}: ${left} ${straight} ${right}`);
    assert.ok(half > straight && half < right);
    assert.ok(right - straight < 200, '조금만 휜다');
  }
});

test('벽 — 가까운 기둥 쪽을 가리고, 키퍼는 반대쪽에 선다. 벽으로 곧게 차면 "벽", 감아 돌리면 비켜 간다', () => {
  for (let i = 0; i < FK_SPOTS.length; i++) {
    const w = fkWall(i), side = nearSide(i);
    assert.equal(w.length, 3);
    assert.ok(w.every((p) => p.y > 60 && p.y < FK_SPOTS[i].y - 60), '공과 골 사이');
    assert.equal(Math.sign(keeperHome(i)), -side);
  }
  // 정면에서 벽 가운데로 곧게
  const config = fkCfg(1);
  let s = toAim(config, 3);
  const w = fkWall(0)[1], aimX = FK_SPOTS[0].x + (w.x - FK_SPOTS[0].x) * FK_SPOTS[0].y / (FK_SPOTS[0].y - w.y);
  for (let t = 0; t < 40; t++) s = g.step(s, config, [{ x: 0, kick: true, aim: null }]);
  s = g.step(s, config, [{ x: 0, kick: false, aim: aimX / FK_AIM_SCALE }]);
  while (s.phase === 'flight') s = g.step(s, config, [IDLE]);
  assert.equal(s.outcome, 'wall');
  // 먼 자리에서 감아 돌리는 조준이 있다(벽에 안 닿는 길)
  for (const spot of [3, 4]) assert.notEqual(fkCurlAim(spot, 0.7, -nearSide(spot), 0), null, `자리 ${spot}`);
  // 조준 동안 벽은 아주 조금만 들썩인다
  const base = fkWall(1), moved = wallAt({ spot: 1, phase: 'aim', phaseTicks: 12 });
  moved.forEach((p, i) => { assert.ok(Math.abs(p.x - base[i].x) <= 4 + 1e-9); assert.equal(p.y, base[i].y); });
});

test('5초 안에 안 차면 약한 가운데 슛', () => {
  const config = fkCfg(1);
  let s = toAim(config, 5);
  for (let t = 0; t < AIM_TICKS; t++) s = g.step(s, config, [IDLE]);
  assert.equal(s.phase, 'flight'); assert.equal(s.power, AUTO_POWER); assert.equal(s.curl, 0);
  assert.ok(Math.abs(Math.hypot(s.ball.vx, s.ball.vy) - speedOf(AUTO_POWER)) < 1e-6);
});

test('키퍼는 줄 위에서만 움직인다', () => {
  const s0 = playOut(fkCfg(2, true), 9);
  assert.ok(g.ended(s0));
  const config = fkCfg(1, true);
  let s = g.create(config, 4);
  for (let t = 0; t < 60 * 60 && !g.ended(s); t++) { s = g.step(s, config, bots(s, config)); assert.equal(s.gk.y, KEEPER_Y); }
});

test('대본 키커 성공률 — 가까운 정면이 가장 쉽고, 나머지도 0 도 다도 아니다(자리마다 200번)', () => {
  const rate = FK_SPOTS.map(() => ({ g: 0, n: 0 }));
  for (let seed = 1; seed <= 200; seed++) {
    const s = playOut(fkCfg(1, true), seed * 7919);
    for (const e of s.log) { rate[e.spot].n++; if (e.out === 'goal') rate[e.spot].g++; }
  }
  const r = rate.map((x) => x.g / x.n);
  assert.ok(r[0] > 0.5 && r[0] < 0.85, `정면 ${r[0]}`);
  for (let i = 1; i < 5; i++) assert.ok(r[i] > 0.2 && r[i] < 0.6, `자리 ${i} ${r[i]}`);
  assert.ok(fkKickerPlan(1, 0).power >= 0.55);
});

test('방 — 편 없이 앞 8명이 차고 나머지는 구경, 설정은 없다', () => {
  let room = createRoom('ABCD', { clientId: 'h', num: 100, name: '방장' }, 'freekick2d', FREEKICK2D.defaultSettings);
  for (let i = 1; i < 10; i++) room = join(room, { clientId: `c${i}`, num: 100 + i, name: `${i}` }).room;
  assert.equal(FREEKICK2D.lobby, 'all');
  const { config, slots } = FREEKICK2D.buildConfig(room, roster, rngOf(1));
  assert.ok(g.okConfig(config));
  assert.equal(config.players.length, 8);
  assert.deepEqual(slots, ['h', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7']);
  assert.equal(config.players[0].jersey, 1, '등번호가 설정에 실린다');
  assert.equal(FREEKICK2D.applySettings(FREEKICK2D.defaultSettings, { x: 1 }), FREEKICK2D.defaultSettings);
});
