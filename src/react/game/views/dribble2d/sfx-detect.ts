// 드리블 훈련장의 소리 찾기(2026-11-07 3단계) — 이어진 두 상태 비교(순수). 공용 종류만:
// 3·2·1 마다 작은 "틱"(move), 출발 휘슬, 킥, 콘 넘어뜨림(bounce), 누가 도착(confirm), 끝.
import type { DrState } from '../../../../lib/games/dribble2d.ts';
import { COUNT_TICKS } from '../../../../lib/games/dribble2d.ts';
import type { Sfx } from '../../sfx.ts';

export function detectDrSfx(prev: DrState | null, next: DrState): Sfx[] {
  if (!prev || prev === next) return [];
  const out: Sfx[] = [];
  if (next.phase === 'count') {
    const sec = (t: number): number => Math.ceil((COUNT_TICKS - t) / 60);
    if (next.phaseTicks === 1 || sec(prev.phaseTicks) !== sec(next.phaseTicks)) out.push({ kind: 'move', vol: 1 });
  }
  if (prev.phase === 'count' && next.phase === 'run') out.push({ kind: 'whistle', vol: 0.8 });
  let kicked = false, hit = false, fin = false;
  next.lanes.forEach((l, i) => {
    const a = prev.lanes[i];
    if (!a) return;
    if (l.p.kickCooldown > a.p.kickCooldown) kicked = true;
    if (l.pen > a.pen) hit = true;
    if (a.fin < 0 && l.fin >= 0) fin = true;
  });
  if (kicked) out.push({ kind: 'kick', vol: 0.8 });
  if (hit) out.push({ kind: 'bounce', vol: 0.8 });
  if (fin) out.push({ kind: 'confirm', vol: 1 });
  if (prev.phase !== 'end' && next.phase === 'end') out.push({ kind: 'end', vol: 1 });
  return out;
}
