// src/lib/history.ts — 선수 한 명의 능력치 기록을 차트·게임 로그로(2026-09-28 "고친 기록 좀 더 재밌게").
// 입력은 서버 stat_history(p_num) 의 줄들(오래된 것부터). 순수 계산만 — 화면은 react/player/StatHistory.tsx.
import { ovr } from './stats.ts';
import { STAT_KEYS, type Player, type StatKey, type StatLogRow } from './types.ts';

export type HistKey = StatKey | 'ovr';
export type Point = { ts: string; value: number; row: StatLogRow | null };

/** 기록을 거꾸로 되짚지 않고 앞으로 걷는다 — 항목마다 첫 줄의 before 가 출발값(기록이 없는 항목은 지금 값).
 *  종합은 매 줄마다 여섯 값의 평균. 0(배치 전)인 점은 뺀다 — 0에서 80으로 튀는 선은 정보가 없다. */
export function series(rows: StatLogRow[], now: Player, key: HistKey): Point[] {
  const cur = {} as Record<StatKey, number>;
  for (const k of STAT_KEYS) cur[k] = rows.find((r) => r.field === k)?.before ?? now[k];
  const val = (): number => (key === 'ovr' ? ovr({ ...now, ...cur }) : cur[key]);
  const pts: Point[] = [{ ts: rows[0]?.ts ?? '', value: val(), row: null }];
  for (const r of rows) {
    cur[r.field] = r.after;
    if (key !== 'ovr' && r.field !== key) continue;
    const v = val();
    if (key === 'ovr' && v === pts[pts.length - 1].value && r !== rows[rows.length - 1]) continue;   // 종합이 안 바뀐 줄은 점을 안 찍는다
    pts.push({ ts: r.ts, value: v, row: r });
  }
  return pts.filter((p) => p.value > 0);
}

/** 로그 — 최신 날짜부터 날짜별로 묶는다(서울 날짜). */
export function byDay(rows: StatLogRow[]): Array<{ day: string; rows: StatLogRow[] }> {
  const out: Array<{ day: string; rows: StatLogRow[] }> = [];
  for (const r of [...rows].reverse()) {
    const day = seoulDay(r.ts);
    const last = out[out.length - 1];
    if (last && last.day === day) last.rows.push(r); else out.push({ day, rows: [r] });
  }
  return out;
}
export function seoulDay(ts: string): string {
  const t = Date.parse(ts);
  if (Number.isNaN(t)) return '';
  return new Date(t + 9 * 3600e3).toISOString().slice(0, 10);
}

/** 최근 days 일 동안 그 값이 얼마나 움직였나(시작점이 창보다 앞이면 창 시작 직전 값 기준). */
export function change(points: Point[], nowMs: number, days = 7): number {
  if (!points.length) return 0;
  const from = nowMs - days * 864e5;
  let base = points[0].value;
  for (const p of points) { if (Date.parse(p.ts) <= from) base = p.value; else break; }
  return points[points.length - 1].value - base;
}
