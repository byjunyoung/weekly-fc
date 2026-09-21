// src/lib/lineup.ts — 한 팀 라인업 상태와 배치 규칙. DOM 없이 순수 함수만 둔다(단위 테스트 대상).
// 상태는 기기에 초안 하나로만 남는다 — 서버 저장은 하지 않는다(2026-09-13 스펙 §1).
import { SHAPES, slotsFor, defaultPitch, clampCount, bestEleven, type PitchKind, type Slot } from './formation.ts';
import { ovr } from './stats.ts';
import type { Player } from './types.ts';

export type Pt = [number, number];
export type LineupState = {
  v: 1; count: number; shape: string; pitch: PitchKind;
  /** 슬롯 순서대로 선수 번호. slotsFor(count, shape)와 길이가 같다. */
  slots: (number | null)[];
  /** 끌어서 옮긴 슬롯의 위치. 키는 슬롯 번호. 모양·인원을 바꾸면 비운다. */
  moved: Record<string, Pt>;
  /** 빈 문자열이면 defaultTitle 을 쓴다. */
  title: string;
};
export type ListTap = 'placed' | 'benched' | 'full';
export const DRAFT_KEY = 'wfc_squad_draft';
const TITLE_MAX = 40;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const inRange = (s: LineupState, i: number) => Number.isInteger(i) && i >= 0 && i < s.count;
const without = (slots: (number | null)[], num: number) => slots.map((x) => (x === num ? null : x));

export function initial(count = 11): LineupState {
  const n = clampCount(count);
  return { v: 1, count: n, shape: SHAPES[n][0], pitch: defaultPitch(n), slots: Array(n).fill(null), moved: {}, title: '' };
}

export const slotsOf = (s: LineupState): Slot[] => slotsFor(s.count, s.shape);

export function positionOf(s: LineupState, idx: number): Pt {
  const m = s.moved[idx];
  if (m) return m;
  const slot = slotsOf(s)[idx];
  return [slot.x, slot.y];
}

/** 인원을 바꾸면 이미 선 사람은 앞 슬롯부터 순서대로 남고 넘치는 사람은 벤치로 간다. */
export function setCount(s: LineupState, count: number): LineupState {
  const n = clampCount(count);
  const starters = s.slots.filter((x): x is number => x != null).slice(0, n);
  const slots = Array.from({ length: n }, (_, i) => starters[i] ?? null);
  return { ...s, count: n, shape: SHAPES[n][0], pitch: defaultPitch(n), slots, moved: {} };
}

export function setShape(s: LineupState, shape: string): LineupState {
  const key = SHAPES[s.count].includes(shape) ? shape : SHAPES[s.count][0];
  return { ...s, shape: key, moved: {} };
}

export const setPitch = (s: LineupState, pitch: PitchKind): LineupState => ({ ...s, pitch });
export const setTitle = (s: LineupState, title: string): LineupState => ({ ...s, title: title.slice(0, TITLE_MAX) });
export const isStarter = (s: LineupState, num: number): boolean => s.slots.includes(num);

/** 그 자리에 넣는다. 원래 있던 사람은 벤치로, 다른 자리에 서 있던 같은 선수는 그 자리를 비운다. */
export function place(s: LineupState, idx: number, num: number): LineupState {
  if (!inRange(s, idx)) return s;
  const slots = without(s.slots, num);
  slots[idx] = num;
  return { ...s, slots };
}

export const bench = (s: LineupState, num: number): LineupState => ({ ...s, slots: without(s.slots, num) });

/** 명단에서 선수를 눌렀을 때. 자리가 골라져 있으면 그 자리로, 아니면 선발↔벤치 토글이거나 첫 빈자리. */
export function tapPlayer(s: LineupState, num: number, selected: number | null): { state: LineupState; result: ListTap } {
  if (selected != null && inRange(s, selected)) return { state: place(s, selected, num), result: 'placed' };
  if (isStarter(s, num)) return { state: bench(s, num), result: 'benched' };
  const empty = s.slots.indexOf(null);
  if (empty < 0) return { state: s, result: 'full' };
  return { state: place(s, empty, num), result: 'placed' };
}

/** 두 슬롯의 선수를 맞바꾼다. 위치(moved)는 슬롯에 붙어 있으므로 그대로 둔다. */
export function swap(s: LineupState, a: number, b: number): LineupState {
  if (a === b || !inRange(s, a) || !inRange(s, b)) return s;
  const slots = [...s.slots];
  [slots[a], slots[b]] = [slots[b], slots[a]];
  return { ...s, slots };
}

export function moveSlot(s: LineupState, idx: number, pt: Pt): LineupState {
  if (!inRange(s, idx)) return s;
  return { ...s, moved: { ...s.moved, [idx]: [r3(clamp01(pt[0])), r3(clamp01(pt[1]))] } };
}

export function autoFill(s: LineupState, players: Player[]): LineupState {
  const { lineup } = bestEleven(players, slotsOf(s));
  return { ...s, slots: lineup.map((a) => a.player?.num ?? null), moved: {} };
}

export const serialize = (s: LineupState): string => JSON.stringify(s);

const isPt = (p: unknown): p is Pt => Array.isArray(p) && p.length === 2 && p.every((v) => typeof v === 'number' && Number.isFinite(v));

/** 초안 복원 — 무엇이 와도 쓸 수 있는 상태를 돌려준다. 명단에 없는 번호(탈퇴 등)는 비운다. */
export function restore(raw: string | null, players: Player[]): LineupState {
  let o: Record<string, unknown>;
  try { o = JSON.parse(raw ?? ''); } catch { return initial(); }
  if (!o || typeof o !== 'object' || o.v !== 1) return initial();
  const base = setShape(initial(Number(o.count)), String(o.shape ?? ''));
  const known = new Set(players.map((p) => p.num));
  const seen = new Set<number>();
  const src = Array.isArray(o.slots) ? o.slots : [];
  const slots = base.slots.map((_, i) => {
    const v = src[i];
    if (typeof v !== 'number' || !known.has(v) || seen.has(v)) return null;
    seen.add(v);
    return v;
  });
  const moved: Record<string, Pt> = {};
  if (o.moved && typeof o.moved === 'object') {
    for (const [k, v] of Object.entries(o.moved as Record<string, unknown>)) {
      const i = Number(k);
      if (inRange(base, i) && isPt(v)) moved[i] = [clamp01(v[0]), clamp01(v[1])];
    }
  }
  const pitch: PitchKind = o.pitch === 'futsal' || o.pitch === 'soccer' ? o.pitch : base.pitch;
  const title = typeof o.title === 'string' ? o.title.slice(0, TITLE_MAX) : '';
  return { ...base, pitch, slots, moved, title };
}

/** 기본 제목 — today('YYYY-MM-DD', 서울 기준) 이후 가장 가까운 토요일. 토요일 당일이면 오늘. */
export function defaultTitle(today: string): string {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + ((6 - d.getUTCDay() + 7) % 7));
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} (토) 라인업`;
}
