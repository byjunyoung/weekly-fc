// 기기에 남기는 최고 기록(2026-11-07 3단계 — 프리킥 점수·드리블 코스별 시간). 저장소를 못 쓰는 웹뷰에서도 판은 돈다(전부 try).
/** 읽기 — 없거나 숫자가 아니면 null. */
export function readBest(key: string): number | null {
  try { const v = Number(localStorage.getItem(key)); return localStorage.getItem(key) !== null && Number.isFinite(v) ? v : null; } catch { return null; }
}
/** 더 좋으면 적고, 적기 전 값과 새 기록인지를 돌려준다. better(a, b) = a 가 b 보다 좋은가. 같은 판을 여러 번 불러도 한 번만 적게 부르는 쪽이 들고 있는다. */
export function offerBest(key: string, v: number, better: (a: number, b: number) => boolean): { prev: number | null; isNew: boolean } {
  const prev = readBest(key);
  const isNew = prev === null || better(v, prev);
  if (isNew) { try { localStorage.setItem(key, String(v)); } catch { /* 못 적어도 이번 결과는 보인다 */ } }
  return { prev, isNew };
}

/** 프리킥 혼자 하기 최고 점수. */
export const FK_BEST_KEY = 'wfc:game:freekick-best';
/** 드리블 코스별 최고 기록(초) — 코스 id 를 붙인다. */
export const dribbleBestKey = (courseId: string): string => `wfc:game:dribble-best:${courseId}`;
