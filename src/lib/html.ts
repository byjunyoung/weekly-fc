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
export const toast = (m: string): void => { const w = window as unknown as { wfcToast?: (m: string) => void }; w.wfcToast?.(m); };
/** 오늘 날짜를 UTC가 아닌 한국시간 기준 YYYY-MM-DD로. date input 기본값에 쓴다 — 매치는 토요일 오전이라 UTC 자정 이전엔 날짜가 하루 밀린다. */
export const seoulToday = (): string => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
