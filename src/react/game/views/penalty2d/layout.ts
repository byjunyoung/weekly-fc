// src/react/game/views/penalty2d/layout.ts — 승부차기 화면의 순수 계산(2026-11-07 2단계). DOM·캔버스 없음 — node 테스트가 그대로 부른다.
// 위에서 본 골문 앞. 골문은 늘 화면 위, 키커는 아래 — 가로·세로 화면 모두 돌리지 않는다(좌우 = 화면 좌우라 스틱이 그대로 맞는다).
import { SPOT_Y } from '../../../../lib/games/penalty2d.ts';

/** 그리는 논리 범위 — 좌우 ±WX, 위(골 뒤) Y0 ~ 아래(키커 뒤) Y1. */
export const WX = 250, Y0 = -80, Y1 = SPOT_Y + 120;
/** 위 점수판(세 줄)·아래 안내(세기 막대 + 한 줄)가 차지하는 높이(CSS px). */
export const HUD_TOP = 88, HUD_BOTTOM = 64;

export type PenLayout = { vw: number; vh: number; scale: number; ox: number; oy: number; top: number; bottom: number };

/** 뷰포트·안전 영역 → 배율과 원점. 논리 (x, y) → 화면 (ox + x·scale, oy + (y − Y0)·scale). */
export function penLayout(vw: number, vh: number, ins: { top: number; bottom: number; left: number; right: number } = { top: 0, bottom: 0, left: 0, right: 0 }): PenLayout {
  const margin = Math.max(8, ins.left, ins.right);
  const top = ins.top + HUD_TOP, bottom = ins.bottom + HUD_BOTTOM;
  const aw = Math.max(1, vw - margin * 2), ah = Math.max(1, vh - top - bottom - 8);
  const scale = Math.min(aw / (WX * 2), ah / (Y1 - Y0));
  const used = (Y1 - Y0) * scale;
  return { vw, vh, scale, ox: vw / 2, oy: top + (ah - used) / 2, top, bottom };
}

export const toScreen = (l: PenLayout, x: number, y: number): { x: number; y: number } => ({ x: l.ox + x * l.scale, y: l.oy + (y - Y0) * l.scale });
