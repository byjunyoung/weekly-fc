// src/lib/stats.ts
import { STAT_KEYS, type Fine, type FineType, type Player } from './types.ts';

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
