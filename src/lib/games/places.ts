// src/lib/games/places.ts — 기록 게임(프리킥·드리블, 2D·3D)의 등수(2026-11-07 합치기). 순수.
// 사용자(조정자 전달): "같은 결과는 같은 등수 — 등수 = 1 + 나보다 확실히 나은 사람 수. 혼자 1등일 때만 '1등!', 같이면 '공동 n등'.
// 아무도 못 넣은 방에서 방장을 1등으로 세우지 않는다."
// 순위 줄의 차례(누가 위에 적히나)는 게임마다의 ranking 이 정하고, 이 파일은 그 줄에 적을 등수 숫자와 머리말만 정한다.

/** 등수 — cmp(a, b) < 0 이면 a 가 확실히 낫다(같으면 0 — 레인·차례 번호로 가르지 않는다). */
export function placesBy(n: number, cmp: (a: number, b: number) => number): number[] {
  const all = Array.from({ length: n }, (_, i) => i);
  return all.map((i) => 1 + all.filter((j) => cmp(j, i) < 0).length);
}

/** 그 등수를 같이 가진 사람 수. */
export const tiedAt = (places: readonly number[], p: number): number => places.filter((x) => x === p).length;

/** 내 머리말 — 혼자 1등 "1등!", 같이 1등 "공동 1등", 그 밖 "n등"·"공동 n등". */
export function placeWord(places: readonly number[], i: number): string {
  const p = places[i];
  if (tiedAt(places, p) > 1) return `공동 ${p}등`;
  return p === 1 ? '1등!' : `${p}등`;
}

/** 구경하는 사람의 머리말 — 1등이 하나면 "이름 1등", 여럿이면 "공동 1등 k명". */
export function topWord(places: readonly number[], name: string): string {
  const k = tiedAt(places, 1);
  return k > 1 ? `공동 1등 ${k}명` : `${name} 1등`;
}

/** 1등 이름 — 같이 1등이면 "이름 외 k명". */
export function topName(places: readonly number[], name: string): string {
  const k = tiedAt(places, 1);
  return k > 1 ? `${name} 외 ${k - 1}명` : name;
}
