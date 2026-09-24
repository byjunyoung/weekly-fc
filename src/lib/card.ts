// src/lib/card.ts — 피파식 선수 카드가 그릴 값(2026-09-25). 순수 로직만, 단위 테스트 대상.
// 설계: docs/superpowers/specs/2026-09-25-fifa-card-design.md
//
// 카드는 세 자리(홈 라커룸·명단 아바타 보기·선수 페이지)에서 같은 모양으로 쓰이므로,
// "무엇을 보여 주나"는 여기 한 곳에서 정하고 화면(PlayerCard.tsx)은 그리기만 한다.
import { band, ovr, STAT_CUTS, STAT_KO } from './stats.ts';
import { tierRows, type Tier } from './tier.ts';
import type { Player, StatKey } from './types.ts';

/** 종합 순위로 매긴 티어(순위 비율제, 동점은 위 칸). 숫자가 없는 선수는 빠진다. */
export function tierByNum(players: Player[]): Map<number, Tier> {
  const m = new Map<number, Tier>();
  for (const row of tierRows(players, 'ovr')) for (const p of row.players) m.set(p.num, row.tier);
  return m;
}

export type FootMode = 'right' | 'left' | 'both' | 'none';
/** 주발 문자열 → 카드 표시 모드. 편집 폼은 세 값만 주지만 옛 자유 입력("오른발잡이")도 받아 준다. */
export function footMode(foot: string): FootMode {
  const f = (foot ?? '').replace(/\s/g, '');
  if (f.includes('양발')) return 'both';
  if (f.includes('왼')) return 'left';
  if (f.includes('오른')) return 'right';
  return 'none';
}
export const FOOT_OPTIONS = ['오른발', '왼발', '양발'] as const;
export const FOOT_LABEL: Record<FootMode, string> = { right: '오른발', left: '왼발', both: '양발', none: '주발 미정' };

/** 여섯 칸 순서 — 본가 카드처럼 2열 읽기 순: 왼쪽 페이스·슈팅·패스, 오른쪽 드리블·수비·피지컬. */
export const CARD_STAT_ORDER: StatKey[] = ['pace', 'dribble', 'shoot', 'defend', 'pass', 'stamina'];

export type CardStat = { key: StatKey; label: string; value: number; band: 'a' | 'b' | 'c' | 'd' };
export type CardModel = {
  num: number; name: string; ovr: number; tier: Tier | null; pos: string; foot: FootMode; stats: CardStat[];
};

export function cardModel(p: Player, tier: Tier | null | undefined): CardModel {
  return {
    num: p.num, name: p.name, ovr: ovr(p), tier: tier ?? null, pos: p.pos || '', foot: footMode(p.foot),
    stats: CARD_STAT_ORDER.map((key) => ({ key, label: STAT_KO[key], value: p[key], band: band(p[key], STAT_CUTS) })),
  };
}

export const GUESTBOOK_MAX = 140;
/** 방명록 글 검사 — 서버(private.clean_guestbook_text)와 같은 규칙. 문제 없으면 null, 있으면 문구. */
export function guestbookProblem(text: string): string | null {
  const v = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!v) return '내용을 적어 주세요';
  if (v.length > GUESTBOOK_MAX) return `${GUESTBOOK_MAX}자까지만 남길 수 있습니다`;
  return null;
}
