// src/react/game/views/kit3d/cams.ts — 3D 미니게임 카메라(2026-11-07 게임 묶음 5단계). 순수 — node 테스트가 그대로 부른다(화면 쪽 계산이라 삼각함수를 쓴다).
// 골대 하나를 보는 게임(승부차기·프리킥)이 같이 쓴다. 좌표는 경기 좌표(x 골대 쪽, y 옆, z 높이), 골대는 x = +HW.
import { PITCH3D } from '../../../../lib/game3d/sim.ts';
import type { CamGoal } from '../match3d/view3d.ts';

/** 가로 시야각(도)을 화면 비율에 맞춘 세로 시야각(three 카메라는 세로 기준). 세로 화면에서도 골문 폭이 다 들어오게. */
export function vFov(hfovDeg: number, aspect: number, lo = 30, hi = 95): number {
  const v = (2 * Math.atan(Math.tan((hfovDeg * Math.PI) / 360) / Math.max(0.3, aspect)) * 180) / Math.PI;
  return Math.max(lo, Math.min(hi, v));
}

/** 키커 뒤에서 골대를 보는 카메라 — 공 뒤 back m, 높이 up m, 골문 가운데 조금 위를 본다. 화면 오른쪽 = 경기 +y(조준 오른쪽). */
export function kickerCam(ballX: number, aspect: number, back = 6.2, up = 3.0): CamGoal {
  return { px: ballX - back, py: 0, pz: up, lx: PITCH3D.HW, ly: 0, lz: 0.9, fov: vFov(40, aspect) };
}

/** 골대 뒤에서 경기장 쪽(키커)을 보는 카메라 — 키퍼 차례. 그물 뒤 back m, 높이 up m. 화면 오른쪽 = 경기 −y
 *  (그래서 키퍼 조작은 화면 기준 그대로 쓰려면 좌우를 뒤집어 계산에 넘긴다 — 보이는 대로 움직이게). */
export function keeperCam(spotX: number, aspect: number, back = 3.4, up = 2.7): CamGoal {
  return { px: PITCH3D.HW + PITCH3D.goalDepth + back, py: 0, pz: up, lx: spotX, ly: 0, lz: 0.5, fov: vFov(58, aspect) };
}
