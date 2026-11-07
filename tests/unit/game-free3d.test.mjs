// 3D 자유 훈련장(2026-11-07 게임 묶음 5단계) — 공 여러 개 규칙(한 사람 한 공, 가까운 사람이 잡기), 골이 들어간 공만 가운데로,
// 공 모으기는 방장 자리만, 1인칭 보는 방향, 봇이 실제로 넣는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { free3d, createFree3, stepFree3, buildFree3, GATHER_Q, free3CenterSpot } from '../../src/lib/games/free3d.ts';
import { ballOf } from '../../src/lib/game3d/multiball3d.ts';
import { IDLE3, FACE64 } from '../../src/lib/game3d/quant.ts';
import { PITCH3D } from '../../src/lib/game3d/sim.ts';
import { MAX_CODES } from '../../src/lib/games/net.ts';
import { free3Cfg } from './fixtures/games-cases-p5.mjs';

const g = free3d;
const idle = (c) => c.players.map(() => IDLE3);
const run = (s, c, n, f = () => idle(c)) => { for (let t = 0; t < n; t++) s = stepFree3(s, c, f(s, t)); return s; };

test('공 = 사람 + 2(3..8), 봇은 명단에서 사람 아닌 선수, 방장이 맨 앞', () => {
  const roster = Array.from({ length: 20 }, (_, i) => ({ num: 100 + i, jersey: i + 1, name: `P${i}`, pace: 60, dribble: 60, pass: 60, shoot: 60, defend: 60, stamina: 60 }));
  const r = () => 0.3;
  for (const [h, balls] of [[1, 3], [2, 4], [6, 8], [8, 8]]) {
    const c = buildFree3({ humans: Array.from({ length: h }, (_, i) => ({ num: 100 + i, name: `P${i}`, host: i === 0 })), bots: 3, roster, rnd: r });
    assert.equal(c.balls, balls);
    assert.equal(c.players.length, h + 3);
    assert.ok(c.players[0].host && !c.players[0].bot);
    assert.ok(c.players.slice(h).every((p) => p.bot && p.num >= 100 + h));
    assert.ok(g.okConfig(c));
  }
});

test('한 사람은 공을 하나만 — 공 둘 사이를 지나가도 가진 공 하나, 다른 공은 몸에 맞고 튄다', () => {
  const c = free3Cfg(1, 0, 3);
  let s = createFree3(c, 1);
  s = { ...s, players: [{ ...s.players[0], x: -2, y: 0 }], balls: s.balls.map((b, j) => ({ ...b, x: -1.2 + j * 0.6, y: 0 })) };
  s = run(s, c, 120, () => [{ ...IDLE3, x: 1, y: 0 }]);
  const owned = s.balls.filter((b) => b.owner === 0).length;
  assert.equal(owned, 1);
  assert.ok(ballOf(s, 0) >= 0);
});

test('아무도 안 가진 공은 가장 가까운 공 없는 사람이 잡는다, 차면 놓는다(패스·슛)', () => {
  const c = free3Cfg(2, 0, 3);
  let s = createFree3(c, 2);
  s = { ...s, players: [{ ...s.players[0], x: 0.62, y: 0, fx: -1, fy: 0 }, { ...s.players[1], x: -0.9, y: 0, fx: 1, fy: 0 }] };
  s = run(s, c, 2);
  assert.equal(s.balls[0].owner, 0, '더 가까운 사람');
  // 0 번이 슛을 모았다 떼면 놓는다
  s = run(s, c, 20, () => [{ ...IDLE3, shoot: true }, IDLE3]);
  s = run(s, c, 1, () => [IDLE3, IDLE3]);
  assert.equal(s.kicks, 1);
  assert.ok(s.balls.every((b) => b.owner !== 0), '찬 공은 놓았다');
});

test('골 — 들어간 공 하나만 가운데 빈 자리로(속도 0, 주인 없음), 골 수와 "골!" 표시', () => {
  const c = free3Cfg(1, 0, 3);
  let s = createFree3(c, 3);
  const keep = s.balls.slice(1).map((b) => ({ ...b }));
  s = { ...s, balls: [{ ...s.balls[0], x: PITCH3D.HW - 0.3, y: 0.5, z: 0.6, vx: 10 }, ...s.balls.slice(1)] };
  s = run(s, c, 10);
  assert.equal(s.goals, 1);
  assert.equal(s.pops.length, 1);
  assert.equal(s.pops[0].side, 1);
  const b = s.balls[0];
  assert.ok(Math.abs(b.x) <= 6 && Math.abs(b.y) <= 6 && b.vx === 0 && b.owner === null, `가운데로 ${b.x},${b.y}`);
  assert.deepEqual(s.balls.slice(1).map((x) => [x.x, x.y]), keep.map((x) => [x.x, x.y]), '다른 공은 그대로');
});

test('공 모으기 — 방장 자리(입력 정수 하나)만 듣는다, 모든 공이 가운데 자리로', () => {
  const c = free3Cfg(2, 0, 4);
  let s = createFree3(c, 4);
  s = { ...s, balls: s.balls.map((b, j) => ({ ...b, x: 10 + j, y: 5, vx: 1 })) };
  const gather = g.decode(GATHER_Q);
  assert.equal(gather.gather, true);
  assert.ok(GATHER_Q < g.codes && g.codes <= MAX_CODES);
  const notHost = stepFree3(s, c, [IDLE3, gather]);
  assert.ok(notHost.balls.every((b) => b.x > 9), '방장 아닌 사람의 공 모으기는 안 듣는다');
  const host = stepFree3(s, c, [gather, IDLE3]);
  host.balls.forEach((b, j) => { const p = free3CenterSpot(j); assert.ok(Math.abs(b.x - p[0]) < 0.2 && Math.abs(b.y - p[1]) < 0.2); });
  assert.equal(g.urgent(0, GATHER_Q), true);
});

test('1인칭 보는 방향 — 입력의 보는 방향(표 값)을 그대로 쓴다, 앞으로 가면 그쪽으로', () => {
  const c = free3Cfg(1, 0, 3);
  let s = createFree3(c, 5);
  const k = 16;   // +y 쪽
  const inp = g.decode(g.encode({ ...IDLE3, x: FACE64[k][0], y: FACE64[k][1], fx: FACE64[k][0], fy: FACE64[k][1] }));
  const y0 = s.players[0].y;
  s = run(s, c, 30, () => [inp]);
  assert.deepEqual([s.players[0].fx, s.players[0].fy], [...FACE64[k]].map((v) => v / Math.sqrt(FACE64[k][0] ** 2 + FACE64[k][1] ** 2)));
  assert.ok(s.players[0].y - y0 > 1.6);   // 0.5초에 1.6m 넘게(2026-11-07 선수 ×0.8 "3d 캐릭터 너무 빠른듯" — 전엔 2m)
});

test('봇 넷 + 공 셋 1분 — 실제로 차고 넣는다, 상태는 내내 성하고 한 사람 한 공', () => {
  const c = free3Cfg(1, 4, 3);
  let s = createFree3(c, 6);
  for (let t = 0; t < 3600; t++) {
    s = stepFree3(s, c, c.players.map((_, i) => g.decode(g.encode(g.botInput(s, c, i)))));
    if (t % 300 === 0) assert.ok(g.okState(s, c));
  }
  assert.ok(s.kicks > 10 && s.goals > 3, `킥 ${s.kicks} 골 ${s.goals}`);
});

test('"골!" 표시는 3초에 한 번까지 — 2D·3D 훈련장이 같은 규칙(골 수는 그대로)', async () => {
  const { popShown, POP_GAP } = await import('../../src/lib/games/free2d.ts');
  const memo = { last: -Infinity };
  assert.equal(popShown(100, memo), true);
  assert.equal(popShown(100, memo), true, '같은 표시는 이어서');
  assert.equal(popShown(150, memo), false, '3초 안의 다음 골');
  assert.equal(popShown(100 + POP_GAP, memo), true);
  assert.equal(POP_GAP, 180);
});
