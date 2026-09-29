// src/lib/titles.ts — 능력치 모양으로 붙는 칭호(2026-09-29 "능력치 분포나 특별히 높은 능력치 고려해서 칭호").
// 항목마다 팀 평균·표준편차로 z 점수를 내고, 팀 안에서 눈에 띄게 뛰어난 사람만 칭호를 받는다(희소성, 아래 STANDOUT_Z).
// 전부 높으면 육각형, 한 항목이 두드러지면 단일 칭호, 둘째도 문턱을 넘고 그 조합에 실제 쓰는 용어가 있으면 조합 칭호.
// 칭호는 전부 좋은 말만 — 약점을 이름으로 붙이지 않는다. 능력치가 바뀌면 같이 바뀐다(생기거나 사라진다). 배치 전(0)이면 없음.
import { STAT_KEYS, type Player, type StatKey } from './types.ts';

export type Title = { name: string; desc: string };
const T = (name: string, desc: string): Title => ({ name, desc });

// 이름은 축구 이야기에서 실제로 쓰는 말만(2026-09-29 "근본 없는 건 없애"). 두 능력치 조합에 맞는 실제 용어가 없으면
// 조합 칭호를 만들지 않고 가장 두드러진 한 가지 칭호로 떨어진다.
export const SINGLE: Record<StatKey, Title> = {
  pace: T('스피드스타', '발 하나로 판을 흔드는 유형'),
  dribble: T('테크니션', '공을 발에 붙이고 다니는 유형'),
  pass: T('플레이메이커', '패스로 공격을 만드는 유형'),
  shoot: T('골잡이', '기회가 오면 넣는 유형'),
  defend: T('철벽', '뒤를 든든하게 막는 유형'),
  stamina: T('탱크', '몸싸움과 체력으로 버티는 유형'),
};
const key = (a: StatKey, b: StatKey): string => [a, b].sort().join('+');
export const PAIR: Record<string, Title> = {
  [key('pace', 'dribble')]: T('윙어', '측면을 속도와 드리블로 무너뜨리는 유형'),
  [key('dribble', 'shoot')]: T('크랙', '혼자 수비를 벗기고 끝내는 유형'),
  [key('shoot', 'stamina')]: T('타겟맨', '버티고 받아서 마무리하는 유형'),
  [key('pass', 'dribble')]: T('플레이메이커', '공을 쥐고 공격을 설계하는 유형'),
  [key('pass', 'defend')]: T('레지스타', '뒤에서 패스로 흐름을 잡는 유형'),
  [key('pass', 'shoot')]: T('판타지스타', '창의적인 패스와 슈팅의 공격형'),
  [key('pace', 'defend')]: T('윙백', '측면을 오르내리며 막고 뛰는 유형'),
  [key('pass', 'stamina')]: T('박스 투 박스', '양쪽 박스를 오가는 유형'),
};
export const ALL_ROUND = T('육각형', '모든 능력치가 고르게 높은 완성형');

/** 희소성(2026-09-29 "전부 다 칭호 있으니까 별로 — 희소성이 있어야지"): 팀 안에서 눈에 띄게 뛰어난 사람만 받는다.
 *  z 1.7 ≈ 팀 상위 5% 수준. 9/29 기준 31명 중 6명. 문턱을 못 넘으면 칭호 없음(null). */
export const STANDOUT_Z = 1.7;        // 가장 높은 항목이 이만큼은 돼야 칭호
export const OWN_EDGE = 0.4;          // 그 항목이 자기 평균보다 이만큼 두드러져야(전부 높은 사람은 육각형으로)
export const ALLROUND_MEAN = 1.2;     // 육각형: 평균 z 이상이고
export const ALLROUND_MIN = 0.6;      //         가장 낮은 항목도 이 이상

const placed = (p: Player): boolean => STAT_KEYS.every((k) => p[k] > 0);

export function titleOf(p: Player, players: Player[]): Title | null {
  return titleDetail(p, players)?.title ?? null;
}

/** 칭호와 그 근거 항목(육각형이면 여섯 전부, 조합이면 둘, 한 가지면 하나). 없으면 null. */
export function titleDetail(p: Player, players: Player[]): { title: Title; keys: StatKey[] } | null {
  if (!placed(p)) return null;
  const pool = players.filter(placed);
  if (pool.length < 2) return null;
  const z = {} as Record<StatKey, number>;
  for (const k of STAT_KEYS) {
    const vs = pool.map((x) => x[k]);
    const mu = vs.reduce((a, b) => a + b, 0) / vs.length;
    const sd = Math.sqrt(vs.reduce((a, b) => a + (b - mu) ** 2, 0) / vs.length) || 1;
    z[k] = (p[k] - mu) / sd;
  }
  const m = STAT_KEYS.reduce((a, k) => a + z[k], 0) / STAT_KEYS.length;
  if (m >= ALLROUND_MEAN && Math.min(...STAT_KEYS.map((k) => z[k])) >= ALLROUND_MIN) return { title: ALL_ROUND, keys: [...STAT_KEYS] };
  const order = [...STAT_KEYS].sort((a, b) => z[b] - z[a]);
  const [a, b] = order;
  if (z[a] < STANDOUT_Z || z[a] - m < OWN_EDGE) return null;
  const pair = PAIR[key(a, b)];
  if (z[b] >= STANDOUT_Z && pair) return { title: pair, keys: [a, b] };
  return { title: SINGLE[a], keys: [a] };
}

/** 팀 1위인 항목(공동 포함) — "페이스 1위" 뱃지. */
export function teamBests(p: Player, players: Player[]): StatKey[] {
  if (!placed(p)) return [];
  const pool = players.filter(placed);
  return STAT_KEYS.filter((k) => p[k] === Math.max(...pool.map((x) => x[k])));
}

/** 칭호 목록(설명 풍선용) — 육각형 · 조합 · 한 가지 순. need 는 어떤 항목이 두드러져야 하는지. */
export function titleCatalog(): Array<{ group: string; items: Array<{ title: Title; need: StatKey[] }> }> {
  return [
    { group: '전부 높음', items: [{ title: ALL_ROUND, need: [...STAT_KEYS] }] },
    { group: '두 가지', items: Object.entries(PAIR).map(([k, title]) => ({ title, need: k.split('+') as StatKey[] })) },
    { group: '한 가지', items: STAT_KEYS.map((k) => ({ title: SINGLE[k], need: [k] })) },
  ];
}
