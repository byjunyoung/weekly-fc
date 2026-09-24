// src/lib/tier.ts — 티어 게임(2026-09-24). 1:1 대결 한 판마다 능력치를 옮기고, 숫자를 S~D 칸으로 나눈다.
// 설계: docs/superpowers/specs/2026-09-24-tier-game-design.md
import { ovr } from './stats.ts';
import { STAT_KEYS, type Player, type StatKey } from './types.ts';

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
/** 티어는 점수 구간이 아니라 **순위 비율**로 가른다(2026-09-25 "점수가 아니라 순위/명수로 제한하자").
 *  옛 구간(S ≥ 85 …)은 숫자가 70 에 몰린 채로는 S 가 비거나 넘쳤다. 위에서부터 10·20·40·20·10% —
 *  30명이면 S 3 · A 6 · B 12 · C 6 · D 3. 인원이 바뀌어도 모양이 유지된다. */
export const TIER_RATIO: Record<Tier, number> = { S: 0.1, A: 0.2, B: 0.4, C: 0.2, D: 0.1 };

/** 인원 n 을 비율대로 나눈 명수. 소수점은 **큰 나머지 순**으로 채워 합이 정확히 n 이 된다. */
export function tierQuota(n: number): Record<Tier, number> {
  const raw = TIERS.map((t) => n * TIER_RATIO[t]);
  const q = raw.map(Math.floor);
  let left = n - q.reduce((a, b) => a + b, 0);
  // 나머지가 큰 칸부터, 같으면 가운데(B)에 가깝게 — 순서를 고정해 같은 n 이면 늘 같은 결과.
  const order = TIERS.map((_, i) => i).sort((a, b) => (raw[b] - q[b]) - (raw[a] - q[a]) || Math.abs(a - 2) - Math.abs(b - 2));
  for (const i of order) { if (left <= 0) break; q[i] += 1; left -= 1; }
  return Object.fromEntries(TIERS.map((t, i) => [t, q[i]])) as Record<Tier, number>;
}

export type TierKey = StatKey | 'ovr';
export const statValue = (p: Player, key: TierKey): number => (key === 'ovr' ? ovr(p) : p[key]);

/** S~D 다섯 줄 — 높은 순으로 세워 위 칸부터 **정원만큼** 담는다(2026-09-25 사용자: "순위/명수로 제한").
 *  처음엔 동점을 위 칸으로 같이 올렸는데, 숫자가 70·80 에 몰려 있어 A 8·B 13·D 0 이 됐다 — 정원이 무의미해졌다.
 *  그래서 동점은 **여섯 항목 합계 → 번호순**으로 가른다(종합은 평균을 반올림한 값이라 합계가 더 촘촘하다).
 *  숫자가 아직 없는(0) 선수는 뺀다. D 는 나머지를 받는다. */
export function tierRows(players: Player[], key: TierKey): Array<{ tier: Tier; players: Player[] }> {
  const fine = (p: Player): number => (key === 'ovr' ? STAT_KEYS.reduce((a, k) => a + p[k], 0) : p[key]);
  const rated = players.filter((p) => statValue(p, key) > 0)
    .sort((a, b) => statValue(b, key) - statValue(a, key) || fine(b) - fine(a) || a.num - b.num);
  const quota = tierQuota(rated.length);
  const rows: Array<{ tier: Tier; players: Player[] }> = [];
  let i = 0;
  for (const tier of TIERS) {
    const want = tier === 'D' ? rated.length - i : quota[tier];
    rows.push({ tier, players: rated.slice(i, i + want) });
    i += want;
  }
  return rows;
}

export const QUESTION: Record<StatKey, string> = {
  pace: '누가 더 빠르다?', dribble: '누가 드리블을 더 잘한다?', pass: '누가 패스를 더 잘한다?',
  shoot: '누가 슈팅을 더 잘한다?', defend: '누가 수비를 더 잘한다?', stamina: '누가 피지컬이 더 좋다?',
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
  rivals?: Map<number, number>;
}): { a: Player; b: Player; field: StatKey } | null {
  const { field, seen, recent, rand, focus, rivals } = opt;
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
  // 라이벌전 — 라이벌은 종합으로 묶여 항목 숫자로 고르는 B 에 잘 안 걸린다(실측 60판에 한 번).
  // 네 판에 한 번꼴로 A 의 라이벌을 바로 붙인다.
  if (rivals && rand() < 0.25) {
    const a = firsts[0];
    const r = pool.find((p) => p.num === rivals.get(a.num));
    if (r && !recent.includes(pairKey(a.num, r.num))) pick = [a, r];
  }
  for (const a of pick ? [] : firsts) {
    const fresh = nearOf(a).filter((b) => !recent.includes(pairKey(a.num, b.num)));
    if (fresh.length) { pick = [a, fresh[Math.floor(rand() * fresh.length)]]; break; }
  }
  if (!pick) { const a = firsts[0]; const near = nearOf(a); pick = [a, near[Math.floor(rand() * near.length)]]; }
  const [a, b] = rand() < 0.5 ? pick : [pick[1], pick[0]];
  return { a, b, field };
}

/** 라이벌(2026-09-24 사용자: "능력치 비슷한 애들 라이벌 딱지"). 종합 점수 순으로 세워 이웃끼리 둘씩 —
 *  서로가 서로의 라이벌이다(사용자 결정: 서로 짝). 한 줄로 선 숫자에서 차이 합이 가장 작은 짝짓기가
 *  바로 이 이웃 묶기다. 홀수면 남은 한 명은 바로 위 사람을 라이벌로 둔다(그쪽은 이미 짝이 있어 한쪽만).
 *  대결로 숫자가 움직이면 라이벌도 바뀐다. 숫자가 없는(0) 선수는 뺀다. */
export function rivalPairs(players: Player[]): Map<number, number> {
  const line = players.filter((p) => ovr(p) > 0).sort((a, b) => ovr(b) - ovr(a) || a.num - b.num);
  const m = new Map<number, number>();
  for (let i = 0; i + 1 < line.length; i += 2) { m.set(line[i].num, line[i + 1].num); m.set(line[i + 1].num, line[i].num); }
  if (line.length % 2 === 1 && line.length > 1) m.set(line[line.length - 1].num, line[line.length - 2].num);
  return m;
}
