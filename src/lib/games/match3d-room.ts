// src/lib/games/match3d-room.ts — 3D 경기의 방 규칙: 설정(한 편 필드 수·시간·점수)과 시작(경기 설정 만들기)(2026-11-07 게임 묶음 4단계). 순수.
// 설계: docs/superpowers/specs/2026-11-07-games-program-design.md §3.5 "3D: 지금 시제품을 온라인으로(방·팀 나누기는 2D 방과 같은 화면) — 시제품 딱지를 뗀다."
// 사용자: "자유 훈련장, 여러 드리블 훈련장, 승부차기, 프리킥 같은 게임 만들어서 온라인 가능하게 하자. 다 2d, 3d 모드 별로 가능하게 하고."
//
// 내가 정한 것(사용자가 정한 건 위 문장뿐):
//   - 3D 경기는 한 편 = 골키퍼 1 + 필드. 골키퍼는 늘 봇이다 — 손 쓰는 조작(잡기·쳐내기 방향)이 없어 사람이 맡으면 그냥 빈 골대가 된다.
//   - 사람은 필드 자리만. 앞줄부터 채운다(혼자 하기 시제품도 사람이 앞줄에 섰다). 한 편 필드는 4명까지(편성 자리가 넷) — 넘으면 시작을 막는다.
//   - "필드 수"(2~4, 기본 4) = 2D 의 "봇으로 채움"과 같은 뜻: 한 편 필드가 이 수보다 적으면 봇이 채우고, 사람이 더 많은 편은 사람 수대로(4명까지) 뛴다.
//     2·3명 편성은 sim 의 FORMATION_FEW(둘이면 앞뒤로 하나씩, 셋이면 뒤 하나 앞 둘).
//   - 봇 고르기(room.botPicks)는 편마다 [골키퍼, 필드 봇…] 차례 — 첫 칸이 골키퍼다(방 화면 봇 자리도 첫 칸에 "키퍼" 표시).
//   - 봇을 뽑는 규칙(고른 봇 먼저, 나머지 명단에서 무작위, 방 사람·고른 선수 제외)은 2D 와 같은 함수(match2d-room.ts pickBotNums)를 쓴다.
import type { Player } from '../types.ts';
import type { MatchConfig, MatchPlayer, Side } from '../game3d/sim.ts';
import { formationSpot } from '../game3d/sim.ts';
import { BASE_PERF, perfOf } from '../game3d/stats.ts';
import type { Member, RoomState } from '../game/room.ts';
import { MAX_HUMANS, withSettings } from '../game/room.ts';
import { pickBotNums, START_BLOCK_TEXT } from './match2d-room.ts';

/** outfield = 한 편 필드 수(골키퍼 빼고) — 사람이 그보다 적은 편을 봇으로 채운다. */
export type Outfield = 2 | 3 | 4;
export type Room3dSettings = { outfield: Outfield; minutes: number; scoreLimit: number };
export type Room3d = RoomState<Room3dSettings>;

/** 한 편 필드 최대(편성 자리 수). */
export const MAX_OUTFIELD = 4;
export const MIN_OUTFIELD = 2;
/** 필드 4 · 3분 · 점수 제한 없음 — 시제품의 5대5·3분 그대로. */
export const DEFAULT_3D: Room3dSettings = { outfield: 4, minutes: 3, scoreLimit: 0 };
export const MINUTES_3D = { min: 1, max: 5 };
export const SCORE_LIMIT_3D_MAX = 20;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const clampInt = (v: unknown, lo: number, hi: number, fallback: number): number => {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : fallback;
  return Math.min(hi, Math.max(lo, n));
};

/** 편마다 필드 수 — max(그 편 사람 수, outfield). 4 를 넘는 편이 있으면 startBlock 이 막는다(여기선 자르지 않는다). */
export function outfieldSizes(room: Room3d): [number, number] {
  const h = [0, 1].map((t) => room.members.filter((m) => m.team === t).length);
  return [Math.max(h[0], room.settings.outfield), Math.max(h[1], room.settings.outfield)];
}

/** 편마다 봇 수(골키퍼 포함) — 방 화면 봇 자리. */
export function botSeats3d(room: Room3d): [number, number] {
  const [a, b] = outfieldSizes(room);
  const h = [0, 1].map((t) => room.members.filter((m) => m.team === t).length);
  return [1 + Math.max(0, a - h[0]), 1 + Math.max(0, b - h[1])];
}

export const START_BLOCK_3D = {
  humans: START_BLOCK_TEXT.humans,
  side: '3D 경기는 한 편 필드 4명까지입니다 — 넘는 사람은 대기 칸으로 옮겨 주세요',
  roster: '명단이 모자라 봇(골키퍼 포함)을 다 채울 수 없습니다 — 필드 수를 줄여 주세요',
} as const;

/** 시작을 막는 이유. humans = 팀 칸 사람이 8명 초과, side = 한 편 사람이 필드 4명 초과, roster = 명단이 모자라 봇을 못 채움. */
export function startBlock3d(room: Room3d, roster: Player[]): keyof typeof START_BLOCK_3D | null {
  const h = [0, 1].map((t) => room.members.filter((m) => m.team === t).length);
  if (h[0] + h[1] > MAX_HUMANS) return 'humans';
  if (h[0] > MAX_OUTFIELD || h[1] > MAX_OUTFIELD) return 'side';
  const [a, b] = botSeats3d(room);
  const taken = new Set(room.members.map((m) => m.num));
  const free = new Set(roster.filter((p) => !taken.has(p.num)).map((p) => p.num)).size;
  if (free < a + b) return 'roster';
  return null;
}

/** 설정 고치기(순수). 범위 밖은 자르고, 바뀐 게 없으면 cur 그대로(같은 객체). */
export function applySettings3d(cur: Room3dSettings, given: unknown): Room3dSettings {
  const patch = (isObj(given) ? given : {}) as Partial<Record<keyof Room3dSettings, unknown>>;
  const next: Room3dSettings = {
    outfield: clampInt(patch.outfield ?? cur.outfield, MIN_OUTFIELD, MAX_OUTFIELD, cur.outfield) as Outfield,
    minutes: clampInt(patch.minutes ?? cur.minutes, MINUTES_3D.min, MINUTES_3D.max, cur.minutes),
    scoreLimit: clampInt(patch.scoreLimit ?? cur.scoreLimit, 0, SCORE_LIMIT_3D_MAX, cur.scoreLimit),
  };
  if (next.outfield === cur.outfield && next.minutes === cur.minutes && next.scoreLimit === cur.scoreLimit) return cur;
  return next;
}

export function setSettings3d(room: Room3d, patch: Partial<Room3dSettings>): Room3d {
  return withSettings(room, applySettings3d(room.settings, patch));
}

/** 채널에서 온 방 설정 검사 — 화면 범위보다 넉넉하게(2D okSettings 와 같은 태도). */
export function okSettings3d(s: unknown): s is Room3dSettings {
  const isInt = (v: unknown, lo: number, hi: number): boolean => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;
  return isObj(s) && isInt(s.outfield, MIN_OUTFIELD, MAX_OUTFIELD) && isInt(s.minutes, 1, 60) && isInt(s.scoreLimit, 0, 99);
}

/** 필드 n 명 편성에서 사람을 세울 차례 — 앞줄(상대 골대 쪽)부터, 같은 줄이면 slot 번호 순. 4명이면 3, 4, 1, 2. */
export function humanSlots(n: number): number[] {
  const slots = Array.from({ length: n }, (_, i) => i + 1);
  return slots.sort((a, b) => formationSpot(b, 0, n).x - formationSpot(a, 0, n).x || a - b);
}

/** 시작 — 편마다 [골키퍼 봇, 필드 slot 1..n]. 사람은 그 선수로(bot:false) 앞줄부터, 나머지 필드와 골키퍼는 봇.
 *  자리 순서: 0 편 다음 1 편, id = 배열 순서, 편 안 첫 자리가 골키퍼(sim 의 slotOf·편성이 이 순서에 기댄다).
 *  slots[i] = config.players[i] 를 조종하는 clientId(봇이면 null). 대기 칸 사람은 구경. 못 시작하면 RangeError. 난수는 rnd 로만. */
export function buildMatch3d(room: Room3d, roster: Player[], rnd: () => number): { config: MatchConfig; slots: (string | null)[] } {
  const why = startBlock3d(room, roster);
  if (why) throw new RangeError(why === 'humans' ? '사람이 너무 많다' : why === 'side' ? '한 편 필드가 넘친다' : '명단이 모자라 봇을 채울 수 없다');
  const sizes = outfieldSizes(room);
  const humans: Member[][] = [0, 1].map((t) => room.members.filter((m) => m.team === t));
  const need = [0, 1].map((t) => 1 + Math.max(0, sizes[t] - humans[t].length)) as [number, number];
  const bots = pickBotNums(room, roster, need, rnd);   // 편마다 [골키퍼, 필드 봇…]
  const players: MatchPlayer[] = [];
  const slots: (string | null)[] = [];
  const push = (num: number, side: Side, m: Member | null, gk: boolean): void => {
    const r = roster.find((p) => p.num === num);
    players.push({ id: players.length, num, name: m ? m.name : (r?.name ?? String(num)), side, bot: !m, gk, perf: r ? perfOf(r, roster) : { ...BASE_PERF } });
    slots.push(m ? m.clientId : null);
  };
  for (const side of [0, 1] as const) {
    const n = sizes[side];
    const bySlot = new Map<number, Member>();
    humanSlots(n).forEach((slot, i) => { const m = humans[side][i]; if (m) bySlot.set(slot, m); });
    let c = 0;
    push(bots[side][c++], side, null, true);
    for (let slot = 1; slot <= n; slot++) {
      const m = bySlot.get(slot) ?? null;
      push(m ? m.num : bots[side][c++], side, m, false);
    }
  }
  return { config: { minutes: room.settings.minutes, scoreLimit: room.settings.scoreLimit, players }, slots };
}
