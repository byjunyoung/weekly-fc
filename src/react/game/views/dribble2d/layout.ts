// src/react/game/views/dribble2d/layout.ts — 드리블 레인 화면의 순수 계산(2026-11-07 3단계). DOM 없음 — node 테스트가 부른다.
// 경기 화면의 View(세로면 세워 그리기·따라가는 카메라 aimCamera·toScreen)를 그대로 쓴다 — 경기장 대신 레인 하나(±LX × ±LY)를 맞출 뿐.
// 레인 폭이 화면의 짧은 변에 맞게 키우고, 길이가 안 들어가면 내 선수를 따라간다. 몸 반지름이 화면에서 MIN_R 보다 작아지게 줄이지는 않는다.
import { LX, LY } from '../../../../lib/games/dribble2d.ts';
import { PITCH } from '../../../../lib/game/sim.ts';
import type { View } from '../match2d/view.ts';

/** 위 띠(코스·시계·문)와 아래 순위 줄이 차지하는 높이(CSS px). */
export const DR_TOP = 64, DR_BOTTOM = 8;
/** 화면에서 몸 반지름이 이보다 작아지면 다 보여 주지 않고 따라간다(폰 세로). */
export const MIN_R = 15;
const PAD = 24;

export function laneView(vw: number, vh: number, ins: { top: number; bottom: number; left: number; right: number } = { top: 0, bottom: 0, left: 0, right: 0 }): View {
  const margin = Math.max(8, ins.left, ins.right), top = ins.top + DR_TOP, bottom = ins.bottom + DR_BOTTOM;
  const ew = LX * 2 + PAD * 2, eh = LY * 2 + PAD * 2;
  const portrait = vh > vw;
  const aw = Math.max(1, vw - margin * 2), ah = Math.max(1, vh - margin * 2 - top - bottom);
  const needW = portrait ? eh : ew, needH = portrait ? ew : eh;
  const fit = Math.min(aw / needW, ah / needH);
  const cross = portrait ? aw / eh : ah / eh;
  const follow = PITCH.playerR * fit < MIN_R;
  const scale = follow ? Math.min(cross, MIN_R / PITCH.playerR * 1.15) : fit;
  return { portrait, scale, ox: vw / 2, oy: margin + top + ah / 2, vw, vh, aw, ah, cx: 0, cy: 0, follow, ew, eh };
}
