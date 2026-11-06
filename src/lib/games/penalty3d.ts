// src/lib/games/penalty3d.ts — 3D 승부차기(2026-11-07 게임 묶음 5단계). 순수 — 화면·시계·난수 함수·삼각함수를 부르지 않는다.
// 설계: docs/superpowers/specs/2026-11-07-games-program-design.md §3.1 "3D: 키커 뒤에서 골대를 보는 화면(키퍼 차례엔 골대 뒤에서), 공이 뜬다 — 크로스바 위는 노골."
// 사용자: "자유 훈련장, 여러 드리블 훈련장, 승부차기, 프리킥 같은 게임 만들어서 온라인 가능하게 하자. 다 2d, 3d 모드 별로 가능하게 하고."
//
// 2D 승부차기(penalty2d.ts)와 같은 판이다 — 차례(turnOf)·끝(decided)·봇 계획(kickerPlan·keeperPlan)·세기와 흔들림(speedOf·deviationOf)·
// 설정·방 규칙(buildPenalty·startBlock·botSeats)·단계와 시간(ready 1.2초 → aim 5초 → flight → result 1.7초)·armed 규칙은 그대로 가져다 쓴다.
// 다른 것은 셋째 차원뿐:
//   - 자리: 3D 경기장(game3d/sim)의 오른쪽 골대(x = +HW)를 그대로 쓴다. 페널티 점은 골라인에서 SPOT_DIST m. 골대·그물·크로스바·땅 튕김은
//     경기 계산의 containBall 이 맡는다 — 공은 경기와 같은 공이다.
//   - 조준은 옆(y)과 높이(z) 둘. 키커 화면에만 있고, 모으던 킥을 떼는 틱의 입력에만 실린다(2D 와 같은 약속). 높이를 크로스바 위로 겨누면 노골.
//   - 흔들림은 옆으로 2D 와 같은 비율, 높이로는 그 0.6 배. 세기는 공 속도와 흔들림을 같이 키운다(2D 와 같은 곡선을 m 로 옮김).
//   - 키퍼는 골라인 위에서 옆걸음, 몸 던지기는 옆(스틱 좌우)과 높이(스틱 위 = 높이, 아래 = 낮게). 스틱이 가운데면 제자리에서 팔을 벌리고 뛴다
//     (가운데 높은 공용). 막는 판정은 키퍼 몸 부피(몸통 캡슐 + 팔 캡슐)에 공이 닿았나.
import { GAME_COPY } from './copy.ts';
import type { Ball, Side } from '../game3d/sim.ts';
import { PITCH3D, TUNE3D, containBall, rand } from '../game3d/sim.ts';
import type { PenConfig, PenSettings } from './penalty2d.ts';
import {
  AIM_TICKS, AUTO_POWER, CHARGE_TICKS, PENALTY2D, READY_TICKS, RESULT_TICKS, SD_MAX, decided, deviationOf, keeperPlan, kickerPlan,
  okConfig as okPenConfig, planRand, speedOf, turnOf, SPOT_Y as SPOT_Y_2D, GOAL_W as GOAL_W_2D,
} from './penalty2d.ts';
import type { Outcome, KickLog } from './penalty2d.ts';
import { BASE_PERF as BASE_PERF_2D } from '../game/stats.ts';
import type { GameAdapter, Point } from './adapter.ts';
import type { GameEntry } from './entry.ts';

// ═══════════════════════════ 조절 값 ═══════════════════════════
const { HW, goalHalfW: GW, goalH: GH, ballR: BR, postR: POST_R } = PITCH3D;
/** 골라인 → 페널티 점(m). 3D 경기장(반길이 18m)에서 골대 크기(5.2 × 2.1)에 맞춰 — 2D 의 점 거리 ÷ 골문 폭 비율과 비슷하게. */
export const SPOT_DIST = 9;
export const SPOT_X = HW - SPOT_DIST;
/** 2D 단위 → m(옆): 2D 골문 반폭 125 = 3D 반폭 2.6. 거리·속도는 점까지의 거리 비율로. */
const SIDE_M = GW / (GOAL_W_2D / 2);
const DIST_M = SPOT_DIST / SPOT_Y_2D;
/** 키퍼가 서는 줄(골라인 바로 앞)과 갈 수 있는 끝(기둥 바로 바깥). */
export const KEEPER_X = HW - 0.35;
export const KEEPER_Y_MAX = GW + 0.3;
const KEEPER_SPEED = 3.9;             // 서서 옆걸음 최고 속도(m/s, 능력치 페이스 ±10%) — 2D 190 을 골문 폭 비율로
const KEEPER_ACCEL = 0.25;            // 옆걸음이 목표 속도로 따라가는 비율(틱당)
export const DIVE_SPEED = 6.4;        // 던지는 동안 옆으로 가는 속도(m/s)
export const DIVE_TICKS = 20;         // 2D 와 같다
export const LIE_TICKS = 34;
/** 몸 부피 — 몸통(발목~머리, 반지름 BODY_R), 팔(어깨 높이 가로, 반지름 ARM_R). */
export const BODY_R = 0.26, ARM_R = 0.11;
export const BODY_Z0 = 0.2, BODY_Z1 = 1.72, ARM_Z = 1.5;
export const STAND_ARM = 0.5;         // 서 있을 때 몸 가운데에서 팔 끝까지
export const SPREAD_ARM = 0.95;       // 제자리 팔 벌리기
export const DIVE_LEN = 1.55;         // 던진 몸의 길이(몸 가운데 → 손끝)
/** 던지는 높이(낮게·가운데·높이)의 몸 중심 높이(m). */
export const DIVE_H = [0.35, 0.85, 1.45] as const;
const JUMP_V = 3.4;                   // 제자리 뛰기(팔 벌리기) 처음 세로 속도
/** 조준 — 옆 0.2m 칸 ±18(±3.6m, 골문 밖도 겨눌 수 있다), 높이 0.25m 칸 0..12(0~3m, 크로스바 2.1 위도). */
export const AIM_STEP = 0.2, AIM_STEPS = 18, AIM_Z_STEP = 0.25, AIM_Z_STEPS = 12;
export const AIM_MAX = AIM_STEP * AIM_STEPS, AIM_Z_MAX = AIM_Z_STEP * AIM_Z_STEPS;
/** 조준 표시가 스틱 끝까지 밀었을 때 움직이는 속도(m/s) — 화면(키커 쪽)에서만 쓴다. */
export const AIM_SPEED = 4.2, AIM_Z_SPEED = 2.6;
/** 높이 흔들림 = 옆 흔들림 × 이 값. */
const DEV_Z = 0.6;
const FLIGHT_MAX = 150;
/** 봇 키커의 높이 — 55% 낮게, 35% 가운데, 10% 높게(2026-11-07 봇끼리 400판으로 맞춤, 보고서 p5-report §4). */
const BOT_LOW = 0.55, BOT_MID = 0.35;
// ════════════════════════════════════════════════════════════

export type Aim3 = { y: number; z: number };
/** x = 키퍼 옆걸음·던질 쪽(-1..1, 경기 좌표 y 방향), y = 위(+1 높게·뛰기)/아래(-1 낮게), kick = 키커 세기 모으기 / 키퍼 몸 던지기,
 *  aim = 키커가 떼는 순간의 조준(골라인 위 옆·높이), 그 전엔 null. */
export type Pen3Input = { x: number; y: number; kick: boolean; aim: Aim3 | null };
export const PEN3_IDLE: Pen3Input = { x: 0, y: 0, kick: false, aim: null };
/** 키퍼 — 골라인 위(x 고정)에서 옆(y)으로. z = 뛴 높이(발이 땅에서 뜬 만큼), vz. dive = 던진 쪽(-1·0·1), diveH = 던진 높이(0·1·2),
 *  diveT·lie·dived·armed 는 2D 와 같다. */
export type Keeper3 = { x: number; y: number; vx: number; vy: number; z: number; vz: number; dive: -1 | 0 | 1; diveH: 0 | 1 | 2; diveT: number; lie: number; dived: boolean; armed: boolean };
/** 키커 — 공 뒤에 선다. charge·held·armed·kickFlash 는 2D 와 같다. */
export type Striker3 = { x: number; y: number; vx: number; vy: number; charge: number; held: boolean; armed: boolean; kickFlash: number };
export type Pen3Phase = 'ready' | 'aim' | 'flight' | 'result' | 'end';
export type Pen3State = {
  tick: number; phase: Pen3Phase; phaseTicks: number; n: number;
  kickNo: number; side: Side; kicker: number; keeper: number;
  taken: [number, number]; scored: [number, number]; log: KickLog[];
  outcome: Outcome | null; power: number;
  ball: Ball; gk: Keeper3; st: Striker3;
  kickSeed: number; winner: Side | 'draw' | null; seed: number;
};

const START_BALL = (): Ball => ({ x: SPOT_X, y: 0, z: BR, vx: 0, vy: 0, vz: 0 });
const START_GK = (): Keeper3 => ({ x: KEEPER_X, y: 0, vx: 0, vy: 0, z: 0, vz: 0, dive: 0, diveH: 1, diveT: 0, lie: 0, dived: false, armed: false });
const START_ST = (): Striker3 => ({ x: SPOT_X - 0.95, y: 0, vx: 0, vy: 0, charge: 0, held: false, armed: false, kickFlash: 0 });

function setupKick(s: Pen3State, config: PenConfig): void {
  const t = turnOf(config, s.kickNo, s.taken);
  s.side = t.side; s.kicker = t.kicker; s.keeper = t.keeper;
  s.ball = START_BALL(); s.gk = START_GK(); s.st = START_ST();
  s.outcome = null; s.power = 0;
  s.kickSeed = Math.floor(rand(s) * 4294967296) >>> 0;
  s.phase = 'ready'; s.phaseTicks = 0;
}

export function createPenalty3(config: PenConfig, seed: number): Pen3State {
  const s: Pen3State = {
    tick: 0, phase: 'ready', phaseTicks: 0, n: config.players.length, kickNo: 0, side: config.first, kicker: 0, keeper: 0,
    taken: [0, 0], scored: [0, 0], log: [], outcome: null, power: 0,
    ball: START_BALL(), gk: START_GK(), st: START_ST(), kickSeed: 0, winner: null, seed: seed >>> 0,
  };
  setupKick(s, config);
  return s;
}

const fin = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
/** 2D 세기 곡선을 m/s 로. */
export const speed3 = (power: number): number => speedOf(power) * DIST_M;
/** 옆 흔들림 폭(m) — 2D deviationOf 를 골문 폭 비율로. 높이 흔들림은 이것 × DEV_Z. */
export const deviation3 = (power: number, perf: PenConfig['players'][number]['perf']): number => deviationOf(power, perf) * SIDE_M;

/** 찬 공의 첫 속도 — 조준(골라인 위 옆·높이) + 흔들림(ry·rz: −1..1, 씨앗에서) 쪽 점을 향해. 가로 속도 = 세기 속도,
 *  세로 속도는 그 점에 닿게(포물선). 3D 프리킥도 이것으로 찬다(2026-11-07 6단계에 꺼냄 — 계산 같음). aimMax = 옆 조준 끝. */
export function launch3(b: Ball, aim: Aim3, power: number, perf: PenConfig['players'][number]['perf'], ry: number, rz: number, aimMax = AIM_MAX): { vx: number; vy: number; vz: number } {
  const p = clamp(fin(power), 0, 1);
  const dev = deviation3(p, perf);
  const ty = clamp(fin(aim.y), -aimMax, aimMax) + ry * dev;
  const tz = Math.max(BR, clamp(fin(aim.z), 0, AIM_Z_MAX) + rz * dev * DEV_Z);
  const dx = HW - b.x, dy = ty - b.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
  const v = speed3(p);
  const T = d / v;
  // 낮게 겨눈 공은 땅으로 구른다. 아니면 그 높이에 닿는 세로 속도(공기 감속은 작아 빼고 — 조금 낮게 닿는다).
  return { vx: (dx / d) * v, vy: (dy / d) * v, vz: tz <= BR + 0.05 ? 0 : (tz - b.z) / T + (TUNE3D.GRAVITY * T) / 2 };
}

/** 찬다 — 조준(옆·높이) + 흔들림(씨앗) 쪽 골라인 위 점을 향해. */
function strike(s: Pen3State, config: PenConfig, power: number, aim: Aim3): void {
  const perf = config.players[s.kicker].perf;
  const p = clamp(fin(power), 0, 1);
  const ry = rand(s) * 2 - 1, rz = rand(s) * 2 - 1;
  const v = launch3(s.ball, aim, p, perf, ry, rz);
  const b = s.ball;
  b.vx = v.vx; b.vy = v.vy; b.vz = v.vz;
  s.power = p;
  s.st.held = false; s.st.kickFlash = 12;
  s.phase = 'flight'; s.phaseTicks = 0;
}

/** 키퍼 한 틱 — 옆걸음 또는 던지기·눕기, 제자리 뛰기. 줄을 못 벗어난다. 3D 프리킥 키퍼 봇도 이것(6단계에 꺼냄 — 계산 같음). */
export function keeper3Step(gk: Keeper3, perf: PenConfig['players'][number]['perf'], inp: Pen3Input, control: boolean): void {
  if (control) {
    if (!inp.kick) gk.armed = true;
    else if (gk.armed && !gk.dived && gk.lie === 0 && gk.diveT === 0) {
      const x = fin(inp.x), y = fin(inp.y);
      gk.dive = x > 0.3 ? 1 : x < -0.3 ? -1 : 0;
      gk.diveH = y > 0.3 ? 2 : y < -0.3 ? 0 : 1;
      gk.dived = true; gk.diveT = DIVE_TICKS; gk.armed = false;
      if (gk.dive === 0) gk.vz = JUMP_V * (gk.diveH === 0 ? 0.4 : gk.diveH === 2 ? 1.25 : 1);   // 가운데 = 팔 벌리고 뛰기
    }
  }
  if (gk.diveT > 0) {
    gk.vy = gk.dive * DIVE_SPEED;
    gk.diveT -= 1;
    if (gk.diveT === 0) gk.lie = LIE_TICKS;
  } else if (gk.lie > 0) {
    gk.vy = 0; gk.lie -= 1;
  } else {
    const top = KEEPER_SPEED * clamp(fin(perf.maxSpeed) / BASE_PERF_2D.maxSpeed, 0.9, 1.1);   // 페이스 ±10%
    const want = (control ? clamp(fin(inp.x), -1, 1) : 0) * top;
    gk.vy += (want - gk.vy) * KEEPER_ACCEL;
    if (Math.abs(gk.vy) < 0.01 && want === 0) gk.vy = 0;
  }
  gk.y += gk.vy * TUNE3D.DT;
  if (gk.y > KEEPER_Y_MAX) { gk.y = KEEPER_Y_MAX; gk.vy = 0; }
  if (gk.y < -KEEPER_Y_MAX) { gk.y = -KEEPER_Y_MAX; gk.vy = 0; }
  // 뛰기(가운데 던지기) — 중력으로 내려온다
  if (gk.z > 0 || gk.vz > 0) {
    gk.z += gk.vz * TUNE3D.DT; gk.vz -= TUNE3D.GRAVITY * TUNE3D.DT;
    if (gk.z <= 0) { gk.z = 0; gk.vz = 0; }
  }
  gk.x = KEEPER_X; gk.vx = 0;
  if (!Number.isFinite(gk.y + gk.z + gk.vy + gk.vz)) { gk.y = 0; gk.z = 0; gk.vy = 0; gk.vz = 0; }
}

/** 키퍼 몸 — 선분 + 반지름(캡슐) 목록, 경기 좌표 [x0,y0,z0,x1,y1,z1,r]. 화면도 이 모양을 그린다. */
export function keeperCapsules(gk: Keeper3): Capsule[] {
  const x = gk.x, y = gk.y, z = gk.z;
  if ((gk.diveT > 0 || gk.lie > 0) && gk.dive !== 0) {
    const h = DIVE_H[gk.diveH], d = gk.dive;
    // 던진 몸 — 발 쪽 조금 뒤에서 손끝까지 비스듬히(높이 던지면 손이 위로)
    const lift = gk.diveH === 2 ? 0.35 : gk.diveH === 0 ? 0 : 0.15;
    return [[x, y - d * 0.35, Math.max(BODY_R, h - lift), x, y + d * DIVE_LEN, h + lift, BODY_R]];
  }
  const arm = gk.dive === 0 && gk.dived && (gk.diveT > 0 || gk.lie > 0) ? SPREAD_ARM : STAND_ARM;
  return [
    [x, y, BODY_Z0 + z, x, y, BODY_Z1 + z, BODY_R],
    [x, y - arm, ARM_Z + z, x, y + arm, ARM_Z + z, ARM_R],
  ];
}

/** 점 p 에서 선분 ab 까지 가장 가까운 점. */
export function closest(px: number, py: number, pz: number, c: readonly number[]): [number, number, number] {
  const ex = c[3] - c[0], ey = c[4] - c[1], ez = c[5] - c[2];
  const l2 = ex * ex + ey * ey + ez * ez;
  const t = l2 > 1e-9 ? clamp(((px - c[0]) * ex + (py - c[1]) * ey + (pz - c[2]) * ez) / l2, 0, 1) : 0;
  return [c[0] + ex * t, c[1] + ey * t, c[2] + ez * t];
}

/** 골대 기둥 둘과 크로스바(오른쪽 골대). */
const FRAME: readonly (readonly number[])[] = [
  [HW, -GW, 0, HW, -GW, GH], [HW, GW, 0, HW, GW, GH], [HW, -GW, GH, HW, GW, GH],
];

/** 몸 캡슐 — 선분 [x0,y0,z0,x1,y1,z1] + 반지름. */
export type Capsule = readonly [number, number, number, number, number, number, number];

/** 감아차기 한 번 꺾기(3D) — 가로 속도를 옆(+y 쪽 = 왼손)으로 amount 라디안만큼 돌리고 크기는 그대로(2D curlVel 과 같은 방법, 세로 속도는 그대로). */
export function curl3(b: Ball, amount: number): void {
  const sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
  if (sp < 1e-6 || amount === 0) return;
  const nx = b.vx + (0 - b.vy) * amount, ny = b.vy + b.vx * amount;
  const n = Math.sqrt(nx * nx + ny * ny);
  b.vx = (nx / n) * sp; b.vy = (ny / n) * sp;
}

/** 공 한 틱(쪼개서) — 중력·(감기)·이동·경기장(땅·그물·골대·벽)·몸 캡슐 무리. 무리마다 닿았나, 골대에 닿았나.
 *  승부차기는 [키퍼], 3D 프리킥은 [키퍼, 벽] 을 넘긴다(6단계에 꺼냄 — 승부차기 계산 같음). curl = 쪼갠 틱마다 돌릴 라디안. */
export function moveBall3(b: Ball, groups: readonly (readonly Capsule[])[], curl = 0): { hits: boolean[]; frame: boolean } {
  const hits = groups.map(() => false);
  let frame = false;
  for (let k = 0; k < TUNE3D.SUBSTEPS; k++) {
    if (curl !== 0) curl3(b, curl);
    b.vz -= TUNE3D.GRAVITY * TUNE3D.SUB_DT;
    b.x += b.vx * TUNE3D.SUB_DT; b.y += b.vy * TUNE3D.SUB_DT; b.z += b.vz * TUNE3D.SUB_DT;
    for (const f of FRAME) {
      const [cx, cy, cz] = closest(b.x, b.y, b.z, f);
      const dx = b.x - cx, dy = b.y - cy, dz = b.z - cz, m = BR + POST_R + 0.03;
      if (dx * dx + dy * dy + dz * dz < m * m) frame = true;
    }
    containBall(b);
    for (let gi = 0; gi < groups.length; gi++) for (const c of groups[gi]) {
      const [cx, cy, cz] = closest(b.x, b.y, b.z, c);
      const dx = b.x - cx, dy = b.y - cy, dz = b.z - cz, m = BR + c[6];
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= m * m) continue;
      hits[gi] = true;
      const d = Math.sqrt(d2);
      const nx = d > 1e-6 ? dx / d : -1, ny = d > 1e-6 ? dy / d : 0, nz = d > 1e-6 ? dz / d : 0;
      b.x = cx + nx * m; b.y = cy + ny * m; b.z = Math.max(BR, cz + nz * m);
      const vn = b.vx * nx + b.vy * ny + b.vz * nz;
      if (vn < 0) { const j = 1.35 * vn; b.vx -= j * nx; b.vy -= j * ny; b.vz -= j * nz; }
    }
  }
  // 감속 — 땅에서 구르면 구름, 떠 있으면 공기(경기와 같은 값)
  const onGround = b.z <= BR + 1e-6 && b.vz === 0;
  const keep = 1 - (onGround ? TUNE3D.ROLL_DRAG : TUNE3D.AIR_DRAG) * TUNE3D.DT;
  b.vx *= keep; b.vy *= keep;
  if (onGround && b.vx * b.vx + b.vy * b.vy < TUNE3D.BALL_REST * TUNE3D.BALL_REST) { b.vx = 0; b.vy = 0; }
  if (!Number.isFinite(b.x + b.y + b.z + b.vx + b.vy + b.vz)) { Object.assign(b, START_BALL()); }
  // 그림 밖으로 터무니없이 먼 공은 세운다(2D 승부차기와 같은 안전망 — 2026-11-07 리뷰 #5). 실제 차기는 이 근처에도 안 간다.
  if (Math.abs(b.x) > POS_LIM || Math.abs(b.y) > POS_LIM || Math.abs(b.z) > POS_LIM) {
    b.x = Math.min(POS_LIM, Math.max(-POS_LIM, b.x)); b.y = Math.min(POS_LIM, Math.max(-POS_LIM, b.y)); b.z = Math.min(POS_LIM, Math.max(BR, b.z));
    b.vx = 0; b.vy = 0; b.vz = 0;
  }
  return { hits, frame };
}

/** 승부차기의 공 한 틱 — 키퍼 하나. */
function moveBall(s: Pen3State): { touched: boolean; frame: boolean } {
  const r = moveBall3(s.ball, [keeperCapsules(s.gk)]);
  return { touched: r.hits[0], frame: r.frame };
}

/** 지금 판정 — 날아가는 중이면 null. */
function judge(s: Pen3State, touched: boolean, frame: boolean): Outcome | null {
  const b = s.ball;
  if (touched) return 'save';
  if (b.x > HW + BR && Math.abs(b.y) < GW && b.z < GH) return 'goal';
  // 골라인에 닿았는데 골문 밖(옆·크로스바 위) — 벽에 튕겨 나온다. 골대를 스쳤으면 골대.
  if (b.x >= HW - BR - 0.02 && (Math.abs(b.y) >= GW - BR || b.z >= GH - BR)) return frame ? 'post' : 'miss';
  const still = b.vx === 0 && b.vy === 0 && b.vz === 0;
  if ((frame && b.vx < 0) || still || s.phaseTicks >= FLIGHT_MAX) return frame ? 'post' : 'miss';
  return null;
}

function cloneState(s: Pen3State): Pen3State {
  return { ...s, taken: [s.taken[0], s.taken[1]], scored: [s.scored[0], s.scored[1]], ball: { ...s.ball }, gk: { ...s.gk }, st: { ...s.st } };
}

const aimOf = (a: unknown): Aim3 => (a && typeof a === 'object' ? { y: fin((a as Aim3).y), z: fin((a as Aim3).z) } : { y: 0, z: 0 });

export function stepPenalty3(state: Pen3State, config: PenConfig, inputs: Pen3Input[]): Pen3State {
  if (state.phase === 'end') return { ...state, tick: state.tick + 1, phaseTicks: state.phaseTicks + 1 };
  const s = cloneState(state);
  s.tick += 1; s.phaseTicks += 1;
  const kin = inputs[s.kicker] ?? PEN3_IDLE, gin = inputs[s.keeper] ?? PEN3_IDLE;
  if (s.st.kickFlash > 0) s.st.kickFlash -= 1;

  if (s.phase === 'ready') {
    if (!kin.kick) s.st.armed = true;
    if (!gin.kick) s.gk.armed = true;
    if (s.phaseTicks >= READY_TICKS) { s.phase = 'aim'; s.phaseTicks = 0; }
    return s;
  }
  if (s.phase === 'aim') {
    const st = s.st;
    if (!kin.kick) {
      if (st.held) strike(s, config, st.charge / CHARGE_TICKS, aimOf(kin.aim));
      else st.armed = true;
    } else if (st.armed) {
      st.held = true;
      st.charge = Math.min(CHARGE_TICKS, st.charge + 1);
    }
    if (s.phase === 'aim' && s.phaseTicks >= AIM_TICKS) strike(s, config, AUTO_POWER, { y: 0, z: 0 });   // 시간이 다 됐다 — 약한 가운데 땅볼
    keeper3Step(s.gk, config.players[s.keeper].perf, gin, true);
    return s;
  }
  if (s.phase === 'flight') {
    keeper3Step(s.gk, config.players[s.keeper].perf, gin, true);
    const { touched, frame } = moveBall(s);
    const out = judge(s, touched, frame || s.outcome === 'post');
    if (frame && out === null) s.outcome = 'post';   // 골대를 스치고 아직 가는 중 — 나중 판정에 남긴다(들어가면 골)
    if (out !== null) {
      s.outcome = out;
      s.taken[s.side] += 1;
      if (out === 'goal') s.scored[s.side] += 1;
      s.log = [...s.log, { side: s.side, kicker: s.kicker, keeper: s.keeper, out }];
      s.phase = 'result'; s.phaseTicks = 0;
    }
    return s;
  }
  // result — 공과 키퍼는 계속 움직이되(그물에 걸리고 튕긴다) 조작은 안 듣는다.
  keeper3Step(s.gk, config.players[s.keeper].perf, PEN3_IDLE, false);
  moveBall(s);
  if (s.phaseTicks >= RESULT_TICKS) {
    const w = decided(s.taken, s.scored, config.kicks);
    if (w !== null) { s.winner = w; s.phase = 'end'; s.phaseTicks = 0; }
    else { s.kickNo += 1; setupKick(s, config); }
  }
  return s;
}

// ═══════════════════════════ 봇 ═══════════════════════════
/** 봇 키커의 계획 — 2D 계획(기다림·세기·옆)에 높이를 더한다(차기 씨앗의 다른 자리에서). */
export function kickerPlan3(kickSeed: number): { wait: number; power: number; aim: Aim3 } {
  const p = kickerPlan(kickSeed);
  const r = planRand(kickSeed, 6), r2 = planRand(kickSeed, 7);
  const z = r < BOT_LOW ? 0.15 + r2 * 0.5 : r < BOT_LOW + BOT_MID ? 0.7 + r2 * 0.7 : 1.45 + r2 * 0.45;
  return { wait: p.wait, power: p.power, aim: { y: Math.round((p.aim * SIDE_M) / AIM_STEP) * AIM_STEP, z: Math.round(z / AIM_Z_STEP) * AIM_Z_STEP } };
}

/** 공이 키퍼 줄을 지날 곳(옆·높이) — 직선 + 포물선(공기 감속 무시). 줄을 향하지 않으면 null. 3D 프리킥 키퍼 봇도 쓴다. */
export function crossing(b: Ball): { y: number; z: number } | null {
  if (b.vx <= 0.5) return null;
  const t = (KEEPER_X - b.x) / b.vx;
  if (t < 0) return null;
  return { y: b.y + b.vy * t, z: b.vz === 0 ? b.z : b.z + b.vz * t - (TUNE3D.GRAVITY * t * t) / 2 };
}

export function penalty3Bot(s: Pen3State, config: PenConfig, slot: number): Pen3Input {
  if (slot === s.kicker && s.phase === 'aim') {
    const p = kickerPlan3(s.kickSeed);
    const hold = Math.max(1, Math.round(p.power * CHARGE_TICKS));
    const t = s.phaseTicks;
    if (t < p.wait) return PEN3_IDLE;
    if (t < p.wait + hold) return { x: 0, y: 0, kick: true, aim: null };
    return { x: 0, y: 0, kick: false, aim: p.aim };
  }
  if (slot === s.keeper && (s.phase === 'aim' || s.phase === 'flight')) {
    const gk = s.gk;
    if (s.phase === 'aim') return { x: gk.y > 0.1 ? -0.5 : gk.y < -0.1 ? 0.5 : 0, y: 0, kick: false, aim: null };
    const p = keeperPlan(s.kickSeed);
    if (s.phaseTicks < p.react) return PEN3_IDLE;
    const c = p.reads ? crossing(s.ball) : null;
    const ty = c ? c.y : p.guess * 85 * SIDE_M;
    const hz = c ? (c.z > 1.25 ? 1 : c.z < 0.55 ? -1 : 0) : 0;
    const dy = ty - gk.y;
    if (Math.abs(dy) < STAND_ARM + BR) return { x: dy > 0.05 ? 1 : dy < -0.05 ? -1 : 0, y: hz, kick: !gk.dived && hz > 0, aim: null };
    return { x: dy > 0 ? 1 : -1, y: hz, kick: !gk.dived, aim: null };
  }
  return PEN3_IDLE;
}

// ═══════════════════════════ 입력 양자화 ═══════════════════════════
// x 다섯 칸 × y 세 칸 × 킥 둘 × 조준(없음 + 옆 37 × 높이 13) = 5 × 3 × 2 × 482 = 14,460.
const X_LEVELS = 5, Y_LEVELS = 3, AIM_SIDE = AIM_STEPS * 2 + 1, AIM_HIGH = AIM_Z_STEPS + 1, AIM_CODES = 1 + AIM_SIDE * AIM_HIGH;
export const PEN3_CODES = X_LEVELS * Y_LEVELS * 2 * AIM_CODES;
export function encodePen3(i: Pen3Input): number {
  const xi = Math.min(4, Math.max(0, Math.round(fin(i?.x) * 2) + 2));
  const yi = fin(i?.y) > 0.3 ? 2 : fin(i?.y) < -0.3 ? 0 : 1;
  const k = i?.kick ? 1 : 0;
  let a = 0;
  if (i && i.aim && typeof i.aim === 'object') {
    const ay = Math.min(AIM_SIDE - 1, Math.max(0, Math.round(fin(i.aim.y) / AIM_STEP) + AIM_STEPS));
    const az = Math.min(AIM_HIGH - 1, Math.max(0, Math.round(fin(i.aim.z) / AIM_Z_STEP)));
    a = 1 + ay * AIM_HIGH + az;
  }
  return ((a * 2 + k) * Y_LEVELS + yi) * X_LEVELS + xi;
}
export function decodePen3(q: number): Pen3Input {
  if (!Number.isInteger(q) || q < 0 || q >= PEN3_CODES) return { ...PEN3_IDLE };
  const xi = q % X_LEVELS, r1 = (q - xi) / X_LEVELS, yi = r1 % Y_LEVELS, r2 = (r1 - yi) / Y_LEVELS, k = r2 % 2, a = (r2 - k) / 2;
  const aim = a === 0 ? null : { y: (Math.floor((a - 1) / AIM_HIGH) - AIM_STEPS) * AIM_STEP, z: ((a - 1) % AIM_HIGH) * AIM_Z_STEP };
  return { x: (xi - 2) / 2, y: yi - 1, kick: k === 1, aim };
}

// ═══════════════════════════ 모양 검사 ═══════════════════════════
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isInt = (v: unknown, lo = -Infinity, hi = Infinity): v is number => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const PHASES: readonly string[] = ['ready', 'aim', 'flight', 'result', 'end'];
const OUTCOMES: readonly string[] = ['goal', 'save', 'miss', 'post'];
const MAX_LOG = (5 + SD_MAX) * 2;
/** 바깥에서 온 위치·속도의 한도(m, m/s) — 경기장 몇 배·말이 되는 속도. 이 밖은 다른 판이거나 망가진 상태(리뷰 #5: ±1e308 이 NaN 을 만들었다). */
const POS_LIM = 1000, VEL_LIM = 500;
const inPos = (v: unknown): boolean => isNum(v) && Math.abs(v) <= POS_LIM;
const inVel = (v: unknown): boolean => isNum(v) && Math.abs(v) <= VEL_LIM;
const okBall = (b: unknown): boolean => isObj(b) && ['x', 'y', 'z'].every((k) => inPos(b[k])) && ['vx', 'vy', 'vz'].every((k) => inVel(b[k]));

function okState(s: unknown, config: PenConfig): s is Pen3State {
  if (!isObj(s)) return false;
  const n = config.players.length;
  const slot = (v: unknown): boolean => isInt(v, 0, n - 1);
  const pair = (v: unknown): boolean => Array.isArray(v) && v.length === 2 && v.every((x) => isInt(x, 0));
  const gk = s.gk as Record<string, unknown>, st = s.st as Record<string, unknown>;
  return isInt(s.tick, 0) && typeof s.phase === 'string' && PHASES.includes(s.phase) && isInt(s.phaseTicks, 0) && s.n === n
    && isInt(s.kickNo, 0) && (s.side === 0 || s.side === 1) && slot(s.kicker) && slot(s.keeper)
    && config.players[s.kicker as number].side === s.side && config.players[s.keeper as number].side !== s.side
    && pair(s.taken) && pair(s.scored) && Array.isArray(s.log) && s.log.length <= MAX_LOG
    && s.log.every((e) => isObj(e) && (e.side === 0 || e.side === 1) && slot(e.kicker) && slot(e.keeper) && typeof e.out === 'string' && OUTCOMES.includes(e.out))
    && (s.outcome === null || (typeof s.outcome === 'string' && OUTCOMES.includes(s.outcome)))
    && isNum(s.power) && okBall(s.ball)
    && isObj(gk) && ['x', 'y', 'z'].every((k) => inPos(gk[k])) && ['vx', 'vy', 'vz'].every((k) => inVel(gk[k])) && (gk.dive === -1 || gk.dive === 0 || gk.dive === 1)
    && (gk.diveH === 0 || gk.diveH === 1 || gk.diveH === 2) && isInt(gk.diveT, 0) && isInt(gk.lie, 0) && isBool(gk.dived) && isBool(gk.armed)
    && isObj(st) && ['x', 'y'].every((k) => inPos(st[k])) && ['vx', 'vy'].every((k) => inVel(st[k])) && ['charge', 'kickFlash'].every((k) => isNum(st[k])) && isBool(st.held) && isBool(st.armed)
    && isNum(s.kickSeed) && (s.winner === null || s.winner === 0 || s.winner === 1 || s.winner === 'draw') && isNum(s.seed);
}

// ═══════════════════════════ 어댑터 ═══════════════════════════
export const penalty3d: GameAdapter<PenConfig, Pen3State, Pen3Input> = {
  id: 'penalty3d',
  create: createPenalty3,
  step: stepPenalty3,
  idle: PEN3_IDLE,
  encode: encodePen3,
  decode: decodePen3,
  codes: PEN3_CODES,
  okConfig: okPenConfig,
  okState,
  tick: (s) => s.tick,
  ended: (s) => s.phase === 'end',
  slots: (c) => c.players.length,
  slotNum: (c, i) => { const p = c.players[i]; return p && !p.bot ? p.num : null; },
  phase: (s) => s.phase,
  // 2D 와 같다 — 준비 → 조준, 조준 → 날아감만 예측이 넘어간다(내가 찬 공이 바로 나가 보이게). 판정·끝은 스냅샷만.
  predictsAcross: (from, to) => (from === 'ready' && to === 'aim') || (from === 'aim' && to === 'flight'),
  // 킥을 누르거나 뗀 순간(떼는 입력에 조준이 실린다)은 간격을 기다리지 않는다.
  urgent: (a, b) => Math.floor(a / (X_LEVELS * Y_LEVELS)) !== Math.floor(b / (X_LEVELS * Y_LEVELS)),
  botInput: penalty3Bot,
  // 공 · 키퍼 · 키커(m). 키퍼는 옆으로만 움직이고 x 는 고정 — 섞기·보정은 x·y(공은 z 도).
  bodies: {
    get: (s) => [s.ball, s.gk, s.st],
    set: (s, b: Point[]) => ({ ...s, ball: b[0] as Ball, gk: b[1] as Keeper3, st: b[2] as Striker3 }),
    jump: 3,
    snap: 4,
  },
};

// ═══════════════════════════ 등록부 한 줄 — 방 규칙은 2D 승부차기 그대로 ═══════════════════════════
export const PENALTY3D: GameEntry<PenConfig, Pen3State, Pen3Input, PenSettings> = {
  ...PENALTY2D,
  adapter: penalty3d,
  mode: '3d',
  name: '승부차기',
  describe: GAME_COPY.penalty,
  tags: ['온라인', '봇', '번갈아 차기'],
};
