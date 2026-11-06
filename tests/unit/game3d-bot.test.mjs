// 3D 축구 시제품(2026-11-07) — 봇(src/lib/game3d/bot.ts). 봇끼리 5대5 한 판에서 패스와 골이 실제로 나오고, 몸이 판 밖으로 안 나가고,
// 같은 편 봇이 사람에게도 패스하고, 골키퍼가 약한 슛은 막고 좋은 슛은 먹는지.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, step, NO_INPUT, PITCH3D } from '../../src/lib/game3d/sim.ts';
import { botInput } from '../../src/lib/game3d/bot.ts';
import { BASE_PERF } from '../../src/lib/game3d/stats.ts';

const { HW, HH, goalDepth, ballR, ceiling, playerR } = PITCH3D;
const five = (humanBot = true) => {
  const players = [];
  for (let side = 0; side < 2; side++) for (let k = 0; k < 5; k++)
    players.push({ id: side * 5 + k, num: 100 + side * 5 + k, name: `P${k}`, side, bot: !(side === 0 && k === 3) || humanBot, gk: k === 0, perf: { ...BASE_PERF } });
  return { minutes: 3, players };
};
const bots = (s, cfg) => cfg.players.map((p) => botInput(s, cfg, p.id));

test('봇 입력은 순수 — 같은 상태면 같은 입력, 상태를 안 바꾼다', () => {
  const cfg = five();
  let s = createMatch(cfg, 5);
  for (let t = 0; t < 300; t++) s = step(s, cfg, bots(s, cfg));
  const snap = JSON.stringify(s);
  assert.equal(JSON.stringify(bots(s, cfg)), JSON.stringify(bots(JSON.parse(snap), cfg)));
  assert.equal(JSON.stringify(s), snap);
});

const SEEDS = [1, 2, 3, 4, 5];
const results = [];
for (const seed of SEEDS) {
  test(`봇끼리 5대5 3분(씨앗 ${seed}) — 끝까지 가고, 패스가 나오고, 몸·공이 판 밖으로 안 나가고, NaN 이 없다`, () => {
    const cfg = five();
    let s = createMatch(cfg, seed);
    let n = 0;
    while (s.phase !== 'end' && n < 60 * 60 * 6) {
      s = step(s, cfg, bots(s, cfg));
      n++;
      const b = s.ball;
      assert.ok(Number.isFinite(b.x + b.y + b.z + b.vx + b.vy + b.vz), `${n}: 공 NaN`);
      assert.ok(Math.abs(b.x) <= HW + goalDepth && Math.abs(b.y) <= HH && b.z >= ballR - 1e-9 && b.z <= ceiling, `${n}: 공이 밖 ${JSON.stringify(b)}`);
      for (const p of s.players) {
        assert.ok(Number.isFinite(p.x + p.y + p.vx + p.vy + p.fx + p.fy), `${n}: 선수 NaN`);
        assert.ok(Math.abs(p.x) <= HW - playerR + 1e-9 && Math.abs(p.y) <= HH - playerR + 1e-9, `${n}: 선수가 밖`);
      }
    }
    assert.equal(s.phase, 'end');
    assert.ok(s.count.passes[0] > 5 && s.count.passes[1] > 5, `패스 ${s.count.passes}`);
    assert.ok(s.count.shots[0] + s.count.shots[1] > 0, '슛');
    results.push(s.score[0] + s.score[1]);
  });
}
test('봇끼리 경기에서 한 판에 평균 한 골 이상', () => {
  assert.equal(results.length, SEEDS.length);
  const avg = results.reduce((a, b) => a + b, 0) / results.length;
  assert.ok(avg >= 1, `평균 ${avg} (${results})`);
});

test('같은 편 봇이 사람(가만히 서 있어도)에게 패스한다', () => {
  const cfg = five(false);   // id 3 = 사람
  let toHuman = 0;
  for (const seed of [1, 2, 3]) {
    let s = createMatch(cfg, seed);
    for (let t = 0; t < 60 * 90 && s.phase !== 'end'; t++) {
      // 사람은 공 쪽으로 천천히 걷기만 한다(받으러 가지도, 차지도 않는다)
      const inputs = bots(s, cfg);
      const me = s.players[3];
      const dx = s.ball.x - me.x, dy = s.ball.y - me.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
      inputs[3] = d > 6 ? { x: (dx / d) * 0.5, y: (dy / d) * 0.5, shoot: false, pass: false } : { ...NO_INPUT };
      const n = step(s, cfg, inputs);
      if (n.lastKick && n.lastKick !== s.lastKick && n.lastKick.kind === 'pass' && n.passTo === 3) toHuman++;
      s = n;
    }
  }
  assert.ok(toHuman >= 2, `사람에게 간 패스 ${toHuman}`);
});

test('골키퍼 봇 — 정면 약한 슛은 막고, 구석으로 세게 찬 슛은 먹는다', () => {
  const cfg = { minutes: 2, players: [
    { id: 0, num: 1, name: 'S', side: 0, bot: false, gk: false, perf: { ...BASE_PERF } },
    { id: 1, num: 2, name: 'K', side: 1, bot: true, gk: true, perf: { ...BASE_PERF } },
  ] };
  const fire = (fy, hold) => {
    let s = createMatch(cfg, 8);
    s = JSON.parse(JSON.stringify(s));
    s.phase = 'play';
    Object.assign(s.players[0], { x: 7, y: 0, fx: 1, fy, vx: 0, vy: 0 });
    s.ball = { x: 7.7, y: 0, z: ballR, vx: 0, vy: 0, vz: 0 };
    // 골키퍼는 봇으로 먼저 자리를 잡는다
    for (let t = 0; t < 90; t++) { const i = [{ ...NO_INPUT }, botInput(s, cfg, 1)]; s = step(s, cfg, i); }
    assert.equal(s.owner, 0);
    const n = Math.sqrt(1 + fy * fy);
    Object.assign(s.players[0], { fx: 1 / n, fy: fy / n });
    for (let t = 0; t < hold; t++) s = step(s, cfg, [{ x: 0, y: 0, shoot: true, pass: false }, botInput(s, cfg, 1)]);
    for (let t = 0; t < 120 && s.phase === 'play'; t++) s = step(s, cfg, [{ ...NO_INPUT }, botInput(s, cfg, 1)]);
    return s;
  };
  const weak = fire(0, 8);
  assert.deepEqual(weak.score, [0, 0], '정면 약한 슛');
  const strong = fire(0.2, 44);
  assert.deepEqual(strong.score, [1, 0], '구석 강슛');
});
