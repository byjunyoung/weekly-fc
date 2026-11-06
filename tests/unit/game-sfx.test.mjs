import test from 'node:test';
import assert from 'node:assert/strict';
import { detectSfx } from '../../src/react/game/sfx-detect.ts';
import { createMatch, step, NO_INPUT } from '../../src/lib/game/sim.ts';
import { BASE_PERF } from '../../src/lib/game/stats.ts';

const cfg = { field: 'M', minutes: 2, scoreLimit: 0, players: [0, 1].map((i) => ({ id: i, num: 10 + i, name: `P${i}`, side: i, bot: true, perf: { ...BASE_PERF } })) };
const kinds = (a, b) => detectSfx(a, b).map((s) => s.kind);
const put = (s, o) => { const n = JSON.parse(JSON.stringify(s)); Object.assign(n, o.state ?? {}); if (o.ball) n.ball = { vx: 0, vy: 0, ...o.ball }; for (const [i, p] of Object.entries(o.players ?? {})) Object.assign(n.players[i], { vx: 0, vy: 0 }, p); return n; };

test('효과음 — 처음 상태·같은 상태에선 아무 소리도 없다', () => {
  const s = createMatch(cfg, 1);
  assert.deepEqual(detectSfx(null, s), []);
  assert.deepEqual(detectSfx(s, s), []);
});

test('효과음 — 킥은 차는 순간 한 번, 누르고만 있을 땐 없다', () => {
  const base = put(createMatch(cfg, 1), { state: { phase: 'play' }, ball: { x: 0, y: 0 }, players: { 0: { x: -31, y: 0 }, 1: { x: 400, y: 300 } } });
  const hold = [{ x: 0, y: 0, kick: true }, { ...NO_INPUT }];
  const k1 = step(base, cfg, hold);
  assert.deepEqual(kinds(base, k1), ['kick']);
  const k2 = step(k1, cfg, hold);
  assert.ok(!kinds(k1, k2).includes('kick'), '계속 누르고 있을 뿐');
});

test('효과음 — 벽에 맞고 꺾이면 튕김, 빠를수록 크다. 느린 공은 조용하다', () => {
  const fast = put(createMatch(cfg, 1), { state: { phase: 'play' }, ball: { x: 0, y: 340, vx: 0, vy: 600 }, players: { 0: { x: -400, y: 0 }, 1: { x: 400, y: 0 } } });
  let s = fast, got = null;
  for (let t = 0; t < 20 && !got; t++) { const n = step(s, cfg, [NO_INPUT, NO_INPUT]); got = detectSfx(s, n).find((x) => x.kind === 'bounce') ?? null; s = n; }
  assert.ok(got, '튕김 소리가 났다');
  assert.ok(got.vol > 0.5 && got.vol <= 1);
  const slow = put(createMatch(cfg, 1), { state: { phase: 'play' }, ball: { x: 0, y: 340, vx: 0, vy: 80 }, players: { 0: { x: -400, y: 0 }, 1: { x: 400, y: 0 } } });
  let q = slow, any = false;
  for (let t = 0; t < 40; t++) { const n = step(q, cfg, [NO_INPUT, NO_INPUT]); if (detectSfx(q, n).some((x) => x.kind === 'bounce')) any = true; q = n; }
  assert.equal(any, false, '느린 공은 조용하다');
});

test('효과음 — 골·끝·킥오프 휘슬은 그 순간 한 번', () => {
  const a = createMatch(cfg, 1);
  const goal = put(a, { state: { phase: 'goal', score: [1, 0] } });
  assert.ok(kinds(put(a, { state: { phase: 'play' } }), goal).includes('goal'));
  assert.ok(kinds(goal, put(goal, { state: { phase: 'kickoff' } })).includes('whistle'));
  assert.ok(kinds(put(a, { state: { phase: 'play' } }), put(a, { state: { phase: 'end' } })).includes('end'));
  assert.deepEqual(kinds(goal, goal), []);
});
