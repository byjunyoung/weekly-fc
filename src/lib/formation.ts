// src/lib/formation.ts — 인원별 포메이션 슬롯과 자동 배치.
// 좌표는 0~1, 세로 피치 기준이고 y=0 이 상대 골대, y=1 이 우리 골대다.
// 전에는 이 파일(11인 4종)과 옛 캔버스 전술판(CURATED 5·7·11인)에 목록이 흩어져 있었다 — 여기 하나로 합친다.
import { ovr } from './stats.ts';
import type { Player, Pos } from './types.ts';

export type Slot = { label: string; group: Pos; x: number; y: number };
export type PitchKind = 'futsal' | 'soccer';
export const MIN_COUNT = 5;
export const MAX_COUNT = 11;

/** 인원(GK 포함) → 고를 수 있는 모양. 모양은 GK 를 뺀 줄별 인원이고 첫 항목이 기본이다.
 *  6·8인은 플랩에서 흔해 새로 넣었다. */
export const SHAPES: Record<number, string[]> = {
  5: ['1-2-1', '2-2', '3-1', '1-3'],
  6: ['2-2-1', '2-1-2', '3-1-1'],
  7: ['2-3-1', '3-2-1', '2-2-2'],
  8: ['3-3-1', '3-2-2', '2-3-2'],
  9: ['3-3-2', '3-4-1'],
  10: ['4-3-2', '3-4-2'],
  11: ['4-3-3', '4-4-2', '4-2-3-1', '3-5-2'],
};

/** 11인은 손으로 맞춘 배치 — 슬롯 라벨 → 어느 포지션 무리에서 뽑을지. 라벨은 축구 표기를 그대로 쓰고,
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

// ── 5~10인: 모양 문자열에서 슬롯을 만든다 ─────────────────────────────
const ROW_GROUPS: Record<number, Pos[]> = { 2: ['DF', 'FW'], 3: ['DF', 'MF', 'FW'], 4: ['DF', 'MF', 'MF', 'FW'] };
/** 무리별, 줄 인원별 라벨(왼쪽 → 오른쪽). */
const ROW_LABELS: Record<Exclude<Pos, 'GK'>, string[][]> = {
  DF: [[], ['CB'], ['CB', 'CB'], ['LB', 'CB', 'RB'], ['LB', 'CB', 'CB', 'RB'], ['LWB', 'CB', 'CB', 'CB', 'RWB']],
  MF: [[], ['CM'], ['CM', 'CM'], ['LM', 'CM', 'RM'], ['LM', 'CM', 'CM', 'RM'], ['LM', 'CM', 'CM', 'CM', 'RM']],
  FW: [[], ['ST'], ['ST', 'ST'], ['LW', 'ST', 'RW']],
};
/** 줄 인원별 좌우 여백 — 인원이 적을수록 가운데로 모은다. */
const ROW_MARGIN = [0, 0.5, 0.3, 0.18, 0.14, 0.1];
const r2 = (v: number) => Math.round(v * 100) / 100;

function generate(shape: string): Slot[] {
  const rows = shape.split('-').map(Number);
  const groups = ROW_GROUPS[rows.length];
  const slots: Slot[] = [{ label: 'GK', group: 'GK', x: 0.5, y: 0.92 }];
  rows.forEach((k, r) => {
    const group = groups[r] as Exclude<Pos, 'GK'>;
    const y = 0.75 - (0.53 * r) / (rows.length - 1);
    const m = ROW_MARGIN[k];
    for (let i = 0; i < k; i++) {
      const x = k === 1 ? 0.5 : m + ((1 - 2 * m) * i) / (k - 1);
      slots.push({ label: ROW_LABELS[group][k][i], group, x: r2(x), y: r2(y) });
    }
  });
  return slots;
}

export function clampCount(n: number): number {
  const v = Math.round(n);
  return Number.isFinite(v) ? Math.min(MAX_COUNT, Math.max(MIN_COUNT, v)) : MAX_COUNT;
}

export function slotsFor(count: number, shape: string): Slot[] {
  const n = clampCount(count);
  const key = SHAPES[n].includes(shape) ? shape : SHAPES[n][0];
  return n === 11 ? FORMATIONS[key] : generate(key);
}

/** 7명 이하는 풋살장이 기본 — 사용자가 토글로 바꿀 수 있다. */
export const defaultPitch = (count: number): 'futsal' | 'soccer' => (clampCount(count) <= 7 ? 'futsal' : 'soccer');
