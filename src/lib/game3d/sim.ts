// src/lib/game3d/sim.ts — 3D 축구 **시제품**의 경기 계산(2026-11-07). 상태 하나와 "한 틱 진행"이 전부다.
// 설계: docs/superpowers/specs/2026-11-07-game3d-spike-design.md
// 사용자: "3차원 피파 같은 게임으로 만들긴 좀 그런가?" → 세 갈래 중 "b 쪽도 시도해보고 싶은데"(단순한 3D 아케이드 축구).
// 시제품이다 — 손맛이 재미있는지 보려는 것이고, 버려도 된다. 2D 게임(src/lib/game)은 건드리지 않고 가져다 쓰지도 않는다.
//
// 2D 와 같은 약속(스펙 §5 "2D 의 규칙 그대로"):
//   1) 순수하다 — 화면·three.js·시계·Math.random 을 모른다. 난수는 상태 안의 seed 에서만 뽑는다(rand).
//   2) 브라우저마다 끝자리가 달라질 수 있는 sin·cos·exp·pow·hypot 을 step() 안에서 쓰지 않는다. 방향은 단위 벡터, 길이는 sqrt.
//   3) 상태는 JSON 으로 그대로 오갈 수 있는 값만. 같은 씨앗 + 같은 입력 → 같은 상태(나중에 방장 기기가 이걸 그대로 돌릴 수 있게).
//
// 단위: 길이 m, 속도 m/s, 시간은 틱(1/60초). 바닥은 x(골대~골대, 긴 쪽)·y(옆), 높이는 z(위가 +).
// 원점은 경기장 한가운데 바닥. 0 편은 왼쪽(x<0)에서 시작해 오른쪽 골대(x=+HW)로 공격한다.
// 선수는 바닥 위 원(반지름 PLAYER_R), 공은 높이가 있는 구(반지름 BALL_R).
import type { Perf } from './stats.ts';

// ═══════════════════════════ 조절 값 (느낌을 바꾸려면 여기만 고친다) ═══════════════════════════
// 처음 값은 이 경기장(36×22m, 5대5)에서 계산과 봇 경기로 잡은 것이다. 다른 게임의 값을 가져오지 않는다(스펙 §1).
// 사용자가 "더 빠르게", "공이 더 붙게" 하면 고칠 자리 — 아래 주석의 "올리면/내리면"을 보고 한 줄씩.

// ── 경기장 ──
const HALF_LEN = 18;          // 반길이(골라인까지). 36m — 풋살장(40m)보다 조금 작게, 폰 화면에서 선수가 안 작아지게
const HALF_WID = 11;          // 반너비(옆 벽까지). 22m
const GOAL_HALF_W = 2.6;      // 골문 반폭. 5.2m — 아케이드라 풋살 골(3m)보다 넓게, 슛이 자주 들어가게
const GOAL_H = 2.1;           // 크로스바 높이. 공 중심이 이보다 아래여야 골
const GOAL_DEPTH = 1.4;       // 골라인 뒤 그물 깊이
const POST_R = 0.07;          // 골대 기둥·크로스바 굵기(반지름)
const BOARD_H = 0.6;          // 둘레 낮은 벽 높이(그리기용 — 공은 높이와 상관없이 벽 선에서 튕긴다. 위는 보이지 않는 벽)
const CEILING = 9;            // 보이지 않는 천장. 공 중심이 이 위로 못 간다
const CENTER_R = 3;           // 가운데 원(킥오프 때 수비 편이 못 들어온다)

// ── 몸 ──
const PLAYER_R = 0.42;        // 선수 원 반지름
const PLAYER_H = 1.75;        // 선수 키 — 이보다 낮게 뜬 공만 몸에 맞는다
const BALL_R = 0.18;          // 공 반지름. 실제(0.11)보다 크게 — 화면에서 잘 보이게

/** 능력치가 평균인 선수의 성능. stats.ts 의 BASE_PERF 가 이걸 그대로 쓴다(숫자는 한 곳에서만).
 *  maxSpeed m/s — 계속 누를 때 닿는 속도. 6.8 이면 경기장 길이를 5.3초에 건넌다(2D 와 비슷한 체감).
 *  control  공 간수 배율 — 높으면 급히 꺾어도 공이 덜 떨어진다.  shot 슛 세기 배율.  pass 패스 정확도 배율(높으면 덜 빗나감).
 *  tackle   빼앗기 배율.  mass 몸 무게 배율(부딪칠 때 덜 밀리고, 덜 빼앗긴다). */
export const BASE_PERF_TUNE: Perf = { maxSpeed: 6.8, control: 1, shot: 1, pass: 1, tackle: 1, mass: 1 };

// ── 움직임(2D 가 자리 잡은 "감쇠 방식": 매 틱 입력 방향으로 속도를 더하고 감쇠를 곱한다 — 반응은 빠르고 멈춤은 미끄러진다) ──
const PLAYER_DAMP = 0.93;     // 틱당 속도 감쇠. 1 에 가까울수록 묵직하고 오래 미끄러진다(2D 는 0.96 — 3D 는 화면이 멀어 조금 더 바로 서게)
const CARRY_SPEED = 0.9;      // 공을 몰 때 속도 배수
const CHARGE_SPEED = 0.75;    // 슛을 모으는(누르고 있는) 동안 속도 배수
const TURN_RATE = 0.24;       // 보는 방향이 입력 쪽으로 도는 비율(틱당). 올리면 바로 돈다
const TURN_RATE_BALL = 0.17;  // 공을 몰 때는 조금 굼뜨게 돈다
const PLAYER_E = 0.2;         // 선수끼리 부딪칠 때 반발
const PLAYER_MASS = 10;

// ── 공 ──
const GRAVITY = 15;           // m/s². 실제(9.8)보다 세게 — 뜬 공이 빨리 내려와 아케이드답게
const BOUNCE_E = 0.5;         // 땅에 튕길 때 세로 반발
const BOUNCE_KEEP = 0.86;     // 땅에 튕길 때 가로 속도가 남는 비율
const BOUNCE_STOP = 1.2;      // 세로 속도가 이보다 작으면 튕기지 않고 구른다
const ROLL_DRAG = 0.9;        // 구르는 공의 감속(1/초, 지수). 한 번 찬 땅볼이 (v0 - v)/ROLL_DRAG 만큼 간다 — 패스 세기 계산이 이걸 쓴다
const AIR_DRAG = 0.12;        // 뜬 공의 감속(1/초)
const BALL_REST = 0.15;       // 이보다 느리고 땅에 있으면 선다
const BALL_MAX_SPEED = 34;
const BOARD_E = 0.6;          // 둘레 벽·보이지 않는 벽 반발
const NET_E = 0.15;           // 그물 반발(공이 그물에 걸려 선다)
const POST_E = 0.6;           // 골대 반발
const BODY_E = 0.3;           // 몸에 맞고 튀는 공의 반발

// ── 소유(드리블) ──
const CONTROL_REACH = 0.26;   // 몸+공이 맞닿은 거리에 더해 이만큼 안이면 발밑으로 가져온다
const PICKUP_MAX_Z = 0.75;    // 공 중심이 이보다 높으면 못 받는다(가슴 아래까지)
const PICKUP_MAX_REL = 11;    // 몸과 공의 상대 속도가 이보다 빠르면 못 받고 몸에 맞는다(센 슛은 튕긴다)
const CARRY_GAP = 0.1;        // 발 앞에 공이 놓이는 틈
const CARRY_LEAD = 0.07;      // 속도(m/s)마다 공이 이만큼(초) 더 앞에 — 달리면 조금 앞서 구른다
const LOOSE_SPEED = 4.5;      // 이보다 빠를 때
const LOOSE_COS = -0.1;       // 입력과 보는 방향의 코사인이 이보다 작으면(≈95도 넘게 꺾으면)
const LOOSE_P = 0.35;         // 이 확률로 공이 떨어진다(틱마다가 아니라 "꺾은 순간" — 아래 LOOSE_LOCK 동안 다시 안 뽑는다)
const LOOSE_LOCK = 16;        // 공을 흘린 사람이 다시 못 잡는 틱
const KICK_LOCK = 14;         // 찬 사람이 자기 공을 바로 다시 못 잡는 틱
const CARRY_PULL = 0.5;       // 발밑 공이 제자리로 당겨지는 비율(틱당). 1 이면 발에 딱 붙고, 내리면 공이 출렁이며 따라온다
const LOOSE_KEEP = 1.1;       // 흘린 공이 몸 속도의 몇 배로 굴러가나
const FIRST_TOUCH_REACH = 0.15; // 아무도 안 가진 공을 바로 찰(논스톱) 수 있는 거리 여유(잡는 거리에 더한다)
const FIRST_TOUCH_Z = 1;      // 논스톱으로 찰 수 있는 공 높이(공 중심)
const KICK_ANIM = 12;         // 찬 뒤 몸이 기울어 있는 틱(화면이 읽는다)

// ── 빼앗기(몸으로 부딪치기) ──
const STEAL_REACH = 0.12;     // 상대 몸·공에 이만큼 안으로 붙으면 시도
const STEAL_WIN = 0.5;        // 시도 한 번에 빼앗을 확률(평균끼리). 못 빼앗으면 공이 흘러나온다
const STEAL_FREE_SPEED = 3.5; // 흘러나온 공의 속도
const STEAL_IMMUNE = 40;      // 빼앗기 뒤 누구도 다시 못 빼앗는 틱(공이 핑퐁하지 않게)
const STEAL_LOSER_LOCK = 24;  // 빼앗긴 사람이 다시 못 잡는 틱
const STEAL_FREE_LIFT = 1.2;  // 흘러나온 공이 살짝 뜨는 속도(세로)
const STEAL_FREE_CARRY = 0.4; // 흘러나온 공에 빼앗긴 사람 속도가 섞이는 비율
const STEAL_TACKLER_LOCK = 10;// 공만 흘려낸 사람도 잠깐 못 잡는 틱(흘린 공이 바로 그 사람 발에 붙지 않게)

// ── 패스(짧게 눌렀다 떼면) ──
const PASS_COS = 0.6;         // 보는 방향 ±53도 안의 동료만 본다
const PASS_MAX = 24;          // 이보다 먼 동료는 안 본다
const PASS_MIN = 2;           // 이보다 가까운 동료는 안 본다
const PASS_ARRIVE = 4.5;      // 동료에게 닿을 때 남는 속도(m/s) — 받기 좋은 세기("차는 게 아니라 건넨다")
const PASS_LEAD = 0.6;        // 뛰는 동료 앞으로 보내는 비율(1 = 도착 시각에 있을 자리)
const PASS_FREE_DIST = 9;     // 동료가 없을 때 보는 방향으로 이만큼 가게
const PASS_ERR = 0.05;        // 평균 선수의 방향 오차(옆으로, 단위 벡터 비율)
const PASS_TO_TICKS = 150;    // "누구에게 간 패스"를 기억하는 틱(봇이 받으러 간다)
const PASS_W_DIR = 10;        // 받을 사람 고르기: 보는 방향과 맞는 정도의 무게 — 올리면 방향이 거리보다 더 중요해진다
const PASS_W_DIST = 0.25;     // 받을 사람 고르기: 거리(m)마다 빼는 점수 — 올리면 가까운 동료를 고른다

// ── 슛(누르고 있으면 모이고, 떼면 나간다) ──
const CHARGE_TICKS = 54;      // 끝까지 모이는 틱(0.9초)
const SHOT_MIN = 13;          // 톡 친 슛 속도
const SHOT_MAX = 30;          // 꽉 채운 슛 속도
const LOFT_MIN = 0.6;         // 톡 친 슛의 뜨는 속도(세로)
const LOFT_MAX = 8.5;         // 꽉 채운 슛의 뜨는 속도 — 세기의 제곱으로 오른다(반쯤 찬 슛은 낮게 깔린다)
const AIM_COS = 0.7;          // 보는 방향이 골문 쪽 ±45도 안이면
const AIM_ASSIST = 0.55;      // 이 비율만큼 골문 안쪽으로 당긴다
const AIM_INSET = 0.45;       // 골대에서 이만큼 안쪽을 노린다

// ── 골키퍼 ──
const KEEPER_SPEED = 1.08;    // 골키퍼 최고 속도 배수
const KEEPER_DAMP = 0.88;     // 골키퍼는 더 바로 서고 바로 나간다
const KEEPER_REACH = 0.95;    // 손이 닿는 거리(몸 중심 → 공 중심, 바닥에서)
const KEEPER_REACH_Z = 2.3;   // 손이 닿는 높이
const KEEPER_CATCH = 18;      // 이보다 느린 공은 잡는다
const KEEPER_PARRY = 26;      // 이보다 느린 공은 쳐낸다. 더 빠르면 손이 못 따라간다(몸에 맞으면 튕긴다)
const KEEPER_HOLD = 60;       // 잡은 공을 들고 있는 틱(1초) — 그 뒤 봇이 패스
const KEEPER_LOCK = 20;       // 쳐낸 뒤 다시 못 잡는 틱
const PARRY_KEEP = 0.35;      // 쳐낸 공에 남는 속도 비율
const PARRY_OUT = 0.6;        // 쳐낸 공이 경기장 쪽(앞)으로 가는 비율
const PARRY_SIDE = 0.8;       // 쳐낸 공이 옆으로 비껴가는 비율
const PARRY_LIFT = 2.5;       // 쳐낸 공이 뜨는 속도(세로)
const KEEPER_HAND_Z = 0.9;    // 골키퍼가 든 공의 높이(그림)

// ── 경기 흐름 ──
const GOAL_TICKS = 150;       // 골 뒤 멈추는 틱(2.5초)
const KICKOFF_TIMEOUT = 180;  // 킥오프에서 아무도 안 건드려도 3초 뒤 시작
const KICKOFF_JITTER = 0.4;   // 킥오프 자리를 옆으로 이만큼(±) 흔든다(씨앗을 쓰는 자리)
const KICKOFF_GAP = 0.12;     // 킥오프 차는 사람이 공 뒤에 서는 틈 — 잡는 거리 안이라 첫 틱에 발밑으로 온다
const SUBSTEPS = 4;           // 한 틱을 쪼개 움직인다 — 30m/s 공이 쪼갠 한 번에 0.13m(공 반지름보다 작게)

/** 편성(0 편 기준, 1 편은 x 부호를 뒤집는다). slot 0 = 골키퍼, 1·2 = 뒤, 3·4 = 앞. 사람은 앞(3)에 선다. */
const FORMATION: { x: number; y: number }[] = [
  { x: -17, y: 0 }, { x: -11, y: -5 }, { x: -11, y: 5 }, { x: -4.5, y: -4 }, { x: -4.5, y: 4 },
];
// ═══════════════════════════════════════════════════════════════════════════════════════════════

export const TICK_HZ = 60;
const DT = 1 / TICK_HZ;
const SUB_DT = DT / SUBSTEPS;

/** 경기장·몸 크기 — 화면·봇·테스트가 읽는다. */
export const PITCH3D = {
  HW: HALF_LEN, HH: HALF_WID, goalHalfW: GOAL_HALF_W, goalH: GOAL_H, goalDepth: GOAL_DEPTH, postR: POST_R,
  boardH: BOARD_H, ceiling: CEILING, centerR: CENTER_R, playerR: PLAYER_R, playerH: PLAYER_H, ballR: BALL_R,
} as const;
/** 봇·화면이 쓰는 몇 가지 규칙 값(조절 값을 한 곳에만 두려고 여기서 내보낸다). */
export const RULES3D = {
  chargeTicks: CHARGE_TICKS, controlDist: PLAYER_R + BALL_R + CONTROL_REACH, keeperHold: KEEPER_HOLD,
  passCos: PASS_COS, passMax: PASS_MAX, rollDrag: ROLL_DRAG, goalTicks: GOAL_TICKS, keeperReach: KEEPER_REACH, kickAnim: KICK_ANIM,
} as const;

export type Side = 0 | 1;
/** 한 틱의 입력. x·y 는 경기장 방향(길이 0~1), shoot·pass 는 지금 누르고 있나(누름·뗌은 상태의 shootHeld·passHeld 와 비교해 안다). */
export type Input = { x: number; y: number; shoot: boolean; pass: boolean };
export const NO_INPUT: Input = { x: 0, y: 0, shoot: false, pass: false };
/** gk = 골키퍼(봇만). bot = 봇이 조종. */
export type MatchPlayer = { id: number; num: number; name: string; side: Side; bot: boolean; gk: boolean; perf: Perf };
export type MatchConfig = { minutes: number; players: MatchPlayer[] };
export type Ball = { x: number; y: number; z: number; vx: number; vy: number; vz: number };
/** fx·fy = 보는 방향(단위 벡터). charge = 슛을 누르고 있는 틱. noTouch = 공을 못 잡는 남은 틱. kickTicks = 찬 동작(화면이 기울인다).
 *  hold = 골키퍼가 잡은 공을 들고 있는 남은 틱. */
export type PlayerState = {
  id: number; x: number; y: number; vx: number; vy: number; fx: number; fy: number;
  charge: number; shootHeld: boolean; passHeld: boolean; noTouch: number; kickTicks: number; hold: number;
};
export type Phase = 'kickoff' | 'play' | 'goal' | 'end';
export type KickKind = 'pass' | 'shot';
export type MatchState = {
  tick: number; phase: Phase; phaseTicks: number;
  score: [number, number]; ticksLeft: number;
  ball: Ball; players: PlayerState[];
  /** 공을 발밑에 둔 사람(없으면 null). */
  owner: number | null;
  /** 지금 굴러가는 패스의 받을 사람(봇이 받으러 간다). passTicks 가 0 이 되거나 누가 공을 잡으면 지운다. */
  passTo: number | null; passTicks: number;
  /** 빼앗기 뒤 아무도 빼앗을 수 없는 남은 틱. */
  stealLock: number;
  lastTouch: number | null;
  lastKick: { by: number; kind: KickKind; tick: number } | null;
  lastScorer: number | null;
  kickoffSide: Side; winner: Side | 'draw' | null;
  /** 경기 기록(테스트·화면용). [0 편, 1 편]. */
  count: { passes: [number, number]; shots: [number, number]; steals: [number, number] };
  seed: number;
};
export type MatchEvent =
  | { type: 'kick'; by: number; kind: KickKind }
  | { type: 'goal'; side: Side; scorer: number | null }
  | { type: 'end'; winner: Side | 'draw' };

/** 0 편이면 +1(오른쪽으로 공격), 1 편이면 -1. */
export const attackDir = (side: Side): 1 | -1 => (side === 0 ? 1 : -1);

/** 편성 자리(slot 0 = 골키퍼). 1 편은 좌우를 뒤집는다. 봇이 쉬는 자리를 잡을 때도 쓴다. */
export function formationSpot(slot: number, side: Side): { x: number; y: number } {
  const s = FORMATION[Math.min(Math.max(slot, 0), FORMATION.length - 1)];
  return { x: side === 0 ? s.x : 0 - s.x, y: s.y };
}

/** 편 안 순번(slot). config.players 순서대로 편마다 0, 1, 2… */
export function slotOf(config: MatchConfig, id: number): number {
  const me = config.players[id];
  let k = 0;
  for (const p of config.players) { if (p.id === id) return k; if (p.side === me.side) k++; }
  return 0;
}

/** 상태 안의 씨앗에서 0 이상 1 미만 값 하나(mulberry32). 상태를 직접 바꾸므로 복사본에만. */
function rand(s: MatchState): number {
  s.seed = (s.seed + 0x6d2b79f5) >>> 0;
  let t = s.seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const fin = (v: number): number => (Number.isFinite(v) ? v : 0);
const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

function clone(s: MatchState): MatchState {
  return {
    ...s,
    score: [s.score[0], s.score[1]],
    ball: { ...s.ball },
    players: s.players.map((p) => ({ ...p })),
    lastKick: s.lastKick ? { ...s.lastKick } : null,
    count: { passes: [s.count.passes[0], s.count.passes[1]], shots: [s.count.shots[0], s.count.shots[1]], steals: [s.count.steals[0], s.count.steals[1]] },
  };
}

/** 킥오프 차는 사람 — 그 편의 사람(봇이 아닌 필드 선수), 없으면 마지막 필드 자리. */
function kickoffTaker(config: MatchConfig, side: Side): number {
  const mine = config.players.filter((p) => p.side === side && !p.gk);
  const human = mine.find((p) => !p.bot);
  return (human ?? mine[mine.length - 1] ?? config.players.find((p) => p.side === side))?.id ?? -1;
}

function placeForKickoff(s: MatchState, config: MatchConfig): void {
  s.ball = { x: 0, y: 0, z: BALL_R, vx: 0, vy: 0, vz: 0 };
  const taker = kickoffTaker(config, s.kickoffSide);
  config.players.forEach((mp, i) => {
    const p = s.players[i];
    const spot = formationSpot(slotOf(config, mp.id), mp.side);
    const dir = attackDir(mp.side);
    p.x = spot.x; p.y = spot.y + (mp.gk ? 0 : (rand(s) - 0.5) * 2 * KICKOFF_JITTER);
    if (mp.id === taker) { p.x = 0 - dir * (PLAYER_R + BALL_R + KICKOFF_GAP); p.y = 0; }
    p.vx = 0; p.vy = 0; p.fx = dir; p.fy = 0;
    p.charge = 0; p.shootHeld = false; p.passHeld = false; p.noTouch = 0; p.kickTicks = 0; p.hold = 0;
  });
  s.owner = null; s.passTo = null; s.passTicks = 0; s.stealLock = 0; s.lastTouch = null; s.lastKick = null;
}

export function createMatch(config: MatchConfig, seed: number): MatchState {
  const s: MatchState = {
    tick: 0, phase: 'kickoff', phaseTicks: 0,
    score: [0, 0], ticksLeft: Math.max(1, Math.round(config.minutes * 60 * TICK_HZ)),
    ball: { x: 0, y: 0, z: BALL_R, vx: 0, vy: 0, vz: 0 },
    players: config.players.map((mp) => ({
      id: mp.id, x: 0, y: 0, vx: 0, vy: 0, fx: attackDir(mp.side), fy: 0,
      charge: 0, shootHeld: false, passHeld: false, noTouch: 0, kickTicks: 0, hold: 0,
    })),
    owner: null, passTo: null, passTicks: 0, stealLock: 0, lastTouch: null, lastKick: null, lastScorer: null,
    kickoffSide: 0, winner: null,
    count: { passes: [0, 0], shots: [0, 0], steals: [0, 0] },
    seed: seed >>> 0,
  };
  placeForKickoff(s, config);
  return s;
}

// ───────────────────────────── 작은 도구 ─────────────────────────────

/** 길이를 1로. 0 벡터면 fallback. */
function unit(x: number, y: number, fx: number, fy: number): { x: number; y: number } {
  const l = Math.sqrt(x * x + y * y);
  return l > 1e-6 ? { x: x / l, y: y / l } : { x: fx, y: fy };
}

/** 보는 방향 f 를 목표 방향 d 쪽으로 rate 만큼 돌린다(정규화 선형 보간 — 삼각함수 없이). 정반대면 옆으로 먼저 튼다. */
function turnToward(p: PlayerState, dx: number, dy: number, rate: number): void {
  let tx = dx, ty = dy;
  if (p.fx * dx + p.fy * dy < -0.95) { tx = dx + 0 - p.fy * 0.6; ty = dy + p.fx * 0.6; }   // 정반대 — 그냥 섞으면 0 을 지나 뒤집힌다
  const u = unit(p.fx + (tx - p.fx) * rate, p.fy + (ty - p.fy) * rate, p.fx, p.fy);
  p.fx = u.x; p.fy = u.y;
}

/** 발밑 공이 놓일 자리 — 보는 방향 앞, 달리면 조금 더 앞. */
export function carrySpot(p: { x: number; y: number; vx: number; vy: number; fx: number; fy: number }): { x: number; y: number } {
  const sp = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
  const d = PLAYER_R + BALL_R + CARRY_GAP + sp * CARRY_LEAD;
  return { x: p.x + p.fx * d, y: p.y + p.fy * d };
}

// ───────────────────────────── 충돌 ─────────────────────────────

/** 바닥 위 원 둘. 겹친 만큼 질량 반비례로 밀고, 다가오던 속도에 반발. */
function collidePlayers(a: PlayerState, ma: number, b: PlayerState, mb: number): boolean {
  const dx = b.x - a.x, dy = b.y - a.y, min = PLAYER_R * 2;
  const d2 = dx * dx + dy * dy;
  if (d2 >= min * min) return false;
  const d = Math.sqrt(d2);
  const nx = d > 1e-6 ? dx / d : 1, ny = d > 1e-6 ? dy / d : 0;
  const ia = 1 / ma, ib = 1 / mb, sum = ia + ib, over = min - d;
  a.x -= nx * over * (ia / sum); a.y -= ny * over * (ia / sum);
  b.x += nx * over * (ib / sum); b.y += ny * over * (ib / sum);
  const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (vn < 0) {
    const j = (-(1 + PLAYER_E) * vn) / sum;
    a.vx -= j * ia * nx; a.vy -= j * ia * ny; b.vx += j * ib * nx; b.vy += j * ib * ny;
  }
  return true;
}

/** 공(구)과 선분(골대 기둥·크로스바, 굵기 POST_R). 가장 가까운 점에서 밀어내고 반발. */
function ballVsSegment(b: Ball, ax: number, ay: number, az: number, bx: number, by: number, bz: number): void {
  const ex = bx - ax, ey = by - ay, ez = bz - az;
  const len2 = ex * ex + ey * ey + ez * ez;
  let t = ((b.x - ax) * ex + (b.y - ay) * ey + (b.z - az) * ez) / len2;
  t = clamp(t, 0, 1);
  const cx = ax + ex * t, cy = ay + ey * t, cz = az + ez * t;
  const dx = b.x - cx, dy = b.y - cy, dz = b.z - cz;
  const min = BALL_R + POST_R;
  const d2 = dx * dx + dy * dy + dz * dz;
  if (d2 >= min * min) return;
  const d = Math.sqrt(d2);
  const nx = d > 1e-6 ? dx / d : 0 - Math.sign(b.x || 1), ny = d > 1e-6 ? dy / d : 0, nz = d > 1e-6 ? dz / d : 0;
  b.x = cx + nx * min; b.y = cy + ny * min; b.z = cz + nz * min;
  const vn = b.vx * nx + b.vy * ny + b.vz * nz;
  if (vn < 0) { b.vx -= (1 + POST_E) * vn * nx; b.vy -= (1 + POST_E) * vn * ny; b.vz -= (1 + POST_E) * vn * nz; }
}

/** 공을 경기장 안에 가둔다 — 땅·옆 벽·끝 벽(골문 자리 빼고)·천장, 골문 안이면 그물 상자. */
function containBall(b: Ball): void {
  const HW = HALF_LEN, HH = HALF_WID, R = BALL_R;
  // 땅 — 튕기거나 구른다
  if (b.z < R) {
    b.z = R;
    if (b.vz < 0) {
      if (0 - b.vz > BOUNCE_STOP) { b.vz = 0 - b.vz * BOUNCE_E; b.vx *= BOUNCE_KEEP; b.vy *= BOUNCE_KEEP; }
      else b.vz = 0;
    }
  }
  if (b.z > CEILING - R) { b.z = CEILING - R; if (b.vz > 0) b.vz = 0 - b.vz * BOARD_E; }
  // 옆 벽(높이와 상관없이 — 벽 위는 보이지 않는 벽)
  if (b.y > HH - R) { b.y = HH - R; if (b.vy > 0) b.vy = 0 - b.vy * BOARD_E; }
  if (b.y < -HH + R) { b.y = -HH + R; if (b.vy < 0) b.vy = 0 - b.vy * BOARD_E; }
  // 끝 벽 — 골문(폭·높이) 안으로 들어온 공은 그물 상자 안에 가두고, 나머지(골대 옆·크로스바 위)는 튕긴다
  if (Math.abs(b.x) > HW - R) {
    const sgn = b.x > 0 ? 1 : -1;
    const inMouth = Math.abs(b.y) < GOAL_HALF_W && b.z < GOAL_H;
    if (inMouth) {
      const gy = GOAL_HALF_W - R;
      if (Math.abs(b.x) > HW) {
        // 골라인을 넘은 공만 옆·위 그물에 닿는다 — 골라인 앞에선 골대(ballVsSegment)가 막는다
        if (b.y > gy) { b.y = gy; if (b.vy > 0) b.vy = 0 - b.vy * NET_E; }
        if (b.y < -gy) { b.y = -gy; if (b.vy < 0) b.vy = 0 - b.vy * NET_E; }
        if (b.z > GOAL_H - R) { b.z = GOAL_H - R; if (b.vz > 0) b.vz = 0 - b.vz * NET_E; }
      }
      const back = HW + GOAL_DEPTH - R;
      if (Math.abs(b.x) > back) { b.x = sgn * back; if (b.vx * sgn > 0) { b.vx = 0 - b.vx * NET_E; b.vy *= 0.5; } }
    } else {
      b.x = sgn * (HW - R);
      if (b.vx * sgn > 0) b.vx = 0 - b.vx * BOARD_E;
    }
  }
  // 골대: 기둥 둘·크로스바(양쪽 골)
  for (const sx of [1, -1]) {
    const x = sx * HW;
    ballVsSegment(b, x, -GOAL_HALF_W, 0, x, -GOAL_HALF_W, GOAL_H);
    ballVsSegment(b, x, GOAL_HALF_W, 0, x, GOAL_HALF_W, GOAL_H);
    ballVsSegment(b, x, -GOAL_HALF_W, GOAL_H, x, GOAL_HALF_W, GOAL_H);
  }
}

/** 선수를 벽 안에(골라인 안쪽까지만 — 골대 안으로는 못 들어간다). */
function containPlayer(p: PlayerState): void {
  const lx = HALF_LEN - PLAYER_R, ly = HALF_WID - PLAYER_R;
  if (p.x > lx) { p.x = lx; if (p.vx > 0) p.vx = 0; }
  if (p.x < -lx) { p.x = -lx; if (p.vx < 0) p.vx = 0; }
  if (p.y > ly) { p.y = ly; if (p.vy > 0) p.vy = 0; }
  if (p.y < -ly) { p.y = -ly; if (p.vy < 0) p.vy = 0; }
}

/** 킥오프 규칙 — 모두 자기 진영, 차지 않는 편은 가운데 원 밖. 누가 공을 잡으면(phase → play) 풀린다. */
function kickoffLimits(s: MatchState, config: MatchConfig): void {
  const keep = CENTER_R + PLAYER_R;
  config.players.forEach((mp, i) => {
    const p = s.players[i];
    if (mp.side === 0 && p.x > 0) { p.x = 0; if (p.vx > 0) p.vx = 0; }
    if (mp.side === 1 && p.x < 0) { p.x = 0; if (p.vx < 0) p.vx = 0; }
    if (mp.side !== s.kickoffSide) {
      const d2 = p.x * p.x + p.y * p.y;
      if (d2 < keep * keep) {
        const d = Math.sqrt(d2);
        const nx = d > 1e-6 ? p.x / d : 0 - attackDir(mp.side), ny = d > 1e-6 ? p.y / d : 0;
        p.x = nx * keep; p.y = ny * keep;
        const vn = p.vx * nx + p.vy * ny;
        if (vn < 0) { p.vx -= vn * nx; p.vy -= vn * ny; }
      }
    }
  });
}

// ───────────────────────────── 차기 ─────────────────────────────

/** 이 사람이 지금 공을 찰 수 있나 — 발밑에 있거나, 아무도 안 가진 공이 바로 앞 낮게 있다(논스톱). */
function canKick(s: MatchState, i: number): boolean {
  if (s.owner === i) return true;
  if (s.owner !== null) return false;
  const p = s.players[i], b = s.ball;
  if (p.noTouch > 0 || b.z > FIRST_TOUCH_Z) return false;
  const dx = b.x - p.x, dy = b.y - p.y, r = RULES3D.controlDist + FIRST_TOUCH_REACH;
  return dx * dx + dy * dy < r * r;
}

function releaseBall(s: MatchState, i: number, kind: KickKind): void {
  const p = s.players[i];
  s.owner = null; p.noTouch = KICK_LOCK; p.kickTicks = KICK_ANIM; p.hold = 0;
  s.lastTouch = i; s.lastKick = { by: i, kind, tick: s.tick };
}

/** 슛 — 보는 방향으로, 세기(0~1)만큼 빠르고 높게. 골문 쪽을 대충 보고 있으면 골문 안쪽으로 조금 당긴다. */
function shoot(s: MatchState, config: MatchConfig, i: number, c: number): void {
  const p = s.players[i], mp = config.players[i], b = s.ball;
  const dir = attackDir(mp.side);
  let ux = p.fx, uy = p.fy;
  const gx = dir * HALF_LEN;
  const tg = unit(gx - b.x, 0 - b.y, dir, 0);
  if (ux * tg.x + uy * tg.y > AIM_COS && ux * dir > 0.05) {
    // 보는 방향이 골라인을 지나는 곳 — 골문 안쪽으로 자른 점을 노린다
    const yCross = b.y + (uy * (gx - b.x)) / ux;
    const ty = clamp(yCross, -GOAL_HALF_W + AIM_INSET, GOAL_HALF_W - AIM_INSET);
    const want = unit(gx - b.x, ty - b.y, ux, uy);
    const u = unit(ux + (want.x - ux) * AIM_ASSIST, uy + (want.y - uy) * AIM_ASSIST, ux, uy);
    ux = u.x; uy = u.y;
  }
  const cc = clamp(c, 0, 1);
  const sp = (SHOT_MIN + (SHOT_MAX - SHOT_MIN) * cc) * mp.perf.shot;
  if (p.hold > 0) b.z = BALL_R;   // 골키퍼가 들고 있던 공은 발 앞에 떨어뜨려 찬다
  b.vx = ux * sp; b.vy = uy * sp; b.vz = LOFT_MIN + (LOFT_MAX - LOFT_MIN) * cc * cc;
  releaseBall(s, i, 'shot');
  s.passTo = null; s.passTicks = 0;
  s.count.shots[mp.side] += 1;
}

/** 패스 대상 — 보는 방향 원뿔 안 동료 중 방향이 잘 맞고 가까운 사람. 없으면 -1. 봇도 이걸로 "누가 받을지"를 미리 본다. */
export function passTarget(s: MatchState, config: MatchConfig, i: number): number {
  const p = s.players[i], side = config.players[i].side;
  let best = -1, bestScore = -Infinity;
  for (const q of config.players) {
    if (q.id === i || q.side !== side) continue;
    const m = s.players[q.id];
    const dx = m.x - p.x, dy = m.y - p.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < PASS_MIN || d > PASS_MAX) continue;
    const cos = (dx * p.fx + dy * p.fy) / d;
    if (cos < PASS_COS) continue;
    const score = cos * PASS_W_DIR - d * PASS_W_DIST;   // 방향이 먼저, 거리는 그다음
    if (score > bestScore) { bestScore = score; best = q.id; }
  }
  return best;
}

/** 땅볼 패스 — 받는 사람 앞(뛰는 쪽)으로, 닿을 때 PASS_ARRIVE 가 남게 세기를 맞춘다.
 *  구르는 공은 v ← v·(1 − k·dt) 로 줄어 v0 에서 v 까지 정확히 (v0 − v)/k 를 간다 → v0 = v + k·거리. */
function pass(s: MatchState, config: MatchConfig, i: number): void {
  const p = s.players[i], mp = config.players[i], b = s.ball;
  const t = passTarget(s, config, i);
  let ux = p.fx, uy = p.fy, dist = PASS_FREE_DIST;
  if (t >= 0) {
    const m = s.players[t];
    let tx = m.x, ty = m.y;
    // 도착 시각을 한 번 어림해 그만큼 앞으로(되풀이 없이 — 대충이면 충분하다)
    for (let k = 0; k < 2; k++) {
      const d = Math.sqrt((tx - b.x) * (tx - b.x) + (ty - b.y) * (ty - b.y));
      const v0 = PASS_ARRIVE + ROLL_DRAG * d;
      const time = d / ((v0 + PASS_ARRIVE) / 2);
      tx = m.x + m.vx * time * PASS_LEAD; ty = m.y + m.vy * time * PASS_LEAD;
    }
    tx = clamp(tx, -HALF_LEN + 0.5, HALF_LEN - 0.5); ty = clamp(ty, -HALF_WID + 0.5, HALF_WID - 0.5);
    const u = unit(tx - b.x, ty - b.y, p.fx, p.fy);
    ux = u.x; uy = u.y;
    dist = Math.sqrt((tx - b.x) * (tx - b.x) + (ty - b.y) * (ty - b.y));
  }
  // 정확도 — 옆으로 조금 빗나간다(패스 능력치가 높을수록 덜)
  const err = (rand(s) - 0.5) * 2 * PASS_ERR * (2 - mp.perf.pass);
  const e = unit(ux + (0 - uy) * err, uy + ux * err, ux, uy);
  const v0 = PASS_ARRIVE + ROLL_DRAG * dist;
  b.z = BALL_R; b.vx = e.x * v0; b.vy = e.y * v0; b.vz = 0;
  releaseBall(s, i, 'pass');
  s.passTo = t >= 0 ? t : null; s.passTicks = t >= 0 ? PASS_TO_TICKS : 0;
  s.count.passes[mp.side] += 1;
}

// ───────────────────────────── 한 틱 ─────────────────────────────

/** 이동: 입력 방향으로 gain 을 더하고 감쇠를 곱한다(정상 상태 = 최고 속도). */
function steer(p: PlayerState, mp: MatchPlayer, ix0: number, iy0: number, mult: number): void {
  let ix = fin(ix0), iy = fin(iy0);
  const len = Math.sqrt(ix * ix + iy * iy);
  if (len > 1) { ix /= len; iy /= len; }
  const damp = mp.gk ? KEEPER_DAMP : PLAYER_DAMP;
  const top = mp.perf.maxSpeed * (mp.gk ? KEEPER_SPEED : 1) * mult;
  const gain = (top * (1 - damp)) / damp;
  p.vx = (p.vx + ix * gain) * damp;
  p.vy = (p.vy + iy * gain) * damp;
  if (len < 0.05 && p.vx * p.vx + p.vy * p.vy < 0.01) { p.vx = 0; p.vy = 0; }
}

/** 아무도 안 가진 공 — 잡기(가까운 한 명)·골키퍼 잡기/쳐내기·몸에 맞기. 쪼갠 한 번마다. */
function touchFreeBall(s: MatchState, config: MatchConfig, controlled: boolean): void {
  const b = s.ball;
  let pick = -1, pickD2 = Infinity;
  const ctl = RULES3D.controlDist;
  for (let i = 0; i < s.players.length; i++) {
    const p = s.players[i], mp = config.players[i];
    if (p.noTouch > 0) continue;
    const dx = b.x - p.x, dy = b.y - p.y, d2 = dx * dx + dy * dy;
    const rvx = b.vx - p.vx, rvy = b.vy - p.vy, rel2 = rvx * rvx + rvy * rvy + b.vz * b.vz;
    if (mp.gk && controlled && d2 < KEEPER_REACH * KEEPER_REACH && b.z < KEEPER_REACH_Z) {
      const sp2 = b.vx * b.vx + b.vy * b.vy + b.vz * b.vz;
      if (sp2 < KEEPER_CATCH * KEEPER_CATCH) { if (d2 < pickD2) { pick = i; pickD2 = d2; } continue; }
      if (sp2 < KEEPER_PARRY * KEEPER_PARRY) {
        // 쳐내기 — 경기장 쪽으로, 옆으로 비껴 힘을 잃고 나간다
        const dir = attackDir(mp.side);
        const side = b.y >= p.y ? 1 : -1;
        const sp = Math.sqrt(sp2) * PARRY_KEEP;
        b.vx = dir * sp * PARRY_OUT; b.vy = side * sp * PARRY_SIDE; b.vz = PARRY_LIFT;
        p.noTouch = KEEPER_LOCK; s.lastTouch = i; s.passTo = null;
        continue;
      }
    }
    if (controlled && d2 < ctl * ctl && b.z < PICKUP_MAX_Z && rel2 < PICKUP_MAX_REL * PICKUP_MAX_REL) {
      if (d2 < pickD2) { pick = i; pickD2 = d2; }
      continue;
    }
    // 몸에 맞기(받을 수 없는 빠르거나 높은 공) — 몸은 움직이지 않는 원기둥으로 본다
    const min = PLAYER_R + BALL_R;
    if (b.z < PLAYER_H && d2 < min * min) {
      const d = Math.sqrt(d2);
      const nx = d > 1e-6 ? dx / d : 1, ny = d > 1e-6 ? dy / d : 0;
      b.x = p.x + nx * min; b.y = p.y + ny * min;
      const vn = rvx * nx + rvy * ny;
      if (vn < 0) { b.vx -= (1 + BODY_E) * vn * nx; b.vy -= (1 + BODY_E) * vn * ny; }
      if (controlled) s.lastTouch = i;
    }
  }
  if (pick >= 0) {
    const p = s.players[pick];
    s.owner = pick; s.lastTouch = pick; s.passTo = null; s.passTicks = 0;
    if (config.players[pick].gk) p.hold = KEEPER_HOLD;
    b.vz = 0;
  }
}

/** 공 가진 사람에게 상대가 몸으로 붙으면 — 빼앗거나 흘러나온다. 한 틱에 한 번. */
function tryTackle(s: MatchState, config: MatchConfig): void {
  const o = s.owner;
  if (o === null || s.stealLock > 0) return;
  const op = s.players[o], omp = config.players[o];
  if (op.hold > 0) return;   // 골키퍼가 든 공은 못 뺏는다
  const b = s.ball;
  for (let i = 0; i < s.players.length; i++) {
    const mp = config.players[i];
    if (mp.side === omp.side) continue;
    const q = s.players[i];
    if (q.noTouch > 0) continue;
    const bx = b.x - q.x, by = b.y - q.y, px = op.x - q.x, py = op.y - q.y;
    const rb = PLAYER_R + BALL_R + STEAL_REACH, rp = PLAYER_R * 2 + STEAL_REACH;
    if (bx * bx + by * by > rb * rb && px * px + py * py > rp * rp) continue;
    const win = STEAL_WIN * mp.perf.tackle / omp.perf.mass;
    s.stealLock = STEAL_IMMUNE;
    op.noTouch = STEAL_LOSER_LOCK;
    if (rand(s) < win) {
      s.owner = i; s.lastTouch = i;
      s.count.steals[mp.side] += 1;
    } else {
      // 흘러나온다 — 부딪친 사람 반대쪽으로, 둘 다 잠깐 못 잡는다
      const u = unit(b.x - q.x, b.y - q.y, 0 - attackDir(mp.side), 0);
      b.vx = u.x * STEAL_FREE_SPEED + op.vx * STEAL_FREE_CARRY; b.vy = u.y * STEAL_FREE_SPEED + op.vy * STEAL_FREE_CARRY; b.vz = STEAL_FREE_LIFT;
      s.owner = null; q.noTouch = STEAL_TACKLER_LOCK; s.lastTouch = i;
    }
    s.passTo = null; s.passTicks = 0;
    return;
  }
}

/** 한 틱 진행. 받은 state 는 건드리지 않고 새 state 를 돌려준다. */
export function step(state: MatchState, config: MatchConfig, inputs: Input[]): MatchState {
  const s = clone(state);
  s.tick += 1;
  s.phaseTicks += 1;
  const controlled = s.phase === 'kickoff' || s.phase === 'play';
  const n = s.players.length;
  const mass = config.players.map((mp) => PLAYER_MASS * mp.perf.mass);
  if (s.stealLock > 0) s.stealLock -= 1;
  if (s.passTicks > 0) { s.passTicks -= 1; if (s.passTicks === 0) s.passTo = null; }

  // 1) 입력 → 속도·보는 방향·차기
  for (let i = 0; i < n; i++) {
    const p = s.players[i], mp = config.players[i];
    const inp = controlled ? (inputs[i] ?? NO_INPUT) : NO_INPUT;
    if (p.noTouch > 0) p.noTouch -= 1;
    if (p.kickTicks > 0) p.kickTicks -= 1;
    if (p.hold > 0) p.hold -= 1;
    const has = s.owner === i;
    const ix = fin(inp.x), iy = fin(inp.y);
    const il = Math.sqrt(ix * ix + iy * iy);
    const mult = (has ? CARRY_SPEED : 1) * (inp.shoot ? CHARGE_SPEED : 1);
    steer(p, mp, ix, iy, mult);
    if (il > 0.15) {
      const dx = ix / il, dy = iy / il;
      // 달리다 급히 꺾으면 공이 떨어질 수 있다(공 간수가 좋으면 덜)
      if (has && p.hold === 0) {
        const sp2 = p.vx * p.vx + p.vy * p.vy;
        if (sp2 > LOOSE_SPEED * LOOSE_SPEED && dx * p.fx + dy * p.fy < LOOSE_COS && rand(s) < LOOSE_P * (2 - mp.perf.control)) {
          const b = s.ball;
          b.vx = p.vx * LOOSE_KEEP; b.vy = p.vy * LOOSE_KEEP; b.vz = 0;
          s.owner = null; p.noTouch = LOOSE_LOCK;
        }
      }
      turnToward(p, dx, dy, s.owner === i ? TURN_RATE_BALL : TURN_RATE);
    }
    // 슛: 누르는 동안 모으고, 떼는 순간 찬다. 패스: 뗄 때 찬다. 찰 수 없으면 그냥 풀린다.
    const shootNow = !!inp.shoot, passNow = !!inp.pass;
    if (shootNow) p.charge = Math.min(CHARGE_TICKS, p.charge + 1);
    if (p.shootHeld && !shootNow) {
      if (controlled && canKick(s, i)) shoot(s, config, i, p.charge / CHARGE_TICKS);
      p.charge = 0;
    } else if (p.passHeld && !passNow) {
      if (controlled && canKick(s, i)) pass(s, config, i);
    }
    p.shootHeld = shootNow; p.passHeld = passNow;
  }

  // 2) 움직임과 충돌 — 한 틱을 쪼개서
  for (let k = 0; k < SUBSTEPS; k++) {
    for (const p of s.players) { p.x += p.vx * SUB_DT; p.y += p.vy * SUB_DT; }
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) collidePlayers(s.players[i], mass[i], s.players[j], mass[j]);
    for (const p of s.players) containPlayer(p);
    if (s.phase === 'kickoff') kickoffLimits(s, config);
    if (s.owner === null) {
      const b = s.ball;
      b.vz -= GRAVITY * SUB_DT;
      b.x += b.vx * SUB_DT; b.y += b.vy * SUB_DT; b.z += b.vz * SUB_DT;
      containBall(b);
      touchFreeBall(s, config, controlled);
    }
  }

  // 3) 발밑 공 — 보는 방향 앞에 둔다(바로 붙이지 않고 당겨 와서 받는 순간이 튀지 않게). 그다음 빼앗기.
  if (s.owner !== null) {
    const p = s.players[s.owner], b = s.ball;
    const c = carrySpot(p);
    b.x += (c.x - b.x) * CARRY_PULL; b.y += (c.y - b.y) * CARRY_PULL;
    b.vx = p.vx; b.vy = p.vy; b.vz = 0;
    b.z = p.hold > 0 ? KEEPER_HAND_Z : BALL_R;   // 골키퍼는 손에 든다
    containBall(b);
    if (controlled) tryTackle(s, config);
  } else {
    // 구르기·공기 감속
    const b = s.ball;
    const onGround = b.z <= BALL_R + 1e-6 && b.vz === 0;
    const keep = 1 - (onGround ? ROLL_DRAG : AIR_DRAG) * DT;
    b.vx *= keep; b.vy *= keep;
    if (!onGround) b.vz *= 1 - AIR_DRAG * DT;
    const sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy + b.vz * b.vz);
    if (sp > BALL_MAX_SPEED) { const m = BALL_MAX_SPEED / sp; b.vx *= m; b.vy *= m; b.vz *= m; }
    if (onGround && b.vx * b.vx + b.vy * b.vy < BALL_REST * BALL_REST) { b.vx = 0; b.vy = 0; }
  }
  guard(s);

  // 4) 단계
  if (s.phase === 'kickoff') {
    const moved = s.ball.x * s.ball.x + s.ball.y * s.ball.y > 0.25;
    if (s.owner !== null || moved || s.phaseTicks >= KICKOFF_TIMEOUT) { s.phase = 'play'; s.phaseTicks = 0; }
  } else if (s.phase === 'play') {
    s.ticksLeft -= 1;
    const b = s.ball;
    if (Math.abs(b.x) > HALF_LEN && Math.abs(b.y) < GOAL_HALF_W && b.z < GOAL_H) {
      // 공 중심이 골라인을 넘었고 골문(폭·높이) 안이다. 오른쪽 골대(+x)에 들어가면 0 편 득점.
      const side: Side = b.x > 0 ? 0 : 1;
      s.score[side] += 1;
      const lt = s.lastTouch;
      s.lastScorer = lt !== null && config.players[lt].side === side ? lt : null;   // 자책이면 null
      s.kickoffSide = side === 0 ? 1 : 0;
      s.owner = null; s.passTo = null;
      s.phase = 'goal'; s.phaseTicks = 0;
    } else if (s.ticksLeft <= 0) finish(s);
  } else if (s.phase === 'goal') {
    if (s.phaseTicks >= GOAL_TICKS) {
      if (s.ticksLeft <= 0) finish(s);
      else { placeForKickoff(s, config); s.phase = 'kickoff'; s.phaseTicks = 0; }
    }
  }
  return s;
}

function finish(s: MatchState): void {
  s.phase = 'end'; s.phaseTicks = 0;
  s.winner = s.score[0] > s.score[1] ? 0 : s.score[1] > s.score[0] ? 1 : 'draw';
}

/** 마지막 안전망 — 숫자가 깨지거나 몸이 판을 벗어났을 때만 되돌린다. 정상이면 아무 일도 안 한다. */
function guard(s: MatchState): void {
  const b = s.ball;
  if (!Number.isFinite(b.x + b.y + b.z + b.vx + b.vy + b.vz)) { b.x = 0; b.y = 0; b.z = BALL_R; b.vx = 0; b.vy = 0; b.vz = 0; s.owner = null; }
  const maxX = HALF_LEN + GOAL_DEPTH - BALL_R;
  b.x = clamp(b.x, -maxX, maxX); b.y = clamp(b.y, -HALF_WID + BALL_R, HALF_WID - BALL_R); b.z = clamp(b.z, BALL_R, CEILING - BALL_R);
  if (Math.abs(b.x) > HALF_LEN && Math.abs(b.y) > GOAL_HALF_W) { b.x = b.x > 0 ? HALF_LEN - BALL_R : BALL_R - HALF_LEN; b.vx = 0; }
  for (const p of s.players) {
    if (!Number.isFinite(p.x + p.y + p.vx + p.vy)) { p.x = 0; p.y = 0; p.vx = 0; p.vy = 0; }
    if (!Number.isFinite(p.fx + p.fy) || p.fx * p.fx + p.fy * p.fy < 0.5) { p.fx = 1; p.fy = 0; }
    containPlayer(p);
  }
}

/** prev → next 사이에 생긴 사건. */
export function eventsBetween(prev: MatchState, next: MatchState): MatchEvent[] {
  const out: MatchEvent[] = [];
  const k = next.lastKick;
  if (k && (!prev.lastKick || prev.lastKick.tick !== k.tick || prev.lastKick.by !== k.by)) out.push({ type: 'kick', by: next.players[k.by]?.id ?? k.by, kind: k.kind });
  for (const side of [0, 1] as const)
    for (let g = prev.score[side]; g < next.score[side]; g++)
      out.push({ type: 'goal', side, scorer: g === next.score[side] - 1 ? next.lastScorer : null });
  if (prev.phase !== 'end' && next.phase === 'end' && next.winner !== null) out.push({ type: 'end', winner: next.winner });
  return out;
}
