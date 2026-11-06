// src/lib/game/stats.ts — 포털 능력치 → 게임 속 성능(2026-11-06). 순수 함수.
// 스펙 §4: 페이스 → 최고 속도, 드리블 → 가속(방향 전환), 슈팅 → 킥 세기, 피지컬(stamina) → 몸싸움에서 덜 밀림.
// 패스·수비는 1단계에서 안 쓴다. "살짝 반영"이라 평균 선수 대비 위아래 10% 안쪽으로만 움직인다.
import type { Player, StatKey } from '../types.ts';
import { BASE_PERF_TUNE } from './sim.ts';

export type Perf = { maxSpeed: number; accel: number; kick: number; mass: number };

/** 평균 선수의 성능. 숫자는 sim.ts 맨 위 조절 값(BASE_PERF_TUNE)에서 고친다. */
export const BASE_PERF: Perf = { ...BASE_PERF_TUNE };

/** 최대 편차 — 평균에서 가장 멀어도 base 의 ±10%. */
const MAX_DEV = 0.1;
/** 능력치 몇 점 차이에서 ±10% 에 닿는지. 25 면 평균 70 인 팀에서 95 가 최고 보정, 45 가 최저 보정.
 *  작을수록 능력치 차이가 크게 느껴진다. */
const SPREAD = 25;

const MAP: [StatKey, keyof Perf][] = [['pace', 'maxSpeed'], ['dribble', 'accel'], ['shoot', 'kick'], ['stamina', 'mass']];
const ALL: StatKey[] = ['pace', 'dribble', 'pass', 'shoot', 'defend', 'stamina'];

/** 명단 전체에서 이 능력치가 있는(> 0) 사람들의 평균. 아무도 없으면 0. */
function average(all: Player[], key: StatKey): number {
  let sum = 0, n = 0;
  for (const q of all) if (q[key] > 0) { sum += q[key]; n++; }
  return n ? sum / n : 0;
}

/** 포털 능력치 → 게임 성능. 배치 전(여섯 칸 전부 0)은 평균값 그대로.
 *  한 칸만 0 이면(드물다) 그 칸만 평균으로 친다. all = 명단 전체 — 평균을 여기서 낸다. */
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
