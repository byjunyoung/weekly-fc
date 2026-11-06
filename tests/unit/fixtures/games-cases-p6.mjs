// 게임 어댑터 약속 검사(games-adapter.test.mjs)의 6단계 게임 둘 — 3D 프리킥·3D 드리블 훈련장(2026-11-07).
// CASES 에 한 줄(...P6_CASES)로 끼우려고 따로 둔다.
import { freekick3d } from '../../../src/lib/games/freekick3d.ts';
import { dribble3d } from '../../../src/lib/games/dribble3d.ts';
import { BASE_PERF } from '../../../src/lib/game/stats.ts';
import { BASE_PERF as BASE_PERF_3D } from '../../../src/lib/game3d/stats.ts';

/** 프리킥 설정 — 사람 n명(2D 와 같은 모양). */
export const fk3Cfg = (n, bots = 0) => ({
  players: Array.from({ length: n }, (_, i) => ({ id: i, num: 10 + i, jersey: i + 1, name: `P${i}`, bot: i >= n - bots, perf: { ...BASE_PERF } })),
});
/** 드리블 설정 — 코스, 사람 n명(3D 능력치). */
export const dr3Cfg = (course, n, bots = 0) => ({
  course,
  players: Array.from({ length: n }, (_, i) => ({ id: i, num: 10 + i, jersey: i + 1, name: `P${i}`, bot: i >= n - bots, perf: { ...BASE_PERF_3D } })),
});

export const P6_CASES = [
  {
    adapter: freekick3d,
    configs: [fk3Cfg(1), fk3Cfg(2), fk3Cfg(3, 1), fk3Cfg(8, 2)],
    short: { config: fk3Cfg(1, 1), maxTicks: 60 * 60 * 3 },
    mangleState: [
      (s) => ({ ...s, phase: 'zz' }),
      (s) => ({ ...s, spot: 5 }),
      (s) => ({ ...s, kicker: 99 }),
      (s) => ({ ...s, points: [] }),
      (s) => ({ ...s, log: [{ kicker: 0, spot: 0, out: 'zz' }] }),
      (s) => ({ ...s, gk: { ...s.gk, diveH: 3 } }),
      (s) => ({ ...s, ball: { ...s.ball, z: undefined } }),
      (s) => ({ ...s, outcome: 'zz' }),
    ],
    mangleConfig: [
      (c) => ({ ...c, players: [] }),
      (c) => ({ ...c, players: c.players.map((p, i) => ({ ...p, id: i + 1 })) }),
      (c) => ({ ...c, players: [...c.players, ...fk3Cfg(8).players].map((p, i) => ({ ...p, id: i })) }),
    ],
    optionalStateKeys: [],
  },
  {
    adapter: dribble3d,
    configs: [dr3Cfg(0, 1), dr3Cfg(1, 2), dr3Cfg(2, 3, 1), dr3Cfg(3, 8, 3)],
    short: { config: dr3Cfg(3, 1, 1), maxTicks: 60 * 60 * 3 },
    mangleState: [
      (s) => ({ ...s, phase: 'zz' }),
      (s) => ({ ...s, lanes: s.lanes.slice(1) }),
      (s) => ({ ...s, lanes: s.lanes.map((l) => ({ ...l, gate: 99 })) }),
      (s) => ({ ...s, lanes: s.lanes.map((l) => ({ ...l, b: { ...l.b, owner: 3 } })) }),
      (s) => ({ ...s, first: -2 }),
    ],
    mangleConfig: [
      (c) => ({ ...c, course: 4 }),
      (c) => ({ ...c, players: [] }),
      (c) => ({ ...c, players: c.players.map((p, i) => ({ ...p, id: i + 1 })) }),
      (c) => ({ ...c, players: c.players.map((p) => ({ ...p, perf: { ...p.perf, control: undefined } })) }),
    ],
    optionalStateKeys: [],
  },
];
