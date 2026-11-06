// src/react/game/views/freekick3d/aim3.ts — 3D 프리킥 키커 화면의 조준·감기(2026-11-07 6단계). 순수 — node 테스트가 그대로 부른다.
// 2D 프리킥 aim.ts·3D 승부차기 aim3.ts 와 같은 약속: 조준(옆·높이)과 감기는 이 화면 안에만 있고, 모으던 킥을 떼는 그 틱의 입력에만 실린다.
// 모으기 전 스틱 = 조준 옮기기(좌우 = 옆, 위아래 = 높이), 모으는 동안 스틱 좌우 = 감아차기(−1..1, 떼는 순간 입력의 x).
import type { Aim3, Pen3Input } from '../../../../lib/games/penalty3d.ts';
import { AIM_MAX, AIM_SPEED, AIM_Z_MAX, AIM_Z_SPEED } from '../../../../lib/games/penalty3d.ts';
import { FK3_AIM_SCALE } from '../../../../lib/games/freekick3d.ts';

export type FkLocal3 = { kickNo: number; aim: Aim3; curl: number; armed: boolean; held: boolean; latched: { aim: Aim3; curl: number } | null };
export const FK3_LOCAL: FkLocal3 = { kickNo: -1, aim: { y: 0, z: 0.5 }, curl: 0, armed: false, held: false, latched: null };

const fin = (v: number): number => (Number.isFinite(v) ? v : 0);
/** 조준 옮기는 빠르기 — 입력의 옆 조준은 배율 전 값이라 화면에서 보이는 빠르기(m/s)가 승부차기와 같게 나눠 준다. */
const SIDE_SPEED = AIM_SPEED / FK3_AIM_SCALE;

/** 한 틱의 조작(화면 기준: x 오른쪽 +, y 아래 +) → 입력. kicker = 내가 이번 차기의 키커인가. */
export function fk3Input(local: FkLocal3, h: { x: number; y: number; kick: boolean }, kicker: boolean, phase: string): { local: FkLocal3; input: Pen3Input } {
  if (!kicker || (phase !== 'ready' && phase !== 'aim')) return { local, input: { x: 0, y: 0, kick: false, aim: null } };
  if (h.kick) {
    const held = local.held || (local.armed && phase === 'aim');
    const curl = held ? Math.max(-1, Math.min(1, Math.round(fin(h.x) * 2) / 2)) : local.curl;   // 다섯 칸(입력 x 와 같은 칸)
    return { local: { ...local, held, curl }, input: { x: 0, y: 0, kick: true, aim: null } };
  }
  const aim = local.held ? local.aim : {
    y: Math.min(AIM_MAX, Math.max(-AIM_MAX, local.aim.y + fin(h.x) * SIDE_SPEED / 60)),
    z: Math.min(AIM_Z_MAX, Math.max(0, local.aim.z - fin(h.y) * AIM_Z_SPEED / 60)),
  };
  const latched = local.held ? { aim: local.aim, curl: local.curl } : local.latched;   // 모으던 걸 뗐다 = 슛
  return {
    local: { ...local, aim, armed: true, held: false, latched, curl: local.held ? local.curl : 0 },
    input: { x: latched ? latched.curl : 0, y: 0, kick: false, aim: latched ? latched.aim : null },
  };
}
