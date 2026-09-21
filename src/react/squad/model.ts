// src/react/squad/model.ts — 스쿼드 화면의 순수 로직(뷰 저장·OVR 정렬·다음 빈 번호). DOM 없음, 단위 테스트 대상.
import { ovr } from '../../lib/stats.ts';
import type { Player } from '../../lib/types.ts';

export type View = 'list' | 'card' | 'table';
export const ALL_VIEWS: View[] = ['list', 'card', 'table'];
const VIEW_KEY = 'wfc.squad.view';

/** 저장된 보기. `allowed` 밖의 값(화면마다 고르는 뷰가 다르다)은 첫 번째로 되돌린다. */
export function loadView(allowed: View[] = ALL_VIEWS): View {
  try {
    const v = localStorage.getItem(VIEW_KEY) as View | null;
    return v && allowed.includes(v) ? v : allowed[0];
  } catch { return allowed[0]; }
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
