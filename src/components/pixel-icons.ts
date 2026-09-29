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
  'WKKKWWWWWWWWWKWKWW',
  'WWWWWWWRRRRWWWWWWW',
  'WKKKWWRRRRRRWKWKWW',
  'WWWWWWRRRRBBWWWWWW',
  'WWWWWWRRBBBBWWWWWW',
  'WKWKWWBBBBBBWKKKWW',
  'WWWWWWWBBBBWWWWWWW',
  'WKWKWWWWWWWWWKKKWW',
  'WWWWWWWWWWWWWWWWWW',
  'WWWWWWWWWWWWWWWWWW',
];
const FLAG_KR_PALETTE = { W: '#f4f4f4', R: '#cd2e3a', B: '#0f4fa8', K: '#111111' };
/** 캔버스(공유 이미지)가 같은 그림을 찍을 때 쓰는 격자 — drawAvatar 가 받는 모양과 같다. */
export const flagKrPixels = (): { map: string[]; palette: Record<string, string>; w: number; h: number } =>
  ({ map: FLAG_KR, palette: FLAG_KR_PALETTE, w: FLAG_KR_W, h: FLAG_KR_H });
/** 태극기. `scale` 은 한 칸의 픽셀 수(1·2·3…). */
export const flagKrSvg = (scale = 1): string => svg(FLAG_KR, FLAG_KR_PALETTE, FLAG_KR_W, FLAG_KR_H, scale, '대한민국');

// ── 신발 밑창 둘 (각 5×9, 사이 1칸 = 11×9) ── 왼쪽이 왼발, 허리가 들어간 쪽이 안쪽. 주발은 밝게, 아닌 쪽은 흐리게.
// 2026-09-29: 옆모습 축구화(7×5) "발 같지 않다" → 발가락 발자국(6×10) "너무 디테일" → 뭉친 발바닥(4×7) "여전히 발 같지 않다,
// 신발 밑창처럼" — 앞코가 둥글고 허리가 들어가고 뒤꿈치가 좁은 밑창 윤곽(스터드 없이).
export const FEET_W = 11;
export const FEET_H = 9;
const FOOT_R = ['.XXX.', 'XXXXX', 'XXXXX', 'XXXXX', 'XXXXX', 'XXXX.', '.XXX.', '.XXX.', '.XXX.'];
const FOOT_L = FOOT_R.map((row) => [...row].reverse().join(''));
const FEET: string[] = FOOT_L.map((l, i) => `${l.replace(/X/g, 'L')}.${FOOT_R[i].replace(/X/g, 'R')}`);
const ON = '#f4f4f4', OFF = '#4a4f57';
function feetPalette(mode: FootMode): Record<string, string> {
  const left = mode === 'left' || mode === 'both';
  const right = mode === 'right' || mode === 'both';
  return { L: left ? ON : OFF, R: right ? ON : OFF };
}
export const feetPixels = (mode: FootMode): { map: string[]; palette: Record<string, string>; w: number; h: number } =>
  ({ map: FEET, palette: feetPalette(mode), w: FEET_W, h: FEET_H });
export function feetSvg(mode: FootMode, scale = 1): string {
  const palette = feetPalette(mode);
  const label = mode === 'both' ? '양발' : mode === 'left' ? '왼발' : mode === 'right' ? '오른발' : '주발 미정';
  return svg(FEET, palette, FEET_W, FEET_H, scale, label);
}
