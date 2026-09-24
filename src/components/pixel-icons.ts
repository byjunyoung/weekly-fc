// src/components/pixel-icons.ts — 카드에 박는 작은 도트 아이콘(2026-09-25): 태극기, 축구화.
// 아바타(avatar.ts)와 같은 방식 — 문자 격자 한 줄이 한 행, '.' 은 투명, 나머지는 팔레트 키.
// 가로 런을 <rect> 하나로 합쳐 낸다. 크기는 격자의 정수배로만 쓴다(안 그러면 도트가 번진다).
import type { FootMode } from '../lib/card.ts';

/** 격자 → rect 문자열. 격자 밖 문자·팔레트에 없는 키는 건너뛴다(`fill="undefined"` 가 새지 않게). */
export function gridRects(map: string[], palette: Record<string, string>): string {
  const out: string[] = [];
  map.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const c = row[x];
      if (c === '.' || !(c in palette)) { x += 1; continue; }
      let w = 1;
      while (x + w < row.length && row[x + w] === c) w += 1;
      out.push(`<rect x="${x}" y="${y}" width="${w}" height="1" fill="${palette[c]}"/>`);
      x += w;
    }
  });
  return out.join('');
}

function svg(map: string[], palette: Record<string, string>, w: number, h: number, scale: number, label: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w * scale}" height="${h * scale}" shape-rendering="crispEdges" role="img" aria-label="${label}">${gridRects(map, palette)}</svg>`;
}

// ── 태극기 18×12 ── 흰 바탕, 태극(위 빨강·아래 파랑, 가운데 줄에서 서로 파고듦), 네 귀퉁이 괘는 짧은 막대 둘로.
export const FLAG_KR_W = 18;
export const FLAG_KR_H = 12;
const FLAG_KR: string[] = [
  'WWWWWWWWWWWWWWWWWW',
  'WWWWWWWWWWWWWWWWWW',
  'WKKKWWWWWWWWWK.KWW',
  'WWWWWWWRRRRWWWWWWW',
  'WKKKWWRRRRRRWK.KWW',
  'WWWWWWRRRRBBWWWWWW',
  'WWWWWWRRBBBBWWWWWW',
  'WK.KWWBBBBBBWKKKWW',
  'WWWWWWWBBBBWWWWWWW',
  'WK.KWWWWWWWWWKKKWW',
  'WWWWWWWWWWWWWWWWWW',
  'WWWWWWWWWWWWWWWWWW',
];
const FLAG_KR_PALETTE = { W: '#f4f4f4', R: '#cd2e3a', B: '#0f4fa8', K: '#111111' };
/** 태극기. `scale` 은 한 칸의 픽셀 수(1·2·3…). */
export const flagKrSvg = (scale = 1): string => svg(FLAG_KR, FLAG_KR_PALETTE, FLAG_KR_W, FLAG_KR_H, scale, '대한민국');

// ── 축구화 둘 (각 7×5, 사이 2칸 = 16×5) ── 왼쪽이 왼발. 주발은 밝게, 아닌 쪽은 흐리게.
export const FEET_W = 16;
export const FEET_H = 5;
const BOOT_L = ['.LLLL..', '.LLLLL.', 'LLLLLLL', 'LLLLLLL', 'lllllll'];
const BOOT_R = ['..RRRR.', '.RRRRR.', 'RRRRRRR', 'RRRRRRR', 'rrrrrrr'];
const FEET: string[] = BOOT_L.map((l, i) => `${l}..${BOOT_R[i]}`);
const ON = '#f4f4f4', ON_SOLE = '#111111', OFF = '#4a4f57', OFF_SOLE = '#2b2e33';
export function feetSvg(mode: FootMode, scale = 1): string {
  const left = mode === 'left' || mode === 'both';
  const right = mode === 'right' || mode === 'both';
  const palette = { L: left ? ON : OFF, l: left ? ON_SOLE : OFF_SOLE, R: right ? ON : OFF, r: right ? ON_SOLE : OFF_SOLE };
  const label = mode === 'both' ? '양발' : mode === 'left' ? '왼발' : mode === 'right' ? '오른발' : '주발 미정';
  return svg(FEET, palette, FEET_W, FEET_H, scale, label);
}
