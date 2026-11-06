// src/lib/game/bot.ts — 봇의 입력(2026-11-06). 순수 함수: 같은 state 면 같은 입력.
// 스펙 §4: "공을 쫓고, 공 뒤로 돌아 들어가 상대 골대 쪽으로 차고, 한 명은 뒤에 남는다. 사람이 이길 수 있는 수준."
//
// 역할(편마다):
//   - 가장 뒤 칸(slot 0, 한 편이 둘 이상일 때) = 수비. 공이 자기 진영 3분의 1 안에 있을 때만 공을 다툰다.
//   - 나머지 중 공에 가장 가까운 한 명 = 공격. 사람이 더 가까우면 봇은 받쳐 준다.
//   - 그 밖 = 받쳐 주기. 공 앞쪽 옆자리에 서서 두 명이 한 공에 몰리지 않게 한다.
// 일부러 틀리게 하는 값(조준 오차·머뭇거림)은 틱과 id 를 섞은 해시에서 나온다 — 난수 함수는 안 쓴다.
// 값은 40~50틱(0.7초 안팎) 동안 유지돼 떨지 않는다.
//
// 경기장 크기(2026-11-07 "최대 인원 같은거 헥스볼처럼 자유롭게 맵 크기도 크기별로 하고"): 아래 거리 값은 보통 경기장(1200×720)에서 잡은 것이고,
// 그 경기의 경기장에 비례해 늘인다(kx = 반가로/600, ky = 반세로/360). 한 편 5~6명이어도 역할은 셋 그대로 —
// 가장 뒤 하나는 남고, 공에 가장 가까운 하나가 공격하고, 나머지는 순번마다 다른 자리(앞뒤·좌우가 엇갈리게)에서 받친다.
import { formationSpot, NO_INPUT, PITCH, pitchOf, type Input, type MatchConfig, type MatchState, type Pitch } from './sim.ts';

// ═══════════ 봇 난이도 조절 값 ═══════════
/** 골을 겨냥할 때 세로로 빗나가는 최대 폭(골문 반폭에 대한 비율). 보통 경기장 반폭 100 에서 60 — 가끔 기둥 쪽으로 간다. */
const AIM_ERR = 0.6;
/** 조준 오차가 바뀌는 간격(틱). */
const AIM_HOLD = 50;
/** 머뭇거림: 이 간격(틱)마다 제비를 뽑아 HESITATE_P 확률이면 그 동안 속도가 HESITATE_SPEED 배가 된다. */
const HESITATE_HOLD = 45;
const HESITATE_P = 0.12;
const HESITATE_SPEED = 0.35;
/** 공 뒤로 돌아 들어갈 때 공 중심에서 이만큼 뒤(공을 밀기 시작할 자리). */
const BEHIND_GAP = 66;
/** 공 중심보다 이만큼 이상 뒤에 있어야 "공 뒤에 섰다"고 본다(닿는 거리보다 작게 — 붙은 순간에도 뒤에서 찬다). */
const BEHIND_MIN = 20;
/** 차기 전에 공-골 방향과 몸-공 방향이 이 코사인 이상 맞아야 한다(0.9 ≈ 25도). */
const ALIGN_COS = 0.9;
/** 자기 진영 3분의 1(공의 진행 좌표가 반가로의 -1/3 보다 뒤) 안에서만 수비도 공을 다툰다. */
const OWN_THIRD = -1 / 3;
// ═══════════════════════════════════════

// 몸 크기는 모든 경기장에서 같다(PITCH 는 그것만 읽는다).
const R_SUM = PITCH.playerR + PITCH.ballR;
const REACH = R_SUM + 6;   // 킥 닿는 거리(sim 의 KICK_REACH 6 과 같은 거리 — 닿을 때만 누른다)

/** (a, b) → -1..1. 정수 해시라 환경이 달라도 같다. */
function noise(a: number, b: number): number {
  let h = Math.imul(a + 1, 0x9e3779b1) ^ Math.imul(b + 7, 0x85ebca6b);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
  return ((h >>> 0) / 4294967295) * 2 - 1;
}

function clamp(v: number, lo: number, hi: number): number { return v < lo ? lo : v > hi ? hi : v; }

/** 목표 지점으로 가는 입력. 가까워지면 속도를 줄여 지나치지 않게(slow = 줄이기 시작하는 거리). */
function moveTo(mx: number, my: number, tx: number, ty: number, slow: number): { x: number; y: number } {
  const dx = tx - mx, dy = ty - my;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d < 2) return { x: 0, y: 0 };
  const m = slow > 0 ? Math.min(1, d / slow) : 1;
  return { x: (dx / d) * m, y: (dy / d) * m };
}

export function botInput(state: MatchState, config: MatchConfig, id: number): Input {
  const mp = config.players[id], me = state.players[id];
  if (!mp || !me || (state.phase !== 'kickoff' && state.phase !== 'play')) return { ...NO_INPUT };
  const dir = mp.side === 0 ? 1 : -1;   // 공격 방향(x 부호)
  const ball = state.ball;
  const pitch = pitchOf(config.field);
  const HW = pitch.w / 2, HH = pitch.h / 2, kx = HW / 600, ky = HH / 360;
  const mates = config.players.filter((q) => q.side === mp.side);
  const slot = mates.findIndex((q) => q.id === id);
  const isKeeper = mates.length >= 2 && slot === 0;
  const ballProg = dir * ball.x;                 // 내 편 기준 공의 진행 위치(-HW = 우리 골대 쪽 끝)
  const inOwnThird = ballProg < OWN_THIRD * HW;

  // 킥오프에서 공을 차는 편이 아니면 제자리(자기 자리)를 지킨다 — 공을 건드릴 수도 없다.
  if (state.phase === 'kickoff' && state.kickoffSide !== mp.side) {
    const f = formationSpot(config.field, mates.length, slot, mp.side);
    return { ...moveTo(me.x, me.y, f.x, f.y, 40), kick: false };
  }

  // 공을 다툴 수 있는 사람들 중 공에 가장 가까운 한 명이 공격수. 같으면 id 가 작은 쪽.
  const contenders = mates.filter((q) => !(mates.length >= 2 && q.id === mates[0].id && !inOwnThird));
  let attackerId = -1, best = Infinity;
  for (const q of contenders) {
    const b = state.players[q.id];
    const dx = b.x - ball.x, dy = b.y - ball.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < best) { best = d2; attackerId = q.id; }
  }

  const tick = state.tick;
  const hesitate = noise(id, Math.floor(tick / HESITATE_HOLD) + 1000) < -1 + 2 * HESITATE_P ? HESITATE_SPEED : 1;

  if (attackerId === id) return attack(state, id, dir, ballProg, hesitate, pitch);

  if (isKeeper) {
    // 공과 우리 골대 사이에 선다. 공이 멀수록 앞으로 나오되 자기 진영(보통 경기장 -130 이하)을 넘지 않는다.
    const gp = Math.min(-130 * kx, -490 * kx + 0.3 * (ballProg + HW));
    const gy = clamp(ball.y * 0.4, -(pitch.goalW / 2 - 30), pitch.goalW / 2 - 30);
    return { ...scale(moveTo(me.x, me.y, dir * gp, gy, 60), hesitate), kick: false };
  }

  // 받쳐 주기 — 공격수를 뺀 계약자들 사이의 순번으로 자리를 달리해 겹치지 않게.
  const supporters = contenders.filter((q) => q.id !== attackerId);
  const k = Math.max(0, supporters.findIndex((q) => q.id === id));
  const sign = (k % 2 === 0 ? 1 : -1) * (ball.y > 0 ? -1 : 1);
  // 순번 k 가 커질수록 한 칸 뒤·한 칸 바깥 — 5~6명이어도 받치는 사람이 같은 점에 몰리지 않는다(k 짝·홀로 좌우가 갈린다).
  const sp = clamp(ballProg + (160 - 60 * k) * kx, -380 * kx, 460 * kx);
  const sy = clamp(sign * (190 + 40 * k) * ky + ball.y * 0.3, -HH + 60, HH - 60);
  return { ...scale(moveTo(me.x, me.y, dir * sp, sy, 80), hesitate), kick: false };
}

function scale(v: { x: number; y: number }, m: number): { x: number; y: number } { return { x: v.x * m, y: v.y * m }; }

/** 공격수: 공 → 상대 골대 선 위에서 공 뒤로 돌아 들어간 뒤 밀고 찬다. */
function attack(state: MatchState, id: number, dir: number, ballProg: number, hesitate: number, pitch: Pitch): Input {
  const me = state.players[id], ball = state.ball;
  const HW = pitch.w / 2, HH = pitch.h / 2;
  // 조준점: 상대 골문 가운데에서 세로로 조금 빗나가게(틱·id 에서 나온 값, 일정 시간 유지)
  const gx = dir * HW, gy = noise(id, Math.floor(state.tick / AIM_HOLD)) * AIM_ERR * (pitch.goalW / 2);
  let dx = gx - ball.x, dy = gy - ball.y;
  const dl = Math.sqrt(dx * dx + dy * dy) || 1;
  dx /= dl; dy /= dl;                                     // 공 → 골 단위벡터 d
  const px = -dy, py = dx;                                 // d 의 수직
  const rx = me.x - ball.x, ry = me.y - ball.y;
  const dist = Math.sqrt(rx * rx + ry * ry);
  const along = rx * dx + ry * dy;                         // 음수 = 공 뒤(골 반대쪽)
  const lateral = rx * px + ry * py;

  let tx: number, ty: number;
  let kick = false;
  const alignedLat = 26 + 0.12 * Math.abs(along);
  if (along < -BEHIND_MIN && Math.abs(lateral) < alignedLat) {
    // 공 뒤에서 정렬됨 — 공을 지나쳐 밀고 들어간다
    tx = ball.x + dx * 20; ty = ball.y + dy * 20;
    if (dist > 0) {
      const cos = (-rx * dx + -ry * dy) / dist;            // 몸→공 방향과 공→골 방향의 코사인
      kick = dist <= REACH && cos >= ALIGN_COS;
    }
  } else if (along < -BEHIND_MIN) {
    tx = ball.x - dx * BEHIND_GAP; ty = ball.y - dy * BEHIND_GAP;   // 공 뒤 자리로
  } else {
    // 공 옆이나 앞 — 공을 가로지르지 않고 옆으로 돌아 나간다
    const sg = Math.abs(lateral) < 4 ? (id % 2 === 0 ? 1 : -1) : lateral > 0 ? 1 : -1;
    tx = ball.x + px * sg * (R_SUM + 36) - dx * 30; ty = ball.y + py * sg * (R_SUM + 36) - dy * 30;
  }

  // 걷어내기: 우리 골대 가까운 공은 방향이 맞지 않아도 (우리 골대 쪽만 아니면) 닿는 즉시 찬다.
  if (!kick && ballProg < -0.55 * HW && dist > 0 && dist <= REACH) {   // 보통 경기장 -330
    const towardAttack = (-rx / dist) * dir;                // 몸→공이 상대 골대 쪽이면 +
    if (towardAttack > -0.3) kick = true;
  }

  // 경기장 안(선수가 갈 수 있는 곳)으로 목표를 자른다
  // 선 밖 여백까지 — 벽에 붙은 공 뒤로 돌아 들어갈 수 있다.
  tx = clamp(tx, -HW - pitch.marginX + pitch.playerR, HW + pitch.marginX - pitch.playerR);
  ty = clamp(ty, -HH - pitch.marginY + pitch.playerR, HH + pitch.marginY - pitch.playerR);
  const m = moveTo(me.x, me.y, tx, ty, 0);
  // 킥은 뗐다 눌러야 다시 나간다 — 방금 찼으면(쿨다운 중) 손을 뗀다.
  if (me.kickCooldown > 0) kick = false;
  return { x: m.x * hesitate, y: m.y * hesitate, kick };
}
