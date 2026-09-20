// src/react/squad/model.ts — 스쿼드 화면의 순수 로직(뷰 저장·OVR 정렬·다음 빈 번호). DOM 없음, 단위 테스트 대상.
import { ovr } from '../../lib/stats.ts';
import type { Player } from '../../lib/types.ts';

export type View = 'list' | 'card' | 'table';
const VIEW_KEY = 'wfc.squad.view';

export function loadView(): View {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    return v === 'card' || v === 'table' ? v : 'list';
  } catch { return 'list'; }
}
export function saveView(v: View): void {
  try { localStorage.setItem(VIEW_KEY, v); } catch { /* 저장 못 해도 화면은 돈다 */ }
}

export const byOvr = (rows: Player[]): Player[] => [...rows].sort((a, b) => ovr(b) - ovr(a) || a.num - b.num);

/** 명단에 없는 가장 작은 번호 — 「선수 추가」가 이동할 새 선수 번호. */
export function nextFreeNum(players: Player[]): number {
  const used = new Set(players.map((p) => p.num));
  let n = 1;
  while (used.has(n)) n++;
  return n;
}
