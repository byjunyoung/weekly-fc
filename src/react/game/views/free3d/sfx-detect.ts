// 3D 자유 훈련장의 소리 찾기(2026-11-07 5단계) — 이어진 두 상태 비교(순수). 2D 훈련장과 같은 사건에 같은 종류(킥·튕김·골).
import type { Free3State } from '../../../../lib/games/free3d.ts';
import type { Sfx } from '../../sfx.ts';

/** 공이 이보다 빠를 때(m/s) 진행 방향이 확 꺾이면 튕김 소리(3D 경기 sfx3d 와 같은 기준). */
const HIT_MIN_SPEED = 4, HIT_FULL_SPEED = 26;

export function detectFree3Sfx(prev: Free3State | null, next: Free3State): Sfx[] {
  if (!prev || prev === next || next.tick < prev.tick) return [];
  const out: Sfx[] = [];
  if (next.goals > prev.goals) out.push({ kind: 'goal', vol: 0.7 });
  const kicked = next.kicks > prev.kicks;
  if (kicked) out.push({ kind: 'kick', vol: 1 });
  if (!kicked && prev.balls.length === next.balls.length) {
    let v = 0;
    for (let j = 0; j < next.balls.length; j++) {
      const a = prev.balls[j], b = next.balls[j];
      if (a.owner !== null || b.owner !== null) continue;
      const sa = Math.sqrt(a.vx * a.vx + a.vy * a.vy), sb = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      if (sa > HIT_MIN_SPEED && (sb < 0.5 || (a.vx * b.vx + a.vy * b.vy) / (sa * sb) < 0.5)) v = Math.max(v, Math.min(1, sa / HIT_FULL_SPEED));
    }
    if (v > 0) out.push({ kind: 'bounce', vol: v });
  }
  return out;
}
