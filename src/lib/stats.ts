// src/lib/stats.ts
import { STAT_KEYS, type Fine, type FineType, type Match, type Player } from './types.ts';

export const STAT_CUTS: [number, number, number] = [84, 69, 55];
export const RATE_CUTS: [number, number, number] = [80, 60, 40];
export function ovr(p: Player): number {
  const v = STAT_KEYS.map((k) => p[k]).filter((x) => x > 0);
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : 0;
}
export const grade = (v: number): 'gold' | 'silver' | 'bronze' => (v >= 84 ? 'gold' : v >= 69 ? 'silver' : 'bronze');
export const band = (v: number, cuts: [number, number, number]): 'a' | 'b' | 'c' | 'd' => (v >= cuts[0] ? 'a' : v >= cuts[1] ? 'b' : v >= cuts[2] ? 'c' : 'd');
export const yearOf = (date: string): number => Number(date.slice(0, 4));
export const seasonMatches = (matches: Match[], year?: number): Match[] => matches.filter((m) => m.attendees.length > 0 && (year == null || yearOf(m.date) === year));
export function attendance(name: string, matches: Match[], year?: number): { attended: number; total: number; rate: number } {
  const ms = seasonMatches(matches, year);
  const attended = ms.filter((m) => m.attendees.includes(name)).length;
  return { attended, total: ms.length, rate: ms.length ? Math.round((attended / ms.length) * 100) : 0 };
}
export function wins(name: string, matches: Match[], year?: number): { won: number; played: number; rate: number } {
  const ms = seasonMatches(matches, year).filter((m) => m.winner && m.attendees.includes(name));
  const won = ms.filter((m) => m.teams.find((t) => t.name === m.winner)?.players.includes(name)).length;
  return { won, played: ms.length, rate: ms.length ? Math.round((won / ms.length) * 100) : 0 };
}
export type ConditionLevel = 'up' | 'mid' | 'down' | 'none';
export type Condition = { level: ConditionLevel; attended: number; of: number };
/** 컨디션(eFootball 문법) — 능력치 위에 얹는 동적 레이어. 벌점이 아니라 "요즘 자주 나오는지"의 신호다.
 * "최근 4경기"는 seasonMatches가 세는(출석 기록이 있는) 가장 최근 매치 중 최대 4개 — 달력 4주가 아니다.
 * matches는 항상 최신순으로 정렬돼 들어온다는 전제(normalizeData)를 따른다. */
export function condition(name: string, matches: Match[]): Condition {
  const recent = seasonMatches(matches).slice(0, 4);
  if (recent.length === 0) return { level: 'none', attended: 0, of: 0 };
  const attended = recent.filter((m) => m.attendees.includes(name)).length;
  const level: ConditionLevel = attended >= 3 ? 'up' : attended === 2 ? 'mid' : 'down';
  return { level, attended, of: recent.length };
}
export type SeasonRow = { player: Player; attended: number; total: number; rate: number; won: number; played: number; winRate: number };
export function seasonTable(players: Player[], matches: Match[], year?: number): SeasonRow[] {
  return players.map((p) => { const a = attendance(p.name, matches, year); const w = wins(p.name, matches, year);
    return { player: p, attended: a.attended, total: a.total, rate: a.rate, won: w.won, played: w.played, winRate: w.rate }; })
    .sort((x, y) => y.attended - x.attended || y.rate - x.rate || x.player.num - y.player.num);
}
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
