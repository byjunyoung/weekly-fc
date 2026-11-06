// src/react/game/net/smooth.ts — 그릴 때만 쓰는 부드럽게 하기(2026-11-06). 계산(step)에는 절대 안 들어간다.
// 설계: 스펙 §2.5 "새 스냅샷으로 위치가 튀는 것을 줄이려고 화면 위치를 0.1초쯤에 걸쳐 따라가게(작은 차이만 — 크게 어긋나면 바로 맞춘다)".
// 순수 계산 코어(net.ts)가 아니라 여기 둔 이유: 화면 사정(얼마나 부드럽게 보일지)은 방장·손님 계산이 같아야 하는 값이 아니다.
import type { Body, MatchState } from '../../../lib/game/sim.ts';

/** 한 틱에 이보다 멀리 움직인 몸은 섞지 않는다(골 뒤 재배치). render.ts 의 blend 와 같은 기준. */
const JUMP = 120;
/** 스냅샷 보정이 이보다 크면 따라가지 않고 바로 맞춘다(골 뒤 재배치처럼 진짜로 순간 이동한 경우). */
export const SNAP_LIMIT = 90;
/** 보정이 사라지는 시간 상수(ms). exp(-100/35) ≈ 6% — 0.1초면 거의 다 따라간다. */
const TAU_MS = 35;

/** 직전·현재 상태를 a(0~1)로 섞는다 — 1단계 render.blend 와 같은 규칙. 리액트·캔버스를 안 부르는 node 용 사본. */
export function lerpState(prev: MatchState, cur: MatchState, a: number): MatchState {
  if (prev === cur || a <= 0) return cur;
  const t = Math.min(1, a);
  const mix = <T extends Body>(p: T, c: T): T => {
    const dx = c.x - p.x, dy = c.y - p.y;
    if (dx * dx + dy * dy > JUMP * JUMP) return c;
    return { ...c, x: p.x + dx * t, y: p.y + dy * t };
  };
  return { ...cur, ball: mix(prev.ball, cur.ball), players: cur.players.map((c, i) => (prev.players[i] ? mix(prev.players[i], c) : c)) };
}

/** 몸마다(0 = 공, 1.. = 선수) 화면에만 더하는 어긋남. */
export type Offsets = { x: number[]; y: number[] };
export const noOffsets = (n: number): Offsets => ({ x: new Array(n + 1).fill(0), y: new Array(n + 1).fill(0) });

const bodies = (s: MatchState): Body[] => [s.ball, ...s.players];

/** 스냅샷이 예측을 고쳤을 때: 그동안 그리던 자리(before + 기존 어긋남)를 지키도록 어긋남을 새로 잡는다.
 *  차이가 SNAP_LIMIT 보다 크면 그 몸은 바로 새 자리로(어긋남 0). */
export function correct(off: Offsets, before: MatchState | null, after: MatchState): Offsets {
  const n = after.players.length;
  const out = noOffsets(n);
  if (!before || before.players.length !== n) return out;
  const b = bodies(before), a = bodies(after);
  for (let i = 0; i <= n; i++) {
    const dx = b[i].x + (off.x[i] ?? 0) - a[i].x, dy = b[i].y + (off.y[i] ?? 0) - a[i].y;
    if (dx * dx + dy * dy <= SNAP_LIMIT * SNAP_LIMIT) { out.x[i] = dx; out.y[i] = dy; }
  }
  return out;
}

/** dt(ms) 만큼 어긋남을 줄인다. */
export function decay(off: Offsets, dtMs: number): Offsets {
  if (!(dtMs > 0)) return off;
  const k = Math.exp(-dtMs / TAU_MS);
  return { x: off.x.map((v) => (Math.abs(v * k) < 0.05 ? 0 : v * k)), y: off.y.map((v) => (Math.abs(v * k) < 0.05 ? 0 : v * k)) };
}

/** 그릴 상태에 어긋남을 더한다(새 객체, 원본은 그대로). */
export function withOffsets(s: MatchState, off: Offsets): MatchState {
  if (off.x.every((v) => v === 0) && off.y.every((v) => v === 0)) return s;
  return {
    ...s,
    ball: { ...s.ball, x: s.ball.x + (off.x[0] ?? 0), y: s.ball.y + (off.y[0] ?? 0) },
    players: s.players.map((p, i) => ({ ...p, x: p.x + (off.x[i + 1] ?? 0), y: p.y + (off.y[i + 1] ?? 0) })),
  };
}
