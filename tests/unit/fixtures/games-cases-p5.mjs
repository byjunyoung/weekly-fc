// 게임 어댑터 약속 검사(games-adapter.test.mjs)의 5단계 게임 둘 — 3D 승부차기·3D 자유 훈련장(2026-11-07).
// CASES 에 한 줄(...P5_CASES)로 끼우려고 따로 둔다(다른 단계의 게임과 그 파일을 같이 고칠 때 겹치지 않게).
import { penalty3d } from '../../../src/lib/games/penalty3d.ts';
import { free3d } from '../../../src/lib/games/free3d.ts';
import { BASE_PERF as BASE_PERF_3D } from '../../../src/lib/game3d/stats.ts';
import { penCfg } from './games-cases-p2.mjs';

/** 3D 훈련장 설정 — 사람 h명(첫 사람이 방장) + 봇 k명, 공 n개. */
export const free3Cfg = (h, k, balls) => ({
  balls,
  players: Array.from({ length: h + k }, (_, i) => ({ id: i, num: 10 + i, jersey: i + 1, name: `P${i}`, bot: i >= h, host: i === 0, perf: { ...BASE_PERF_3D } })),
});

export const P5_CASES = [
  {
    adapter: penalty3d,
    configs: [penCfg(1, 1), penCfg(1, 5, 5, 1), penCfg(2, 3, 3, 0, 2), penCfg(6, 6, 5, 1, 8), penCfg(3, 3, 3, 1, 6)],
    short: { config: penCfg(1, 1, 3, 0, 0), maxTicks: 60 * 60 * 6 },
    mangleState: [
      (s) => ({ ...s, phase: 'zz' }),
      (s) => ({ ...s, kicker: s.keeper }),
      (s) => ({ ...s, kicker: 99 }),
      (s) => ({ ...s, taken: [0] }),
      (s) => ({ ...s, log: [{ side: 0, kicker: 0, keeper: 1, out: 'zz' }] }),
      (s) => ({ ...s, gk: { ...s.gk, dive: 2 } }),
      (s) => ({ ...s, gk: { ...s.gk, diveH: 3 } }),
      (s) => ({ ...s, ball: { ...s.ball, z: undefined } }),
      (s) => ({ ...s, outcome: 'zz' }),
    ],
    mangleConfig: [
      (c) => ({ ...c, kicks: 4 }),
      (c) => ({ ...c, first: 2 }),
      (c) => ({ ...c, players: c.players.map((p) => ({ ...p, side: 0 })) }),
      (c) => ({ ...c, players: c.players.map((p, i) => ({ ...p, id: i + 1 })) }),
      (c) => ({ ...c, players: [] }),
    ],
    optionalStateKeys: [],
  },
  {
    adapter: free3d,
    configs: [free3Cfg(1, 0, 3), free3Cfg(1, 4, 3), free3Cfg(3, 2, 5), free3Cfg(8, 4, 8), free3Cfg(2, 0, 4)],
    short: null,
    neverEnds: { config: free3Cfg(1, 4, 3), ticks: 60 * 60 * 3 },
    mangleState: [
      (s) => ({ ...s, phase: 'end' }),
      (s) => ({ ...s, balls: s.balls.slice(1) }),
      (s) => ({ ...s, players: s.players.slice(1) }),
      (s) => ({ ...s, players: s.players.map((p, i) => ({ ...p, id: i === 0 ? 1 : p.id })) }),
      (s) => ({ ...s, pops: [{ tick: 1, side: 0, y: 0 }] }),
      (s) => ({ ...s, balls: s.balls.map((b) => ({ ...b, owner: 0 })) }),            // 한 사람이 공 여럿
      (s) => ({ ...s, balls: s.balls.map((b, j) => (j === 0 ? { ...b, owner: s.players.length } : b)) }),
    ],
    mangleConfig: [
      (c) => ({ ...c, balls: 0 }),
      (c) => ({ ...c, balls: 9 }),
      (c) => ({ ...c, players: [] }),
      (c) => ({ ...c, players: c.players.map((p, i) => ({ ...p, id: i + 1 })) }),
      (c) => ({ ...c, players: [...c.players, ...free3Cfg(13, 0, 3).players].map((p, i) => ({ ...p, id: i })) }),
    ],
    optionalStateKeys: [],
  },
];
