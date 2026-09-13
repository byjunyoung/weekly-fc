// src/components/pitch-view.ts — 피치 선 SVG와 선수 카드 HTML. 문자열만 만든다(DOM 없음).
// 캔버스 한 장에 그리던 전술판은 크기 계산이 어긋나면 화면 전체가 깨졌다 — 선은 SVG, 카드는
// HTML 로 올려 브라우저가 크기를 맡게 한다(2026-09-13 스펙 §4.4).
import { esc } from '../lib/html.ts';
import { grade, ovr } from '../lib/stats.ts';
import { slotsOf, positionOf, type LineupState } from '../lib/lineup.ts';
import type { PitchKind } from '../lib/formation.ts';
import type { Player } from '../lib/types.ts';

/** 경기장 비율(미터). 선·그림·공유 이미지가 같은 단위를 쓴다. */
export const PITCH_DIM: Record<PitchKind, { w: number; h: number }> = { futsal: { w: 20, h: 40 }, soccer: { w: 68, h: 105 } };

export function pitchLines(kind: PitchKind): string {
  if (kind === 'soccer') {
    return `<svg class="bd-lines" viewBox="0 0 68 105" preserveAspectRatio="none" aria-hidden="true">`
      + `<rect x="2" y="2" width="64" height="101"/><line x1="2" y1="52.5" x2="66" y2="52.5"/><circle cx="34" cy="52.5" r="9.15"/>`
      + `<rect x="13.2" y="2" width="41.6" height="16.5"/><rect x="24.8" y="2" width="18.4" height="5.5"/>`
      + `<rect x="13.2" y="86.5" width="41.6" height="16.5"/><rect x="24.8" y="97.5" width="18.4" height="5.5"/></svg>`;
  }
  // 풋살 페널티 구역은 골대 양쪽 기둥에서 6m 사분원을 이은 모양 — 곡선 하나로 줄여 그린다.
  return `<svg class="bd-lines" viewBox="0 0 20 40" preserveAspectRatio="none" aria-hidden="true">`
    + `<rect x="1" y="1" width="18" height="38"/><line x1="1" y1="20" x2="19" y2="20"/><circle cx="10" cy="20" r="3"/>`
    + `<path d="M4 1 C4 8 16 8 16 1"/><path d="M4 39 C4 32 16 32 16 39"/></svg>`;
}

export function pitchHtml(s: LineupState, players: Player[], selected: number | null, drawInner = ''): string {
  const byNum = new Map(players.map((p) => [p.num, p]));
  const cards = slotsOf(s).map((slot, i) => {
    const [x, y] = positionOf(s, i);
    const at = `left:${(x * 100).toFixed(1)}%;top:${(y * 100).toFixed(1)}%`;
    const num = s.slots[i];
    const p = num != null ? byNum.get(num) : undefined;
    const sel = selected === i ? ' is-selected' : '';
    const label = esc(slot.label);
    if (!p) return `<button type="button" class="bd-slot bd-empty${sel}" style="${at}" data-slot="${i}" aria-label="${label} 빈 자리">${label}</button>`;
    const o = ovr(p);
    const oop = p.pos && p.pos !== slot.group ? ' is-oop' : '';
    return `<button type="button" class="bd-slot bd-card pcard-${grade(o)}${sel}${oop}" style="${at}" data-slot="${i}" aria-label="${label} ${esc(p.name)}">`
      + `<b class="bd-ovr">${o || '–'}</b><span class="bd-name">${esc(p.name)}</span><span class="bd-pos">${label}</span></button>`;
  }).join('');
  const { w, h } = PITCH_DIM[s.pitch];
  return `<div class="bd-pitch bd-${s.pitch}" style="aspect-ratio:${w} / ${h}" data-pitch>${pitchLines(s.pitch)}`
    + `<svg class="bd-draw" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true" data-draw>${drawInner}</svg>${cards}</div>`;
}
