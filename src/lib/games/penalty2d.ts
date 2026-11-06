// src/lib/games/penalty2d.ts — 2D 승부차기(2026-11-07 게임 묶음 2단계). 순수 — 화면·시계·난수 함수·삼각함수를 부르지 않는다.
// 설계: docs/superpowers/specs/2026-11-07-games-program-design.md §3.1
// 사용자: "자유 훈련장, 여러 드리블 훈련장, 승부차기, 프리킥 같은 게임 만들어서 온라인 가능하게 하자. 다 2d, 3d 모드 별로 가능하게 하고."
//
// 규칙(3D 판이 따라 할 수 있게 적어 둔다):
//   - 두 편이 번갈아 찬다(먼저 차는 편 = config.first). 한 편 kicks(3·5)번씩, 그래도 같으면 한 번씩 더(서든데스) — 한 쌍이 끝났을 때 다르면 끝.
//     결과가 더 바뀔 수 없으면 바로 끝(남은 차기를 다 넣어도 못 따라잡는다). 서든데스가 SD_MAX 쌍을 넘으면 무승부로 끝(안전장치).
//   - 한 편의 선수(그 편 사람들, 사람이 없으면 봇들)가 차례로 찬다. 막는 건 상대 편 선수가 차례로 — 키커 차례는 그 편이 찬 수, 키퍼 차례는
//     그 편이 막은 수(= 상대가 찬 수)로 돈다. 그래서 두 편 사람 수가 달라도 각자 고르게 돈다. 혼자 = 내가 우리 편 키커이자 키퍼.
//   - 한 번의 차기: ready(누가 차고 누가 막나, 1.2초) → aim(최대 5초) → flight(공이 날아감) → result(1.7초) → 다음 또는 end.
//   - 키커: 스틱으로 겨누는 표시(조준)는 키커 화면에만 있다 — 상태에도, 보내는 입력에도 차기 전엔 없다. 킥을 누르고 있으면 세기가 차고(1.2초에 가득),
//     떼는 그 틱의 입력에만 조준이 실려 온다. 세기 → 공 속도(SHOT_MIN..SHOT_MAX), 세기² → 흔들림 폭(DEV_MIN..DEV_MAX, 골라인에서 좌우로).
//     능력치 슈팅(perf.kick)이 흔들림을 ±10% 줄이거나 늘린다. 5초 안에 안 차면 약한 가운데 슛(AUTO_POWER)이 나간다.
//     킥은 이 차기 안에서 뗐다가 눌러야 센다(앞 차기에서 누른 채 넘어온 버튼이 바로 나가지 않게).
//   - 키퍼: 골라인 위에서 좌우로만(KEEPER_Y 고정, 골문 밖으로 KEEPER_X_MAX 이상 못 감). 킥 = 몸 던지기(한 차기에 한 번, 누른 순간 스틱 방향 —
//     스틱이 가운데면 제자리에서 팔을 벌린다). 던지면 DIVE_TICKS 동안 빠르게 옆으로, 그다음 LIE_TICKS 동안 누워 있다(못 움직임). 공이 나가기 전에 던져도 된다 —
//     그만큼 반대쪽이 빈다. 공이 키퍼에 닿으면 그 순간 "막았다".
//   - 판정: 공 중심이 골라인을 완전히 넘었고 골문 안이면 골, 골문 밖으로 넘으면 빗나감, 기둥을 맞고 나오면 골대(빗나감으로 센다).
//   - 봇: 키커는 차기마다 씨앗(kickSeed)에서 기다림·세기·조준을 정한다. 키퍼는 공이 나간 뒤 반응 시간이 지나야 움직이고, 반쯤은 공을 읽고 반쯤은 짐작한다.
import type { Body, Input } from '../game/sim.ts';
import { PHYS, collidePoint, collideSegment, nextRand, steer } from '../game/sim.ts';
import type { Perf } from '../game/stats.ts';
import { BASE_PERF, perfOf } from '../game/stats.ts';
import { shuffle } from '../game/lineup.ts';
import type { RoomState } from '../game/room.ts';
import { MAX_HUMANS, MAX_PER_SIDE } from '../game/room.ts';
import type { Player } from '../types.ts';
import type { GameAdapter, Point } from './adapter.ts';
import type { GameEntry } from './entry.ts';

// ═══════════════════════════ 조절 값 (느낌을 바꾸려면 여기만) ═══════════════════════════
// 좌표: x = 골문을 따라(가운데 0, 화면 오른쪽 +), y = 골라인에서 키커 쪽으로(골라인 0, 화면 아래로 +). 단위는 경기와 같은 논리 단위(몸 반지름 22).
export const GOAL_W = 250;            // 기둥 사이(몸 지름의 5.7배)
export const GOAL_DEPTH = 46;         // 골라인 뒤 그물 깊이
export const POST_R = 6;
export const BALL_R = 10;
export const BODY_R = 22;
export const SPOT_Y = 320;            // 골라인 → 페널티 점
export const KEEPER_Y = 18;           // 키퍼가 서는 줄(골라인 바로 앞)
export const KEEPER_X_MAX = GOAL_W / 2 + 12;   // 키퍼가 갈 수 있는 끝(기둥 바로 바깥)
const KEEPER_SPEED = 190;             // 서서 옆걸음 최고 속도(능력치 페이스 ±10%)
const KEEPER_THICK = 12;              // 위에서 본 키퍼 몸의 두께(반)
export const STAND_REACH = 8;        // 서 있을 때 몸 가운데에서 팔 끝까지(좌우, 반 길이)
export const DIVE_REACH = 20;         // 던졌을 때·누워 있을 때
export const DIVE_SPEED = 300;        // 던지는 동안 옆으로 가는 속도
export const DIVE_TICKS = 20;         // 던지는 시간(0.33초 — 100단위)
export const LIE_TICKS = 34;          // 던진 뒤 누워 있는 시간
export const CHARGE_TICKS = 72;       // 세기가 가득 차는 데 1.2초
export const SHOT_MIN = 420, SHOT_MAX = 1100;   // 세기 0 → 1 의 공 속도(단위/초). 경기의 공 상한(1250) 안
export const DEV_MIN = 6, DEV_MAX = 64;          // 흔들림 폭(골라인에서 좌우 ±) — 세기² 에 비례해 커진다
export const AIM_TICKS = 300;         // 5초 안에 차야 한다
export const AUTO_POWER = 0.15;       // 시간이 다 되면 나가는 약한 슛
export const READY_TICKS = 72;        // 누가 차고 누가 막나 보여 주는 시간
export const RESULT_TICKS = 100;      // "골!"·"막았다!"·"빗나감" 보여 주는 시간
const FLIGHT_MAX = 150;               // 공이 이만큼 날아도 판정이 안 나면 빗나감(멈춘 공 등)
export const SD_MAX = 20;             // 서든데스 안전장치(쌍)
export const AIM_STEP = 5, AIM_STEPS = 38;     // 조준은 5단위로, ±190 까지(골문 밖도 겨눌 수 있다 — 일부러 빗나가게)
export const AIM_MAX = AIM_STEP * AIM_STEPS;
/** 조준 표시가 스틱 끝까지 밀었을 때 움직이는 속도(단위/초) — 화면(키커 쪽)에서만 쓴다. */
export const AIM_SPEED = 200;
/** 봇 키퍼 — 공이 나간 뒤 반응(틱) 최소·폭, 공을 읽는 비율(나머지는 짐작). 사람 키퍼의 손 반응(0.2~0.3초)과 비슷하게. */
// 2026-11-07 봇끼리 400판으로 맞춘 값: 반응 18~29틱(0.3~0.5초), 20% 만 공을 읽음 → 성공률 약 69%(목표 65~80%).
const KEEPER_REACT_MIN = 18, KEEPER_REACT_SPAN = 12;
const KEEPER_READS = 0.2;
// ════════════════════════════════════════════════════════════════════════════════════

export type Side = 0 | 1;
/** x = 키퍼 옆걸음·던질 방향(-1..1), kick = 키커 세기 모으기 / 키퍼 몸 던지기, aim = 키커가 떼는 순간의 조준(골라인 위 x), 그 전엔 null. */
export type PenInput = { x: number; kick: boolean; aim: number | null };
export const PEN_IDLE: PenInput = { x: 0, kick: false, aim: null };
export type PenPlayer = { id: number; num: number; jersey: number; name: string; side: Side; bot: boolean; perf: Perf };
export type PenConfig = { kicks: 3 | 5; first: Side; players: PenPlayer[] };
export type Outcome = 'goal' | 'save' | 'miss' | 'post';
export type KickLog = { side: Side; kicker: number; keeper: number; out: Outcome };
/** 키퍼 몸. dive = 던진 방향(-1·0·1, 안 던졌으면 0 이고 dived 거짓), diveT = 던지는 남은 틱, lie = 누워 있는 남은 틱, armed = 이 차기에서 킥을 뗀 적이 있나. */
export type Keeper = Body & { dive: -1 | 0 | 1; diveT: number; lie: number; dived: boolean; armed: boolean };
/** 키커 몸. charge = 세기 모은 틱, held = 지금 모으는 중, armed = 이 차기에서 킥을 뗀 적이 있나, kickFlash = 찬 직후 표시. */
export type Striker = Body & { charge: number; held: boolean; armed: boolean; kickFlash: number };
export type PenPhase = 'ready' | 'aim' | 'flight' | 'result' | 'end';
export type PenState = {
  tick: number; phase: PenPhase; phaseTicks: number;
  /** 이 판의 자리 수(설정의 선수 수) — 다른 판의 스냅샷을 알아보려고. */
  n: number;
  /** 지금(또는 다음) 차기 번호(0부터), 차는 편·키커 자리·키퍼 자리. */
  kickNo: number; side: Side; kicker: number; keeper: number;
  taken: [number, number]; scored: [number, number]; log: KickLog[];
  outcome: Outcome | null; power: number;
  ball: Body; gk: Keeper; st: Striker;
  /** 이 차기의 봇 계획 씨앗(봇 입력이 여기서만 뽑는다). */
  kickSeed: number;
  winner: Side | 'draw' | null;
  seed: number;
};

const HALF = GOAL_W / 2;
const SPOT = { x: 0, y: SPOT_Y };
const STRIKER_HOME = { x: 0, y: SPOT_Y + 36 };
/** 그물 — 옆 둘과 뒤. 공만 막는다. */
const NETS: [number, number, number, number][] = [
  [-HALF, 0, -HALF, -GOAL_DEPTH], [HALF, 0, HALF, -GOAL_DEPTH], [-HALF, -GOAL_DEPTH, HALF, -GOAL_DEPTH],
];
const POSTS: [number, number][] = [[-HALF, 0], [HALF, 0]];

// ── 편 명단 ──
/** 편마다 자리 목록(config.players 차례). */
export function sideSlots(config: PenConfig): [number[], number[]] {
  const out: [number[], number[]] = [[], []];
  config.players.forEach((p, i) => out[p.side].push(i));
  return out;
}

/** 다음 차기를 세운다 — 편·키커·키퍼, 몸 자리, 봇 씨앗. */
function setupKick(s: PenState, config: PenConfig): void {
  const k = s.kickNo;
  const side = ((config.first + k) % 2) as Side;
  const lists = sideSlots(config);
  const mine = lists[side], theirs = lists[1 - side];
  s.side = side;
  s.kicker = mine[s.taken[side] % mine.length];
  s.keeper = theirs[s.taken[side] % theirs.length];   // 막은 수 = 상대가 찬 수
  s.ball = { x: SPOT.x, y: SPOT.y, vx: 0, vy: 0 };
  s.gk = { x: 0, y: KEEPER_Y, vx: 0, vy: 0, dive: 0, diveT: 0, lie: 0, dived: false, armed: false };
  s.st = { x: STRIKER_HOME.x, y: STRIKER_HOME.y, vx: 0, vy: 0, charge: 0, held: false, armed: false, kickFlash: 0 };
  s.outcome = null; s.power = 0;
  s.kickSeed = Math.floor(nextRand(s) * 4294967296) >>> 0;
  s.phase = 'ready'; s.phaseTicks = 0;
}

export function createPenalty(config: PenConfig, seed: number): PenState {
  const s: PenState = {
    tick: 0, phase: 'ready', phaseTicks: 0, n: config.players.length, kickNo: 0, side: config.first, kicker: 0, keeper: 0,
    taken: [0, 0], scored: [0, 0], log: [], outcome: null, power: 0,
    ball: { x: SPOT.x, y: SPOT.y, vx: 0, vy: 0 },
    gk: { x: 0, y: KEEPER_Y, vx: 0, vy: 0, dive: 0, diveT: 0, lie: 0, dived: false, armed: false },
    st: { x: STRIKER_HOME.x, y: STRIKER_HOME.y, vx: 0, vy: 0, charge: 0, held: false, armed: false, kickFlash: 0 },
    kickSeed: 0, winner: null, seed: seed >>> 0,
  };
  setupKick(s, config);
  return s;
}

// ── 세기와 흔들림 ──
/** 슈팅 능력치 배율(0.9..1.1) — perf.kick 이 평균 대비 얼마인가. 높을수록 덜 흔들린다. */
export const shotSkill = (perf: Perf): number => Math.min(1.1, Math.max(0.9, (Number.isFinite(perf.kick) ? perf.kick : BASE_PERF.kick) / BASE_PERF.kick));
/** 세기(0..1)와 능력치 → 흔들림 폭(골라인에서 좌우 ±). 세기에 대해 늘어나기만 한다. */
export function deviationOf(power: number, perf: Perf): number {
  const p = Math.min(1, Math.max(0, Number.isFinite(power) ? power : 0));
  return (DEV_MIN + (DEV_MAX - DEV_MIN) * p * p) * (2 - shotSkill(perf));
}
/** 세기 → 공 속도. */
export const speedOf = (power: number): number => SHOT_MIN + (SHOT_MAX - SHOT_MIN) * Math.min(1, Math.max(0, Number.isFinite(power) ? power : 0));
const clampAim = (a: number): number => Math.min(AIM_MAX, Math.max(-AIM_MAX, a));

/** 찬다 — 조준(aim) + 흔들림(씨앗) 쪽 골라인 점을 향해 세기만큼의 속도로. */
function strike(s: PenState, config: PenConfig, power: number, aim: number): void {
  const perf = config.players[s.kicker].perf;
  const tx = clampAim(aim) + (nextRand(s) * 2 - 1) * deviationOf(power, perf);
  const dx = tx - s.ball.x, dy = 0 - s.ball.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const v = speedOf(power);
  s.ball.vx = (dx / len) * v; s.ball.vy = (dy / len) * v;
  s.power = Math.min(1, Math.max(0, power));
  s.st.held = false; s.st.kickFlash = 12;
  s.phase = 'flight'; s.phaseTicks = 0;
}

/** 키퍼 한 틱 — 옆걸음 또는 던지기·눕기. 줄을 못 벗어난다. */
function moveKeeper(s: PenState, config: PenConfig, inp: PenInput, control: boolean): void {
  const gk = s.gk, perf = config.players[s.keeper].perf;
  if (control) {
    if (!inp.kick) gk.armed = true;
    else if (gk.armed && !gk.dived && gk.lie === 0 && gk.diveT === 0) {
      const d = inp.x > 0.3 ? 1 : inp.x < -0.3 ? -1 : 0;
      gk.dive = d; gk.dived = true; gk.diveT = DIVE_TICKS; gk.armed = false;
    }
  }
  if (gk.diveT > 0) {
    gk.vx = gk.dive * DIVE_SPEED;
    gk.diveT -= 1;
    if (gk.diveT === 0) gk.lie = LIE_TICKS;
  } else if (gk.lie > 0) {
    gk.vx = 0; gk.lie -= 1;
  } else {
    const kp: Perf = { maxSpeed: KEEPER_SPEED * (perf.maxSpeed / BASE_PERF.maxSpeed), accel: perf.accel, kick: perf.kick, mass: perf.mass };
    steer(gk, kp, { x: control ? inp.x : 0, y: 0, kick: false }, false);
  }
  gk.vy = 0;
  gk.x += gk.vx * PHYS.DT;
  gk.y = KEEPER_Y;
  if (gk.x > KEEPER_X_MAX) { gk.x = KEEPER_X_MAX; gk.vx = 0; }
  if (gk.x < -KEEPER_X_MAX) { gk.x = -KEEPER_X_MAX; gk.vx = 0; }
  if (!Number.isFinite(gk.x)) { gk.x = 0; gk.vx = 0; }
}

/** 키퍼 몸(위에서 본 캡슐) — 가운데 선분과 두께. */
export function keeperSeg(gk: Keeper): [number, number, number, number] {
  const h = gk.diveT > 0 || gk.lie > 0 ? DIVE_REACH : STAND_REACH;
  return [gk.x - h, gk.y, gk.x + h, gk.y];
}

/** 공 한 틱(쪼개서) — 기둥·그물·키퍼. 키퍼에 닿았으면 true. */
function moveBall(s: PenState): boolean {
  const b = s.ball;
  let touched = false;
  const seg = keeperSeg(s.gk);
  for (let k = 0; k < PHYS.SUBSTEPS; k++) {
    b.x += b.vx * PHYS.SUB_DT; b.y += b.vy * PHYS.SUB_DT;
    for (const [px, py] of POSTS) collidePoint(b, BALL_R, px, py, POST_R, PHYS.E_BALL_POST);
    if (b.y < 0) for (const w of NETS) collideSegment(b, BALL_R, w, 0.15);
    // 키퍼 — 판정 전(flight)에만 판정에 쓰고, 그 뒤에도 공은 몸에 맞고 튄다.
    const ax = seg[0], bx = seg[2], ay = seg[1];
    const cx = Math.min(bx, Math.max(ax, b.x)), dx = b.x - cx, dy = b.y - ay;
    if (dx * dx + dy * dy < (BALL_R + KEEPER_THICK) * (BALL_R + KEEPER_THICK)) {
      collideSegment(b, BALL_R + KEEPER_THICK, seg, 0.35);
      touched = true;
    }
  }
  const keep = 1 - PHYS.BALL_DRAG * PHYS.DT;
  b.vx *= keep; b.vy *= keep;
  const sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
  if (sp < PHYS.BALL_REST_SPEED) { b.vx = 0; b.vy = 0; }
  if (!Number.isFinite(b.x + b.y + b.vx + b.vy)) { b.x = 0; b.y = -GOAL_DEPTH / 2; b.vx = 0; b.vy = 0; }
  // 그림 밖으로 멀리 간 공은 세운다(빗나간 공이 끝없이 가지 않게).
  if (b.y < -260 || b.y > SPOT_Y + 200 || Math.abs(b.x) > 420) { b.vx = 0; b.vy = 0; b.x = Math.min(420, Math.max(-420, b.x)); b.y = Math.min(SPOT_Y + 200, Math.max(-260, b.y)); }
  return touched;
}

/** 지금 판정 — 날아가는 중이면 null. */
function judge(s: PenState, touched: boolean, postHit: boolean): Outcome | null {
  const b = s.ball;
  if (touched) return 'save';
  if (b.y < -BALL_R) return Math.abs(b.x) < HALF ? 'goal' : postHit ? 'post' : 'miss';
  if (b.y < 0 && Math.abs(b.x) > HALF + POST_R + BALL_R) return postHit ? 'post' : 'miss';
  const still = b.vx === 0 && b.vy === 0;
  if ((postHit && b.vy > 0) || still || s.phaseTicks >= FLIGHT_MAX) return postHit ? 'post' : 'miss';
  return null;
}

/** 끝났나 — 남은 차기를 다 넣어도 못 따라잡으면, 또는 서든데스 한 쌍이 끝나 점수가 다르면. 서든데스 SD_MAX 쌍이면 무승부. */
export function decided(taken: [number, number], scored: [number, number], kicks: number): Side | 'draw' | null {
  const rem = (s: Side): number => (taken[s] < kicks ? kicks - taken[s] : taken[s] < taken[1 - s] ? 1 : 0);
  if (scored[0] + rem(0) < scored[1]) return 1;
  if (scored[1] + rem(1) < scored[0]) return 0;
  if (taken[0] === taken[1] && taken[0] >= kicks + SD_MAX) return scored[0] > scored[1] ? 0 : scored[1] > scored[0] ? 1 : 'draw';
  return null;
}

function cloneState(s: PenState): PenState {
  return {
    ...s, taken: [s.taken[0], s.taken[1]], scored: [s.scored[0], s.scored[1]], log: s.log,
    ball: { ...s.ball }, gk: { ...s.gk }, st: { ...s.st },
  };
}

export function stepPenalty(state: PenState, config: PenConfig, inputs: PenInput[]): PenState {
  if (state.phase === 'end') return { ...state, tick: state.tick + 1, phaseTicks: state.phaseTicks + 1 };
  const s = cloneState(state);
  s.tick += 1; s.phaseTicks += 1;
  const kin = inputs[s.kicker] ?? PEN_IDLE, gin = inputs[s.keeper] ?? PEN_IDLE;
  if (s.st.kickFlash > 0) s.st.kickFlash -= 1;

  if (s.phase === 'ready') {
    // 아직 못 찬다 — 버튼을 뗀 것만 기억한다(눌린 채 넘어온 버튼이 바로 나가지 않게).
    if (!kin.kick) s.st.armed = true;
    if (!gin.kick) s.gk.armed = true;
    if (s.phaseTicks >= READY_TICKS) { s.phase = 'aim'; s.phaseTicks = 0; }
    return s;
  }

  if (s.phase === 'aim') {
    const st = s.st;
    if (!kin.kick) {
      if (st.held) { strike(s, config, st.charge / CHARGE_TICKS, typeof kin.aim === 'number' && Number.isFinite(kin.aim) ? kin.aim : 0); }
      else st.armed = true;
    } else if (st.armed) {
      st.held = true;
      st.charge = Math.min(CHARGE_TICKS, st.charge + 1);
    }
    if (s.phase === 'aim' && s.phaseTicks >= AIM_TICKS) strike(s, config, AUTO_POWER, 0);   // 시간이 다 됐다 — 약한 가운데 슛
    moveKeeper(s, config, gin, true);
    return s;
  }

  if (s.phase === 'flight') {
    moveKeeper(s, config, gin, true);
    const vx0 = s.ball.vx, vy0 = s.ball.vy;
    const touched = moveBall(s);
    // 기둥 맞음 — 키퍼에 안 닿았는데 진행 방향이 크게 꺾였다.
    const postHit = !touched && vx0 * s.ball.vx + vy0 * s.ball.vy < 0.5 * Math.sqrt((vx0 * vx0 + vy0 * vy0) * (s.ball.vx * s.ball.vx + s.ball.vy * s.ball.vy)) && s.ball.y < 40;
    const out = judge(s, touched, postHit || s.outcome === 'post');
    if (postHit && out === null) s.outcome = 'post';   // 기둥을 맞고 아직 굴러가는 중 — 나중 판정에 남긴다
    if (out !== null) {
      s.outcome = out;
      const goal = out === 'goal';
      s.taken[s.side] += 1;
      if (goal) s.scored[s.side] += 1;
      s.log = [...s.log, { side: s.side, kicker: s.kicker, keeper: s.keeper, out }];
      s.phase = 'result'; s.phaseTicks = 0;
    }
    return s;
  }

  // result — 공과 키퍼는 계속 움직이되(그물에 걸리고 튕긴다) 조작은 안 듣는다.
  moveKeeper(s, config, PEN_IDLE, false);
  moveBall(s);
  if (s.phaseTicks >= RESULT_TICKS) {
    const w = decided(s.taken, s.scored, config.kicks);
    if (w !== null) { s.winner = w; s.phase = 'end'; s.phaseTicks = 0; }
    else { s.kickNo += 1; setupKick(s, config); }
  }
  return s;
}

// ═══════════════════════════ 봇 ═══════════════════════════
/** 차기 씨앗에서 k 번째 값(0..1) — 상태를 바꾸지 않는 작은 섞기(mulberry32 한 번). */
export function planRand(kickSeed: number, k: number): number {
  let t = (kickSeed + Math.imul(k + 1, 0x6d2b79f5)) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** 봇 키커의 계획 — 기다림(틱), 세기, 조준. 15% 는 약하게(0.15~0.35), 나머지는 0.5~1. 12% 는 가운데로(±25), 나머지는 좌우 60~105. */
export function kickerPlan(kickSeed: number): { wait: number; power: number; aim: number } {
  const r = (k: number): number => planRand(kickSeed, k);
  const wait = 20 + Math.floor(r(0) * 50);
  const power = r(1) < 0.15 ? 0.15 + r(2) * 0.2 : 0.5 + r(2) * 0.5;
  const side = r(3) < 0.5 ? -1 : 1;
  const aim = r(4) < 0.12 ? (r(5) * 2 - 1) * 25 : side * (60 + r(5) * 45);
  return { wait, power, aim: Math.round(aim / AIM_STEP) * AIM_STEP };
}

/** 봇 키퍼의 계획 — 반응(틱), 공을 읽나, 못 읽으면 짐작하는 쪽. */
export function keeperPlan(kickSeed: number): { react: number; reads: boolean; guess: -1 | 1 } {
  const r = (k: number): number => planRand(kickSeed, 10 + k);
  return { react: KEEPER_REACT_MIN + Math.floor(r(0) * KEEPER_REACT_SPAN), reads: r(1) < KEEPER_READS, guess: r(2) < 0.5 ? -1 : 1 };
}

export function penaltyBot(s: PenState, config: PenConfig, slot: number): PenInput {
  if (slot === s.kicker && s.phase === 'aim') {
    const p = kickerPlan(s.kickSeed);
    const hold = Math.max(1, Math.round(p.power * CHARGE_TICKS));
    const t = s.phaseTicks;
    if (t < p.wait) return PEN_IDLE;
    if (t < p.wait + hold) return { x: 0, kick: true, aim: null };
    return { x: 0, kick: false, aim: p.aim };
  }
  if (slot === s.keeper && (s.phase === 'aim' || s.phase === 'flight')) {
    const gk = s.gk;
    if (s.phase === 'aim') return { x: gk.x > 4 ? -0.5 : gk.x < -4 ? 0.5 : 0, kick: false, aim: null };
    const p = keeperPlan(s.kickSeed);
    if (s.phaseTicks < p.react) return PEN_IDLE;
    const b = s.ball;
    let target: number;
    if (p.reads && b.vy < -1) target = b.x + b.vx * ((b.y - KEEPER_Y) / -b.vy);
    else target = p.guess * 85;
    const dx = target - gk.x;
    if (Math.abs(dx) < STAND_REACH + BALL_R + 4) return { x: dx > 2 ? 1 : dx < -2 ? -1 : 0, kick: false, aim: null };
    return { x: dx > 0 ? 1 : -1, kick: !gk.dived, aim: null };
  }
  return PEN_IDLE;
}

// ═══════════════════════════ 입력 양자화 ═══════════════════════════
// x 다섯 칸(-1, -.5, 0, .5, 1) × 킥 둘 × 조준(없음 + -38..38 칸) = 5 × 2 × 78 = 780.
const X_LEVELS = 5, AIM_CODES = AIM_STEPS * 2 + 2;
const fin = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
function encodePen(i: PenInput): number {
  const xi = Math.min(4, Math.max(0, Math.round(fin(i?.x) * 2) + 2));
  const k = i?.kick ? 1 : 0;
  const a = i && typeof i.aim === 'number' && Number.isFinite(i.aim) ? 1 + Math.min(AIM_STEPS * 2, Math.max(0, Math.round(i.aim / AIM_STEP) + AIM_STEPS)) : 0;
  return (a * 2 + k) * X_LEVELS + xi;
}
function decodePen(q: number): PenInput {
  if (!Number.isInteger(q) || q < 0 || q >= X_LEVELS * 2 * AIM_CODES) return { ...PEN_IDLE };
  const xi = q % X_LEVELS, rest = Math.floor(q / X_LEVELS), k = rest % 2, a = Math.floor(rest / 2);
  return { x: (xi - 2) / 2, kick: k === 1, aim: a === 0 ? null : (a - 1 - AIM_STEPS) * AIM_STEP };
}

// ═══════════════════════════ 모양 검사 ═══════════════════════════
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isInt = (v: unknown, lo = -Infinity, hi = Infinity): v is number => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;
const isName = (v: unknown): v is string => typeof v === 'string' && v.length <= 24;
const okBody = (b: unknown): boolean => isObj(b) && isNum(b.x) && isNum(b.y) && isNum(b.vx) && isNum(b.vy);
const okPerf = (p: unknown): boolean => isObj(p) && isNum(p.maxSpeed) && isNum(p.accel) && isNum(p.kick) && isNum(p.mass) && p.mass > 0;
const PHASES: readonly string[] = ['ready', 'aim', 'flight', 'result', 'end'];
const OUTCOMES: readonly string[] = ['goal', 'save', 'miss', 'post'];
const MAX_LOG = (5 + SD_MAX) * 2;

function okConfig(c: unknown): c is PenConfig {
  if (!isObj(c) || (c.kicks !== 3 && c.kicks !== 5) || (c.first !== 0 && c.first !== 1)) return false;
  if (!Array.isArray(c.players) || c.players.length < 2 || c.players.length > MAX_PER_SIDE * 2) return false;
  const ok = c.players.every((p, i) => isObj(p) && p.id === i && isInt(p.num, 0) && isInt(p.jersey, 0) && isName(p.name)
    && (p.side === 0 || p.side === 1) && typeof p.bot === 'boolean' && okPerf(p.perf));
  if (!ok) return false;
  const per = [0, 1].map((side) => (c.players as Record<string, unknown>[]).filter((p) => p.side === side).length);
  return per.every((n) => n >= 1 && n <= MAX_PER_SIDE);
}

function okState(s: unknown, config: PenConfig): s is PenState {
  if (!isObj(s)) return false;
  const n = config.players.length;
  const slot = (v: unknown): boolean => isInt(v, 0, n - 1);
  const pair = (v: unknown): boolean => Array.isArray(v) && v.length === 2 && v.every((x) => isInt(x, 0));
  const gk = s.gk as Record<string, unknown>, st = s.st as Record<string, unknown>;
  return isInt(s.tick, 0) && typeof s.phase === 'string' && PHASES.includes(s.phase) && isInt(s.phaseTicks, 0) && s.n === n
    && isInt(s.kickNo, 0) && (s.side === 0 || s.side === 1) && slot(s.kicker) && slot(s.keeper)
    && config.players[s.kicker as number].side === s.side && config.players[s.keeper as number].side !== s.side
    && pair(s.taken) && pair(s.scored)
    && Array.isArray(s.log) && s.log.length <= MAX_LOG
    && s.log.every((e) => isObj(e) && (e.side === 0 || e.side === 1) && slot(e.kicker) && slot(e.keeper) && typeof e.out === 'string' && OUTCOMES.includes(e.out))
    && (s.outcome === null || (typeof s.outcome === 'string' && OUTCOMES.includes(s.outcome)))
    && isNum(s.power) && okBody(s.ball)
    && okBody(gk) && (gk.dive === -1 || gk.dive === 0 || gk.dive === 1) && isInt(gk.diveT, 0) && isInt(gk.lie, 0)
    && typeof gk.dived === 'boolean' && typeof gk.armed === 'boolean'
    && okBody(st) && isNum(st.charge) && typeof st.held === 'boolean' && typeof st.armed === 'boolean' && isNum(st.kickFlash)
    && isNum(s.kickSeed) && (s.winner === null || s.winner === 0 || s.winner === 1 || s.winner === 'draw') && isNum(s.seed);
}

// ═══════════════════════════ 어댑터 ═══════════════════════════
export const penalty2d: GameAdapter<PenConfig, PenState, PenInput> = {
  id: 'penalty2d',
  create: createPenalty,
  step: stepPenalty,
  idle: PEN_IDLE,
  encode: encodePen,
  decode: decodePen,
  codes: X_LEVELS * 2 * AIM_CODES,
  okConfig,
  okState,
  tick: (s) => s.tick,
  ended: (s) => s.phase === 'end',
  slots: (c) => c.players.length,
  slotNum: (c, i) => { const p = c.players[i]; return p && !p.bot ? p.num : null; },
  phase: (s) => s.phase,
  // 준비 → 조준, 조준 → 날아감은 점수와 상관없고, 얼리면 내가 찬 공이 0.1초 서 있다. 판정(result)·끝은 스냅샷만 믿는다.
  predictsAcross: (from, to) => (from === 'ready' && to === 'aim') || (from === 'aim' && to === 'flight'),
  // 킥을 누르거나 뗀 순간(떼는 입력에 조준이 실린다)은 간격을 기다리지 않는다.
  urgent: (a, b) => Math.floor(a / X_LEVELS) !== Math.floor(b / X_LEVELS),
  botInput: penaltyBot,
  // 공 · 키퍼 · 키커. 손님 화면은 이 셋만 예측을 쓰고 차례·점수·판정은 스냅샷 것을 쓴다.
  bodies: {
    get: (s) => [s.ball, s.gk, s.st],
    set: (s, b: Point[]) => ({ ...s, ball: b[0] as Body, gk: b[1] as Keeper, st: b[2] as Striker }),
  },
};

// ═══════════════════════════ 방 설정·시작 ═══════════════════════════
export type PenFirst = 'random' | Side;
export type PenSettings = { kicks: 3 | 5; first: PenFirst };
export const PEN_DEFAULTS: PenSettings = { kicks: 5, first: 'random' };

export function okPenSettings(v: unknown): v is PenSettings {
  return isObj(v) && (v.kicks === 3 || v.kicks === 5) && (v.first === 'random' || v.first === 0 || v.first === 1);
}
export function applyPenSettings(cur: PenSettings, given: unknown): PenSettings {
  const p = isObj(given) ? given : {};
  const kicks = p.kicks === 3 || p.kicks === 5 ? p.kicks : cur.kicks;
  const first = p.first === 'random' || p.first === 0 || p.first === 1 ? p.first : cur.first;
  return kicks === cur.kicks && first === cur.first ? cur : { kicks, first };
}

/** 사람이 없는 편의 봇 수 — 차는 횟수만큼(키커가 매번 다르게). */
export const botSquad = (kicks: number): number => kicks;

/** 편마다 사람(차례대로) → 설정. 사람이 없는 편은 봇(고른 봇 먼저, 나머지는 명단에서 rnd 로). 명단이 모자라면 있는 만큼(한 명은 있어야 한다). */
export function buildPenalty(o: {
  humans: [{ num: number; name: string; clientId: string | null }[], { num: number; name: string; clientId: string | null }[]];
  kicks: 3 | 5; first: PenFirst; roster: Player[]; rnd: () => number; picks?: [number[], number[]]; exclude?: readonly number[];
}): { config: PenConfig; slots: (string | null)[] } {
  const inRoster = new Map(o.roster.map((p) => [p.num, p]));
  const taken = new Set<number>([...(o.exclude ?? []), ...o.humans[0].map((h) => h.num), ...o.humans[1].map((h) => h.num)]);
  const used = new Set<number>();
  const chosen: [number[], number[]] = [[], []];
  for (const side of [0, 1] as const) {
    if (o.humans[side].length) continue;
    for (const n of o.picks?.[side] ?? []) {
      if (chosen[side].length >= botSquad(o.kicks)) break;
      if (inRoster.has(n) && !taken.has(n) && !used.has(n)) { used.add(n); chosen[side].push(n); }
    }
  }
  const seen = new Set<number>();
  const free = o.roster.filter((p) => !taken.has(p.num) && !used.has(p.num) && !seen.has(p.num) && (seen.add(p.num), true)).map((p) => p.num);
  const pool = shuffle(free, o.rnd);
  let k = 0;
  for (const side of [0, 1] as const) {
    if (o.humans[side].length) continue;
    while (chosen[side].length < botSquad(o.kicks) && k < pool.length) chosen[side].push(pool[k++]);
    if (!chosen[side].length) throw new RangeError('명단이 모자라 봇을 세울 수 없다');
  }
  // first 를 먼저 정한다 — 봇 뽑기 다음에 rnd 를 쓰는 차례가 늘 같게.
  const first: Side = o.first === 'random' ? (o.rnd() < 0.5 ? 0 : 1) : o.first;
  const players: PenPlayer[] = [];
  const slots: (string | null)[] = [];
  for (const side of [0, 1] as const) {
    const list = o.humans[side].length
      ? o.humans[side].map((h) => ({ num: h.num, name: h.name, bot: false, cid: h.clientId }))
      : chosen[side].map((n) => ({ num: n, name: inRoster.get(n)?.name ?? String(n), bot: true, cid: null as string | null }));
    for (const x of list) {
      const r = inRoster.get(x.num);
      players.push({ id: players.length, num: x.num, jersey: r?.jersey ?? 0, name: x.name, side, bot: x.bot, perf: r ? perfOf(r, o.roster) : { ...BASE_PERF } });
      slots.push(x.cid);
    }
  }
  return { config: { kicks: o.kicks, first, players }, slots };
}

type PenRoom = RoomState<PenSettings>;
const humansOf = (room: PenRoom): [PenRoom['members'], PenRoom['members']] => [room.members.filter((m) => m.team === 0), room.members.filter((m) => m.team === 1)];

export const PEN_BLOCK_TEXT = {
  humans: '지금 연결 방식으로는 한 판에 8명까지 뛸 수 있습니다 — 나머지는 대기 칸에서 구경합니다',
  roster: '명단이 모자라 봇 편을 세울 수 없습니다',
} as const;

export const PENALTY2D: GameEntry<PenConfig, PenState, PenInput, PenSettings> = {
  adapter: penalty2d,
  mode: '2d',
  name: '승부차기',
  describe: '두 편이 번갈아 다섯 번씩 차고 막습니다. 겨누고, 힘을 모았다가 떼면 슛. 키퍼는 줄 위에서 몸을 던집니다.',
  tags: ['온라인', '봇', '번갈아 차기'],
  defaultSettings: PEN_DEFAULTS,
  okSettings: okPenSettings,
  applySettings: applyPenSettings,
  buildConfig(room, roster, rnd) {
    const why = PENALTY2D.startBlock!(room, roster);
    if (why) throw new RangeError(why);
    const [a, b] = humansOf(room);
    const h = (l: PenRoom['members']) => l.map((m) => ({ num: m.num, name: m.name, clientId: m.clientId }));
    return buildPenalty({ humans: [h(a), h(b)], kicks: room.settings.kicks, first: room.settings.first, roster, rnd, picks: room.botPicks, exclude: room.members.map((m) => m.num) });
  },
  startBlock(room, roster) {
    const [a, b] = humansOf(room);
    if (a.length + b.length > MAX_HUMANS) return PEN_BLOCK_TEXT.humans;
    const held = new Set(room.members.map((m) => m.num));
    const free = new Set(roster.filter((p) => !held.has(p.num)).map((p) => p.num)).size;
    const need = (a.length ? 0 : 1) + (b.length ? 0 : 1);
    return free < need ? PEN_BLOCK_TEXT.roster : null;
  },
  // 사람이 없는 편 = 봇 편(차는 횟수만큼). 사람이 있는 편은 사람만 찬다.
  botSeats(room) {
    const [a, b] = humansOf(room);
    return [a.length ? 0 : botSquad(room.settings.kicks), b.length ? 0 : botSquad(room.settings.kicks)];
  },
};
