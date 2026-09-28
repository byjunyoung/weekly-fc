// src/lib/placement.ts — 새 선수 배치 대결(2026-09-28). 항목마다 기존 선수들의 서로 다른 값을 줄 세워 이분 탐색한다.
// 설계: docs/superpowers/specs/2026-09-28-admin-roster-design.md §3.2
// 티어 게임(vote)과 달리 기존 선수 숫자는 움직이지 않는다 — 여기서 정한 값은 끝에 place_player 로 한 번에 쓴다.
import type { Player, StatKey } from './types.ts';

/** 한 값에 선 선수들. 사다리는 값이 낮은 것부터. */
export type Rung = { value: number; players: Player[] };
/** 줄 바깥에 설 때 끝 값에서 벌리는 폭. */
export const EDGE_GAP = 3;
/** 비교할 사람이 아무도 없을 때(첫 선수) 쓰는 값. */
export const DEFAULT_VALUE = 70;

export function ladder(players: Player[], field: StatKey, exclude: number): Rung[] {
  const m = new Map<number, Player[]>();
  for (const p of players) {
    if (p.num === exclude || !(p[field] > 0)) continue;
    m.set(p[field], [...(m.get(p[field]) ?? []), p]);
  }
  return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([value, ps]) => ({ value, players: ps.sort((a, b) => a.num - b.num) }));
}

/** 자리 p(0 = 맨 아래 밖, n = 맨 위 밖, 그 사이면 p-1 과 p 사이)의 값. */
export function posValue(rungs: Rung[], p: number): number {
  const n = rungs.length;
  if (!n) return DEFAULT_VALUE;
  const clamp = (v: number) => Math.max(1, Math.min(99, v));
  if (p <= 0) return clamp(rungs[0].value - EDGE_GAP);
  if (p >= n) return clamp(rungs[n - 1].value + EDGE_GAP);
  return clamp(Math.round((rungs[p - 1].value + rungs[p].value) / 2));
}

/** 한 항목의 탐색 상태. 새 선수는 자리 [lo, hi] 안 어딘가에 선다. tried = 지금 칸에서 이미 보여 준 선수. */
export type Search = { field: StatKey; lo: number; hi: number; tried: number[]; asked: number; value: number | null };
export type Answer = 'win' | 'lose' | 'same' | 'unsure';

export function startSearch(field: StatKey, rungs: Rung[]): Search {
  return { field, lo: 0, hi: rungs.length, tried: [], asked: 0, value: rungs.length ? null : DEFAULT_VALUE };
}
export const midOf = (s: Search): number => Math.floor((s.lo + s.hi) / 2);

/** 지금 칸에서 보여 줄 상대 — 아직 안 보여 준 선수 중 같은 포지션 먼저. 없으면 undefined. */
export function pickOpponent(rungs: Rung[], s: Search, pos: string, rand: () => number = Math.random): Player | undefined {
  const rung = rungs[midOf(s)];
  if (!rung) return undefined;
  const left = rung.players.filter((p) => !s.tried.includes(p.num));
  const same = pos ? left.filter((p) => p.pos === pos) : [];
  const pool = same.length ? same : left;
  return pool.length ? pool[Math.floor(rand() * pool.length)] : undefined;
}

/** 한 판의 답을 반영한다. win = 새 선수가 낫다. 원본은 건드리지 않는다. */
export function answer(rungs: Rung[], s: Search, a: Answer, opp: Player): Search {
  if (s.value != null) return s;
  const mid = midOf(s);
  const asked = s.asked + 1;
  if (a === 'same') return { ...s, asked, value: rungs[mid].value };
  if (a === 'unsure') {
    const tried = [...s.tried, opp.num];
    const more = rungs[mid].players.some((p) => !tried.includes(p.num));
    // 이 칸에 물어볼 사람이 더 없으면 지금까지 좁힌 구간의 가운데로.
    return more ? { ...s, asked, tried } : { ...s, asked, tried, value: posValue(rungs, Math.round((s.lo + s.hi) / 2)) };
  }
  const lo = a === 'win' ? mid + 1 : s.lo;
  const hi = a === 'win' ? s.hi : mid;
  return { ...s, asked, lo, hi, tried: [], value: lo >= hi ? posValue(rungs, lo) : null };
}

/** 이 항목에 몇 판쯤 걸릴지 — 진행 표시용(모르겠음이 끼면 늘 수 있다). */
export const expectedSteps = (rungs: Rung[]): number => (rungs.length ? Math.ceil(Math.log2(rungs.length + 1)) : 0);
