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
const specials = [];
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
    assert.ok(s.count.shots[0] > 0 && s.count.shots[1] > 0, `두 편 다 슛 ${s.count.shots}`);
    results.push(s.score[0] + s.score[1]);
    specials.push([s.count.throughs[0] + s.count.throughs[1], s.count.lobs[0] + s.count.lobs[1]]);
  });
}
// 2026-11-07 "골이 너무 안 난다" — 목표는 3분에 3~5골. 씨앗 1~16 실측 평균 3.4(판마다 1~7). 다섯 판 평균이라 범위를 넉넉히 둔다.
test('봇끼리 3분 경기 — 평균 2~6골(목표 3~5)', () => {
  assert.equal(results.length, SEEDS.length);
  const avg = results.reduce((a, b) => a + b, 0) / results.length;
  assert.ok(avg >= 2 && avg <= 6, `평균 ${avg} (${results})`);
});
test('봇도 스루·로빙을 가끔 쓴다(다섯 판 합)', () => {
  const th = specials.reduce((a, b) => a + b[0], 0), lb = specials.reduce((a, b) => a + b[1], 0);
  assert.ok(th >= 3, `스루 ${th}`);
  assert.ok(lb >= 1, `로빙 ${lb}`);
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
      if (n.lastKick && n.lastKick.tick !== s.lastKick?.tick && n.lastKick.kind === 'pass' && n.passTo === 3) toHuman++;
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
    // 골대에서 11m — 경기장 길이와 상관없이(2026-11-07 경기장 44m 로 넓힘, 전엔 x 7 = 반길이 18 에서 11m)
    Object.assign(s.players[0], { x: HW - 11, y: 0, fx: 1, fy, vx: 0, vy: 0 });
    s.ball = { x: HW - 10.3, y: 0, z: ballR, vx: 0, vy: 0, vz: 0 };
    // 골키퍼는 봇으로 먼저 자리를 잡는다
    for (let t = 0; t < 90; t++) { const i = [{ ...NO_INPUT }, botInput(s, cfg, 1)]; s = step(s, cfg, i); }
    assert.equal(s.owner, 0);
    const n = Math.sqrt(1 + fy * fy);
    Object.assign(s.players[0], { fx: 1 / n, fy: fy / n });
    for (let t = 0; t < hold; t++) s = step(s, cfg, [{ x: 0, y: 0, shoot: true, pass: false }, botInput(s, cfg, 1)]);
    for (let t = 0; t < 120 && s.phase === 'play'; t++) s = step(s, cfg, [{ ...NO_INPUT }, botInput(s, cfg, 1)]);
    return s;
  };
  const weak = fire(0, 2);   // 톡 친 슛(2026-11-07 "게이지 시스템 피파랑 비슷하게 가자")
  assert.deepEqual(weak.score, [0, 0], '정면 약한 슛');
  const strong = fire(0.2, 35);   // 게이지 65% — 잘 들어가는 띠
  assert.deepEqual(strong.score, [1, 0], '구석 강슛');
});

// 슛 결과(2026-11-07 "골이 너무 안 난다"): 골키퍼 봇 앞 8~12m, 세 자리에서. 잘 노린(구석 ±1.5~2m) 모은 슛은 절반쯤,
// 골키퍼 정면은 세게 차도 거의 막히고, 약한 정면 슛은 다 막힌다. 실측(조정 뒤): 구석 53%, 정면 강슛 0%, 정면 약슛 0%.
const duel = { minutes: 2, players: [
  { id: 0, num: 1, name: 'S', side: 0, bot: false, gk: false, perf: { ...BASE_PERF } },
  { id: 1, num: 2, name: 'K', side: 1, bot: true, gk: true, perf: { ...BASE_PERF } },
] };
function shotFrom(x0, y0, ty, hold, seed) {
  let s = JSON.parse(JSON.stringify(createMatch(duel, seed)));
  s.phase = 'play';
  Object.assign(s.players[0], { x: x0, y: y0, fx: 1, fy: 0, vx: 0, vy: 0 });
  s.ball = { x: x0 + 0.7, y: y0, z: ballR, vx: 0, vy: 0, vz: 0 };
  for (let t = 0; t < 90; t++) s = step(s, duel, [{ ...NO_INPUT }, botInput(s, duel, 1)]);
  const dx = HW - x0, dy = ty - y0, d = Math.sqrt(dx * dx + dy * dy);
  Object.assign(s.players[0], { fx: dx / d, fy: dy / d });
  for (let t = 0; t < hold; t++) s = step(s, duel, [{ x: 0, y: 0, shoot: true, pass: false }, botInput(s, duel, 1)]);
  for (let t = 0; t < 150 && s.phase === 'play'; t++) s = step(s, duel, [{ ...NO_INPUT }, botInput(s, duel, 1)]);
  return s.score[0] > 0;
}
test('슛 결과 — 구석으로 잘 모은 슛은 35~90% 들어가고, 골키퍼 정면은 세게 차도 절반 넘게, 톡 차면 전부 막힌다', () => {
  let goals = 0, n = 0, straight = 0, sn = 0, weak = 0;
  let seed = 1;
  for (const x0 of [HW - 12, HW - 10, HW - 8]) for (const y0 of [-4, 0, 4]) {   // 골대에서 8~12m(경기장 길이와 상관없이 — 2026-11-07 넓힘)
    for (const ty of [-2, -1.5, 1.5, 2]) for (const hold of [33, 40]) { goals += shotFrom(x0, y0, ty, hold, seed++) ? 1 : 0; n++; }
    for (const hold of [33, 40]) { straight += shotFrom(x0, y0, 0, hold, seed++) ? 1 : 0; sn++; }
    weak += shotFrom(x0, y0, 0, 2, seed++) ? 1 : 0;
  }
  const rate = goals / n;
  // 위 끝 70% → 80%(2026-11-07 "3d는 슈팅 보정을 해줘야지 골대로 가게" — 골문 쪽을 보고 찬 공이 모두 골문 안으로 가니 구석 슛이 더 들어간다)
  // 게이지(2026-11-07 "게이지 시스템 피파랑 비슷하게 가자") — 잘 들어가는 띠(60~75%)로 구석에 찬 슛이라 위 끝 80% → 90%. 꽉 채운 슛은 크로스바를 넘는다(sim 시험).
  assert.ok(rate >= 0.35 && rate <= 0.9, `구석 ${goals}/${n}`);
  // 정면 강슛 위 끝 25% → 45%(같은 날 게이지 — 잘 들어가는 띠에서 슛이 이미 가장 빠르다(24m/s). 몸 쪽 공은 여전히 다 막고, 반대 구석으로 조금 당긴 공이 손끝을 지나간다)
  assert.ok(straight / sn <= 0.45, `정면 강슛 ${straight}/${sn}`);
  assert.equal(weak, 0, '약한 정면 슛');
});

// 2026-11-07 "뭔가 너무 어렵다" — 공 주인이 바뀌면 다른 필드 봇은 0.25초(15틱) 동안 가던 쪽으로 계속 간다(결정적).
test('봇 반응 늦음 — 공 주인이 막 바뀌면 15틱 동안 다른 필드 봇은 가던 쪽 그대로, 그 뒤엔 다시 판단한다', () => {
  const cfg = five();
  let s = createMatch(cfg, 3);
  for (let t = 0; t < 400; t++) s = step(s, cfg, bots(s, cfg));
  s = JSON.parse(JSON.stringify(s));
  s.phase = 'play';
  const owner = 6;   // 상대 편 필드 선수에게 공을 막 넘긴다
  s.owner = owner; s.lastTouch = owner; s.lastTouchTick = s.tick;
  const q = 2, p = s.players[q];
  Object.assign(p, { vx: 3, vy: -1 });
  const a = botInput(s, cfg, q), v = Math.sqrt(10);
  assert.ok(Math.abs(a.x - 3 / Math.max(v, BASE_PERF.maxSpeed)) < 1e-9 && Math.abs(a.y + 1 / Math.max(v, BASE_PERF.maxSpeed)) < 1e-9, JSON.stringify(a));
  assert.equal(a.shoot, false);
  const later = { ...s, tick: s.lastTouchTick + 15 };
  const b = botInput(later, cfg, q);
  assert.notDeepEqual([b.x, b.y], [a.x, a.y], '15틱 뒤엔 다시 판단');
});
