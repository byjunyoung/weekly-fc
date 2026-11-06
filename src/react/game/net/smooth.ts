// src/react/game/net/smooth.ts — 그릴 때만 쓰는 부드럽게 하기(2026-11-06). 계산(step)에는 절대 안 들어간다.
// 설계: 스펙 §2.5 "새 스냅샷으로 위치가 튀는 것을 줄이려고 화면 위치를 0.1초쯤에 걸쳐 따라가게(작은 차이만 — 크게 어긋나면 바로 맞춘다)".
// 순수 계산 코어(lib)가 아니라 여기 둔 이유: 화면 사정(얼마나 부드럽게 보일지)은 방장·손님 계산이 같아야 하는 값이 아니다.
// 2026-11-07 게임 묶음: 몸이 어디 있는지는 게임마다 달라서, 어댑터의 bodies(몸 목록 읽기·쓰기)를 받아 어느 게임에나 쓴다.
// 규칙(섞기·건너뛰기 기준·0.1초 따라가기)은 2D 경기에서 쓰던 그대로다.
import type { GameAdapter, Point } from '../../../lib/games/adapter.ts';

/** 한 틱에 이보다 멀리 움직인 몸은 섞지 않는다(골 뒤 재배치). render.ts 의 blend 와 같은 기준. */
const JUMP = 120;
/** 스냅샷 보정이 이보다 크면 따라가지 않고 바로 맞춘다(골 뒤 재배치처럼 진짜로 순간 이동한 경우). */
export const SNAP_LIMIT = 90;
/** 보정이 사라지는 시간 상수(ms). exp(-100/35) ≈ 6% — 0.1초면 거의 다 따라간다. */
const TAU_MS = 35;

/** 몸마다 화면에만 더하는 어긋남(차례는 어댑터 bodies.get 의 차례). */
export type Offsets = { x: number[]; y: number[] };
/** 몸 count 개의 빈 어긋남. */
export const noOffsets = (count: number): Offsets => ({ x: new Array(Math.max(0, count)).fill(0), y: new Array(Math.max(0, count)).fill(0) });

export type Lens<S> = NonNullable<GameAdapter<unknown, S, unknown>['bodies']>;

export type Smoother<S> = {
  /** 직전·현재 상태를 a(0~1)로 섞는다 — 1단계 render.blend 와 같은 규칙. */
  lerp(prev: S, cur: S, a: number): S;
  /** 스냅샷이 예측을 고쳤을 때: 그동안 그리던 자리(before + 기존 어긋남)를 지키도록 어긋남을 새로 잡는다.
   *  차이가 SNAP_LIMIT 보다 크면 그 몸은 바로 새 자리로(어긋남 0). */
  correct(off: Offsets, before: S | null, after: S): Offsets;
  /** 그릴 상태에 어긋남을 더한다(새 객체, 원본은 그대로). */
  withOffsets(s: S, off: Offsets): S;
};

/** 몸 목록을 아는 게임의 부드럽게 하기. 몸을 모르는 게임(bodies 없음)은 그대로 돌려준다. */
export function smootherFor<S>(lens: Lens<S> | undefined): Smoother<S> {
  if (!lens) return { lerp: (_p, c) => c, correct: () => noOffsets(0), withOffsets: (s) => s };
  return {
    lerp(prev, cur, a) {
      if (prev === cur || a <= 0) return cur;
      const t = Math.min(1, a);
      const mix = (p: Point, c: Point): Point => {
        const dx = c.x - p.x, dy = c.y - p.y;
        if (dx * dx + dy * dy > JUMP * JUMP) return c;
        return { ...c, x: p.x + dx * t, y: p.y + dy * t };
      };
      const pb = lens.get(prev);
      return lens.set(cur, lens.get(cur).map((c, i) => (pb[i] ? mix(pb[i], c) : c)));
    },
    correct(off, before, after) {
      const a = lens.get(after), n = a.length;
      const out = noOffsets(n);
      if (!before) return out;
      const b = lens.get(before);
      if (b.length !== n) return out;
      for (let i = 0; i < n; i++) {
        const dx = b[i].x + (off.x[i] ?? 0) - a[i].x, dy = b[i].y + (off.y[i] ?? 0) - a[i].y;
        if (dx * dx + dy * dy <= SNAP_LIMIT * SNAP_LIMIT) { out.x[i] = dx; out.y[i] = dy; }
      }
      return out;
    },
    withOffsets(s, off) {
      if (off.x.every((v) => v === 0) && off.y.every((v) => v === 0)) return s;
      return lens.set(s, lens.get(s).map((p, i) => ({ ...p, x: p.x + (off.x[i] ?? 0), y: p.y + (off.y[i] ?? 0) })));
    },
  };
}

/** dt(ms) 만큼 어긋남을 줄인다. */
export function decay(off: Offsets, dtMs: number): Offsets {
  if (!(dtMs > 0)) return off;
  const k = Math.exp(-dtMs / TAU_MS);
  return { x: off.x.map((v) => (Math.abs(v * k) < 0.05 ? 0 : v * k)), y: off.y.map((v) => (Math.abs(v * k) < 0.05 ? 0 : v * k)) };
}
