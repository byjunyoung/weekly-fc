// src/react/game/net/common.ts — 방장 세션·손님 세션이 함께 쓰는 약속과 작은 도구(2026-11-06).
// 설계: docs/superpowers/specs/2026-11-06-game-online-design.md §2.4~§2.6
//
// 사용자: "2단계 온라인으로 넘어가자", "haxball 시스템 벤치마킹해" — 가져온 건 방 구조(방장이 계산, 두 팀 칸 + 대기 칸)뿐이다.
// 세션은 리액트가 아닌 보통 객체다. 바깥과 닿는 곳은 둘뿐:
//   ① transport.onMessage → 받은 것(parseMsg 로 거른 뒤)
//   ② advance(now)        → 시간에 따라 할 일 전부(60틱 계산, 스냅샷 주기, 방 상태 재전송, hello·ping·살아 있음 알림, 침묵 검사)
// 세션 안에는 setTimeout·setInterval·performance.now 가 없다. 브라우저에선 rAF + 느슨한 interval 이 advance 를 부르고,
// node 테스트는 가짜 시계로 같은 advance 를 한 칸씩 부른다 — 그래서 방장·손님 흐름을 브라우저 없이 끝까지 돌려 볼 수 있다.
import type { MatchConfig, MatchState } from '../../../lib/game/sim.ts';
import { TICK_HZ } from '../../../lib/game/sim.ts';
import type { NetMsg } from '../../../lib/game/net.ts';
import { PHRASES } from '../../../lib/game/net.ts';
import type { RoomState } from '../../../lib/game/room.ts';
import type { ConnStatus } from './transport.ts';

// ── 박자(ms) — 무료 한도(프로젝트 전체 메시지 수)가 있어 "적게 보낸다"(스펙 §1) ──
export const STEP_MS = 1000 / TICK_HZ;
/** 한 번에 따라잡는 최대 틱(1단계와 같다) — 느린 기기가 계산에 먹혀 더 느려지는 걸 막는다. */
export const MAX_CATCHUP = 5;
/** 스냅샷은 6틱마다(초당 10번). 골·끝 같은 단계 전환 틱엔 바로 한 번 더. */
export const SNAP_EVERY = 6;
export const ROOM_EVERY_MS = 1000;
export const HELLO_EVERY_MS = 1000;
export const PING_EVERY_MS = 2000;
export const KEEPALIVE_MS = 500;
/** 이만큼 아무 말이 없으면 나간 것으로 친다(경기 중이면 그 자리를 봇이 맡는다). */
export const SILENCE_MS = 4000;
/** 방장 화면이 가려진 동안 "멈춤" 스냅샷을 보내는 간격. */
export const PAUSED_SNAP_MS = 1000;
/** 경기가 끝나고 결과를 보여 주는 시간 — 그 뒤 모두 방으로. */
export const RESULT_MS = 4000;
/** 한마디: 한 사람이 1.5초에 한 번, 말풍선은 2초. */
export const SAY_GAP_MS = 1500;
export const BUBBLE_MS = 2000;
/** 손님이 방장을 이만큼 못 찾으면 "방장을 찾는 중" 안내를 띄운다(그래도 계속 찾는다). */
export const JOIN_SLOW_MS = 5000;

export type Role = 'host' | 'guest';
/** joining = 들어가는 중(손님), lobby = 방, match = 경기(결과 화면 포함), ended = 끝(나갔거나 끊김 — 이유는 endedWhy). */
export type Stage = 'joining' | 'lobby' | 'match' | 'ended';
export type Result = { score: [number, number]; winner: 0 | 1 | 'draw' };

/** 화면(리액트)이 구독하는 값. 바뀔 때만 새 객체가 된다 — 프레임마다 바뀌지 않는다. */
export type SessionView = {
  role: Role;
  code: string;
  clientId: string;
  room: RoomState | null;
  conn: ConnStatus;
  stage: Stage;
  /** 경기마다 하나씩 커지는 번호(경기 화면을 새로 마운트하는 key). */
  matchKey: number;
  config: MatchConfig | null;
  /** 이번 경기에서 내가 조종하는 선수 id. 구경(대기 칸·경기 중 들어옴)이면 null. */
  myId: number | null;
  /** 방장이 자리를 비워 경기가 멈췄나(손님 화면 안내). 방장 자신에겐 늘 false. */
  paused: boolean;
  /** 방장과 연결이 4초 넘게 끊겼나(손님). */
  hostLost: boolean;
  result: Result | null;
  /** 잠깐 띄울 안내(거절·시작 못 함 등). 없으면 null. */
  notice: string | null;
  /** stage 가 ended 일 때 그 이유(입장 화면에 띄운다). */
  endedWhy: string | null;
  /** 손님: 방장을 오래 못 찾는 중. */
  joinSlow: boolean;
};

export type Bubble = { id: number; k: number; until: number };
/** 한 프레임 그릴 것. state 는 바로 drawFrame 에 넣을 수 있게 조립된 것(손님은 예측한 몸 + 스냅샷의 점수·시계·단계). */
export type DrawFrame = { state: MatchState; config: MatchConfig; myId: number | null; bubbles: { id: number; text: string }[] };

export type NetInfo = { status: string; rttMs: number | null; lead: number | null; myId: number | null };

export const DENY_TEXT: Record<'taken' | 'full' | 'closed', string> = {
  taken: '이미 다른 사람이 고른 선수입니다',
  full: '방이 가득 찼습니다',
  closed: '방이 닫혔습니다',
};

/** 구독 묶음 — 값이 바뀌었다고 알릴 때만 새 view 를 만들어 useSyncExternalStore 가 다시 그리게. */
export function createStore<V>(initial: V): { get(): V; set(patch: Partial<V>): void; subscribe(fn: () => void): () => void } {
  let v = initial;
  const subs = new Set<() => void>();
  return {
    get: () => v,
    set(patch) {
      let changed = false;
      for (const k in patch) if (!Object.is((v as Record<string, unknown>)[k], (patch as Record<string, unknown>)[k])) { changed = true; break; }
      if (!changed) return;
      v = { ...v, ...patch };
      for (const f of [...subs]) f();
    },
    subscribe(fn) { subs.add(fn); return () => { subs.delete(fn); }; },
  };
}

/** 한마디가 진짜 그 사람의 선수에서 나온 건지 — 보낸 clientId 의 선수 번호와 경기 속 id 의 선수 번호가 같아야 한다.
 *  누가 남의 선수 머리 위에 말을 띄우지 못하게(채널은 익명 키로 누구나 보낼 수 있다). */
export function sayIsValid(room: RoomState | null, config: MatchConfig | null, m: Extract<NetMsg, { t: 'say' }>): boolean {
  if (!room || !config) return false;
  const who = room.members.find((x) => x.clientId === m.from);
  const p = config.players[m.id];
  return !!who && !!p && !p.bot && p.num === who.num && m.k >= 0 && m.k < PHRASES.length;
}

/** 살아 있는 말풍선만 남기고 그릴 글자로. */
export function liveBubbles(list: Bubble[], now: number): { id: number; text: string }[] {
  return list.filter((b) => b.until > now).map((b) => ({ id: b.id, text: PHRASES[b.k] ?? '' }));
}

/** 같은 선수의 말풍선은 새 것 하나만. */
export function pushBubble(list: Bubble[], id: number, k: number, now: number): Bubble[] {
  return [...list.filter((b) => b.id !== id && b.until > now), { id, k, until: now + BUBBLE_MS }];
}

