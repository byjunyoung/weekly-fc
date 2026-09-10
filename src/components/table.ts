// src/components/table.ts — 정렬되는 표. DOM은 mountTable에서만.
import { esc } from '../lib/html.ts';

export type Column<T> = { key: string; label: string; get: (r: T) => string | number; cell?: (r: T) => string; align?: 'l' | 'r' | 'c'; sortable?: boolean };
export type TableState = { sortKey: string; sortDir: 'asc' | 'desc' };
type Opts<T> = { empty?: string; rowAttr?: (r: T) => string };

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
export function renderTable<T>(cols: Column<T>[], rows: T[], state: TableState, opts: Opts<T> = {}): string {
  const sorted = sortRows(rows, cols, state);
  const th = cols.map((c) => {
    const on = c.key === state.sortKey;
    const cls = [c.align ?? 'l', on ? 'sorted' : ''].filter(Boolean).join(' ');
    return `<th class="${cls}" data-key="${esc(c.key)}">${esc(c.label)}${on ? (state.sortDir === 'asc' ? ' ▴' : ' ▾') : ''}</th>`;
  }).join('');
  const body = sorted.length
    ? sorted.map((r) => `<tr ${opts.rowAttr ? opts.rowAttr(r) : ''}>${cols.map((c) => `<td class="${c.align ?? 'l'}">${c.cell ? c.cell(r) : esc(c.get(r))}</td>`).join('')}</tr>`).join('')
    : `<tr><td class="empty" colspan="${cols.length}">${esc(opts.empty ?? '아직 없음')}</td></tr>`;
  return `<table class="tbl"><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table>`;
}
export function mountTable<T>(el: HTMLElement, cols: Column<T>[], rows: T[], state: TableState, opts: Opts<T> = {}): void {
  const draw = () => {
    el.innerHTML = renderTable(cols, rows, state, opts);
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
