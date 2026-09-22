// src/components/pitch-view.ts — 피치 그림 SVG와 선수 카드 HTML. 문자열만 만든다(DOM 없음).
// 캔버스 한 장에 그리던 전술판은 크기 계산이 어긋나면 화면 전체가 깨졌다 — 그림은 SVG, 카드는
// HTML 로 올려 브라우저가 크기를 맡게 한다(2026-09-13 스펙 §4.4).
//
// 2026-09-22: 선을 stroke 에서 **채운 사각형**으로 바꿨다(도트 게임 톤). 뷰박스 단위가 미터이고
// CSS `aspect-ratio` 가 같은 비율이라 가로·세로 배율이 언제나 같아서(440/68 = 679/105) 사각형이
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
 *  그래야 도트 하나가 화면 픽셀 하나로 정확히 떨어진다(가로는 24px 로 따라온다). */
const SPRITE_H = 32;

const MARK = 'rgba(255, 255, 255, .30)';
const GOAL = 'rgba(255, 255, 255, .5)';
/** 선 두께(미터). 440px 피치에서 약 5.8px — 도트로 읽히는 최소 굵기. */
const T = 0.9;

const rect = (x: number, y: number, w: number, h: number, fill = MARK): string =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`;

/** 테두리만 있는 사각형 — 네 변을 각각 채운 사각형으로 낸다(stroke 안 씀). */
const frame = (x: number, y: number, w: number, h: number): string =>
  rect(x, y, w, T) + rect(x, y + h - T, w, T) + rect(x, y, T, h) + rect(x + w - T, y, T, h);

/** 블록 원 — 격자 칸 중심이 반지름 띠 안에 들면 그 칸을 칠한다. 각도를 훑어 중복을 지우는
 *  방식은 칸이 빠져 들쭉날쭉해지므로 칸을 훑는다(결정적이고 좌우·상하 대칭이 보장된다). */
function blockRing(cx: number, cy: number, r: number, step: number): string {
  const out: string[] = [];
  const n = Math.ceil((r + step) / step);
  for (let gy = -n; gy <= n; gy++) {
    for (let gx = -n; gx <= n; gx++) {
      const x = gx * step, y = gy * step;
      const d = Math.hypot(x, y);
      if (d < r - step / 2 || d > r + step / 2) continue;
      out.push(rect(Number((cx + x - step / 2).toFixed(2)), Number((cy + y - step / 2).toFixed(2)), step, step));
    }
  }
  return out.join('');
}

/** 깎아 놓은 잔디 줄무늬 + 도트 texture. 줄 수는 짝수여야 위아래가 대칭이다. */
function turf(w: number, h: number, bands: number): string {
  const bh = h / bands;
  const stripes = Array.from({ length: bands }, (_, i) =>
    rect(0, Number((i * bh).toFixed(2)), w, Number(bh.toFixed(2)), i % 2 ? '#173a23' : '#0f2617')).join('');
  // 잔디 알갱이 — 4m 타일에 점 두 개. 패턴 id 는 한 화면에 피치가 하나라 고정값으로 둔다
  // (아바타에서 uid 를 없앤 것과 같은 이유 — 출력이 결정적이어야 한다).
  const grain = `<defs><pattern id="wfc-turf" width="4" height="4" patternUnits="userSpaceOnUse">`
    + rect(0, 0, 1, 1, 'rgba(255, 255, 255, .035)') + rect(2, 2, 1, 1, 'rgba(255, 255, 255, .035)')
    + `</pattern></defs>`;
  return grain + stripes + rect(0, 0, w, h, 'url(#wfc-turf)');
}

export function pitchLines(kind: PitchKind): string {
  const { w, h } = PITCH_DIM[kind];
  const open = `<svg class="bd-lines" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" shape-rendering="crispEdges" aria-hidden="true">`;
  if (kind === 'soccer') {
    return open + turf(w, h, 10)
      + frame(2, 2, 64, 101)
      + rect(2, 52.5 - T / 2, 64, T)                       // 하프라인
      + blockRing(34, 52.5, 9.15, 1.5)                      // 센터서클
      + rect(33.25, 51.75, 1.5, 1.5)                        // 센터 스폿
      + frame(13.2, 2, 41.6, 16.5) + frame(24.8, 2, 18.4, 5.5)
      + frame(13.2, 86.5, 41.6, 16.5) + frame(24.8, 97.5, 18.4, 5.5)
      + rect(33.25, 10.25, 1.5, 1.5) + rect(33.25, 93.25, 1.5, 1.5) // 페널티 스폿
      + rect(30, 0, 8, 2, GOAL) + rect(30, 103, 8, 2, GOAL)          // 골대
      + `</svg>`;
  }
  // 풋살 페널티 구역은 골대 기둥에서 뻗은 6m 사분원이다 — 블록 원의 위아래 절반만 써서 흉내낸다.
  return open + turf(w, h, 8)
    + frame(1, 1, 18, 38)
    + rect(1, 20 - T / 2, 18, T)
    + blockRing(10, 20, 3, 1)
    + rect(9.5, 19.5, 1, 1)
    + blockRing(10, 1, 6, 1) + blockRing(10, 39, 6, 1)
    + rect(7, 0, 6, 1, GOAL) + rect(7, 39, 6, 1, GOAL)
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
