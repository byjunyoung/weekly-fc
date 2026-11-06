// 3D 드리블 훈련장(2026-11-07 게임 묶음 6단계) — 2D 와 같은 코스·문·콘·결승 판정(2D 함수로), 3·2·1 입력 무시, 레인 따로, 3D 메달, 스냅샷 크기.
import test from 'node:test';
import assert from 'node:assert/strict';
import { dribble3d, createDribble3, stepDribble3, course3, DR3_SCALE, LANE_X, LANE_Y, MEDALS3, lane3Time, dr3Ranking } from '../../src/lib/games/dribble3d.ts';
import { COURSES, COUNT_TICKS, courseCones } from '../../src/lib/games/dribble2d.ts';
import { IDLE3, Q3_COUNT } from '../../src/lib/game3d/quant.ts';
import { MAX_CODES } from '../../src/lib/games/net.ts';
import { PITCH3D } from '../../src/lib/game3d/sim.ts';
import { dr3Cfg } from './fixtures/games-cases-p6.mjs';

const g = dribble3d, K = DR3_SCALE;
const run = (s, c, n, f) => { for (let t = 0; t < n; t++) s = stepDribble3(s, c, f ? f(s, t) : c.players.map(() => IDLE3)); return s; };

test('코스는 2D 코스를 m 로(몸 반지름 비율) — 레인 23.7 × 6.5m 가 3D 경기장 안, 메달은 3D 것', () => {
  assert.ok(Math.abs(K - PITCH3D.playerR / 22) < 1e-12);
  assert.ok(LANE_X < PITCH3D.HW && LANE_Y < PITCH3D.HH);
  for (let i = 0; i < 4; i++) {
    const c = course3(i);
    assert.deepEqual(c.gates, COURSES[i].gates);
    assert.deepEqual(c.medals, MEDALS3[i]);
    assert.ok(c.medals[0] < c.medals[1] && c.medals[1] < c.medals[2]);
  }
});

test('3·2·1 동안은 입력을 듣지 않는다, 그다음 달린다', () => {
  const c = dr3Cfg(0, 1);
  let s = createDribble3(c, 1);
  const x0 = s.lanes[0].p.x;
  s = run(s, c, COUNT_TICKS - 1, () => [{ ...IDLE3, x: 1 }]);
  assert.equal(s.phase, 'count');
  assert.ok(Math.abs(s.lanes[0].p.x - x0) < 1e-9, '출발 전엔 안 움직인다');
  s = run(s, c, 60, () => [{ ...IDLE3, x: 1 }]);
  assert.equal(s.phase, 'run');
  assert.ok(s.lanes[0].p.x - x0 > 2, '출발 뒤 달린다');
});

test('문은 차례대로 — 다음 문이 아닌 문을 지나도 안 센다, 콘에 닿으면 넘어지고 1초', () => {
  const c = dr3Cfg(0, 1);
  let s = run(createDribble3(c, 2), c, COUNT_TICKS);
  const cones = courseCones(course3(0));
  // 둘째 문을 먼저 지나게(몸·공을 그 앞에 놓고 앞으로)
  const g2 = course3(0).gates[1];
  s = { ...s, lanes: [{ ...s.lanes[0], p: { ...s.lanes[0].p, x: (g2.x - 60) * K, y: g2.y * K, fx: 1, fy: 0 }, b: { ...s.lanes[0].b, x: (g2.x - 25) * K, y: g2.y * K, owner: 0 } }] };
  s = run(s, c, 60, () => [{ ...IDLE3, x: 0.5 }]);
  assert.equal(s.lanes[0].gate, 0, '건너뛴 문은 세지 않는다');
  // 콘에 몸을 붙인다
  const k = cones[0];
  s = { ...s, lanes: [{ ...s.lanes[0], p: { ...s.lanes[0].p, x: k.x * K - 0.3, y: k.y * K } }] };
  s = run(s, c, 2);
  assert.equal(s.lanes[0].pen, 1);
  assert.equal(s.lanes[0].hit & 1, 1);
  s = run(s, c, 30);
  assert.equal(s.lanes[0].pen, 1, '콘마다 한 번');
});

test('공을 잃으면(몸에서 1.7m 밖) 문을 지나도 안 센다', () => {
  const c = dr3Cfg(0, 1);
  let s = run(createDribble3(c, 3), c, COUNT_TICKS);
  const g1 = course3(0).gates[0];
  s = { ...s, lanes: [{ ...s.lanes[0], p: { ...s.lanes[0].p, x: (g1.x - 40) * K, y: g1.y * K, fx: 1, fy: 0 }, b: { ...s.lanes[0].b, x: (g1.x - 250) * K, y: (g1.y - 120) * K, owner: null } }] };
  s = run(s, c, 40, () => [{ ...IDLE3, x: 1 }]);
  assert.ok(s.lanes[0].p.x > g1.x * K, '몸은 문을 지났다');
  assert.equal(s.lanes[0].gate, 0);
});

test('대본 주자 — 코스 넷 모두 도착, 기록이 동메달 시간 안(메달 기준을 잰 주자 — 씨앗에 따라 공이 풀려 조금 늦기도 한다)', () => {
  for (let i = 0; i < 4; i++) {
    const c = dr3Cfg(i, 1, 1);
    let s = createDribble3(c, 7);
    while (!g.ended(s)) s = g.step(s, c, [g.decode(g.encode(g.botInput(s, c, 0)))]);
    const t = lane3Time(s.lanes[0]);
    assert.ok(t !== null && t <= MEDALS3[i][2], `${course3(i).name} ${t}`);
  }
});

test('레인은 따로 — 한 사람 입력이 다른 레인을 안 움직인다, 순위는 도착한 기록 순', () => {
  const c = dr3Cfg(0, 3);
  let s = run(createDribble3(c, 4), c, COUNT_TICKS + 60, () => [{ ...IDLE3, x: 1 }, IDLE3, { ...IDLE3, x: -1 }]);
  assert.ok(s.lanes[0].p.x > s.lanes[1].p.x + 2 && s.lanes[1].p.x > s.lanes[2].p.x);
  s = { ...s, lanes: s.lanes.map((l, i) => ({ ...l, fin: [600, -1, 500][i] })) };
  assert.deepEqual(dr3Ranking(s), [2, 0, 1]);
});

test('8명 레인 스냅샷(pack) 2.5KB 이하', () => {
  const c = dr3Cfg(1, 8, 8);
  let s = g.create(c, 9), max = 0;
  for (let t = 0; t < 1500 && !g.ended(s); t++) {
    const qs = c.players.map((_, i) => g.encode(g.botInput(s, c, i)));
    s = g.step(s, c, qs.map((q) => g.decode(q)));
    if (t % 6 === 0) max = Math.max(max, JSON.stringify({ t: 'snap', from: 'c-0123456789abcdef', seed: 4294967295, tick: s.tick, state: g.pack(s), inputs: qs, paused: false }).length);
  }
  assert.ok(max <= 2500, `${max}B`);
});

test('빈 자리(리뷰 #2) — 입력 정수 하나 더, 그 레인은 서고 "나감"·맨 아래, 다시 오면 이어 달린다, pack 에 실린다', () => {
  const a = dribble3d;
  assert.equal(a.codes, Q3_COUNT + 1);
  assert.ok(a.codes <= MAX_CODES);
  assert.equal(a.encode(a.absentInput), Q3_COUNT);
  assert.equal(a.decode(Q3_COUNT).gone, true);
  assert.equal(a.decode(a.encode(IDLE3)).gone, undefined);
  const cfg = dr3Cfg(3, 2);   // 왕복, 두 명
  let s = createDribble3(cfg, 7);
  while (s.phase === 'count') s = stepDribble3(s, cfg, [IDLE3, IDLE3]);
  const run = { ...IDLE3, x: 1, y: 0 };
  const x0 = s.lanes[1].p.x;
  for (let i = 0; i < 60; i++) s = stepDribble3(s, cfg, [run, a.absentInput]);
  assert.equal(s.lanes[1].gone, true);
  assert.ok(Math.abs(s.lanes[1].p.x - x0) < 1e-6, '나간 레인은 서 있다');
  assert.deepEqual(dr3Ranking(s), [0, 1]);
  assert.deepEqual(a.unpack(JSON.parse(JSON.stringify(a.pack(s))), cfg), s, 'pack 에 나감이 실린다');
  for (let i = 0; i < 30; i++) s = stepDribble3(s, cfg, [run, run]);
  assert.equal(s.lanes[1].gone, false, '돌아오면 나감이 아니다');
  assert.ok(s.lanes[1].p.x > x0);
});
