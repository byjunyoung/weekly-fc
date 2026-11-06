// src/lib/game/bot.ts — 봇의 입력(2026-11-06, 2026-11-07 다시 설계). 순수 함수: 같은 state 면 같은 입력.
//
// 2026-11-07 "봇들이 패스 슛 개념이 너무 없는듯" — 처음 봇은 공에 가장 가까운 하나가 공 뒤로 돌아 골 쪽으로 밀기만 했다.
// 실측(3대3, 3분 12경기 평균): 찬 공을 같은 편이 받은 것 3.2번, 압박하며 찬 공은 거의 다 상대에게. 그래서 판단을 넷으로 나눴다
// (표와 근거: .superpowers/sdd/game/report-bots.md).
//   1) 공 가진 봇 — 매 틱 슛·패스·몰기 중 하나를 고른다. 골문 길이 열려 있고 사정거리 안이면 슛(수비가 먼 쪽 구석),
//      더 앞의 같은 편(사람 포함)이 열려 있거나 내가 압박받으면 패스(받는 사람이 움직이는 만큼 앞에, 또는 그 앞 빈 곳에),
//      아니면 빈 쪽으로 몬다(앞에 선 수비 쪽으로는 안 몬다). 우리 골문 앞에서 막히면 바깥 앞으로 걷어낸다.
//      돌아 설 시간보다 상대가 먼저 닿을 방향은 고르지 않는다 — 몰다가 60도 안쪽은 몰면서 꺾어 찬다.
//   2) 공 없는 같은 편 — 공에는 한 명만 간다. 나머지는 폭을 나눠 공보다 앞·옆에 서서 패스 길을 열고, 상대 그림자에 숨지 않는다.
//      나에게 굴러오는 공은 기다리지 않고 공 길로 마중 나가 몸으로 받는다.
//   3) 수비 — 가장 뒤(slot 0)는 공과 우리 골대 사이에 남는다(우리가 공을 가지면 조금 올라와 뒤로 받아 준다, 잡으면 내준다).
//      한 명이 골대 쪽에서 버티며 붙고(가끔 발을 뻗어 옆으로 찔러 낸다), 나머지는 위험한 상대를 하나씩 맡는다 —
//      골대 가까운 상대는 바짝, 먼 상대는 물러나 그 사이를 지킨다.
//   4) 사람이 이길 수 있게 — 늦게 출발하고(REACT_TICKS), 가끔 머뭇거리고, 조준이 빗나가고, 같은 편을 가끔 못 본다.
//
// 조준은 "어디에 서서 차느냐" 다. sim 의 킥은 몸 중심 → 공 중심 방향으로 정해진 속도를 더한다. 그래서
//   - 원하는 방향 k 의 반대편(공 − k·거리)에 서고,
//   - 공이 이미 굴러가면 그 속도에 킥이 더해지니 k 를 보정하고(아래 kickDir),
//   - 킥은 닿는 거리 안에서 지금의 몸→공 방향이 k 와 맞을 때만 누른다. sim 은 움직이기 전 위치로 킥을 계산하므로
//     누르는 순간의 방향이 곧 공이 나가는 방향이다(미리 누르면 장전 중 0.7배로 느려지기만 한다).
//
// 기억이 없다 — 틱마다 상태만 보고 다시 정한다. 떨지 않게 하는 건 상태 쪽이다:
//   - "누가 공에 가나" 는 몸의 지금 속도를 반영한 도착 시간으로 고른다. 공 쪽으로 뛰기 시작한 사람이 더 빨라지므로 바뀌지 않는다.
//   - 슛·패스·몰기 후보에는 "지금 이미 그 방향으로 줄 서 있는 정도" 만큼 덤을 준다 — 한 번 고른 것이 스스로 굳는다.
//   - 받쳐 주는 자리는 지금 세로 순서대로 폭을 나눠 준다(서로 엇갈려 지나가지 않는다).
// 일부러 틀리게 하는 값(조준 오차·머뭇거림·패스 볼 시야)은 틱과 id 를 섞은 해시에서 나온다 — 난수 함수는 안 쓴다.
//
// 경기장 크기: 자리(폭·앞뒤)는 그 경기의 경기장에 비례해 늘인다(kx = 반가로/600, ky = 반세로/360).
// 몸·공·킥 세기는 모든 크기에서 같으므로 패스 거리·닿는 거리는 늘이지 않는다(슛 사정거리만 골문이 넓은 만큼 조금).
// 삼각함수·hypot·pow·exp 를 쓰지 않는다(방장과 손님이 다른 엔진이어도 같은 입력이 나오게) — sqrt 와 사칙연산만.
import { formationSpot, NO_INPUT, PITCH, pitchOf, TICK_HZ, type Input, type MatchConfig, type MatchState, type Pitch } from './sim.ts';

// ═══════════ 봇 난이도 조절 값 (사람이 이기기 쉽게/어렵게는 여기만) ═══════════
/** 슛 조준 오차 — 고른 구석에서 세로로 빗나가는 최대 폭(골문 반폭에 대한 비율). 크면 기둥·옆그물이 잦다. */
const AIM_ERR = 0.45;
/** 패스 조준 오차 — 패스 거리 1 당 옆으로 빗나가는 최대 폭. 0.07 이면 300 거리에서 ±21. */
const PASS_ERR = 0.07;
/** 오차·시야가 바뀌는 간격(틱). */
const AIM_HOLD = 50;
/** 머뭇거림: 이 간격(틱)마다 제비를 뽑아 HESITATE_P 확률이면 그 동안 속도가 HESITATE_SPEED 배가 된다. */
const HESITATE_HOLD = 45;
const HESITATE_P = 0.18;
const HESITATE_SPEED = 0.35;
/** 반응 늦음(틱) — 공에 닿는 시간을 이만큼 늦게 잡고(늦게 출발), 압박할 땐 공이 이만큼 전에 있던 자리를 본다(10틱 ≈ 0.17초).
 *  크면 사람이 공을 빼기 쉽다.
 *  6 → 10, 머뭇거림 0.12 → 0.18 로 올린 값에서 옛 봇(사람이 이기던 수준)과 1대1 12경기 62:72 — 그보다 세지 않게 맞췄다. */
const REACT_TICKS = 10;
/** 같은 편 하나하나를 "본" 확률(AIM_HOLD 마다 새로 뽑는다). 못 본 같은 편에겐 그동안 패스하지 않는다. */
const VISION_P = 0.85;
/** 상대가 공 길을 막으러 움직이는 비율(최고 속도 대비). 크면 봇이 조심스럽게(덜) 패스·슛한다. */
const LANE_REACT = 0.55;
/** 슛에서는 이만큼만 본다 — 골문 앞 수비는 늘 막을 수 있어 보이니 덜 조심해야 슛이 나온다. */
const SHOT_REACT = 0.2;
/** 슛 길이 이만큼까지 막혀 보여도 찬다(가까울수록 SHOT_RISK_NEAR 까지). 크면 무리한 슛이 는다. */
const SHOT_RISK = 30, SHOT_RISK_NEAR = 70, NEAR_GOAL = 260;
/** 슛 사정거리(골문 가운데까지, 보통 경기장 기준 — 큰 경기장은 decide 에서 조금 늘인다). 420 이면 골문에서도 공이 초당 230 은 된다. */
const SHOOT_RANGE = 420;
/** 패스 거리 범위. 너무 가까우면 받는 쪽이 못 다루고, 멀면 공이 서 버린다. */
const PASS_MIN = 90, PASS_MAX = 600;
/** 상대가 공에서 이 거리 안이면 "압박받는다". */
const PRESSURE_R = 95;
/** 줄 서 있는 후보에 주는 덤(점수) — 고른 판단이 틱마다 뒤집히지 않게. */
const COMMIT_BONUS = 60;
/** 가장 뒤 봇이 공을 다투러 나올 때의 벌점(틱). 우리 3분의 1 안이면 0, 우리 진영이면 이만큼 더 가까워야, 상대 진영이면 안 나온다. */
const KEEPER_PEN = 20;
/** 맡은 상대를 보는 늦음(초)과 그 상대와 우리 골대 사이에 서는 거리. 늦음이 크고 거리가 멀수록 패스가 잘 들어간다. */
const MARK_LAG = 0.3, MARK_GAP = 60;
/** 우리 골대에서 경기장 길이의 절반보다 먼 상대는 늦게(초) 보고, 골대까지 거리의 이 비율만큼 물러나 막는다. */
const MARK_LAG_FAR = 0.5, MARK_DROP = 0.3;
/** 무작정 걷어내도 되는 우리 골문 앞(골대 가운데에서 반가로의 이 비율 안). 넓으면 공이 자꾸 상대에게 간다. */
const DANGER_R = 0.45;
// ═══════════════════════════════════════════════════════════════

const DT = 1 / TICK_HZ;
// 몸 크기는 모든 경기장에서 같다(PITCH 는 그것만 읽는다).
const R = PITCH.playerR, BR = PITCH.ballR;
const R_SUM = R + BR;
const REACH = R_SUM + 6 - 0.5;   // 킥 닿는 거리(sim 의 KICK_REACH 6) — 경계에서 엇갈리지 않게 반 단위 안쪽
/** 공의 틱당 감쇠(sim 의 BALL_DRAG 0.6/초). */
const BALL_KEEP = 1 - 0.6 * DT;
/** 공 길 예측: STEP 틱마다 N 개. PATH_K[i] = i*STEP 틱 동안 공이 지금 속도의 몇 초어치 가는가 — 모듈을 읽을 때 곱셈으로만 만든 상수 표. */
const STEP = 4, N = 26;
const PATH_K: number[] = [];
const KEEP_POW: number[] = [];
{
  let pw = 1, sum = 0;
  for (let i = 0; i <= N; i++) {
    PATH_K.push(sum * DT); KEEP_POW.push(pw);
    for (let j = 0; j < STEP; j++) { sum += pw; pw *= BALL_KEEP; }
  }
}

type V = { x: number; y: number };
type P = { x: number; y: number; vx: number; vy: number };

/** (a, b) → -1..1. 정수 해시라 환경이 달라도 같다. */
function noise(a: number, b: number): number {
  let h = Math.imul(a + 1, 0x9e3779b1) ^ Math.imul(b + 7, 0x85ebca6b);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
  return ((h >>> 0) / 4294967295) * 2 - 1;
}
const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
const len = (x: number, y: number): number => Math.sqrt(x * x + y * y);
const dist = (a: V, b: V): number => len(a.x - b.x, a.y - b.y);
function unit(x: number, y: number): V { const l = len(x, y); return l > 1e-9 ? { x: x / l, y: y / l } : { x: 1, y: 0 }; }

/** 한 틱을 내다보는 데 필요한 것들. botInput 한 번에 한 번 만든다(봇마다 같은 계산을 하지만 12명 × 몇 백 번 곱셈이라 싸다). */
type Ctx = {
  s: MatchState; cfg: MatchConfig; pitch: Pitch;
  HW: number; HH: number; GH: number; kx: number; ky: number;
  path: V[];                       // 공이 갈 길(STEP 틱마다)
  reach: { t: number; i: number }[];  // 선수마다 공에 닿는 틱과 그때 공 자리(path 번호)
  ctrl: number;                    // 공을 다루고 있는 선수(닿을 만큼 붙어 있고 같이 움직인다), 없으면 -1
  slots: number[][];               // 편마다 선수 id(slot 순)
};

function build(s: MatchState, cfg: MatchConfig): Ctx {
  const pitch = pitchOf(cfg.field);
  const HW = pitch.w / 2, HH = pitch.h / 2, GH = pitch.goalW / 2;
  const b = s.ball;
  // 공이 갈 길(지금 자리·속도에서, 선 안에서 한 번 튕긴다). 반응 늦음은 길을 늦게 보는 게 아니라 늦게 출발하는 것으로 넣는다(reachTime) —
  // 길을 뒤로 밀어 보면 굴러오는 공을 받는 사람이 늘 한 박자 앞 자리로 가 공이 먼저 지나간다.
  const ox = b.x, oy = b.y;
  const lx = HW - BR, ly = HH - BR;
  const path: V[] = [];
  for (let i = 0; i <= N; i++) {
    let x = ox + b.vx * PATH_K[i], y = oy + b.vy * PATH_K[i];
    if (y > ly) y = 2 * ly - y; else if (y < -ly) y = -2 * ly - y;
    if (Math.abs(y) > GH) { if (x > lx) x = 2 * lx - x; else if (x < -lx) x = -2 * lx - x; }
    path.push({ x: clamp(x, -HW - 40, HW + 40), y: clamp(y, -ly, ly) });
  }
  const reach = s.players.map((p, id) => reachTime(p, cfg.players[id].perf.maxSpeed, path));
  let ctrl = -1, bestD = R_SUM + 14;
  s.players.forEach((p, id) => {
    const d = dist(p, b);
    const rel = len(p.vx - b.vx, p.vy - b.vy);
    if (d <= bestD && rel < 260) { bestD = d; ctrl = id; }
  });
  const slots: number[][] = [[], []];
  cfg.players.forEach((q) => slots[q.side === 1 ? 1 : 0].push(q.id));
  return { s, cfg, pitch, HW, HH, GH, kx: HW / 600, ky: HH / 360, path, reach, ctrl, slots };
}

/** 이 선수가 공 길에 닿는 가장 이른 틱. 지금 속도로 0.25초 미끄러진 자리에서 잰다 — 공 쪽으로 뛰던 사람이 유리하다(떨지 않게). */
function reachTime(p: P, speed: number, path: V[]): { t: number; i: number } {
  const ex = p.x + p.vx * 0.25, ey = p.y + p.vy * 0.25;
  const perTick = speed * DT;
  const sp = len(p.vx, p.vy);
  for (let i = 0; i <= N; i++) {
    const dx = path[i].x - ex, dy = path[i].y - ey;
    const d = len(dx, dy) - R_SUM;
    // 그쪽으로 이미 뛰고 있지 않으면 최고 속도까지 붙는 시간(감쇠 이동이라 서 있다가는 0.5초쯤)을 더한다 — 서 있는 사람이 너무 이른 자리를 고르면 공이 먼저 지나간다.
    const toward = sp > 1 && d > 0 ? clamp((p.vx * dx + p.vy * dy) / ((d + R_SUM) * speed), 0, 1) : 0;
    const need = d <= 0 ? 0 : d / perTick + 4 + 14 * (1 - toward) + REACT_TICKS;
    if (need <= i * STEP) return { t: Math.max(need, 0), i };
  }
  const d = len(path[N].x - ex, path[N].y - ey) - R_SUM;
  return { t: N * STEP + Math.max(0, d) / perTick + 4 + REACT_TICKS, i: N };
}

const sideOf = (c: Ctx, id: number): 0 | 1 => (c.cfg.players[id].side === 1 ? 1 : 0);
const progOf = (dir: number, x: number): number => dir * x;

/** 가장 뒤(slot 0) — 한 편이 둘 이상이고 그 자리가 봇일 때만. 사람이 slot 0 이면 그 편엔 남는 봇이 없다(room.ts 가 사람을 slot 1 부터 채운다). */
function keeperOf(c: Ctx, side: 0 | 1): number {
  const ids = c.slots[side];
  return ids.length >= 2 && c.cfg.players[ids[0]].bot ? ids[0] : -1;
}

/** 이 편에서 공에 가는 한 명. 모두가 같은 상태로 같은 계산을 하므로 한 편에 늘 딱 한 명이다.
 *  같은 편이 공을 다루고 있으면 그 사람(사람이든 봇이든) — 봇이 빼앗지 않는다. 사람은 공 쪽으로 뛰고 있을 때만 맡긴다
 *  (가만있는 사람 옆에 공이 서 버리지 않게). 가장 뒤 봇은 공이 우리 진영 깊이 올 때만 다툰다. */
function chaserOf(c: Ctx, side: 0 | 1): number {
  if (c.ctrl >= 0 && sideOf(c, c.ctrl) === side) return c.ctrl;
  const dir = side === 0 ? 1 : -1;
  const bp = progOf(dir, c.s.ball.x);
  const keeper = keeperOf(c, side);
  let best = -1, bestT = Infinity;
  for (const id of c.slots[side]) {
    let t = c.reach[id].t;
    if (id === keeper) {
      if (bp < -c.HW / 3) t += 0;
      else if (bp < 0) t += KEEPER_PEN;
      else continue;
    }
    if (!c.cfg.players[id].bot) {
      const p = c.s.players[id], b = c.s.ball;
      const toward = (p.vx * (b.x - p.x) + p.vy * (b.y - p.y)) / (dist(p, b) || 1);
      if (toward < 80) continue;
    }
    if (c.s.lastTouch === id) t -= 6;
    if (t < bestT) { bestT = t; best = id; }
  }
  if (best < 0) { for (const id of c.slots[side]) if (c.cfg.players[id].bot) return id; }
  return best;
}

/** 우리 편이 공을 쥐고 있다고 보나 — 우리가 다루고 있거나, 아무도 안 다룰 때 우리가 먼저 닿는다(마지막 터치 쪽에 여유를 준다). */
function weHaveIt(c: Ctx, side: 0 | 1): boolean {
  if (c.ctrl >= 0) return sideOf(c, c.ctrl) === side;
  let mine = Infinity, theirs = Infinity;
  c.s.players.forEach((_, id) => { const t = c.reach[id].t; if (sideOf(c, id) === side) mine = Math.min(mine, t); else theirs = Math.min(theirs, t); });
  const lt = c.s.lastTouch;
  const margin = lt === null ? 0 : sideOf(c, lt) === side ? 12 : -12;
  return mine < theirs + margin;
}

/** 원하는 공 방향 u 로 공을 보내려면 몸→공을 어느 방향으로 맞춰 차야 하나. 공이 이미 v 로 구르면 킥(세기 K)이 더해지므로
 *  v + K·k 가 u 와 나란하게 k 를 고른다. 옆으로 흐르는 속도가 킥보다 크면 어쩔 수 없이 u 그대로. */
function kickDir(u: V, vx: number, vy: number, K: number): V {
  const a = vx * u.x + vy * u.y, vv = vx * vx + vy * vy;
  const disc = a * a - vv + K * K;
  if (disc <= 0) return u;
  const lam = a + Math.sqrt(disc);
  return unit(lam * u.x - vx, lam * u.y - vy);
}

/** a → b 공 길이 얼마나 열려 있나(단위: 여유 거리, 음수 = 막힘). 상대마다 공이 그 자리에 닿는 시간 동안 LANE_REACT 만큼 움직여 막는다고 본다. */
function laneMargin(c: Ctx, side: 0 | 1, a: V, b: V, K: number, react = LANE_REACT, endFree = 0): number {
  const dx = b.x - a.x, dy = b.y - a.y, L = len(dx, dy) || 1, ux = dx / L, uy = dy / L;
  let m = Infinity;
  for (const id of c.slots[side === 0 ? 1 : 0]) {
    const o = c.s.players[id];
    const rx = o.x - a.x, ry = o.y - a.y;
    const sAlong = rx * ux + ry * uy;
    if (sAlong < -R || sAlong > L + R - endFree) continue;
    const perp = Math.abs(rx * uy - ry * ux);
    const sc = clamp(sAlong, 0, L);
    // 공이 거기까지 가는 초(감속을 대충 넣은 평균 속도). 0.4초 넘게는 안 본다 — 그보다 먼 상대가 길로 뛰어드는 건
    // 받는 자리 다툼(decide 의 도착 시간 비교)이 따로 본다.
    const t = Math.min(0.4, sc / Math.max(150, K - 0.3 * sc));
    const block = R + BR + react * c.cfg.players[id].perf.maxSpeed * t;
    m = Math.min(m, perp - block);
  }
  return m;
}

/** 목표로 가는 입력. 원하는 속도와 지금 속도의 차이를 같이 넣어(관성 보정) 옆으로 흐르지 않고 지나치지 않게. slow = 줄이기 시작하는 거리.
 *  목표가 움직이는 속도(공 속도)는 일부러 넣지 않는다 — 넣어 봤더니 압박하는 쪽이 공에 딱 붙어 따라가 패스가 반으로 줄었다(사람도 못 빠져나간다). */
function steer(me: P, tx: number, ty: number, speed: number, slow: number): V {
  const dx = tx - me.x, dy = ty - me.y;
  const d = len(dx, dy);
  if (d < 3 && len(me.vx, me.vy) < 20) return { x: 0, y: 0 };
  const want = slow > 0 ? Math.min(1, d / slow) : 1;
  const wx = (dx / (d || 1)) * want, wy = (dy / (d || 1)) * want;   // 원하는 속도(최고 속도 대비)
  let ix = wx + 1.2 * (wx - me.vx / speed), iy = wy + 1.2 * (wy - me.vy / speed);
  const l = len(ix, iy);
  if (l > 1) { ix /= l; iy /= l; }
  return { x: ix, y: iy };
}

function clampTarget(c: Ctx, t: V): V {
  const mX = c.HW + c.pitch.marginX - R - 2, mY = c.HH + c.pitch.marginY - R - 2;
  return { x: clamp(t.x, -mX, mX), y: clamp(t.y, -mY, mY) };
}

export function botInput(state: MatchState, config: MatchConfig, id: number): Input {
  const mp = config.players[id], me = state.players[id];
  if (!mp || !me || (state.phase !== 'kickoff' && state.phase !== 'play')) return { ...NO_INPUT };
  const side: 0 | 1 = mp.side === 1 ? 1 : 0;
  const c = build(state, config);
  const mates = c.slots[side];
  const slot = mates.indexOf(id);
  const speed = mp.perf.maxSpeed;
  const hesitate = noise(id, Math.floor(state.tick / HESITATE_HOLD) + 1000) < -1 + 2 * HESITATE_P ? HESITATE_SPEED : 1;
  const out = (v: V, kick: boolean): Input => {
    const k = kick && me.kickCooldown === 0;   // 킥은 뗐다 눌러야 다시 나간다 — 쿨다운 중이면 손을 뗀다
    return { x: clamp(v.x * hesitate, -1, 1), y: clamp(v.y * hesitate, -1, 1), kick: k };
  };

  // 킥오프에서 공을 차는 편이 아니면 제자리(자기 자리)를 지킨다 — 공을 건드릴 수도 없다.
  if (state.phase === 'kickoff' && state.kickoffSide !== side) {
    const f = formationSpot(config.field, mates.length, slot, side);
    return out(steer(me, f.x, f.y, speed, 50), false);
  }

  const chaser = chaserOf(c, side);
  if (chaser === id) return out(...onBall(c, id));

  const keeper = keeperOf(c, side);
  if (id === keeper) return out(steer(me, ...keeperSpot(c, side), speed, 60), false);
  let t = weHaveIt(c, side) ? supportSpot(c, side, id, chaser, keeper) : markSpot(c, side, id, chaser, keeper);
  // 공에 간 같은 편 옆에 붙어 있게 됐으면(공이 이쪽으로 몰려 왔다) 먼저 비켜 선다 — 한 공에 둘이 몰리지 않게.
  const b = state.ball, db = dist(me, b);
  if (db < 100 && chaser >= 0 && chaser !== id && sideOf(c, chaser) === side) {
    const u = db > 1e-6 ? unit(me.x - b.x, me.y - b.y) : { x: -(side === 0 ? 1 : -1), y: 0 };
    t = clampTarget(c, { x: b.x + u.x * 130 + (t.x - b.x) * 0.3, y: b.y + u.y * 130 + (t.y - b.y) * 0.3 });
  }
  return out(steer(me, t.x, t.y, speed, 70), false);
}

// ─────────────────────────── 공에 간 한 명 ───────────────────────────

/** 공에 간 봇의 입력과 킥. 공이 멀면 공 길로 마중 나가고(받기), 가까우면 판단(슛·패스·몰기·걷어내기·압박)에 맞는 자리에 서서 찬다. */
function onBall(c: Ctx, id: number): [V, boolean] {
  const s = c.s, me = s.players[id], ball = s.ball, mp = c.cfg.players[id];
  const side: 0 | 1 = mp.side === 1 ? 1 : 0, dir = side === 0 ? 1 : -1;
  const K = mp.perf.kick, speed = mp.perf.maxSpeed;
  // 내가 닿을 때의 공 자리(멀리 갈수록 오래 내다본다, 최대 0.5초). 가까우면 지금 공.
  const ri = Math.min(c.reach[id].i, 8);
  const B = ri === 0 ? { x: ball.x, y: ball.y } : c.path[ri];
  const keep = KEEP_POW[ri];
  const bvx = ball.vx * keep, bvy = ball.vy * keep;   // 그때 공 속도

  const oppCtrl = c.ctrl >= 0 && sideOf(c, c.ctrl) !== side;
  const ownGoal = { x: -dir * c.HW, y: 0 };
  let target: V;          // 공을 보낼 곳
  let mode: 'shoot' | 'pass' | 'carry' | 'clear' | 'press';
  if (oppCtrl) { mode = 'press'; const a = unit(B.x - ownGoal.x, B.y - ownGoal.y); target = { x: B.x + a.x * 200, y: B.y + a.y * 200 }; }
  else ({ mode, target } = decide(c, id, B));

  const u = unit(target.x - B.x, target.y - B.y);
  // 몰기는 밀기 — 킥 보정 없이 그 방향 뒤에 선다. 차는 것들은 공 속도를 넣어 선다.
  const k = mode === 'carry' ? u : kickDir(u, bvx, bvy, K);
  let mv: V;
  let tackle = false;
  if (mode === 'press') {
    // 압박 — 사람이 이길 수 있어야 한다. 늦게 본 공(REACT_TICKS 전 자리)을 보고, 공 속도를 앞질러 따라가지 않는다
    // (속도까지 따라 붙이면 공 가진 쪽이 영영 못 빠져나간다 — 실측: 그렇게 했더니 3대3 패스가 반으로 줄고 몸싸움만 남았다).
    // 상대가 공을 몸에 붙이고 있으면 우리 골대 쪽 한 걸음 앞(R_SUM + 30)에서 버티고, 가끔(해시 제비) 발을 뻗어 들어간다.
    const L = { x: c.path[ri].x - ball.vx * REACT_TICKS * DT, y: c.path[ri].y - ball.vy * REACT_TICKS * DT };   // 늦게 본 공
    const glued = dist(s.players[c.ctrl], ball) < R_SUM + 8;
    const lunge = noise(id + 50, Math.floor(s.tick / 30)) > 0.55;
    tackle = lunge;
    if (glued && !lunge) {
      const t = clampTarget(c, { x: L.x - u.x * (R_SUM + 30), y: L.y - u.y * (R_SUM + 30) });
      mv = steer(me, t.x, t.y, speed, 30);
    } else mv = approach(c, me, L, u, speed, false);
  } else if (receiving(me, ball)) {
    // 받기 — 나에게 굴러오는 공은 기다리거나 뒤로 돌아 들어가지 않고 공 길 위로 나가 몸으로 받는다(멀면 내가 먼저 닿는 자리,
    // 가까우면 공 길에서 나와 가장 가까운 점). 돌아 설 생각은 공을 세운 다음에.
    const bs = len(ball.vx, ball.vy), ux = ball.vx / bs, uy = ball.vy / bs;
    const ahead = (me.x - ball.x) * ux + (me.y - ball.y) * uy;
    const M = dist(me, ball) > 120 ? c.path[c.reach[id].i] : { x: ball.x + ux * ahead, y: ball.y + uy * ahead };
    const t = clampTarget(c, M);
    mv = steer(me, t.x, t.y, speed, 20);
  } else mv = approach(c, me, B, k, speed, mode === 'carry');

  // ── 킥: 지금 닿고, 지금 몸→공 방향이 원하는 방향과 맞을 때만 ──
  const rx = ball.x - me.x, ry = ball.y - me.y, d = len(rx, ry);
  let kick = false;
  if (d <= REACH && d > 1e-6) {
    const ax = rx / d, ay = ry / d;
    const kNow = mode === 'carry' ? u : kickDir(unit(target.x - ball.x, target.y - ball.y), ball.vx, ball.vy, K);
    const cos = ax * kNow.x + ay * kNow.y;
    if (mode === 'shoot' || mode === 'pass') {
      // 목표에서 허용하는 옆 오차 → 필요한 코사인. 가까운 목표는 0.94(약 20도)까지 느슨하게, 먼 목표도 0.993(약 7도)보다 빡빡하게는 안 한다
      // (16방향으로 줄인 조작으로도 그 안에 들어온다).
      const D = dist(ball, target);
      const tol = mode === 'shoot' ? 0.5 * c.GH : 24 + 0.05 * D;
      const sn = Math.min(1, tol / Math.max(D, 1));
      kick = cos >= clamp(Math.sqrt(1 - sn * sn), 0.94, 0.993);
    } else if (mode === 'press' && tackle && !inDanger(c, dir, ball)) {
      // 발 뻗기 — 공을 가진 상대 몸 쪽으로 차면 그대로 되돌아온다. 옆으로(상대 몸에서 45도 넘게 비낀 방향) 찔러 낼 때만.
      const o = s.players[c.ctrl], ou = unit(o.x - me.x, o.y - me.y);
      kick = ax * ou.x + ay * ou.y < 0.7 && ax * dir > -0.2;
    } else if (mode === 'clear' || (mode === 'press' && inDanger(c, dir, ball))) {
      // 걷어내기·골문 앞에서 뺏기 — 우리 골대 반대쪽이면 된다. 그 밖에서 뺏을 땐 몸으로 공과 골대 사이에 들어가 공을 가져온다
      // (늘 차면 대부분 상대에게 간다 — 실측 3대3 세 경기 128번 중 5번만 우리 편). 발을 뻗는 제비(tackle)가 뽑힌 때만 걷어 낸다.
      kick = ax * dir > 0.25 || (cos > 0.7 && ax * dir > -0.2);
    }
    // 기회 — 지금 이대로 차면 공이 어디로 가나. 열린 골문이나 같은 편 앞이면 계획과 달라도 찬다(몰다가 틈이 보이면 바로).
    if (!kick) kick = chance(c, id, ax, ay);
    // 벽·구석에 멈춘 공 — 뒤로 못 돌아 들어가면 서 버린다. 우리 골대 쪽만 아니면 그냥 찬다.
    if (!kick && len(ball.vx, ball.vy) < 15 && (Math.abs(ball.y) > c.HH - 45 || Math.abs(ball.x) > c.HW - 45) && ax * dir > -0.1) kick = true;
    // 자책 방지 — 찬 뒤 공 속도가 우리 골문을 향하면 누르지 않는다.
    if (kick) {
      const nvx = ball.vx + ax * K, nvy = ball.vy + ay * K;
      if (nvx * dir < 0) {
        const tt = (ownGoal.x - ball.x) / nvx;
        if (Math.abs(ball.y + nvy * tt) < c.GH + 40) kick = false;
      }
    }
  }
  return [mv, kick];
}

/** 공이 빠르게 나에게 오고 있나 — 공 길이 내 몸 가까이(몸 둘 + 여유) 지나가고, 아직 내 앞이다. */
function receiving(me: P, ball: P): boolean {
  const bs = len(ball.vx, ball.vy);
  if (bs < 120) return false;
  const ux = ball.vx / bs, uy = ball.vy / bs, rx = me.x - ball.x, ry = me.y - ball.y;
  const ahead = rx * ux + ry * uy;
  return ahead > R_SUM && Math.abs(rx * uy - ry * ux) < 4 * R + 0.25 * ahead;
}

/** 우리 골문 앞 위험 지역(골대 가운데에서 DANGER_R × 반가로 안). 여기서만 무작정 걷어낸다. */
function inDanger(c: Ctx, dir: number, p: V): boolean {
  return len(p.x + dir * c.HW, p.y) < DANGER_R * c.HW;
}

/** 지금 몸→공 방향(ax, ay)으로 차면 생기는 공 길이 슛이나 패스가 되나. 판단(decide)과 같은 기준을 한 방향에만 대 본다. */
function chance(c: Ctx, id: number, ax: number, ay: number): boolean {
  const s = c.s, ball = s.ball, mp = c.cfg.players[id];
  const side: 0 | 1 = mp.side === 1 ? 1 : 0, dir = side === 0 ? 1 : -1, K = mp.perf.kick;
  const w = unit(ball.vx + ax * K, ball.vy + ay * K);
  const gx = dir * c.HW;
  if (w.x * dir > 0.3 && len(gx - ball.x, ball.y) < SHOOT_RANGE) {
    const y = ball.y + (w.y / w.x) * (gx - ball.x);
    const toG = len(gx - ball.x, ball.y);
    if (Math.abs(y) < c.GH - 10 && laneMargin(c, side, ball, { x: gx, y }, K, SHOT_REACT) > -(toG < NEAR_GOAL ? SHOT_RISK_NEAR : SHOT_RISK)) return true;
  }
  const win = Math.floor(s.tick / AIM_HOLD);
  const bp = progOf(dir, ball.x);
  for (const q of c.slots[side]) {
    if (q === id || noise(id * 31 + q, win + 77) > -1 + 2 * VISION_P) continue;
    const p = s.players[q];
    const tArr = Math.min(0.35, dist(p, ball) / 420);
    const Lx = p.x + p.vx * tArr - ball.x, Ly = p.y + p.vy * tArr - ball.y;
    const along = Lx * w.x + Ly * w.y, perp = Math.abs(Lx * w.y - Ly * w.x);
    if (along < PASS_MIN || along > PASS_MAX || perp > 18 + 0.08 * along) continue;
    const at = { x: ball.x + w.x * along, y: ball.y + w.y * along };
    if (Math.abs(at.y) > c.HH - 20 || progOf(dir, at.x) - bp < -120) continue;
    if (progOf(dir, at.x) < -0.6 * c.HW && Math.abs(at.y) < c.GH + 60) continue;
    if (laneMargin(c, side, ball, at, K, LANE_REACT, 45) > 6) return true;
  }
  return false;
}

/** 공 B 를 방향 k 로 보내려고 공 뒤에 선다. 뒤(−k 쪽 25도 안)면 공으로 곧장 들어가고 — 킥이면 닿는 순간 차고, 몰기면 그대로 민다 —
 *  아니면 공 둘레를 돈다: 지금 방향과 "공 뒤" 방향의 가운데(이등분) 점으로 가면 틱마다 각도가 반씩 줄어 공을 건드리지 않고 뒤로 간다.
 *  공 앞(골 쪽)에 있으면 먼저 옆으로 빠진다(공을 가로질러 우리 쪽으로 밀지 않게). */
function approach(c: Ctx, me: P, B: V, k: V, speed: number, push: boolean): V {
  const px = -k.y, py = k.x;
  const rx = me.x - B.x, ry = me.y - B.y, rd = len(rx, ry) || 1;
  const cosE = -(rx * k.x + ry * k.y) / rd;   // 1 = 바로 뒤
  const lat = rx * px + ry * py;
  let t: V;
  // 들어가는 각: 밀기는 25도 안이면 되지만 킥은 8도 안팎이어야 해서 더 뒤로 돌아 맞춘 뒤 들어간다(아니면 몸이 먼저 공에 닿는다).
  if (cosE > (push ? 0.9 : 0.97)) {
    const through = push ? 26 : 12;
    t = { x: B.x + k.x * through - px * lat * 0.8, y: B.y + k.y * through - py * lat * 0.8 };
    t = clampTarget(c, t);
    return steer(me, t.x, t.y, speed, 0);
  }
  // 공을 몸에 붙이고 있고 60도 안쪽만 틀렸으면 돌아 나가지 않고 몰면서 꺾는다 — 지금 방향과 원하는 방향의 가운데로 민다.
  // 밀 때마다 몸→공 방향이 원하는 쪽으로 반씩 돌아, 두세 번 밀면 줄이 맞고 그때 찬다(사람이 몰다가 패스하는 모양).
  if (!push && rd < 50 && cosE > 0.5) {
    const h = unit(-rx / rd + k.x, -ry / rd + k.y);
    const hl = rx * -h.y + ry * h.x;
    t = clampTarget(c, { x: B.x + h.x * 14 + h.y * hl * 0.8, y: B.y + h.y * 14 - h.x * hl * 0.8 });
    return steer(me, t.x, t.y, speed, 0);
  }
  const ro = R_SUM + 8 + Math.min(30, rd * 0.15);
  let wx: number, wy: number;
  if (cosE < -0.2) { const sg = lat >= 0 ? 1 : -1; wx = px * sg; wy = py * sg; }
  else { const h = unit(rx / rd - k.x, ry / rd - k.y); wx = h.x; wy = h.y; }
  t = clampTarget(c, { x: B.x + wx * ro, y: B.y + wy * ro });
  return steer(me, t.x, t.y, speed, 0);
}

/** 공 가진 봇의 판단 — 슛 / 패스 / 몰기 / 걷어내기 와 공을 보낼 곳. */
function decide(c: Ctx, id: number, B: V): { mode: 'shoot' | 'pass' | 'carry' | 'clear'; target: V } {
  const s = c.s, me = s.players[id], mp = c.cfg.players[id];
  const side: 0 | 1 = mp.side === 1 ? 1 : 0, dir = side === 0 ? 1 : -1;
  const K = mp.perf.kick;
  const opp = c.slots[side === 0 ? 1 : 0];
  const win = Math.floor(s.tick / AIM_HOLD);
  const kickoff = s.phase === 'kickoff';
  // 지금 몸→공 방향 — 이미 줄 선 후보에 덤을 준다.
  const sx = B.x - me.x, sy = B.y - me.y, sl = len(sx, sy) || 1;
  let nearOpp = Infinity, nearId = -1;
  for (const o of opp) { const d = dist(s.players[o], B); if (d < nearOpp) { nearOpp = d; nearId = o; } }
  // 돌아 서는 시간 — 공에 붙어 있을 때 몸→공 방향을 바꾸려면 공 둘레를 돌아야 한다(90도에 약 16틱).
  // 가장 가까운 상대가 그보다 먼저 공에 닿는 방향은 고르지 않는다(실측: 압박 중 90도 패스를 고르고 돌다가 뺏긴다).
  const close = sl < 60;
  // 버티고 선(공 쪽으로 다가오지 않는) 상대는 바로 덤비지 않는다 — 그만큼 돌아 설 틈이 있다(없으면 둘이 20초씩 맞서기만 했다).
  let oppTicks = Infinity;
  if (nearId >= 0) {
    const o = s.players[nearId], tb = unit(B.x - o.x, B.y - o.y);
    const closing = o.vx * tb.x + o.vy * tb.y;
    oppTicks = Math.max(0, nearOpp - R_SUM) / (c.cfg.players[nearId].perf.maxSpeed * DT) + (closing < 60 ? 15 : 0);
  }
  const turnOk = (t: V): boolean => {
    if (!close) return true;
    const u = unit(t.x - B.x, t.y - B.y), cs = (sx * u.x + sy * u.y) / sl;
    return 16 * (1 - cs) < oppTicks - 2;
  };
  const lined = (t: V): number => { const u = unit(t.x - B.x, t.y - B.y); return Math.max(0, (sx * u.x + sy * u.y) / sl); };
  const pressured = nearOpp < PRESSURE_R;
  const bp = progOf(dir, B.x);

  // ① 슛 — 양 구석·가운데 중 길이 가장 열린 곳(가장 가까운 수비에서 먼 쪽이 이긴다). 조준 오차는 시간 창마다 바뀐다.
  let shot: V | null = null, shotScore = -Infinity;
  const gx = dir * c.HW;
  // 큰 경기장은 골문도 넓고 수비 사이가 멀다 — 사정거리를 조금(반가로 비례의 60%) 늘려 본다.
  const toGoal = len(gx - B.x, B.y) / (1 + 0.6 * (c.kx - 1));
  const risk = toGoal < NEAR_GOAL ? SHOT_RISK_NEAR : SHOT_RISK;
  if (!kickoff && toGoal < SHOOT_RANGE && bp > 0 && (gx - B.x) * dir / (toGoal || 1) > 0.35) {   // 너무 비스듬하면(골라인 옆) 몰고 들어간다
    const err = noise(id, win) * AIM_ERR * c.GH;
    for (const f of [-0.72, 0, 0.72]) {
      const t = { x: gx, y: clamp(f * c.GH + err, -c.GH - 15, c.GH + 15) };
      if (!turnOk(t)) continue;
      const m = laneMargin(c, side, B, t, K, SHOT_REACT);
      if (m < -risk) continue;
      const sc = Math.min(m, 80) + 80 * lined(t);
      if (sc > shotScore) { shotScore = sc; shot = t; }
    }
  }
  if (shot) return { mode: 'shoot', target: shot };

  // ② 패스 — 같은 편(사람 포함)마다 두 곳: 공이 닿을 때 그가 있을 자리(발밑), 그리고 붙은 상대 반대쪽 앞 빈 곳(공간 패스).
  //    못 본 같은 편은 건너뛴다. 뒤로 주는 패스는 압박받거나 우리 진영일 때만(점수는 낮게 — 막힌 몰기보다만 낫다).
  let pass: V | null = null, passScore = -Infinity;
  const backFloor = pressured || bp < 0 ? -0.8 * c.HW : -260;
  for (const q of c.slots[side]) {
    if (q === id) continue;
    if (noise(id * 31 + q, win + 77) > -1 + 2 * VISION_P) continue;
    const p = s.players[q], qs = c.cfg.players[q].perf.maxSpeed * DT;
    const tArr = Math.min(0.35, dist(p, B) / 420);
    const feet = { x: p.x + p.vx * tArr, y: p.y + p.vy * tArr };
    // 공간: 앞(공격 방향)과 가장 가까운 상대에게서 먼 쪽을 섞은 방향으로 130.
    let near = -1, nd = Infinity;
    for (const o of opp) { const d = dist(s.players[o], p); if (d < nd) { nd = d; near = o; } }
    const aw = near >= 0 ? unit(p.x - s.players[near].x, p.y - s.players[near].y) : { x: dir, y: 0 };
    const sd = unit(dir + aw.x * 0.7, aw.y * 0.7);
    const room = { x: p.x + sd.x * 130, y: p.y + sd.y * 130 };
    for (let kind = 0; kind < 2; kind++) {
      const raw = kind === 0 ? feet : room;
      const L = { x: clamp(raw.x, -c.HW + 30, c.HW - 30), y: clamp(raw.y, -c.HH + 30, c.HH - 30) };
      const D = dist(L, B);
      if (D < PASS_MIN || D > PASS_MAX) continue;
      const gain = progOf(dir, L.x) - bp;
      if (kickoff && gain < 0) continue;   // 킥오프엔 우리 진영 밖으로 못 서니 뒤로는 못 찬다
      if (gain < backFloor || (kind === 1 && gain < 0)) continue;
      if (!turnOk(L)) continue;
      // 우리 골문 앞을 가로지르는 패스는 안 한다.
      if (progOf(dir, L.x) < -0.6 * c.HW && Math.abs(L.y) < c.GH + 60) continue;
      const m = laneMargin(c, side, B, L, K, LANE_REACT, 45);
      if (m < 4) continue;
      // 받는 자리 다툼 — 받는 사람이 가장 가까운 상대보다 먼저 닿아야 한다(틱). 공간 패스는 공보다 너무 늦어도 안 된다.
      const tq = dist(p, L) / qs + 6;
      let to = Infinity, space = Infinity;
      for (const o of opp) { const d = dist(s.players[o], L); space = Math.min(space, d); to = Math.min(to, d / (c.cfg.players[o].perf.maxSpeed * DT)); }
      if (to - tq < (kind === 0 ? 4 : 12)) continue;
      if (kind === 1 && tq > D / 420 * TICK_HZ + 30) continue;
      const toG = len(gx - L.x, L.y);
      let sc = 0.5 * clamp(gain, -0.8 * c.HW, 300) + 0.4 * Math.min(space, 200) + Math.min(m, 60) + (toG < SHOOT_RANGE ? 50 : 0) - 0.05 * D + COMMIT_BONUS * lined(L) - (kind === 1 ? 15 : 0);
      if (!c.cfg.players[q].bot) sc += 15;   // 사람에게 조금 더 — 같이 뛰는 맛
      // 앞으로 크게 나가는 열린 패스 — 압박이 없어도 준다(스펙: "더 앞에서 길이 열린 같은 편").
      if (gain >= 120 * c.kx && m >= 15 && to - tq >= 8) sc += 60;
      if (sc > passScore) {
        passScore = sc;
        const e = noise(id, win + 5) * PASS_ERR * D, u = unit(L.x - B.x, L.y - B.y);
        pass = { x: L.x - u.y * e, y: L.y + u.x * e };
      }
    }
  }

  // ③ 몰기 — 골 쪽, 위·아래로 비스듬히 셋 중 앞이 가장 빈 곳. 압박받을수록 몰기의 값이 깎인다.
  let carry: V = { x: B.x + dir * 300, y: B.y * 0.7 }, carryScore = -Infinity;
  const g = unit(gx - B.x, -B.y);
  // 넷째 후보: 붙은 상대 반대쪽(등지고 지키기).
  const away = nearId >= 0 ? unit(B.x - s.players[nearId].x, B.y - s.players[nearId].y) : g;
  for (const a of [0, 0.55, -0.55, 9]) {
    let ux = a === 9 ? away.x : g.x - g.y * a, uy = a === 9 ? away.y : g.y + g.x * a;
    if (a === 9 && (!pressured || ux * dir < -0.3)) continue;   // 우리 골대 쪽으로 등지지는 않는다
    const l = len(ux, uy); ux /= l; uy /= l;
    const ahead = { x: B.x + ux * 130, y: B.y + uy * 130 };
    if (Math.abs(ahead.y) > c.HH - 30) continue;
    let space = 220;
    for (const o of opp) space = Math.min(space, dist(s.players[o], ahead));
    // 앞에 상대가 서 있으면(80 안) 그쪽으로 모는 건 공을 갖다 바치는 것 — 크게 깎는다.
    const sc = 0.8 * space - (space < 80 ? 2 * (80 - space) : 0) + (a === 0 ? 25 : 0) + 0.5 * COMMIT_BONUS * Math.max(0, (sx * ux + sy * uy) / sl);
    if (sc > carryScore) { carryScore = sc; carry = { x: B.x + ux * 300, y: B.y + uy * 300 }; }
  }
  if (carryScore === -Infinity) carryScore = 0;
  if (pressured) carryScore -= (PRESSURE_R - nearOpp) * 1.5;

  // ④ 고르기 — 우리 골문 앞에서 압박받으면 열린 패스가 있으면 패스, 없으면 바깥쪽 앞으로 걷어낸다.
  if (inDanger(c, dir, B) && pressured) {
    if (pass && passScore > 40) return { mode: 'pass', target: pass };
    const wy = (B.y !== 0 ? Math.sign(B.y) : (me.y >= 0 ? 1 : -1)) * c.HH * 0.85;
    return { mode: 'clear', target: { x: B.x + dir * 380 * c.kx, y: wy } };
  }
  // 가장 뒤 봇이 공을 잡으면 몰고 올라가지 않고 내준다(위험 지역이 아니면 — 거기선 위의 걷어내기).
  const isKeeper = keeperOf(c, side) === id;
  if (pass && (kickoff || isKeeper || passScore > carryScore + 20)) return { mode: 'pass', target: pass };
  // 가장 뒤 봇은 하프라인 가까이까지만 몰고 간다 — 줄 곳이 없으면 길게 앞으로 차고 제자리로 돌아간다(뒤를 비우지 않게).
  if (isKeeper && bp > -0.25 * c.HW) {
    const wy = (B.y !== 0 ? Math.sign(B.y) : (me.y >= 0 ? 1 : -1)) * c.HH * 0.6;
    return { mode: 'clear', target: { x: B.x + dir * 450 * c.kx, y: wy } };
  }
  return { mode: 'carry', target: carry };
}

// ─────────────────────────── 공 없는 봇의 자리 ───────────────────────────

/** 가장 뒤: 우리 골대 가운데 → 공 선 위, 공이 멀수록 앞으로(우리 진영 안까지만). */
function keeperSpot(c: Ctx, side: 0 | 1): [number, number] {
  const dir = side === 0 ? 1 : -1, b = c.s.ball;
  // 우리가 공을 갖고 상대 진영에 있으면 한참 올라와 뒤로 받아 줄 자리가 된다(그래도 공보다 한참 뒤, 우리 진영 안).
  if (progOf(dir, b.x) > 0 && weHaveIt(c, side)) {
    const prog = clamp(progOf(dir, b.x) - 330 * c.kx, -0.6 * c.HW, -40 * c.kx);
    return [dir * prog, clamp(b.y * 0.3, -c.HH * 0.4, c.HH * 0.4)];
  }
  const gx = -dir * c.HW;
  const dx = b.x - gx, dy = b.y, d = len(dx, dy) || 1;
  const k = clamp(0.32 * d, 70 * c.kx, 300 * c.kx);
  let x = gx + (dx / d) * k, y = (dy / d) * k;
  x = dir * Math.min(dir * x, -130 * c.kx);
  y = clamp(y, -(c.GH + 30), c.GH + 30);
  return [x, y];
}

/** 받쳐 주기 — 공 가진 사람·가장 뒤를 뺀 봇들이 지금 세로 순서대로 폭을 나눠 공보다 앞·옆에 선다.
 *  상대가 공에서 그 자리로 가는 길을 가리고 있으면(그림자) 옆으로 비킨다. */
function supportSpot(c: Ctx, side: 0 | 1, id: number, chaser: number, keeper: number): V {
  const s = c.s, dir = side === 0 ? 1 : -1, b = s.ball;
  const sup = c.slots[side].filter((q) => q !== chaser && q !== keeper && c.cfg.players[q].bot);
  sup.sort((a, z) => s.players[a].y - s.players[z].y || a - z);
  const n = sup.length, j = sup.indexOf(id);
  const bp = progOf(dir, b.x);
  let ly: number;
  if (n === 1) {
    // 하나뿐이면 공 반대쪽 폭. 공이 가운데쯤이면 내가 있는 쪽 그대로(넘어 다니지 않게).
    const mySide = s.players[id].y >= 0 ? 1 : -1;
    const sideY = Math.abs(b.y) > 0.2 * c.HH ? -Math.sign(b.y) : mySide;
    ly = sideY * 0.5 * c.HH;
  } else {
    ly = ((j + 0.5) / n * 2 - 1) * 0.78 * c.HH;
  }
  ly = clamp(ly + 0.2 * b.y, -c.HH + 50, c.HH - 50);
  const wide = Math.abs(ly - b.y) / c.HH;      // 공에서 세로로 멀수록 더 앞에
  let prog = bp + (70 + 160 * wide) * c.kx;
  if (n >= 3 && j % 2 === 1) prog -= 90 * c.kx;   // 셋 이상이면 하나 건너 하나는 한 칸 뒤(짧은 패스 길)
  prog = clamp(prog, -0.55 * c.HW, c.HW - 90 * c.kx);
  if (s.phase === 'kickoff') prog = Math.min(prog, -30);
  let t: V = { x: dir * prog, y: ly };
  // 공과 너무 가까우면 바깥으로(같은 편이 공에 몰리지 않게)
  const db = dist(t, b);
  if (db < 140) { const u = unit(t.x - b.x, t.y - b.y); t = { x: b.x + u.x * 140, y: b.y + u.y * 140 }; }
  // 그림자 — 기본 자리와 그 옆·위아래·한 칸 짧은 자리 다섯 중, 공에서 오는 길이 열려 있고 붙은 상대에게서 먼 곳을 고른다.
  // 지금 내 자리에서 먼 후보엔 벌점(가까운 곳을 고르니 틱마다 크게 바뀌지 않는다).
  const me = s.players[id];
  const K = chaser >= 0 ? c.cfg.players[chaser].perf.kick : 486;
  const opp = c.slots[side === 0 ? 1 : 0];
  let best = t, bestSc = -Infinity;
  for (const [dp, dy] of [[0, 0], [0, 150], [0, -150], [-90, 0], [70, 0]]) {
    const cand = { x: t.x + dir * dp * c.kx, y: clamp(t.y + dy * c.ky, -c.HH + 40, c.HH - 40) };
    if (dist(cand, b) < 120) continue;
    let space = 200;
    for (const o of opp) space = Math.min(space, dist(s.players[o], cand));
    const sc = Math.min(laneMargin(c, side, b, cand, K), 70) + 0.5 * space - 0.25 * dist(me, cand) - (dp === 0 && dy === 0 ? 0 : 10);
    if (sc > bestSc) { bestSc = sc; best = cand; }
  }
  t = best;
  t.y = clamp(t.y, -c.HH + 40, c.HH - 40);
  return clampTarget(c, t);
}

/** 수비 자리 — 공에 간 사람·가장 뒤를 뺀 봇들이 위험한 상대(우리 골대에 가까운 순)를 하나씩 맡는다.
 *  맡는 건 그 상대와 우리 골대 사이, 공 쪽으로 조금(패스 길을 끊게). 남는 봇은 공과 골대 사이 가운데. */
function markSpot(c: Ctx, side: 0 | 1, id: number, chaser: number, keeper: number): V {
  const s = c.s, dir = side === 0 ? 1 : -1, b = s.ball;
  const ownGoal = { x: -dir * c.HW, y: 0 };
  const defs = c.slots[side].filter((q) => q !== chaser && q !== keeper && c.cfg.players[q].bot);
  const theirChaser = c.ctrl >= 0 && sideOf(c, c.ctrl) !== side ? c.ctrl : chaserOf(c, side === 0 ? 1 : 0);
  const threats = c.slots[side === 0 ? 1 : 0].filter((o) => o !== theirChaser);
  threats.sort((a, z) => dist(s.players[a], ownGoal) - dist(s.players[z], ownGoal) || a - z);
  // 맡은 상대가 MARK_LAG 초 전에 있던 자리를 본다 — 붙어 다니되 한 박자 늦어, 받으러 움직이는 상대가 떨어질 틈이 생긴다.
  // 우리 골대에서 먼 상대는 느슨하게(멀리·늦게) — 미드필드에선 공간을 지키고, 골대 가까이서만 바짝 붙는다.
  const markPoint = (o: number): V => {
    const q = s.players[o];
    const dg = dist(q, ownGoal);
    const far = dg > c.HW ? 1 : 0;
    const lag = far ? MARK_LAG_FAR : MARK_LAG;
    // 먼 상대와는 골대까지 거리의 MARK_DROP 만큼 떨어져 그 사이를 지킨다(선을 내린다) — 모두가 일대일로 붙으면 가운데가 막혀 아무도 못 들어온다.
    const gap = far ? Math.max(MARK_GAP, MARK_DROP * dg) : MARK_GAP;
    const p = { x: q.x - q.vx * lag, y: q.y - q.vy * lag };
    const g = unit(ownGoal.x - p.x, ownGoal.y - p.y);
    const toB = unit(b.x - p.x, b.y - p.y);
    const m = { x: p.x + g.x * gap + toB.x * 15, y: p.y + g.y * gap + toB.y * 15 };
    // 공 바로 옆(공에 간 같은 편 자리)에는 서지 않는다 — 두 명이 한 공에 몰려 보인다.
    const db = dist(m, b);
    if (db < 110) { const u = db > 1e-6 ? unit(m.x - b.x, m.y - b.y) : unit(ownGoal.x - b.x, ownGoal.y - b.y); return { x: b.x + u.x * 110, y: b.y + u.y * 110 }; }
    return m;
  };
  // 위험한 순서대로, 아직 안 맡은 봇 중 가장 가까운 봇이 맡는다(모두가 같은 계산 → 겹치지 않는다).
  const free = defs.slice();
  for (const o of threats) {
    if (!free.length) break;
    const mpnt = markPoint(o);
    let bi = 0;
    for (let i = 1; i < free.length; i++) if (dist(s.players[free[i]], mpnt) < dist(s.players[free[bi]], mpnt)) bi = i;
    if (free[bi] === id) return clampTarget(c, mpnt);
    free.splice(bi, 1);
  }
  // 맡을 상대가 없다 — 공과 우리 골대 사이 가운데쯤(순번마다 위아래로 갈라).
  const k = free.indexOf(id);
  const mid = { x: (b.x + ownGoal.x) / 2, y: b.y * 0.5 + (k % 2 === 0 ? 1 : -1) * (60 + 40 * k) * c.ky };
  return clampTarget(c, mid);
}
