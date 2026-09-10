export const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
export function fmtDate(d: string): string {
  const [y, m, day] = d.split('-').map(Number);
  if (!y || !m || !day) return d;
  const w = DAYS[new Date(y, m - 1, day).getDay()];
  return `${y}.${String(m).padStart(2, '0')}.${String(day).padStart(2, '0')} (${w})`;
}
export const fmtWon = (n: number): string => `${n.toLocaleString('ko-KR')}원`;
export const monthLabel = (y: number, m: number): string => `${y}년 ${m}월`;
export const ytThumb = (id: string): string => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
export const ytEmbed = (id: string): string => `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1`;
export const ytWatch = (id: string): string => `https://www.youtube.com/watch?v=${id}`;
export const toast = (m: string): void => { const w = window as unknown as { wfcToast?: (m: string) => void }; w.wfcToast?.(m); };
