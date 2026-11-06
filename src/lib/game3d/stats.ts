// src/lib/game3d/stats.ts — 3D 경기: 포털 능력치 → 게임 속 성능(2026-11-07). 순수 함수.
// 스펙 §3 "능력치: 2D 와 같은 방식으로 살짝(±10%)" — 페이스 → 속도, 드리블 → 공 간수, 슈팅 → 슛 세기, 패스 → 패스 정확도,
// 수비 → 빼앗기, 피지컬(stamina) → 몸싸움. 2D(src/lib/game/stats.ts)와 같은 계산이지만 성능 칸이 달라 따로 둔다(2D 를 건드리지 않으려고).
import type { Player, StatKey } from '../types.ts';
import { BASE_PERF_TUNE } from './sim.ts';

export type Perf = { maxSpeed: number; control: number; shot: number; pass: number; tackle: number; mass: number };

/** 평균 선수의 성능. 숫자는 sim.ts 맨 위 조절 값(BASE_PERF_TUNE)에서 고친다. */
export const BASE_PERF: Perf = { ...BASE_PERF_TUNE };

/** 평균에서 가장 멀어도 base 의 ±10%. */
const MAX_DEV = 0.1;
/** 능력치 몇 점 차이에서 ±10% 에 닿는지(2D 와 같은 25). */
const SPREAD = 25;

const MAP: [StatKey, keyof Perf][] = [
  ['pace', 'maxSpeed'], ['dribble', 'control'], ['shoot', 'shot'], ['pass', 'pass'], ['defend', 'tackle'], ['stamina', 'mass'],
];
const ALL: StatKey[] = ['pace', 'dribble', 'pass', 'shoot', 'defend', 'stamina'];

function average(all: Player[], key: StatKey): number {
  let sum = 0, n = 0;
  for (const q of all) if (q[key] > 0) { sum += q[key]; n++; }
  return n ? sum / n : 0;
}

/** 포털 능력치 → 게임 성능. 배치 전(여섯 칸 전부 0)은 평균 그대로, 한 칸만 0 이면 그 칸만 평균. all = 명단 전체(평균을 여기서 낸다). */
export function perfOf(p: Player, all: Player[]): Perf {
  const out: Perf = { ...BASE_PERF };
  if (ALL.every((k) => !(p[k] > 0))) return out;
  for (const [stat, key] of MAP) {
    const avg = average(all, stat);
    if (!(p[stat] > 0) || avg <= 0) continue;
    const dev = Math.max(-1, Math.min(1, (p[stat] - avg) / SPREAD));
    out[key] = BASE_PERF[key] * (1 + dev * MAX_DEV);
  }
  return out;
}
