// 3D 축구 시제품(2026-11-07) — 경기 계산(src/lib/game3d/sim.ts). 순수·결정적이어야 하고, 공의 높이·소유·패스·슛·골키퍼가 말대로 움직여야 한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, step, eventsBetween, NO_INPUT, PITCH3D, RULES3D, TICK_HZ } from '../../src/lib/game3d/sim.ts';
import { BASE_PERF } from '../../src/lib/game3d/stats.ts';

const { HW, HH, goalHalfW, goalH, goalDepth, ballR, ceiling } = PITCH3D;
const P = (id, side, o = {}) => ({ id, num: 100 + id, name: `P${id}`, side, bot: true, gk: false, perf: { ...BASE_PERF }, ...o });
/** 5대5(편마다 골키퍼 하나 + 필드 넷). 0 편 slot 3(id 3)이 사람. */
const five = () => {
  const players = [];
  for (let side = 0; side < 2; side++) for (let k = 0; k < 5; k++) players.push(P(side * 5 + k, side, { gk: k === 0, bot: !(side === 0 && k === 3) }));
  return { minutes: 2, players };
};
/** 몇 명만 있는 판 — 물리 시험용. sides = [0,1,…] */
const few = (sides, extra = {}) => ({ minutes: 2, players: sides.map((s, i) => P(i, s, extra[i] ?? {})) });
const idle = (cfg) => cfg.players.map(() => ({ ...NO_INPUT }));
/** 상태 복사 + 배치. players: {i: {...}} (속도 0 으로), ball: {...}. 기본은 경기 중(play). */
const put = (s, o = {}) => {
  const n = JSON.parse(JSON.stringify(s));
  n.phase = 'play'; n.phaseTicks = 0;
  Object.assign(n, o.state ?? {});
  if (o.ball) n.ball = { x: 0, y: 0, z: ballR, vx: 0, vy: 0, vz: 0, ...o.ball };
  for (const [i, p] of Object.entries(o.players ?? {})) Object.assign(n.players[i], { vx: 0, vy: 0 }, p);
  return n;
};
const FAR = (i) => ({ x: -14 + i * 2, y: -HH + 1 });   // 공 길 밖(아래 벽 쪽)
const deepFreeze = (o) => { Object.values(o).forEach((v) => typeof v === 'object' && v !== null && deepFreeze(v)); return Object.freeze(o); };
const run = (s, cfg, n, inputs = () => idle(cfg), each = () => {}) => {
  let cur = s;
  for (let t = 0; t < n; t++) { const next = step(cur, cfg, inputs(cur, t)); each(cur, next, t); cur = next; }
  return cur;
};
const sp = (b) => Math.sqrt(b.vx * b.vx + b.vy * b.vy);

test('TICK_HZ 는 60', () => assert.equal(TICK_HZ, 60));

test('결정성 — 같은 설정·씨앗·입력이면 900틱 뒤 상태가 글자까지 같고, JSON 왕복해도 같은 길을 간다', () => {
  const cfg = five();
  const script = (s, t) => cfg.players.map((p, i) => ({
    x: ((t * 7 + i * 13) % 21) / 10 - 1, y: ((t * 11 + i * 5) % 17) / 8 - 1,
    shoot: (t + i * 9) % 70 < 30, pass: (t + i * 4) % 45 < 3,
  }));
  const a = run(createMatch(cfg, 42), cfg, 900, script);
  const b = run(createMatch(cfg, 42), cfg, 900, script);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  // 중간에 JSON 으로 끊었다 이어도 같다(나중에 방장이 상태를 나눠 줄 수 있게)
  const half = run(createMatch(cfg, 42), cfg, 450, script);
  const resumed = run(JSON.parse(JSON.stringify(half)), cfg, 450, (s, t) => script(s, t + 450));
  assert.equal(JSON.stringify(resumed), JSON.stringify(a));
  const c = run(createMatch(cfg, 43), cfg, 900, script);
  assert.notEqual(JSON.stringify(c), JSON.stringify(a), '씨앗이 다르면 달라진다');
});

test('step 은 받은 상태를 바꾸지 않는다', () => {
  const cfg = five();
  let s = createMatch(cfg, 7);
  for (let t = 0; t < 200; t++) {
    const frozen = deepFreeze(JSON.parse(JSON.stringify(s)));
    const inp = cfg.players.map((_, i) => ({ x: 1, y: (i % 3) - 1, shoot: t % 40 < 20, pass: t % 30 === 0 }));
    s = step(frozen, cfg, inp);   // 얼린 걸 고치려 하면 던진다
  }
  assert.ok(s.tick === 200);
});

test('공 — 떨어뜨리면 튕길수록 낮아지고, 결국 굴러서 선다(경기장 안에서)', () => {
  const cfg = few([0, 1]);
  let s = put(createMatch(cfg, 1), { ball: { x: -5, y: 0, z: 3, vx: 4, vy: 1 }, players: { 0: FAR(0), 1: FAR(1) } });
  const peaks = [];
  let rising = false, top = 0;
  s = run(s, cfg, 600, undefined, (prev, next) => {
    const b = next.ball;
    if (b.vz > 0) { rising = true; top = Math.max(top, b.z); }
    else if (rising) { peaks.push(top); rising = false; top = 0; }
  });
  assert.ok(peaks.length >= 2, `튕김 ${peaks.length}`);
  for (let i = 1; i < peaks.length; i++) assert.ok(peaks[i] < peaks[i - 1], `튕길수록 낮아진다 ${peaks}`);
  assert.equal(s.ball.z, ballR); assert.equal(s.ball.vz, 0);
  assert.equal(sp(s.ball), 0, '섰다');
  assert.ok(Math.abs(s.ball.x) < HW && Math.abs(s.ball.y) < HH);
});

test('공 — 어느 방향으로 세게 차 올려도 경기장(벽·천장·그물 상자) 밖으로 안 나간다', () => {
  const cfg = few([0, 1]);
  for (let k = 0; k < 24; k++) {
    const ux = Math.cos((k / 24) * 2 * Math.PI), uy = Math.sin((k / 24) * 2 * Math.PI);   // 테스트 쪽은 삼각함수를 써도 된다
    let s = put(createMatch(cfg, k), { ball: { x: 10 * ux, y: 6 * uy, z: 0.5, vx: 32 * ux, vy: 32 * uy, vz: 6 + (k % 5) * 4 }, players: { 0: FAR(0), 1: FAR(1) } });
    s = run(s, cfg, 400, undefined, (_, n) => {
      const b = n.ball;
      assert.ok(Number.isFinite(b.x + b.y + b.z));
      assert.ok(Math.abs(b.y) <= HH - ballR + 1e-9, `옆 ${b.y}`);
      assert.ok(b.z <= ceiling - ballR + 1e-9 && b.z >= ballR - 1e-9, `높이 ${b.z}`);
      assert.ok(Math.abs(b.x) <= HW + goalDepth - ballR + 1e-9, `끝 ${b.x}`);
      if (Math.abs(b.x) > HW) assert.ok(Math.abs(b.y) < goalHalfW && b.z < goalH, '골라인 밖은 골문 상자 안뿐');
    });
  }
});

test('골 — 골문 안·크로스바 아래로 넘은 공만 센다. 크로스바 위·골대 옆은 아니다', () => {
  const cfg = few([0, 1]);
  const shot = (ball) => {
    let s = put(createMatch(cfg, 3), { ball, players: { 0: FAR(0), 1: FAR(1) }, state: { lastTouch: 0 } });
    return run(s, cfg, 90);
  };
  const ok = shot({ x: 14, y: 0.5, z: 0.6, vx: 18, vz: 1 });
  assert.deepEqual(ok.score, [1, 0]); assert.equal(ok.phase, 'goal'); assert.equal(ok.lastScorer, 0);
  const left = shot({ x: -14, y: -1, z: 0.5, vx: -18 });
  assert.deepEqual(left.score, [0, 1], '왼쪽 골대는 1 편 득점'); assert.equal(left.lastScorer, null, '0 편이 마지막에 만졌으니 자책');
  const over = shot({ x: 14, y: 0, z: 2.8, vx: 18, vz: 2 });
  assert.deepEqual(over.score, [0, 0], '크로스바 위'); assert.ok(over.ball.x < HW, '튕겨 나왔다');
  const wide = shot({ x: 14, y: goalHalfW + 0.6, z: 0.4, vx: 18 });
  assert.deepEqual(wide.score, [0, 0], '골대 옆');
});

test('드리블 — 달리는 선수 발 앞에 공이 붙어 따라온다(달리면 조금 더 앞)', () => {
  const cfg = few([0, 1]);
  let s = put(createMatch(cfg, 5), { ball: { x: -9.3, y: 0 }, players: { 0: { x: -10, y: 0, fx: 1, fy: 0 }, 1: FAR(1) } });
  s = step(s, cfg, idle(cfg));
  assert.equal(s.owner, 0, '가까이 가면 발밑으로');
  let gapStand = 0, gapRun = 0;
  s = run(s, cfg, 150, (cur, t) => [{ x: t < 100 ? 1 : 0.6, y: t < 100 ? 0 : 0.8, shoot: false, pass: false }, { ...NO_INPUT }], (_, n, t) => {
    assert.equal(n.owner, 0, `${t}틱에 공을 놓쳤다`);
    const p = n.players[0], d = Math.sqrt((n.ball.x - p.x) ** 2 + (n.ball.y - p.y) ** 2);
    assert.ok(d < 1.6, `너무 멀다 ${d}`);
    if (t === 90) gapRun = d;
  });
  assert.ok(s.players[0].x > -3, '앞으로 갔다');   // 2.5초에 7m 넘게(2026-11-07 선수 ×0.8 — 전엔 x > 0, 10m)
  s = run(s, cfg, 60);
  const p = s.players[0];
  gapStand = Math.sqrt((s.ball.x - p.x) ** 2 + (s.ball.y - p.y) ** 2);
  assert.ok(gapRun > gapStand + 0.2, `달릴 때 더 앞 ${gapRun} vs ${gapStand}`);
});

test('드리블 — 달리다 급히 뒤로 꺾으면 공이 떨어질 때가 있다', () => {
  const cfg = few([0, 1]);
  let lost = 0;
  for (let seed = 0; seed < 20; seed++) {
    let s = put(createMatch(cfg, seed), { ball: { x: -9.3, y: 0 }, players: { 0: { x: -10, y: 0, fx: 1, fy: 0 }, 1: FAR(1) } });
    s = run(s, cfg, 60, () => [{ x: 1, y: 0, shoot: false, pass: false }, { ...NO_INPUT }]);
    assert.equal(s.owner, 0);
    s = run(s, cfg, 10, () => [{ x: -1, y: 0, shoot: false, pass: false }, { ...NO_INPUT }]);
    if (s.owner !== 0) lost++;
  }
  assert.ok(lost > 0 && lost < 20, `20번 중 ${lost}번 떨어짐`);
});

test('패스 — 보는 방향 원뿔 안 동료에게 땅볼로 가고, 받기 좋은 세기로 닿아 그 동료 발밑에 붙는다', () => {
  const cfg = few([0, 0, 0, 1]);
  let s = put(createMatch(cfg, 9), {
    ball: { x: -9.3, y: 0 },
    players: { 0: { x: -10, y: 0, fx: 1, fy: 0 }, 1: { x: 2, y: 2, fx: -1, fy: 0 }, 2: { x: -10, y: 9 }, 3: FAR(3) },
  });
  s = step(s, cfg, idle(cfg));
  assert.equal(s.owner, 0);
  const press = [{ x: 0, y: 0, shoot: false, pass: true }, NO_INPUT, NO_INPUT, NO_INPUT];
  s = step(s, cfg, press);
  s = step(s, cfg, idle(cfg));   // 떼는 순간 찬다
  assert.equal(s.owner, null); assert.equal(s.passTo, 1); assert.equal(s.lastKick.kind, 'pass');
  assert.equal(s.ball.vz, 0, '땅볼');
  assert.ok(s.ball.vx > 0 && Math.abs(s.ball.vy / s.ball.vx) < 0.35, '동료 쪽');
  let arrive = null;
  s = run(s, cfg, 240, undefined, (prev, next) => { if (prev.owner === null && next.owner !== null && arrive === null) arrive = { who: next.owner, speed: sp(prev.ball) }; });
  assert.ok(arrive, '누군가 받았다');
  assert.equal(arrive.who, 1, '원뿔 안 동료가 받았다');
  assert.ok(arrive.speed > 2 && arrive.speed < 8, `닿을 때 세기 ${arrive.speed}`);
  assert.equal(s.count.passes[0], 1);
});

test('패스 — 원뿔 안에 동료가 없으면 보는 방향으로 간다', () => {
  const cfg = few([0, 0, 1]);
  let s = put(createMatch(cfg, 9), { ball: { x: -9.3, y: 0 }, players: { 0: { x: -10, y: 0, fx: 1, fy: 0 }, 1: { x: -10, y: 8 }, 2: FAR(2) } });
  s = step(s, cfg, idle(cfg));
  s = step(s, cfg, [{ x: 0, y: 0, shoot: false, pass: true }, NO_INPUT, NO_INPUT]);
  s = step(s, cfg, idle(cfg));
  assert.equal(s.passTo, null);
  assert.ok(s.ball.vx > 0 && Math.abs(s.ball.vy) < 0.15 * s.ball.vx);
});

test('슛 — 오래 누를수록 빠르고 높이 뜬다', () => {
  const cfg = few([0, 1]);
  const shotWith = (holdTicks) => {
    let s = put(createMatch(cfg, 2), { ball: { x: -9.3, y: 0 }, players: { 0: { x: -10, y: 0, fx: 0, fy: 1 }, 1: FAR(1) } });
    s = step(s, cfg, idle(cfg));
    for (let t = 0; t < holdTicks; t++) s = step(s, cfg, [{ x: 0, y: 0, shoot: true, pass: false }, NO_INPUT]);
    s = step(s, cfg, idle(cfg));
    assert.equal(s.lastKick?.kind, 'shot');
    const v0 = Math.sqrt(sp(s.ball) ** 2 + s.ball.vz ** 2);
    let peak = s.ball.z;
    run(s, cfg, 90, undefined, (_, n) => { peak = Math.max(peak, n.ball.z); });
    return { v0, peak };
  };
  // 2026-11-07 "게이지 시스템 피파랑 비슷하게 가자" — 속도는 가운데쯤(게이지 45%)에 끝까지 오르고, 그 위로는 높이만 는다. 꽉 채우면 크로스바보다 높이 뜬다.
  const a = shotWith(8), b = shotWith(30), c = shotWith(RULES3D.chargeTicks + 20);
  assert.ok(a.v0 < b.v0 && b.v0 <= c.v0 + 1e-9, `속도 ${a.v0} ${b.v0} ${c.v0}`);
  assert.ok(a.peak < b.peak && b.peak < c.peak, `높이 ${a.peak} ${b.peak} ${c.peak}`);
  assert.ok(b.peak < goalH, `가운데쯤 모은 슛은 크로스바 아래 ${b.peak}`);
  assert.ok(c.peak > goalH + 0.3, `꽉 채운 슛은 크로스바보다 높이 뜬다 ${c.peak}`);
});

test('슛 보정 — 골문 쪽 ±60도 안을 보고 차면 골문 안으로 간다(2026-11-07 "3d는 슈팅 보정을 해줘야지 골대로 가게")', () => {
  const cfg = few([0, 1]);
  // 오른쪽 골대(x = +HW)를 향해 공격하는 편 0. 골문에서 12m 앞, 보는 방향을 골문 쪽에서 0·30·55도 틀어 본다
  const HW = PITCH3D.HW, GW = PITCH3D.goalHalfW;
  for (const deg of [0, 30, 55, -55]) {
    const a = (deg * Math.PI) / 180, fx = Math.cos(a), fy = Math.sin(a);
    let s = put(createMatch(cfg, 3), { ball: { x: HW - 12 + 0.7 * fx, y: 0.7 * fy }, players: { 0: { x: HW - 12, y: 0, fx, fy }, 1: FAR(1) } });
    s = step(s, cfg, idle(cfg));
    for (let t = 0; t < 20; t++) s = step(s, cfg, [{ x: 0, y: 0, shoot: true, pass: false }, NO_INPUT]);
    s = step(s, cfg, idle(cfg));
    assert.equal(s.lastKick?.kind, 'shot', `${deg}도`);
    const yAtLine = s.ball.y + (s.ball.vy * (HW - s.ball.x)) / s.ball.vx;
    assert.ok(Math.abs(yAtLine) < GW, `${deg}도로 찬 공이 골라인에서 y ${yAtLine.toFixed(2)} (골문 반폭 ${GW})`);
  }
});

test('빼앗기 — 공 가진 선수에게 상대가 몸으로 붙으면 빼앗거나 흘러나오고, 잠깐은 다시 못 뺏는다', () => {
  const cfg = few([0, 1]);
  let took = 0, freed = 0;
  for (let seed = 0; seed < 16; seed++) {
    let s = put(createMatch(cfg, seed), { ball: { x: 0.7, y: 0 }, players: { 0: { x: 0, y: 0, fx: 1, fy: 0 }, 1: { x: 4, y: 0, fx: -1, fy: 0 } } });
    s = step(s, cfg, idle(cfg));
    assert.equal(s.owner, 0);
    let done = false;
    run(s, cfg, 90, () => [{ ...NO_INPUT }, { x: -1, y: 0, shoot: false, pass: false }], (prev, next) => {
      if (done || prev.stealLock > 0 || next.stealLock === 0) return;
      done = true;
      if (next.owner === 1) took++; else if (next.owner === null) freed++;
      assert.ok(next.stealLock > 30, '면역');
    });
    assert.ok(done, `${seed}: 붙었는데 아무 일도 없었다`);
  }
  assert.ok(took > 0 && freed > 0, `빼앗음 ${took}, 흘러나옴 ${freed}`);
});

test('골키퍼 — 정면 약한 슛은 잡고, 구석으로 세게 찬 슛은 못 막는다', () => {
  const cfg = few([0, 1], { 1: { gk: true } });
  const fire = (fy, hold) => {
    // 골대에서 12m — 경기장 길이와 상관없이 같은 거리(2026-11-07 경기장 44m 로 넓힘)
    let s = put(createMatch(cfg, 4), { ball: { x: HW - 11.3, y: 0 }, players: { 0: { x: HW - 12, y: 0, fx: 1, fy }, 1: { x: HW - 1.2, y: 0, fx: -1, fy: 0 } } });
    s = step(s, cfg, idle(cfg));
    for (let t = 0; t < hold; t++) s = step(s, cfg, [{ x: 0, y: 0, shoot: true, pass: false }, NO_INPUT]);
    return run(s, cfg, 90);
  };
  const weak = fire(0, 2);   // 톡 친 슛(게이지 4%) — 2026-11-07 "게이지 시스템 피파랑 비슷하게 가자": 속도가 가운데쯤에 끝까지 오르므로 "약한 슛"은 톡 친 것
  assert.deepEqual(weak.score, [0, 0]); assert.equal(weak.owner, 1, '골키퍼가 잡았다');
  const strong = fire(0.17, 35);   // 게이지 65% — 잘 들어가는 띠(꽉 채우면 크로스바를 넘는다)
  assert.deepEqual(strong.score, [1, 0], '구석 강슛은 들어간다');
});

test('흐름 — 킥오프 → 경기(시계는 경기 중에만) → 골(멈춤) → 먹힌 편 킥오프 → 시간 끝 → 결과', () => {
  const cfg = { ...five(), minutes: 0.05 };   // 3초
  let s = createMatch(cfg, 11);
  assert.equal(s.phase, 'kickoff');
  const left0 = s.ticksLeft;
  s = step(s, cfg, idle(cfg));
  assert.equal(s.owner, 3, '0 편 킥오프는 사람이 공 앞에');
  assert.equal(s.phase, 'play');
  assert.equal(s.ticksLeft, left0, '킥오프 틱은 시계가 안 간다');
  s = step(s, cfg, idle(cfg));
  assert.equal(s.ticksLeft, left0 - 1);
  // 골을 만든다
  s = put(s, { ball: { x: HW - 1, y: 0, z: 0.5, vx: 15 }, players: { 5: { x: HW - 3, y: 8 } }, state: { owner: null, lastTouch: 3 } });   // 골키퍼는 비킨다
  const events = [];
  for (let t = 0; t < 30 && s.phase !== 'goal'; t++) { const n = step(s, cfg, idle(cfg)); events.push(...eventsBetween(s, n)); s = n; }
  assert.equal(s.phase, 'goal'); assert.deepEqual(s.score, [1, 0]); assert.equal(s.lastScorer, 3);
  assert.ok(events.some((e) => e.type === 'goal' && e.side === 0 && e.scorer === 3));
  const leftAtGoal = s.ticksLeft;
  s = run(s, cfg, RULES3D.goalTicks - 1);
  assert.equal(s.ticksLeft, leftAtGoal, '골 멈춤 동안 시계 정지');
  assert.equal(s.phase, 'goal');
  s = step(s, cfg, idle(cfg));
  assert.equal(s.phase, 'kickoff'); assert.equal(s.kickoffSide, 1, '먹힌 편이 킥오프');
  assert.equal(s.ball.x, 0);
  // 시간 끝
  let ended = null;
  s = run(s, cfg, 400, undefined, (p, n) => { for (const e of eventsBetween(p, n)) if (e.type === 'end') ended = e; });
  assert.equal(s.phase, 'end');
  assert.ok(ended);
  assert.equal(s.winner, s.score[0] > s.score[1] ? 0 : s.score[1] > s.score[0] ? 1 : 'draw');
});

test('보는 방향을 입력으로 주면(1인칭) 서 있어도 그쪽을 보고, 슛도 그쪽으로 간다 — 주지 않으면 예전 그대로', () => {
  const cfg = few([0, 1]);
  let s = put(createMatch(cfg, 2), { ball: { x: -9.3, y: 0 }, players: { 0: { x: -10, y: 0, fx: 1, fy: 0 }, 1: FAR(1) } });
  s = step(s, cfg, idle(cfg));
  const face = { fx: 0, fy: 2 };   // 길이는 1로 맞춰 쓴다
  for (let t = 0; t < 3; t++) s = step(s, cfg, [{ x: 0, y: 0, shoot: false, pass: false, ...face }, NO_INPUT]);
  assert.ok(Math.abs(s.players[0].fx) < 1e-9 && Math.abs(s.players[0].fy - 1) < 1e-9, '바로 그쪽을 본다');
  assert.equal(s.players[0].vx, 0, '서 있다');
  for (let t = 0; t < 20; t++) s = step(s, cfg, [{ x: 0, y: 0, shoot: true, pass: false, ...face }, NO_INPUT]);
  s = step(s, cfg, [{ x: 0, y: 0, shoot: false, pass: false, ...face }, NO_INPUT]);
  assert.equal(s.lastKick.kind, 'shot');
  assert.ok(s.ball.vy > 0 && Math.abs(s.ball.vx) < 0.05 * s.ball.vy, '보는 쪽(+y)으로');
  // 뒤로 걷기 — 보는 방향은 그대로, 몸만 뒤로
  let w = put(createMatch(cfg, 2), { players: { 0: { x: 0, y: 0, fx: 1, fy: 0 }, 1: FAR(1) } });
  for (let t = 0; t < 30; t++) w = step(w, cfg, [{ x: -1, y: 0, shoot: false, pass: false, fx: 1, fy: 0 }, NO_INPUT]);
  assert.ok(w.players[0].x < -1 && w.players[0].fx === 1, '뒷걸음');
});

// ── 키 배치(2026-11-07 "3d 게임은 키를 FC온라인이랑 동일하게 해주면 좋을듯") — 스루·로빙·질주·태클 ──
const I = (o = {}) => ({ x: 0, y: 0, shoot: false, pass: false, ...o });
/** 0 번이 공을 가진 상태(x0, 보는 방향 +x)에서 한 번 누르고 뗀다. */
const pressRelease = (s, cfg, key, hold = 1, i = 0) => {
  const n = cfg.players.length;
  const row = (on) => Array.from({ length: n }, (_, k) => (k === i ? I(on ? { [key]: true } : {}) : { ...NO_INPUT }));
  for (let t = 0; t < hold; t++) s = step(s, cfg, row(true));
  return step(s, cfg, row(false));
};

test('스루 패스 — 앞으로 뛰는 동료의 앞(상대 골대 쪽) 빈 곳으로, 짧은 패스보다 더 앞에 떨어진다', () => {
  const cfg = few([0, 0, 1]);
  const setup = () => {
    let s = put(createMatch(cfg, 3), { ball: { x: -9.3, y: 0 }, players: { 0: { x: -10, y: 0, fx: 1, fy: 0 }, 1: { x: -2, y: 1, vx: 5, vy: 0 }, 2: FAR(2) } });
    return step(s, cfg, [NO_INPUT, I({ x: 1 }), NO_INPUT]);
  };
  // 공이 선 자리(멈춘 곳) — 받는 사람은 계속 앞으로 뛴다고 보고, 공만 따로 굴려 본다(받으러 가는 사람 없이)
  const restSpot = (s) => {
    const solo = { ...cfg, players: cfg.players };
    let cur = s;
    for (let t = 0; t < 300; t++) {
      cur = JSON.parse(JSON.stringify(cur));
      cur.players[1].x = -30 + 0;   // 받는 사람을 비켜 세워 공이 끝까지 구르게
      cur.players[1].noTouch = 999;
      cur = step(cur, solo, [NO_INPUT, NO_INPUT, NO_INPUT]);
      if (cur.ball.vx === 0 && cur.ball.vy === 0) break;
    }
    return cur.ball;
  };
  const a = setup();
  assert.equal(a.owner, 0);
  const th = pressRelease(a, cfg, 'through');
  assert.equal(th.lastKick?.kind, 'pass'); assert.equal(th.passTo, 1); assert.equal(th.count.throughs[0], 1);
  const sh = pressRelease(setup(), cfg, 'pass');
  const thRest = restSpot(th), shRest = restSpot(sh);
  assert.ok(thRest.x > shRest.x + 3, `스루가 더 앞 ${thRest.x.toFixed(1)} vs 짧은 ${shRest.x.toFixed(1)}`);
  assert.ok(thRest.x > -2 + 4, '받는 사람보다 앞');
  assert.ok(Math.sqrt(th.ball.vx ** 2 + th.ball.vy ** 2) > Math.sqrt(sh.ball.vx ** 2 + sh.ball.vy ** 2), '더 빠르다');
  // 동료가 없으면 보는 쪽으로
  const lone = few([0, 1]);
  let l = put(createMatch(lone, 3), { ball: { x: -9.3, y: 0 }, players: { 0: { x: -10, y: 0, fx: 1, fy: 0 }, 1: FAR(1) } });
  l = step(l, lone, idle(lone));
  l = pressRelease(l, lone, 'through');
  assert.ok(l.ball.vx > 0 && Math.abs(l.ball.vy) < 0.15 * l.ball.vx && l.passTo === null);
});

test('로빙 패스 — 가는 길의 상대 머리 위로 넘어가, 먼 동료 가까이 떨어진다', () => {
  const cfg = few([0, 0, 1]);
  let s = put(createMatch(cfg, 4), { ball: { x: -9.3, y: 0 }, players: { 0: { x: -10, y: 0, fx: 1, fy: 0 }, 1: { x: 6, y: 0 }, 2: { x: -2, y: 0 } } });
  s = step(s, cfg, idle(cfg));
  assert.equal(s.owner, 0);
  s = pressRelease(s, cfg, 'lob', 4);
  assert.equal(s.passTo, 1); assert.equal(s.count.lobs[0], 1);
  assert.ok(s.ball.vz > 3, '뜬다');
  let overOpp = null, land = null;
  for (let t = 0; t < 200 && land === null; t++) {
    const prev = s;
    // 상대는 제자리, 받는 사람도 제자리(땅에 닿는 곳만 본다)
    s = step(s, cfg, [NO_INPUT, NO_INPUT, NO_INPUT]);
    if (overOpp === null && prev.ball.x < -2 && s.ball.x >= -2) overOpp = s.ball.z;
    if (prev.ball.vz < 0 && s.ball.vz >= 0 && s.ball.z <= PITCH3D.ballR + 0.05) land = { x: s.ball.x, y: s.ball.y };
    if (s.owner !== null) land = land ?? { x: s.ball.x, y: s.ball.y };
  }
  assert.ok(overOpp !== null && overOpp > PITCH3D.playerH, `상대 위 높이 ${overOpp}`);
  assert.ok(land && Math.abs(land.x - 6) < 2.5 && Math.abs(land.y) < 1.5, `떨어진 곳 ${JSON.stringify(land)}`);
  assert.ok(s.owner !== 2, '가운데 상대가 가로채지 못했다');
});

test('질주 — 더 빠르지만 공이 더 앞서 구르고, 꺾으면 더 잘 흘리고, 체력이 닳는다', () => {
  const cfg = few([0, 1]);
  const run = (sprint, ticks = 90) => {
    let s = put(createMatch(cfg, 5), { ball: { x: -14.3, y: 0 }, players: { 0: { x: -15, y: 0, fx: 1, fy: 0 }, 1: FAR(1) } });
    s = step(s, cfg, idle(cfg));
    let gapMax = 0;
    for (let t = 0; t < ticks; t++) {
      s = step(s, cfg, [I({ x: 1, sprint }), NO_INPUT]);
      const p = s.players[0];
      gapMax = Math.max(gapMax, Math.sqrt((s.ball.x - p.x) ** 2 + (s.ball.y - p.y) ** 2));
    }
    return { s, gapMax };
  };
  const walk = run(false), dash = run(true);
  assert.ok(dash.s.players[0].x > walk.s.players[0].x + 1.2, `질주가 더 멀리 ${dash.s.players[0].x} vs ${walk.s.players[0].x}`);
  assert.ok(dash.gapMax > walk.gapMax + 0.15, `공이 더 앞 ${dash.gapMax} vs ${walk.gapMax}`);
  assert.ok(dash.s.players[0].stamina < 0.75 && walk.s.players[0].stamina === 1, '체력');
  // 다 닳면 질주가 꺼진다
  const tired = run(true, 300);
  assert.ok(tired.s.players[0].stamina < 0.25, '다 닳았다가 숨 고르는 중'); assert.equal(tired.s.players[0].sprint, false);
  // 급히 꺾을 때 흘리는 횟수 — 질주가 더 많다
  let lostWalk = 0, lostDash = 0;
  for (let seed = 0; seed < 30; seed++) for (const sprint of [false, true]) {
    let s = put(createMatch(cfg, seed), { ball: { x: -9.3, y: 0 }, players: { 0: { x: -10, y: 0, fx: 1, fy: 0 }, 1: FAR(1) } });
    s = step(s, cfg, idle(cfg));
    for (let t = 0; t < 50; t++) s = step(s, cfg, [I({ x: 1, sprint }), NO_INPUT]);
    for (let t = 0; t < 10; t++) s = step(s, cfg, [I({ x: 0, y: t < 5 ? 1 : -1, sprint }), NO_INPUT]);
    for (let t = 0; t < 10; t++) s = step(s, cfg, [I({ x: -1, sprint }), NO_INPUT]);
    if (s.owner !== 0) { if (sprint) lostDash++; else lostWalk++; }
  }
  assert.ok(lostDash > lostWalk, `흘림 질주 ${lostDash} vs 보통 ${lostWalk}`);
});

test('태클(공 없을 때 슛 키) — 닿으면 공을 가져오고, 멀면 헛손질, 회복 동안 다시 못 하고 그 누름은 슛이 안 된다', () => {
  const cfg = few([0, 1]);
  const setup = (gap) => {
    // 1 번(상대)이 공을 가졌고, 0 번이 그 공을 보고 gap 만큼 떨어져 있다
    let s = put(createMatch(cfg, 6), { ball: { x: 0.7, y: 0 }, players: { 1: { x: 0, y: 0, fx: 1, fy: 0 }, 0: { x: 0.7 + 0.6 + gap, y: 0, fx: -1, fy: 0 } } });
    s.stealLock = 999;   // 몸 부딪치기 빼앗기는 끈다 — 태클만 본다
    s = step(s, cfg, idle(cfg));
    assert.equal(s.owner, 1);
    return s;
  };
  let s = setup(0.2);
  s = step(s, cfg, [I({ shoot: true }), NO_INPUT]);
  assert.equal(s.owner, 0, '닿았다 — 가져왔다');
  assert.ok(s.players[0].tackleCD > 0 && s.players[0].shootVoid);
  for (let t = 0; t < 5; t++) s = step(s, cfg, [I({ shoot: true }), NO_INPUT]);
  s = step(s, cfg, idle(cfg));
  assert.equal(s.count.shots[0], 0, '태클한 누름을 떼도 슛은 안 나간다');
  let far = setup(2.5);
  far = step(far, cfg, [I({ shoot: true }), NO_INPUT]);
  assert.equal(far.owner, 1, '멀면 헛손질');
  assert.equal(far.players[0].tackleCD, RULES3D.tackleRecover - 0 || far.players[0].tackleCD);
  assert.ok(far.players[0].tackleCD > 0, '빗나가도 회복');
  // 회복 중엔 붙어서 눌러도 못 뺏는다
  far = step(far, cfg, idle(cfg));
  Object.assign(far.players[0], { x: far.ball.x + 0.75, y: 0, fx: -1, fy: 0, vx: 0, vy: 0 });
  far = step(far, cfg, [I({ shoot: true }), NO_INPUT]);
  assert.equal(far.owner, 1, '회복 중');
  // 회복이 끝나면 다시
  for (let t = 0; t < RULES3D.tackleRecover + 2; t++) { far = step(far, cfg, idle(cfg)); far.players[0].x = far.ball.x + 0.75; far.players[0].y = far.ball.y; far.players[0].vx = 0; far.players[0].fx = -1; far.players[0].fy = 0; }
  far = step(far, cfg, [I({ shoot: true }), NO_INPUT]);
  assert.equal(far.owner, 0, '회복 뒤 다시 태클');
});

// ═══════════════════ 게이지(2026-11-07 "게이지 시스템 피파랑 비슷하게 가자") ═══════════════════
/** 공을 가진 0번이 key 를 hold 틱 누르고 뗀 뒤의 상태(뗀 틱 직후). */
function kickWith(cfg, s, key, hold) {
  s = step(s, cfg, idle(cfg));
  for (let t = 0; t < hold; t++) s = step(s, cfg, [{ x: 0, y: 0, shoot: false, pass: false, [key]: true }, ...idle(cfg).slice(1)]);
  return step(s, cfg, idle(cfg));
}
test('게이지 — 패스는 톡 치면 가까운 동료, 오래 누르면 먼 동료(같은 방향 원뿔 안)', () => {
  const cfg = few([0, 0, 0, 1]);
  const at = () => put(createMatch(cfg, 9), {
    ball: { x: -14.3, y: 0 },
    players: { 0: { x: -15, y: 0, fx: 1, fy: 0 }, 1: { x: -9, y: 1, fx: -1, fy: 0 }, 2: { x: 4, y: -1.5, fx: -1, fy: 0 }, 3: FAR(3) },
  });
  const tap = kickWith(cfg, at(), 'pass', 1);
  assert.equal(tap.passTo, 1, '톡 = 6m 동료');
  const held = kickWith(cfg, at(), 'pass', RULES3D.passCharge);
  assert.equal(held.passTo, 2, '꽉 = 19m 동료');
  assert.ok(sp(held.ball) > sp(tap.ball), '먼 패스가 더 세다');
  // 받는 세기는 그대로 — 먼 동료에게도 받기 좋은 세기로 닿는다
  let arrive = null;
  run(held, cfg, 300, undefined, (p, n) => { if (p.owner === null && n.owner !== null && arrive === null) arrive = { who: n.owner, speed: sp(p.ball) }; });
  assert.equal(arrive?.who, 2);
  assert.ok(arrive.speed > 2 && arrive.speed < 8, `닿을 때 ${arrive?.speed}`);
});

test('게이지 — 동료가 없으면 보는 쪽으로 게이지 거리만큼(패스·스루·로빙 모두 오래 누를수록 멀리)', () => {
  const cfg = few([0, 1]);
  const at = () => put(createMatch(cfg, 4), { ball: { x: -14.3, y: 0 }, players: { 0: { x: -15, y: 0, fx: 1, fy: 0 }, 1: FAR(1) } });
  const landed = (key, hold) => {
    let s = kickWith(cfg, at(), key, hold);
    const x0 = s.ball.x;
    let first = null;
    s = run(s, cfg, 400, undefined, (p, n) => { if (key === 'lob' && first === null && p.ball.vz < 0 && n.ball.vz >= 0) first = n.ball.x; });
    return key === 'lob' ? first - x0 : s.ball.x - x0;
  };
  for (const key of ['pass', 'through', 'lob']) {
    const short = landed(key, 4), long = landed(key, RULES3D.passCharge);
    assert.ok(long > short + 8, `${key}: 짧게 ${short.toFixed(1)}m · 길게 ${long.toFixed(1)}m`);
  }
  // 땅볼 패스 꽉 = 26m 쯤에서 선다(게이지 = 거리)
  const full = landed('pass', RULES3D.passCharge);
  assert.ok(full > 22 && full < 30, `꽉 찬 땅볼 ${full}`);
});

test('게이지 — 가까이서 꽉 채운 슛은 가운데쯤 모은 슛보다 크로스바를 자주 넘는다', () => {
  const cfg = few([0, 1]);
  const over = (hold) => {
    let n = 0;
    for (const dist of [10, 12, 14]) for (const fy of [-0.15, 0, 0.15]) {
      let s = put(createMatch(cfg, 3), { ball: { x: HW - dist + 0.7, y: 0 }, players: { 0: { x: HW - dist, y: 0, fx: 1, fy }, 1: FAR(1) } });
      s = kickWith(cfg, s, 'shoot', hold);
      let hi = false;
      // 골라인 1m 앞에서 이미 크로스바보다 높으면 넘긴 것(그 뒤는 끝 벽에 튕긴다)
      run(s, cfg, 120, undefined, (_, x) => { if (Math.abs(x.ball.x) >= HW - 1 && x.ball.z > goalH) hi = true; });
      if (hi) n++;
    }
    return n;
  };
  const mid = over(Math.round(RULES3D.chargeTicks * 0.65)), full = over(RULES3D.chargeTicks);
  assert.equal(mid, 0, '가운데쯤 모은 슛은 크로스바 아래');
  assert.ok(full >= 7, `꽉 채운 슛 아홉 중 ${full}번 크로스바 위`);
});

test('게이지 — 패스 계열을 모으는 동안은 슛을 모을 때처럼 느려진다(공을 가졌을 때)', () => {
  const cfg = few([0, 1]);
  const speedWith = (key) => {
    let s = put(createMatch(cfg, 2), { ball: { x: -14.3, y: 0 }, players: { 0: { x: -15, y: 0, fx: 1, fy: 0 }, 1: FAR(1) } });
    s = step(s, cfg, idle(cfg));
    for (let t = 0; t < 30; t++) s = step(s, cfg, [{ x: 1, y: 0, shoot: false, pass: false, ...(key ? { [key]: true } : {}) }, NO_INPUT]);
    return s.players[0].vx;
  };
  const free = speedWith(null);
  for (const key of ['pass', 'through', 'lob']) assert.ok(speedWith(key) < free * 0.85, `${key} ${speedWith(key)} vs ${free}`);
});
