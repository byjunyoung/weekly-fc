// 게임 어댑터 약속 검사(games-adapter.test.mjs)의 2단계 게임 둘 — 승부차기·자유 훈련장(2026-11-07).
// CASES 에 한 줄(...P2_CASES)로 끼우려고 따로 둔다(다른 단계의 게임과 그 파일을 같이 고칠 때 겹치지 않게).
import { penalty2d } from '../../../src/lib/games/penalty2d.ts';
import { free2d } from '../../../src/lib/games/free2d.ts';
import { BASE_PERF } from '../../../src/lib/game/stats.ts';

/** 승부차기 설정 — 0 편 a명, 1 편 b명(앞에서 humans 명은 사람). */
export const penCfg = (a, b, kicks = 5, first = 0, humans = 1) => ({
  kicks, first,
  players: Array.from({ length: a + b }, (_, i) => ({ id: i, num: 10 + i, jersey: i + 1, name: `P${i}`, side: i < a ? 0 : 1, bot: i >= humans, perf: { ...BASE_PERF } })),
});
/** 훈련장 설정 — 사람 h명(첫 사람이 방장) + 봇 k명, 공 n개. */
export const freeCfg = (h, k, balls, field = 'M') => ({
  field, balls,
  players: Array.from({ length: h + k }, (_, i) => ({ id: i, num: 10 + i, jersey: i + 1, name: `P${i}`, bot: i >= h, host: i === 0, perf: { ...BASE_PERF } })),
});

export const P2_CASES = [
  {
    adapter: penalty2d,
    configs: [penCfg(1, 1), penCfg(1, 5, 5, 1), penCfg(2, 3, 3, 0, 2), penCfg(6, 6, 5, 1, 8), penCfg(3, 3, 3, 1, 6)],
    // 3번씩 봇끼리 — 서든데스까지 가도 넉넉하다(한 차기 ≤ 72 + 300 + 150 + 100 틱).
    short: { config: penCfg(1, 1, 3, 0, 0), maxTicks: 60 * 60 * 6 },
    mangleState: [
      (s) => ({ ...s, phase: 'zz' }),
      (s) => ({ ...s, kicker: s.keeper }),                         // 키커와 키퍼가 같은 편
      (s) => ({ ...s, kicker: 99 }),
      (s) => ({ ...s, taken: [0] }),
      (s) => ({ ...s, log: [{ side: 0, kicker: 0, keeper: 1, out: 'zz' }] }),
      (s) => ({ ...s, gk: { ...s.gk, dive: 2 } }),
      (s) => ({ ...s, outcome: 'zz' }),
    ],
    mangleConfig: [
      (c) => ({ ...c, kicks: 4 }),
      (c) => ({ ...c, first: 2 }),
      (c) => ({ ...c, players: c.players.map((p) => ({ ...p, side: 0 })) }),   // 한 편이 비었다
      (c) => ({ ...c, players: c.players.map((p, i) => ({ ...p, id: i + 1 })) }),
      (c) => ({ ...c, players: [] }),
    ],
    optionalStateKeys: [],
  },
  {
    adapter: free2d,
    configs: [freeCfg(1, 0, 3, 'S'), freeCfg(1, 4, 3, 'M'), freeCfg(3, 2, 5, 'L'), freeCfg(8, 4, 8, 'XL'), freeCfg(2, 0, 4, 'S')],
    short: null,          // 저절로 끝나지 않는 게임 — 아래 neverEnds 로 검사한다
    neverEnds: { config: freeCfg(1, 4, 3, 'S'), ticks: 60 * 60 * 3 },
    mangleState: [
      (s) => ({ ...s, phase: 'end' }),
      (s) => ({ ...s, balls: s.balls.slice(1) }),
      (s) => ({ ...s, players: s.players.slice(1) }),
      (s) => ({ ...s, players: s.players.map((p, i) => ({ ...p, id: i === 0 ? 1 : p.id })) }),
      (s) => ({ ...s, pops: [{ tick: 1, side: 0, y: 0 }] }),
    ],
    mangleConfig: [
      (c) => ({ ...c, field: 'auto' }),
      (c) => ({ ...c, balls: 0 }),
      (c) => ({ ...c, balls: 9 }),
      (c) => ({ ...c, players: [] }),
      (c) => ({ ...c, players: c.players.map((p, i) => ({ ...p, id: i + 1 })) }),
      (c) => ({ ...c, players: [...c.players, ...freeCfg(13, 0, 3).players].map((p, i) => ({ ...p, id: i })) }),
    ],
    optionalStateKeys: [],
  },
];
