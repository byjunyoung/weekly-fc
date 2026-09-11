// src/components/condition.ts — 컨디션 배지 마크업. src/lib/stats.ts의 condition()은 판정만 하고
// 마크업은 만들지 않으므로(순수 함수 원칙), 화면에 쓰는 조립은 여기서 한다.
// 문구는 중립으로 고정한다 — 벌점이 아니라 "요즘 자주 나오는지"의 신호다(스펙 6절).
import { esc } from '../lib/html.ts';
import { condition, type ConditionLevel } from '../lib/stats.ts';
import type { Match } from '../lib/types.ts';

const GLYPH: Record<ConditionLevel, string> = { up: '▲', mid: '▬', down: '▼', none: '–' };
const LABEL: Record<ConditionLevel, string> = { up: '꾸준히 나옴', mid: '보통', down: '최근 안 보임', none: '판단 보류' };

export function conditionBadge(name: string, matches: Match[]): string {
  const c = condition(name, matches);
  const detail = c.of ? ` · 최근 ${c.of}경기 중 ${c.attended}회` : ' · 매치 기록 없음';
  return `<span class="cond cond-${c.level}" title="${esc(LABEL[c.level] + detail)}">${GLYPH[c.level]}</span>`;
}
