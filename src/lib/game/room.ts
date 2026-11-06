// src/lib/game/room.ts — 온라인 방의 상태와 그 변화(2026-11-06). 순수 — 화면·시계·네트워크·난수 함수를 부르지 않는다.
// 설계: docs/superpowers/specs/2026-11-06-game-online-design.md §2.3
//
// 사용자: "2단계 온라인으로 넘어가자", "팀원 없으면 봇 추가해서 가능해야지", "haxball 시스템 벤치마킹해".
// haxball 에서 가져온 건 방 구조뿐이다 — 두 팀 칸 + 대기 칸, 방장이 사람을 옮기고 시작한다.
//
// 2026-11-07 게임 묶음(스펙 2026-11-07-games-program-design.md §2): "자유 훈련장, 여러 드리블 훈련장, 승부차기, 프리킥 같은 게임 만들어서
// 온라인 가능하게 하자." — 한 방에서 게임 종류를 바꿔 가며 논다(초대 링크는 하나). 그래서 이 파일은 어느 게임에도 쓰는 방만 맡는다:
// 사람·칸·선수·봇 고르기·게임 종류·단계. 게임마다의 설정 규칙과 시작(경기 설정 만들기)은 그 게임 쪽(src/lib/games/<게임>-room.ts)이다.
// 이 파일은 게임 등록부를 부르지 않는다 — 등록부가 게임을, 게임이 이 파일을 부르므로(돌고 도는 import 를 만들지 않으려고).
//
// 규칙 하나: 상태를 바꾸는 함수는 새 객체(rev + 1)를, 바뀐 게 없으면 받은 객체 그대로를 돌려준다.
// 부르는 쪽이 `next === room` 으로 "보낼 게 없다"를 알게 하려는 것이다(방송 한도가 빠듯하다).
import type { Player } from '../types.ts';
import { STAT_KEYS } from '../types.ts';

export type Team = 0 | 1 | null;                                  // null = 대기 칸
export type Member = { clientId: string; num: number; name: string; team: Team };
/** botPicks = 편마다 봇 자리에 세울 선수(명단 num)를 고른 차례대로. 비면 지금처럼 무작위(2026-11-07 "그리고 봇도 선수를 고를 수 있게 해줘").
 *  고른 수가 봇 자리보다 많으면 남는 건 안 쓰이지만 지우지 않는다 — "봇으로 채움" 수를 줄였다 늘려도 고른 게 남게. */
export type BotPicks = [number[], number[]];
/** game = 지금 고른 게임 종류(등록부 id), settings = 그 게임의 설정(모양은 게임마다 — 그 게임의 okSettings 가 검사한다).
 *  saved = 다른 게임들의 설정(게임 id → 설정). 게임을 바꾸면 지금 설정은 saved 로 들어가고, 돌아오면 거기서 꺼낸다 —
 *  승부차기를 한 판 하고 경기로 돌아와도 경기 설정이 그대로 남게. settings 를 "지금 게임의 것" 하나로 둔 이유: 게임마다 설정 타입이
 *  그 게임 것 그대로라 읽는 쪽(경기의 sideSizes 등)이 게임 id 로 한 번 더 찾지 않아도 된다. */
export type RoomState<T = unknown> = {
  code: string; hostId: string; members: Member[];
  game: string; settings: T; saved: Record<string, unknown>;
  phase: 'lobby' | 'match'; rev: number; botPicks: BotPicks;
};
export type Who = { clientId: string; num: number; name: string };
export type JoinResult<T = unknown> = { ok: true; room: RoomState<T> } | { ok: false; reason: 'taken' | 'full' | 'closed' };

// 2026-11-07 "최대 인원 같은거 헥스볼처럼 자유롭게 맵 크기도 크기별로 하고" — 팀 인원은 자유(두 편이 달라도 된다).
// 한계는 연결 방식에서 나온다(스펙 2026-11-07-game-fields-teams-design.md §0 실측: 프로젝트 전체 초당 ~86건에서 채널이 닫힘).
/** 한 편 최대 인원(사람 + 봇) — 방의 팀 칸 정원이기도 하다. */
export const MAX_PER_SIDE = 6;
/** 한 경기에 직접 뛰는 사람 수 상한 — 봇은 메시지를 안 쓰므로 여기에 안 든다. 모든 게임이 지킨다(게임 묶음 스펙 §5). */
export const MAX_HUMANS = 8;
/** 한 방에 들어올 수 있는 사람 수(대기 칸 포함). 방송 한 건의 크기도 이 수로 묶인다. 12 → 16(2026-11-07). */
export const MAX_MEMBERS = 16;

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

/** 방 만들기 — 방장만, 대기 칸. game·settings = 처음 고른 게임과 그 게임의 기본 설정(부르는 쪽이 등록부에서 꺼내 준다). */
export function createRoom<T>(code: string, host: Who, game: string, settings: T): RoomState<T> {
  return {
    code, hostId: host.clientId, phase: 'lobby', rev: 0,
    members: [{ clientId: host.clientId, num: host.num, name: host.name, team: null }],
    game, settings: structuredClone(settings), saved: {},
    botPicks: [[], []],
  };
}

/** 게임 바꾸기(로비에서만 — 부르는 쪽이 막는다). 지금 설정은 saved 로, 그 게임의 지난 설정(없으면 fresh = 기본값)을 꺼낸다.
 *  같은 게임이면 그대로(같은 객체). */
export function setGame(room: RoomState, game: string, fresh: unknown): RoomState {
  if (room.game === game) return room;
  const { [game]: back, ...rest } = room.saved;
  return bump(room, { game, settings: back !== undefined ? back : structuredClone(fresh), saved: { ...rest, [room.game]: room.settings } });
}

/** 지금 게임의 설정을 next 로. 게임 쪽 규칙(범위 자르기)을 거친 값을 받는다 — 같은 객체면 바뀐 게 없는 것. */
export function withSettings<T>(room: RoomState<T>, next: T): RoomState<T> {
  return next === room.settings ? room : bump(room, { settings: next });
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
export function setBotPick<T>(room: RoomState<T>, side: 0 | 1, slot: number, num: number | null, rosterNums: readonly number[]): RoomState<T> {
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const bump = <R extends RoomState<any>>(room: R, patch: Partial<R>): R => ({ ...room, ...patch, rev: room.rev + 1 });
const teamCount = (members: Member[], team: 0 | 1): number => members.filter((m) => m.team === team).length;

/** 들어오기. 같은 clientId 가 다시 오면(새로고침) 자리를 그대로 두고 선수만 갱신(경기 중엔 선수 갱신도 미룬다).
 *  다른 사람이 쓰는 선수면 'taken'. 정원은 MAX_MEMBERS 'full'. 방장이 없는 방은 'closed'. 새로 온 사람은 대기 칸. */
export function join<T>(room: RoomState<T>, who: Who): JoinResult<T> {
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

export function leave<T>(room: RoomState<T>, clientId: string): RoomState<T> {
  if (!room.members.some((m) => m.clientId === clientId)) return room;
  return bump(room, { members: room.members.filter((m) => m.clientId !== clientId) });
}

/** 선수 바꾸기(로비에서만). 남이 쓰는 선수면 그대로 둔다(같은 객체를 돌려줌). */
export function pick<T>(room: RoomState<T>, clientId: string, num: number, name: string): RoomState<T> {
  if (room.phase !== 'lobby') return room;
  const me = room.members.find((m) => m.clientId === clientId);
  if (!me) return room;
  if (room.members.some((m) => m.clientId !== clientId && m.num === num)) return room;
  if (me.num === num && me.name === name) return room;
  return bump(room, { members: room.members.map((m) => (m === me ? { ...m, num, name } : m)), botPicks: withoutHeld(room.botPicks, [num]) });
}

/** 칸 옮기기. 팀 칸은 한 편 MAX_PER_SIDE(6)명까지 — perSide 는 봇을 채우는 수라 옮기기를 막지 않는다(2026-11-07). 대기 칸(null)은 정원이 없다.
 *  사람 8명 상한(MAX_HUMANS)은 여기서 막지 않고 시작에서 막는다 — 방장이 칸을 정리하는 도중엔 잠깐 넘어도 된다. */
export function move<T>(room: RoomState<T>, clientId: string, team: Team): RoomState<T> {
  const me = room.members.find((m) => m.clientId === clientId);
  if (!me || me.team === team) return room;
  if (team !== null && teamCount(room.members, team) >= MAX_PER_SIDE) return room;
  return bump(room, { members: room.members.map((m) => (m === me ? { ...m, team } : m)) });
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
export function autoBalance<T>(room: RoomState<T>, roster: Player[]): RoomState<T> {
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

export function setPhase<T>(room: RoomState<T>, phase: 'lobby' | 'match'): RoomState<T> {
  return room.phase === phase ? room : bump(room, { phase });
}
