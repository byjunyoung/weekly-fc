// 자유 훈련장의 소리 찾기(2026-11-07 2단계) — 이어진 두 상태 비교(순수). 경기와 같은 종류(킥·튕김·골)만 쓴다.
import type { FreeState } from '../../../../lib/games/free2d.ts';
import type { Sfx } from '../../sfx.ts';

const BOUNCE_MIN_SPEED = 140;

export function detectFreeSfx(prev: FreeState | null, next: FreeState): Sfx[] {
  if (!prev || prev === next) return [];
  const out: Sfx[] = [];
  if (next.goals > prev.goals) out.push({ kind: 'goal', vol: 0.7 });
  let kicked = false;
  for (let i = 0; i < next.players.length; i++) {
    const a = prev.players[i], b = next.players[i];
    if (a && b && b.kickCooldown > a.kickCooldown) kicked = true;
  }
  if (kicked) out.push({ kind: 'kick', vol: 1 });
  // 튕김 — 공 하나라도 진행 방향이 확 꺾였다(벽·기둥·몸·다른 공). 가장 빠른 것 하나로.
  if (!kicked && prev.balls.length === next.balls.length) {
    let v = 0;
    for (let j = 0; j < next.balls.length; j++) {
      const p = prev.balls[j], n = next.balls[j];
      const sa = Math.sqrt(p.vx * p.vx + p.vy * p.vy), sb = Math.sqrt(n.vx * n.vx + n.vy * n.vy);
      if (sa > BOUNCE_MIN_SPEED && sb > 1 && (p.vx * n.vx + p.vy * n.vy) / (sa * sb) < 0.5) v = Math.max(v, Math.min(1, sa / 700));
    }
    if (v > 0) out.push({ kind: 'bounce', vol: v });
  }
  return out;
}
