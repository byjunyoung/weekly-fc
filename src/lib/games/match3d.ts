// src/lib/games/match3d.ts — 3D 경기를 어댑터로(2026-11-07 게임 묶음 4단계 "3D 경기 온라인"). 순수.
// 설계: docs/superpowers/specs/2026-11-07-games-program-design.md §2·§3.5 — "3D 경기가 둘째 — 이걸로 3D 경기도 온라인이 된다."
// 사용자: "자유 훈련장, 여러 드리블 훈련장, 승부차기, 프리킥 같은 게임 만들어서 온라인 가능하게 하자. 다 2d, 3d 모드 별로 가능하게 하고."
//
// 새로 계산하는 것은 없다 — 3D 시제품의 경기 계산(game3d/sim.ts)·봇(game3d/bot.ts)에 입력 양자화(game3d/quant.ts)·방 규칙(match3d-room.ts)·
// 모양 검사·스냅샷 줄이기(pack/unpack)를 이어 붙여 2D 경기와 같은 약속(adapter.ts)으로 만든다. 그러면 방·세션·예측·메시지 아끼기가 그대로 된다.
import type { Input, MatchConfig, MatchState, PlayerState } from '../game3d/sim.ts';
import { createMatch, step } from '../game3d/sim.ts';
import { botInput } from '../game3d/bot.ts';
import { IDLE3, Q3_COUNT, decodeInput3, encodeInput3, urgent3 } from '../game3d/quant.ts';
import type { GameAdapter, Point } from './adapter.ts';
import type { GameEntry } from './entry.ts';
import type { Room3dSettings } from './match3d-room.ts';
import { DEFAULT_3D, START_BLOCK_3D, applySettings3d, botSeats3d, buildMatch3d, okSettings3d, startBlock3d } from './match3d-room.ts';

// ═══════════════════════════ 모양 검사 ═══════════════════════════
// 바깥에서 온 JSON 을 믿지 않는다 — step·그리기가 NaN·잘못된 길이에서 죽지 않게 숫자 잎 하나하나까지 본다.
const MAX_SIDE = 5;   // 한 편 = 골키퍼 1 + 필드 4
const PHASES = ['kickoff', 'play', 'goal', 'end'];

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isInt = (v: unknown, lo = -Infinity, hi = Infinity): v is number => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const isName = (v: unknown): v is string => typeof v === 'string' && v.length <= 24;
const PERF_KEYS = ['maxSpeed', 'control', 'shot', 'pass', 'tackle', 'mass'] as const;

function okPerf(p: unknown): boolean {
  return isObj(p) && PERF_KEYS.every((k) => isNum(p[k]) && (p[k] as number) > 0);
}

function okConfig(c: unknown): c is MatchConfig {
  if (!isObj(c)) return false;
  if (!isNum(c.minutes) || c.minutes <= 0 || c.minutes > 60) return false;
  if (!isInt(c.scoreLimit, 0, 99)) return false;   // 방에서 만든 설정은 늘 싣는다(시험용 계산 설정만 빠질 수 있다)
  if (!Array.isArray(c.players) || c.players.length < 1 || c.players.length > MAX_SIDE * 2) return false;
  const ps = c.players as Record<string, unknown>[];
  if (!ps.every((p, i) => isObj(p) && p.id === i && isInt(p.num, 0) && isName(p.name) && (p.side === 0 || p.side === 1)
    && isBool(p.bot) && isBool(p.gk) && okPerf(p.perf) && (!p.gk || p.bot))) return false;   // 골키퍼는 봇만(방 규칙)
  // 편마다 5명까지, 골키퍼는 많아야 하나이고 있으면 그 편 첫 자리(sim 의 slotOf·편성이 이 순서에 기댄다)
  return [0, 1].every((side) => {
    const mine = ps.filter((p) => p.side === side);
    return mine.length <= MAX_SIDE && mine.filter((p) => p.gk).length <= 1 && mine.every((p, k) => !p.gk || k === 0);
  });
}

const PLAYER_NUMS = ['x', 'y', 'vx', 'vy', 'fx', 'fy', 'charge', 'noTouch', 'kickTicks', 'hold', 'lobTicks', 'stamina', 'tackleCD'] as const;
const PLAYER_BOOLS = ['shootHeld', 'passHeld', 'throughHeld', 'lobHeld', 'sprint', 'shootVoid'] as const;
const COUNT_KEYS = ['passes', 'shots', 'steals', 'throughs', 'lobs'] as const;

/** 상태 모양 + 이 판 설정과 맞는지(선수 수·자리 id·소유자 같은 자리 번호들의 범위). */
function okState(s: unknown, config: MatchConfig): s is MatchState {
  if (!isObj(s)) return false;
  const n = config.players.length;
  const slot = (v: unknown): boolean => v === null || isInt(v, 0, n - 1);
  const pair = (v: unknown): boolean => Array.isArray(v) && v.length === 2 && v.every((x) => isInt(x, 0));
  const b = s.ball, k = s.lastKick, cnt = s.count;
  return isInt(s.tick, 0) && typeof s.phase === 'string' && PHASES.includes(s.phase) && isInt(s.phaseTicks, 0)
    && pair(s.score) && isNum(s.ticksLeft)
    && isObj(b) && isNum(b.x) && isNum(b.y) && isNum(b.z) && isNum(b.vx) && isNum(b.vy) && isNum(b.vz)
    && Array.isArray(s.players) && s.players.length === n
    && s.players.every((p, i) => isObj(p) && p.id === i && PLAYER_NUMS.every((key) => isNum(p[key])) && PLAYER_BOOLS.every((key) => isBool(p[key])))
    && slot(s.owner) && slot(s.passTo) && isNum(s.passTicks) && isNum(s.stealLock)
    && slot(s.lastTouch) && slot(s.prevTouch) && isNum(s.lastTouchTick) && isNum(s.prevTouchTick) && slot(s.lastAssist)
    && (k === null || (isObj(k) && isInt(k.by, 0, n - 1) && (k.kind === 'pass' || k.kind === 'shot') && isNum(k.tick)))
    && slot(s.lastScorer) && (s.kickoffSide === 0 || s.kickoffSide === 1)
    && (s.winner === null || s.winner === 0 || s.winner === 1 || s.winner === 'draw')
    && isObj(cnt) && COUNT_KEYS.every((key) => pair(cnt[key])) && isNum(s.seed);
}

// ═══════════════════════════ 스냅샷 줄이기 ═══════════════════════════
// 그대로 보내면 5대5 한 건이 JSON 으로 4KB 를 넘는다(이름표가 선수마다 스무 개). 잃는 것 없이 모양만 바꾼다:
// 이름표(키)를 빼고 정해진 차례의 줄로, 선수 id(= 배열 차례)는 빼고, 참·거짓 여섯 개는 비트 하나로, null 은 −1 로.
// 숫자는 그대로 둔다(자르면 손님이 방장과 다른 상태에서 step 을 이어 돌린다) — JSON 의 숫자는 오가도 같은 값이다.
// 판(v)을 실어 둔다 — 모양을 바꾸면 v 를 올려 예전 탭의 스냅샷을 null 로 버리게.
const PACK_V = 1;
const nul = (v: number | null): number => (v === null ? -1 : v);
const unnul = (v: unknown): number | null => (v === -1 ? null : (v as number));
const WINNER = [0, 1, 'draw'] as const;

function pack(s: MatchState): Record<string, unknown> {
  const b = s.ball, k = s.lastKick, c = s.count;
  return {
    v: PACK_V,
    t: s.tick, ph: PHASES.indexOf(s.phase), pt: s.phaseTicks, sc: [s.score[0], s.score[1]], tl: s.ticksLeft,
    b: [b.x, b.y, b.z, b.vx, b.vy, b.vz],
    p: s.players.map((p) => [
      ...PLAYER_NUMS.map((key) => p[key]),
      PLAYER_BOOLS.reduce((bits, key, i) => bits | (p[key] ? 1 << i : 0), 0),
    ]),
    o: [nul(s.owner), nul(s.passTo), s.passTicks, s.stealLock, nul(s.lastTouch), nul(s.prevTouch), s.lastTouchTick, s.prevTouchTick,
      nul(s.lastAssist), nul(s.lastScorer), s.kickoffSide, s.winner === null ? -1 : WINNER.indexOf(s.winner)],
    k: k ? [k.by, k.kind === 'shot' ? 1 : 0, k.tick] : null,
    c: COUNT_KEYS.flatMap((key) => [c[key][0], c[key][1]]),
    s: s.seed,
  };
}

/** pack 의 반대. 모양이 틀리면 null(던지지 않는다) — 값 범위는 그 뒤 okState 가 본다. */
function unpack(x: unknown, config: MatchConfig): MatchState | null {
  if (!isObj(x) || x.v !== PACK_V) return null;
  const arr = (v: unknown, len: number): v is unknown[] => Array.isArray(v) && v.length === len;
  const { b, p, o, k, c, sc } = x;
  if (!arr(b, 6) || !Array.isArray(p) || p.length !== config.players.length || !arr(o, 12) || !arr(c, COUNT_KEYS.length * 2) || !arr(sc, 2)) return null;
  if (!(k === null || arr(k, 3)) || !isInt(x.ph, 0, PHASES.length - 1)) return null;
  const rows = p as unknown[];
  if (!rows.every((r) => arr(r, PLAYER_NUMS.length + 1) && isInt(r[PLAYER_NUMS.length], 0, 63))) return null;
  const players = rows.map((r0, id) => {
    const r = r0 as number[];
    const out = { id } as Record<string, unknown>;
    PLAYER_NUMS.forEach((key, i) => { out[key] = r[i]; });
    const bits = r[PLAYER_NUMS.length];
    PLAYER_BOOLS.forEach((key, i) => { out[key] = (bits & (1 << i)) !== 0; });
    return out as unknown as PlayerState;
  });
  const w = o[11];
  const count = {} as MatchState['count'];
  COUNT_KEYS.forEach((key, i) => { count[key] = [c[i * 2] as number, c[i * 2 + 1] as number]; });
  return {
    tick: x.t as number, phase: PHASES[x.ph] as MatchState['phase'], phaseTicks: x.pt as number,
    score: [sc[0] as number, sc[1] as number], ticksLeft: x.tl as number,
    ball: { x: b[0] as number, y: b[1] as number, z: b[2] as number, vx: b[3] as number, vy: b[4] as number, vz: b[5] as number },
    players,
    owner: unnul(o[0]), passTo: unnul(o[1]), passTicks: o[2] as number, stealLock: o[3] as number,
    lastTouch: unnul(o[4]), prevTouch: unnul(o[5]), lastTouchTick: o[6] as number, prevTouchTick: o[7] as number,
    lastAssist: unnul(o[8]), lastScorer: unnul(o[9]),
    lastKick: k === null ? null : { by: k[0] as number, kind: k[1] === 1 ? 'shot' : 'pass', tick: k[2] as number },
    kickoffSide: o[10] as MatchState['kickoffSide'], winner: w === -1 ? null : (WINNER[w as number] ?? (w as never)),
    count, seed: x.s as number,
  };
}

// ═══════════════════════════ 어댑터 ═══════════════════════════
export const match3d: GameAdapter<MatchConfig, MatchState, Input> = {
  id: 'match3d',
  create: createMatch,
  step,
  idle: IDLE3,
  encode: encodeInput3,
  decode: decodeInput3,
  codes: Q3_COUNT,
  okConfig,
  okState,
  tick: (s) => s.tick,
  ended: (s) => s.phase === 'end',
  slots: (c) => c.players.length,
  slotNum: (c, i) => { const p = c.players[i]; return p && !p.bot ? p.num : null; },
  phase: (s) => s.phase,
  // 킥오프 → 경기 중은 점수·시계에 영향이 없다(2D 와 같은 이유 — 얼리면 첫 터치 뒤 0.1초 굳어 보인다).
  predictsAcross: (from, to) => from === 'kickoff' && to === 'play',
  // 슛·패스·스루·로빙 키를 누르거나 뗀 입력은 바로(뗀 순간이 곧 차는 순간이다). 1인칭으로 돌기·질주는 간격을 지킨다.
  urgent: urgent3,
  botInput,
  // 공 + 선수들(m 단위). 한 틱에 3m 넘게 움직였으면 섞지 않고(공은 많아야 0.6m/틱), 보정이 5m 넘으면 따라가지 않고 바로 맞춘다(킥오프 재배치 등).
  bodies: {
    get: (s) => [s.ball, ...s.players],
    set: (s, b: Point[]) => ({ ...s, ball: b[0] as MatchState['ball'], players: b.slice(1) as MatchState['players'] }),
    jump: 3,
    snap: 5,
  },
  pack,
  unpack,
};

/** 결과 화면이 읽는 것 — 끝난 상태에서 점수와 이긴 편. */
export function resultOf3d(s: MatchState): { score: [number, number]; winner: 0 | 1 | 'draw' } {
  return { score: [s.score[0], s.score[1]], winner: (s.winner ?? 'draw') as 0 | 1 | 'draw' };
}

// ═══════════════════════════ 등록부 한 줄 ═══════════════════════════
export const MATCH3D: GameEntry<MatchConfig, MatchState, Input, Room3dSettings> = {
  adapter: match3d,
  mode: '3d',
  name: '경기',
  describe: '입체로 보는 축구. 골키퍼까지 한 편 다섯. 방을 만들어 팀원과 붙거나 혼자서 봇과 합니다.',
  tags: ['온라인', '봇', '3대3~5대5'],
  defaultSettings: DEFAULT_3D,
  okSettings: okSettings3d,
  applySettings: applySettings3d,
  buildConfig: buildMatch3d,
  startBlock(room, roster) { const why = startBlock3d(room, roster); return why ? START_BLOCK_3D[why] : null; },
  botSeats: botSeats3d,
  botSeatTag: (_room, _side, i) => (i === 0 ? '키퍼' : null),
};
