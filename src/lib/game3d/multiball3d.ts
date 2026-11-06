// src/lib/game3d/multiball3d.ts — 3D 경기장에서 공 여러 개 한 틱(2026-11-07 게임 묶음 5단계). 순수 — 화면·시계·난수 함수·삼각함수 없음.
// 사용자: "자유 훈련장, 여러 드리블 훈련장, 승부차기, 프리킥 같은 게임 만들어서 온라인 가능하게 하자. 다 2d, 3d 모드 별로 가능하게 하고."
// 스펙 §3.3 "3D: 같은 내용 + 1인칭 시점 연습에 좋다" — 그래서 몸·공·조작은 3D 경기와 같은 느낌이어야 한다. 경기 계산(sim.ts)은 공이 하나라
// 그대로는 못 쓰지만, 이동(steer)·몸끼리 충돌·경기장 가두기(containBall·containPlayer)·발밑 공 자리(carrySpot)·조절 값(TUNE3D)은 그대로 가져다 쓰고,
// 공이 여럿인 데서 생기는 것만 여기서 정한다. 3D 자유 훈련장이 쓰고, 3D 드리블 훈련장·프리킥이 이어 쓸 자리다.
//
// 공 여러 개 규칙(내 결정 — 가장 단순하고 어긋나지 않는 것):
//   - 공마다 주인(owner) 하나. 한 사람은 공을 많아야 하나 갖는다(발밑 자리가 하나라서).
//   - 아무도 안 가진 공은 잡을 수 있는 거리·높이·상대 속도 안의, 공이 없는 사람 중 가장 가까운 사람이 갖는다(경기의 잡기 규칙 그대로).
//   - 차기(슛·패스·스루·로빙)는 내 발밑 공, 없으면 바로 앞 낮은 아무도 안 가진 공 중 가장 가까운 것(논스톱).
//   - 편이 없다 — 남의 공에 몸으로 붙으면 경기처럼 빼앗거나 흘러나온다(공마다 빼앗기 잠금). 패스는 보는 쪽 가까운 아무에게나.
//   - 공끼리는 부딪쳐 튄다(반발 0.7, 2D 훈련장과 같은 값).
//   - 골대는 둘 다 — 보는 방향이 어느 골대 쪽이든 그쪽으로 조준 보정.
import type { Ball, Input } from './sim.ts';
import { NO_INPUT, PITCH3D, TUNE3D, carrySpot, collidePlayers, containBall, containPlayer, rand, steer, turnToward, unit } from './sim.ts';
import type { Perf } from './stats.ts';

const T = TUNE3D;
const { HW, HH, goalHalfW: GW, playerR: PR, ballR: BR, playerH: PH } = PITCH3D;
const CONTROL = PR + BR + T.CONTROL_REACH;
const BALL_BALL_E = 0.7;

/** 몸 하나 — 3D 경기 선수 상태에서 공 여럿에 필요한 것만(태클 키·골키퍼 없음). */
export type MBPlayer = {
  id: number; x: number; y: number; vx: number; vy: number; fx: number; fy: number;
  charge: number; shootHeld: boolean; passHeld: boolean; throughHeld: boolean; lobHeld: boolean; lobTicks: number;
  noTouch: number; kickTicks: number; sprint: boolean; stamina: number;
};
/** 공 하나 — 경기의 공 + 주인·빼앗기 잠금·마지막 패스 받을 사람. */
export type MBBall = Ball & { owner: number | null; stealLock: number };
/** 상태 중 이 모듈이 읽고 쓰는 것(씨앗은 상태 안 — rand). */
export type MBWorld = { seed: number; players: MBPlayer[]; balls: MBBall[]; kicks: number };

export const newPlayer = (id: number, x: number, y: number, fx: number, fy: number): MBPlayer => ({
  id, x, y, vx: 0, vy: 0, fx, fy, charge: 0, shootHeld: false, passHeld: false, throughHeld: false, lobHeld: false, lobTicks: 0,
  noTouch: 0, kickTicks: 0, sprint: false, stamina: 1,
});
export const newBall = (x: number, y: number): MBBall => ({ x, y, z: BR, vx: 0, vy: 0, vz: 0, owner: null, stealLock: 0 });

const fin = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** i 가 가진 공 번호(없으면 -1). */
export function ballOf(w: MBWorld, i: number): number {
  for (let j = 0; j < w.balls.length; j++) if (w.balls[j].owner === i) return j;
  return -1;
}

/** i 가 지금 찰 수 있는 공 — 발밑 공, 없으면 바로 앞 낮은 아무도 안 가진 공 중 가장 가까운 것. 없으면 -1. */
function kickable(w: MBWorld, i: number): number {
  const own = ballOf(w, i);
  if (own >= 0) return own;
  const p = w.players[i];
  if (p.noTouch > 0) return -1;
  let best = -1, bd = Infinity;
  const r = CONTROL + T.FIRST_TOUCH_REACH;
  for (let j = 0; j < w.balls.length; j++) {
    const b = w.balls[j];
    if (b.owner !== null || b.z > T.FIRST_TOUCH_Z) continue;
    const dx = b.x - p.x, dy = b.y - p.y, d2 = dx * dx + dy * dy;
    if (d2 < r * r && d2 < bd) { bd = d2; best = j; }
  }
  return best;
}

function release(w: MBWorld, i: number, j: number): void {
  const p = w.players[i], b = w.balls[j];
  b.owner = null; p.noTouch = T.KICK_LOCK; p.kickTicks = T.KICK_ANIM;
  w.kicks += 1;
}

/** 보는 쪽 원뿔 안의 가장 좋은 사람(방향 먼저, 거리 다음 — 경기의 passTarget 과 같은 점수). 없으면 -1. */
function target(w: MBWorld, i: number, cone: number, minD: number): number {
  const p = w.players[i];
  let best = -1, bs = -Infinity;
  for (const q of w.players) {
    if (q.id === i) continue;
    const dx = q.x - p.x, dy = q.y - p.y, d = Math.sqrt(dx * dx + dy * dy);
    if (d < minD || d > T.PASS_MAX) continue;
    const cos = (dx * p.fx + dy * p.fy) / d;
    if (cos < cone) continue;
    const sc = cos * T.PASS_W_DIR - d * T.PASS_W_DIST;
    if (sc > bs) { bs = sc; best = q.id; }
  }
  return best;
}

/** 슛 — 보는 방향으로, 세기만큼. 보는 쪽에 골대가 있으면(어느 쪽이든) 골문 안쪽으로 조금 당긴다(경기와 같은 보정, 골키퍼 반대 구석은 없다). */
function shoot(w: MBWorld, perf: Perf, i: number, j: number, c: number): void {
  const p = w.players[i], b = w.balls[j];
  let ux = p.fx, uy = p.fy;
  const dir = ux >= 0 ? 1 : -1, gx = dir * HW;
  const tg = unit(gx - b.x, 0 - b.y, dir, 0);
  if (ux * tg.x + uy * tg.y > T.AIM_COS && ux * dir > 0.05) {
    const yCross = b.y + (uy * (gx - b.x)) / ux;
    const ty = clamp(yCross, -GW + T.AIM_INSET, GW - T.AIM_INSET);
    const want = unit(gx - b.x, ty - b.y, ux, uy);
    const u = unit(ux + (want.x - ux) * T.AIM_ASSIST, uy + (want.y - uy) * T.AIM_ASSIST, ux, uy);
    ux = u.x; uy = u.y;
  }
  const cc = clamp(c, 0, 1);
  const sp = (T.SHOT_MIN + (T.SHOT_MAX - T.SHOT_MIN) * cc) * perf.shot;
  b.vx = ux * sp; b.vy = uy * sp; b.vz = T.LOFT_MIN + (T.LOFT_MAX - T.LOFT_MIN) * cc * cc;
  release(w, i, j);
}

/** 땅볼 패스(through 면 더 멀리·빠르게) — 받을 사람 쪽으로, 닿을 때 남는 속도를 맞춘다(경기와 같은 계산). */
function pass(w: MBWorld, perf: Perf, i: number, j: number, through: boolean): void {
  const p = w.players[i], b = w.balls[j];
  const t = target(w, i, T.PASS_COS, T.PASS_MIN);
  const arrive = through ? T.THROUGH_ARRIVE : T.PASS_ARRIVE;
  let ux = p.fx, uy = p.fy, dist: number = through ? T.THROUGH_FREE_DIST : T.PASS_FREE_DIST;
  if (t >= 0) {
    const m = w.players[t];
    const ahead = through ? T.THROUGH_AHEAD : 0;
    const tx = clamp(m.x + p.fx * ahead, -HW + 0.5, HW - 0.5), ty = clamp(m.y + p.fy * ahead, -HH + 0.5, HH - 0.5);
    const u = unit(tx - b.x, ty - b.y, p.fx, p.fy);
    ux = u.x; uy = u.y;
    dist = Math.sqrt((tx - b.x) * (tx - b.x) + (ty - b.y) * (ty - b.y));
  }
  const err = (rand(w) - 0.5) * 2 * T.PASS_ERR * (2 - perf.pass);
  const e = unit(ux + (0 - uy) * err, uy + ux * err, ux, uy);
  const v0 = arrive + T.ROLL_DRAG * dist;
  b.z = BR; b.vx = e.x * v0; b.vy = e.y * v0; b.vz = 0;
  release(w, i, j);
}

/** 로빙 — 먼 사람(LOB_MIN 넘게)에게 띄워서, 없으면 모은 만큼 보는 쪽으로. */
function lob(w: MBWorld, perf: Perf, i: number, j: number, c: number): void {
  const p = w.players[i], b = w.balls[j];
  const t = target(w, i, T.LOB_COS, T.LOB_MIN);
  let tx: number, ty: number;
  if (t >= 0) { tx = w.players[t].x; ty = w.players[t].y; }
  else { const d0 = T.LOB_FREE_MIN + (T.LOB_FREE_MAX - T.LOB_FREE_MIN) * clamp(c, 0, 1); tx = b.x + p.fx * d0; ty = b.y + p.fy * d0; }
  tx = clamp(tx, -HW + 0.5, HW - 0.5); ty = clamp(ty, -HH + 0.5, HH - 0.5);
  const dx = tx - b.x, dy = ty - b.y, d = Math.sqrt(dx * dx + dy * dy);
  const u = unit(dx, dy, p.fx, p.fy);
  const err = (rand(w) - 0.5) * 2 * T.PASS_ERR * (2 - perf.pass);
  const e = unit(u.x + (0 - u.y) * err, u.y + u.x * err, u.x, u.y);
  const TT = T.LOB_T_BASE + d * T.LOB_T_PER_M;
  const vh = (d / TT) * (1 + T.AIR_DRAG * TT * 0.5);
  b.vx = e.x * vh; b.vy = e.y * vh; b.vz = (T.GRAVITY * TT) / 2;
  release(w, i, j);
}

/** 공끼리 — 구 둘이 겹치면 밀어내고 반발. */
function ballVsBall(a: MBBall, b: MBBall): void {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, m = BR * 2;
  const d2 = dx * dx + dy * dy + dz * dz;
  if (d2 >= m * m) return;
  const d = Math.sqrt(d2);
  const nx = d > 1e-6 ? dx / d : 1, ny = d > 1e-6 ? dy / d : 0, nz = d > 1e-6 ? dz / d : 0;
  const over = (m - d) / 2;
  a.x -= nx * over; a.y -= ny * over; a.z = Math.max(BR, a.z - nz * over);
  b.x += nx * over; b.y += ny * over; b.z = Math.max(BR, b.z + nz * over);
  const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny + (b.vz - a.vz) * nz;
  if (vn < 0) {
    const jj = (-(1 + BALL_BALL_E) * vn) / 2;
    a.vx -= jj * nx; a.vy -= jj * ny; a.vz -= jj * nz; b.vx += jj * nx; b.vy += jj * ny; b.vz += jj * nz;
  }
}

/** 아무도 안 가진 공 하나 — 잡기(공 없는 가장 가까운 사람)·몸에 맞기. 쪼갠 한 번마다. */
function touchFree(w: MBWorld, j: number): void {
  const b = w.balls[j];
  let pick = -1, pd = Infinity;
  for (let i = 0; i < w.players.length; i++) {
    const p = w.players[i];
    if (p.noTouch > 0) continue;
    const dx = b.x - p.x, dy = b.y - p.y, d2 = dx * dx + dy * dy;
    const rvx = b.vx - p.vx, rvy = b.vy - p.vy, rel2 = rvx * rvx + rvy * rvy + b.vz * b.vz;
    if (d2 < CONTROL * CONTROL && b.z < T.PICKUP_MAX_Z && rel2 < T.PICKUP_MAX_REL * T.PICKUP_MAX_REL && ballOf(w, i) < 0) {
      if (d2 < pd) { pd = d2; pick = i; }
      continue;
    }
    const min = PR + BR;
    if (b.z < PH && d2 < min * min) {
      const d = Math.sqrt(d2);
      const nx = d > 1e-6 ? dx / d : 1, ny = d > 1e-6 ? dy / d : 0;
      b.x = p.x + nx * min; b.y = p.y + ny * min;
      const vn = rvx * nx + rvy * ny;
      if (vn < 0) { b.vx -= (1 + T.BODY_E) * vn * nx; b.vy -= (1 + T.BODY_E) * vn * ny; }
    }
  }
  if (pick >= 0) { b.owner = pick; b.vz = 0; }
}

/** 남의 공에 몸으로 붙으면 — 빼앗거나 흘러나온다(공마다 한 틱에 한 번, 경기와 같은 확률·잠금). */
function steals(w: MBWorld, perfs: Perf[]): void {
  for (const b of w.balls) {
    if (b.owner === null || b.stealLock > 0) continue;
    const o = b.owner, op = w.players[o];
    for (let i = 0; i < w.players.length; i++) {
      if (i === o) continue;
      const q = w.players[i];
      if (q.noTouch > 0 || ballOf(w, i) >= 0) continue;
      const bx = b.x - q.x, by = b.y - q.y, px = op.x - q.x, py = op.y - q.y;
      const rb = PR + BR + T.STEAL_REACH, rp = PR * 2 + T.STEAL_REACH;
      if (bx * bx + by * by > rb * rb && px * px + py * py > rp * rp) continue;
      const win = T.STEAL_WIN * perfs[i].tackle / perfs[o].mass * (op.sprint ? 1.35 : 1);
      b.stealLock = T.STEAL_IMMUNE;
      op.noTouch = T.STEAL_LOSER_LOCK;
      if (rand(w) < win) b.owner = i;
      else {
        const u = unit(b.x - q.x, b.y - q.y, 1, 0);
        b.vx = u.x * T.STEAL_FREE_SPEED + op.vx * T.STEAL_FREE_CARRY; b.vy = u.y * T.STEAL_FREE_SPEED + op.vy * T.STEAL_FREE_CARRY; b.vz = T.STEAL_FREE_LIFT;
        b.owner = null; q.noTouch = T.STEAL_TACKLER_LOCK;
      }
      break;
    }
  }
}

/** 한 틱 — w 를 직접 바꾼다(부르는 쪽이 복사본을 넘긴다). perfs[i] = i 번 몸의 성능, inputs[i] = 입력. */
export function stepWorld(w: MBWorld, perfs: Perf[], inputs: Input[]): void {
  const n = w.players.length;
  const mass = perfs.map((p) => T.PLAYER_MASS * p.mass);
  for (const b of w.balls) if (b.stealLock > 0) b.stealLock -= 1;
  // 1) 입력 → 속도·보는 쪽·차기
  for (let i = 0; i < n; i++) {
    const p = w.players[i], perf = perfs[i], inp = inputs[i] ?? NO_INPUT;
    if (p.noTouch > 0) p.noTouch -= 1;
    if (p.kickTicks > 0) p.kickTicks -= 1;
    const own = ballOf(w, i);
    const ix = fin(inp.x), iy = fin(inp.y), il = Math.sqrt(ix * ix + iy * iy);
    p.sprint = !!inp.sprint && p.stamina > 0 && (p.sprint || p.stamina >= T.SPRINT_RESUME) && il > 0.15;
    p.stamina = p.sprint ? Math.max(0, p.stamina - T.STAMINA_DRAIN) : Math.min(1, p.stamina + T.STAMINA_GAIN);
    const mult = (own >= 0 ? T.CARRY_SPEED : 1) * (inp.shoot ? T.CHARGE_SPEED : 1) * (p.sprint ? T.SPRINT_SPEED : 1);
    steer(p, { gk: false, perf }, ix, iy, mult);
    const ffx = fin(inp.fx), ffy = fin(inp.fy), fl = Math.sqrt(ffx * ffx + ffy * ffy);
    const faced = inp.fx !== undefined && inp.fy !== undefined && fl > 0.5;
    if (faced) { p.fx = ffx / fl; p.fy = ffy / fl; }
    if (il > 0.15) {
      const dx = ix / il, dy = iy / il;
      if (own >= 0) {
        const sp2 = p.vx * p.vx + p.vy * p.vy, ls = p.sprint ? T.SPRINT_LOOSE_SPEED : T.LOOSE_SPEED;
        if (sp2 > ls * ls && dx * p.fx + dy * p.fy < T.LOOSE_COS && rand(w) < T.LOOSE_P * (2 - perf.control) * (p.sprint ? T.SPRINT_LOOSE : 1)) {
          const b = w.balls[own];
          b.vx = p.vx * T.LOOSE_KEEP; b.vy = p.vy * T.LOOSE_KEEP; b.vz = 0; b.owner = null; p.noTouch = T.LOOSE_LOCK;
        }
      }
      if (!faced) turnToward(p, dx, dy, ballOf(w, i) >= 0 ? T.TURN_RATE_BALL : T.TURN_RATE);
    }
    const shootNow = !!inp.shoot, passNow = !!inp.pass, throughNow = !!inp.through, lobNow = !!inp.lob;
    if (shootNow) p.charge = Math.min(T.CHARGE_TICKS, p.charge + 1);
    if (lobNow) p.lobTicks = Math.min(T.LOB_CHARGE, p.lobTicks + 1);
    if (p.shootHeld && !shootNow) { const j = kickable(w, i); if (j >= 0) shoot(w, perf, i, j, p.charge / T.CHARGE_TICKS); p.charge = 0; }
    else if (p.passHeld && !passNow) { const j = kickable(w, i); if (j >= 0) pass(w, perf, i, j, false); }
    else if (p.throughHeld && !throughNow) { const j = kickable(w, i); if (j >= 0) pass(w, perf, i, j, true); }
    else if (p.lobHeld && !lobNow) { const j = kickable(w, i); if (j >= 0) lob(w, perf, i, j, p.lobTicks / T.LOB_CHARGE); }
    if (!lobNow) p.lobTicks = 0;
    p.shootHeld = shootNow; p.passHeld = passNow; p.throughHeld = throughNow; p.lobHeld = lobNow;
  }
  // 2) 움직임과 충돌 — 한 틱을 쪼개서
  for (let k = 0; k < T.SUBSTEPS; k++) {
    for (const p of w.players) { p.x += p.vx * T.SUB_DT; p.y += p.vy * T.SUB_DT; }
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) collidePlayers(w.players[i], mass[i], w.players[j], mass[j]);
    for (const p of w.players) containPlayer(p);
    for (let j = 0; j < w.balls.length; j++) {
      const b = w.balls[j];
      if (b.owner !== null) continue;
      b.vz -= T.GRAVITY * T.SUB_DT;
      b.x += b.vx * T.SUB_DT; b.y += b.vy * T.SUB_DT; b.z += b.vz * T.SUB_DT;
      containBall(b);
      touchFree(w, j);
    }
    for (let a = 0; a < w.balls.length; a++) for (let c = a + 1; c < w.balls.length; c++) {
      if (w.balls[a].owner === null && w.balls[c].owner === null) ballVsBall(w.balls[a], w.balls[c]);
    }
  }
  // 3) 발밑 공 — 보는 쪽 앞으로 당겨 온다. 그다음 빼앗기. 나머지는 구르기·공기 감속.
  for (const b of w.balls) {
    if (b.owner !== null) {
      const p = w.players[b.owner], c = carrySpot(p);
      b.x += (c.x - b.x) * T.CARRY_PULL; b.y += (c.y - b.y) * T.CARRY_PULL;
      b.vx = p.vx; b.vy = p.vy; b.vz = 0; b.z = BR;
      containBall(b);
    } else {
      const onGround = b.z <= BR + 1e-6 && b.vz === 0;
      const keep = 1 - (onGround ? T.ROLL_DRAG : T.AIR_DRAG) * T.DT;
      b.vx *= keep; b.vy *= keep;
      if (!onGround) b.vz *= 1 - T.AIR_DRAG * T.DT;
      const sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy + b.vz * b.vz);
      if (sp > T.BALL_MAX_SPEED) { const m = T.BALL_MAX_SPEED / sp; b.vx *= m; b.vy *= m; b.vz *= m; }
      if (onGround && b.vx * b.vx + b.vy * b.vy < T.BALL_REST * T.BALL_REST) { b.vx = 0; b.vy = 0; }
    }
    if (!Number.isFinite(b.x + b.y + b.z + b.vx + b.vy + b.vz)) { b.x = 0; b.y = 0; b.z = BR; b.vx = 0; b.vy = 0; b.vz = 0; b.owner = null; }
  }
  steals(w, perfs);
  for (const p of w.players) {
    if (!Number.isFinite(p.x + p.y + p.vx + p.vy)) { p.x = 0; p.y = 0; p.vx = 0; p.vy = 0; }
    if (!Number.isFinite(p.fx + p.fy) || p.fx * p.fx + p.fy * p.fy < 0.5) { p.fx = 1; p.fy = 0; }
    containPlayer(p);
  }
}

/** 공 중심이 골라인을 넘었고 골문(폭·높이) 안 — 들어간 골대(+1 오른쪽, -1 왼쪽), 아니면 0(경기의 골 판정과 같다). */
export function goalSide(b: Ball): 1 | -1 | 0 {
  return Math.abs(b.x) > HW && Math.abs(b.y) < GW && b.z < PITCH3D.goalH ? (b.x > 0 ? 1 : -1) : 0;
}
