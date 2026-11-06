// src/lib/games/freekick3d.ts — 3D 프리킥(2026-11-07 게임 묶음 6단계). 순수 — 화면·시계·난수 함수·삼각함수를 부르지 않는다.
// 설계: docs/superpowers/specs/2026-11-07-games-program-design.md §3.2 "3D: 벽을 넘기는 높이와 세기 조절이 핵심."
// 사용자: "자유 훈련장, 여러 드리블 훈련장, 승부차기, 프리킥 같은 게임 만들어서 온라인 가능하게 하자. 다 2d, 3d 모드 별로 가능하게 하고."
//
// 2D 프리킥(freekick2d.ts)과 같은 판이다 — 자리 다섯과 점수(FK_SPOTS), 차례(fkTurn·fkTotal: 자리마다 방 사람이 차례로 한 번씩),
// 순위(fkRanking — 화면이 쓴다), 키퍼 봇 계획(fkKeeperPlan: 반응·읽기·열린 쪽 짐작), 벽·키퍼가 서는 쪽(nearSide), 단계와 시간(READY·AIM·RESULT),
// 5초 자동 슛, 차기 안에서 뗐다 눌러야 세기, 조준·감기는 키커 화면에만(떼는 틱에만 실린다), 방 규칙(FREEKICK2D 펼침 — lobby 'all')을 그대로 쓴다.
// 3D 가 더한 것:
//   - 자리는 3D 경기장의 오른쪽 골대 앞 — 2D 자리 좌표 × FK_SCALE m(같은 배치를 m 로). 공·골대·그물·크로스바·땅은 경기 계산 그대로.
//   - 조준은 옆과 높이(3D 승부차기와 같은 입력 — 옆은 FK3_AIM_SCALE 배), 공은 조준점까지 포물선(launch3). 벽을 넘기려면 띄워야 하고
//     크로스바 아래로 떨어져야 한다 — 세기(빠를수록 덜 떨어진다)와 높이 고르기가 판의 핵심.
//   - 감아차기는 2D 와 같은 하나 — 세기를 모으는 동안 스틱 좌우가 떼는 순간의 x 로 실려, 찬 뒤 0.7초 가로로 휜다(curl3). 3D 에서도 벽 옆을
//     돌아 들어가는 길이 화면에 그대로 보여서 남겼다.
//   - 수비벽 봇 셋은 몸 부피(캡슐 — 승부차기 키퍼 몸통과 같은 굵기)이고 공이 나가고 WALL_REACT 틱 뒤 다 같이 한 번 뛴다(결정적, 약 0.3m).
//   - 키퍼 봇은 3D 승부차기 키퍼 몸(keeper3Step·keeperCapsules) — 반응 뒤 공을 읽으면 지날 곳(옆·높이)으로, 아니면 열린 쪽/벽 쪽을 짐작해 던진다.
import { GAME_COPY } from './copy.ts';
import type { Ball } from '../game3d/sim.ts';
import { PITCH3D, TUNE3D, rand } from '../game3d/sim.ts';
import { BASE_PERF } from '../game/stats.ts';
import type { FkConfig, FkLog, FkOutcome, FkSettings } from './freekick2d.ts';
import { FK_SPOTS, FREEKICK2D, fkKeeperPlan, fkTotal, fkTurn, nearSide, READY_TICKS, AIM_TICKS, RESULT_TICKS, CURL_RATE, CURL_TICKS, GONE_AFTER, GONE_SHOW } from './freekick2d.ts';
import { AUTO_POWER, CHARGE_TICKS, planRand } from './penalty2d.ts';
import type { Aim3, Capsule, Keeper3, Pen3Input, Striker3 } from './penalty3d.ts';
import {
  AIM_MAX, BODY_R, BODY_Z0, BODY_Z1, PEN3_CODES, PEN3_IDLE, STAND_ARM, crossing, decodePen3, encodePen3, keeper3Step, keeperCapsules, launch3, moveBall3, penalty3d,
} from './penalty3d.ts';
import type { GameAdapter, Point } from './adapter.ts';
import type { GameEntry } from './entry.ts';

// ═══════════════════════════ 조절 값 ═══════════════════════════
const { HW, goalHalfW: GW, goalH: GH, ballR: BR } = PITCH3D;
/** 2D 자리 좌표(논리 단위) → m. 정면 290 → 9.3m, 먼 측면 430 → 13.8m(3D 골대 5.2 × 2.1 앞에서 벽을 넘기기가 되는 거리). */
export const FK_SCALE = 0.032;
/** 자리(m) — x 는 경기장 x(골대 쪽 +), y 는 옆. 2D FK_SPOTS 의 x(옆)·y(골라인에서 거리)를 옮긴 것. 점수·이름은 2D 그대로. */
export const FK3_SPOTS: readonly { x: number; y: number; pts: number; name: string }[] = FK_SPOTS.map((s) => ({ x: HW - s.y * FK_SCALE, y: s.x * FK_SCALE, pts: s.pts, name: s.name }));
/** 조준 배율 — 입력의 옆 조준(±3.6m)에 곱한다. 먼 측면에서 벽 바깥·먼 기둥까지 겨누려면 ±5m 쯤이 필요해서(2D 의 배율과 같은 까닭). */
export const FK3_AIM_SCALE = 1.4;
export const FK3_AIM_MAX = AIM_MAX * FK3_AIM_SCALE;
/** 벽 — 가까운 기둥 쪽 골라인 위 WALL_AIM m 을 향해, 공에서 그 거리의 WALL_FRAC 지점에 가로로 셋(가운데끼리 WALL_GAP). */
const WALL_AIM = 1.65, WALL_FRAC = 0.4, WALL_GAP = 0.55;
export const WALL_R = BODY_R;
const WALL_REACT = 5;                 // 공이 나가고 이만큼 뒤 뛴다(틱)
const WALL_JUMP_V = 3.0;              // 뛰는 세로 속도(높이 v²/2g ≈ 0.3m)
const KEEPER_HOME = 0.45;             // 키퍼는 벽 반대쪽(열린 쪽)으로 이만큼
const GUESS_Y = 1.8;                  // 못 읽으면 짐작하는 자리(가운데에서)
const SLOW_READ = 19;                 // 이보다 느린 공(m/s, 가로)은 키퍼가 늘 읽는다
const FLIGHT_MAX = 150;
/** 대본 키커가 벽 쪽 길을 고를 때 벽 몸에서 남기는 여유(m) — 흔들림에도 벽에 덜 걸리게. */
const WALL_MARGIN = 0.1;
// ════════════════════════════════════════════════════════════

export type Fk3State = {
  tick: number; phase: 'ready' | 'aim' | 'flight' | 'result' | 'end'; phaseTicks: number; n: number;
  kickNo: number; spot: number; kicker: number;
  points: number[]; log: FkLog[];
  outcome: FkOutcome | null; power: number; curl: number;
  ball: Ball; gk: Keeper3; st: Striker3;
  /** 벽이 뛴 높이(발이 땅에서 뜬 만큼)와 세로 속도 — 셋이 같이 뛴다. */
  wallZ: number; wallVz: number;
  kickSeed: number; seed: number;
};

const fin = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** 벽 사람 셋의 자리(m). 순수 — 자리마다 같다. */
export function fk3Wall(spot: number): Point[] {
  const s = FK3_SPOTS[spot] ?? FK3_SPOTS[0], side = nearSide(spot);
  const dx = HW - s.x, dy = side * WALL_AIM - s.y, len = Math.sqrt(dx * dx + dy * dy);
  const ux = dx / len, uy = dy / len, cx = s.x + dx * WALL_FRAC, cy = s.y + dy * WALL_FRAC;
  return [-1, 0, 1].map((k) => ({ x: cx - uy * WALL_GAP * k, y: cy + ux * WALL_GAP * k }));
}
const WALLS = FK3_SPOTS.map((_, i) => fk3Wall(i));
/** 벽 몸 캡슐(뛴 높이 포함). */
export function wallCapsules(spot: number, z: number): Capsule[] {
  return (WALLS[spot] ?? WALLS[0]).map((p) => [p.x, p.y, BODY_Z0 + z, p.x, p.y, BODY_Z1 + z, WALL_R] as const);
}
export const keeperHome3 = (spot: number): number => -nearSide(spot) * KEEPER_HOME;

const KEEPER_X3 = HW - 0.35;
function setupKick(s: Fk3State): void {
  const t = fkTurn(s.kickNo, s.n), sp = FK3_SPOTS[t.spot];
  s.spot = t.spot; s.kicker = t.kicker;
  s.ball = { x: sp.x, y: sp.y, z: BR, vx: 0, vy: 0, vz: 0 };
  // 키커는 공 뒤 — 골문 가운데에서 공을 지나는 줄 위
  const dx = sp.x - HW, dy = sp.y, len = Math.sqrt(dx * dx + dy * dy) || 1;
  s.st = { x: sp.x + (dx / len) * 0.95, y: sp.y + (dy / len) * 0.95, vx: 0, vy: 0, charge: 0, held: false, armed: false, kickFlash: 0 };
  s.gk = { x: KEEPER_X3, y: keeperHome3(t.spot), vx: 0, vy: 0, z: 0, vz: 0, dive: 0, diveH: 1, diveT: 0, lie: 0, dived: false, armed: true };
  s.wallZ = 0; s.wallVz = 0;
  s.outcome = null; s.power = 0; s.curl = 0;
  s.kickSeed = Math.floor(rand(s) * 4294967296) >>> 0;
  s.phase = 'ready'; s.phaseTicks = 0;
}

export function createFreekick3(config: FkConfig, seed: number): Fk3State {
  const n = config.players.length;
  const s: Fk3State = {
    tick: 0, phase: 'ready', phaseTicks: 0, n, kickNo: 0, spot: 0, kicker: 0, points: config.players.map(() => 0), log: [],
    outcome: null, power: 0, curl: 0, ball: { x: 0, y: 0, z: BR, vx: 0, vy: 0, vz: 0 },
    gk: { x: KEEPER_X3, y: 0, vx: 0, vy: 0, z: 0, vz: 0, dive: 0, diveH: 1, diveT: 0, lie: 0, dived: false, armed: true },
    st: { x: 0, y: 0, vx: 0, vy: 0, charge: 0, held: false, armed: false, kickFlash: 0 }, wallZ: 0, wallVz: 0, kickSeed: 0, seed: seed >>> 0,
  };
  setupKick(s);
  return s;
}

/** 키커 화면의 미리 보기 — 흔들림 없이 이 조준·세기·감기로 차면 공이 갈 길(벽·키퍼 없이, 골라인을 지나거나 멈출 때까지). 순수. 대본 키커도 쓴다. */
export function fk3Path(spot: number, aim: Aim3, power: number, curl: number, every = 3, ry = 0, rz = 0): { x: number; y: number; z: number }[] {
  const sp = FK3_SPOTS[spot] ?? FK3_SPOTS[0];
  const b: Ball = { x: sp.x, y: sp.y, z: BR, vx: 0, vy: 0, vz: 0 };
  const v = launch3(b, { y: fin(aim.y) * FK3_AIM_SCALE, z: fin(aim.z) }, power, BASE_PERF, ry, rz, FK3_AIM_MAX);   // 조준은 입력 모양(strike 와 같은 배율)
  b.vx = v.vx; b.vy = v.vy; b.vz = v.vz;
  const out = [{ x: b.x, y: b.y, z: b.z }];
  for (let t = 0; t < 120 && b.x < HW + BR; t++) {
    moveBall3(b, [], t < CURL_TICKS ? curl * CURL_RATE * TUNE3D.SUB_DT : 0);
    if (t % every === 0) out.push({ x: b.x, y: b.y, z: b.z });
    if (b.vx <= 0) break;
  }
  out.push({ x: b.x, y: b.y, z: b.z });
  return out;
}

function strike(s: Fk3State, config: FkConfig, power: number, aim: Aim3, curl: number): void {
  const perf = config.players[s.kicker].perf;
  const ry = rand(s) * 2 - 1, rz = rand(s) * 2 - 1;
  const v = launch3(s.ball, { y: fin(aim.y) * FK3_AIM_SCALE, z: fin(aim.z) }, power, perf, ry, rz, FK3_AIM_MAX);
  s.ball.vx = v.vx; s.ball.vy = v.vy; s.ball.vz = v.vz;
  s.power = clamp(fin(power), 0, 1);
  s.curl = clamp(fin(curl), -1, 1);
  s.st.held = false; s.st.kickFlash = 12;
  s.phase = 'flight'; s.phaseTicks = 0;
}

/** 키퍼 봇(계산 안 — 키퍼는 자리가 아니다). 2D 프리킥 키퍼 계획을 그대로 쓰고, 읽으면 지날 높이로 던질 높이를 고른다. */
function keeperInput(s: Fk3State): Pen3Input {
  const gk = s.gk;
  if (s.phase === 'aim' || s.phase === 'ready') {
    const dy = keeperHome3(s.spot) - gk.y;
    return { x: dy > 0.08 ? 0.5 : dy < -0.08 ? -0.5 : 0, y: 0, kick: false, aim: null };
  }
  if (s.phase !== 'flight') return PEN3_IDLE;
  const p = fkKeeperPlan(s.kickSeed);
  if (s.phaseTicks < p.react) return PEN3_IDLE;
  // 느린 공(띄워 넘긴 공)은 짐작하지 않고 읽는다 — 시간이 넉넉해서(3D 에서 벽을 넘기는 슛이 공짜가 되지 않게)
  const b = s.ball, slow = b.vx * b.vx + b.vy * b.vy < SLOW_READ * SLOW_READ;
  const c = p.reads || slow ? crossing(b) : null;
  const side = nearSide(s.spot);
  const ty = c ? c.y : (p.open ? -side : side) * GUESS_Y;
  const hz = c ? (c.z > 1.25 ? 1 : c.z < 0.55 ? -1 : 0) : 0;
  const dy = ty - gk.y;
  if (Math.abs(dy) < STAND_ARM + BR) return { x: dy > 0.05 ? 1 : dy < -0.05 ? -1 : 0, y: hz, kick: !gk.dived && hz > 0, aim: null };
  return { x: dy > 0 ? 1 : -1, y: hz, kick: !gk.dived, aim: null };
}

function judge(s: Fk3State, keeper: boolean, wall: boolean, frame: boolean): FkOutcome | null {
  const b = s.ball;
  if (keeper) return 'save';
  if (wall) return 'wall';
  if (b.x > HW + BR && Math.abs(b.y) < GW && b.z < GH) return 'goal';
  if (b.x >= HW - BR - 0.02 && (Math.abs(b.y) >= GW - BR || b.z >= GH - BR)) return frame ? 'post' : 'miss';
  if ((frame && b.vx < 0) || (b.vx === 0 && b.vy === 0 && b.vz === 0) || s.phaseTicks >= FLIGHT_MAX) return frame ? 'post' : 'miss';
  return null;
}

const KEEPER_PERF = { ...BASE_PERF };

/** 3D 프리킥 입력 = 3D 승부차기 입력 + "빈 자리"(방장이 나간 사람 자리에 넣는다 — 2D FK_ABSENT 와 같은 뜻, 2026-11-07 리뷰 #2). */
export type Fk3Input = Pen3Input & { gone?: true };
export const FK3_ABSENT: Fk3Input = { ...PEN3_IDLE, gone: true };

export function stepFreekick3(state: Fk3State, config: FkConfig, inputs: Fk3Input[]): Fk3State {
  if (state.phase === 'end') return { ...state, tick: state.tick + 1, phaseTicks: state.phaseTicks + 1 };
  const s: Fk3State = { ...state, points: [...state.points], ball: { ...state.ball }, gk: { ...state.gk }, st: { ...state.st } };
  s.tick += 1; s.phaseTicks += 1;
  const kin: Fk3Input = inputs[s.kicker] ?? PEN3_IDLE;
  if (s.st.kickFlash > 0) s.st.kickFlash -= 1;
  // 차례인 사람의 자리가 비었다 — 2D 와 같이 준비 화면을 잠깐 보여 준 뒤 그 차기를 넘긴다(점수 없음, 판정 띠 짧게)
  if (kin.gone && (s.phase === 'aim' || (s.phase === 'ready' && s.phaseTicks >= GONE_AFTER))) {
    s.outcome = 'gone';
    s.log = [...s.log, { kicker: s.kicker, spot: s.spot, out: 'gone' }];
    s.phase = 'result'; s.phaseTicks = RESULT_TICKS - GONE_SHOW;
    return s;
  }

  if (s.phase === 'ready') {
    if (!kin.kick) s.st.armed = true;
    keeper3Step(s.gk, KEEPER_PERF, keeperInput(s), true);
    if (s.phaseTicks >= READY_TICKS) { s.phase = 'aim'; s.phaseTicks = 0; }
    return s;
  }
  if (s.phase === 'aim') {
    const st = s.st;
    if (!kin.kick) {
      if (st.held) strike(s, config, st.charge / CHARGE_TICKS, kin.aim ?? { y: 0, z: 0 }, kin.x);
      else st.armed = true;
    } else if (st.armed) { st.held = true; st.charge = Math.min(CHARGE_TICKS, st.charge + 1); }
    if (s.phase === 'aim' && s.phaseTicks >= AIM_TICKS) strike(s, config, AUTO_POWER, { y: 0, z: 0 }, 0);
    keeper3Step(s.gk, KEEPER_PERF, keeperInput(s), true);
    return s;
  }
  // 벽 — 공이 나가고 WALL_REACT 틱에 같이 뛴다
  if (s.phase === 'flight' && s.phaseTicks === WALL_REACT) s.wallVz = WALL_JUMP_V;
  if (s.wallZ > 0 || s.wallVz > 0) {
    s.wallZ += s.wallVz * TUNE3D.DT; s.wallVz -= TUNE3D.GRAVITY * TUNE3D.DT;
    if (s.wallZ <= 0) { s.wallZ = 0; s.wallVz = 0; }
  }
  if (s.phase === 'flight') {
    keeper3Step(s.gk, KEEPER_PERF, keeperInput(s), true);
    const curlOn = s.phaseTicks <= CURL_TICKS;
    const r = moveBall3(s.ball, [keeperCapsules(s.gk), wallCapsules(s.spot, s.wallZ)], curlOn ? s.curl * CURL_RATE * TUNE3D.SUB_DT : 0);
    const out = judge(s, r.hits[0], r.hits[1], r.frame || s.outcome === 'post');
    if (r.frame && out === null) s.outcome = 'post';
    if (out !== null) {
      s.outcome = out;
      if (out === 'goal') s.points[s.kicker] += FK3_SPOTS[s.spot].pts;
      s.log = [...s.log, { kicker: s.kicker, spot: s.spot, out }];
      s.phase = 'result'; s.phaseTicks = 0;
    }
    return s;
  }
  // result — 공·키퍼는 계속 움직인다(조작 없음)
  keeper3Step(s.gk, KEEPER_PERF, PEN3_IDLE, false);
  moveBall3(s.ball, [keeperCapsules(s.gk), wallCapsules(s.spot, s.wallZ)]);
  if (s.phaseTicks >= RESULT_TICKS) {
    if (s.kickNo + 1 >= fkTotal(s.n)) { s.phase = 'end'; s.phaseTicks = 0; }
    else { s.kickNo += 1; setupKick(s); }
  }
  return s;
}

// ═══════════════════════════ 대본 키커(봇 자리·끊긴 손님·시험) ═══════════════════════════
// 2D 와 같은 성격 — 반은 열린 쪽 구석, 반은 벽 쪽 구석으로(벽을 넘기거나 감아 돌아). 길은 미리 보기(fk3Path)로 찾는다.
type Plan3 = { wait: number; power: number; aim: Aim3; curl: number };
const PLANS = new Map<string, Plan3>();
export function fk3KickerPlan(kickSeed: number, spot: number): Plan3 {
  const key = `${kickSeed}:${spot}`, hit = PLANS.get(key);
  if (hit) return hit;
  const plan = makePlan(kickSeed, spot);
  if (PLANS.size > 256) PLANS.clear();
  PLANS.set(key, plan);
  return plan;
}
const step = (v: number, q: number): number => Math.round(v / q) * q;
function makePlan(kickSeed: number, spot: number): Plan3 {
  const r = (k: number): number => planRand(kickSeed, k);
  const side = nearSide(spot);
  const wait = 20 + Math.floor(r(0) * 40);
  if (r(2) < 0.5) {
    // 열린 쪽 구석 — 낮게~가운데, 세게
    return { wait, power: 0.55 + r(1) * 0.4, aim: { y: step((-side * (1.5 + r(3) * 0.6)) / FK3_AIM_SCALE, 0.2), z: step(0.3 + r(4) * 0.9, 0.25) }, curl: 0 };
  }
  // 벽 쪽 구석 — 벽을 넘겨 떨어뜨리거나(감기 없음) 벽 바깥으로 감아 돌린다. 찾은 것 중 씨앗으로 하나.
  const found = fk3WallShots(spot);
  if (!found.length) return { wait, power: 0.7, aim: { y: step((-side * 1.8) / FK3_AIM_SCALE, 0.2), z: 0.75 }, curl: 0 };
  // 약한 슛일수록 덜 흔들린다 — 세기가 낮은 길 몇 개 중에서 고른다(벽에 덜 걸리게)
  const easy = [...found].sort((a, b) => a.power - b.power).slice(0, 4);
  const f = easy[Math.floor(r(5) * easy.length)];
  return { wait, ...f };
}

/** 벽 쪽 구석으로 들어가는 슛들 — 흔들림 없는 미리 보기로 벽을 비켜 골문 안(벽 쪽)에 들어가고, 흔들림 아홉 가지(옆·높이 −0.6·0·0.6) 중
 *  여섯 이상에서도 들어가는 것만(대본 키커가 벽에 번번이 걸리지 않게). 자리마다 한 번 계산해 둔다. 순수. */
const WALL_SHOTS = new Map<number, Omit<Plan3, 'wait'>[]>();
export function fk3WallShots(spot: number): Omit<Plan3, 'wait'>[] {
  const hit = WALL_SHOTS.get(spot);
  if (hit) return hit;
  const side = nearSide(spot), caps = wallCapsules(spot, 0.3), out: Omit<Plan3, 'wait'>[] = [];
  const goes = (path: { x: number; y: number; z: number }[], margin: number): boolean => {
    const clear = path.every((q) => caps.every((c) => {
      const dz = q.z < c[2] ? c[2] - q.z : q.z > c[5] ? q.z - c[5] : 0, dx = q.x - c[0], dy = q.y - c[1];
      return dx * dx + dy * dy + dz * dz > (c[6] + BR + margin) * (c[6] + BR + margin);
    }));
    const end = path[path.length - 1];
    return clear && end.x > HW && Math.abs(end.y) < GW - 0.05 && end.z < GH - 0.05;
  };
  for (const curl of [0, -side, -side * 0.5])
    for (let pi = 0; pi <= 15; pi++) for (let zi = 3; zi <= 12; zi++) for (let yi = 0; yi <= 12; yi++) {
      const power = 0.15 + pi * 0.05, aim = { y: step((side * (0.6 + yi * 0.25)) / FK3_AIM_SCALE, 0.2), z: zi * 0.25 };
      const base = fk3Path(spot, aim, power, curl, 1);
      const end = base[base.length - 1];
      if (!(goes(base, WALL_MARGIN) && end.y * side > 0.3)) continue;
      let ok = 0;
      for (const ry of [-0.6, 0, 0.6]) for (const rz of [-0.6, 0, 0.6]) if (goes(fk3Path(spot, aim, power, curl, 1, ry, rz), 0)) ok++;
      if (ok >= 6) out.push({ power, aim, curl });
    }
  WALL_SHOTS.set(spot, out);
  return out;
}

export function freekick3Bot(s: Fk3State, _c: FkConfig, slot: number): Pen3Input {
  if (slot !== s.kicker || s.phase !== 'aim') return PEN3_IDLE;
  const p = fk3KickerPlan(s.kickSeed, s.spot);
  const hold = Math.max(1, Math.round(p.power * CHARGE_TICKS));
  if (s.phaseTicks < p.wait) return PEN3_IDLE;
  if (s.phaseTicks < p.wait + hold) return { x: 0, y: 0, kick: true, aim: null };
  return { x: p.curl, y: 0, kick: false, aim: p.aim };
}

// ═══════════════════════════ 모양 검사 · 스냅샷 줄이기 ═══════════════════════════
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isInt = (v: unknown, lo = -Infinity, hi = Infinity): v is number => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const PHASES: readonly string[] = ['ready', 'aim', 'flight', 'result', 'end'];
const OUTS: readonly FkOutcome[] = ['goal', 'save', 'wall', 'miss', 'post', 'gone'];   // 순서가 pack 번호 — 끝에만 더한다
const okBall = (b: unknown): boolean => isObj(b) && ['x', 'y', 'z', 'vx', 'vy', 'vz'].every((k) => isNum(b[k]));

function okState(s: unknown, config: FkConfig): s is Fk3State {
  if (!isObj(s)) return false;
  const n = config.players.length;
  const gk = s.gk as Record<string, unknown>, st = s.st as Record<string, unknown>;
  return isInt(s.tick, 0) && typeof s.phase === 'string' && PHASES.includes(s.phase) && isInt(s.phaseTicks, 0) && s.n === n
    && isInt(s.kickNo, 0, fkTotal(n) - 1) && isInt(s.spot, 0, FK3_SPOTS.length - 1) && isInt(s.kicker, 0, n - 1)
    && Array.isArray(s.points) && s.points.length === n && s.points.every((v) => isInt(v, 0))
    && Array.isArray(s.log) && s.log.length <= fkTotal(n)
    && s.log.every((e) => isObj(e) && isInt(e.kicker, 0, n - 1) && isInt(e.spot, 0, FK3_SPOTS.length - 1) && (OUTS as readonly unknown[]).includes(e.out))
    && (s.outcome === null || (OUTS as readonly unknown[]).includes(s.outcome)) && isNum(s.power) && isNum(s.curl) && okBall(s.ball)
    && isObj(gk) && ['x', 'y', 'vx', 'vy', 'z', 'vz'].every((k) => isNum(gk[k])) && (gk.dive === -1 || gk.dive === 0 || gk.dive === 1)
    && (gk.diveH === 0 || gk.diveH === 1 || gk.diveH === 2) && isInt(gk.diveT, 0) && isInt(gk.lie, 0) && isBool(gk.dived) && isBool(gk.armed)
    && isObj(st) && ['x', 'y', 'vx', 'vy', 'charge', 'kickFlash'].every((k) => isNum(st[k])) && isBool(st.held) && isBool(st.armed)
    && isNum(s.wallZ) && isNum(s.wallVz) && isNum(s.kickSeed) && isNum(s.seed);
}

// 8명이면 기록(log)이 40줄이라 그대로 보내면 2.5KB 를 넘는다 — 기록만 [키커, 자리, 판정 번호] 줄로(잃는 것 없음). 나머지는 그대로.
const PACK_V = 1;
function pack(s: Fk3State): Record<string, unknown> {
  const { log, ...rest } = s;
  return { v: PACK_V, ...rest, log: log.map((e) => [e.kicker, e.spot, OUTS.indexOf(e.out)]) };
}
const PACK_KEYS = ['ball', 'curl', 'gk', 'kickNo', 'kickSeed', 'kicker', 'log', 'n', 'outcome', 'phase', 'phaseTicks', 'points', 'power', 'seed', 'spot', 'st', 'tick', 'v', 'wallVz', 'wallZ'].join();
function unpack(x: unknown, config: FkConfig): Fk3State | null {
  // 키가 정확히 이것이어야 한다(더 있거나 빠지면 다른 무엇이다)
  if (!isObj(x) || x.v !== PACK_V || !Array.isArray(x.log) || Object.keys(x).sort().join() !== PACK_KEYS) return null;
  if (!x.log.every((r) => Array.isArray(r) && r.length === 3 && r.every((v) => isInt(v, 0)))) return null;
  const { v: _v, log, ...rest } = x;
  const s = { ...rest, log: (log as number[][]).map((r) => ({ kicker: r[0], spot: r[1], out: OUTS[r[2]] ?? ('zz' as FkOutcome) })) };
  return okState(s, config) ? (s as unknown as Fk3State) : null;
}

// ═══════════════════════════ 어댑터 · 등록부 ═══════════════════════════
// 입력 정수 — 3D 승부차기 PEN3_CODES 가지 + 마지막 하나 = 빈 자리.
const encodeFk3 = (i: Fk3Input): number => (i && i.gone ? PEN3_CODES : encodePen3(i));
const decodeFk3 = (q: number): Fk3Input => (q === PEN3_CODES ? { ...FK3_ABSENT } : decodePen3(q));

export const freekick3d: GameAdapter<FkConfig, Fk3State, Fk3Input> = {
  id: 'freekick3d',
  create: createFreekick3,
  step: stepFreekick3,
  idle: PEN3_IDLE,
  encode: encodeFk3,
  decode: decodeFk3,
  codes: PEN3_CODES + 1,
  absentInput: FK3_ABSENT,
  okConfig: FREEKICK2D.adapter.okConfig,
  okState,
  tick: (s) => s.tick,
  ended: (s) => s.phase === 'end',
  slots: (c) => c.players.length,
  slotNum: (c, i) => { const p = c.players[i]; return p && !p.bot ? p.num : null; },
  phase: (s) => s.phase,
  predictsAcross: (from, to) => (from === 'ready' && to === 'aim') || (from === 'aim' && to === 'flight'),
  urgent: penalty3d.urgent,
  botInput: freekick3Bot,
  bodies: {
    get: (s) => [s.ball, s.gk, s.st],
    set: (s, b: Point[]) => ({ ...s, ball: b[0] as Ball, gk: b[1] as Keeper3, st: b[2] as Striker3 }),
    jump: 3,
    snap: 4,
  },
  pack,
  unpack,
};

export const FREEKICK3D: GameEntry<FkConfig, Fk3State, Fk3Input, FkSettings> = {
  ...FREEKICK2D,
  adapter: freekick3d,
  mode: '3d',
  describe: GAME_COPY.freekick,
  tags: ['온라인', '차례대로', '감아차기'],
  absent: 'idle',   // 나간 사람 차례는 봇이 대신 차지 않고 넘긴다(2D 와 같다 — 리뷰 #2)
};
