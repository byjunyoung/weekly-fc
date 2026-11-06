// src/react/game/views/penalty3d/aim3.ts — 3D 승부차기 키커 화면의 조준(2026-11-07 5단계). 순수 — node 테스트가 그대로 부른다.
// 2D 의 aim.ts 와 같은 약속에 높이만 더했다: 조준은 이 화면 안에만 있고, 모으던 킥을 떼는 그 틱부터만 입력에 실린다(그 전엔 aim: null).
// 키퍼 차례 화면은 골대 뒤에서 보므로(화면 오른쪽 = 경기 −y) 좌우를 뒤집어 넘긴다 — 누른 쪽으로 보이는 대로 움직이게.
import type { Aim3, Pen3Input } from '../../../../lib/games/penalty3d.ts';
import { AIM_MAX, AIM_SPEED, AIM_Z_MAX, AIM_Z_SPEED } from '../../../../lib/games/penalty3d.ts';

export type AimLocal3 = { kickNo: number; aim: Aim3; armed: boolean; held: boolean; latched: Aim3 | null };
/** 처음 조준 — 가운데, 무릎 높이. */
export const AIM3_START: AimLocal3 = { kickNo: -1, aim: { y: 0, z: 0.5 }, armed: false, held: false, latched: null };

const fin = (v: number): number => (Number.isFinite(v) ? v : 0);

/** 한 틱의 조작(화면 기준: x 오른쪽 +, y 아래 +) → 입력. role = 이번 차기에서 내 역할(마지막으로 그린 상태 기준). */
export function pen3Input(local: AimLocal3, h: { x: number; y: number; kick: boolean }, role: 'kick' | 'keep' | null, phase: string): { local: AimLocal3; input: Pen3Input } {
  if (role === 'keep') return { local, input: { x: 0 - fin(h.x), y: 0 - fin(h.y), kick: h.kick, aim: null } };
  if (role !== 'kick' || (phase !== 'ready' && phase !== 'aim')) return { local, input: { x: 0, y: 0, kick: false, aim: null } };
  const aim = {
    y: Math.min(AIM_MAX, Math.max(-AIM_MAX, local.aim.y + fin(h.x) * AIM_SPEED / 60)),
    z: Math.min(AIM_Z_MAX, Math.max(0, local.aim.z - fin(h.y) * AIM_Z_SPEED / 60)),
  };
  if (h.kick) {
    const held = local.held || (local.armed && phase === 'aim');
    return { local: { ...local, aim, held }, input: { x: 0, y: 0, kick: true, aim: null } };
  }
  const latched = local.held ? aim : local.latched;   // 모으던 걸 뗐다 = 슛. 그 조준을 싣는다.
  return { local: { ...local, aim, armed: true, held: false, latched }, input: { x: 0, y: 0, kick: false, aim: latched } };
}
