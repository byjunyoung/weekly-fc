// 프리킥의 소리 찾기(2026-11-07 3단계) — 이어진 두 상태 비교(순수). 공용 종류만: 휘슬·킥·골·잡기·튕김·끝.
import type { FkState } from '../../../../lib/games/freekick2d.ts';
import type { Sfx } from '../../sfx.ts';

export function detectFkSfx(prev: FkState | null, next: FkState): Sfx[] {
  if (!prev || prev === next) return [];
  const out: Sfx[] = [];
  if (prev.phase !== 'aim' && next.phase === 'aim') out.push({ kind: 'whistle', vol: 0.6 });
  if (prev.phase === 'aim' && next.phase === 'flight') out.push({ kind: 'kick', vol: 0.6 + next.power * 0.4 });
  if (!prev.gk.dived && next.gk.dived && next.kickNo === prev.kickNo) out.push({ kind: 'tackle', vol: 0.5 });
  if (prev.outcome !== next.outcome && next.kickNo === prev.kickNo) {
    if (next.outcome === 'goal') out.push({ kind: 'goal', vol: 1 });
    else if (next.outcome === 'save') out.push({ kind: 'catch', vol: 1 });
    else if (next.outcome === 'wall' || next.outcome === 'post') out.push({ kind: 'bounce', vol: 1 });
  }
  if (prev.phase !== 'end' && next.phase === 'end') out.push({ kind: 'end', vol: 1 });
  return out;
}
