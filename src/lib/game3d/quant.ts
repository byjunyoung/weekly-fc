// src/lib/game3d/quant.ts — 3D 경기의 입력 줄이기(양자화)(2026-11-07 게임 묶음 4단계 "3D 경기 온라인"). 순수.
// 설계: docs/superpowers/specs/2026-11-07-games-program-design.md §2·§3.5, 2D 의 src/lib/game/quant.ts 와 같은 방식.
//
// 사용자: "자유 훈련장, 여러 드리블 훈련장, 승부차기, 프리킥 같은 게임 만들어서 온라인 가능하게 하자. 다 2d, 3d 모드 별로 가능하게 하고."
// 손님은 정수 하나만 보내고, 방장·손님·예측이 모두 그 정수를 풀어 쓴 값으로 계산한다 — 그래야 손님의 예측과 방장의 계산이 같은 입력을 쓴다.
// step() 에 들어가는 값 경로에는 삼각함수를 쓰지 않는다: 방향 표는 상수(첫 사분면 16개를 적고, 나머지는 90도씩 돌린 것 — 부호 바꾸기·자리 바꾸기라 정확하다),
// 가장 가까운 방향은 내적(곱셈·덧셈)으로 찾는다. WebKit 손님과 Chrome 방장이 같은 숫자를 내야 해서다.
//
// 담는 것 셋(곱해서 정수 하나):
//   ① 움직임 — 2D 와 같이 16방향 × 세기 2(0.5 · 1) + 정지 = 33.
//   ② 동작 키 — 슛·패스·스루·로빙·질주를 누르고 있나(5비트 = 32). 슛·로빙의 "모은 세기"는 상태가 누른 틱을 세므로(charge·lobTicks) 눌림만 오가면 된다.
//   ③ 보는 방향 — 1인칭 화면만 직접 준다(2026-11-07 "1인칭도 구현해줘"). 64방향 + 없음 = 65.
// 1인칭일 땐 ① 을 "보는 방향 기준"으로 적는다 — 앞으로 가기가 정확히 보는 쪽이 되게(경기장 기준 16방향이면 보는 쪽과 최대 11도 어긋난다).
// 33 × 32 × 65 = 68,640 가지 — 2D(66)보다 크지만 메시지는 여전히 정수 하나다(net.ts MAX_CODES 를 그만큼 넓혔다).
import type { Input } from './sim.ts';
import { NO_INPUT } from './sim.ts';

const MOVES = 33, FLAGS = 32, FACES = 65;
export const Q3_COUNT = MOVES * FLAGS * FACES;
/** 정지·키 없음·보는 방향 없음. */
export const Q3_IDLE = 0;
const WALK = 0.5, RUN = 1;
const WALK_BELOW = 0.75;   // 크기가 이 밑이면 0.5, 이상이면 1(2D 와 같다)
const DEAD = 0.15;          // 이 밑은 손을 뗀 것

// 첫 사분면 16방향(5.625° × k)의 (cos, sin). 나머지 48개는 이것을 90도씩 돌린다: (x, y) → (−y, x).
const Q1: readonly (readonly [number, number])[] = [
  [1, 0], [0.9951847266721969, 0.0980171403295606], [0.9807852804032304, 0.19509032201612825], [0.9569403357322088, 0.29028467725446233],
  [0.9238795325112867, 0.3826834323650898], [0.881921264348355, 0.47139673682599764], [0.8314696123025452, 0.5555702330196022], [0.773010453362737, 0.6343932841636455],
  [0.7071067811865476, 0.7071067811865475], [0.6343932841636455, 0.7730104533627369], [0.5555702330196023, 0.8314696123025452], [0.4713967368259978, 0.8819212643483549],
  [0.38268343236508984, 0.9238795325112867], [0.29028467725446233, 0.9569403357322089], [0.19509032201612833, 0.9807852804032304], [0.09801714032956077, 0.9951847266721968],
];
/** 64방향 표(경기 좌표 x·y 의 단위 벡터). k = 0 이 +x(0 편 공격 쪽), 커질수록 +y 쪽으로 돈다. */
export const FACE64: readonly (readonly [number, number])[] = Array.from({ length: 64 }, (_, k) => {
  let [x, y] = Q1[k % 16];
  for (let r = 0; r < k >> 4; r++) [x, y] = [0 - y, x];
  return [x, y] as const;
});
/** 움직임 16방향 = 64방향 표의 4칸마다(22.5°). */
const DIR16 = Array.from({ length: 16 }, (_, k) => FACE64[k * 4]);

/** 손을 뗀 입력 — 모든 키가 false 로 적힌 모양(풀어 쓴 입력과 같은 모양이어야 비교가 맞는다). */
export const IDLE3: Input = { ...NO_INPUT, through: false, lob: false, sprint: false };

const fin = (v: number): number => (Number.isFinite(v) ? v : 0);

/** 가장 가까운 방향(내적이 가장 큰 것). 같으면 앞 번호. */
function nearest(table: readonly (readonly [number, number])[], x: number, y: number): number {
  let best = 0, bestDot = -Infinity;
  for (let k = 0; k < table.length; k++) {
    const d = x * table[k][0] + y * table[k][1];
    if (d > bestDot) { bestDot = d; best = k; }
  }
  return best;
}

/** 보는 방향이 실렸나 — sim 과 같은 기준(fx·fy 가 둘 다 있고 길이가 0.5 넘음). */
function facingOf(i: Input): [number, number] | null {
  if (i.fx === undefined || i.fy === undefined) return null;
  const x = fin(i.fx), y = fin(i.fy);
  return x * x + y * y > 0.25 ? [x, y] : null;
}

/** 보는 방향만 64방향 표로(표 번호). 화면 쪽이 1인칭 시선을 정할 때도 쓴다 — 보낼 값과 그릴 값이 같게. */
export function faceIndex(fx: number, fy: number): number { return nearest(FACE64, fin(fx), fin(fy)); }

/** 입력 → 0..Q3_COUNT-1. */
export function encodeInput3(i: Input): number {
  const face = facingOf(i);
  const fk = face ? nearest(FACE64, face[0], face[1]) : -1;
  let x = fin(i.x), y = fin(i.y);
  if (fk >= 0) {
    // 보는 방향 기준으로 돌려 적는다: 앞 = (f·m), 오른쪽(+y 쪽) = (f⊥·m), f⊥ = (−fy, fx)
    const [fx, fy] = FACE64[fk];
    const ax = x * fx + y * fy, ay = y * fx - x * fy;
    x = ax; y = ay;
  }
  const len = Math.sqrt(x * x + y * y);
  const m = len < DEAD ? 0 : 1 + nearest(DIR16, x, y) * 2 + (len < WALK_BELOW ? 0 : 1);
  const flags = (i.shoot ? 1 : 0) | (i.pass ? 2 : 0) | (i.through ? 4 : 0) | (i.lob ? 8 : 0) | (i.sprint ? 16 : 0);
  return ((fk + 1) * FLAGS + flags) * MOVES + m;
}

/** 0..Q3_COUNT-1 → 입력. 범위 밖·정수 아님은 정지(바깥에서 온 값이라). 표에서 꺼내고 곱셈·덧셈만 하므로 어느 엔진에서나 같다. */
export function decodeInput3(q: number): Input {
  if (!Number.isInteger(q) || q < 0 || q >= Q3_COUNT) return { ...IDLE3 };
  const m = q % MOVES, rest = (q - m) / MOVES;
  const flags = rest % FLAGS, fk = (rest - flags) / FLAGS - 1;
  let x = 0, y = 0;
  if (m > 0) {
    const d = DIR16[(m - 1) >> 1], mag = (m - 1) & 1 ? RUN : WALK;
    x = d[0] * mag; y = d[1] * mag;
  }
  const out: Input = {
    x, y, shoot: (flags & 1) !== 0, pass: (flags & 2) !== 0,
    through: (flags & 4) !== 0, lob: (flags & 8) !== 0, sprint: (flags & 16) !== 0,
  };
  if (fk >= 0) {
    const [fx, fy] = FACE64[fk];
    // 보는 방향 기준 → 경기장 기준: m = 앞·f + 오른쪽·f⊥
    // + 0: −0 을 0 으로(−0 이 상태에 들어가면 JSON 을 오간 뒤 같은 값이 아니게 된다)
    if (m > 0) { out.x = x * fx - y * fy + 0; out.y = x * fy + y * fx + 0; }
    out.fx = fx; out.fy = fy;
  }
  return out;
}

/** 동작 키(슛·패스·스루·로빙) 눌림이 바뀌었나 — 바뀐 입력은 간격을 기다리지 않고 바로 보낸다(누른·뗀 순간이 늦으면 안 된다).
 *  질주·움직임·보는 방향은 급하지 않다 — 1인칭으로 돌 때 틱마다 바뀌어 채널이 넘치지 않게. */
export function urgent3(a: number, b: number): boolean {
  const keys = (q: number): number => (Math.floor(q / MOVES) % FLAGS) & 15;
  return keys(a) !== keys(b);
}

/** 사람 입력을 양자화해서 다시 풀어낸 것. */
export function quantize3(i: Input): Input { return decodeInput3(encodeInput3(i)); }
