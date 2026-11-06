// src/lib/stats.ts
import { STAT_KEYS, type Player, type StatKey } from './types.ts';

export const STAT_CUTS: [number, number, number] = [84, 69, 55];
export function ovr(p: Player): number {
  const v = STAT_KEYS.map((k) => p[k]).filter((x) => x > 0);
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : 0;
}
export const grade = (v: number): 'gold' | 'silver' | 'bronze' => (v >= 84 ? 'gold' : v >= 69 ? 'silver' : 'bronze');
export const band = (v: number, cuts: [number, number, number]): 'a' | 'b' | 'c' | 'd' => (v >= cuts[0] ? 'a' : v >= cuts[1] ? 'b' : v >= cuts[2] ? 'c' : 'd');

/** 능력치 이름. 영문 약어(PAC·DRI…)도 있었는데 "영어로 적으면 잘 모르니까"(2026-09-22)
 *  화면을 전부 한글로 바꾸면서 쓰는 곳이 없어져 지웠다.
 *  `stamina` 는 이름만 **피지컬**이다(2026-09-25 "체력이 아니라 피지컬") — 열 이름·기록의 field 값은 그대로 둔다. */
export const STAT_KO: Record<StatKey, string> = { pace: '페이스', dribble: '드리블', pass: '패스', shoot: '슈팅', defend: '수비', stamina: '피지컬' };
