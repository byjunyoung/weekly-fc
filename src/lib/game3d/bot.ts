// src/lib/game3d/bot.ts — 3D 축구 시제품의 봇 입력(2026-11-07). 순수 함수: 같은 state 면 같은 입력.
// 스펙 §5 "필드 봇(자리 지키기·공 쫓기·패스·슛)과 골키퍼". 사람이 이길 수 있는 수준이어야 한다(2D 와 같은 목표).
//
// 필드 봇(편마다):
//   - 자리: 편성 자리(sim 의 formationSpot)가 공을 따라 앞뒤·옆으로 조금씩 움직인다. 우리 편이 공을 가지면 앞으로, 넓게.
//   - 공에 가장 가까운 한 명(사람 포함)이 공을 다툰다 — 사람이 더 가까우면 봇은 자리를 지킨다(사람 공을 빼앗아 가지 않게).
//   - 공을 가진 봇: 골대 쪽으로 몰고, 앞이 막히면 옆으로 비킨다. 사거리 안에서 골대를 보고 있으면 슛,
//     압박받거나 앞에 빈 동료가 있으면 패스. 사람 동료에게는 일부러 더 자주 준다("나도 공을 만져야 재밌다").
//   - 패스를 받을 봇은 공이 오는 길로 마중 간다.
// 골키퍼: 골대 앞 짧은 호 위에서 공을 따라 서고, 슛이 오면 반응 틱 뒤에 막으러 움직인다. 잡은 공은 잠깐 들고 있다 동료에게.
// 일부러 틀리게 하는 값(조준·머뭇거림·결정)은 틱과 id 를 섞은 정수 해시에서 나온다 — 난수 함수·삼각함수는 안 쓴다.
// 슛·패스는 "누름 → 뗌"이 필요한데 봇은 기억이 없다 — 상태의 charge·passHeld 를 보고 이어서 누르거나 뗀다.
import { attackDir, formationSpot, NO_INPUT, passTarget, PITCH3D, RULES3D, slotOf, type Input, type MatchConfig, type MatchState, type Side } from './sim.ts';

// ═══════════ 봇 조절 값 ═══════════
const HOME_FOLLOW_X = 0.42;   // 자리가 공의 x 를 따라가는 비율
const HOME_FOLLOW_Y = 0.25;   // 자리가 공의 y 를 따라가는 비율
const ATTACK_PUSH = 3.5;      // 우리 편이 공을 가지면 자리를 이만큼 앞으로
const SHOOT_RANGE = 19;       // 골대까지 이 안이면 슛을 생각한다
const SHOOT_COS = 0.62;       // 보는 방향이 골대 쪽과 이만큼 맞아야 슛
const SHOOT_TURN = 12;        // 골대까지 이 안이면 패스 대신 골대 쪽으로 돌아 슛
const PRESS_R = 2.4;          // 앞쪽 이 거리 안에 상대가 있으면 "압박받는다"
const OPEN_R = 2.6;           // 동료 둘레 이 안에 상대가 없으면 "비었다"
const AHEAD_GAIN = 3;         // 동료가 나보다 이만큼 더 앞이면 앞으로 주는 패스를 생각한다
const PASS_AIM_COS = 0.88;    // 패스를 누르기 전에 동료 쪽을 이만큼 보고 있어야 한다
const HUMAN_PASS_BONUS = 0.35;// 사람 동료에게 주는 쪽으로 기우는 정도(결정 제비에 더한다)
const DECIDE_HOLD = 36;       // 패스할까 말까 제비가 바뀌는 간격(틱)
const HESITATE_HOLD = 45;     // 머뭇거림 제비 간격
const HESITATE_P = 0.1;       // 머뭇거릴 확률
const HESITATE_SPEED = 0.4;   // 머뭇거릴 때 속도 배수
const AIM_ERR = 0.85;         // 슛 조준이 골문 가운데에서 빗나가는 폭(골문 반폭 비율)
const CHARGE_ERR = 0.15;      // 슛 세기 오차
const KEEPER_ARC = 1.3;       // 골키퍼가 서는 호(골대 가운데에서의 거리)
const KEEPER_REACT = 12;      // 슛을 보고 움직이기까지 틱(0.15초) — 이게 작을수록 골키퍼가 세다
const KEEPER_RUSH = 4.5;      // 골대에서 이 안의 느린 공은 골키퍼가 나와 줍는다
const KEEPER_PASS_WAIT = 90;  // 공을 들고 이만큼 지나도 줄 사람이 없으면 앞으로 멀리 찬다
// ═══════════════════════════════

const { HW, HH, goalHalfW } = PITCH3D;

/** (a, b) → -1..1. 정수 해시라 환경이 달라도 같다(2D 봇과 같은 방식). */
function noise(a: number, b: number): number {
  let h = Math.imul(a + 1, 0x9e3779b1) ^ Math.imul(b + 7, 0x85ebca6b);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
  return ((h >>> 0) / 4294967295) * 2 - 1;
}
const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** 목표 지점으로 가는 입력. slow 안에서는 속도를 줄여 지나치지 않게. */
function moveTo(mx: number, my: number, tx: number, ty: number, slow: number): { x: number; y: number } {
  const dx = tx - mx, dy = ty - my;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d < 0.08) return { x: 0, y: 0 };
  const m = slow > 0 ? Math.min(1, d / slow) : 1;
  return { x: (dx / d) * m, y: (dy / d) * m };
}
const inp = (v: { x: number; y: number }, extra: Partial<Input> = {}): Input => ({ x: v.x, y: v.y, shoot: false, pass: false, ...extra });

/** 편성 자리가 공과 공 가진 편을 따라 움직인 곳. */
function homeSpot(state: MatchState, config: MatchConfig, id: number): { x: number; y: number } {
  const mp = config.players[id];
  const dir = attackDir(mp.side);
  const f = formationSpot(slotOf(config, id), mp.side);
  const ball = state.ball;
  const ours = state.owner !== null && config.players[state.owner].side === mp.side;
  let x = f.x + ball.x * HOME_FOLLOW_X + (ours ? dir * ATTACK_PUSH : 0);
  let y = f.y * (ours ? 1.15 : 0.9) + ball.y * HOME_FOLLOW_Y;
  x = clamp(x, -HW + 2.5, HW - 2.5); y = clamp(y, -HH + 1.2, HH - 1.2);
  return { x, y };
}

/** 우리 편(골키퍼 빼고) 중 공에 가장 가까운 사람. 같으면 id 가 작은 쪽. */
function nearestToBall(state: MatchState, config: MatchConfig, side: Side): number {
  let best = -1, bd = Infinity;
  for (const q of config.players) {
    if (q.side !== side || q.gk) continue;
    const p = state.players[q.id];
    const dx = p.x - state.ball.x, dy = p.y - state.ball.y, d2 = dx * dx + dy * dy;
    if (d2 < bd) { bd = d2; best = q.id; }
  }
  return best;
}

/** (x,y) 둘레 r 안 상대 중 가장 가까운 거리. */
function nearestOpp(state: MatchState, config: MatchConfig, side: Side, x: number, y: number): number {
  let bd = Infinity;
  for (const q of config.players) {
    if (q.side === side) continue;
    const p = state.players[q.id];
    const d2 = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y);
    if (d2 < bd) bd = d2;
  }
  return Math.sqrt(bd);
}

export function botInput(state: MatchState, config: MatchConfig, id: number): Input {
  const mp = config.players[id], me = state.players[id];
  if (!mp || !me || (state.phase !== 'kickoff' && state.phase !== 'play')) return { ...NO_INPUT };
  if (mp.gk) return keeperInput(state, config, id);
  const hes = noise(id, Math.floor(state.tick / HESITATE_HOLD) + 1000) < -1 + 2 * HESITATE_P ? HESITATE_SPEED : 1;
  const scale = (v: { x: number; y: number }): { x: number; y: number } => ({ x: v.x * hes, y: v.y * hes });
  const ball = state.ball;

  if (state.owner === id) return carrierInput(state, config, id);

  // 킥오프에서 차지 않는 편은 자기 자리
  if (state.phase === 'kickoff' && state.kickoffSide !== mp.side) {
    const f = formationSpot(slotOf(config, id), mp.side);
    return inp(moveTo(me.x, me.y, f.x, f.y, 1.5));
  }

  // 나에게 오는 패스 — 공이 오는 길로 마중
  if (state.passTo === id && state.owner === null) {
    const t = 0.25;
    return inp(moveTo(me.x, me.y, ball.x + ball.vx * t, ball.y + ball.vy * t, 0.6));
  }

  const ownerSide = state.owner === null ? null : config.players[state.owner].side;
  const chaser = nearestToBall(state, config, mp.side);
  if (ownerSide !== mp.side && chaser === id) {
    // 공을 다툰다 — 흘러가는 공은 조금 앞을, 상대가 가진 공은 그 공에 몸을 붙인다
    const lead = state.owner === null ? 0.2 : 0.05;
    return inp(scale(moveTo(me.x, me.y, ball.x + ball.vx * lead, ball.y + ball.vy * lead, 0)));
  }

  // 자리 지키기 — 우리 편이 공을 가졌으면 공 가진 사람과 겹치지 않는 쪽으로 길을 연다
  const h = homeSpot(state, config, id);
  if (ownerSide === mp.side && state.owner !== null) {
    const c = state.players[state.owner];
    const dx = h.x - c.x, dy = h.y - c.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < 4) { h.x += (d > 1e-3 ? dx / d : 0) * (4 - d); h.y += (d > 1e-3 ? dy / d : 1) * (4 - d); }
  }
  return inp(scale(moveTo(me.x, me.y, clamp(h.x, -HW + 1, HW - 1), clamp(h.y, -HH + 1, HH - 1), 2)));
}

/** 공 가진 필드 봇. */
function carrierInput(state: MatchState, config: MatchConfig, id: number): Input {
  const mp = config.players[id], me = state.players[id];
  const dir = attackDir(mp.side);
  const gx = dir * HW, gy = noise(id, Math.floor(state.tick / 60) + 77) * AIM_ERR * goalHalfW;
  const tgx = gx - me.x, tgy = gy - me.y;
  const dGoal = Math.sqrt(tgx * tgx + tgy * tgy);
  const ux = tgx / dGoal, uy = tgy / dGoal;
  const facingGoal = me.fx * ux + me.fy * uy;

  // 슛 — 한번 모으기 시작했으면 정한 세기까지 이어서 누르고, 닿으면 뗀다(떼는 순간 나간다)
  const want = clamp(0.35 + dGoal / 22 + noise(id, state.tick >> 5) * CHARGE_ERR, 0.25, 0.97);
  if (me.shootHeld) {
    const c = me.charge / RULES3D.chargeTicks;
    return inp({ x: ux * 0.5, y: uy * 0.5 }, { shoot: c < want });
  }
  if (dGoal < SHOOT_RANGE && facingGoal > SHOOT_COS) return inp({ x: ux, y: uy }, { shoot: true });
  // 골대 가까이(SHOOT_TURN 안)면 패스를 생각하지 않고 골대 쪽으로 몸을 돌린다 — 2026-11-07 "골이 너무 안 난다"(봇이 앞에서 공을 돌리기만 했다)
  if (dGoal < SHOOT_TURN) return inp({ x: ux, y: uy });

  // 패스 — 눌러 둔 상태면 뗀다
  if (me.passHeld) return inp({ x: me.fx * 0.3, y: me.fy * 0.3 });
  const pressured = nearestOpp(state, config, mp.side, me.x + me.fx * 1.2, me.y + me.fy * 1.2) < PRESS_R;
  const mate = bestMate(state, config, id);
  if (mate >= 0) {
    const m = state.players[mate];
    const human = !config.players[mate].bot;
    const roll = noise(id * 31 + mate, Math.floor(state.tick / DECIDE_HOLD)) + (human ? HUMAN_PASS_BONUS : 0);
    const ahead = (m.x - me.x) * dir > AHEAD_GAIN;
    const ownHalfDeep = me.x * dir < -HW * 0.45;
    const go = (pressured && roll > -0.7) || (ahead && roll > 0.35) || (human && roll > 0.6) || (ownHalfDeep && roll > 0);
    if (go) {
      const dx = m.x - me.x, dy = m.y - me.y, d = Math.sqrt(dx * dx + dy * dy);
      const cos = (dx * me.fx + dy * me.fy) / d;
      // 동료를 본다 — 충분히 보고 있고, 그 방향에서 sim 이 고를 사람이 이 동료면 누른다
      if (cos > PASS_AIM_COS && passTarget(state, config, id) === mate) return inp({ x: dx / d * 0.4, y: dy / d * 0.4 }, { pass: true });
      return inp({ x: dx / d * 0.5, y: dy / d * 0.5 });
    }
  }

  // 드리블 — 골대 쪽으로, 앞을 막은 상대는 옆으로 비킨다
  let mx = ux, my = uy;
  let blockD = Infinity, bx = 0;
  for (const q of config.players) {
    if (q.side === mp.side) continue;
    const o = state.players[q.id];
    const ox = o.x - me.x, oy = o.y - me.y, along = ox * ux + oy * uy;
    if (along < 0 || along > 3.2) continue;
    const lat = ox * (0 - uy) + oy * ux;
    if (Math.abs(lat) > 1.4) continue;
    if (along < blockD) { blockD = along; bx = lat; }
  }
  if (blockD < Infinity) {
    const side = bx > 0 ? -1 : bx < 0 ? 1 : (id % 2 === 0 ? 1 : -1);   // 상대가 왼쪽이면 오른쪽으로
    mx += (0 - uy) * side * 1.1; my += ux * side * 1.1;
  }
  // 옆 벽에 붙으면 안쪽으로
  if (Math.abs(me.y) > HH - 1.5) my -= Math.sign(me.y) * 0.8;
  const l = Math.sqrt(mx * mx + my * my) || 1;
  return inp({ x: mx / l, y: my / l });
}

/** 패스할 만한 동료 — 비었고(둘레에 상대 없음), 너무 가깝거나 멀지 않은 사람 중 앞쪽·사람 우선. 없으면 -1. */
function bestMate(state: MatchState, config: MatchConfig, id: number): number {
  const mp = config.players[id], me = state.players[id], dir = attackDir(mp.side);
  let best = -1, bs = -Infinity;
  for (const q of config.players) {
    if (q.side !== mp.side || q.id === id || q.gk) continue;
    const m = state.players[q.id];
    const dx = m.x - me.x, dy = m.y - me.y, d = Math.sqrt(dx * dx + dy * dy);
    if (d < 3 || d > RULES3D.passMax - 2) continue;
    const open = nearestOpp(state, config, mp.side, m.x, m.y);
    if (open < OPEN_R) continue;
    // 가는 길 가운데에 상대가 서 있으면 뺀다
    if (nearestOpp(state, config, mp.side, me.x + dx * 0.5, me.y + dy * 0.5) < 1.2) continue;
    const score = (m.x - me.x) * dir * 0.5 + open * 0.3 - d * 0.1 + (q.bot ? 0 : 2);
    if (score > bs) { bs = score; best = q.id; }
  }
  return best;
}

/** 골키퍼 봇. */
function keeperInput(state: MatchState, config: MatchConfig, id: number): Input {
  const mp = config.players[id], me = state.players[id], ball = state.ball;
  const dir = attackDir(mp.side);
  const gx = 0 - dir * HW;   // 우리 골라인

  // 공을 들고 있다 — 들고 있는 동안은 경기장 쪽을 보고 서 있다가, 동료를 보고 패스(없으면 멀리 찬다)
  if (state.owner === id) {
    if (me.passHeld) return inp({ x: 0, y: 0 });
    if (me.shootHeld) return inp({ x: dir * 0.3, y: 0 }, { shoot: me.charge / RULES3D.chargeTicks < 0.75 });
    if (me.hold > 0) return inp({ x: dir * 0.2, y: 0 });
    const mate = bestMate(state, config, id);
    if (mate >= 0) {
      const m = state.players[mate];
      const dx = m.x - me.x, dy = m.y - me.y, d = Math.sqrt(dx * dx + dy * dy);
      const cos = (dx * me.fx + dy * me.fy) / d;
      if (cos > PASS_AIM_COS && passTarget(state, config, id) === mate) return inp({ x: 0, y: 0 }, { pass: true });
      return inp({ x: dx / d * 0.3, y: dy / d * 0.3 });
    }
    if (state.tick % KEEPER_PASS_WAIT === 0 || me.fx * dir > 0.9) return inp({ x: dir * 0.3, y: 0 }, { shoot: true });
    return inp({ x: dir * 0.3, y: 0 });
  }

  // 슛이 온다 — 반응 틱이 지난 뒤, 골라인을 지날 곳으로
  const k = state.lastKick;
  const coming = state.owner === null && ball.vx * dir < -4 && k !== null && config.players[k.by]?.side !== mp.side;
  if (coming && state.tick - k.tick >= KEEPER_REACT) {
    const lineX = gx + dir * 0.7;
    const t = (lineX - ball.x) / ball.vx;
    if (t > 0) {
      const py = clamp(ball.y + ball.vy * t, -goalHalfW - 0.4, goalHalfW + 0.4);
      return inp(moveTo(me.x, me.y, lineX, py, 0));
    }
  }

  // 골대 가까운 느린 공은 나와 줍는다
  const bdx = ball.x - gx, bdy = ball.y;
  const bd = Math.sqrt(bdx * bdx + bdy * bdy);
  const slow = ball.vx * ball.vx + ball.vy * ball.vy < 36;
  if (state.owner === null && bd < KEEPER_RUSH && slow) return inp(moveTo(me.x, me.y, ball.x, ball.y, 0));

  // 호 위에서 공을 따라 선다
  const ux = bd > 1e-3 ? bdx / bd : dir, uy = bd > 1e-3 ? bdy / bd : 0;
  const tx = gx + ux * KEEPER_ARC;
  const ty = clamp(uy * KEEPER_ARC + ball.y * 0.12, -(goalHalfW - 0.3), goalHalfW - 0.3);
  const v = moveTo(me.x, me.y, (tx - gx) * dir < 0.5 ? gx + dir * 0.5 : tx, ty, 0.8);
  return inp(v);
}
