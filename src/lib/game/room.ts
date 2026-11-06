// src/lib/game/room.ts — 온라인 방의 상태와 그 변화(2026-11-06). 순수 — 화면·시계·네트워크·난수 함수를 부르지 않는다.
// 설계: docs/superpowers/specs/2026-11-06-game-online-design.md §2.3
//
// 사용자: "2단계 온라인으로 넘어가자", "팀원 없으면 봇 추가해서 가능해야지", "haxball 시스템 벤치마킹해".
// haxball 에서 가져온 건 방 구조뿐이다 — 두 팀 칸 + 대기 칸, 방장이 사람을 옮기고 시작한다.
//
// 규칙 하나: 상태를 바꾸는 함수는 새 객체(rev + 1)를, 바뀐 게 없으면 받은 객체 그대로를 돌려준다.
// 부르는 쪽이 `next === room` 으로 "보낼 게 없다"를 알게 하려는 것이다(방송 한도가 빠듯하다).
import type { Player } from '../types.ts';
import { STAT_KEYS } from '../types.ts';
import type { FieldId, MatchConfig, MatchPlayer } from './sim.ts';
import { FIELD_IDS } from './sim.ts';
import { BASE_PERF, perfOf } from './stats.ts';
import { shuffle } from './lineup.ts';

export type Team = 0 | 1 | null;                                  // null = 대기 칸
export type Member = { clientId: string; num: number; name: string; team: Team };
/** perSide = "한 편을 이 수까지 봇으로 채운다"(0 = 봇 없음). 사람이 그보다 많은 편은 사람 수대로 다 뛴다(2026-11-07).
 *  field = 경기장 크기. 'auto' 면 시작할 때 경기장 위 인원으로 고른다(fieldFor). */
export type PerSide = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type FieldChoice = 'auto' | FieldId;
export type RoomSettings = { perSide: PerSide; minutes: number; scoreLimit: number; field: FieldChoice };
/** botPicks = 편마다 봇 자리에 세울 선수(명단 num)를 고른 차례대로. 비면 지금처럼 무작위(2026-11-07 "그리고 봇도 선수를 고를 수 있게 해줘").
 *  고른 수가 봇 자리보다 많으면 남는 건 안 쓰이지만 지우지 않는다 — "봇으로 채움" 수를 줄였다 늘려도 고른 게 남게. */
export type BotPicks = [number[], number[]];
export type RoomState = { code: string; hostId: string; members: Member[]; settings: RoomSettings; phase: 'lobby' | 'match'; rev: number; botPicks: BotPicks };
export type Who = { clientId: string; num: number; name: string };
export type JoinResult = { ok: true; room: RoomState } | { ok: false; reason: 'taken' | 'full' | 'closed' };

/** 3명까지 봇으로 채움 · 3분 · 점수 제한 없음(0) · 경기장 자동. */
export const DEFAULT_SETTINGS: RoomSettings = { perSide: 3, minutes: 3, scoreLimit: 0, field: 'auto' };
// 2026-11-07 "최대 인원 같은거 헥스볼처럼 자유롭게 맵 크기도 크기별로 하고" — 팀 인원은 자유(두 편이 달라도 된다).
// 한계는 연결 방식에서 나온다(스펙 2026-11-07-game-fields-teams-design.md §0 실측: 프로젝트 전체 초당 ~86건에서 채널이 닫힘).
/** 한 편 최대 인원(사람 + 봇). */
export const MAX_PER_SIDE = 6;
/** 한 경기에 직접 뛰는 사람 수 상한 — 봇은 메시지를 안 쓰므로 여기에 안 든다. */
export const MAX_HUMANS = 8;
/** 한 방에 들어올 수 있는 사람 수(대기 칸 포함). 방송 한 건의 크기도 이 수로 묶인다. 12 → 16(2026-11-07). */
export const MAX_MEMBERS = 16;
export const FIELD_CHOICES: readonly FieldChoice[] = ['auto', ...FIELD_IDS];

/** 경기장 위 인원(두 편 합) → 경기장 크기. 4명까지 작게, 6명까지 보통, 10명까지 크게, 그 이상 아주 크게(스펙 §1 표). */
export function fieldFor(onPitch: number): FieldId {
  return onPitch <= 4 ? 'S' : onPitch <= 6 ? 'M' : onPitch <= 10 ? 'L' : 'XL';
}

/** 시작하면 편마다 몇 명이 뛰나 — max(그 편 사람 수, perSide). */
export function sideSizes(room: RoomState): [number, number] {
  const h = [0, 1].map((t) => room.members.filter((m) => m.team === t).length);
  return [Math.max(h[0], room.settings.perSide), Math.max(h[1], room.settings.perSide)];
}

/** 그 방 설정으로 시작하면 고를 경기장. */
export function resolveField(room: RoomState): FieldId {
  const f = room.settings.field;
  if (f !== 'auto') return f;
  const [a, b] = sideSizes(room);
  return fieldFor(a + b);
}

/** 시작을 막는 이유. empty = 두 편 모두 0명, humans = 팀 칸 사람이 MAX_HUMANS 초과, roster = 명단이 모자라 봇을 못 채움. */
export function startBlock(room: RoomState, roster: Player[]): 'empty' | 'humans' | 'roster' | null {
  const [a, b] = sideSizes(room);
  if (a + b === 0) return 'empty';
  const humans = room.members.filter((m) => m.team !== null).length;
  if (humans > MAX_HUMANS) return 'humans';
  const taken = new Set(room.members.map((m) => m.num));
  const free = new Set(roster.filter((p) => !taken.has(p.num)).map((p) => p.num)).size;
  if (free < a + b - humans) return 'roster';
  return null;
}
/** 시간·점수 제한의 범위. 설정 화면이 이 안에서만 고르게 하고, 여기서도 한 번 더 자른다(바깥에서 온 값을 믿지 않는다). */
export const MINUTES_RANGE = { min: 1, max: 10 };
export const SCORE_LIMIT_MAX = 20;

// 방 코드 — 0 O 1 I L 은 읽을 때 헷갈려서 뺀다(방장이 말로 불러 줄 때를 위해). 31자 ^ 4 ≈ 92만 가지.
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** 방 코드 — 헷갈리는 글자(0 O 1 I L)를 뺀 대문자·숫자 4자. rnd 는 0..1 난수 함수(바깥에서 받는다). */
export function makeRoomCode(rnd: () => number): string {
  let s = '';
  for (let i = 0; i < 4; i++) {
    const k = Math.min(CODE_CHARS.length - 1, Math.max(0, Math.floor(rnd() * CODE_CHARS.length)));
    s += CODE_CHARS[k];
  }
  return s;
}

export function isRoomCode(s: string): boolean {
  if (typeof s !== 'string' || s.length !== 4) return false;
  for (const c of s) if (!CODE_CHARS.includes(c)) return false;
  return true;
}

export function createRoom(code: string, host: Who): RoomState {
  return {
    code, hostId: host.clientId, phase: 'lobby', rev: 0,
    members: [{ clientId: host.clientId, num: host.num, name: host.name, team: null }],
    settings: { ...DEFAULT_SETTINGS },
    botPicks: [[], []],
  };
}

/** 아무것도 안 고름(전부 무작위). 읽기 전용으로만 쓴다. */
export const NO_PICKS: BotPicks = [[], []];

// ── 봇 고르기(2026-11-07 "그리고 봇도 선수를 고를 수 있게 해줘") ──
/** 고른 봇 목록 하나를 고친다(방과 혼자 연습이 같이 쓰는 순수 함수). slot 번째 봇 자리를 num 으로, null 이면 그 자리를 무작위로 되돌린다.
 *  목록은 빈칸 없이 차례대로라 — slot 이 목록 길이 이상이면 끝에 붙고, null 로 빼면 뒤의 것이 한 칸씩 당겨진다.
 *  못 고르는 선수(allowed 가 거짓, 다른 편·같은 편 다른 자리에 이미 있음)이거나 한 편 MAX_PER_SIDE 를 넘으면 그대로(같은 객체). */
export function updatePicks(picks: BotPicks, side: 0 | 1, slot: number, num: number | null, allowed: (num: number) => boolean): BotPicks {
  if ((side !== 0 && side !== 1) || !Number.isInteger(slot) || slot < 0 || slot >= MAX_PER_SIDE) return picks;
  const list = picks[side];
  if (num === null) {
    if (slot >= list.length) return picks;
    const next = list.filter((_, i) => i !== slot);
    return side === 0 ? [next, picks[1]] : [picks[0], next];
  }
  if (!Number.isInteger(num) || !allowed(num)) return picks;
  if (list[slot] === num) return picks;
  if (picks[1 - side].includes(num) || list.some((n, i) => n === num && i !== slot)) return picks;   // 한 선수는 한 자리만
  let next: number[];
  if (slot < list.length) next = list.map((n, i) => (i === slot ? num : n));
  else if (list.length < MAX_PER_SIDE) next = [...list, num];
  else return picks;
  return side === 0 ? [next, picks[1]] : [picks[0], next];
}

/** 방의 봇 고르기. 명단에 있고(rosterNums), 방 사람 누구의 선수도 아니어야 한다. 안 바뀌면 같은 객체, 바뀌면 rev + 1. */
export function setBotPick(room: RoomState, side: 0 | 1, slot: number, num: number | null, rosterNums: readonly number[]): RoomState {
  const held = new Set(room.members.map((m) => m.num));
  const cur = room.botPicks ?? NO_PICKS;
  const next = updatePicks(cur, side, slot, num, (n) => rosterNums.includes(n) && !held.has(n));
  return next === cur ? room : bump(room, { botPicks: next });
}

/** 사람이 그 선수를 잡으면(들어오기·선수 바꾸기) 봇 목록에서 뺀다. 빠질 게 없으면 같은 배열. */
function withoutHeld(given: BotPicks | undefined, nums: readonly number[]): BotPicks {
  const picks = given ?? NO_PICKS;
  const drop = (l: number[]): number[] => (l.some((n) => nums.includes(n)) ? l.filter((n) => !nums.includes(n)) : l);
  const a = drop(picks[0]), b = drop(picks[1]);
  return a === picks[0] && b === picks[1] ? picks : [a, b];
}

const bump = (room: RoomState, patch: Partial<RoomState>): RoomState => ({ ...room, ...patch, rev: room.rev + 1 });
const teamCount = (members: Member[], team: 0 | 1): number => members.filter((m) => m.team === team).length;

/** 들어오기. 같은 clientId 가 다시 오면(새로고침) 자리를 그대로 두고 선수만 갱신(경기 중엔 선수 갱신도 미룬다).
 *  다른 사람이 쓰는 선수면 'taken'. 정원은 MAX_MEMBERS 'full'. 방장이 없는 방은 'closed'. 새로 온 사람은 대기 칸. */
export function join(room: RoomState, who: Who): JoinResult {
  if (!room.members.some((m) => m.clientId === room.hostId)) return { ok: false, reason: 'closed' };
  const me = room.members.find((m) => m.clientId === who.clientId);
  if (me) {
    if (room.phase !== 'lobby') return { ok: true, room };   // 경기 중 새로고침 — 자리 그대로, 선수는 다음 판에
    const r = pick(room, who.clientId, who.num, who.name);
    // pick 이 같은 객체를 돌려줬는데 이름만 다를 수도 있어(번호는 같고) 그건 pick 이 이미 갱신한다. 막힌 경우만 taken.
    if (r === room && me.num !== who.num) return { ok: false, reason: 'taken' };
    return { ok: true, room: r };
  }
  if (room.members.some((m) => m.num === who.num)) return { ok: false, reason: 'taken' };
  if (room.members.length >= MAX_MEMBERS) return { ok: false, reason: 'full' };
  return { ok: true, room: bump(room, { members: [...room.members, { ...who, team: null }], botPicks: withoutHeld(room.botPicks, [who.num]) }) };
}

export function leave(room: RoomState, clientId: string): RoomState {
  if (!room.members.some((m) => m.clientId === clientId)) return room;
  return bump(room, { members: room.members.filter((m) => m.clientId !== clientId) });
}

/** 선수 바꾸기(로비에서만). 남이 쓰는 선수면 그대로 둔다(같은 객체를 돌려줌). */
export function pick(room: RoomState, clientId: string, num: number, name: string): RoomState {
  if (room.phase !== 'lobby') return room;
  const me = room.members.find((m) => m.clientId === clientId);
  if (!me) return room;
  if (room.members.some((m) => m.clientId !== clientId && m.num === num)) return room;
  if (me.num === num && me.name === name) return room;
  return bump(room, { members: room.members.map((m) => (m === me ? { ...m, num, name } : m)), botPicks: withoutHeld(room.botPicks, [num]) });
}

/** 칸 옮기기. 팀 칸은 한 편 MAX_PER_SIDE(6)명까지 — perSide 는 봇을 채우는 수라 옮기기를 막지 않는다(2026-11-07). 대기 칸(null)은 정원이 없다.
 *  사람 8명 상한(MAX_HUMANS)은 여기서 막지 않고 시작에서 막는다 — 방장이 칸을 정리하는 도중엔 잠깐 넘어도 된다. */
export function move(room: RoomState, clientId: string, team: Team): RoomState {
  const me = room.members.find((m) => m.clientId === clientId);
  if (!me || me.team === team) return room;
  if (team !== null && teamCount(room.members, team) >= MAX_PER_SIDE) return room;
  return bump(room, { members: room.members.map((m) => (m === me ? { ...m, team } : m)) });
}

const clampInt = (v: unknown, lo: number, hi: number, fallback: number): number => {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : fallback;
  return Math.min(hi, Math.max(lo, n));
};

/** 설정 바꾸기. 범위 밖은 자르고, 모르는 경기장 값은 무시한다. perSide 는 봇을 채우는 수라 바꿔도 칸의 사람은 그대로다(2026-11-07). */
export function setSettings(room: RoomState, patch: Partial<RoomSettings>): RoomState {
  const cur = room.settings;
  const next: RoomSettings = {
    perSide: clampInt(patch.perSide ?? cur.perSide, 0, MAX_PER_SIDE, cur.perSide) as PerSide,
    minutes: clampInt(patch.minutes ?? cur.minutes, MINUTES_RANGE.min, MINUTES_RANGE.max, cur.minutes),
    scoreLimit: clampInt(patch.scoreLimit ?? cur.scoreLimit, 0, SCORE_LIMIT_MAX, cur.scoreLimit),
    field: patch.field !== undefined && FIELD_CHOICES.includes(patch.field) ? patch.field : cur.field,
  };
  if (next.perSide === cur.perSide && next.minutes === cur.minutes && next.scoreLimit === cur.scoreLimit && next.field === cur.field) return room;
  return bump(room, { settings: next });
}

/** 종합 능력치 = 여섯 칸의 합. 명단에 없는 선수는 0(배치 전과 같이 친다). */
const strengthOf = (num: number, roster: Player[]): number => {
  const p = roster.find((r) => r.num === num);
  return p ? STAT_KEYS.reduce((s, k) => s + (p[k] > 0 ? p[k] : 0), 0) : 0;
};

/** 사람들을 종합 능력치가 비슷하게 두 팀으로. 넘치는 사람은 대기(들어온 순서대로 앞에서부터 MAX_HUMANS(8)명이 뛴다 —
 *  넷씩이면 한 편 6명 상한에도 안 걸린다).
 *  뛰는 사람은 최대 8명이라 가능한 나눔(2^8)을 전부 살펴 두 팀 합의 차가 가장 작은 것을 고른다 — 인원 차는 1 이하.
 *  같으면 먼저 찾은 것(번호가 작은 쪽 비트)을 써서 결과가 늘 같다. */
export function autoBalance(room: RoomState, roster: Player[]): RoomState {
  const cap = MAX_HUMANS;
  const playing = room.members.slice(0, cap);
  const n = playing.length;
  const str = playing.map((m) => strengthOf(m.num, roster));
  const lo = Math.floor(n / 2), hi = Math.ceil(n / 2);
  let best = -1, bestDiff = Infinity;
  for (let mask = 0; mask < (1 << n); mask++) {
    let c = 0, a = 0, b = 0;
    for (let i = 0; i < n; i++) { if (mask & (1 << i)) { c++; a += str[i]; } else b += str[i]; }
    if (c !== lo && c !== hi) continue;
    const d = Math.abs(a - b);
    if (d < bestDiff) { bestDiff = d; best = mask; }
  }
  const teamOf = new Map<string, Team>();
  playing.forEach((m, i) => teamOf.set(m.clientId, best & (1 << i) ? 1 : 0));
  let changed = false;
  const members = room.members.map((m) => {
    const t: Team = teamOf.has(m.clientId) ? (teamOf.get(m.clientId) as Team) : null;
    if (t === m.team) return m;
    changed = true;
    return { ...m, team: t };
  });
  return changed ? bump(room, { members }) : room;
}

/** 시작 — 두 팀 칸의 사람은 그 선수로(bot:false), 한 편이 perSide 보다 적으면 모자란 만큼 명단에서 무작위로 뽑은 봇으로(방에 있는 선수 제외, 중복 없음).
 *  사용자: "팀원 없으면 봇 추가해서 가능해야지", "최대 인원 같은거 헥스볼처럼 자유롭게" — 두 편 인원이 달라도 되고, 한 편이 0명이어도 된다.
 *  돌려주는 slots[i] = config.players[i] 를 조종하는 clientId(봇이면 null). 대기 칸 사람은 slots 에 없다(구경).
 *  경기장 'auto' 는 여기서 경기장 위 인원으로 정한다(fieldFor).
 *
 *  자리 순서: 0 편 선수들 다음 1 편, id = 배열 순서. 편 안에서 slot 0 이 가장 뒤(수비)라서 사람은 slot 1 부터 채우고 slot 0 은 맨 마지막에 준다 —
 *  사람이 뒤를 비우면 그 편 봇에 수비가 없어진다는 1단계 보고(report-1)의 결정을 따른다. 봇은 남은 slot 을 앞 번호부터.
 *  못 시작하는 경우(startBlock 이 막는 것 — 두 편 0명, 사람 8명 초과, 명단 모자람)는 RangeError. 난수는 rnd 로만. */
export function buildMatch(room: RoomState, roster: Player[], rnd: () => number): { config: MatchConfig; slots: (string | null)[] } {
  const why = startBlock(room, roster);
  if (why) throw new RangeError(why === 'empty' ? '두 편 모두 비어 있다' : why === 'humans' ? '사람이 너무 많다' : '명단이 모자라 봇을 채울 수 없다');
  const sizes = sideSizes(room);
  const humans: Member[][] = [0, 1].map((t) => room.members.filter((m) => m.team === t));
  const taken = new Set(room.members.map((m) => m.num));
  // 고른 봇 — 편마다 봇 자리 수만큼 앞에서부터. 그새 못 쓰게 된 것(명단에 없음·방 사람이 잡음·겹침)은 건너뛴다. 남는 건 안 쓴다.
  const inRoster = new Set(roster.map((p) => p.num));
  const usedPick = new Set<number>();
  const chosen = ([0, 1] as const).map((side) => {
    const need = Math.max(0, sizes[side] - humans[side].length);
    const out: number[] = [];
    for (const n of room.botPicks?.[side] ?? []) {
      if (out.length >= need) break;
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
  const needRandom = ([0, 1] as const).reduce<number>((t, side) => t + Math.max(0, sizes[side] - humans[side].length) - chosen[side].length, 0);
  const strict = uniqFree.filter((n) => !picked.has(n));
  const free = strict.length >= needRandom ? strict : uniqFree;   // 명단이 빠듯하면 남는 고른 선수도 무작위에 넣는다(시작은 막지 않는다)
  const pool = shuffle(free, rnd);
  const players: MatchPlayer[] = [];
  const slots: (string | null)[] = [];
  let k = 0;
  for (const side of [0, 1] as const) {
    const n = sizes[side];
    const humanOrder = [...Array.from({ length: Math.max(0, n - 1) }, (_, i) => i + 1), 0];   // 1, 2, …, n-1, 0
    const bySlot: (Member | null)[] = Array.from({ length: n }, () => null);
    humans[side].forEach((m, i) => { bySlot[humanOrder[i]] = m; });
    let c = 0;
    for (let slot = 0; slot < n; slot++) {
      const m = bySlot[slot], id = players.length;
      const num = m ? m.num : c < chosen[side].length ? chosen[side][c++] : pool[k++];
      const r = roster.find((p) => p.num === num);
      players.push({ id, num, name: m ? m.name : (r?.name ?? String(num)), side, bot: !m, perf: r ? perfOf(r, roster) : { ...BASE_PERF } });
      slots.push(m ? m.clientId : null);
    }
  }
  return { config: { field: resolveField(room), minutes: room.settings.minutes, scoreLimit: room.settings.scoreLimit, players }, slots };
}

export function setPhase(room: RoomState, phase: 'lobby' | 'match'): RoomState {
  return room.phase === phase ? room : bump(room, { phase });
}
