// src/lib/games/match2d-room.ts — 2D 경기의 방 규칙: 설정(인원·경기장·시간·점수)과 시작(경기 설정 만들기)(2026-11-06). 순수.
// 설계: docs/superpowers/specs/2026-11-06-game-online-design.md §2.3, 2026-11-07-game-fields-teams-design.md §1·§3
//
// 2026-11-07 게임 묶음 토대(스펙 2026-11-07-games-program-design.md §2) — room.ts 에 있던 것 가운데 2D 경기에만 맞는 것을 그대로 옮겼다
// (규칙·난수 쓰는 순서까지 같다). 방 자체(사람·칸·선수·봇 고르기)는 어느 게임에나 쓰므로 room.ts 에 남았다.
// 여기 함수들은 room.settings 가 이 게임의 설정(RoomSettings)인 방을 받는다 — 방의 game 이 'match2d' 일 때만 부른다(등록부가 그렇게 이어 준다).
import type { Player } from '../types.ts';
import type { FieldId, MatchConfig, MatchPlayer } from '../game/sim.ts';
import { FIELD_IDS } from '../game/sim.ts';
import { BASE_PERF, perfOf } from '../game/stats.ts';
import { shuffle } from '../game/lineup.ts';
import type { Member, RoomState } from '../game/room.ts';
import { MAX_HUMANS, MAX_PER_SIDE, withSettings } from '../game/room.ts';

/** perSide = "한 편을 이 수까지 봇으로 채운다"(0 = 봇 없음). 사람이 그보다 많은 편은 사람 수대로 다 뛴다(2026-11-07).
 *  field = 경기장 크기. 'auto' 면 시작할 때 경기장 위 인원으로 고른다(fieldFor). */
export type PerSide = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type FieldChoice = 'auto' | FieldId;
export type RoomSettings = { perSide: PerSide; minutes: number; scoreLimit: number; field: FieldChoice };
/** 2D 경기를 고른 방. */
export type Room2d = RoomState<RoomSettings>;

/** 3명까지 봇으로 채움 · 3분 · 점수 제한 없음(0) · 경기장 자동. */
export const DEFAULT_SETTINGS: RoomSettings = { perSide: 3, minutes: 3, scoreLimit: 0, field: 'auto' };
export const FIELD_CHOICES: readonly FieldChoice[] = ['auto', ...FIELD_IDS];

/** 경기장 위 인원(두 편 합) → 경기장 크기. 4명까지 작게, 6명까지 보통, 10명까지 크게, 그 이상 아주 크게(스펙 §1 표). */
export function fieldFor(onPitch: number): FieldId {
  return onPitch <= 4 ? 'S' : onPitch <= 6 ? 'M' : onPitch <= 10 ? 'L' : 'XL';
}

/** 시작하면 편마다 몇 명이 뛰나 — max(그 편 사람 수, perSide). */
export function sideSizes(room: Room2d): [number, number] {
  const h = [0, 1].map((t) => room.members.filter((m) => m.team === t).length);
  return [Math.max(h[0], room.settings.perSide), Math.max(h[1], room.settings.perSide)];
}

/** 그 방 설정으로 시작하면 고를 경기장. */
export function resolveField(room: Room2d): FieldId {
  const f = room.settings.field;
  if (f !== 'auto') return f;
  const [a, b] = sideSizes(room);
  return fieldFor(a + b);
}

/** 시작을 막는 이유. empty = 두 편 모두 0명, humans = 팀 칸 사람이 MAX_HUMANS 초과, roster = 명단이 모자라 봇을 못 채움. */
export function startBlock(room: Room2d, roster: Player[]): 'empty' | 'humans' | 'roster' | null {
  const [a, b] = sideSizes(room);
  if (a + b === 0) return 'empty';
  const humans = room.members.filter((m) => m.team !== null).length;
  if (humans > MAX_HUMANS) return 'humans';
  const taken = new Set(room.members.map((m) => m.num));
  const free = new Set(roster.filter((p) => !taken.has(p.num)).map((p) => p.num)).size;
  if (free < a + b - humans) return 'roster';
  return null;
}

/** 시작을 막는 이유를 화면 문구로 — buildMatch 가 RangeError 를 내기 전에 [시작] 을 막고 이유를 보여 준다(net/host.ts 에서 옮김). */
export const START_BLOCK_TEXT = {
  empty: '두 편 모두 비어 있습니다 — 사람을 팀 칸에 옮기거나 봇으로 채울 수를 늘려 주세요',
  humans: '지금 연결 방식으로는 한 경기에 8명까지 뛸 수 있습니다 — 나머지는 대기 칸에서 구경합니다',
  roster: '명단이 모자라 봇을 다 채울 수 없습니다 — 봇으로 채울 수를 줄여 주세요',
} as const;

/** 시간·점수 제한의 범위. 설정 화면이 이 안에서만 고르게 하고, 여기서도 한 번 더 자른다(바깥에서 온 값을 믿지 않는다). */
export const MINUTES_RANGE = { min: 1, max: 10 };
export const SCORE_LIMIT_MAX = 20;

const clampInt = (v: unknown, lo: number, hi: number, fallback: number): number => {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : fallback;
  return Math.min(hi, Math.max(lo, n));
};
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** 설정 고치기(순수). 범위 밖은 자르고, 모르는 경기장 값은 무시한다. 바뀐 게 없으면 cur 그대로(같은 객체) —
 *  방이 "보낼 게 없다"를 알게. perSide 는 봇을 채우는 수라 바꿔도 칸의 사람은 그대로다(2026-11-07). */
export function applySettings(cur: RoomSettings, given: unknown): RoomSettings {
  const patch = (isObj(given) ? given : {}) as Partial<Record<keyof RoomSettings, unknown>>;
  const next: RoomSettings = {
    perSide: clampInt(patch.perSide ?? cur.perSide, 0, MAX_PER_SIDE, cur.perSide) as PerSide,
    minutes: clampInt(patch.minutes ?? cur.minutes, MINUTES_RANGE.min, MINUTES_RANGE.max, cur.minutes),
    scoreLimit: clampInt(patch.scoreLimit ?? cur.scoreLimit, 0, SCORE_LIMIT_MAX, cur.scoreLimit),
    field: patch.field !== undefined && (FIELD_CHOICES as readonly unknown[]).includes(patch.field) ? patch.field as FieldChoice : cur.field,
  };
  if (next.perSide === cur.perSide && next.minutes === cur.minutes && next.scoreLimit === cur.scoreLimit && next.field === cur.field) return cur;
  return next;
}

/** 방 설정 바꾸기 — applySettings 를 거쳐 방에 넣는다(바뀌면 rev + 1). */
export function setSettings(room: Room2d, patch: Partial<RoomSettings>): Room2d {
  return withSettings(room, applySettings(room.settings, patch));
}

/** 채널에서 온 방의 설정 검사(예전 net.ts okRoom 의 설정 부분 그대로 — 화면 범위보다 넉넉하게 본다). */
export function okSettings(s: unknown): s is RoomSettings {
  const isInt = (v: unknown, lo: number, hi: number): boolean => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;
  return isObj(s) && isInt(s.perSide, 0, MAX_PER_SIDE) && isInt(s.minutes, 1, 60) && isInt(s.scoreLimit, 0, 99)
    && (FIELD_CHOICES as readonly unknown[]).includes(s.field);
}

/** 봇으로 뛸 선수 번호 — 편마다 need[편] 명, 그 편 봇 자리 차례대로(2026-11-07 "그리고 봇도 선수를 고를 수 있게 해줘").
 *  편마다 고른 봇(room.botPicks)을 앞에서부터 쓰고, 모자란 만큼 명단에서 무작위(방에 있는 선수·고른 선수 제외, 중복 없음).
 *  buildMatch 안에 있던 것을 그대로 꺼냈다(2026-11-07 4단계 — 3D 경기 방도 같은 규칙으로 봇을 뽑게, 베끼지 않으려고).
 *  난수는 rnd 로만, 쓰는 순서는 예전과 같다(테스트 기준값 fixtures/match2d-buildmatch.json 이 지킨다). 모자라면 뒤가 undefined — 부르는 쪽이 startBlock 으로 먼저 막는다. */
export function pickBotNums(room: RoomState<unknown>, roster: Player[], need: [number, number], rnd: () => number): [number[], number[]] {
  const taken = new Set(room.members.map((m) => m.num));
  // 고른 봇 — 편마다 봇 자리 수만큼 앞에서부터. 그새 못 쓰게 된 것(명단에 없음·방 사람이 잡음·겹침)은 건너뛴다. 남는 건 안 쓴다.
  const inRoster = new Set(roster.map((p) => p.num));
  const usedPick = new Set<number>();
  const chosen = ([0, 1] as const).map((side) => {
    const out: number[] = [];
    for (const n of room.botPicks?.[side] ?? []) {
      if (out.length >= need[side]) break;
      if (!inRoster.has(n) || taken.has(n) || usedPick.has(n)) continue;
      usedPick.add(n); out.push(n);
    }
    return out;
  });
  // 나머지는 지금처럼 무작위 — 고른 게 없으면 난수를 쓰는 순서까지 예전과 같다. 고른 선수는 자리가 모자라 안 쓰였어도 무작위에서 뺀다
  // (주황 봇으로 고른 선수가 흰 편 무작위 봇으로 나오면 고른 뜻과 어긋난다).
  const picked = new Set<number>([...(room.botPicks?.[0] ?? []), ...(room.botPicks?.[1] ?? [])]);
  const seenNum = new Set<number>();
  const uniqFree = roster.filter((p) => !taken.has(p.num) && !usedPick.has(p.num) && !seenNum.has(p.num) && (seenNum.add(p.num), true)).map((p) => p.num);
  const needRandom = ([0, 1] as const).reduce<number>((t, side) => t + need[side] - chosen[side].length, 0);
  const strict = uniqFree.filter((n) => !picked.has(n));
  const free = strict.length >= needRandom ? strict : uniqFree;   // 명단이 빠듯하면 남는 고른 선수도 무작위에 넣는다(시작은 막지 않는다)
  const pool = shuffle(free, rnd);
  let k = 0;
  return [0, 1].map((side) => [...chosen[side], ...Array.from({ length: need[side] - chosen[side].length }, () => pool[k++])]) as [number[], number[]];
}

/** 시작 — 두 팀 칸의 사람은 그 선수로(bot:false), 한 편이 perSide 보다 적으면 모자란 만큼 명단에서 무작위로 뽑은 봇으로(방에 있는 선수 제외, 중복 없음).
 *  사용자: "팀원 없으면 봇 추가해서 가능해야지", "최대 인원 같은거 헥스볼처럼 자유롭게" — 두 편 인원이 달라도 되고, 한 편이 0명이어도 된다.
 *  돌려주는 slots[i] = config.players[i] 를 조종하는 clientId(봇이면 null). 대기 칸 사람은 slots 에 없다(구경).
 *  경기장 'auto' 는 여기서 경기장 위 인원으로 정한다(fieldFor).
 *
 *  자리 순서: 0 편 선수들 다음 1 편, id = 배열 순서. 편 안에서 slot 0 이 가장 뒤(수비)라서 사람은 slot 1 부터 채우고 slot 0 은 맨 마지막에 준다 —
 *  사람이 뒤를 비우면 그 편 봇에 수비가 없어진다는 1단계 보고(report-1)의 결정을 따른다. 봇은 남은 slot 을 앞 번호부터.
 *  못 시작하는 경우(startBlock 이 막는 것 — 두 편 0명, 사람 8명 초과, 명단 모자람)는 RangeError. 난수는 rnd 로만. */
export function buildMatch(room: Room2d, roster: Player[], rnd: () => number): { config: MatchConfig; slots: (string | null)[] } {
  const why = startBlock(room, roster);
  if (why) throw new RangeError(why === 'empty' ? '두 편 모두 비어 있다' : why === 'humans' ? '사람이 너무 많다' : '명단이 모자라 봇을 채울 수 없다');
  const sizes = sideSizes(room);
  const humans: Member[][] = [0, 1].map((t) => room.members.filter((m) => m.team === t));
  const bots = pickBotNums(room, roster, [Math.max(0, sizes[0] - humans[0].length), Math.max(0, sizes[1] - humans[1].length)], rnd);
  const players: MatchPlayer[] = [];
  const slots: (string | null)[] = [];
  for (const side of [0, 1] as const) {
    const n = sizes[side];
    const humanOrder = [...Array.from({ length: Math.max(0, n - 1) }, (_, i) => i + 1), 0];   // 1, 2, …, n-1, 0
    const bySlot: (Member | null)[] = Array.from({ length: n }, () => null);
    humans[side].forEach((m, i) => { bySlot[humanOrder[i]] = m; });
    let c = 0;
    for (let slot = 0; slot < n; slot++) {
      const m = bySlot[slot], id = players.length;
      const num = m ? m.num : bots[side][c++];
      const r = roster.find((p) => p.num === num);
      players.push({ id, num, name: m ? m.name : (r?.name ?? String(num)), side, bot: !m, perf: r ? perfOf(r, roster) : { ...BASE_PERF } });
      slots.push(m ? m.clientId : null);
    }
  }
  return { config: { field: resolveField(room), minutes: room.settings.minutes, scoreLimit: room.settings.scoreLimit, players }, slots };
}
