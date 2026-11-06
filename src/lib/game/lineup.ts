// src/lib/game/lineup.ts — 명단에서 봇을 뽑는 데 쓰는 작은 도구(2026-11-06). 순수.
// 1단계(view.ts 의 pickLineup)가 쓰던 섞기를 여기로 빼서 2단계 방(room.ts)이 같은 방식으로 봇을 뽑는다.
// 같은 난수열이면 같은 순서가 나와야 1단계 테스트가 그대로 초록이다 — 소비 순서를 바꾸지 않는다.

/** Fisher–Yates. 원본은 건드리지 않고 섞은 사본을 돌려준다. rnd = 0 이상 1 미만 난수 함수(바깥에서 받는다). */
export function shuffle<T>(items: readonly T[], rnd: () => number): T[] {
  const pool = items.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
}
