// src/lib/game/quant.ts — 2D 경기의 입력 줄이기(양자화)(2026-11-06). 순수.
// 설계: docs/superpowers/specs/2026-11-06-game-online-design.md §2.4
// net.ts 에 있던 것을 그대로 옮겼다(2026-11-07) — 메시지·예측은 모든 게임 공용(src/lib/games)이 되고, 이 표는 2D 경기의 것이라.
//
// step() 에 들어가는 값 경로에는 삼각함수·hypot·pow·exp 를 쓰지 않는다 — 방장과 손님이 서로 다른 브라우저 엔진에서
// 같은 결과를 내야 해서, 방향 표는 상수로 적어 두고 가장 가까운 방향은 내적(곱셈·덧셈)으로 찾는다.
import type { Input } from './sim.ts';
import { NO_INPUT } from './sim.ts';

// ═══════════════════════════ 입력 양자화 ═══════════════════════════
// 방향 16 × 세기 2단계(걷기 0.5 · 달리기 1) + 정지 = 33 가지, 킥 여부 ×2 = 66 가지 → 정수 0..65 하나.
// 부호화: q = (kick ? 33 : 0) + m,  m = 0 정지 / 1 + dir * 2 + (달리기 ? 1 : 0).
// 모든 계산(방장·봇·손님·예측)은 이 표에서 꺼낸 값만 쓴다 — 손님의 예측과 방장의 계산이 같은 입력을 쓰게 하려는 것.

/** 정지(방향 없음·킥 없음). */
export const Q_IDLE = 0;
export const Q_COUNT = 66;
/** 입력 코드에서 킥이 켜진 경계 — 이 이상이면 킥을 누른 입력. */
export const KICK_OFFSET = 33;
const WALK = 0.5, RUN = 1;
const WALK_BELOW = 0.75;   // 크기가 이 밑이면 걷기, 이상이면 달리기(아날로그 스틱의 중간쯤)
const DEAD = 0.15;          // 이 밑은 손을 뗀 것으로 본다

// 방향 k = 22.5° × k 의 (cos, sin). 상수 표 — 삼각함수를 부르지 않는다. 길이가 1 을 넘지 않게 끝자리를 내림했다.
const C1 = 0.9238795325112867, S1 = 0.3826834323650898, C2 = 0.7071067811865475;
const DIRS: readonly (readonly [number, number])[] = [
  [1, 0], [C1, S1], [C2, C2], [S1, C1],
  [0, 1], [-S1, C1], [-C2, C2], [-C1, S1],
  [-1, 0], [-C1, -S1], [-C2, -C2], [-S1, -C1],
  [0, -1], [S1, -C1], [C2, -C2], [C1, -S1],
];

const fin = (v: number): number => (Number.isFinite(v) ? v : 0);

/** 입력 → 0..65. 크기가 작으면 정지, 가장 가까운 16방향 하나로 맞춘다(내적이 가장 큰 방향). */
export function encodeInput(i: Input): number {
  const x = fin(i.x), y = fin(i.y);
  const len = Math.sqrt(x * x + y * y);
  const kick = i.kick ? KICK_OFFSET : 0;
  if (len < DEAD) return kick;
  let best = 0, bestDot = -Infinity;
  for (let k = 0; k < 16; k++) {
    const d = x * DIRS[k][0] + y * DIRS[k][1];
    if (d > bestDot) { bestDot = d; best = k; }
  }
  return kick + 1 + best * 2 + (len < WALK_BELOW ? 0 : 1);
}

/** 0..65 → 입력. 범위 밖·정수 아님은 정지로 본다(바깥에서 온 값이라). 표에서 꺼내므로 어느 엔진에서나 같다. */
export function decodeInput(q: number): Input {
  if (!Number.isInteger(q) || q < 0 || q >= Q_COUNT) return { ...NO_INPUT };
  const kick = q >= KICK_OFFSET;
  const m = q - (kick ? KICK_OFFSET : 0);
  if (m === 0) return { x: 0, y: 0, kick };
  const dir = (m - 1) >> 1, mag = (m - 1) & 1 ? RUN : WALK;
  return { x: DIRS[dir][0] * mag, y: DIRS[dir][1] * mag, kick };
}

/** 사람 입력을 양자화해서 다시 풀어낸 것 — 방장도 손님도 자기 입력을 이걸 거쳐 쓴다(양쪽 계산이 같은 값을 쓰게). */
export function quantize(i: Input): Input { return decodeInput(encodeInput(i)); }
