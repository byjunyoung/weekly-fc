// src/lib/games/dribble3d.ts — 3D 드리블 훈련장(2026-11-07 게임 묶음 6단계). 순수 — 화면·시계·난수 함수·삼각함수를 부르지 않는다.
// 설계: docs/superpowers/specs/2026-11-07-games-program-design.md §3.4 "3D: 뒤에서 따라가는 화면."
// 사용자: "자유 훈련장, 여러 드리블 훈련장, 승부차기, 프리킥 같은 게임 만들어서 온라인 가능하게 하자. 다 2d, 3d 모드 별로 가능하게 하고."
//
// 2D 드리블 훈련장(dribble2d.ts)과 같은 판이다 — 코스 넷(COURSES: 문·콘·결승선 — 2D 좌표 × DR3_SCALE m 로 3D 경기장에 깐다),
// 문 통과(passGate)·결승(passFinish)·순위(drRanking 과 같은 규칙)·3·2·1(COUNT_TICKS, 그동안 입력 무시)·콘 1초(CONE_PENALTY)·끝(모두 도착·첫 도착 뒤 30초·150초),
// 방 규칙(buildDribble — lobby 'all', 설정 = 코스)을 그대로 가져다 쓴다. 판정은 2D 좌표로 옮겨 2D 함수에 그대로 넘긴다(같은 판정).
// 3D 가 정한 것(내 결정):
//   - 몸·공·조작은 3D 경기 그대로(multiball3d — 레인 하나에 몸 하나·공 하나, 공 소유: 가까이 가면 발밑에 붙어 따라온다).
//   - "콘을 쳤다" = 몸이나 공(땅에서 0.5m 아래일 때)이 콘에 닿음 → 그 콘 넘어지고 +1초(콘마다 한 번). 2D 와 같다.
//   - "공을 잃었다" = 공이 몸에서 KEEP(2D 90 = 1.7m) 밖 — 그동안은 문·결승선을 지나도 세지 않는다(2D 와 같은 거리 규칙).
//     3D 에선 발밑 공이 떨어지는 건 경기와 같다: 질주하며 급히 꺾으면 공이 풀린다(경기의 LOOSE 규칙), 태클 상대는 없다.
//   - 레인은 2D 와 같은 크기의 직사각형(몸·공을 가둔다). 사람마다 따로 계산하고 부딪치지 않는다(다른 사람은 화면에 흐린 몸으로).
//   - 메달은 3D 대본 주자(dribble3Bot)로 잰 시간에서(MEDALS3 — 2D 와 같은 법: 금 = 벌점 없이, 은 = 벌점 넣은 기록 이상, 동 = 은 × 1.4).
import type { Input } from '../game3d/sim.ts';
import { PITCH3D, unit } from '../game3d/sim.ts';
import type { MBBall, MBPlayer } from '../game3d/multiball3d.ts';
import { ballOf, newBall, newPlayer, stepWorld } from '../game3d/multiball3d.ts';
import { IDLE3, Q3_COUNT, decodeInput3, encodeInput3, urgent3 } from '../game3d/quant.ts';
import type { Perf } from '../game3d/stats.ts';
import { BASE_PERF, perfOf } from '../game3d/stats.ts';
import type { Course, DrSettings } from './dribble2d.ts';
import {
  AFTER_FIRST, CONE_PENALTY, CONE_R, COUNT_TICKS, COURSES, DRIBBLE2D, LX, LY, RUN_CAP, courseCones, dribbleTarget, drCompare, drPlaces, passFinish, passGate,
} from './dribble2d.ts';
import { pitchOf } from '../game/sim.ts';
import type { Player } from '../types.ts';
import type { GameAdapter, Point } from './adapter.ts';
import type { GameEntry } from './entry.ts';

// ═══════════════════════════ 조절 값 ═══════════════════════════
const { playerR: PR, ballR: BR } = PITCH3D;
/** 2D 논리 단위 → m — 몸 반지름으로 맞춘다(2D 22 = 3D 0.42m). 코스·레인·콘·KEEP 이 모두 같은 비율로 3D 경기장에 들어간다(레인 23.7 × 6.5m). */
export const DR3_SCALE = PR / pitchOf('M').playerR;
const K = DR3_SCALE;
export const LANE_X = LX * K, LANE_Y = LY * K;
/** 3D 공 반지름을 2D 단위로(콘 닿기를 2D 좌표로 볼 때). */
const BR2 = BR / K, PR2 = PR / K;
/** 공이 이보다 높이 떠 있으면 콘에 안 닿는다(m). */
const CONE_TOP = 0.5;
/** 코스마다 메달 기준 시간(초, [금, 은, 동]) — 2026-11-07 3D 대본 주자(dribble3Bot)로 잼: 벌점 없이 6.0·8.1·6.2·7.4초, 벌점 넣어 11.0·12.1·12.0·8.3초.
 *  2D 와 같은 법 — 금 = 벌점 없는 시간을 내림, 은 = 벌점 넣은 기록(금의 1.25배는 넘게), 동 = 은 × 1.4. 3D 는 몸이 빨라 2D 보다 짧다. */
export const MEDALS3: readonly [number, number, number][] = [[6, 11, 15], [8, 12, 17], [6, 12, 17], [7, 9, 13]];
// ════════════════════════════════════════════════════════════

/** 3D 코스 — 2D 코스에 3D 메달 시간. 판정은 2D 좌표로(아래 to2). */
export const course3 = (i: number): Course => {
  const c = COURSES[Math.min(COURSES.length - 1, Math.max(0, Math.floor(i) || 0))];
  return { ...c, medals: MEDALS3[COURSES.indexOf(c)] ?? c.medals };
};
const to2 = (p: { x: number; y: number }): Point => ({ x: p.x / K, y: p.y / K });

export type Dr3Player = { id: number; num: number; jersey: number; name: string; bot: boolean; perf: Perf };
export type Dr3Config = { course: number; players: Dr3Player[] };
/** 레인 하나 — 몸 p, 공 b(3D 경기 몸·공), 다음 문 gate, 넘어뜨린 콘 hit(비트), 콘 벌점 수 pen, 도착 fin(달린 틱, 못 했으면 −1),
 *  gone = 그 레인 사람이 자리를 비웠다(방장이 넣은 빈 자리 입력 — 2D 레인과 같은 뜻, 2026-11-07 리뷰 #2). 돌아오면 거짓으로. */
export type Lane3 = { p: MBPlayer; b: MBBall; gate: number; hit: number; pen: number; fin: number; gone: boolean };
/** 3D 드리블 입력 = 3D 경기 입력 + "빈 자리". */
export type Dr3Input = Input & { gone?: true };
export const DR3_ABSENT: Dr3Input = { ...IDLE3, gone: true };
export type Dr3Phase = 'count' | 'run' | 'end';
export type Dr3State = { tick: number; phase: Dr3Phase; phaseTicks: number; lanes: Lane3[]; first: number; seed: number };

function startLane(c: Course): Lane3 {
  const s = c.start, g = c.gates[0];
  const d = unit(g ? g.x - s.x : 1, g ? g.y - s.y : 0, 1, 0);
  return { p: newPlayer(0, s.x * K, s.y * K, d.x, d.y), b: newBall(s.x * K + d.x * 0.76, s.y * K + d.y * 0.76), gate: 0, hit: 0, pen: 0, fin: -1, gone: false };
}

export function createDribble3(config: Dr3Config, seed: number): Dr3State {
  const c = course3(config.course);
  return { tick: 0, phase: 'count', phaseTicks: 0, lanes: config.players.map(() => startLane(c)), first: -1, seed: seed >>> 0 };
}

/** 레인 벽 — 몸·공을 직사각형 안에(공은 튕긴다). */
function containLane(l: Lane3): void {
  const px = LANE_X - PR, py = LANE_Y - PR, bx = LANE_X - BR, by = LANE_Y - BR, p = l.p, b = l.b;
  if (p.x > px) { p.x = px; if (p.vx > 0) p.vx = 0; }
  if (p.x < -px) { p.x = -px; if (p.vx < 0) p.vx = 0; }
  if (p.y > py) { p.y = py; if (p.vy > 0) p.vy = 0; }
  if (p.y < -py) { p.y = -py; if (p.vy < 0) p.vy = 0; }
  if (b.x > bx) { b.x = bx; if (b.vx > 0) b.vx = 0 - b.vx * 0.6; }
  if (b.x < -bx) { b.x = -bx; if (b.vx < 0) b.vx = 0 - b.vx * 0.6; }
  if (b.y > by) { b.y = by; if (b.vy > 0) b.vy = 0 - b.vy * 0.6; }
  if (b.y < -by) { b.y = -by; if (b.vy < 0) b.vy = 0 - b.vy * 0.6; }
}

export function stepDribble3(state: Dr3State, config: Dr3Config, inputs: Dr3Input[]): Dr3State {
  const s: Dr3State = { ...state, tick: state.tick + 1, phaseTicks: state.phaseTicks + 1, lanes: state.lanes.map((l) => ({ ...l, p: { ...l.p }, b: { ...l.b } })) };
  if (s.phase === 'end') return s;
  const c = course3(config.course), cones = courseCones(c);
  const run = s.phase === 'run';
  s.lanes.forEach((l, i) => {
    const from = to2(l.p), bfrom = to2(l.b);
    if (l.fin < 0) l.gone = !!inputs[i]?.gone;   // 빈 자리 — 레인은 서고(대신 달리지 않는다) 결과에 "나감"(2D 와 같다)
    const inp = run && l.fin < 0 && !l.gone ? inputs[i] ?? IDLE3 : IDLE3;
    // 레인마다 따로 — 씨앗은 판 하나를 차례로 쓴다(레인 순서가 늘 같아 결정적)
    const w = { seed: s.seed, players: [l.p], balls: [l.b], kicks: 0 };
    stepWorld(w, [config.players[i].perf], [inp]);
    s.seed = w.seed; l.p = w.players[0]; l.b = w.balls[0];
    containLane(l);
    if (!run || l.fin >= 0) return;
    const p2 = to2(l.p), b2 = to2(l.b);
    cones.forEach((k, j) => {
      if (l.hit & (1 << j)) return;
      const pd = (p2.x - k.x) * (p2.x - k.x) + (p2.y - k.y) * (p2.y - k.y), bd = (b2.x - k.x) * (b2.x - k.x) + (b2.y - k.y) * (b2.y - k.y);
      if (pd < (PR2 + CONE_R) * (PR2 + CONE_R) || (l.b.z < CONE_TOP && bd < (BR2 + CONE_R) * (BR2 + CONE_R))) { l.hit |= 1 << j; l.pen += 1; }
    });
    if (passGate(c, l.gate, from, p2, bfrom, b2)) l.gate += 1;
    else if (passFinish(c, l.gate, from, p2, b2)) { l.fin = s.phaseTicks; if (s.first < 0) s.first = s.phaseTicks; }
  });
  if (s.phase === 'count' && s.phaseTicks >= COUNT_TICKS) { s.phase = 'run'; s.phaseTicks = 0; }
  else if (run) {
    const all = s.lanes.every((l) => l.fin >= 0 || l.gone);   // 나간 레인은 기다리지 않는다
    const late = s.lanes.length > 1 && s.first >= 0 && s.phaseTicks - s.first >= AFTER_FIRST;
    if (all || late || s.phaseTicks >= RUN_CAP) { s.phase = 'end'; s.phaseTicks = 0; }
  }
  return s;
}

/** 기록(초) = 달린 틱 + 콘 벌점. 못 했으면 null(2D laneTime 과 같은 셈). */
export const lane3Time = (l: Lane3): number | null => (l.fin < 0 ? null : (l.fin + l.pen * CONE_PENALTY) / 60);
/** 순위 — 2D 와 같은 규칙·같은 함수(drCompare: 도착한 사람은 기록 순, 못 한 사람은 지난 문 순 — 나간 사람은 그 아래, 같으면 레인 순). */
export function dr3Ranking(s: Dr3State): number[] {
  return s.lanes.map((_, i) => i).sort((a, b) => drCompare(s.lanes[a], s.lanes[b]) || a - b);
}
/** 등수 — 같은 결과는 같은 등수(2D drPlaces 그대로). */
export const dr3Places = (s: Dr3State): number[] => drPlaces(s);

// ── 대본 주자(메달 시간을 재고, 끊긴 손님 자리를 맡는다) ──
/** 2D 대본 주자와 같은 목표(dribbleTarget — 차례인 문을 지나 조금 더, 다 지났으면 결승선 너머)로. 공을 가졌으면 그쪽으로 몰고
 *  (문 가까이·크게 꺾을 땐 걷는다 — 공이 풀리지 않게), 공이 떨어졌으면 공부터 줍는다. */
export function dribble3Bot(s: Dr3State, config: Dr3Config, slot: number): Input {
  const l = s.lanes[slot];
  if (!l || s.phase !== 'run' || l.fin >= 0) return { ...IDLE3 };
  const c = course3(config.course);
  const p = l.p, b = l.b;
  const owns = l.b.owner === 0;
  if (!owns) {
    const d = unit(b.x - p.x, b.y - p.y, p.fx, p.fy), dist = Math.sqrt((b.x - p.x) * (b.x - p.x) + (b.y - p.y) * (b.y - p.y));
    const sp = dist < 1.2 ? 0.5 : 1;
    return { ...IDLE3, x: d.x * sp, y: d.y * sp };
  }
  const t2 = dribbleTarget(c, l.gate, { p: { ...to2(p), vx: 0, vy: 0, kickCooldown: 0, kicking: false, kickFlash: 0 }, b: { ...to2(b), vx: 0, vy: 0 }, gate: l.gate, hit: 0, pen: 0, fin: -1, gone: false });
  let tx = t2.x * K, ty = t2.y * K;
  // 문 앞에서 옆으로 비껴 있으면 먼저 문 정면(지나는 방향 반대쪽 1.5m)으로 — 비스듬히 들어가면 문 밖으로 지나가 버린다(왕복의 가로 문)
  const gg = c.gates[l.gate];
  if (gg) {
    const gx = gg.x * K, gy = gg.y * K, along = (b.x - gx) * gg.px + (b.y - gy) * gg.py, lat = (b.x - gx) * (0 - gg.py) + (b.y - gy) * gg.px;
    if (along < -0.3 && Math.abs(lat) > gg.w * K * 0.25) { tx = gx - gg.px * 1.5; ty = gy - gg.py * 1.5; }
  }
  const d = unit(tx - b.x, ty - b.y, p.fx, p.fy);
  const turn = d.x * p.fx + d.y * p.fy;                 // 보는 쪽과 가고 싶은 쪽
  const g = c.gates[l.gate];
  const near = g ? (g.x * K - p.x) * (g.x * K - p.x) + (g.y * K - p.y) * (g.y * K - p.y) < 2.2 * 2.2 : false;
  const sp = turn < 0.5 ? 0.5 : near ? 0.5 : 1;
  return { ...IDLE3, x: d.x * sp, y: d.y * sp };
}

// ═══════════════════════════ 모양 검사 · 스냅샷 줄이기 ═══════════════════════════
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isInt = (v: unknown, lo = -Infinity, hi = Infinity): v is number => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const P_NUMS = ['x', 'y', 'vx', 'vy', 'fx', 'fy', 'charge', 'lobTicks', 'noTouch', 'kickTicks', 'stamina'] as const;
const P_BOOLS = ['shootHeld', 'passHeld', 'throughHeld', 'lobHeld', 'sprint'] as const;
const B_NUMS = ['x', 'y', 'z', 'vx', 'vy', 'vz', 'stealLock'] as const;

const PERF_KEYS = ['maxSpeed', 'control', 'shot', 'pass', 'tackle', 'mass'] as const;
function okConfig(c: unknown): c is Dr3Config {
  return isObj(c) && isInt(c.course, 0, COURSES.length - 1) && Array.isArray(c.players) && c.players.length >= 1 && c.players.length <= 8
    && c.players.every((p, i) => isObj(p) && p.id === i && isInt(p.num, 0) && isInt(p.jersey, 0) && typeof p.name === 'string' && p.name.length <= 24
      && isBool(p.bot) && isObj(p.perf) && PERF_KEYS.every((k) => isNum((p.perf as Record<string, unknown>)[k]) && ((p.perf as Record<string, number>)[k]) > 0));
}
function okLane(l: unknown, gates: number, cones: number): boolean {
  if (!isObj(l)) return false;
  const p = l.p as Record<string, unknown>, b = l.b as Record<string, unknown>;
  return isObj(p) && p.id === 0 && P_NUMS.every((k) => isNum(p[k])) && P_BOOLS.every((k) => isBool(p[k]))
    && isObj(b) && B_NUMS.every((k) => isNum(b[k])) && (b.owner === null || b.owner === 0)
    && isInt(l.gate, 0, gates) && isInt(l.hit, 0, (1 << cones) - 1) && isInt(l.pen, 0, cones) && isInt(l.fin, -1) && isBool(l.gone);
}
function okState(s: unknown, config: Dr3Config): s is Dr3State {
  if (!isObj(s)) return false;
  const c = course3(config.course), nc = courseCones(c).length;
  return isInt(s.tick, 0) && (s.phase === 'count' || s.phase === 'run' || s.phase === 'end') && isInt(s.phaseTicks, 0)
    && Array.isArray(s.lanes) && s.lanes.length === config.players.length && s.lanes.every((l) => okLane(l, c.gates.length, nc))
    && isInt(s.first, -1) && isNum(s.seed);
}

// 레인 8개를 그대로 보내면 키 이름만으로 4KB 를 넘는다 — 레인마다 숫자 한 줄(몸 11 + 비트 + 공 7 + 주인 + 문·콘·벌점·도착·나감 = 25). 잃는 것 없음.
const PACK_V = 2;
function pack(s: Dr3State): Record<string, unknown> {
  return {
    v: PACK_V, t: s.tick, ph: s.phase, pt: s.phaseTicks, f: s.first, sd: s.seed,
    L: s.lanes.map((l) => [
      ...P_NUMS.map((k) => l.p[k]), P_BOOLS.reduce((bits, k, i) => bits | (l.p[k] ? 1 << i : 0), 0),
      ...B_NUMS.map((k) => l.b[k]), l.b.owner === null ? -1 : 0, l.gate, l.hit, l.pen, l.fin, l.gone ? 1 : 0,
    ]),
  };
}
function unpack(v: unknown, config: Dr3Config): Dr3State | null {
  // 키가 정확히 이것이어야 한다(더 있거나 빠지면 다른 무엇이다 — 2D 드리블과 같은 태도)
  if (!isObj(v) || v.v !== PACK_V || !Array.isArray(v.L) || v.L.length !== config.players.length || Object.keys(v).sort().join() !== 'L,f,ph,pt,sd,t,v') return null;
  const W = P_NUMS.length + 1 + B_NUMS.length + 6;
  const lanes: Lane3[] = [];
  for (const r of v.L) {
    if (!Array.isArray(r) || r.length !== W || !r.every(isNum)) return null;
    const p = { id: 0 } as Record<string, unknown>, b = {} as Record<string, unknown>;
    P_NUMS.forEach((k, i) => { p[k] = r[i]; });
    const bits = r[P_NUMS.length];
    P_BOOLS.forEach((k, i) => { p[k] = (bits & (1 << i)) !== 0; });
    const o = P_NUMS.length + 1;
    B_NUMS.forEach((k, i) => { b[k] = r[o + i]; });
    const q = o + B_NUMS.length;
    b.owner = r[q] === -1 ? null : r[q];
    lanes.push({ p: p as unknown as MBPlayer, b: b as unknown as MBBall, gate: r[q + 1], hit: r[q + 2], pen: r[q + 3], fin: r[q + 4], gone: r[q + 5] === 1 });
  }
  const s = { tick: v.t, phase: v.ph, phaseTicks: v.pt, lanes, first: v.f, seed: v.sd };
  return okState(s, config) ? (s as Dr3State) : null;
}

// ═══════════════════════════ 어댑터 · 등록부 ═══════════════════════════
// 입력 정수 — 3D 경기 Q3_COUNT 가지 + 마지막 하나 = 빈 자리(free3d 의 [공 모으기]와 같은 자리 — MAX_CODES 안).
const encodeDr3 = (i: Dr3Input): number => (i && i.gone ? Q3_COUNT : encodeInput3(i));
const decodeDr3 = (q: number): Dr3Input => (q === Q3_COUNT ? { ...DR3_ABSENT } : decodeInput3(q));

export const dribble3d: GameAdapter<Dr3Config, Dr3State, Dr3Input> = {
  id: 'dribble3d',
  create: createDribble3,
  step: stepDribble3,
  idle: IDLE3,
  encode: encodeDr3,
  decode: decodeDr3,
  codes: Q3_COUNT + 1,
  absentInput: DR3_ABSENT,
  okConfig,
  okState,
  tick: (s) => s.tick,
  ended: (s) => s.phase === 'end',
  slots: (c) => c.players.length,
  slotNum: (c, i) => { const p = c.players[i]; return p && !p.bot ? p.num : null; },
  phase: (s) => s.phase,
  // 출발(3·2·1 → 달리기)은 기록에 영향이 없고, 얼리면 출발 순간 내 선수가 0.1초 굳는다(2D 와 같다). 끝은 스냅샷만.
  predictsAcross: (from, to) => from === 'count' && to === 'run',
  urgent: urgent3,
  botInput: dribble3Bot,
  bodies: {
    get: (s) => s.lanes.flatMap((l) => [l.p, l.b]),
    set: (s, b: Point[]) => ({ ...s, lanes: s.lanes.map((l, i) => ({ ...l, p: b[i * 2] as MBPlayer, b: b[i * 2 + 1] as MBBall })) }),
    jump: 3,
    snap: 4,
  },
  pack,
  unpack,
};

/** 사람 목록 → 설정(2D buildDribble 과 같은 모양, 성능은 3D 능력치 표). */
export function buildDribble3(humans: { num: number; name: string }[], course: number, roster: Player[]): Dr3Config {
  const byNum = new Map(roster.map((p) => [p.num, p]));
  return {
    course: Math.min(COURSES.length - 1, Math.max(0, Math.floor(course) || 0)),
    players: humans.slice(0, 8).map((h, id) => {
      const r = byNum.get(h.num);
      return { id, num: h.num, jersey: r?.jersey ?? 0, name: h.name, bot: false, perf: r ? perfOf(r, roster) : { ...BASE_PERF } };
    }),
  };
}

export const DRIBBLE3D: GameEntry<Dr3Config, Dr3State, Dr3Input, DrSettings> = {
  ...(DRIBBLE2D as unknown as GameEntry<Dr3Config, Dr3State, Dr3Input, DrSettings>),
  adapter: dribble3d,
  mode: '3d',
  describe: '콘 사이 문을 차례대로 지나 결승선까지 공을 몰고 가는 기록 경기. 선수 뒤에서 따라가며 봅니다. 코스 넷, 같이 하면 나란한 레인에서 동시에.',
  tags: ['온라인', '기록', '코스 넷'],
  absent: 'idle',   // 나간 레인을 대본 주자가 대신 달리지 않는다(2D 와 같다 — 리뷰 #2)
  buildConfig(room, roster) {
    const playing = room.members.slice(0, 8);
    return { config: buildDribble3(playing.map((m) => ({ num: m.num, name: m.name })), room.settings.course, roster), slots: playing.map((m) => m.clientId) };
  },
};
