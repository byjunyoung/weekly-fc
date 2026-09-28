// src/components/jersey.ts — 라커룸 칸에 걸린 유니폼 뒷면(2026-09-28, 레퍼런스: 조명 받는 사물함 한 칸에 이름·등번호).
// 14×16 도트 실루엣. 색은 그 선수 아바타의 유니폼색(kit)을 그대로 쓴다 — 캐릭터와 같은 옷이다.
// 이름·번호 글자는 SVG 안이 아니라 화면(HTML)이 얹는다 — 도트 폰트(갈무리)를 그대로 쓰기 위해서다.

/** 줄마다 칠할 칸 구간 [시작, 끝]. 0 = 어깨 두 점(목 트임), 1~4 = 소매까지 넓은 몸통, 5 = 소매 끝, 그 아래 몸통. */
const ROWS: Record<number, Array<[number, number]>> = {
  0: [[4, 5], [8, 9]], 1: [[2, 11]], 2: [[0, 13]], 3: [[0, 13]], 4: [[0, 13]], 5: [[0, 2], [3, 10], [11, 13]],
};
export const JERSEY_W = 14;
export const JERSEY_H = 16;

export function jerseySvg(kit: string, px: number): string {
  const color = /^#[0-9a-fA-F]{3,6}$/.test(kit) ? kit : '#565f6f';
  let body = '';
  for (let y = 0; y < JERSEY_H; y++) {
    for (const [a, b] of ROWS[y] ?? [[3, 10]]) body += `<rect x="${a}" y="${y}" width="${b - a + 1}" height="1"/>`;
  }
  return `<svg class="jersey-svg" viewBox="0 0 ${JERSEY_W} ${JERSEY_H}" width="${JERSEY_W * px}" height="${JERSEY_H * px}" shape-rendering="crispEdges" aria-hidden="true">`
    + `<g fill="${color}">${body}</g>`
    + '<g fill="rgba(0,0,0,.28)"><rect x="0" y="5" width="3" height="1"/><rect x="11" y="5" width="3" height="1"/><rect x="3" y="15" width="8" height="1"/></g>'
    + '</svg>';
}
