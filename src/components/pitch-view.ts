// src/components/pitch-view.ts — 피치 그림 SVG와 선수 카드 HTML. 문자열만 만든다(DOM 없음).
// 캔버스 한 장에 그리던 전술판은 크기 계산이 어긋나면 화면 전체가 깨졌다 — 그림은 SVG, 카드는
// HTML 로 올려 브라우저가 크기를 맡게 한다(2026-09-13 스펙 §4.4).
//
// 2026-09-22: 선을 stroke 에서 **채운 사각형**으로 바꿨다(도트 게임 톤). 뷰박스 단위가 미터이고
// CSS `aspect-ratio` 가 같은 비율이라 가로·세로 배율이 언제나 같아서(폭 440px 이면 높이가
// 440×105/68 = 679.41px 로 정해진다) 사각형이
// 정사각 픽셀로 떨어진다 — `preserveAspectRatio="none"` 이어도 늘어나지 않는다.
import { esc } from '../lib/html.ts';
import { grade, ovr } from '../lib/stats.ts';
import { slotsOf, positionOf, type LineupState } from '../lib/lineup.ts';
import { avatarSvg } from './avatar.ts';
import { avatarSpecFor } from '../lib/avatar.ts';
import type { PitchKind } from '../lib/formation.ts';
import type { Player } from '../lib/types.ts';

/** 경기장 비율(미터). 그림·공유 이미지가 같은 단위를 쓴다. */
export const PITCH_DIM: Record<PitchKind, { w: number; h: number }> = { futsal: { w: 20, h: 40 }, soccer: { w: 68, h: 105 } };

/** 피치 위 카드 안에 들어가는 아바타 높이(px). 격자가 24×32 라 **32의 배수**로 둔다 —
 *  그래야 도트 하나가 화면 픽셀 하나로 정확히 떨어진다(가로는 24px 로 따라온다).
 *  넓은 화면(≥1120px)에서는 tokens.css 가 CSS 로 정확히 2배(48×64)로 덮어쓴다. */
const SPRITE_H = 32;

const MARK = 'rgba(255, 255, 255, .30)';
const GOAL = 'rgba(255, 255, 255, .5)';
/** 선 두께(미터). 440px 피치에서 약 5.8px — 도트로 읽히는 최소 굵기. */
const T = 0.9;

/** 피치 그림 한 조각 — 미터 단위 사각형. SVG(이 파일)와 캔버스(share-image.ts)가 같이 쓴다. */
export type PitchRect = { x: number; y: number; w: number; h: number; fill: string };

const r = (x: number, y: number, w: number, h: number, fill = MARK): PitchRect => ({ x, y, w, h, fill });

/** 테두리 사각형 — 세로 변을 T 만큼 안으로 넣어 **모서리가 두 번 칠해지지 않게** 한다.
 *  마킹 색이 반투명(α .30)이라 겹치면 그 자리만 밝아진다(2026-09-22 리뷰가 실측으로 잡음).
 *  `skip` 으로 한 변을 뺄 수 있다 — 페널티 박스·골 에어리어의 골라인 쪽 변은 바깥 테두리와
 *  같은 자리라, 빼지 않으면 골라인이 구간마다 2~3겹으로 밝기가 갈린다. */
const frame = (x: number, y: number, w: number, h: number, skip?: 'top' | 'bottom'): PitchRect[] => [
  ...(skip === 'top' ? [] : [r(x, y, w, T)]),
  ...(skip === 'bottom' ? [] : [r(x, y + h - T, w, T)]),
  r(x, y + T, T, h - 2 * T), r(x + w - T, y + T, T, h - 2 * T),
];

/** 블록 원 — 격자 칸 중심이 반지름 띠 안에 들면 그 칸을 칠한다. 각도를 훑어 중복을 지우는
 *  방식은 칸이 빠져 들쭉날쭉해지므로 칸을 훑는다(결정적이고 좌우·상하 대칭이 보장된다). */
function blockRing(cx: number, cy: number, radius: number, step: number, clip?: { minY?: number; maxY?: number }): PitchRect[] {
  const out: PitchRect[] = [];
  const n = Math.ceil((radius + step) / step);
  for (let gy = -n; gy <= n; gy++) {
    for (let gx = -n; gx <= n; gx++) {
      const x = gx * step, y = gy * step;
      const d = Math.hypot(x, y);
      if (d < radius - step / 2 || d > radius + step / 2) continue;
      // 칸의 위·아래 끝이 clip 범위를 벗어나면 버린다 — 풋살 사분원은 골라인 밖이 잘려야 한다.
      const left = cx + x - step / 2, top = cy + y - step / 2;
      if (clip?.minY != null && top < clip.minY - 1e-9) continue;
      if (clip?.maxY != null && top + step > clip.maxY + 1e-9) continue;
      out.push(r(Number(left.toFixed(2)), Number(top.toFixed(2)), step, step));
    }
  }
  return out;
}

/** 깎아 놓은 잔디 줄무늬. 줄 수를 짝수로 두는 건 **하프라인이 줄 경계에 정확히 떨어지게**
 *  하려는 것이다(축구 105/10 → 5줄째가 52.5, 풋살 40/8 → 4줄째가 20).
 *  위아래 미러 대칭은 홀수여야 성립하므로 첫 줄과 마지막 줄 색은 다르다 — 의도된 상태다. */
const stripes = (w: number, h: number, bands: number): PitchRect[] =>
  Array.from({ length: bands }, (_, i) =>
    r(0, Number(((i * h) / bands).toFixed(2)), w, Number((h / bands).toFixed(2)), i % 2 ? '#173a23' : '#0f2617'));

/** 잔디 알갱이 — 타일에 점 두 개. 타일 크기는 **경기장 폭에 비례**해야 한다: 절대 미터로 두면
 *  좁은 풋살 코트(20m)에서는 다섯 칸밖에 안 들어가 잔디가 아니라 큰 체크무늬로 보인다.
 *  폭을 17로 나눠 축구(68m)는 예전과 같은 4m 타일이 되고, 풋살은 그만큼 잘게 깔린다.
 *  SVG 는 <pattern> 으로, 캔버스는 타일을 직접 돈다. */
export function turfGrain(kind: PitchKind): { tile: number; size: number; dots: [number, number][]; fill: string } {
  const tile = Number((PITCH_DIM[kind].w / 17).toFixed(2));
  const size = Number((tile / 4).toFixed(2));
  return { tile, size, dots: [[0, 0], [Number((tile / 2).toFixed(2)), Number((tile / 2).toFixed(2))]], fill: 'rgba(255, 255, 255, .035)' };
}

/** 깎아 놓은 잔디 줄무늬(바닥). */
export function turfRects(kind: PitchKind): PitchRect[] {
  const { w, h } = PITCH_DIM[kind];
  return stripes(w, h, kind === 'soccer' ? 10 : 8);
}

/** 흰 선·스폿·골대(잔디 위에 올라가는 것들). */
export function markRects(kind: PitchKind): PitchRect[] {
  if (kind === 'soccer') {
    return [
      ...frame(2, 2, 64, 101),
      r(2, 52.5 - T / 2, 64, T),                            // 하프라인
      ...blockRing(34, 52.5, 9.15, 1.5),                    // 센터서클
      r(33.25, 51.75, 1.5, 1.5),                            // 센터 스폿
      ...frame(13.2, 2, 41.6, 16.5, 'top'), ...frame(24.8, 2, 18.4, 5.5, 'top'),
      ...frame(13.2, 86.5, 41.6, 16.5, 'bottom'), ...frame(24.8, 97.5, 18.4, 5.5, 'bottom'),
      r(33.25, 12.25, 1.5, 1.5), r(33.25, 91.25, 1.5, 1.5), // 페널티 스폿 — 골라인(y=2·103)에서 11m
      r(30, 0, 8, 2, GOAL), r(30, 103, 8, 2, GOAL),         // 골대
    ];
  }
  // 풋살 페널티 구역은 골대 기둥에서 뻗은 6m 사분원이다 — 블록 원의 골라인 안쪽 절반만 쓴다.
  return [
    ...frame(1, 1, 18, 38),
    r(1, 20 - T / 2, 18, T),
    ...blockRing(10, 20, 3, 1),
    r(9.5, 19.5, 1, 1),
    ...blockRing(10, 1, 6, 1, { minY: 1 }), ...blockRing(10, 39, 6, 1, { maxY: 39 }),
    r(8.5, 0, 3, 1, GOAL), r(8.5, 39, 3, 1, GOAL),  // 풋살 골대는 3m
  ];
}

const svgRect = (t: PitchRect): string => `<rect x="${t.x}" y="${t.y}" width="${t.w}" height="${t.h}" fill="${t.fill}"/>`;

export function pitchLines(kind: PitchKind): string {
  const { w, h } = PITCH_DIM[kind];
  const g = turfGrain(kind);
  // 패턴 id 는 한 화면에 피치가 하나라 고정값으로 둔다(아바타에서 uid 를 없앤 것과 같은 이유 —
  // 출력이 결정적이어야 한다).
  const grain = `<defs><pattern id="wfc-turf" width="${g.tile}" height="${g.tile}" patternUnits="userSpaceOnUse">`
    + g.dots.map(([dx, dy]) => svgRect(r(dx, dy, g.size, g.size, g.fill))).join('')
    + `</pattern></defs>`;
  return `<svg class="bd-lines" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" shape-rendering="crispEdges" aria-hidden="true">`
    + grain
    + turfRects(kind).map(svgRect).join('')
    + svgRect(r(0, 0, w, h, 'url(#wfc-turf)'))
    + markRects(kind).map(svgRect).join('')
    + `</svg>`;
}

export function pitchHtml(s: LineupState, players: Player[], selected: number | null): string {
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
    // 카드 한 장 = 윗줄(OVR·자리 라벨) · 아바타 · 아랫줄(이름·선수 포지션). 자리 라벨과 포지션이
    // 다를 수 있어서(is-oop) 둘을 같이 보여준다 — 그게 이 카드의 정보값이다. 이름·포지션을 한 줄에
    // 붙인 건 좁은 화면에서 피치가 낮아질 때(390px 에서 553px) 카드가 GK 자리에서 잘리지 않게
    // 높이를 73px 로 눌러 두려는 것이다(2026-09-22 실측).
    const sprite = avatarSvg(avatarSpecFor(p.num, p.avatar), SPRITE_H, p.num, true);
    return `<button type="button" class="bd-slot bd-card pcard-${grade(o)}${sel}${oop}" style="${at}" data-slot="${i}" aria-label="${label} ${esc(p.name)}">`
      + `<span class="bd-top"><b class="bd-ovr">${o || '–'}</b><span class="bd-slotlabel">${label}</span></span>`
      + `<span class="bd-sprite" aria-hidden="true">${sprite}</span>`
      + `<span class="bd-foot"><span class="bd-name">${esc(p.name)}</span><span class="bd-pos">${esc(p.pos || '–')}</span></span></button>`;
  }).join('');
  const { w, h } = PITCH_DIM[s.pitch];
  return `<div class="bd-pitch bd-${s.pitch}" style="aspect-ratio:${w} / ${h}" data-pitch>${pitchLines(s.pitch)}${cards}</div>`;
}
