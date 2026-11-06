// 승부차기의 소리 찾기(2026-11-07 2단계) — 이어진 두 상태 비교(순수). 소리 종류는 공용(sfx.ts) 것만: 휘슬·킥·골·잡기·튕김·몸싸움·끝.
import type { PenState } from '../../../../lib/games/penalty2d.ts';
import type { Sfx } from '../../sfx.ts';

export function detectPenSfx(prev: PenState | null, next: PenState): Sfx[] {
  if (!prev || prev === next) return [];
  const out: Sfx[] = [];
  if (prev.phase !== 'aim' && next.phase === 'aim') out.push({ kind: 'whistle', vol: 0.6 });                 // 차도 된다
  if (prev.phase === 'aim' && next.phase === 'flight') out.push({ kind: 'kick', vol: 0.6 + next.power * 0.4 });
  if (!prev.gk.dived && next.gk.dived && next.kickNo === prev.kickNo) out.push({ kind: 'tackle', vol: 0.6 });   // 몸을 던졌다
  if (prev.outcome !== next.outcome && next.kickNo === prev.kickNo) {
    if (next.outcome === 'goal') out.push({ kind: 'goal', vol: 1 });
    else if (next.outcome === 'save') out.push({ kind: 'catch', vol: 1 });
    else if (next.outcome === 'post') out.push({ kind: 'bounce', vol: 1 });
  }
  if (prev.phase !== 'end' && next.phase === 'end') out.push({ kind: 'end', vol: 1 });
  return out;
}
