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

/** 공 뒤에서 골대를 보는 카메라 — 골대 가운데에서 공을 지나는 줄 위로 back m 물러나, 높이 up m(3D 프리킥 — 자리가 옆으로 비껴 있어도 공 뒤에서). */
export function behindBallCam(bx: number, by: number, aspect: number, back = 6, up = 3.2): CamGoal {
  const dx = bx - PITCH3D.HW, dy = by, l = Math.sqrt(dx * dx + dy * dy) || 1;
  return { px: bx + (dx / l) * back, py: by + (dy / l) * back, pz: up, lx: PITCH3D.HW, ly: 0, lz: 0.8, fov: vFov(48, aspect) };
}

/** 선수 뒤를 따라가는 카메라(3D 드리블 — "뒤에서 따라가는 화면"). 보는 쪽(fx·fy, 화면 쪽에서 부드럽게 돌린 단위 벡터) 뒤 back m·위 up m 에서
 *  앞 ahead m 을 본다. 경기의 '뒤에서'(늘 +x 쪽을 본다)와 달리 코스가 돌아 나와도 진행 방향을 본다. */
export function followCam(px: number, py: number, fx: number, fy: number, aspect: number, back = 4.6, up = 2.9, ahead = 5): CamGoal {
  return { px: px - fx * back, py: py - fy * back, pz: up, lx: px + fx * ahead, ly: py + fy * ahead, lz: 0.2, fov: vFov(70, aspect, 45, 90) };
}
