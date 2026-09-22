// src/lib/stats.ts
import { STAT_KEYS, type Fine, type FineType, type Player, type StatKey } from './types.ts';

export const STAT_CUTS: [number, number, number] = [84, 69, 55];
export function ovr(p: Player): number {
  const v = STAT_KEYS.map((k) => p[k]).filter((x) => x > 0);
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : 0;
}
export const grade = (v: number): 'gold' | 'silver' | 'bronze' => (v >= 84 ? 'gold' : v >= 69 ? 'silver' : 'bronze');
export const band = (v: number, cuts: [number, number, number]): 'a' | 'b' | 'c' | 'd' => (v >= cuts[0] ? 'a' : v >= cuts[1] ? 'b' : v >= cuts[2] ? 'c' : 'd');
export function fineSummary(fines: Fine[]) {
  const byType: Record<FineType, { count: number; total: number }> = { 지각: { count: 0, total: 0 }, 노쇼: { count: 0, total: 0 } };
  const byPlayer = new Map<string, { count: number; total: number; unpaid: number }>();
  let total = 0, unpaid = 0, unpaidCount = 0;
  for (const f of fines) {
    total += f.amount; byType[f.type].count++; byType[f.type].total += f.amount;
    const e = byPlayer.get(f.player) ?? { count: 0, total: 0, unpaid: 0 };
    e.count++; e.total += f.amount;
    if (!f.paid) { e.unpaid += f.amount; unpaid += f.amount; unpaidCount++; }
    byPlayer.set(f.player, e);
  }
  return { total, unpaid, unpaidCount, byType, byPlayer };
}

/** 능력치 약어·한글 이름. 예전엔 components/player-card.ts 에 있었는데 그 카드를 걷어내면서
 *  (2026-09-22) 표·편집 폼·선수 페이지가 쓰는 이 표만 남아 능력치 정의 옆으로 옮겼다. */
export const STAT_LABEL: Record<StatKey, string> = { pace: 'PAC', dribble: 'DRI', pass: 'PAS', shoot: 'SHO', defend: 'DEF', stamina: 'PHY' };
export const STAT_KO: Record<StatKey, string> = { pace: '페이스', dribble: '드리블', pass: '패스', shoot: '슈팅', defend: '수비', stamina: '체력' };
