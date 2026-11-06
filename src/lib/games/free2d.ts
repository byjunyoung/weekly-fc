// src/lib/games/free2d.ts — 2D 자유 훈련장(2026-11-07 게임 묶음 2단계). 순수 — 화면·시계·난수 함수를 부르지 않는다.
// 설계: docs/superpowers/specs/2026-11-07-games-program-design.md §3.3
// 사용자: "자유 훈련장, 여러 드리블 훈련장, 승부차기, 프리킥 같은 게임 만들어서 온라인 가능하게 하자. 다 2d, 3d 모드 별로 가능하게 하고."
//
// 규칙(3D 판이 따라 할 수 있게 적어 둔다):
//   - 시간·점수가 없고 저절로 끝나지 않는다(ended 는 늘 거짓). 방장이 ✕ 로 멈추면 방으로, 혼자면 ✕ 로 나간다.
//   - 경기장 크기는 경기와 같은 넷(자동이면 뛰는 사람 + 봇 수로 fieldFor). 골대 둘, 벽·기둥·몸·공·킥은 경기와 같다(sim.ts 조각을 multiball.ts 가 이어 붙임).
//   - 공은 사람 수 + 2(최소 3, 최대 MAX_BALLS). 공이 골문을 완전히 넘으면 그 공만 가운데 자리(CENTER_SPOTS 중 씨앗으로 하나)로 돌아오고 "골!" 표시가 잠깐 뜬다.
//   - 편이 없다 — 방 사람 모두(앞에서부터 8명)가 들어온다. 연습 봇 0~4명은 가까운 공을 쫓아 골대로 찬다.
//   - [공 모으기] — 모든 공을 가운데 자리로. 입력의 gather 비트로 오고, 방장 자리(혼자면 내 자리)의 것만 듣는다.
import type { Body, FieldId, Input, KickBody } from '../game/sim.ts';
import { FIELD_IDS, NO_INPUT, PHYS, geoOf, nextRand } from '../game/sim.ts';
import { stepBodies } from '../game/multiball.ts';
import { Q_COUNT, decodeInput, encodeInput, KICK_OFFSET } from '../game/quant.ts';
import type { Perf } from '../game/stats.ts';
import { BASE_PERF, perfOf } from '../game/stats.ts';
import { shuffle } from '../game/lineup.ts';
import { MAX_HUMANS } from '../game/room.ts';
import type { Player } from '../types.ts';
import type { GameAdapter, Point } from './adapter.ts';
import type { GameEntry } from './entry.ts';
import type { FieldChoice } from './match2d-room.ts';
import { FIELD_CHOICES, fieldFor } from './match2d-room.ts';

// ═══════════════════════════ 조절 값 ═══════════════════════════
/** 공 개수 상한 — 사람 8명 + 2 를 다 주면 몸 12 + 공 10 이라 스냅샷이 커진다. 8 이면 가볍고 충분히 붐빈다. */
export const MAX_BALLS = 8;
export const MIN_BALLS = 3;
/** 연습 봇 수 범위. */
export const MAX_BOTS = 4;
/** 공이 돌아오는 가운데 자리(보통 경기장 좌표, 경기장 크기에 비례). 겹쳐도 충돌이 밀어낸다. 삼각함수 없이 손으로 적은 표. */
const CENTER_SPOTS: readonly (readonly [number, number])[] = [
  [0, 0], [0, -56], [0, 56], [-56, 0], [56, 0], [-40, -40], [40, 40], [-40, 40], [40, -40], [0, -112],
];
/** "골!" 표시를 남기는 틱(1초)과 동시에 들고 있는 개수. */
export const POP_TICKS = 60;
const MAX_POPS = 4;
// ════════════════════════════════════════════════════════════

export type FreeInput = Input & { gather: boolean };
export const FREE_IDLE: FreeInput = { ...NO_INPUT, gather: false };
/** host = 방장(혼자면 나) — 그 자리의 gather 만 듣는다. jersey = 등번호(화면에 보이는 번호). */
export type FreePlayer = { id: number; num: number; jersey: number; name: string; bot: boolean; host: boolean; perf: Perf };
export type FreeConfig = { field: FieldId; balls: number; players: FreePlayer[] };
export type FreeBody = KickBody & { id: number };
/** pops = 최근 골(그린 뒤 POP_TICKS 동안 "골!"). side = 들어간 골대(+1 오른쪽, -1 왼쪽). goals = 지금까지 들어간 수(소리·표시용). */
export type FreePop = { tick: number; side: 1 | -1; y: number };
export type FreeState = { tick: number; phase: 'play'; balls: Body[]; players: FreeBody[]; goals: number; pops: FreePop[]; seed: number };

const spotOf = (field: FieldId, k: number): { x: number; y: number } => {
  const g = geoOf(field), s = CENTER_SPOTS[((k % CENTER_SPOTS.length) + CENTER_SPOTS.length) % CENTER_SPOTS.length];
  return { x: s[0] * g.fx, y: s[1] * g.fy };
};

/** 몸 자리 — 가운데(공)를 피해 위아래 두 줄에 넷씩, 넘치면 셋째 줄. */
function startSpot(field: FieldId, i: number): { x: number; y: number } {
  const g = geoOf(field);
  const col = i % 4, row = Math.floor(i / 4);
  const ys = [-170, 170, -290];
  return { x: (col - 1.5) * 150 * g.fx, y: (ys[row] ?? 0) * g.fy };
}

export function createFree(config: FreeConfig, seed: number): FreeState {
  return {
    tick: 0, phase: 'play', goals: 0, pops: [], seed: seed >>> 0,
    balls: Array.from({ length: config.balls }, (_, j) => ({ ...spotOf(config.field, j), vx: 0, vy: 0 })),
    players: config.players.map((p, i) => ({ id: p.id, ...startSpot(config.field, i), vx: 0, vy: 0, kickCooldown: 0, kicking: false, kickFlash: 0 })),
  };
}

/** 모든 공을 가운데 자리로(공 모으기). */
function gatherAll(s: FreeState, config: FreeConfig): void {
  s.balls = s.balls.map((_, j) => ({ ...spotOf(config.field, j), vx: 0, vy: 0 }));
}

/** 돌아올 자리 — 씨앗으로 고른 자리부터 차례로 보며 다른 공·몸과 안 겹치는 첫 자리(다 차 있으면 고른 자리). */
function freeSpot(s: FreeState, config: FreeConfig, self: number, k0: number): { x: number; y: number } {
  const g = geoOf(config.field), BR = g.pitch.ballR, R = g.pitch.playerR;
  for (let j = 0; j < CENTER_SPOTS.length; j++) {
    const p = spotOf(config.field, k0 + j);
    const near = (b: { x: number; y: number }, r: number): boolean => (b.x - p.x) * (b.x - p.x) + (b.y - p.y) * (b.y - p.y) < r * r;
    if (!s.balls.some((b, i) => i !== self && near(b, BR * 2 + 2)) && !s.players.some((b) => near(b, R + BR + 2))) return p;
  }
  return spotOf(config.field, k0);
}

export function stepFree(state: FreeState, config: FreeConfig, inputs: FreeInput[]): FreeState {
  const s: FreeState = {
    ...state, tick: state.tick + 1,
    balls: state.balls.map((b) => ({ ...b })), players: state.players.map((p) => ({ ...p })),
    pops: state.pops.filter((p) => state.tick + 1 - p.tick < POP_TICKS),
  };
  const g = geoOf(config.field);
  // 공 모으기 — 방장 자리(혼자면 나)의 것만. 그 틱의 이동 전에 옮긴다.
  if (config.players.some((p, i) => p.host && !!inputs[i]?.gather)) gatherAll(s, config);
  stepBodies(s.players, config.players.map((p) => p.perf), s.balls, config.players.map((_, i) => inputs[i]), g);
  // 골 — 공 중심이 골라인을 완전히 넘었고 골문 안쪽. 그 공만 가운데 자리로(씨앗으로 고른 자리).
  for (let j = 0; j < s.balls.length; j++) {
    const b = s.balls[j];
    if (Math.abs(b.x) > g.HW && Math.abs(b.y) < g.GH) {
      const side: 1 | -1 = b.x > 0 ? 1 : -1;
      s.goals += 1;
      s.pops = [...s.pops, { tick: s.tick, side, y: b.y }].slice(-MAX_POPS);
      s.balls[j] = { ...freeSpot(s, config, j, Math.floor(nextRand(s) * CENTER_SPOTS.length)), vx: 0, vy: 0 };
    }
  }
  return s;
}

// ── 연습 봇 ──
/** 가까운 공을 골대 쪽으로 찬다. 짝수 자리는 오른쪽 골대, 홀수 자리는 왼쪽 골대로(두 봇이 같은 공을 두고 다투게). 순수 — 상태만 본다. */
export function freeBot(s: FreeState, config: FreeConfig, slot: number): FreeInput {
  const p = s.players[slot];
  if (!p || !s.balls.length) return FREE_IDLE;
  const g = geoOf(config.field), R = g.pitch.playerR, BR = g.pitch.ballR;
  let b = s.balls[0], bd = Infinity;
  for (const x of s.balls) { const d = (x.x - p.x) * (x.x - p.x) + (x.y - p.y) * (x.y - p.y); if (d < bd) { bd = d; b = x; } }
  const gx = slot % 2 === 0 ? g.HW + 30 : -g.HW - 30;
  let dx = gx - b.x, dy = 0 - b.y;
  const dl = Math.sqrt(dx * dx + dy * dy) || 1;
  dx /= dl; dy /= dl;
  const bx = b.x - p.x, by = b.y - p.y, dball = Math.sqrt(bx * bx + by * by) || 1;
  const aligned = (bx * dx + by * dy) / dball > 0.75;
  if (aligned && dball < R + BR + PHYS.KICK_REACH) return { x: dx, y: dy, kick: p.kickCooldown === 0, gather: false };
  // 공 뒤(골대 반대쪽) 자리로. 공 앞에 서 있으면 옆으로 돌아 들어간다.
  let tx = b.x - dx * (R + BR + 4), ty = b.y - dy * (R + BR + 4);
  if (!aligned && dball < R * 4) { tx += -dy * R * 2 * (by * dx - bx * dy > 0 ? 1 : -1); ty += dx * R * 2 * (by * dx - bx * dy > 0 ? 1 : -1); }
  const mx = tx - p.x, my = ty - p.y, ml = Math.sqrt(mx * mx + my * my);
  if (ml < 3) return FREE_IDLE;
  return { x: mx / ml, y: my / ml, kick: false, gather: false };
}

// ═══════════════════════════ 모양 검사 ═══════════════════════════
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isInt = (v: unknown, lo = -Infinity, hi = Infinity): v is number => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;
const isName = (v: unknown): v is string => typeof v === 'string' && v.length <= 24;
const okBody = (b: unknown): boolean => isObj(b) && isNum(b.x) && isNum(b.y) && isNum(b.vx) && isNum(b.vy);
const okPerf = (p: unknown): boolean => isObj(p) && isNum(p.maxSpeed) && isNum(p.accel) && isNum(p.kick) && isNum(p.mass) && p.mass > 0;
/** 몸 상한 — 사람 8 + 봇 4. */
const MAX_FREE_PLAYERS = MAX_HUMANS + MAX_BOTS;

function okConfig(c: unknown): c is FreeConfig {
  if (!isObj(c) || !(FIELD_IDS as readonly unknown[]).includes(c.field) || !isInt(c.balls, 1, MAX_BALLS)) return false;
  if (!Array.isArray(c.players) || c.players.length < 1 || c.players.length > MAX_FREE_PLAYERS) return false;
  return c.players.every((p, i) => isObj(p) && p.id === i && isInt(p.num, 0) && isInt(p.jersey, 0) && isName(p.name)
    && typeof p.bot === 'boolean' && typeof p.host === 'boolean' && okPerf(p.perf));
}

function okState(s: unknown, config: FreeConfig): s is FreeState {
  if (!isObj(s)) return false;
  return isInt(s.tick, 0) && s.phase === 'play' && isInt(s.goals, 0) && isNum(s.seed)
    && Array.isArray(s.balls) && s.balls.length === config.balls && s.balls.every(okBody)
    && Array.isArray(s.players) && s.players.length === config.players.length
    && s.players.every((p, i) => okBody(p) && (p as Record<string, unknown>).id === i && isNum((p as Record<string, unknown>).kickCooldown)
      && typeof (p as Record<string, unknown>).kicking === 'boolean' && isNum((p as Record<string, unknown>).kickFlash))
    && Array.isArray(s.pops) && s.pops.length <= MAX_POPS
    && s.pops.every((p) => isObj(p) && isInt(p.tick, 0) && (p.side === 1 || p.side === -1) && isNum(p.y));
}

// ═══════════════════════════ 입력 ═══════════════════════════
// 경기의 양자화(66가지: 정지·16방향 × 걷기/달리기 × 킥) 그대로 + 공 모으기 비트 하나 = 132가지.
const encode = (i: FreeInput): number => encodeInput(i) + (i && i.gather ? Q_COUNT : 0);
function decode(q: number): FreeInput {
  if (!Number.isInteger(q) || q < 0 || q >= Q_COUNT * 2) return { ...FREE_IDLE };
  return { ...decodeInput(q % Q_COUNT), gather: q >= Q_COUNT };
}

// ═══════════════════════════ 어댑터 ═══════════════════════════
export const free2d: GameAdapter<FreeConfig, FreeState, FreeInput> = {
  id: 'free2d',
  create: createFree,
  step: stepFree,
  idle: FREE_IDLE,
  encode,
  decode,
  codes: Q_COUNT * 2,
  okConfig,
  okState,
  tick: (s) => s.tick,
  ended: () => false,   // 저절로 끝나지 않는다 — 방장이 멈추거나 혼자면 나간다
  slots: (c) => c.players.length,
  slotNum: (c, i) => { const p = c.players[i]; return p && !p.bot ? p.num : null; },
  phase: (s) => s.phase,
  // 킥·공 모으기가 바뀐 입력은 간격을 기다리지 않는다.
  urgent: (a, b) => ((a % Q_COUNT) >= KICK_OFFSET) !== ((b % Q_COUNT) >= KICK_OFFSET) || (a >= Q_COUNT) !== (b >= Q_COUNT),
  botInput: freeBot,
  bodies: {
    get: (s) => [...s.balls, ...s.players],
    set: (s, b: Point[]) => ({ ...s, balls: b.slice(0, s.balls.length) as Body[], players: b.slice(s.balls.length) as FreeBody[] }),
  },
};

// ═══════════════════════════ 방 설정·시작 ═══════════════════════════
export type FreeSettings = { field: FieldChoice; bots: number };
export const FREE_DEFAULTS: FreeSettings = { field: 'auto', bots: 2 };

export function okFreeSettings(v: unknown): v is FreeSettings {
  return isObj(v) && (FIELD_CHOICES as readonly unknown[]).includes(v.field) && isInt(v.bots, 0, MAX_BOTS);
}
export function applyFreeSettings(cur: FreeSettings, given: unknown): FreeSettings {
  const p = isObj(given) ? given : {};
  const field = p.field !== undefined && (FIELD_CHOICES as readonly unknown[]).includes(p.field) ? p.field as FieldChoice : cur.field;
  const bots = typeof p.bots === 'number' && Number.isFinite(p.bots) ? Math.min(MAX_BOTS, Math.max(0, Math.round(p.bots))) : cur.bots;
  return field === cur.field && bots === cur.bots ? cur : { field, bots };
}

/** 공 개수 = 사람 + 2(3..8). */
export const ballsFor = (humans: number): number => Math.min(MAX_BALLS, Math.max(MIN_BALLS, humans + 2));
/** 경기장 — 자동이면 몸 수(사람 + 봇)로. */
export const freeField = (choice: FieldChoice, bodies: number): FieldId => (choice === 'auto' ? fieldFor(bodies) : choice);

/** 사람 목록(앞이 방장)·봇 수 → 설정. 봇은 명단에서 사람이 아닌 선수를 rnd 로 섞어 앞에서부터(명단이 모자라면 있는 만큼). */
export function buildFree(o: { humans: { num: number; name: string; host: boolean }[]; bots: number; field: FieldChoice; roster: Player[]; rnd: () => number; exclude?: readonly number[] }): FreeConfig {
  const taken = new Set([...o.humans.map((h) => h.num), ...(o.exclude ?? [])]);   // 구경하는 방 사람의 선수도 봇으로 세우지 않는다
  const seen = new Set<number>();
  const free = o.roster.filter((p) => !taken.has(p.num) && !seen.has(p.num) && (seen.add(p.num), true)).map((p) => p.num);
  const botNums = shuffle(free, o.rnd).slice(0, Math.max(0, Math.min(MAX_BOTS, o.bots)));
  const byNum = new Map(o.roster.map((p) => [p.num, p]));
  const players: FreePlayer[] = [
    ...o.humans.map((h) => ({ num: h.num, name: h.name, bot: false, host: h.host })),
    ...botNums.map((n) => ({ num: n, name: byNum.get(n)?.name ?? String(n), bot: true, host: false })),
  ].map((p, id) => {
    const r = byNum.get(p.num);
    return { id, num: p.num, jersey: r?.jersey ?? 0, name: p.name, bot: p.bot, host: p.host, perf: r ? perfOf(r, o.roster) : { ...BASE_PERF } };
  });
  return { field: freeField(o.field, players.length), balls: ballsFor(o.humans.length), players };
}

export const FREE2D: GameEntry<FreeConfig, FreeState, FreeInput, FreeSettings> = {
  adapter: free2d,
  mode: '2d',
  name: '자유 훈련장',
  describe: '시간도 점수도 없이 공 여러 개를 차 보는 곳. 들어온 사람 모두가 편 없이 같이 놉니다.',
  tags: ['온라인', '연습 봇', '공 여러 개'],
  defaultSettings: FREE_DEFAULTS,
  okSettings: okFreeSettings,
  applySettings: applyFreeSettings,
  lobby: 'all',
  // 방 사람을 들어온 차례로 앞에서부터 8명(방장이 맨 앞). 나머지는 구경.
  buildConfig(room, roster, rnd) {
    const playing = room.members.slice(0, MAX_HUMANS);
    const config = buildFree({ humans: playing.map((m) => ({ num: m.num, name: m.name, host: m.clientId === room.hostId })), bots: room.settings.bots, field: room.settings.field, roster, rnd, exclude: room.members.map((m) => m.num) });
    return { config, slots: config.players.map((p, i) => (p.bot ? null : playing[i].clientId)) };
  },
};

/** 시작 자리(테스트·화면용) — 경기 쪽 formationSpot 와 헷갈리지 않게 이름을 따로 둔다. */
export const freeStartSpot = startSpot;
/** 공이 돌아오는 자리(테스트용). */
export const freeCenterSpot = spotOf;
