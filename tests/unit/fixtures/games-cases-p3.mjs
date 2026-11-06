// 게임 어댑터 약속 검사(games-adapter.test.mjs)의 3단계 게임 — 프리킥(2026-11-07).
// CASES 에 한 줄(...P3_CASES)로 끼운다(다른 단계의 게임과 그 파일을 같이 고칠 때 겹치지 않게).
import { freekick2d } from '../../../src/lib/games/freekick2d.ts';
import { BASE_PERF } from '../../../src/lib/game/stats.ts';

const players = (n, bots = false) => Array.from({ length: n }, (_, i) => ({ id: i, num: 10 + i, jersey: i + 1, name: `P${i}`, bot: bots, perf: { ...BASE_PERF } }));
/** 프리킥 설정 — n명(봇이면 대본 키커가 찬다). */
export const fkCfg = (n, bots = false) => ({ players: players(n, bots) });
export const P3_CASES = [
  {
    adapter: freekick2d,
    configs: [fkCfg(1), fkCfg(2), fkCfg(3), fkCfg(8), fkCfg(5)],
    // 봇 둘 — 열 번 차기(한 차기 ≤ 66 + 300 + 150 + 96 틱)
    short: { config: fkCfg(2, true), maxTicks: 60 * 60 * 3 },
    mangleState: [
      (s) => ({ ...s, phase: 'zz' }),
      (s) => ({ ...s, kicker: 99 }),
      (s) => ({ ...s, spot: 5 }),
      (s) => ({ ...s, points: [...s.points, 0] }),
      (s) => ({ ...s, log: [{ kicker: 0, spot: 0, out: 'zz' }] }),
      (s) => ({ ...s, gk: { ...s.gk, dive: 2 } }),
      (s) => ({ ...s, outcome: 'zz' }),
    ],
    mangleConfig: [
      (c) => ({ ...c, players: [] }),
      (c) => ({ ...c, players: c.players.map((p, i) => ({ ...p, id: i + 1 })) }),
      (c) => ({ ...c, players: players(9) }),
    ],
    optionalStateKeys: [],
  },
];
