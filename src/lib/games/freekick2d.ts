// src/lib/games/freekick2d.ts — 2D 프리킥(2026-11-07 게임 묶음 3단계). 순수 — 화면·시계·난수 함수·삼각함수를 부르지 않는다.
// 설계: docs/superpowers/specs/2026-11-07-games-program-design.md §3.2
// 사용자: "자유 훈련장, 여러 드리블 훈련장, 승부차기, 프리킥 같은 게임 만들어서 온라인 가능하게 하자. 다 2d, 3d 모드 별로 가능하게 하고."
//
// 규칙(3D 판이 따라 할 수 있게 — 보고서 p3-report.md §3 에도 같은 글):
//   - 자리 다섯(FK_SPOTS, 가까운 정면 → 먼 측면), 점수 1·2·2·3·3. 방 사람(앞 8명)이 자리마다 차례로 한 번씩 차고 다음 자리로 — 차기 k 의
//     자리 = ⌊k / n⌋, 키커 = k mod n(fkTurn). 혼자면 나 혼자 다섯 번. 다른 사람은 그 차기를 그대로 구경한다.
//   - 수비벽 봇 셋 + 키퍼 봇. 벽은 가까운 기둥 쪽 골문을 가리게 서고(fkWall), 키퍼는 반대쪽(열린 쪽)에 선다.
//   - 키커 조작은 승부차기와 같다 — 조준(키커 화면에만), 킥을 누르고 있으면 세기, 떼면 슛. 하나 더: 감아차기 — 세기를 모으는 동안의
//     스틱 좌우가 떼는 순간 입력의 x 로 실려(조준과 같이 그 틱에만) 공이 그쪽으로 조금 휜다(CURL_RATE 라디안/초 × x, CURL_TICKS 동안).
//     휘는 건 속도를 그 크기 그대로 옆으로 돌리는 것(sqrt 로 크기를 되맞춘다 — 삼각함수 없음).
//   - 5초 안에 안 차면 약한 가운데 슛. 판정: 골 · 막음(키퍼) · 벽 · 빗나감 · 골대. 골이면 그 자리 점수.
//   - 키퍼 봇은 공이 나간 뒤 반응 시간이 지나야 움직이고, 일부만 공의 "곧은" 길을 읽는다(감은 공은 읽은 자리에서 벗어난다), 나머지는 짐작.
import type { Body } from '../game/sim.ts';
import { PHYS, collidePoint, collideSegment, nextRand } from '../game/sim.ts';
import type { Perf } from '../game/stats.ts';
import { BASE_PERF, perfOf } from '../game/stats.ts';
import { MAX_HUMANS } from '../game/room.ts';
import type { Player } from '../types.ts';
import type { GameAdapter, Point } from './adapter.ts';
import type { GameEntry } from './entry.ts';
import type { Keeper, PenInput, Striker } from './penalty2d.ts';
import {
  AIM_MAX, AUTO_POWER, BALL_R, CHARGE_TICKS, GOAL_DEPTH, GOAL_W, KEEPER_THICK, KEEPER_Y, NETS, PEN_CODES, PEN_IDLE, POSTS, POST_R, STAND_REACH,
  decodePen, deviationOf, encodePen, keeperSeg, keeperStep, penUrgent, planRand, speedOf,
} from './penalty2d.ts';

// ═══════════════════════════ 조절 값 ═══════════════════════════
// 좌표는 승부차기와 같다: x = 골문 따라(가운데 0), y = 골라인에서 바깥쪽(골라인 0). 골문·그물·기둥·공·키퍼 몸도 승부차기 것.
/** 자리 다섯 — 우리 것(어느 게임의 자리 배치도 가져오지 않았다). pts = 넣으면 얻는 점수. */
export const FK_SPOTS: readonly { x: number; y: number; pts: number; name: string }[] = [
  { x: 0, y: 290, pts: 1, name: '정면' },
  { x: -120, y: 330, pts: 2, name: '왼쪽' },
  { x: 150, y: 350, pts: 2, name: '오른쪽' },
  { x: -250, y: 400, pts: 3, name: '왼쪽 먼 곳' },
  { x: 280, y: 430, pts: 3, name: '오른쪽 먼 곳' },
];
export const FK_MAX_POINTS = FK_SPOTS.reduce((t, s) => t + s.pts, 0);
export const WALL_R = 13;           // 벽 사람 하나(위에서 본 어깨 폭의 반) — 키커 몸(22)보다 작게 그린다
const WALL_GAP = 25;                // 벽 사람 사이(가운데끼리)
const WALL_FRAC = 0.5;              // 공 → 가릴 곳 거리의 이만큼에 선다
const WALL_AIM = 80;                // 벽 가운데가 겨누는 골라인 위 점 = 가까운 기둥 쪽으로 이만큼(가운데에서)
const KEEPER_HOME = 20;             // 키퍼가 서는 곳 = 벽 반대쪽으로 이만큼
const WALL_SHUFFLE = 4;             // 조준 동안 벽이 좌우로 들썩이는 폭(삼각파, 0.8초 주기)
export const CURL_RATE = 1.3;       // 감아차기 — 스틱 끝까지면 초당 1.3 라디안 꺾인다(0.7초면 약 0.9 라디안 — 먼 자리에서 벽을 돌아 들어갈 만큼)
export const CURL_TICKS = 42;       // 휘는 시간(0.7초)
export const READY_TICKS = 66, AIM_TICKS = 300, RESULT_TICKS = 96;
const FLIGHT_MAX = 150;
/** 조준 배율 — 입력의 조준(승부차기와 같은 ±190, 5단위)에 이걸 곱한 골라인 위 점을 겨눈다. 먼 측면 자리에서 벽 바깥이나 먼 기둥까지 겨누려면
 *  ±300 쯤이 필요해서(승부차기 입력 모양을 그대로 쓰려고 범위를 넓히는 대신 배율). 한 칸 = 8단위. */
export const FK_AIM_SCALE = 1.6;
export const FK_AIM_MAX = AIM_MAX * FK_AIM_SCALE;
/** 봇 키퍼 — 반응(틱) 최소·폭, 곧은 길을 읽는 비율, 못 읽을 때 열린 쪽(벽 반대)을 짐작하는 비율.
 *  2026-11-07 대본 키커(fkKickerPlan) 200판으로 맞춤: 자리별 성공률 66·38·34·35·38% — 가까운 정면이 쉽고 나머지는 셋에 하나꼴. */
const GK_REACT_MIN = 18, GK_REACT_SPAN = 12, GK_READS = 0.3, GK_OPEN_SIDE = 0.5;
// ════════════════════════════════════════════════════════════

const HALF = GOAL_W / 2;
export type FkOutcome = 'goal' | 'save' | 'wall' | 'miss' | 'post';
export type FkPlayer = { id: number; num: number; jersey: number; name: string; bot: boolean; perf: Perf };
export type FkConfig = { players: FkPlayer[] };
export type FkLog = { kicker: number; spot: number; out: FkOutcome };
export type FkPhase = 'ready' | 'aim' | 'flight' | 'result' | 'end';
export type FkState = {
  tick: number; phase: FkPhase; phaseTicks: number;
  /** 자리 수(설정의 사람 수) — 다른 판의 스냅샷을 알아보려고. */
  n: number;
  kickNo: number; spot: number; kicker: number;
  points: number[]; log: FkLog[];
  outcome: FkOutcome | null; power: number; curl: number;
  ball: Body; gk: Keeper; st: Striker;
  kickSeed: number; seed: number;
};

// ── 차례와 점수(3D 가 그대로 쓸 수 있는 순수 조각) ──
/** 차기 k(0부터)의 자리와 키커. n = 차는 사람 수. 모두 5n 번. */
export function fkTurn(k: number, n: number): { spot: number; kicker: number } {
  return { spot: Math.floor(k / n), kicker: k % n };
}
export const fkTotal = (n: number): number => FK_SPOTS.length * n;
/** 순위 — 점수 높은 순, 같으면 골 많은 순, 같으면 먼저 찬 사람. */
export function fkRanking(points: number[], log: FkLog[]): number[] {
  const goals = points.map((_, i) => log.filter((e) => e.kicker === i && e.out === 'goal').length);
  return points.map((_, i) => i).sort((a, b) => points[b] - points[a] || goals[b] - goals[a] || a - b);
}

// ── 벽과 키퍼 자리(자리마다 한 번 계산 — 사칙연산과 sqrt 만) ──
/** 가까운 기둥 쪽(정면이면 왼쪽). */
export const nearSide = (spot: number): 1 | -1 => (FK_SPOTS[spot].x > 0 ? 1 : -1);
/** 벽 사람 셋의 자리(가운데 → 공 쪽에서 본 왼쪽부터). */
export function fkWall(spot: number): Point[] {
  const s = FK_SPOTS[spot], side = nearSide(spot);
  const px = side * WALL_AIM, dx = px - s.x, dy = 0 - s.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  const ux = dx / len, uy = dy / len, cx = s.x + ux * len * WALL_FRAC, cy = s.y + uy * len * WALL_FRAC;
  return [-1, 0, 1].map((k) => ({ x: cx - uy * WALL_GAP * k, y: cy + ux * WALL_GAP * k }));
}
const WALLS: Point[][] = FK_SPOTS.map((_, i) => fkWall(i));
/** 지금 벽(조준 동안 살짝 들썩인다 — 틱의 삼각파, 결정적). */
export function wallAt(s: Pick<FkState, 'spot' | 'phase' | 'phaseTicks'>): Point[] {
  const base = WALLS[s.spot] ?? WALLS[0];
  if (s.phase !== 'aim') return base;
  const t = s.phaseTicks % 48, tri = (t < 24 ? t : 48 - t) / 24 * 2 - 1;   // −1..1
  return base.map((p) => ({ x: p.x + tri * WALL_SHUFFLE, y: p.y }));
}
export const keeperHome = (spot: number): number => -nearSide(spot) * KEEPER_HOME;

function setupKick(s: FkState, n: number): void {
  const t = fkTurn(s.kickNo, n), sp = FK_SPOTS[t.spot];
  s.spot = t.spot; s.kicker = t.kicker;
  s.ball = { x: sp.x, y: sp.y, vx: 0, vy: 0 };
  // 키커는 공 뒤 — 골문 가운데에서 공을 지나는 줄 위
  const len = Math.sqrt(sp.x * sp.x + sp.y * sp.y) || 1;
  s.st = { x: sp.x + (sp.x / len) * 36, y: sp.y + (sp.y / len) * 36, vx: 0, vy: 0, charge: 0, held: false, armed: false, kickFlash: 0 };
  s.gk = { x: keeperHome(t.spot), y: KEEPER_Y, vx: 0, vy: 0, dive: 0, diveT: 0, lie: 0, dived: false, armed: true };
  s.outcome = null; s.power = 0; s.curl = 0;
  s.kickSeed = Math.floor(nextRand(s) * 4294967296) >>> 0;
  s.phase = 'ready'; s.phaseTicks = 0;
}

export function createFreekick(config: FkConfig, seed: number): FkState {
  const n = config.players.length;
  const s: FkState = {
    tick: 0, phase: 'ready', phaseTicks: 0, n, kickNo: 0, spot: 0, kicker: 0,
    points: config.players.map(() => 0), log: [], outcome: null, power: 0, curl: 0,
    ball: { x: 0, y: 0, vx: 0, vy: 0 },
    gk: { x: 0, y: KEEPER_Y, vx: 0, vy: 0, dive: 0, diveT: 0, lie: 0, dived: false, armed: true },
    st: { x: 0, y: 0, vx: 0, vy: 0, charge: 0, held: false, armed: false, kickFlash: 0 },
    kickSeed: 0, seed: seed >>> 0,
  };
  setupKick(s, n);
  return s;
}

/** 감아차기 한 번 꺾기 — 속도를 옆(오른손 쪽)으로 rate·dt 만큼 돌리고 크기는 그대로. */
export function curlVel(b: Body, amount: number): void {
  const sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
  if (sp < 1e-6 || amount === 0) return;
  const nx = b.vx + -b.vy * amount, ny = b.vy + b.vx * amount;
  const n = Math.sqrt(nx * nx + ny * ny);
  b.vx = nx / n * sp; b.vy = ny / n * sp;
}

/** 찬 공의 첫 속도 — 조준(골라인 위 x, 이미 배율을 곱한 값) + 흔들림(r: −1..1) 쪽 골라인 점으로, 세기만큼. */
export function fkLaunch(ball: Point, power: number, aim: number, perf: Perf, r: number): { vx: number; vy: number } {
  const tx = Math.min(FK_AIM_MAX, Math.max(-FK_AIM_MAX, aim)) + r * deviationOf(power, perf);
  const dx = tx - ball.x, dy = 0 - ball.y, len = Math.sqrt(dx * dx + dy * dy) || 1, v = speedOf(power);
  return { vx: dx / len * v, vy: dy / len * v };
}

/** 키커 화면의 미리 보기 — 흔들림 없이 이 조준·세기·감기로 차면 공이 갈 길(벽·키퍼 없이, 골라인까지). 순수. */
export function fkPath(spot: number, aim: number, power: number, curl: number, every = 4): Point[] {
  const sp = FK_SPOTS[spot] ?? FK_SPOTS[0];
  const b: Body = { x: sp.x, y: sp.y, vx: 0, vy: 0 };
  const v = fkLaunch(b, power, aim, BASE_PERF, 0);
  b.vx = v.vx; b.vy = v.vy;
  const out: Point[] = [{ x: b.x, y: b.y }];
  for (let t = 0; t < 120 && b.y > 0; t++) {
    for (let k = 0; k < PHYS.SUBSTEPS; k++) {
      if (t < CURL_TICKS) curlVel(b, curl * CURL_RATE * PHYS.SUB_DT);
      b.x += b.vx * PHYS.SUB_DT; b.y += b.vy * PHYS.SUB_DT;
    }
    const keep = 1 - PHYS.BALL_DRAG * PHYS.DT;
    b.vx *= keep; b.vy *= keep;
    if (t % every === 0) out.push({ x: b.x, y: b.y });
  }
  out.push({ x: b.x, y: b.y });
  return out;
}

function strike(s: FkState, config: FkConfig, power: number, aim: number, curl: number): void {
  const perf = config.players[s.kicker].perf;
  const v = fkLaunch(s.ball, power, aim, perf, nextRand(s) * 2 - 1);
  s.ball.vx = v.vx; s.ball.vy = v.vy;
  s.power = Math.min(1, Math.max(0, power));
  s.curl = Math.min(1, Math.max(-1, Number.isFinite(curl) ? curl : 0));
  s.st.held = false; s.st.kickFlash = 12;
  s.phase = 'flight'; s.phaseTicks = 0;
}

/** 공 한 틱 — 감기·기둥·그물·벽·키퍼. 닿은 것(키퍼·벽)을 돌려준다. */
function moveBall(s: FkState, curlOn: boolean): { keeper: boolean; wall: boolean } {
  const b = s.ball, seg = keeperSeg(s.gk), wall = wallAt(s);
  let keeper = false, wallHit = false;
  for (let k = 0; k < PHYS.SUBSTEPS; k++) {
    if (curlOn) curlVel(b, s.curl * CURL_RATE * PHYS.SUB_DT);
    b.x += b.vx * PHYS.SUB_DT; b.y += b.vy * PHYS.SUB_DT;
    for (const [px, py] of POSTS) collidePoint(b, BALL_R, px, py, POST_R, PHYS.E_BALL_POST);
    if (b.y < 0) for (const w of NETS) collideSegment(b, BALL_R, w, 0.15);
    for (const p of wall) {
      const dx = b.x - p.x, dy = b.y - p.y;
      if (dx * dx + dy * dy < (BALL_R + WALL_R) * (BALL_R + WALL_R)) { collidePoint(b, BALL_R, p.x, p.y, WALL_R, 0.3); wallHit = true; }
    }
    const cx = Math.min(seg[2], Math.max(seg[0], b.x)), dx = b.x - cx, dy = b.y - seg[1];
    if (dx * dx + dy * dy < (BALL_R + KEEPER_THICK) * (BALL_R + KEEPER_THICK)) { collideSegment(b, BALL_R + KEEPER_THICK, seg, 0.35); keeper = true; }
  }
  const keep = 1 - PHYS.BALL_DRAG * PHYS.DT;
  b.vx *= keep; b.vy *= keep;
  if (Math.sqrt(b.vx * b.vx + b.vy * b.vy) < PHYS.BALL_REST_SPEED) { b.vx = 0; b.vy = 0; }
  if (!Number.isFinite(b.x + b.y + b.vx + b.vy)) { b.x = 0; b.y = -GOAL_DEPTH / 2; b.vx = 0; b.vy = 0; }
  if (b.y < -260 || b.y > 600 || Math.abs(b.x) > 460) { b.vx = 0; b.vy = 0; b.x = Math.min(460, Math.max(-460, b.x)); b.y = Math.min(600, Math.max(-260, b.y)); }
  return { keeper, wall: wallHit };
}

// ── 키퍼 봇(계산 안 — 키퍼는 자리가 아니다) ──
export function fkKeeperPlan(kickSeed: number): { react: number; reads: boolean; open: boolean } {
  const r = (k: number): number => planRand(kickSeed, 20 + k);
  return { react: GK_REACT_MIN + Math.floor(r(0) * GK_REACT_SPAN), reads: r(1) < GK_READS, open: r(2) < GK_OPEN_SIDE };
}
function keeperInput(s: FkState): PenInput {
  const gk = s.gk;
  if (s.phase === 'aim' || s.phase === 'ready') {
    const dx = keeperHome(s.spot) - gk.x;
    return { x: dx > 4 ? 0.5 : dx < -4 ? -0.5 : 0, kick: false, aim: null };
  }
  if (s.phase !== 'flight') return PEN_IDLE;
  const p = fkKeeperPlan(s.kickSeed);
  if (s.phaseTicks < p.react) return PEN_IDLE;
  const b = s.ball;
  const side = nearSide(s.spot);
  const target = p.reads && b.vy < -1 ? b.x + b.vx * ((b.y - KEEPER_Y) / -b.vy) : (p.open ? -side : side) * 85;
  const dx = target - gk.x;
  if (Math.abs(dx) < STAND_REACH + BALL_R + 4) return { x: dx > 2 ? 1 : dx < -2 ? -1 : 0, kick: false, aim: null };
  return { x: dx > 0 ? 1 : -1, kick: !gk.dived, aim: null };
}

function judge(s: FkState, hit: { keeper: boolean; wall: boolean }, postHit: boolean): FkOutcome | null {
  const b = s.ball;
  if (hit.keeper) return 'save';
  if (hit.wall) return 'wall';
  if (b.y < -BALL_R) return Math.abs(b.x) < HALF ? 'goal' : postHit ? 'post' : 'miss';
  if (b.y < 0 && Math.abs(b.x) > HALF + POST_R + BALL_R) return postHit ? 'post' : 'miss';
  if ((postHit && b.vy > 0) || (b.vx === 0 && b.vy === 0) || s.phaseTicks >= FLIGHT_MAX) return postHit ? 'post' : 'miss';
  return null;
}

const KEEPER_PERF: Perf = { ...BASE_PERF };

export function stepFreekick(state: FkState, config: FkConfig, inputs: PenInput[]): FkState {
  if (state.phase === 'end') return { ...state, tick: state.tick + 1, phaseTicks: state.phaseTicks + 1 };
  const s: FkState = { ...state, points: [...state.points], ball: { ...state.ball }, gk: { ...state.gk }, st: { ...state.st } };
  s.tick += 1; s.phaseTicks += 1;
  const kin = inputs[s.kicker] ?? PEN_IDLE;
  if (s.st.kickFlash > 0) s.st.kickFlash -= 1;

  if (s.phase === 'ready') {
    if (!kin.kick) s.st.armed = true;   // 눌린 채 넘어온 버튼은 세지 않는다(승부차기와 같다)
    keeperStep(s.gk, KEEPER_PERF, keeperInput(s), true);
    if (s.phaseTicks >= READY_TICKS) { s.phase = 'aim'; s.phaseTicks = 0; }
    return s;
  }
  if (s.phase === 'aim') {
    const st = s.st;
    if (!kin.kick) {
      if (st.held) strike(s, config, st.charge / CHARGE_TICKS, typeof kin.aim === 'number' && Number.isFinite(kin.aim) ? kin.aim * FK_AIM_SCALE : 0, kin.x);
      else st.armed = true;
    } else if (st.armed) { st.held = true; st.charge = Math.min(CHARGE_TICKS, st.charge + 1); }
    if (s.phase === 'aim' && s.phaseTicks >= AIM_TICKS) strike(s, config, AUTO_POWER, 0, 0);
    keeperStep(s.gk, KEEPER_PERF, keeperInput(s), true);
    return s;
  }
  if (s.phase === 'flight') {
    keeperStep(s.gk, KEEPER_PERF, keeperInput(s), true);
    const vx0 = s.ball.vx, vy0 = s.ball.vy;
    const hit = moveBall(s, s.phaseTicks <= CURL_TICKS);
    const turned = vx0 * s.ball.vx + vy0 * s.ball.vy < 0.5 * Math.sqrt((vx0 * vx0 + vy0 * vy0) * (s.ball.vx * s.ball.vx + s.ball.vy * s.ball.vy));
    const postHit = !hit.keeper && !hit.wall && turned && s.ball.y < 40;
    const out = judge(s, hit, postHit || s.outcome === 'post');
    if (postHit && out === null) s.outcome = 'post';
    if (out !== null) {
      s.outcome = out;
      if (out === 'goal') s.points[s.kicker] += FK_SPOTS[s.spot].pts;
      s.log = [...s.log, { kicker: s.kicker, spot: s.spot, out }];
      s.phase = 'result'; s.phaseTicks = 0;
    }
    return s;
  }
  // result — 공·키퍼는 계속 움직인다(조작 없음)
  keeperStep(s.gk, KEEPER_PERF, PEN_IDLE, false);
  moveBall(s, false);
  if (s.phaseTicks >= RESULT_TICKS) {
    if (s.kickNo + 1 >= fkTotal(s.n)) { s.phase = 'end'; s.phaseTicks = 0; }
    else { s.kickNo += 1; setupKick(s, s.n); }
  }
  return s;
}

// ── 대본 키커(봇 자리·끊긴 손님·테스트) — 열린 쪽 구석을 겨누거나, 벽 쪽 구석으로 감아 찬다 ──
type KickPlan = { wait: number; power: number; aim: number; curl: number };
/** 계획은 차기마다 같다(순수) — 틱마다 부르니 길 찾기(fkCurlAim)를 차기당 한 번만 하게 적어 둔다. 결과는 같고 빠르기만 하다. */
const PLANS = new Map<string, KickPlan>();
export function fkKickerPlan(kickSeed: number, spot: number): KickPlan {
  const key = `${kickSeed}:${spot}`, hit = PLANS.get(key);
  if (hit) return hit;
  const plan = makePlan(kickSeed, spot);
  if (PLANS.size > 256) PLANS.clear();
  PLANS.set(key, plan);
  return plan;
}
function makePlan(kickSeed: number, spot: number): KickPlan {
  const r = (k: number): number => planRand(kickSeed, k);
  const side = nearSide(spot);
  const wait = 20 + Math.floor(r(0) * 40);
  const power = 0.55 + r(1) * 0.4;
  if (r(2) < 0.5) return { wait, power, aim: -side * (80 + r(3) * 35), curl: 0 };   // 열린 쪽 구석
  // 벽 쪽으로 감아 차기 — 벽 바깥을 돌아 가까운 기둥 안쪽으로 들어가는 조준을 미리 보기 길로 찾는다(가장 안쪽 것부터).
  const aim = fkCurlAim(spot, power, -side, r(3) * 20);
  return aim === null ? { wait, power, aim: -side * 90, curl: 0 } : { wait, power, aim, curl: -side };
}

/** 이 세기·감기로 벽을 비켜 골문 안(기둥에서 margin 안쪽까지)에 들어가는 조준(골라인 위 x) — 안쪽부터 바깥쪽으로 찾는다. 없으면 null. 순수. */
export function fkCurlAim(spot: number, power: number, curl: number, margin = 10): number | null {
  const side = nearSide(spot), wall = fkWall(spot);
  for (let k = 0; k <= 30; k++) {
    const aim = side * (60 + k * 8);
    const path = fkPath(spot, aim, power, curl, 1);
    const clear = path.every((q) => wall.every((w) => (q.x - w.x) * (q.x - w.x) + (q.y - w.y) * (q.y - w.y) > (WALL_R + BALL_R + 3) * (WALL_R + BALL_R + 3)));
    const end = path[path.length - 1];
    if (clear && Math.abs(end.x) < HALF - 15 - margin && end.x * side > 0) return aim;
  }
  return null;
}

export function freekickBot(s: FkState, _c: FkConfig, slot: number): PenInput {
  if (slot !== s.kicker || s.phase !== 'aim') return PEN_IDLE;
  const p = fkKickerPlan(s.kickSeed, s.spot);
  const hold = Math.max(1, Math.round(p.power * CHARGE_TICKS));
  if (s.phaseTicks < p.wait) return PEN_IDLE;
  if (s.phaseTicks < p.wait + hold) return { x: 0, kick: true, aim: null };
  return { x: p.curl, kick: false, aim: p.aim / FK_AIM_SCALE };
}

// ═══════════════════════════ 모양 검사 ═══════════════════════════
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isInt = (v: unknown, lo = -Infinity, hi = Infinity): v is number => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;
const isName = (v: unknown): v is string => typeof v === 'string' && v.length <= 24;
const okBody = (b: unknown): boolean => isObj(b) && isNum(b.x) && isNum(b.y) && isNum(b.vx) && isNum(b.vy);
const okPerf = (p: unknown): boolean => isObj(p) && isNum(p.maxSpeed) && isNum(p.accel) && isNum(p.kick) && isNum(p.mass) && p.mass > 0;
const PHASES: readonly string[] = ['ready', 'aim', 'flight', 'result', 'end'];
const OUTS: readonly string[] = ['goal', 'save', 'wall', 'miss', 'post'];

function okConfig(c: unknown): c is FkConfig {
  return isObj(c) && Array.isArray(c.players) && c.players.length >= 1 && c.players.length <= MAX_HUMANS
    && c.players.every((p, i) => isObj(p) && p.id === i && isInt(p.num, 0) && isInt(p.jersey, 0) && isName(p.name) && typeof p.bot === 'boolean' && okPerf(p.perf));
}
function okState(s: unknown, config: FkConfig): s is FkState {
  if (!isObj(s)) return false;
  const n = config.players.length;
  const gk = s.gk as Record<string, unknown>, st = s.st as Record<string, unknown>;
  return isInt(s.tick, 0) && typeof s.phase === 'string' && PHASES.includes(s.phase) && isInt(s.phaseTicks, 0) && s.n === n
    && isInt(s.kickNo, 0, fkTotal(n) - 1) && isInt(s.spot, 0, FK_SPOTS.length - 1) && isInt(s.kicker, 0, n - 1)
    && Array.isArray(s.points) && s.points.length === n && s.points.every((v) => isInt(v, 0))
    && Array.isArray(s.log) && s.log.length <= fkTotal(n)
    && s.log.every((e) => isObj(e) && isInt(e.kicker, 0, n - 1) && isInt(e.spot, 0, FK_SPOTS.length - 1) && typeof e.out === 'string' && OUTS.includes(e.out))
    && (s.outcome === null || (typeof s.outcome === 'string' && OUTS.includes(s.outcome)))
    && isNum(s.power) && isNum(s.curl) && okBody(s.ball)
    && okBody(gk) && (gk.dive === -1 || gk.dive === 0 || gk.dive === 1) && isInt(gk.diveT, 0) && isInt(gk.lie, 0) && typeof gk.dived === 'boolean' && typeof gk.armed === 'boolean'
    && okBody(st) && isNum(st.charge) && typeof st.held === 'boolean' && typeof st.armed === 'boolean' && isNum(st.kickFlash)
    && isNum(s.kickSeed) && isNum(s.seed);
}

// ═══════════════════════════ 어댑터 ═══════════════════════════
export const freekick2d: GameAdapter<FkConfig, FkState, PenInput> = {
  id: 'freekick2d',
  create: createFreekick,
  step: stepFreekick,
  idle: PEN_IDLE,
  encode: encodePen,
  decode: decodePen,
  codes: PEN_CODES,
  okConfig,
  okState,
  tick: (s) => s.tick,
  ended: (s) => s.phase === 'end',
  slots: (c) => c.players.length,
  slotNum: (c, i) => { const p = c.players[i]; return p && !p.bot ? p.num : null; },
  phase: (s) => s.phase,
  predictsAcross: (from, to) => (from === 'ready' && to === 'aim') || (from === 'aim' && to === 'flight'),
  urgent: penUrgent,
  botInput: freekickBot,
  bodies: {
    get: (s) => [s.ball, s.gk, s.st],
    set: (s, b: Point[]) => ({ ...s, ball: b[0] as Body, gk: b[1] as Keeper, st: b[2] as Striker }),
  },
};

// ═══════════════════════════ 방 ═══════════════════════════
/** 설정할 것이 없다(자리·점수는 정해져 있다). 모양만 있는 빈 설정. */
export type FkSettings = Record<string, never>;
export const FK_DEFAULTS: FkSettings = {};

/** 사람 목록 → 설정. 등번호·능력치는 명단에서. */
export function buildFreekick(humans: { num: number; name: string }[], roster: Player[]): FkConfig {
  const byNum = new Map(roster.map((p) => [p.num, p]));
  return {
    players: humans.slice(0, MAX_HUMANS).map((h, id) => {
      const r = byNum.get(h.num);
      return { id, num: h.num, jersey: r?.jersey ?? 0, name: h.name, bot: false, perf: r ? perfOf(r, roster) : { ...BASE_PERF } };
    }),
  };
}

export const FREEKICK2D: GameEntry<FkConfig, FkState, PenInput, FkSettings> = {
  adapter: freekick2d,
  mode: '2d',
  name: '프리킥',
  describe: '정해진 다섯 자리에서 수비벽과 키퍼를 넘어 한 번씩. 먼 자리일수록 점수가 큽니다. 공을 휘게 차는 감아차기 하나.',
  tags: ['온라인', '차례대로', '감아차기'],
  defaultSettings: FK_DEFAULTS,
  okSettings: (v): v is FkSettings => isObj(v),
  applySettings: (cur) => cur,
  lobby: 'all',
  buildConfig(room, roster) {
    const playing = room.members.slice(0, MAX_HUMANS);
    const config = buildFreekick(playing.map((m) => ({ num: m.num, name: m.name })), roster);
    return { config, slots: playing.map((m) => m.clientId) };
  },
};
