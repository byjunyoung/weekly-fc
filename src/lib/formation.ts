// src/lib/formation.ts — 포메이션 슬롯과 베스트 11 배치.
// 좌표는 0~1, 세로 피치 기준이고 y=0 이 상대 골대, y=1 이 우리 골대다.
import { ovr } from './stats.ts';
import type { Player, Pos } from './types.ts';

export type Slot = { label: string; group: Pos; x: number; y: number };

/** 슬롯 라벨 → 어느 포지션 무리에서 뽑을지. 라벨은 축구 표기를 그대로 쓰고,
 *  명단의 pos 는 GK·DF·MF·FW 네 가지뿐이라 여기서 한 번 접는다. */
export const FORMATIONS: Record<string, Slot[]> = {
  '4-3-3': [
    { label: 'GK', group: 'GK', x: 0.50, y: 0.93 },
    { label: 'LB', group: 'DF', x: 0.14, y: 0.74 }, { label: 'CB', group: 'DF', x: 0.38, y: 0.78 },
    { label: 'CB', group: 'DF', x: 0.62, y: 0.78 }, { label: 'RB', group: 'DF', x: 0.86, y: 0.74 },
    { label: 'CM', group: 'MF', x: 0.28, y: 0.52 }, { label: 'CM', group: 'MF', x: 0.50, y: 0.56 },
    { label: 'CM', group: 'MF', x: 0.72, y: 0.52 },
    { label: 'LW', group: 'FW', x: 0.18, y: 0.26 }, { label: 'ST', group: 'FW', x: 0.50, y: 0.18 },
    { label: 'RW', group: 'FW', x: 0.82, y: 0.26 },
  ],
  '4-4-2': [
    { label: 'GK', group: 'GK', x: 0.50, y: 0.93 },
    { label: 'LB', group: 'DF', x: 0.14, y: 0.74 }, { label: 'CB', group: 'DF', x: 0.38, y: 0.78 },
    { label: 'CB', group: 'DF', x: 0.62, y: 0.78 }, { label: 'RB', group: 'DF', x: 0.86, y: 0.74 },
    { label: 'LM', group: 'MF', x: 0.14, y: 0.50 }, { label: 'CM', group: 'MF', x: 0.38, y: 0.54 },
    { label: 'CM', group: 'MF', x: 0.62, y: 0.54 }, { label: 'RM', group: 'MF', x: 0.86, y: 0.50 },
    { label: 'ST', group: 'FW', x: 0.38, y: 0.20 }, { label: 'ST', group: 'FW', x: 0.62, y: 0.20 },
  ],
  '3-5-2': [
    { label: 'GK', group: 'GK', x: 0.50, y: 0.93 },
    { label: 'CB', group: 'DF', x: 0.28, y: 0.78 }, { label: 'CB', group: 'DF', x: 0.50, y: 0.81 },
    { label: 'CB', group: 'DF', x: 0.72, y: 0.78 },
    { label: 'LWB', group: 'MF', x: 0.10, y: 0.56 }, { label: 'CM', group: 'MF', x: 0.33, y: 0.54 },
    { label: 'CM', group: 'MF', x: 0.50, y: 0.58 }, { label: 'CM', group: 'MF', x: 0.67, y: 0.54 },
    { label: 'RWB', group: 'MF', x: 0.90, y: 0.56 },
    { label: 'ST', group: 'FW', x: 0.38, y: 0.20 }, { label: 'ST', group: 'FW', x: 0.62, y: 0.20 },
  ],
  '4-2-3-1': [
    { label: 'GK', group: 'GK', x: 0.50, y: 0.93 },
    { label: 'LB', group: 'DF', x: 0.14, y: 0.74 }, { label: 'CB', group: 'DF', x: 0.38, y: 0.78 },
    { label: 'CB', group: 'DF', x: 0.62, y: 0.78 }, { label: 'RB', group: 'DF', x: 0.86, y: 0.74 },
    { label: 'CDM', group: 'MF', x: 0.38, y: 0.62 }, { label: 'CDM', group: 'MF', x: 0.62, y: 0.62 },
    { label: 'LM', group: 'MF', x: 0.18, y: 0.40 }, { label: 'CAM', group: 'MF', x: 0.50, y: 0.38 },
    { label: 'RM', group: 'MF', x: 0.82, y: 0.40 },
    { label: 'ST', group: 'FW', x: 0.50, y: 0.17 },
  ],
};

export const FORMATION_NAMES = Object.keys(FORMATIONS);

export type Assigned = { slot: Slot; player: Player | null; outOfPosition: boolean };

/**
 * 슬롯마다 OVR 이 가장 높은 사람을 앉힌다. 그 포지션 사람이 동나면 남은 사람 중 최고를
 * 앉히고 outOfPosition 으로 표시한다 — 명단이 GK 1명처럼 치우쳐 있어 빈 칸을 만드는 쪽보다
 * 누가 자리 밖에 섰는지 보여주는 쪽이 쓸모 있다.
 */
export function bestEleven(players: Player[], slots: Slot[]): { lineup: Assigned[]; bench: Player[] } {
  const byOvr = [...players].sort((a, b) => ovr(b) - ovr(a) || a.num - b.num);
  const used = new Set<number>();
  const take = (want: Pos | null): Player | null => {
    const hit = byOvr.find((p) => !used.has(p.num) && (want === null || p.pos === want));
    if (hit) used.add(hit.num);
    return hit ?? null;
  };
  const lineup = slots.map((slot) => {
    const exact = take(slot.group);
    if (exact) return { slot, player: exact, outOfPosition: false };
    const any = take(null);
    return { slot, player: any, outOfPosition: !!any };
  });
  return { lineup, bench: byOvr.filter((p) => !used.has(p.num)) };
}
