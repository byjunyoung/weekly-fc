// src/lib/rotation.ts — 봉사 로테이션. 시트 rot 열 순서로 매월 DUTY_PER_MONTH명 슬라이딩.
import { DUTY_PER_MONTH } from './rules.ts';
import type { Player, RotationRow } from './types.ts';

export const CYCLE_START = { year: 2026, month: 1 };

export function rotationOrder(players: Player[]): string[] {
  return players.filter((p) => (p.rot ?? 0) > 0).sort((a, b) => (a.rot as number) - (b.rot as number)).map((p) => p.name);
}
export function computeMonth(players: Player[], year: number, month: number, now: Date = new Date()): RotationRow {
  const offset = (year - CYCLE_START.year) * 12 + (month - CYCLE_START.month);
  const order = rotationOrder(players);
  const n = order.length;
  const cy = now.getFullYear(), cm = now.getMonth() + 1;
  const done = year < cy || (year === cy && month < cm);
  if (!n) return { year, month, p1: '-', p2: '-', done };
  const i1 = (((offset * DUTY_PER_MONTH) % n) + n) % n;
  const i2 = (i1 + 1) % n;
  return { year, month, p1: order[i1], p2: order[i2] ?? order[0], done };
}
export function rotationFor(players: Player[], sheet: RotationRow[], year: number, month: number, now?: Date): RotationRow {
  const c = computeMonth(players, year, month, now);
  const s = sheet.find((r) => r.year === year && r.month === month);
  return s ? { ...c, p1: s.p1 || c.p1, p2: s.p2 || c.p2, done: s.done } : c;
}
export const yearRows = (players: Player[], sheet: RotationRow[], year: number, now?: Date): RotationRow[] =>
  Array.from({ length: 12 }, (_, i) => rotationFor(players, sheet, year, i + 1, now));

/** 이번 달부터 n 달. 운영 규칙 봉사표의 기본 보기다 — 열두 달을 다 그리면 지난 달(이미 끝난
 *  당번)이 표의 대부분을 차지해 페이지가 길어진다(2026-09-23 측정: 12행 중 8행이 끝난 달).
 *  11·12월이면 다음 해로 넘어간다. */
export function upcomingRows(players: Player[], sheet: RotationRow[], now: Date, n = 3): RotationRow[] {
  return Array.from({ length: n }, (_, k) => {
    const idx = now.getMonth() + k;                     // 0 기준 월 + k
    const year = now.getFullYear() + Math.floor(idx / 12);
    return rotationFor(players, sheet, year, (idx % 12) + 1, now);
  });
}
