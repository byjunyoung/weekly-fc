// src/lib/games/match2d.ts — 2D 경기를 첫 어댑터로(2026-11-07). 순수.
// 설계: docs/superpowers/specs/2026-11-07-games-program-design.md §2 — "2D 경기를 첫 어댑터로 옮기고(동작 변화 없음)".
//
// 새로 계산하는 것은 없다 — 1·2단계의 경기 계산(sim.ts), 입력 양자화(quant.ts), 봇(bot.ts), 방 규칙(match2d-room.ts)을
// 어댑터 약속(adapter.ts)에 맞춰 이어 붙일 뿐이다. 모양 검사(okConfig·okState)는 예전 net.ts 의 것과 손님 쪽 snapFits 를 합쳤다.
import { GAME_COPY } from './copy.ts';
import type { Input, MatchConfig, MatchState } from '../game/sim.ts';
import { FIELD_IDS, NO_INPUT, createMatch, step } from '../game/sim.ts';
import { botInput } from '../game/bot.ts';
import { KICK_OFFSET, Q_COUNT, decodeInput, encodeInput } from '../game/quant.ts';
import { MAX_PER_SIDE } from '../game/room.ts';
import type { GameAdapter, Point } from './adapter.ts';
import type { GameEntry } from './entry.ts';
import type { RoomSettings } from './match2d-room.ts';
import { DEFAULT_SETTINGS, START_BLOCK_TEXT, applySettings, buildMatch, okSettings, sideSizes, startBlock } from './match2d-room.ts';

// ═══════════════════════════ 모양 검사(예전 net.ts) ═══════════════════════════
// 바깥에서 온 JSON 을 믿지 않는다. 모양(타입·범위·길이)만 보고, step·그리기가 NaN·잘못된 길이에서 죽지 않게 한다.
// 한 경기 선수는 한 편 6 × 2 = 12 까지(2026-11-07 — 사람은 8명까지지만 봇이 채운다).
const MAX_PLAYERS = MAX_PER_SIDE * 2;
const PHASES = ['kickoff', 'play', 'goal', 'end'];

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isInt = (v: unknown, lo = -Infinity, hi = Infinity): v is number => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;
const isName = (v: unknown): v is string => typeof v === 'string' && v.length <= 24;
const isArr = (v: unknown, max: number): v is unknown[] => Array.isArray(v) && v.length <= max;

function okBody(b: unknown): boolean {
  return isObj(b) && isNum(b.x) && isNum(b.y) && isNum(b.vx) && isNum(b.vy);
}
function okPerf(p: unknown): boolean {
  return isObj(p) && isNum(p.maxSpeed) && isNum(p.accel) && isNum(p.kick) && isNum(p.mass) && p.mass > 0;
}

function okConfig(c: unknown): c is MatchConfig {
  if (!isObj(c)) return false;
  if (!(FIELD_IDS as readonly unknown[]).includes(c.field) || !isInt(c.minutes, 1, 60) || !isInt(c.scoreLimit, 0, 99)) return false;
  if (!isArr(c.players, MAX_PLAYERS) || c.players.length < 1) return false;
  const ok = c.players.every((p, i) => isObj(p) && p.id === i && isInt(p.num, 0) && isName(p.name)
    && (p.side === 0 || p.side === 1) && typeof p.bot === 'boolean' && okPerf(p.perf));
  // 두 편 인원은 달라도 되지만 한 편 6명을 넘지 않는다.
  return ok && [0, 1].every((side) => (c.players as Record<string, unknown>[]).filter((p) => p.side === side).length <= MAX_PER_SIDE);
}

/** 상태 모양 + 이 경기 설정과 맞는지(선수 수·자리 id·lastTouch 들의 범위 — 예전 guest.ts 의 snapFits). */
function okState(s: unknown, config: MatchConfig): s is MatchState {
  if (!isObj(s)) return false;
  const n = config.players.length;
  const slot = (v: unknown): boolean => v === null || isInt(v, 0, n - 1);
  const slotOpt = (v: unknown): boolean => v === undefined || slot(v);   // 도움 기록 전의 상태에도 있던 너그러움 그대로
  return isInt(s.tick, 0) && typeof s.phase === 'string' && PHASES.includes(s.phase) && isInt(s.phaseTicks, 0)
    && Array.isArray(s.score) && s.score.length === 2 && s.score.every((v) => isInt(v, 0))
    && isNum(s.ticksLeft) && okBody(s.ball)
    && Array.isArray(s.players) && s.players.length === n
    && s.players.every((p, i) => okBody(p) && (p as Record<string, unknown>).id === i
      && isNum((p as Record<string, unknown>).kickCooldown) && typeof (p as Record<string, unknown>).kicking === 'boolean'
      && isNum((p as Record<string, unknown>).kickFlash))
    && (s.kickoffSide === 0 || s.kickoffSide === 1)
    && slot(s.lastTouch) && slot(s.lastScorer) && slotOpt(s.lastAssist) && slotOpt(s.prevTouch)
    && isNum(s.lastTouchTick) && isNum(s.prevTouchTick)
    && (s.winner === null || s.winner === 0 || s.winner === 1 || s.winner === 'draw') && isNum(s.seed);
}

// ═══════════════════════════ 어댑터 ═══════════════════════════
export const match2d: GameAdapter<MatchConfig, MatchState, Input> = {
  id: 'match2d',
  create: createMatch,
  step,
  idle: NO_INPUT,
  encode: encodeInput,
  decode: decodeInput,
  codes: Q_COUNT,
  okConfig,
  okState,
  tick: (s) => s.tick,
  ended: (s) => s.phase === 'end',
  slots: (c) => c.players.length,
  slotNum: (c, i) => { const p = c.players[i]; return p && !p.bot ? p.num : null; },
  phase: (s) => s.phase,
  // 킥오프 → 경기 중은 점수와 시계에 영향이 없고, 공을 처음 찬 직후라 얼리면 100ms 가까이 굳어 보인다(예전 net.ts mayEnter).
  predictsAcross: (from, to) => from === 'kickoff' && to === 'play',
  // 킥 여부가 바뀐 입력은 간격을 기다리지 않는다 — 누른 순간이 늦으면 안 된다(예전 guest.ts KICK_Q).
  urgent: (a, b) => (a >= KICK_OFFSET) !== (b >= KICK_OFFSET),
  botInput,
  // 공 + 선수들. 손님 화면은 이 몸들만 예측을 쓰고 점수·시계·단계는 스냅샷 것을 쓴다(report-3: 예측은 골을 먼저 띄우지 않는다).
  bodies: {
    get: (s) => [s.ball, ...s.players],
    set: (s, b: Point[]) => ({ ...s, ball: b[0] as MatchState['ball'], players: b.slice(1) as MatchState['players'] }),
  },
};

/** 결과 화면이 읽는 것 — 끝난 상태에서 점수와 이긴 편. */
export function resultOf(s: MatchState): { score: [number, number]; winner: 0 | 1 | 'draw' } {
  return { score: [s.score[0], s.score[1]], winner: (s.winner ?? 'draw') as 0 | 1 | 'draw' };
}

// ═══════════════════════════ 등록부 한 줄 ═══════════════════════════
export const MATCH2D: GameEntry<MatchConfig, MatchState, Input, RoomSettings> = {
  adapter: match2d,
  mode: '2d',
  name: '경기',
  describe: GAME_COPY.match,
  tags: ['온라인', '봇', '1대1~6대6'],
  defaultSettings: DEFAULT_SETTINGS,
  okSettings,
  applySettings,
  buildConfig: buildMatch,
  startBlock(room, roster) { const why = startBlock(room, roster); return why ? START_BLOCK_TEXT[why] : null; },
  // 빈자리 = 봇. 한 편이 perSide 보다 적으면 모자란 만큼(사람이 더 많은 편은 0).
  botSeats(room) {
    const [a, b] = sideSizes(room);
    const h = [0, 1].map((t) => room.members.filter((m) => m.team === t).length);
    return [Math.max(0, a - h[0]), Math.max(0, b - h[1])];
  },
};
