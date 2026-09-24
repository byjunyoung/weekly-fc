// src/lib/tier.ts — 티어 게임(2026-09-24). 1:1 대결 한 판마다 능력치를 옮기고, 숫자를 S~D 칸으로 나눈다.
// 설계: docs/superpowers/specs/2026-09-24-tier-game-design.md
import { ovr } from './stats.ts';
import type { Player, StatKey } from './types.ts';

/** 기대 승률의 폭 — 이만큼 차이 나면 강한 쪽이 10:1 로 이긴다고 본다(20점 차면 76%). */
export const VOTE_SCALE = 40;
/** 한 판에 움직일 수 있는 최대치. 비슷한 사이면 그 절반(2)이 움직인다. */
export const VOTE_K = 4;

/** 이긴 쪽이 오르는 만큼(진 쪽은 같은 만큼 내린다). 서버 private.vote_delta 와 같은 식이다 —
 *  값은 늘 서버 응답을 쓰고, 이 함수는 테스트가 두 식을 대조하는 데 쓴다. */
export function voteDelta(win: number, lose: number): number {
  const e = 1 / (1 + 10 ** ((lose - win) / VOTE_SCALE));
  return Math.max(1, Math.round(VOTE_K * (1 - e)));
}

export const TIERS = ['S', 'A', 'B', 'C', 'D'] as const;
export type Tier = (typeof TIERS)[number];
/** S·A·B·C 의 하한. 2026-09-24 값으로 나누면 S 5 · A 7 · B 11 · C 2 · D 5. */
const CUTS: Array<[Tier, number]> = [['S', 85], ['A', 78], ['B', 70], ['C', 63]];
export const tierOf = (v: number): Tier => CUTS.find(([, min]) => v >= min)?.[0] ?? 'D';

export type TierKey = StatKey | 'ovr';
export const statValue = (p: Player, key: TierKey): number => (key === 'ovr' ? ovr(p) : p[key]);

/** S~D 다섯 줄. 칸 안은 높은 순(같으면 번호순). 숫자가 아직 없는(0) 선수는 뺀다. */
export function tierRows(players: Player[], key: TierKey): Array<{ tier: Tier; players: Player[] }> {
  const rated = players.filter((p) => statValue(p, key) > 0)
    .sort((a, b) => statValue(b, key) - statValue(a, key) || a.num - b.num);
  return TIERS.map((tier) => ({ tier, players: rated.filter((p) => tierOf(statValue(p, key)) === tier) }));
}

export const QUESTION: Record<StatKey, string> = {
  pace: '누가 더 빠르다?', dribble: '누가 드리블을 더 잘한다?', pass: '누가 패스를 더 잘한다?',
  shoot: '누가 슈팅을 더 잘한다?', defend: '누가 수비를 더 잘한다?', stamina: '누가 체력이 더 좋다?',
};

export const pairKey = (a: number, b: number): string => (a < b ? `${a}-${b}` : `${b}-${a}`);

const shuffle = <T>(xs: T[], rand: () => number): T[] => {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

/** 다음 판의 두 선수.
 *  - A: focus 가 있으면 그 선수, 없으면 이번에 가장 덜 나온 선수들 중 무작위.
 *  - B: 그 항목 숫자가 A 와 가까운 여섯 중 무작위 — 가까운 사이일수록 비교가 의미 있다.
 *  - recent 에 있는 쌍은 다른 길이 있으면 피한다. 화면 좌우는 무작위로 섞는다. */
export function pickPair(players: Player[], opt: {
  field: StatKey; seen: Record<number, number>; recent: string[]; rand: () => number; focus?: number | null;
}): { a: Player; b: Player; field: StatKey } | null {
  const { field, seen, recent, rand, focus } = opt;
  const pool = players.filter((p) => p[field] > 0);
  if (pool.length < 2) return null;
  const seenOf = (p: Player) => seen[p.num] ?? 0;

  const focusP = focus != null ? pool.find((p) => p.num === focus) : undefined;
  let firsts: Player[];
  if (focusP) firsts = [focusP];
  else {
    const min = Math.min(...pool.map(seenOf));
    const least = shuffle(pool.filter((p) => seenOf(p) === min), rand);
    const rest = shuffle(pool.filter((p) => seenOf(p) !== min), rand).sort((x, y) => seenOf(x) - seenOf(y));
    firsts = [...least, ...rest];
  }

  const nearOf = (a: Player): Player[] =>
    shuffle(pool.filter((p) => p.num !== a.num), rand)
      .sort((x, y) => Math.abs(x[field] - a[field]) - Math.abs(y[field] - a[field]))
      .slice(0, 6);

  let pick: [Player, Player] | null = null;
  for (const a of firsts) {
    const fresh = nearOf(a).filter((b) => !recent.includes(pairKey(a.num, b.num)));
    if (fresh.length) { pick = [a, fresh[Math.floor(rand() * fresh.length)]]; break; }
  }
  if (!pick) { const a = firsts[0]; const near = nearOf(a); pick = [a, near[Math.floor(rand() * near.length)]]; }
  const [a, b] = rand() < 0.5 ? pick : [pick[1], pick[0]];
  return { a, b, field };
}
