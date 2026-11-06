// src/react/game/net/common.ts — 방장 세션·손님 세션이 함께 쓰는 약속과 작은 도구(2026-11-06).
// 설계: docs/superpowers/specs/2026-11-06-game-online-design.md §2.4~§2.6
//
// 사용자: "2단계 온라인으로 넘어가자", "haxball 시스템 벤치마킹해" — 가져온 건 방 구조(방장이 계산, 두 팀 칸 + 대기 칸)뿐이다.
// 세션은 리액트가 아닌 보통 객체다. 바깥과 닿는 곳은 둘뿐:
//   ① transport.onMessage → 받은 것(parseMsg 로 거른 뒤)
//   ② advance(now)        → 시간에 따라 할 일 전부(60틱 계산, 스냅샷 주기, 방 상태 재전송, hello·ping·살아 있음 알림, 침묵 검사)
// 세션 안에는 setTimeout·setInterval·performance.now 가 없다. 브라우저에선 rAF + 느슨한 interval 이 advance 를 부르고,
// node 테스트는 가짜 시계로 같은 advance 를 한 칸씩 부른다 — 그래서 방장·손님 흐름을 브라우저 없이 끝까지 돌려 볼 수 있다.
// 2026-11-07 게임 묶음(스펙 2026-11-07-games-program-design.md §2): 세션은 어댑터만 보고 돈다 — 게임 상태·설정은 unknown 으로 받아
// 그 게임의 어댑터·화면이 자기 타입으로 읽는다. 2D 경기 계산은 부르지 않는다(테스트가 가짜 게임으로 세션을 끝까지 돌려 본다).
import type { AnyAdapter } from '../../../lib/games/adapter.ts';
import { TICK_HZ } from '../../../lib/games/adapter.ts';
import type { NetMsg } from '../../../lib/games/net.ts';
import { PHRASES } from '../../../lib/games/net.ts';
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
/** 경기 중 손님이 이만큼 조용하면 그 자리를 봇이 맡는다(말이 다시 오면 돌려준다). */
export const SILENCE_MS = 4000;
// 2026-11-07 리뷰: 폰에서 앱을 잠깐 바꾸면(카톡으로 링크 보내러 나갔다 오기 — 기본 흐름이다) 4초 한도로는 쫓겨났다. 내보내는 한도는 길게.
/** 로비에서 손님이 이만큼 조용하면 명단에서 뺀다. */
export const LOBBY_SILENCE_MS = 30000;
/** 손님이 방장을 포기하는 침묵 — 로비 30초, 경기 중 20초. 3초가 넘으면 안내 띠만 띄운다. */
export const HOST_SILENCE_LOBBY_MS = 30000;
export const HOST_SILENCE_MATCH_MS = 20000;
export const HOST_SLOW_MS = 3000;
// 무료 메시지 한도는 프로젝트 전체가 나눠 쓴다 — 잊힌 탭이 끝없이 보내지 않게.
/** 방장 탭이 이만큼 가려져 있으면 경기를 접고 주기 방송을 멈춘다. 손님도 이만큼 못 들어가거나 방장이 멈춰 있으면 나온다. */
export const GIVE_UP_MS = 180000;
/** 가려진 방장의 로비 방 상태 주기. */
export const HIDDEN_ROOM_EVERY_MS = 5000;
/** 같은 clientId 의 hello 는 이 안에 다시 오면 무시한다(hello 하나에 room·start·snap 세 건이 나간다). */
export const HELLO_DEDUPE_MS = 900;
/** 입력이 바뀌어도 마지막 전송에서 이만큼은 띄운다(킥 여부가 바뀐 경우는 바로). 떨리는 스틱이 초당 60건을 보내지 않게. */
export const IN_MIN_GAP_MS = 50;
/** 손님 한 명당 늘리는 입력 간격(ms). 2026-11-07 실측: 프로젝트 전체 초당 ~86건에서 채널이 닫힌다 — 사람이 많을수록 각자 덜 보낸다. */
export const IN_GAP_PER_GUEST_MS = 28;
/** 손님 입력의 최소 간격 = max(50, 손님 수 × 28)ms. 손님 수 = 그 경기의 사람 수 − 1(방장). 7명이면 196ms —
 *  방장이 보는 남의 조작은 조금 굼떠지지만 자기 화면은 예측이라 그대로다(스펙 2026-11-07 §4). */
export function inputGapMs(humans: number): number {
  const guests = Math.max(0, Math.floor(humans) - 1);
  return Math.max(IN_MIN_GAP_MS, guests * IN_GAP_PER_GUEST_MS);
}
// ── 손님 입력의 양동이(2026-11-07 리뷰 #1) ──
// 급한 입력(킥·액션 키를 누르고 뗀 순간)은 간격을 기다리지 않고 바로 나가야 한다(세기 모으기·떼기의 때가 곧 슛이다). 그 대신 모든 in 이 —
// 급하든 아니든, 0.5초 살아 있음 알림까지 — 그리고 ping 도 이 양동이에서 표 하나를 쓴다. 표는 초당 min(20, IN_BUDGET / 손님 수)개 차고 4개까지 모인다.
// 표가 없으면 다음 표가 찰 때까지 기다린다(그때 가장 최근 입력이 나간다 — 하나 넘게 쌓아 두지 않는다).
// 예산: 손님 전체 in+ping 52 + 방장 스냅샷 10 + pong 3.5 + room 0.5 = 66, 처음 양동이 4개(손님 7 × 4 = 28건)를 10초에 나눠도 69 → 70 아래(채널이 닫히는 실측 ~86).
// (조정자 안은 56 이었는데 ping·pong 7건이 얹혀 10초 창에서 72 가 나와 52 로 — fix-report §1.)
/** 양동이 — tokens = 지금 표(소수 가능), at = 마지막으로 채운 때(ms). */
export type InBucket = { tokens: number; at: number };
export const IN_BURST = 4;
/** 손님 한 명의 초당 표 — 손님 수 = 경기의 사람 수 − 1(1 이상). */
export const IN_BUDGET = 52;
export function inRate(humans: number): number {
  const guests = Math.max(1, Math.floor(humans) - 1);
  return Math.min(20, IN_BUDGET / guests);
}
export const fullBucket = (now: number): InBucket => ({ tokens: IN_BURST, at: now });
/** 표 하나 쓰기(순수). 채운 뒤 1 이상이면 쓰고 ok, 아니면 채운 양동이만 돌려준다. 시계가 뒤로 가면 채우지 않는다. */
export function takeToken(b: InBucket, now: number, rate: number): { ok: boolean; b: InBucket } {
  const dt = Math.max(0, now - b.at);
  const tokens = Math.min(IN_BURST, b.tokens + (dt / 1000) * rate);
  return tokens >= 1 ? { ok: true, b: { tokens: tokens - 1, at: now } } : { ok: false, b: { tokens, at: now } };
}
/** 구경하는 사람의 ping 간격 — 뛰는 사람(2초)보다 드물게. */
export const SPECTATOR_PING_MS = 5000;
/** 사람이 이만큼 이상인 방의 로비 room 주기. */
export const CROWD_MEMBERS = 6;
export const CROWD_ROOM_EVERY_MS = 2000;
/** 방장 화면이 가려진 동안 "멈춤" 스냅샷을 보내는 간격. */
export const PAUSED_SNAP_MS = 1000;
/** 경기가 끝나고 결과를 보여 주는 시간 — 그 뒤 모두 방으로. */
export const RESULT_MS = 4000;
/** 한마디: 한 사람이 1.5초에 한 번, 말풍선은 2초. */
export const SAY_GAP_MS = 1500;
export const BUBBLE_MS = 2000;
/** 손님이 방장을 이만큼 못 찾으면 "방장을 찾는 중" 안내를 띄운다(그래도 계속 찾는다). */
export const JOIN_SLOW_MS = 5000;

/** 주기 비교의 여유(ms). 가려진 탭의 interval 은 ~1000ms 로 늦춰지는데 999.x 에 불리면 ">= 1000" 이 한 박자를 건너뛰어
 *  "1초마다"가 2초마다가 된다 — 그래서 주기 비교는 전부 (주기 − 이 값)과 한다. */
export const SLACK_MS = 50;

export type Role = 'host' | 'guest';
/** joining = 들어가는 중(손님), lobby = 방, match = 경기(결과 화면 포함), ended = 끝(나갔거나 끊김 — 이유는 endedWhy). */
export type Stage = 'joining' | 'lobby' | 'match' | 'ended';

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
  /** 지금 판의 게임 종류(등록부 id)와 설정. 판이 없으면 null. */
  game: string | null;
  config: unknown;
  /** 이번 판에서 내가 조종하는 자리. 구경(대기 칸·경기 중 들어옴)이면 null. */
  myId: number | null;
  /** 방장이 자리를 비워 경기가 멈췄나(손님 화면 안내). 방장 자신에겐 늘 false. */
  paused: boolean;
  /** 방장과 연결이 끊겨 끝났나(손님). */
  hostLost: boolean;
  /** 방장이 3초 넘게 조용하다(손님) — "방장 응답을 기다리는 중…" 띠만. */
  hostSlow: boolean;
  /** 끝난 판의 마지막 상태(결과 화면이 그 게임의 화면 규칙으로 읽는다). 끝나지 않았으면 null. */
  result: unknown;
  /** 잠깐 띄울 안내(거절·시작 못 함 등). 없으면 null. */
  notice: string | null;
  /** stage 가 ended 일 때 그 이유(입장 화면에 띄운다). */
  endedWhy: string | null;
  /** 손님: 방장을 오래 못 찾는 중. */
  joinSlow: boolean;
};

export type Bubble = { id: number; k: number; until: number };
/** 한 프레임 그릴 것. state 는 바로 그릴 수 있게 조립된 것(손님은 예측한 몸 + 스냅샷의 점수·시계·단계). myId = 내 자리. */
export type DrawFrame<S = unknown, C = unknown> = { state: S; config: C; myId: number | null; bubbles: { id: number; text: string }[] };

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

/** 한마디가 진짜 그 사람의 자리에서 나온 건지 — 보낸 clientId 의 선수 번호와 그 자리를 뛰는 사람의 번호가 같아야 한다(봇 자리는 null).
 *  누가 남의 선수 머리 위에 말을 띄우지 못하게(채널은 익명 키로 누구나 보낼 수 있다). */
export function sayIsValid(room: RoomState | null, game: AnyAdapter | null, config: unknown, m: Extract<NetMsg, { t: 'say' }>): boolean {
  if (!room || !game || config == null) return false;
  const who = room.members.find((x) => x.clientId === m.from);
  if (!who || !Number.isInteger(m.id) || m.id < 0 || m.id >= game.slots(config)) return false;
  return game.slotNum(config, m.id) === who.num && m.k >= 0 && m.k < PHRASES.length;
}

/** 그 판에서 사람이 뛰는 자리 수 — 손님 입력 간격(inputGapMs)이 이걸 쓴다. */
export function humansIn(game: AnyAdapter, config: unknown): number {
  let n = 0;
  for (let i = 0, k = game.slots(config); i < k; i++) if (game.slotNum(config, i) !== null) n++;
  return n;
}

/** 살아 있는 말풍선만 남기고 그릴 글자로. */
export function liveBubbles(list: Bubble[], now: number): { id: number; text: string }[] {
  return list.filter((b) => b.until > now).map((b) => ({ id: b.id, text: PHRASES[b.k] ?? '' }));
}

/** 같은 선수의 말풍선은 새 것 하나만. */
export function pushBubble(list: Bubble[], id: number, k: number, now: number): Bubble[] {
  return [...list.filter((b) => b.id !== id && b.until > now), { id, k, until: now + BUBBLE_MS }];
}

