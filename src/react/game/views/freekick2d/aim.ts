// src/react/game/views/freekick2d/aim.ts — 프리킥 키커 화면의 조준과 감기(2026-11-07 3단계). 순수 — node 테스트가 그대로 부른다.
// 승부차기 aim.ts 와 같은 약속: 조준·감기는 이 화면 안에만 있고, 모으던 킥을 떼는 그 틱부터만 입력에 실린다(그 전엔 aim: null, x: 0).
// 다른 점 하나 — 세기를 모으는 동안엔 스틱 좌우가 조준을 옮기지 않고 감기(curl)가 된다. 조준은 골라인 위 x(배율을 곱한 값)로 들고,
// 보낼 때 FK_AIM_SCALE 로 나눈다(입력 정수는 승부차기 모양 그대로).
import type { PenInput } from '../../../../lib/games/penalty2d.ts';
import { AIM_SPEED } from '../../../../lib/games/penalty2d.ts';
import { FK_AIM_MAX, FK_AIM_SCALE } from '../../../../lib/games/freekick2d.ts';

export type FkLocal = { kickNo: number; aim: number; curl: number; armed: boolean; held: boolean; latched: { aim: number; curl: number } | null };
export const FK_LOCAL: FkLocal = { kickNo: -1, aim: 0, curl: 0, armed: false, held: false, latched: null };
const IDLE: PenInput = { x: 0, kick: false, aim: null };

/** 한 틱의 조작 → 입력. kicker = 이번 차기를 내가 차나(마지막으로 그린 상태 기준). */
export function fkInput(local: FkLocal, h: { x: number; kick: boolean }, kicker: boolean, phase: string): { local: FkLocal; input: PenInput } {
  if (!kicker || (phase !== 'ready' && phase !== 'aim')) return { local, input: IDLE };
  const sx = Number.isFinite(h.x) ? Math.max(-1, Math.min(1, h.x)) : 0;
  if (h.kick) {
    const held = local.held || (local.armed && phase === 'aim');
    // 모으는 동안 — 스틱 좌우 = 감기(떼는 순간의 값이 쓰인다), 조준은 그대로
    return { local: { ...local, held, curl: held ? sx : local.curl }, input: { x: 0, kick: true, aim: null } };
  }
  const aim = Math.min(FK_AIM_MAX, Math.max(-FK_AIM_MAX, local.aim + sx * AIM_SPEED * FK_AIM_SCALE / 60));
  const latched = local.held ? { aim: local.aim, curl: local.curl } : local.latched;
  const next = { ...local, aim: local.held ? local.aim : aim, armed: true, held: false, latched };
  return { local: next, input: latched ? { x: latched.curl, kick: false, aim: latched.aim / FK_AIM_SCALE } : IDLE };
}
