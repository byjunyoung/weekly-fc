// src/components/table.ts — 정렬되는 표. DOM은 mountTable에서만.
import { esc } from '../lib/html.ts';
import { reducedMotion } from '../lib/motion.ts';

export type Column<T> = { key: string; label: string; get: (r: T) => string | number; cell?: (r: T) => string; align?: 'l' | 'r' | 'c'; sortable?: boolean };
export type TableState = { sortKey: string; sortDir: 'asc' | 'desc' };
type Opts<T> = { empty?: string; rowAttr?: (r: T) => string; rowKey?: (r: T) => string };

export function sortRows<T>(rows: T[], cols: Column<T>[], state: TableState): T[] {
  const col = cols.find((c) => c.key === state.sortKey);
  if (!col) return [...rows];
  const dir = state.sortDir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = col.get(a), y = col.get(b);
    if (typeof x === 'number' && typeof y === 'number') return (x - y) * dir;
    return String(x).localeCompare(String(y), 'ko') * dir;
  });
}
// 행 정체성 — 정렬 전후로 "같은 행"을 찾아 이동 트랜지션(FLIP, 아래 mountTable)을
// 걸 때 쓴다. rowKey를 안 주면 전 컬럼 값을 이어붙인 지문으로 대신한다: 완벽한
// 유일성 보장은 아니지만 시각 효과 용도로는 충분하고, 표마다 별도 키 배선을 강제하지 않는다.
const fingerprint = <T>(cols: Column<T>[], r: T): string => cols.map((c) => String(c.get(r))).join('');

export function renderTable<T>(cols: Column<T>[], rows: T[], state: TableState, opts: Opts<T> = {}): string {
  const sorted = sortRows(rows, cols, state);
  const th = cols.map((c) => {
    const on = c.key === state.sortKey;
    const cls = [c.align ?? 'l', on ? 'sorted' : ''].filter(Boolean).join(' ');
    return `<th class="${cls}" data-key="${esc(c.key)}">${esc(c.label)}${on ? (state.sortDir === 'asc' ? ' ▴' : ' ▾') : ''}</th>`;
  }).join('');
  const keyOf = opts.rowKey ?? ((r: T) => fingerprint(cols, r));
  const body = sorted.length
    ? sorted.map((r) => `<tr data-rk="${esc(keyOf(r))}" ${opts.rowAttr ? opts.rowAttr(r) : ''}>${cols.map((c) => `<td class="${c.align ?? 'l'}">${c.cell ? c.cell(r) : esc(c.get(r))}</td>`).join('')}</tr>`).join('')
    : `<tr><td class="empty" colspan="${cols.length}">${esc(opts.empty ?? '아직 없음')}</td></tr>`;
  return `<table class="tbl"><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table>`;
}

// FLIP(First-Last-Invert-Play) — 재정렬 전 각 행의 화면 위치를 기억했다가, 다시 그린
// 뒤 옛 위치에서 새 위치로 미끄러지듯 되돌린다(8절 "표 정렬 시 행 이동 트랜지션").
// getBoundingClientRect가 없는 환경(단위 테스트의 가짜 DOM 등)은 조용히 건너뛴다.
function captureRowTops(el: HTMLElement): Map<string, number> {
  const tops = new Map<string, number>();
  el.querySelectorAll<HTMLElement>('tbody tr[data-rk]').forEach((tr) => {
    try { tops.set(tr.dataset.rk ?? '', tr.getBoundingClientRect().top); } catch { /* 실제 DOM이 아니면 무시 */ }
  });
  return tops;
}
function playRowMove(el: HTMLElement, before: Map<string, number>): void {
  el.querySelectorAll<HTMLElement>('tbody tr[data-rk]').forEach((tr) => {
    try {
      const from = before.get(tr.dataset.rk ?? '');
      if (from == null) return;
      const delta = from - tr.getBoundingClientRect().top;
      if (!delta) return;
      tr.style.transition = 'none';
      tr.style.transform = `translateY(${delta}px)`;
      tr.getBoundingClientRect(); // 강제 리플로우 — 위 시작 위치를 커밋해야 아래 트랜지션이 걸린다
      tr.style.transition = `transform var(--dur-fast) ease`;
      tr.style.transform = '';
    } catch { /* 위와 동일 */ }
  });
}

export function mountTable<T>(el: HTMLElement, cols: Column<T>[], rows: T[], state: TableState, opts: Opts<T> = {}): void {
  let first = true;
  const draw = () => {
    const before = !first && !reducedMotion() ? captureRowTops(el) : null;
    el.innerHTML = renderTable(cols, rows, state, opts);
    if (before) playRowMove(el, before);
    first = false;
    el.querySelectorAll<HTMLElement>('th[data-key]').forEach((th) => {
      th.onclick = () => {
        const key = th.dataset.key!;
        const col = cols.find((c) => c.key === key);
        if (!col || col.sortable === false) return;
        if (state.sortKey === key) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
        else { state.sortKey = key; state.sortDir = rows.length > 0 && typeof col.get(rows[0]) === 'number' ? 'desc' : 'asc'; }
        draw();
      };
    });
  };
  draw();
}
