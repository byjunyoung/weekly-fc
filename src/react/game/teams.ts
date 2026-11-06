// src/react/game/teams.ts — 두 편의 색과 짧은 이름(2026-11-06). 방(로비)의 팀 칸과 게임 화면이 같이 쓴다.
// views/match2d/render.ts 에 있던 것을 그대로 옮겼다(2026-11-07) — 팀 칸은 어느 게임의 방에나 있어서.
import { VESTS } from '../../lib/teams.ts';

/** 팀 색 — 0 편 주황조끼, 1 편 노조끼(VESTS 에서). */
const vest = (key: string): { color: string; short: string } => {
  const v = VESTS.find((x) => x.key === key);
  return { color: v?.color ?? '#999', short: key === 'orange' ? '주황' : '흰' };
};
export const TEAM = [vest('orange'), vest('none')] as const;
