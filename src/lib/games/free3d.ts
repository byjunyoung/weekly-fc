// src/lib/games/free3d.ts — 3D 자유 훈련장(2026-11-07 게임 묶음 5단계). 순수 — 화면·시계·난수 함수·삼각함수를 부르지 않는다.
// 설계: docs/superpowers/specs/2026-11-07-games-program-design.md §3.3 "3D: 같은 내용 + 1인칭 시점 연습에 좋다."
// 사용자: "자유 훈련장, 여러 드리블 훈련장, 승부차기, 프리킥 같은 게임 만들어서 온라인 가능하게 하자. 다 2d, 3d 모드 별로 가능하게 하고."
//
// 2D 자유 훈련장(free2d.ts)과 같은 판이다: 시간·점수 없음(ended 늘 거짓), 공 = 사람 + 2(3..8), 골이 들어간 공만 가운데로(씨앗으로 고른 빈 자리),
// 편 없이 방 사람 앞 8명(방장이 맨 앞 — [공 모으기] 주인), 연습 봇 0~4, 경기 중 들어온 사람은 구경. 방 규칙도 free2d 의 buildFree 를 그대로 쓴다.
// 다른 것:
//   - 몸·공·조작은 3D 경기 그대로(드리블·패스·스루·로빙·슛 모으기·질주, 1인칭 보는 방향) — 공 여러 개는 game3d/multiball3d.ts 가 맡는다.
//   - 경기장은 3D 경기장 하나뿐이다(3D 계산의 경기장 크기가 상수라서). 그래서 방 설정의 "경기장"은 없고 연습 봇 수만 고른다.
//   - 입력은 3D 경기 양자화(68,640) + [공 모으기] 한 가지(입력 정수 68,640 이 "가만히 + 공 모으기"). 비트로 곱하면 MAX_CODES 를 넘어서다.
import type { Input } from '../game3d/sim.ts';
import { PITCH3D, rand } from '../game3d/sim.ts';
import type { MBBall, MBPlayer, MBWorld } from '../game3d/multiball3d.ts';
import { ballOf, goalSide, newBall, newPlayer, stepWorld } from '../game3d/multiball3d.ts';
import { IDLE3, Q3_COUNT, decodeInput3, encodeInput3, urgent3 } from '../game3d/quant.ts';
import type { Perf } from '../game3d/stats.ts';
import { BASE_PERF, perfOf } from '../game3d/stats.ts';
import { shuffle } from '../game/lineup.ts';
import { MAX_HUMANS } from '../game/room.ts';
import type { Player } from '../types.ts';
import type { GameAdapter, Point } from './adapter.ts';
import type { GameEntry } from './entry.ts';
import { MAX_BALLS, MAX_BOTS, POP_TICKS, ballsFor } from './free2d.ts';

const { HW, ballR: BR } = PITCH3D;
const MAX_POPS = 4;
/** 공이 돌아오는 가운데 자리(m) — 2D 표를 3D 경기장 크기로(가운데 원 반지름 3 안팎). */
const CENTER: readonly (readonly [number, number])[] = [
  [0, 0], [0, -3], [0, 3], [-3, 0], [3, 0], [-2.2, -2.2], [2.2, 2.2], [-2.2, 2.2], [2.2, -2.2], [0, -6],
];
const spotAt = (k: number): readonly [number, number] => CENTER[((k % CENTER.length) + CENTER.length) % CENTER.length];
/** 몸 자리 — 가운데(공)를 피해 위아래 두 줄에 넷씩, 넘치면 셋째 줄. 모두 오른쪽 골대를 본다. */
function startSpot(i: number): { x: number; y: number } {
  const col = i % 4, row = Math.floor(i / 4);
  return { x: (col - 1.5) * 5, y: [-6.5, 6.5, -9.5][row] ?? 0 };
}

export type Free3Input = Input & { gather?: boolean };
export type Free3Player = { id: number; num: number; jersey: number; name: string; bot: boolean; host: boolean; perf: Perf };
export type Free3Config = { balls: number; players: Free3Player[] };
export type Free3Pop = { tick: number; side: 1 | -1; y: number };
export type Free3State = { tick: number; phase: 'play'; players: MBPlayer[]; balls: MBBall[]; goals: number; pops: Free3Pop[]; kicks: number; seed: number };

export function createFree3(config: Free3Config, seed: number): Free3State {
  return {
    tick: 0, phase: 'play', goals: 0, pops: [], kicks: 0, seed: seed >>> 0,
    players: config.players.map((_, i) => { const s = startSpot(i); return newPlayer(i, s.x, s.y, 1, 0); }),
    balls: Array.from({ length: config.balls }, (_, j) => newBall(spotAt(j)[0], spotAt(j)[1])),
  };
}

/** 돌아올 자리 — 씨앗으로 고른 자리부터 다른 공·몸과 안 겹치는 첫 자리(다 차 있으면 고른 자리). */
function freeSpot(s: Free3State, self: number, k0: number): readonly [number, number] {
  for (let j = 0; j < CENTER.length; j++) {
    const p = spotAt(k0 + j);
    const near = (b: { x: number; y: number }, r: number): boolean => (b.x - p[0]) * (b.x - p[0]) + (b.y - p[1]) * (b.y - p[1]) < r * r;
    if (!s.balls.some((b, i) => i !== self && near(b, BR * 2 + 0.1)) && !s.players.some((b) => near(b, PITCH3D.playerR + BR + 0.1))) return p;
  }
  return spotAt(k0);
}

export function stepFree3(state: Free3State, config: Free3Config, inputs: Free3Input[]): Free3State {
  const s: Free3State = {
    ...state, tick: state.tick + 1,
    players: state.players.map((p) => ({ ...p })), balls: state.balls.map((b) => ({ ...b })),
    pops: state.pops.filter((p) => state.tick + 1 - p.tick < POP_TICKS),
  };
  // 공 모으기 — 방장 자리(혼자면 나)의 것만. 그 틱의 이동 전에.
  if (config.players.some((p, i) => p.host && !!inputs[i]?.gather)) s.balls = s.balls.map((_, j) => newBall(spotAt(j)[0], spotAt(j)[1]));
  const w: MBWorld = s;
  stepWorld(w, config.players.map((p) => p.perf), config.players.map((_, i) => inputs[i] ?? IDLE3));
  // 골 — 그 공만 가운데로(씨앗으로 고른 빈 자리), 속도 0, 주인 없음.
  for (let j = 0; j < s.balls.length; j++) {
    const side = goalSide(s.balls[j]);
    if (side === 0) continue;
    s.goals += 1;
    s.pops = [...s.pops, { tick: s.tick, side, y: s.balls[j].y }].slice(-MAX_POPS);
    const p = freeSpot(s, j, Math.floor(rand(s) * CENTER.length));
    s.balls[j] = newBall(p[0], p[1]);
  }
  return s;
}

// ── 연습 봇 ──
/** 가까운 공(남이 가진 공은 빼고)을 쫓아 몰고 가서 골대로 찬다 — 짝수 자리는 오른쪽, 홀수 자리는 왼쪽 골대(2D 훈련장 봇과 같은 짝). 순수. */
export function free3Bot(s: Free3State, config: Free3Config, slot: number): Free3Input {
  const p = s.players[slot];
  if (!p || !config.players[slot]) return { ...IDLE3 };
  const gx = slot % 2 === 0 ? HW : -HW;
  const own = ballOf(s, slot);
  if (own >= 0) {
    const dx = gx - p.x, dy = 0 - p.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
    const ux = dx / d, uy = dy / d;
    if (p.shootHeld) return { ...IDLE3, x: ux * 0.5, y: uy * 0.5, shoot: p.charge < 30 };
    if (d < 13 && p.fx * ux + p.fy * uy > 0.8) return { ...IDLE3, x: ux, y: uy, shoot: true };
    return { ...IDLE3, x: ux, y: uy };
  }
  let best = -1, bd = Infinity;
  for (let j = 0; j < s.balls.length; j++) {
    const b = s.balls[j];
    if (b.owner !== null && b.owner !== slot) continue;
    const d = (b.x - p.x) * (b.x - p.x) + (b.y - p.y) * (b.y - p.y);
    if (d < bd) { bd = d; best = j; }
  }
  if (best < 0) return { ...IDLE3 };
  const b = s.balls[best];
  // 공 뒤(골대 반대쪽)로 돌아 들어간다 — 공을 잡으면 골대 쪽을 보고 있게
  const gdx = gx - b.x, gdy = 0 - b.y, gl = Math.sqrt(gdx * gdx + gdy * gdy) || 1;
  const tx = b.x - (gdx / gl) * 0.5, ty = b.y - (gdy / gl) * 0.5;
  const mx = tx - p.x, my = ty - p.y, ml = Math.sqrt(mx * mx + my * my);
  if (ml < 0.1) return { ...IDLE3 };
  return { ...IDLE3, x: mx / ml, y: my / ml };
}

// ═══════════════════════════ 입력 ═══════════════════════════
/** 공 모으기 입력 정수 — 3D 경기 입력 정수 바로 다음 하나. */
export const GATHER_Q = Q3_COUNT;
const encode = (i: Free3Input): number => (i && i.gather ? GATHER_Q : encodeInput3(i));
function decode(q: number): Free3Input {
  if (q === GATHER_Q) return { ...IDLE3, gather: true };
  return decodeInput3(q);
}

// ═══════════════════════════ 모양 검사 ═══════════════════════════
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isInt = (v: unknown, lo = -Infinity, hi = Infinity): v is number => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const isName = (v: unknown): v is string => typeof v === 'string' && v.length <= 24;
const PERF_KEYS = ['maxSpeed', 'control', 'shot', 'pass', 'tackle', 'mass'] as const;
const P_NUMS = ['x', 'y', 'vx', 'vy', 'fx', 'fy', 'charge', 'lobTicks', 'noTouch', 'kickTicks', 'stamina'] as const;
const P_BOOLS = ['shootHeld', 'passHeld', 'throughHeld', 'lobHeld', 'sprint'] as const;
const B_NUMS = ['x', 'y', 'z', 'vx', 'vy', 'vz', 'stealLock'] as const;
const MAX_PLAYERS = MAX_HUMANS + MAX_BOTS;

function okConfig(c: unknown): c is Free3Config {
  if (!isObj(c) || !isInt(c.balls, 1, MAX_BALLS)) return false;
  if (!Array.isArray(c.players) || c.players.length < 1 || c.players.length > MAX_PLAYERS) return false;
  return c.players.every((p, i) => isObj(p) && p.id === i && isInt(p.num, 0) && isInt(p.jersey, 0) && isName(p.name)
    && isBool(p.bot) && isBool(p.host) && isObj(p.perf) && PERF_KEYS.every((k) => isNum((p.perf as Record<string, unknown>)[k]) && ((p.perf as Record<string, number>)[k]) > 0));
}

function okState(s: unknown, config: Free3Config): s is Free3State {
  if (!isObj(s)) return false;
  const n = config.players.length;
  return isInt(s.tick, 0) && s.phase === 'play' && isInt(s.goals, 0) && isInt(s.kicks, 0) && isNum(s.seed)
    && Array.isArray(s.players) && s.players.length === n
    && s.players.every((p, i) => isObj(p) && p.id === i && P_NUMS.every((k) => isNum(p[k])) && P_BOOLS.every((k) => isBool(p[k])))
    && Array.isArray(s.balls) && s.balls.length === config.balls
    && s.balls.every((b) => isObj(b) && B_NUMS.every((k) => isNum(b[k])) && (b.owner === null || isInt(b.owner, 0, n - 1)))
    // 한 사람이 공을 둘 갖지 않는다
    && new Set((s.balls as { owner: unknown }[]).filter((b) => b.owner !== null).map((b) => b.owner)).size === (s.balls as { owner: unknown }[]).filter((b) => b.owner !== null).length
    && Array.isArray(s.pops) && s.pops.length <= MAX_POPS
    && s.pops.every((p) => isObj(p) && isInt(p.tick, 0) && (p.side === 1 || p.side === -1) && isNum(p.y));
}

// ═══════════════════════════ 스냅샷 줄이기(3D 경기와 같은 방식 — 이름표를 빼고 줄로, 참거짓은 비트, null 은 −1) ═══════════════════════════
const PACK_V = 1;
function pack(s: Free3State): Record<string, unknown> {
  return {
    v: PACK_V, t: s.tick, g: s.goals, k: s.kicks, s: s.seed,
    p: s.players.map((p) => [...P_NUMS.map((key) => p[key]), P_BOOLS.reduce((bits, key, i) => bits | (p[key] ? 1 << i : 0), 0)]),
    b: s.balls.map((b) => [...B_NUMS.map((key) => b[key]), b.owner === null ? -1 : b.owner]),
    o: s.pops.map((p) => [p.tick, p.side, p.y]),
  };
}
function unpack(x: unknown, config: Free3Config): Free3State | null {
  if (!isObj(x) || x.v !== PACK_V || !Array.isArray(x.p) || !Array.isArray(x.b) || !Array.isArray(x.o)) return null;
  if (x.p.length !== config.players.length || x.b.length !== config.balls || x.o.length > MAX_POPS) return null;
  const row = (r: unknown, len: number): r is number[] => Array.isArray(r) && r.length === len;
  if (!x.p.every((r) => row(r, P_NUMS.length + 1)) || !x.b.every((r) => row(r, B_NUMS.length + 1)) || !x.o.every((r) => row(r, 3))) return null;
  const players = (x.p as number[][]).map((r, id) => {
    const o = { id } as Record<string, unknown>;
    P_NUMS.forEach((key, i) => { o[key] = r[i]; });
    P_BOOLS.forEach((key, i) => { o[key] = (r[P_NUMS.length] & (1 << i)) !== 0; });
    return o as unknown as MBPlayer;
  });
  const balls = (x.b as number[][]).map((r) => {
    const o = {} as Record<string, unknown>;
    B_NUMS.forEach((key, i) => { o[key] = r[i]; });
    o.owner = r[B_NUMS.length] === -1 ? null : r[B_NUMS.length];
    return o as unknown as MBBall;
  });
  return {
    tick: x.t as number, phase: 'play', goals: x.g as number, kicks: x.k as number, seed: x.s as number, players, balls,
    pops: (x.o as number[][]).map((r) => ({ tick: r[0], side: r[1] as 1 | -1, y: r[2] })),
  };
}

// ═══════════════════════════ 어댑터 ═══════════════════════════
export const free3d: GameAdapter<Free3Config, Free3State, Free3Input> = {
  id: 'free3d',
  create: createFree3,
  step: stepFree3,
  idle: IDLE3,
  encode,
  decode,
  codes: Q3_COUNT + 1,
  okConfig,
  okState,
  tick: (s) => s.tick,
  ended: () => false,   // 저절로 끝나지 않는다 — 방장이 멈추거나 혼자면 나간다
  slots: (c) => c.players.length,
  slotNum: (c, i) => { const p = c.players[i]; return p && !p.bot ? p.num : null; },
  phase: (s) => s.phase,
  // 동작 키(슛·패스·스루·로빙)·공 모으기가 바뀐 입력은 바로.
  urgent: (a, b) => (a === GATHER_Q || b === GATHER_Q ? a !== b : urgent3(a, b)),
  botInput: free3Bot,
  // 공들 + 몸들(m).
  bodies: {
    get: (s) => [...s.balls, ...s.players],
    set: (s, b: Point[]) => ({ ...s, balls: b.slice(0, s.balls.length) as MBBall[], players: b.slice(s.balls.length) as MBPlayer[] }),
    jump: 3,
    snap: 5,
  },
  pack,
  unpack,
};

// ═══════════════════════════ 방 설정·시작 ═══════════════════════════
export type Free3Settings = { bots: number };
export const FREE3_DEFAULTS: Free3Settings = { bots: 2 };
export function okFree3Settings(v: unknown): v is Free3Settings { return isObj(v) && isInt(v.bots, 0, MAX_BOTS); }
export function applyFree3Settings(cur: Free3Settings, given: unknown): Free3Settings {
  const p = isObj(given) ? given : {};
  const bots = typeof p.bots === 'number' && Number.isFinite(p.bots) ? Math.min(MAX_BOTS, Math.max(0, Math.round(p.bots))) : cur.bots;
  return bots === cur.bots ? cur : { bots };
}

/** 사람 목록(앞이 방장)·봇 수 → 설정. 봇은 명단에서 사람이 아닌 선수를 rnd 로 섞어 앞에서부터(2D buildFree 와 같은 뽑기). */
export function buildFree3(o: { humans: { num: number; name: string; host: boolean }[]; bots: number; roster: Player[]; rnd: () => number; exclude?: readonly number[] }): Free3Config {
  const taken = new Set([...o.humans.map((h) => h.num), ...(o.exclude ?? [])]);
  const seen = new Set<number>();
  const free = o.roster.filter((p) => !taken.has(p.num) && !seen.has(p.num) && (seen.add(p.num), true)).map((p) => p.num);
  const botNums = shuffle(free, o.rnd).slice(0, Math.max(0, Math.min(MAX_BOTS, o.bots)));
  const byNum = new Map(o.roster.map((p) => [p.num, p]));
  const players: Free3Player[] = [
    ...o.humans.map((h) => ({ num: h.num, name: h.name, bot: false, host: h.host })),
    ...botNums.map((n) => ({ num: n, name: byNum.get(n)?.name ?? String(n), bot: true, host: false })),
  ].map((p, id) => {
    const r = byNum.get(p.num);
    return { id, num: p.num, jersey: r?.jersey ?? 0, name: p.name, bot: p.bot, host: p.host, perf: r ? perfOf(r, o.roster) : { ...BASE_PERF } };
  });
  return { balls: ballsFor(o.humans.length), players };
}

export const FREE3D: GameEntry<Free3Config, Free3State, Free3Input, Free3Settings> = {
  adapter: free3d,
  mode: '3d',
  name: '자유 훈련장',
  describe: '시간도 점수도 없이 입체 경기장에서 공 여러 개를 차 보는 곳. 1인칭으로 드리블·슛을 익히기 좋습니다. 들어온 사람 모두가 편 없이 같이 놉니다.',
  tags: ['온라인', '연습 봇', '공 여러 개'],
  defaultSettings: FREE3_DEFAULTS,
  okSettings: okFree3Settings,
  applySettings: applyFree3Settings,
  lobby: 'all',
  // 방 사람을 들어온 차례로 앞에서부터 8명(방장이 맨 앞). 나머지는 구경.
  buildConfig(room, roster, rnd) {
    const playing = room.members.slice(0, MAX_HUMANS);
    const config = buildFree3({ humans: playing.map((m) => ({ num: m.num, name: m.name, host: m.clientId === room.hostId })), bots: room.settings.bots, roster, rnd, exclude: room.members.map((m) => m.num) });
    return { config, slots: config.players.map((p, i) => (p.bot ? null : playing[i].clientId)) };
  },
};

/** 테스트·화면용. */
export const free3StartSpot = startSpot;
export const free3CenterSpot = spotAt;
