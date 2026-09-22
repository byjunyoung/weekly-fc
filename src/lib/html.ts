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

/** 능력치 기록의 시각. 서버는 UTC(ISO)로 적으니 서울 시간으로 옮겨 보여 준다 —
 *  안 옮기면 밤에 고친 게 전날로 찍힌다. 같은 날 여러 번 고쳤을 때 순서를 보려고
 *  요일 대신 시:분을 넣는다(줄 길이는 그대로). 못 읽는 값은 원문을 그대로 돌려준다. */
export function fmtLogAt(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  const p = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d).reduce<Record<string, string>>((a, x) => { a[x.type] = x.value; return a; }, {});
  return `${p.year}.${p.month}.${p.day} ${p.hour}:${p.minute}`;
}
