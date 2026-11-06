// src/lib/jersey.ts — 등번호 고르기의 순수 판정(2026-11-06 사용자: "등번호는 1-99 각자가 선택할 수있게 기능으로 만들되,
// 이미 차지한 번호면 티어가 높으면 뺏을 수 있게"). 설계: docs/superpowers/specs/2026-11-06-jersey-pick-design.md
// 서버 public.pick_jersey 와 **같은 규칙**이어야 한다(서버가 최종 판정, 화면은 미리 칸 모양을 정하는 용도):
//   - 빈 번호는 그대로 갖는다.
//   - 주인 있는 번호는 내 종합 티어가 주인보다 한 칸 이상 높을 때만(S > A > B > C > D). 같은 등급은 못 뺏는다.
//   - 배치 전(티어 없음) 선수는 빈 번호만. 배치 전 선수의 번호는 티어가 있는 누구나 가져간다.
//   - 관리자는 티어와 무관하게 주인 있는 칸을 모두 맞바꿀 수 있다.
import { tierByNum } from './card.ts';
import { TIERS, type Tier } from './tier.ts';
import type { Player } from './types.ts';

export type JerseyCell =
  | { n: number; state: 'mine' }
  | { n: number; state: 'free' }
  | { n: number; state: 'steal'; holder: string; holderTier: Tier | null }     // 가져올 수 있음 — 맞바꿈
  | { n: number; state: 'locked'; holder: string; holderTier: Tier | null };   // 못 가져옴

export const JERSEY_MIN = 1;
export const JERSEY_MAX = 99;

/** 1~99 칸. meNum = 번호를 바꾸는 선수의 고유 번호(num). admin 이면 주인 있는 칸은 전부 'steal'(티어 조건 없음). */
export function jerseyCells(players: Player[], meNum: number, admin = false): JerseyCell[] {
  const tiers = tierByNum(players);
  const myTier = tiers.get(meNum);
  const myIdx = myTier ? TIERS.indexOf(myTier) : -1;
  const holderOf = new Map(players.map((p) => [p.jersey, p]));
  const cells: JerseyCell[] = [];
  for (let n = JERSEY_MIN; n <= JERSEY_MAX; n++) {
    const h = holderOf.get(n);
    if (!h) { cells.push({ n, state: 'free' }); continue; }
    if (h.num === meNum) { cells.push({ n, state: 'mine' }); continue; }
    const holderTier = tiers.get(h.num) ?? null;
    // 인덱스는 S=0 … D=4 — 작을수록 높다. 주인이 티어 없으면 티어 있는 내가 이긴다.
    const can = admin || (myIdx >= 0 && (holderTier == null || myIdx < TIERS.indexOf(holderTier)));
    cells.push({ n, state: can ? 'steal' : 'locked', holder: h.name, holderTier });
  }
  return cells;
}

/** 칸을 눌렀을 때 못 가져오는 이유 — 서버 거절 문구와 같은 말투. */
export function lockedReason(c: Extract<JerseyCell, { state: 'locked' }>, myTier: Tier | null): string {
  if (myTier == null) return `${c.holder} 님이 쓰는 번호입니다 — 배치 전에는 빈 번호만 고를 수 있습니다`;
  return `${c.holder} 님(${c.holderTier})의 번호 — 내 티어(${myTier})가 더 높아야 가져올 수 있습니다`;
}
