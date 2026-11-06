// src/lib/games/dribble2d.ts — 2D 드리블 훈련장(2026-11-07 게임 묶음 3단계). 순수 — 화면·시계·난수 함수·삼각함수를 부르지 않는다.
// 설계: docs/superpowers/specs/2026-11-07-games-program-design.md §3.4
// 사용자: "자유 훈련장, 여러 드리블 훈련장, 승부차기, 프리킥 같은 게임 만들어서 온라인 가능하게 하자. 다 2d, 3d 모드 별로 가능하게 하고."
//
// 규칙(3D 판이 따라 할 것 — 보고서 p3-report.md §3 에도):
//   - 사람마다 자기 레인(LX × LY 직사각형) 하나 — 자기 공, 자기 콘. 레인끼리는 부딪치지 않는다(따로 계산하고 겹쳐 그리지 않는다).
//   - 3·2·1(COUNT_TICKS) 동안은 입력을 듣지 않는다(부정 출발이 없다). 그 뒤 달리기.
//   - 문(콘 둘)을 차례대로 지나야 한다 — 몸이 두 콘 사이 선을 넘는 그 틱에 공이 몸에서 KEEP 안에 있으면 통과. 차례가 아닌 문은 지나도 아무 일 없다
//     (= 건너뛰면 그 문으로 돌아가야 한다). 콘에 몸이나 공이 닿으면 그 콘은 넘어지고 1초 더한다(콘마다 한 번).
//   - 마지막 문 뒤에 결승선을 정한 방향으로, 공을 KEEP 안에 둔 채 넘으면 도착. 기록 = 달린 시간 + 넘어뜨린 콘 × 1초.
//   - 몸·공·킥·감쇠는 경기와 같은 조각(multiball.stepBodies — 레인 하나에 몸 하나·공 하나).
//   - 끝: 모두 도착했거나, 첫 도착 뒤 AFTER_FIRST(30초), 또는 RUN_CAP(150초). 순위 = 도착한 사람은 기록 순, 못 한 사람은 지난 문 수 순.
//   - 코스 넷(우리 것 — 어느 게임의 코스도 가져오지 않았다): ① 지그재그 ② 8자 ③ 좁은 문 ④ 왕복. 메달 기준 = 대본 주자(dribbleBot)로 잰 시간에서.
import type { Body, Geo, Input, KickBody } from '../game/sim.ts';
import { NO_INPUT, pitchOf } from '../game/sim.ts';
import { stepBodies } from '../game/multiball.ts';
import { KICK_OFFSET, Q_COUNT, decodeInput, encodeInput } from '../game/quant.ts';
import type { Perf } from '../game/stats.ts';
import { BASE_PERF, perfOf } from '../game/stats.ts';
import { MAX_HUMANS } from '../game/room.ts';
import type { Player } from '../types.ts';
import type { GameAdapter, Point } from './adapter.ts';
import type { GameEntry } from './entry.ts';

// ═══════════════════════════ 조절 값 ═══════════════════════════
/** 레인 반 길이·반 폭(논리 단위, 몸 반지름 22). */
export const LX = 620, LY = 170;
export const CONE_R = 8;
/** 공을 "데리고 있다"고 치는 몸–공 거리(가운데끼리). */
export const KEEP = 90;
export const COUNT_TICKS = 180;          // 3·2·1
export const RUN_CAP = 150 * 60;         // 150초
export const AFTER_FIRST = 30 * 60;      // 첫 도착 뒤 30초
export const CONE_PENALTY = 60;          // 콘 하나 1초
// ════════════════════════════════════════════════════════════

/** 문 — 가운데(x,y), 콘 사이 w, 방향 o('v' = 콘이 위아래 — 옆으로 지나감, 'h' = 콘이 좌우 — 위아래로 지나감), 지나는 방향(px,py — 대본 주자가 쓴다). */
export type Gate = { x: number; y: number; w: number; o: 'v' | 'h'; px: number; py: number };
/** medals = 금·은·동 기준 시간(초, 콘 벌점 포함 기록이 이 이하면). */
export type Course = { id: string; name: string; start: Point; gates: Gate[]; cones: Point[]; finish: { x: number; dir: 1 | -1 }; medals: [number, number, number] };

const V = (x: number, y: number, w: number, px = 1, py = 0): Gate => ({ x, y, w, o: 'v', px, py });
const H = (x: number, y: number, w: number, px = 0, py = 1): Gate => ({ x, y, w, o: 'h', px, py });

/** 코스 넷. 메달 시간은 2026-11-07 대본 주자(dribbleBot) 기록에서 정했다(보고서 §4): 금 = 대본이 콘 벌점 없이 달린 시간(34.1·46.0·33.2·18.9초)을 내림,
 *  은 = 벌점 넣은 대본 기록(41.1·59.0·42.2·21.9초) — 금보다 25% 이상 길게, 동 = 은의 1.4배쯤. 콘을 안 치고 대본만큼 몰면 금. */
export const COURSES: readonly Course[] = [
  { id: 'zigzag', name: '지그재그', start: { x: -560, y: 0 },
    gates: [-400, -240, -80, 80, 240, 400].map((x, i) => V(x, i % 2 ? 70 : -70, 84)), cones: [], finish: { x: 560, dir: 1 }, medals: [34, 43, 60] },
  { id: 'eight', name: '8자', start: { x: -560, y: -100 },
    gates: [V(-200, -100, 90), V(0, 0, 90, 1, 1), V(200, 100, 90), H(330, 0, 90, 0, -1), V(200, -100, 90, -1, 0), V(0, 0, 90, -1, 1), V(-200, 100, 90, -1, 0), H(-330, 0, 90, 0, -1)],
    cones: [{ x: -200, y: 0 }, { x: 200, y: 0 }], finish: { x: -470, dir: -1 }, medals: [46, 59, 85] },
  { id: 'narrow', name: '좁은 문', start: { x: -560, y: 0 },
    gates: [-400, -240, -80, 80, 240, 400].map((x, i) => V(x, [0, 50, -50, 70, -70, 0][i], 70)), cones: [], finish: { x: 560, dir: 1 }, medals: [33, 42, 60] },
  { id: 'shuttle', name: '왕복', start: { x: -540, y: -70 },
    gates: [V(-250, -70, 90), V(100, -70, 90), H(440, 0, 110, 0, 1), V(100, 70, 90, -1, 0), V(-250, 70, 90, -1, 0)],
    cones: [], finish: { x: -560, dir: -1 }, medals: [19, 24, 34] },
];
export const courseOf = (i: number): Course => COURSES[Math.min(COURSES.length - 1, Math.max(0, Math.floor(i) || 0))];

/** 콘 둘(문의 양 끝). */
export function gateCones(g: Gate): [Point, Point] {
  const h = g.w / 2;
  return g.o === 'v' ? [{ x: g.x, y: g.y - h }, { x: g.x, y: g.y + h }] : [{ x: g.x - h, y: g.y }, { x: g.x + h, y: g.y }];
}
/** 코스의 모든 콘 — 문 콘(문 차례대로 둘씩) 다음 따로 선 콘. 넘어뜨림 표시(hit)의 비트 차례. */
export function courseCones(c: Course): Point[] {
  return [...c.gates.flatMap(gateCones), ...c.cones];
}

/** 선분 둘이 만나나(끝점 닿음 포함) — 몸이 이 틱에 문 선을 넘었나. 사칙연산만. */
export function crosses(a: Point, b: Point, c: Point, d: Point): boolean {
  const o = (p: Point, q: Point, r: Point): number => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = o(c, d, a), d2 = o(c, d, b), d3 = o(a, b, c), d4 = o(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0) || d1 === 0 || d2 === 0) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0) || d3 === 0 || d4 === 0)
    && !(d1 === 0 && d2 === 0);
}

/** 문 하나를 지났나 — 차례인 문(gate)만 본다. 이 틱에 몸이나 공이 두 콘 사이 선을 넘었고, 그때 공이 몸에서 KEEP 안이면 통과.
 *  (공만 먼저 문을 지나도 데리고 있으면 센다 — 공을 몰고 지나가는 느낌대로.) 3D 도 같은 판정.
 *  방향을 안 보고 공이 콘 바깥(몸에서 KEEP 안)이어도 세는 너그러움은 일부러다(2026-11-07 리뷰 #12 — 지금 코스엔 이걸로 줄일 길이 없다). */
export function passGate(course: Course, gate: number, from: Point, to: Point, ballFrom: Point, ball: Point): boolean {
  const g = course.gates[gate];
  if (!g) return false;
  const [a, b] = gateCones(g);
  const dx = ball.x - to.x, dy = ball.y - to.y;
  return dx * dx + dy * dy <= KEEP * KEEP && (crosses(from, to, a, b) || crosses(ballFrom, ball, a, b));
}
/** 결승선 — 문을 다 지난 뒤 정한 방향으로 넘었고 공이 KEEP 안. */
export function passFinish(course: Course, gate: number, from: Point, to: Point, ball: Point): boolean {
  if (gate < course.gates.length) return false;
  const f = course.finish, dx = ball.x - to.x, dy = ball.y - to.y;
  return dx * dx + dy * dy <= KEEP * KEEP && (f.dir > 0 ? from.x < f.x && to.x >= f.x : from.x > f.x && to.x <= f.x);
}
/** 기록(초) = 달린 틱 + 콘 벌점. 못 했으면 null. */
export const laneTime = (l: Lane): number | null => (l.fin < 0 ? null : (l.fin + l.pen * CONE_PENALTY) / 60);
/** 메달 — 0 금, 1 은, 2 동, null 없음. */
export function medalOf(course: Course, seconds: number | null): 0 | 1 | 2 | null {
  if (seconds === null) return null;
  return seconds <= course.medals[0] ? 0 : seconds <= course.medals[1] ? 1 : seconds <= course.medals[2] ? 2 : null;
}

export type DrPlayer = { id: number; num: number; jersey: number; name: string; bot: boolean; perf: Perf };
export type DrConfig = { course: number; players: DrPlayer[] };
/** 레인 하나 — 몸 p, 공 b, 다음 문 gate, 넘어뜨린 콘 hit(비트), 콘 벌점 수 pen, 도착 fin(달린 틱, 못 했으면 −1). */
/** gone = 그 레인 사람이 자리를 비웠다(방장이 넣은 빈 자리 입력을 받는 중 — 2026-11-07 리뷰 #2). 돌아오면 거짓으로. */
export type Lane = { p: KickBody; b: Body; gate: number; hit: number; pen: number; fin: number; gone: boolean };
/** 드리블 입력 = 경기 입력 + "빈 자리"(방장이 나간 사람 자리에 넣는다 — 스냅샷 입력에 실려 손님도 안다). */
export type DrInput = Input & { gone?: true };
export const DR_ABSENT: DrInput = { x: 0, y: 0, kick: false, gone: true };
export type DrPhase = 'count' | 'run' | 'end';
export type DrState = { tick: number; phase: DrPhase; phaseTicks: number; lanes: Lane[]; first: number; seed: number };

/** 레인 벽 — 몸과 공 모두 이 직사각형 안. 경기의 Geo 모양으로 만들어 multiball.stepBodies 를 그대로 쓴다(골문 없음). */
const P = pitchOf('M');
const RECT: [number, number, number, number][] = [[-LX, -LY, LX, -LY], [-LX, LY, LX, LY], [-LX, -LY, -LX, LY], [LX, -LY, LX, LY]];
export const LANE_GEO: Geo = { pitch: P, HW: LX, HH: LY, GH: 0, GD: 0, OW: LX, OH: LY, ballWalls: RECT, posts: [], playerWalls: RECT, fx: 1, fy: 1 };

function startLane(c: Course): Lane {
  const s = c.start, dir = c.gates[0] ? Math.sign(c.gates[0].x - s.x) || 1 : 1;
  return { p: { x: s.x, y: s.y, vx: 0, vy: 0, kickCooldown: 0, kicking: false, kickFlash: 0 }, b: { x: s.x + dir * 40, y: s.y, vx: 0, vy: 0 }, gate: 0, hit: 0, pen: 0, fin: -1, gone: false };
}

export function createDribble(config: DrConfig, seed: number): DrState {
  const c = courseOf(config.course);
  return { tick: 0, phase: 'count', phaseTicks: 0, lanes: config.players.map(() => startLane(c)), first: -1, seed: seed >>> 0 };
}

export function stepDribble(state: DrState, config: DrConfig, inputs: DrInput[]): DrState {
  const s: DrState = { ...state, tick: state.tick + 1, phaseTicks: state.phaseTicks + 1, lanes: state.lanes.map((l) => ({ ...l, p: { ...l.p }, b: { ...l.b } })) };
  if (s.phase === 'end') return s;
  const c = courseOf(config.course), cones = courseCones(c);
  const run = s.phase === 'run';
  s.lanes.forEach((l, i) => {
    const from = { x: l.p.x, y: l.p.y }, bfrom = { x: l.b.x, y: l.b.y };
    // 출발 전·도착 뒤엔 손을 뗀 것으로(몸·공은 굴러가던 대로 선다)
    if (l.fin < 0) l.gone = !!inputs[i]?.gone;   // 빈 자리 — 레인은 서고(대신 달리지 않는다) 결과에 "나감"
    const inp = run && l.fin < 0 && !l.gone ? inputs[i] ?? NO_INPUT : NO_INPUT;
    stepBodies([l.p], [config.players[i].perf], [l.b], [inp], LANE_GEO);
    if (!run || l.fin >= 0) return;
    // 콘 — 몸이나 공이 닿으면 넘어지고 1초(콘마다 한 번)
    cones.forEach((k, j) => {
      if (l.hit & (1 << j)) return;
      const pd = (l.p.x - k.x) * (l.p.x - k.x) + (l.p.y - k.y) * (l.p.y - k.y), bd = (l.b.x - k.x) * (l.b.x - k.x) + (l.b.y - k.y) * (l.b.y - k.y);
      if (pd < (P.playerR + CONE_R) * (P.playerR + CONE_R) || bd < (P.ballR + CONE_R) * (P.ballR + CONE_R)) { l.hit |= 1 << j; l.pen += 1; }
    });
    if (passGate(c, l.gate, from, l.p, bfrom, l.b)) l.gate += 1;
    else if (passFinish(c, l.gate, from, l.p, l.b)) { l.fin = s.phaseTicks; if (s.first < 0) s.first = s.phaseTicks; }
  });
  if (s.phase === 'count' && s.phaseTicks >= COUNT_TICKS) { s.phase = 'run'; s.phaseTicks = 0; }
  else if (run) {
    const all = s.lanes.every((l) => l.fin >= 0 || l.gone);   // 나간 레인은 기다리지 않는다
    const late = s.lanes.length > 1 && s.first >= 0 && s.phaseTicks - s.first >= AFTER_FIRST;
    if (all || late || s.phaseTicks >= RUN_CAP) { s.phase = 'end'; s.phaseTicks = 0; }
  }
  return s;
}

/** 순위(레인 번호 차례) — 도착한 사람은 기록 순, 못 한 사람은 지난 문이 많은 순(나간 사람은 그 아래), 같으면 레인 순. */
export function drRanking(s: DrState): number[] {
  return s.lanes.map((_, i) => i).sort((a, b) => {
    const ta = laneTime(s.lanes[a]), tb = laneTime(s.lanes[b]);
    if (ta !== null && tb !== null) return ta - tb || a - b;
    if (ta !== null) return -1;
    if (tb !== null) return 1;
    return Number(s.lanes[a].gone) - Number(s.lanes[b].gone) || s.lanes[b].gate - s.lanes[a].gate || a - b;
  });
}

// ── 대본 주자(메달 시간을 재고, 끊긴 손님 자리를 맡는다) ──
/** 다음에 공을 보낼 곳 — 차례인 문 가운데에서 지나는 방향으로 조금 더, 문을 다 지났으면 결승선 너머. */
export function dribbleTarget(c: Course, gate: number, lane: Lane): Point {
  const g = c.gates[gate];
  if (g) {
    // 공이 문 선을 넘었는데 이 문이 안 세졌다(콘 바깥으로 갔다) — 문 앞으로 되돌린다. 아니면 문 가운데를 지나 조금 더.
    const past = (lane.b.x - g.x) * g.px + (lane.b.y - g.y) * g.py > 20 && (lane.p.x - g.x) * g.px + (lane.p.y - g.y) * g.py > -10;
    return past ? { x: g.x - g.px * 90, y: g.y - g.py * 90 } : { x: g.x + g.px * 50, y: g.y + g.py * 50 };
  }
  return { x: c.finish.x + c.finish.dir * 80, y: lane.b.y };
}
/** 대본 주자 — 공 뒤(가고 싶은 쪽 반대) 줄 위에 먼저 서고(닿지 않게), 줄 위에 섰을 때만 밀고 간다. 공 앞이면 옆으로 돌아 들어간다. */
export function dribbleBot(s: DrState, config: DrConfig, slot: number): Input {
  const l = s.lanes[slot];
  if (!l || s.phase !== 'run' || l.fin >= 0) return NO_INPUT;
  const c = courseOf(config.course), R = P.playerR, BR = P.ballR;
  const t = dribbleTarget(c, l.gate, l);
  let dx = t.x - l.b.x, dy = t.y - l.b.y;
  const dl = Math.sqrt(dx * dx + dy * dy) || 1;
  dx /= dl; dy /= dl;
  const rx = l.p.x - l.b.x, ry = l.p.y - l.b.y;          // 공 → 몸
  const along = rx * dx + ry * dy;                          // 음수면 공 뒤
  const side = rx * -dy + ry * dx;                           // 줄에서 옆으로 벗어난 만큼
  const gap = R + BR + 8;
  let tx: number, ty: number, sp: number;
  if (along < -R && Math.abs(side) < 7) {
    // 줄 위 뒤 — 민다. 문 가까이·공이 빠르면 걷는다.
    const bs = Math.sqrt(l.b.vx * l.b.vx + l.b.vy * l.b.vy);
    tx = l.b.x + dx * 10; ty = l.b.y + dy * 10;
    sp = dl > 200 && bs < 260 ? 1 : 0.5;
  } else if (along < 0) {
    // 뒤쪽이지만 줄에서 벗어났다 — 공에 닿지 않는 뒤 자리로
    tx = l.b.x - dx * gap; ty = l.b.y - dy * gap; sp = 0.5;
  } else {
    // 공 앞·옆 — 옆으로 크게 돌아 뒤로
    const sgn = side >= 0 ? 1 : -1;
    tx = l.b.x - dx * gap + -dy * sgn * (R + BR + 10); ty = l.b.y - dy * gap + dx * sgn * (R + BR + 10); sp = 1;
  }
  const mx = tx - l.p.x, my = ty - l.p.y, ml = Math.sqrt(mx * mx + my * my);
  if (ml < 2) return NO_INPUT;
  if (ml < 30 && sp === 1 && along >= 0) sp = 0.5;
  return { x: mx / ml * sp, y: my / ml * sp, kick: false };
}

// ═══════════════════════════ 모양 검사 ═══════════════════════════
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isInt = (v: unknown, lo = -Infinity, hi = Infinity): v is number => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;
const isName = (v: unknown): v is string => typeof v === 'string' && v.length <= 24;
const okBody = (b: unknown): boolean => isObj(b) && isNum(b.x) && isNum(b.y) && isNum(b.vx) && isNum(b.vy);
const okPerf = (p: unknown): boolean => isObj(p) && isNum(p.maxSpeed) && isNum(p.accel) && isNum(p.kick) && isNum(p.mass) && p.mass > 0;

function okConfig(c: unknown): c is DrConfig {
  return isObj(c) && isInt(c.course, 0, COURSES.length - 1) && Array.isArray(c.players) && c.players.length >= 1 && c.players.length <= MAX_HUMANS
    && c.players.every((p, i) => isObj(p) && p.id === i && isInt(p.num, 0) && isInt(p.jersey, 0) && isName(p.name) && typeof p.bot === 'boolean' && okPerf(p.perf));
}
function okLane(l: unknown, gates: number, cones: number): boolean {
  if (!isObj(l)) return false;
  const p = l.p as Record<string, unknown>;
  return okBody(p) && isNum(p.kickCooldown) && typeof p.kicking === 'boolean' && isNum(p.kickFlash) && okBody(l.b)
    && isInt(l.gate, 0, gates) && isInt(l.hit, 0, 2 ** cones - 1) && isInt(l.pen, 0, cones) && isInt(l.fin, -1) && typeof l.gone === 'boolean';
}
function okState(s: unknown, config: DrConfig): s is DrState {
  if (!isObj(s)) return false;
  const c = courseOf(config.course), nc = courseCones(c).length;
  return isInt(s.tick, 0) && (s.phase === 'count' || s.phase === 'run' || s.phase === 'end') && isInt(s.phaseTicks, 0)
    && Array.isArray(s.lanes) && s.lanes.length === config.players.length && s.lanes.every((l) => okLane(l, c.gates.length, nc))
    && isInt(s.first, -1) && isNum(s.seed);
}

// ── 스냅샷 줄이기(레인 8개면 키 이름만 2KB 를 넘는다) — 레인마다 숫자 15개 한 줄. 잃는 것 없음. ──
function pack(s: DrState): Record<string, unknown> {
  return {
    t: s.tick, ph: s.phase, pt: s.phaseTicks, f: s.first, sd: s.seed,
    L: s.lanes.map((l) => [l.p.x, l.p.y, l.p.vx, l.p.vy, l.p.kickCooldown, l.p.kicking ? 1 : 0, l.p.kickFlash, l.b.x, l.b.y, l.b.vx, l.b.vy, l.gate, l.hit, l.pen, l.fin, l.gone ? 1 : 0]),
  };
}
function unpack(v: unknown, config: DrConfig): DrState | null {
  // 모양이 정확히 이것이어야 한다(키가 더 있거나 빠지면 다른 무엇이다)
  if (!isObj(v) || !Array.isArray(v.L) || Object.keys(v).sort().join() !== 'L,f,ph,pt,sd,t') return null;
  const lanes: Lane[] = [];
  for (const r of v.L) {
    if (!Array.isArray(r) || r.length !== 16 || !r.every(isNum)) return null;
    lanes.push({ p: { x: r[0], y: r[1], vx: r[2], vy: r[3], kickCooldown: r[4], kicking: r[5] === 1, kickFlash: r[6] }, b: { x: r[7], y: r[8], vx: r[9], vy: r[10] }, gate: r[11], hit: r[12], pen: r[13], fin: r[14], gone: r[15] === 1 });
  }
  const s = { tick: v.t, phase: v.ph, phaseTicks: v.pt, lanes, first: v.f, seed: v.sd };
  return okState(s, config) ? s : null;
}

// ═══════════════════════════ 어댑터 ═══════════════════════════
export const dribble2d: GameAdapter<DrConfig, DrState, DrInput> = {
  id: 'dribble2d',
  create: createDribble,
  step: stepDribble,
  idle: NO_INPUT,
  encode: (i: DrInput) => (i && i.gone ? Q_COUNT : encodeInput(i)),
  decode: (q: number): DrInput => (q === Q_COUNT ? { ...DR_ABSENT } : decodeInput(q)),
  codes: Q_COUNT + 1,   // 경기 66가지 + 빈 자리
  absentInput: DR_ABSENT,
  okConfig,
  okState,
  tick: (s) => s.tick,
  ended: (s) => s.phase === 'end',
  slots: (c) => c.players.length,
  slotNum: (c, i) => { const p = c.players[i]; return p && !p.bot ? p.num : null; },
  phase: (s) => s.phase,
  // 출발(3·2·1 → 달리기)은 기록에 영향이 없고, 얼리면 출발 순간 내 선수가 0.1초 굳는다. 끝은 스냅샷만.
  predictsAcross: (from, to) => from === 'count' && to === 'run',
  urgent: (a, b) => (a >= KICK_OFFSET) !== (b >= KICK_OFFSET),
  botInput: dribbleBot,
  bodies: {
    get: (s) => s.lanes.flatMap((l) => [l.p, l.b]),
    set: (s, b: Point[]) => ({ ...s, lanes: s.lanes.map((l, i) => ({ ...l, p: b[i * 2] as KickBody, b: b[i * 2 + 1] as Body })) }),
  },
  pack,
  unpack,
};

// ═══════════════════════════ 방 ═══════════════════════════
export type DrSettings = { course: number };
export const DR_DEFAULTS: DrSettings = { course: 0 };

export function buildDribble(humans: { num: number; name: string }[], course: number, roster: Player[]): DrConfig {
  const byNum = new Map(roster.map((p) => [p.num, p]));
  return {
    course: courseOf(course) === COURSES[course] ? course : 0,
    players: humans.slice(0, MAX_HUMANS).map((h, id) => {
      const r = byNum.get(h.num);
      return { id, num: h.num, jersey: r?.jersey ?? 0, name: h.name, bot: false, perf: r ? perfOf(r, roster) : { ...BASE_PERF } };
    }),
  };
}

export const DRIBBLE2D: GameEntry<DrConfig, DrState, DrInput, DrSettings> = {
  adapter: dribble2d,
  mode: '2d',
  name: '드리블 훈련장',
  describe: '콘 사이 문을 차례대로 지나 결승선까지 공을 몰고 가는 기록 경기. 코스 넷, 같이 하면 나란한 레인에서 동시에 달립니다.',
  tags: ['온라인', '기록', '코스 넷'],
  defaultSettings: DR_DEFAULTS,
  okSettings: (v): v is DrSettings => isObj(v) && Object.keys(v).length === 1 && isInt(v.course, 0, COURSES.length - 1),   // 칸은 정확히 하나(리뷰 #11)
  applySettings(cur, patch) {
    const c = isObj(patch) && isInt(patch.course, 0, COURSES.length - 1) ? patch.course : cur.course;
    return c === cur.course ? cur : { course: c };
  },
  lobby: 'all',
  absent: 'idle',   // 나간 레인을 대본 주자가 대신 달리지 않는다(리뷰 #2)
  buildConfig(room, roster) {
    const playing = room.members.slice(0, MAX_HUMANS);
    return { config: buildDribble(playing.map((m) => ({ num: m.num, name: m.name })), room.settings.course, roster), slots: playing.map((m) => m.clientId) };
  },
};
