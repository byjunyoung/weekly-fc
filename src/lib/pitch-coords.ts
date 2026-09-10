// src/lib/pitch-coords.ts — 세로/가로 정규좌표 변환. 저장 형식은 항상 세로 기준.
export type Norm = [number, number];
/** 세로 → 가로 */
export const toLandscape = (n: Norm): Norm => [n[1], 1 - n[0]];
/** 가로 → 세로 */
export const toPortrait = (n: Norm): Norm => [1 - n[1], n[0]];
/** 현재 방향의 좌표를 저장용(세로 기준)으로 */
export const packNorm = (orientation: 'portrait' | 'landscape', n: Norm): Norm => (orientation === 'portrait' ? n : toPortrait(n));
/** 저장된(세로 기준) 좌표를 현재 방향으로 */
export const unpackNorm = (orientation: 'portrait' | 'landscape', n: Norm): Norm => (orientation === 'portrait' ? n : toLandscape(n));
