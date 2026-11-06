import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, step, eventsBetween, PITCH } from '../../src/lib/game/sim.ts';
import { BASE_PERF } from '../../src/lib/game/stats.ts';
import { botInput } from '../../src/lib/game/bot.ts';

const mk = (perSide, extra = {}) => {
  const players = [];
  for (let i = 0; i < perSide * 2; i++)
    players.push({ id: i, num: i, name: `P${i}`, side: i < perSide ? 0 : 1, bot: true, perf: { ...BASE_PERF } });
  return { perSide, minutes: 2, scoreLimit: 0, players, ...extra };
};
const inputs = (s, cfg) => cfg.players.map((p) => botInput(s, cfg, p.id));

test('봇 입력은 늘 유한하고 -1..1 안 — 모든 인원·여러 씨앗', () => {
  for (const per of [1, 2, 3, 4]) for (const seed of [1, 99]) {
    const cfg = mk(per, { minutes: 1 });
    let s = createMatch(cfg, seed);
    for (let t = 0; t < 1200; t++) {
      const ins = inputs(s, cfg);
      for (const i of ins) {
        assert.ok(Number.isFinite(i.x) && Number.isFinite(i.y), `NaN t=${t}`);
        assert.ok(Math.abs(i.x) <= 1 + 1e-9 && Math.abs(i.y) <= 1 + 1e-9, `범위 밖 ${i.x},${i.y}`);
        assert.equal(typeof i.kick, 'boolean');
      }
      s = step(s, cfg, ins);
    }
  }
});

test('순수 — 같은 state 면 같은 입력, state 는 안 바뀐다', () => {
  const cfg = mk(3);
  let s = createMatch(cfg, 5);
  for (let t = 0; t < 200; t++) s = step(s, cfg, inputs(s, cfg));
  const snap = JSON.stringify(s);
  const a = JSON.stringify(inputs(s, cfg)), b = JSON.stringify(inputs(JSON.parse(snap), cfg));
  assert.equal(a, b);
  assert.equal(JSON.stringify(s), snap);
});

test('봇끼리 2분 경기(2대2) — 실제로 공을 차고 경기가 끝난다', () => {
  const cfg = mk(2);
  let s = createMatch(cfg, 3);
  let kicks = 0, goals = 0;
  for (let t = 0; t < 12000 && s.phase !== 'end'; t++) {
    const n = step(s, cfg, inputs(s, cfg));
    for (const e of eventsBetween(s, n)) { if (e.type === 'kick') kicks++; if (e.type === 'goal') goals++; }
    s = n;
  }
  assert.equal(s.phase, 'end');
  assert.ok(kicks >= 1, `킥 ${kicks}`);
  assert.ok(kicks >= 10, `봇이 거의 안 찬다 ${kicks}`);
  assert.equal(goals, s.score[0] + s.score[1]);
});

test('가장 뒤 봇은 공이 상대 진영에 있는 동안 자기 진영에 머문다', () => {
  const cfg = mk(2);
  let s = createMatch(cfg, 3);
  let checked = 0;
  for (let t = 0; t < 7200 && s.phase !== 'end'; t++) {
    s = step(s, cfg, inputs(s, cfg));
    if (s.phase !== 'play') continue;
    for (const keeper of [0, 2]) {
      const dir = cfg.players[keeper].side === 0 ? 1 : -1;
      if (dir * s.ball.x > 40) {
        checked++;
        assert.ok(dir * s.players[keeper].x < 10, `t=${t} 수비 ${keeper} 가 상대 진영 ${s.players[keeper].x}`);
      }
    }
  }
  assert.ok(checked > 300, `공이 상대 진영에 있던 틱이 너무 적다 ${checked}`);
});

test('둘이 한 공에 몰리지 않는다 — 같은 편 둘(3대3 공격수들) 사이 거리가 대체로 벌어진다', () => {
  const cfg = mk(3);
  let s = createMatch(cfg, 8);
  let close = 0, total = 0;
  for (let t = 0; t < 3600 && s.phase !== 'end'; t++) {
    s = step(s, cfg, inputs(s, cfg));
    if (s.phase !== 'play') continue;
    const a = s.players[1], b = s.players[2];
    total++;
    if (Math.hypot(a.x - b.x, a.y - b.y) < 2 * PITCH.playerR + 10) close++;
  }
  assert.ok(total > 1000);
  assert.ok(close / total < 0.15, `붙어 있던 비율 ${(close / total).toFixed(2)}`);
});

test('골이 나는 경기 — 봇끼리 여러 씨앗에서 끝까지 돌고 골이 난다(너무 바보가 아님)', () => {
  let goals = 0;
  for (const seed of [1, 2, 3, 4]) {
    const cfg = mk(2);
    let s = createMatch(cfg, seed);
    for (let t = 0; t < 12000 && s.phase !== 'end'; t++) s = step(s, cfg, inputs(s, cfg));
    assert.equal(s.phase, 'end');
    goals += s.score[0] + s.score[1];
  }
  assert.ok(goals >= 2, `네 경기 합쳐 ${goals} 골`);
});

test('골·끝 단계에선 입력이 0', () => {
  const cfg = mk(1);
  const s = { ...createMatch(cfg, 1), phase: 'goal' };
  assert.deepEqual(botInput(s, cfg, 0), { x: 0, y: 0, kick: false });
});
