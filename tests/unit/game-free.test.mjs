// 2D 자유 훈련장(2026-11-07 게임 묶음 2단계) — 규칙 검사. 약속 검사(결정성·JSON·모양·끝나지 않음)는 games-adapter.test.mjs 가 한다.
// 스펙 docs/superpowers/specs/2026-11-07-games-program-design.md §3.3
import test from 'node:test';
import assert from 'node:assert/strict';
import { free2d as g, FREE2D, ballsFor, buildFree, freeCenterSpot, MAX_BALLS } from '../../src/lib/games/free2d.ts';
import { geoOf } from '../../src/lib/game/sim.ts';
import { createRoom, join } from '../../src/lib/game/room.ts';
import { freeCfg } from './fixtures/games-cases-p2.mjs';

const rngOf = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const IDLE = { x: 0, y: 0, kick: false, gather: false };
const roster = Array.from({ length: 14 }, (_, i) => ({ num: 100 + i, jersey: i + 1, name: `선수${i}`, pace: 60, dribble: 60, pass: 60, shoot: 60, defend: 60, stamina: 60, avatar: '' }));

test('공 여러 개가 몸·벽·기둥·서로와 오래 부딪쳐도 뚫거나 NaN 이 되지 않는다', () => {
  for (const [field, h, k, n] of [['S', 2, 4, 6], ['M', 4, 4, 8], ['XL', 8, 4, 8]]) {
    const config = freeCfg(h, k, n, field), G = geoOf(field), R = G.pitch.playerR, BR = G.pitch.ballR;
    const r = rngOf(n);
    let s = g.create(config, 3);
    for (let t = 0; t < 60 * 60 * 4; t++) {
      // 사람 자리는 아무렇게나(자주 킥), 봇은 봇
      const inputs = config.players.map((p, i) => (p.bot ? g.botInput(s, config, i) : { x: r() * 2 - 1, y: r() * 2 - 1, kick: r() < 0.4, gather: false }));
      s = g.step(s, config, inputs.map((i) => g.decode(g.encode(i))));
      for (const b of s.balls) {
        assert.ok(Number.isFinite(b.x + b.y + b.vx + b.vy), `${field} 틱 ${t} 공 NaN`);
        assert.ok(Math.abs(b.y) <= G.HH, `${field} 틱 ${t} 공이 옆줄 밖 ${b.y}`);
        assert.ok(Math.abs(b.x) <= G.HW + G.GD, `${field} 틱 ${t} 공이 골 뒤 밖 ${b.x}`);
        if (Math.abs(b.x) > G.HW) assert.ok(Math.abs(b.y) <= G.GH, `${field} 틱 ${t} 골 상자 옆벽 뚫음`);
      }
      for (const p of s.players) {
        assert.ok(Number.isFinite(p.x + p.y + p.vx + p.vy));
        assert.ok(Math.abs(p.x) <= G.OW && Math.abs(p.y) <= G.OH);
      }
      // 공끼리 깊게 겹치지 않는다(한 틱 끝에서 지름의 절반 넘게 겹친 채로 남지 않는다)
      for (let a = 0; a < s.balls.length; a++) for (let b = a + 1; b < s.balls.length; b++) {
        const d = Math.hypot(s.balls[a].x - s.balls[b].x, s.balls[a].y - s.balls[b].y);
        assert.ok(d > BR, `${field} 틱 ${t} 공 ${a}·${b} 겹침 ${d.toFixed(1)}`);
      }
      void R;
    }
  }
});

test('공끼리 정면으로 부딪치면 튕긴다(지나치지 않는다)', () => {
  const config = freeCfg(1, 0, 3, 'M');
  let s = g.create(config, 1);
  s = { ...s, players: s.players.map((p) => ({ ...p, x: 0, y: 300 })), balls: [{ x: -200, y: 0, vx: 900, vy: 0 }, { x: 200, y: 0, vx: -900, vy: 0 }, { x: 0, y: -250, vx: 0, vy: 0 }] };
  for (let t = 0; t < 40; t++) s = g.step(s, config, [IDLE]);
  assert.ok(s.balls[0].x < s.balls[1].x, '왼쪽 공은 여전히 왼쪽');
  assert.ok(s.balls[0].vx <= 0 && s.balls[1].vx >= 0, '서로 반대로 튕겨 나간다');
});

test('기둥에 맞으면 튕긴다', () => {
  const config = freeCfg(1, 0, 3, 'M'), G = geoOf('M');
  let s = g.create(config, 1);
  s = { ...s, players: s.players.map((p) => ({ ...p, x: 0, y: 300 })), balls: [{ x: G.HW - 120, y: G.GH, vx: 700, vy: 0 }, { x: 0, y: 0, vx: 0, vy: 0 }, { x: 0, y: -100, vx: 0, vy: 0 }] };
  for (let t = 0; t < 30; t++) s = g.step(s, config, [IDLE]);
  assert.ok(s.balls[0].vx < 0 || s.balls[0].x < G.HW, '기둥 앞에서 돌아 나온다');
  assert.equal(s.goals, 0);
});

test('골 — 들어간 공만 가운데로, 다른 공은 그대로 굴러간다. "골!" 표시가 남고 1초 뒤 사라진다', () => {
  const config = freeCfg(1, 0, 3, 'M'), G = geoOf('M');
  let s = g.create(config, 7);
  s = { ...s, players: s.players.map((p) => ({ ...p, x: -400, y: 250 })), balls: [{ x: G.HW - 30, y: 10, vx: 600, vy: 0 }, { x: -300, y: -200, vx: 200, vy: 50 }, { x: 100, y: 200, vx: 0, vy: 0 }] };
  const before = s.balls.map((b) => ({ ...b }));
  let t = 0;
  while (s.goals === 0 && t < 60) { s = g.step(s, config, [IDLE]); t++; }
  assert.equal(s.goals, 1);
  const spots = Array.from({ length: 10 }, (_, k) => freeCenterSpot('M', k));
  assert.ok(spots.some((p) => p.x === s.balls[0].x && p.y === s.balls[0].y), '들어간 공은 가운데 자리 중 하나');
  assert.deepEqual([s.balls[0].vx, s.balls[0].vy], [0, 0]);
  assert.ok(Math.abs(s.balls[1].x - (before[1].x + 200 * t / 60)) < 30, '굴러가던 공은 그대로 굴러간다');
  assert.deepEqual([s.balls[2].x, s.balls[2].y], [100, 200], '서 있던 공은 그대로');
  assert.equal(s.pops.length, 1); assert.equal(s.pops[0].side, 1);
  for (let k = 0; k < 61; k++) s = g.step(s, config, [IDLE]);
  assert.equal(s.pops.length, 0);
});

test('공 모으기 — 방장 자리의 것만 듣고, 모든 공이 가운데 자리로 선다', () => {
  const config = freeCfg(2, 0, 4, 'M');
  let s = g.create(config, 1);
  s = { ...s, balls: s.balls.map((b, j) => ({ x: 300 + j * 30, y: -200, vx: 300, vy: 100 })) };
  const guest = g.step(s, config, [IDLE, { ...IDLE, gather: true }]);
  assert.ok(guest.balls.every((b) => b.x > 250), '손님(방장 아님)의 공 모으기는 무시');
  const host = g.step(s, config, [{ ...IDLE, gather: true }, IDLE]);
  host.balls.forEach((b, j) => { const p = freeCenterSpot('M', j); assert.ok(Math.hypot(b.x - p.x, b.y - p.y) < 1, `공 ${j}`); });
  // 입력 정수로 오가도 같은 뜻
  assert.equal(g.decode(g.encode({ ...IDLE, gather: true })).gather, true);
  assert.ok(g.urgent(g.encode(IDLE), g.encode({ ...IDLE, gather: true })), '공 모으기는 바로 보낸다');
});

test('공 개수 = 사람 + 2(3..8), 방 사람 모두가 편 없이 — 8명 넘으면 앞의 8명, 방장이 공 모으기 주인', () => {
  assert.deepEqual([1, 2, 6, 8].map(ballsFor), [3, 4, 8, 8]);
  assert.ok(MAX_BALLS === 8);
  let room = createRoom('ABCD', { clientId: 'h', num: 100, name: '방장' }, 'free2d', FREE2D.defaultSettings);
  for (let i = 1; i < 10; i++) room = join(room, { clientId: `c${i}`, num: 100 + i, name: `${i}` }).room;
  assert.equal(FREE2D.lobby, 'all');
  assert.equal(FREE2D.botSeats, undefined, '봇 칸을 안 그린다');
  const { config, slots } = FREE2D.buildConfig(room, roster, rngOf(1));
  assert.ok(g.okConfig(config));
  assert.equal(slots.filter((x) => x !== null).length, 8);
  assert.deepEqual(slots.slice(0, 8), ['h', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7']);
  assert.equal(config.players.filter((p) => p.bot).length, 2, '기본 연습 봇 2');
  assert.equal(config.balls, 8);
  assert.equal(config.players.filter((p) => p.host).length, 1); assert.equal(config.players[0].host, true);
  assert.ok(config.players.filter((p) => p.bot).every((p) => p.num >= 110), '봇은 방 사람 선수가 아니다');
  // 설정
  assert.deepEqual(FREE2D.applySettings(FREE2D.defaultSettings, { bots: 9, field: 'L' }), { bots: 4, field: 'L' });
  assert.equal(FREE2D.applySettings(FREE2D.defaultSettings, { field: 'zz' }), FREE2D.defaultSettings);
  // 경기장 자동 — 몸 수로
  assert.equal(buildFree({ humans: [{ num: 100, name: 'a', host: true }], bots: 1, field: 'auto', roster, rnd: rngOf(1) }).field, 'S');
});

test('봇은 공을 쫓아 차고, 골도 들어간다(혼자 + 봇 넷, 2분)', () => {
  const config = buildFree({ humans: [{ num: 100, name: 'a', host: true }], bots: 4, field: 'S', roster, rnd: rngOf(3) });
  let s = g.create(config, 5), kicks = 0;
  for (let t = 0; t < 60 * 120; t++) {
    const next = g.step(s, config, config.players.map((p, i) => (p.bot ? g.decode(g.encode(g.botInput(s, config, i))) : IDLE)));
    kicks += next.players.filter((p, i) => p.kickCooldown > s.players[i].kickCooldown).length;
    s = next;
  }
  assert.ok(kicks > 20, `킥 ${kicks}`);
  assert.ok(s.goals > 0, '골이 하나도 없다');
});
