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
import type { MatchConfig, MatchPlayer } from './sim.ts';
import { BASE_PERF, perfOf } from './stats.ts';
import { shuffle } from './lineup.ts';

export type Team = 0 | 1 | null;                                  // null = 대기 칸
export type Member = { clientId: string; num: number; name: string; team: Team };
export type RoomSettings = { perSide: 1 | 2 | 3 | 4; minutes: number; scoreLimit: number };
export type RoomState = { code: string; hostId: string; members: Member[]; settings: RoomSettings; phase: 'lobby' | 'match'; rev: number };
export type Who = { clientId: string; num: number; name: string };
export type JoinResult = { ok: true; room: RoomState } | { ok: false; reason: 'taken' | 'full' | 'closed' };

/** 3대3 · 3분 · 점수 제한 없음(0). 1단계 기본값과 같다. */
export const DEFAULT_SETTINGS: RoomSettings = { perSide: 3, minutes: 3, scoreLimit: 0 };
/** 한 방에 들어올 수 있는 사람 수(뛰는 8 + 구경). 방송 한 건의 크기도 이 수로 묶인다. */
export const MAX_MEMBERS = 12;
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
  };
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
  return { ok: true, room: bump(room, { members: [...room.members, { ...who, team: null }] }) };
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
  return bump(room, { members: room.members.map((m) => (m === me ? { ...m, num, name } : m)) });
}

/** 칸 옮기기. 팀 칸 정원(perSide)이 찼으면 옮기지 않는다. 대기 칸(null)은 정원이 없다. */
export function move(room: RoomState, clientId: string, team: Team): RoomState {
  const me = room.members.find((m) => m.clientId === clientId);
  if (!me || me.team === team) return room;
  if (team !== null && teamCount(room.members, team) >= room.settings.perSide) return room;
  return bump(room, { members: room.members.map((m) => (m === me ? { ...m, team } : m)) });
}

const clampInt = (v: unknown, lo: number, hi: number, fallback: number): number => {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : fallback;
  return Math.min(hi, Math.max(lo, n));
};

/** 설정 바꾸기. perSide 를 줄여 팀 칸이 넘치면 뒤에 온 사람부터 대기 칸으로(members 배열 순서 = 들어온 순서). */
export function setSettings(room: RoomState, patch: Partial<RoomSettings>): RoomState {
  const cur = room.settings;
  const next: RoomSettings = {
    perSide: clampInt(patch.perSide ?? cur.perSide, 1, 4, cur.perSide) as 1 | 2 | 3 | 4,
    minutes: clampInt(patch.minutes ?? cur.minutes, MINUTES_RANGE.min, MINUTES_RANGE.max, cur.minutes),
    scoreLimit: clampInt(patch.scoreLimit ?? cur.scoreLimit, 0, SCORE_LIMIT_MAX, cur.scoreLimit),
  };
  const seen = [0, 0];
  let moved = false;
  const members = room.members.map((m) => {
    if (m.team === null) return m;
    if (++seen[m.team] <= next.perSide) return m;
    moved = true;
    return { ...m, team: null as Team };
  });
  if (!moved && next.perSide === cur.perSide && next.minutes === cur.minutes && next.scoreLimit === cur.scoreLimit) return room;
  return bump(room, { settings: next, members: moved ? members : room.members });
}

/** 종합 능력치 = 여섯 칸의 합. 명단에 없는 선수는 0(배치 전과 같이 친다). */
const strengthOf = (num: number, roster: Player[]): number => {
  const p = roster.find((r) => r.num === num);
  return p ? STAT_KEYS.reduce((s, k) => s + (p[k] > 0 ? p[k] : 0), 0) : 0;
};

/** 사람들을 종합 능력치가 비슷하게 두 팀으로. 넘치는 사람은 대기(들어온 순서대로 앞에서부터 2*perSide 명이 뛴다).
 *  뛰는 사람은 최대 8명이라 가능한 나눔(2^8)을 전부 살펴 두 팀 합의 차가 가장 작은 것을 고른다 — 인원 차는 1 이하.
 *  같으면 먼저 찾은 것(번호가 작은 쪽 비트)을 써서 결과가 늘 같다. */
export function autoBalance(room: RoomState, roster: Player[]): RoomState {
  const cap = room.settings.perSide * 2;
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

/** 시작 — 두 팀 칸의 사람은 그 선수로(bot:false), 모자란 자리는 명단에서 무작위로 뽑은 봇으로(방에 있는 선수 제외, 중복 없음).
 *  사용자: "팀원 없으면 봇 추가해서 가능해야지". 사람이 한 명도 없는 팀도 된다(전부 봇).
 *  돌려주는 slots[i] = config.players[i] 를 조종하는 clientId(봇이면 null). 대기 칸 사람은 slots 에 없다(구경).
 *
 *  자리 순서: id = side * perSide + slot. slot 0 이 가장 뒤(수비)라서 사람은 slot 1 부터 채우고 slot 0 은 맨 마지막에 준다 —
 *  사람이 뒤를 비우면 그 편 봇에 수비가 없어진다는 1단계 보고(report-1)의 결정을 따른다. 봇은 남은 slot 을 앞 번호부터.
 *  명단이 모자라 봇을 못 채우면 RangeError(겹치게 뽑지 않는다). 난수는 rnd 로만 — 같은 난수열이면 같은 라인업. */
export function buildMatch(room: RoomState, roster: Player[], rnd: () => number): { config: MatchConfig; slots: (string | null)[] } {
  const ps = room.settings.perSide;
  const humans: Member[][] = [0, 1].map((t) => room.members.filter((m) => m.team === t).slice(0, ps));
  const taken = new Set(room.members.map((m) => m.num));
  const seenNum = new Set<number>();
  const free = roster.filter((p) => !taken.has(p.num) && !seenNum.has(p.num) && (seenNum.add(p.num), true)).map((p) => p.num);
  const needBots = humans.reduce((s, h) => s + (ps - h.length), 0);
  if (free.length < needBots) throw new RangeError('명단이 모자라 봇을 채울 수 없다');
  const pool = shuffle(free, rnd);
  const humanOrder = [...Array.from({ length: ps - 1 }, (_, i) => i + 1), 0];   // 1, 2, …, ps-1, 0
  const players: MatchPlayer[] = [];
  const slots: (string | null)[] = [];
  let k = 0;
  for (const side of [0, 1] as const) {
    const bySlot: (Member | null)[] = Array.from({ length: ps }, () => null);
    humans[side].forEach((m, i) => { bySlot[humanOrder[i]] = m; });
    for (let slot = 0; slot < ps; slot++) {
      const m = bySlot[slot], id = side * ps + slot;
      const num = m ? m.num : pool[k++];
      const r = roster.find((p) => p.num === num);
      players.push({ id, num, name: m ? m.name : (r?.name ?? String(num)), side, bot: !m, perf: r ? perfOf(r, roster) : { ...BASE_PERF } });
      slots.push(m ? m.clientId : null);
    }
  }
  return { config: { perSide: ps, minutes: room.settings.minutes, scoreLimit: room.settings.scoreLimit, players }, slots };
}

export function setPhase(room: RoomState, phase: 'lobby' | 'match'): RoomState {
  return room.phase === phase ? room : bump(room, { phase });
}
