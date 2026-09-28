// src/lib/adminStats.ts — 관리자 통계 계산(2026-09-28). 서버 admin_stats 결과를 요약 숫자·활동 구간으로. 순수 함수.
import type { AdminStats, StatPerson } from './api.ts';

/** 마지막 활동 — 방문과 대결 중 늦은 쪽. 둘 다 없으면 null. */
export function lastActive(p: StatPerson): string | null {
  const t = [p.lastVisit, p.lastDuel].filter((x): x is string => !!x).map((x) => Date.parse(x)).filter((x) => !Number.isNaN(x));
  return t.length ? new Date(Math.max(...t)).toISOString() : null;
}

export type Activity = 'hot' | 'week' | 'month' | 'none';
export const ACTIVITY_KO: Record<Activity, string> = { hot: '오늘', week: '7일 안', month: '30일 안', none: '없음' };
/** 마지막 활동이 언제쯤인가 — 오늘 / 7일 안 / 30일 안 / 없음. */
export function activityOf(p: StatPerson, nowMs: number): Activity {
  const a = lastActive(p);
  if (!a) return 'none';
  const d = (nowMs - Date.parse(a)) / 864e5;
  return d < 1 ? 'hot' : d < 7 ? 'week' : d < 30 ? 'month' : 'none';
}

export function kpis(s: AdminStats, nowMs: number) {
  const today = s.days[s.days.length - 1];
  const act = s.people.map((p) => activityOf(p, nowMs));
  return {
    todayDevices: today?.devices ?? 0,
    todayMembers: today?.members ?? 0,
    todayViews: today?.views ?? 0,
    active7: act.filter((a) => a === 'hot' || a === 'week').length,
    claimed: s.people.filter((p) => p.claimedAt).length,
    total: s.people.length,
    duels7: s.days.slice(-7).reduce((a, d) => a + d.duels, 0),
  };
}

/** '방금' · 'N분 전' · 'N시간 전' · 'N일 전'. */
export function ago(iso: string | null, nowMs: number): string {
  if (!iso) return '–';
  const m = Math.max(0, Math.round((nowMs - Date.parse(iso)) / 60000));
  if (m < 1) return '방금';
  if (m < 60) return `${m}분 전`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.round(h / 24)}일 전`;
}
