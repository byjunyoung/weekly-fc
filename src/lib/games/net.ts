// src/lib/games/net.ts — 온라인 메시지 모양과 검사(2026-11-06, 모든 게임 공용으로 2026-11-07). 순수.
// 설계: docs/superpowers/specs/2026-11-06-game-online-design.md §2.4, 2026-11-07-games-program-design.md §2
//
// 메시지 종류와 아끼기 규칙(스냅샷 초당 10, 입력은 바뀔 때만, 사람 8명)은 게임이 늘어도 그대로다. 바뀐 건 두 가지:
//   - start 가 게임 종류(game)를 싣는다 — 손님이 어느 어댑터로 예측·검사할지 안다. 예전 탭(game 없는 start)은 이 메시지를 못 읽는다.
//   - 게임마다 다른 것(설정·상태·입력 범위)은 그 게임의 어댑터가 본다. 그래서 이 파일은 2D 경기 계산을 부르지 않는다.
// 검사는 두 단계다. parseMsg 가 겉모양(누가·무엇을·크기)을 보고, 게임 상태처럼 "지금 판"을 알아야 하는 것은 세션이 acceptSnap·acceptIn 으로 본다 —
// 손님은 seed 로 "다른 판의 스냅샷"을 먼저 알아봐야 해서(놓친 start 따라잡기), 상태 검사를 그 뒤에 둔다.
import type { RoomState } from '../game/room.ts';
import { MAX_MEMBERS, MAX_PER_SIDE, isRoomCode } from '../game/room.ts';
import type { AnyAdapter } from './adapter.ts';
import type { GameLookup } from './entry.ts';

// 방장이 보내는 것(deny·room·start·snap·stop·pong)에도 from(= 방장 clientId)을 싣는다 — 손님은 처음 받은 방의 hostId 와 같은 from 만 믿는다.
// room 의 sid = 방장 세션 고유값(방장 탭이 새로 열릴 때마다 새로). 방장이 새로고침하면 rev 가 0 부터라, sid 가 바뀌면 손님이 rev 비교를 새로 시작한다.
// snap·stop 의 seed = 그 경기의 씨앗 — 손님이 놓친 start 뒤의 낡은 예측기를 알아보게(2026-11-07 리뷰).
// snap 의 state·start 의 config 모양은 게임마다 다르다 — 여기선 unknown, 검사를 거친 뒤 세션이 그 게임의 타입으로 쓴다.
export type NetMsg =
  | { t: 'hello'; from: string; num: number; name: string }
  | { t: 'deny'; from: string; to: string; reason: 'taken' | 'full' | 'closed' }
  | { t: 'room'; from: string; sid: string; room: RoomState; roster: number[] }
  | { t: 'pick'; from: string; num: number; name: string }
  | { t: 'start'; from: string; game: string; config: unknown; seed: number }
  | { t: 'in'; from: string; seq: number; i: number }
  | { t: 'snap'; from: string; seed: number; tick: number; state: unknown; inputs: number[]; paused: boolean }
  | { t: 'stop'; from: string; seed: number }
  | { t: 'say'; from: string; id: number; k: number }
  | { t: 'ping'; from: string; at: number } | { t: 'pong'; from: string; to: string; at: number }
  | { t: 'bye'; from: string };

/** 어느 게임이든 한 판의 입력 자리는 이 수까지 — 방 정원(MAX_MEMBERS)과 같다. 크기를 부풀려 먹통 만들기를 겉에서 막는 선. */
export const MAX_SLOTS = MAX_MEMBERS;
/** 어느 게임이든 입력 정수는 이 밑. 게임마다의 정확한 범위(어댑터 codes)는 acceptIn·acceptSnap 이 본다.
 *  4096 → 131072(2026-11-07 4단계): 3D 경기 입력은 움직임 33 × 동작 키 32 × 1인칭 보는 방향 65 = 68,640 가지다(src/lib/game3d/quant.ts).
 *  여전히 정수 하나라 메시지 크기는 몇 글자 차이다. */
export const MAX_CODES = 131072;
const MAX_ROSTER = 200, MAX_STR = 64, MAX_GAME_ID = 32;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isInt = (v: unknown, lo = -Infinity, hi = Infinity): v is number => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;
const isStr = (v: unknown, max = MAX_STR): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;
const isName = (v: unknown): v is string => typeof v === 'string' && v.length <= 24;
const isArr = (v: unknown, max: number): v is unknown[] => Array.isArray(v) && v.length <= max;

function okMember(m: unknown): boolean {
  return isObj(m) && isStr(m.clientId) && isInt(m.num, 0) && isName(m.name) && (m.team === 0 || m.team === 1 || m.team === null);
}
/** 방 — 사람·칸·단계는 여기서, 설정은 그 게임의 okSettings 로. 모르는 게임(지금 것이든 saved 에 든 것이든)이면 받지 않는다. */
function okRoom(r: unknown, games: GameLookup): boolean {
  if (!isObj(r)) return false;
  if (!(typeof r.code === 'string' && isRoomCode(r.code) && isStr(r.hostId) && isInt(r.rev, 0)
    && (r.phase === 'lobby' || r.phase === 'match')
    && isArr(r.members, MAX_MEMBERS) && r.members.every(okMember)
    && (r.botPicks === undefined || okPicks(r.botPicks)))) return false;
  const g = isStr(r.game, MAX_GAME_ID) ? games(r.game) : undefined;
  if (!g || !g.okSettings(r.settings)) return false;
  if (!isObj(r.saved)) return false;
  const saved = Object.entries(r.saved);
  return saved.length <= 16 && saved.every(([id, v]) => id !== r.game && !!games(id)?.okSettings(v));
}
/** 고른 봇 — 두 편 배열, 각각 한 편 최대 인원 이하의 0 이상 정수. 없으면(예전 방장) 빈 둘로 읽는다(parseMsg). */
function okPicks(b: unknown): boolean {
  return Array.isArray(b) && b.length === 2 && b.every((l) => isArr(l, MAX_PER_SIDE) && l.every((n) => isInt(n, 0)));
}

/** 메시지 검사 — 바깥에서 온 JSON 을 믿지 않는다. 모양이 틀리면 null. games = 등록된 게임 찾기(room·start 가 게임 id 를 싣는다). */
export function parseMsg(raw: unknown, games: GameLookup): NetMsg | null {
  if (!isObj(raw) || typeof raw.t !== 'string') return null;
  const m = raw;
  switch (m.t) {
    case 'hello': case 'pick':
      return isStr(m.from) && isInt(m.num, 0) && isName(m.name) ? (raw as NetMsg) : null;
    case 'deny':
      return isStr(m.from) && isStr(m.to) && (m.reason === 'taken' || m.reason === 'full' || m.reason === 'closed') ? (raw as NetMsg) : null;
    case 'room':
      if (!(isStr(m.from) && isStr(m.sid) && okRoom(m.room, games) && isArr(m.roster, MAX_ROSTER) && m.roster.every((n) => isInt(n, 0)))) return null;
      // botPicks 가 없는 방(봇 고르기 전의 방장) — 빈 둘로 채워 넘긴다. 모양을 고치는 건 여기 한 곳뿐이다.
      if ((m.room as Record<string, unknown>).botPicks === undefined) return { ...(raw as Extract<NetMsg, { t: 'room' }>), room: { ...(m.room as RoomState), botPicks: [[], []] } };
      return raw as NetMsg;
    case 'start': {
      const g = isStr(m.game, MAX_GAME_ID) ? games(m.game) : undefined;
      return isStr(m.from) && !!g && g.adapter.okConfig(m.config) && isNum(m.seed) ? (raw as NetMsg) : null;
    }
    case 'in':
      return isStr(m.from) && isInt(m.seq, 0) && isInt(m.i, 0, MAX_CODES - 1) ? (raw as NetMsg) : null;
    case 'snap':
      return isStr(m.from) && isNum(m.seed) && isInt(m.tick, 0) && isObj(m.state) && isArr(m.inputs, MAX_SLOTS) && m.inputs.every((q) => isInt(q, 0, MAX_CODES - 1))
        && typeof m.paused === 'boolean' ? (raw as NetMsg) : null;
    case 'stop': return isStr(m.from) && isNum(m.seed) ? (raw as NetMsg) : null;
    case 'say':
      return isStr(m.from) && isInt(m.id, 0, MAX_SLOTS - 1) && isInt(m.k, 0, PHRASES.length - 1) ? (raw as NetMsg) : null;
    case 'ping': return isStr(m.from) && isNum(m.at) ? (raw as NetMsg) : null;
    case 'pong': return isStr(m.from) && isStr(m.to) && isNum(m.at) ? (raw as NetMsg) : null;
    case 'bye': return isStr(m.from) ? (raw as NetMsg) : null;
    default: return null;
  }
}

/** 손님 입력이 이 게임의 입력인가(정수 범위). 방장이 받은 in 에 쓴다. */
export function acceptIn(game: AnyAdapter, m: Extract<NetMsg, { t: 'in' }>): boolean {
  return m.i < game.codes;
}

/** 스냅샷이 지금 판과 맞는가 — 상태는 그 게임의 okState(설정과 맞는지까지), 입력은 자리 수 이하·그 게임의 범위.
 *  손님이 seed 로 "같은 판"을 확인한 뒤 부른다. 어긋난 스냅샷은 버린다 — step·그리기가 프레임마다 예외를 던지지 않게. */
export function acceptSnap<C>(game: AnyAdapter, config: C, m: Extract<NetMsg, { t: 'snap' }>): boolean {
  return game.okState(m.state, config) && m.inputs.length <= game.slots(config) && m.inputs.every((q) => q < game.codes);
}

/** 받은 스냅샷을 그 게임 상태로 — 줄여 보낸 게임(어댑터 pack)이면 unpack 으로 되돌리고, 그다음 acceptSnap 으로 본다.
 *  어긋나면 null(버린다). 손님 세션이 snap 을 받을 때 이것 하나를 부른다(2026-11-07 4단계). */
export function readSnap<C>(game: AnyAdapter, config: C, m: Extract<NetMsg, { t: 'snap' }>): Extract<NetMsg, { t: 'snap' }> | null {
  let state: unknown = m.state;
  if (game.unpack) {
    try { state = game.unpack(m.state, config); } catch { return null; }
    if (state === null) return null;
  }
  const out = state === m.state ? m : { ...m, state };
  return acceptSnap(game, config, out) ? out : null;
}

/** 한마디 문구(스펙 §3). 메시지의 k 는 이 배열의 번호다. */
export const PHRASES: readonly string[] = ['나이스', '패스!', 'ㅋㅋㅋ', '미안', '가자', '수비!'];
