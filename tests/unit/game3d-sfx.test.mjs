// 3D 축구 시제품(2026-11-07 "3d도 당연히 효과음 있어야지 두 모드 다 일관성 갖추게해") — 소리 낼 사건 찾기(sfx3d.ts)와 도움 규칙.
import test from 'node:test';
import assert from 'node:assert/strict';
import { detectSfx3d } from '../../src/react/game3d/sfx3d.ts';
import { createMatch, step, eventsBetween, NO_INPUT, PITCH3D, RULES3D } from '../../src/lib/game3d/sim.ts';
import { BASE_PERF } from '../../src/lib/game3d/stats.ts';

const { HW, ballR } = PITCH3D;
const P = (id, side, o = {}) => ({ id, num: 100 + id, name: `P${id}`, side, bot: true, gk: false, perf: { ...BASE_PERF }, ...o });
const few = (sides, extra = {}) => ({ minutes: 2, players: sides.map((s, i) => P(i, s, extra[i] ?? {})) });
const idle = (cfg) => cfg.players.map(() => ({ ...NO_INPUT }));
const I = (o = {}) => ({ x: 0, y: 0, shoot: false, pass: false, ...o });
const put = (s, o = {}) => {
  const n = JSON.parse(JSON.stringify(s));
  n.phase = 'play'; n.phaseTicks = 0;
  Object.assign(n, o.state ?? {});
  if (o.ball) n.ball = { x: 0, y: 0, z: ballR, vx: 0, vy: 0, vz: 0, ...o.ball };
  for (const [i, p] of Object.entries(o.players ?? {})) Object.assign(n.players[i], { vx: 0, vy: 0 }, p);
  return n;
};
const FAR = (i) => ({ x: -14 + i * 2, y: -10 });
/** 몇 틱 돌리며 나온 소리를 모은다. */
const collect = (s, cfg, n, inputs = () => idle(cfg)) => {
  const out = [];
  for (let t = 0; t < n; t++) { const nx = step(s, cfg, inputs(s, t)); out.push(...detectSfx3d(s, nx, cfg)); s = nx; }
  return { s, out };
};
const kinds = (arr) => arr.map((x) => x.kind);

test('같은 상태·처음 상태엔 소리가 없고, 경기 첫 틱엔 휘슬', () => {
  const cfg = few([0, 1]);
  const s = createMatch(cfg, 1);
  assert.deepEqual(detectSfx3d(null, s, cfg), []);
  assert.deepEqual(detectSfx3d(s, s, cfg), []);
  assert.ok(kinds(detectSfx3d(s, step(s, cfg, idle(cfg)), cfg)).includes('whistle'));
});

test('패스는 킥 소리, 슛은 슛 소리 — 모을수록 크다', () => {
  const cfg = few([0, 0, 1]);
  const base = () => step(put(createMatch(cfg, 2), { ball: { x: -9.3, y: 0 }, players: { 0: { x: -10, y: 0, fx: 1, fy: 0 }, 1: { x: 0, y: 1 }, 2: FAR(2) } }), cfg, idle(cfg));
  const passed = collect(base(), cfg, 2, (s, t) => [I({ pass: t === 0 }), NO_INPUT, NO_INPUT]);
  assert.deepEqual(kinds(passed.out), ['kick']);
  const shotVol = (hold) => collect(base(), cfg, hold + 1, (s, t) => [I({ shoot: t < hold }), NO_INPUT, NO_INPUT]).out.find((x) => x.kind === 'shot')?.vol;
  const soft = shotVol(4), hard = shotVol(RULES3D.chargeTicks);
  assert.ok(soft !== undefined && hard !== undefined && hard > soft + 0.3, `슛 소리 ${soft} → ${hard}`);
});

test('튕김 — 높이서 떨어진 공은 땅에서 소리, 세게 벽에 맞으면 크게, 느리게 굴러 닿으면 조용', () => {
  const cfg = few([0, 1]);
  const drop = collect(put(createMatch(cfg, 3), { ball: { x: 0, y: 0, z: 4 }, players: { 0: FAR(0), 1: FAR(1) } }), cfg, 60);
  const ground = drop.out.filter((x) => x.kind === 'bounce');
  assert.ok(ground.length >= 1 && ground[0].vol > 0.4, JSON.stringify(ground));
  const wall = collect(put(createMatch(cfg, 3), { ball: { x: 0, y: 8, vx: 0, vy: 24 }, players: { 0: FAR(0), 1: FAR(1) } }), cfg, 20);
  const hit = wall.out.find((x) => x.kind === 'bounce');
  assert.ok(hit && hit.vol > 0.7, `벽 ${JSON.stringify(hit)}`);
  const slow = collect(put(createMatch(cfg, 3), { ball: { x: 0, y: 9.5, vx: 0, vy: 2.5 }, players: { 0: FAR(0), 1: FAR(1) } }), cfg, 60);
  assert.ok(!kinds(slow.out).includes('bounce'), '느린 구르기는 조용');
});

test('골키퍼가 잡으면 잡는 소리, 골이면 골 소리 + 골 뒤 킥오프 휘슬, 끝나면 끝 휘슬', () => {
  const cfg = few([0, 1], { 1: { gk: true } });
  const caught = collect(put(createMatch(cfg, 4), { ball: { x: HW - 4, y: 0, z: 0.5, vx: 12 }, players: { 0: FAR(0), 1: { x: HW - 1.2, y: 0, fx: -1, fy: 0 } } }), cfg, 40);
  assert.ok(kinds(caught.out).includes('catch'), JSON.stringify(caught.out));
  const scored = collect(put(createMatch(cfg, 4), { ball: { x: HW - 2, y: 0, z: 0.5, vx: 15 }, players: { 0: FAR(0), 1: { x: HW - 3, y: 9 } }, state: { lastTouch: 0 } }), cfg, RULES3D.goalTicks + 10);
  const k = kinds(scored.out);
  assert.ok(k.includes('goal') && k.lastIndexOf('whistle') > k.indexOf('goal'), k.join(','));
  const ending = collect(put(createMatch({ ...cfg, minutes: 0.02 }, 4), { players: { 0: FAR(0), 1: FAR(1) } }), { ...cfg, minutes: 0.02 }, 120);
  assert.ok(kinds(ending.out).includes('end'));
});

test('태클로 빼앗으면 태클 소리', () => {
  const cfg = few([0, 1]);
  let s = put(createMatch(cfg, 6), { ball: { x: 0.7, y: 0 }, players: { 1: { x: 0, y: 0, fx: 1, fy: 0 }, 0: { x: 1.5, y: 0, fx: -1, fy: 0 } } });
  s.stealLock = 999;
  s = step(s, cfg, idle(cfg));
  const n = step(s, cfg, [I({ shoot: true }), NO_INPUT]);
  assert.equal(n.owner, 0);
  assert.ok(kinds(detectSfx3d(s, n, cfg)).includes('tackle'));
});

test('도움 — 득점자 바로 앞에 만진 같은 편 다른 선수(8초 안), 상대가 끼었거나 오래됐으면 없다', () => {
  const cfg = few([0, 0, 1]);
  const scoreAfter = (ticksBetween, oppTouch) => {
    // 0 번이 1 번에게 패스 → (상대 터치) → 1 번이 빈 골대에 슛
    let s = put(createMatch(cfg, 7), { ball: { x: 0.7, y: 0 }, players: { 0: { x: 0, y: 0, fx: 1, fy: 0 }, 1: { x: 6, y: 0, fx: 1, fy: 0 }, 2: FAR(2) } });
    s = step(s, cfg, idle(cfg));
    s = step(s, cfg, [I({ pass: true }), NO_INPUT, NO_INPUT]);
    s = step(s, cfg, idle(cfg));
    for (let t = 0; t < 120 && s.owner !== 1; t++) s = step(s, cfg, idle(cfg));
    assert.equal(s.owner, 1);
    s = JSON.parse(JSON.stringify(s));
    s.tick += ticksBetween;
    // 상대(2)가 한 번 건드렸다가 1 번이 다시 잡은 것으로 — 1 번 바로 앞에 만진 사람은 상대
    if (oppTouch) { s.prevTouch = 2; s.prevTouchTick = s.tick; s.lastTouch = 1; s.lastTouchTick = s.tick; }
    Object.assign(s.players[1], { x: 13, y: 0 }); s.ball = { x: 13.7, y: 0, z: ballR, vx: 0, vy: 0, vz: 0 };
    const events = [];
    for (let t = 0; t < 120 && s.phase === 'play'; t++) {
      const nx = step(s, cfg, [NO_INPUT, I({ shoot: t < 20 }), NO_INPUT]);
      events.push(...eventsBetween(s, nx)); s = nx;
    }
    return { s, goal: events.find((e) => e.type === 'goal') };
  };
  const fresh = scoreAfter(0, false);
  assert.ok(fresh.goal, '골');
  assert.equal(fresh.goal.scorer, 1); assert.equal(fresh.goal.assist, 0); assert.equal(fresh.s.lastAssist, 0);
  const stale = scoreAfter(9 * 60, false);
  assert.equal(stale.goal.assist, null, '8초 넘게 지난 패스는 도움이 아니다');
  const cut = scoreAfter(0, true);
  assert.equal(cut.goal.scorer, 1); assert.equal(cut.goal.assist, null, '바로 앞에 상대가 만졌다');
});
