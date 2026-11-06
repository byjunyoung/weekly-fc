// src/react/game/views/penalty2d/aim.ts — 키커 화면의 조준(2026-11-07 2단계). 순수 — node 테스트가 그대로 부른다.
// 조준은 이 화면 안에만 있다. 스틱이 조준 표시를 옮기고, 모으던 킥을 떼는 그 틱부터만 입력에 실린다 — 그 전엔 aim: null.
// 상태(모두가 받는 스냅샷)와 보내는 입력 정수(채널의 in·스냅샷의 inputs)에 차기 전 조준이 없으므로 키퍼는 공이 나가기 전엔 모른다.
import type { PenInput } from '../../../../lib/games/penalty2d.ts';
import { AIM_MAX, AIM_SPEED } from '../../../../lib/games/penalty2d.ts';

/** 키커 장면의 조준 상태 — 차기마다 새로. armed·held 는 계산(stepPenalty)의 키커 규칙을 그대로 따라 한다:
 *  이 차기에서 킥을 뗀 적이 있어야(armed) 누름이 세기 모으기(held)로 치고, 모으던 걸 떼는 순간이 슛이다. 순수 함수로 떼어 테스트한다. */
export type AimLocal = { kickNo: number; aim: number; armed: boolean; held: boolean; latched: number | null };
export const AIM_START: AimLocal = { kickNo: -1, aim: 0, armed: false, held: false, latched: null };

/** 한 틱의 조작 → 입력. role = 이번 차기에서 내 역할(마지막으로 그린 상태 기준). 조준은 모으던 킥을 떼는 그 순간부터만 실린다
 *  (그 뒤로는 공이 이미 나가 감출 것이 없다). 그 전엔 aim: null — 상태에도, 보내는 입력에도 조준이 없다. */
export function penInput(local: AimLocal, h: { x: number; kick: boolean }, role: 'kick' | 'keep' | null, phase: string): { local: AimLocal; input: PenInput } {
  if (role === 'keep') return { local, input: { x: h.x, kick: h.kick, aim: null } };
  if (role !== 'kick' || (phase !== 'ready' && phase !== 'aim')) return { local, input: { x: 0, kick: false, aim: null } };
  const aim = Math.min(AIM_MAX, Math.max(-AIM_MAX, local.aim + (Number.isFinite(h.x) ? h.x : 0) * AIM_SPEED / 60));
  if (h.kick) {
    const held = local.held || (local.armed && phase === 'aim');
    return { local: { ...local, aim, held }, input: { x: 0, kick: true, aim: null } };
  }
  const latched = local.held ? aim : local.latched;   // 모으던 걸 뗐다 = 슛. 그 조준을 싣는다.
  return { local: { ...local, aim, armed: true, held: false, latched }, input: { x: 0, kick: false, aim: latched } };
}

