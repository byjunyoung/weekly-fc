// src/lib/game/sim.ts — 축구 게임의 경기 계산(2026-11-06). 상태 하나와 "한 틱 진행"이 전부다.
// 설계: docs/superpowers/specs/2026-11-06-game-design.md §3·§4
//
// 이 파일은 순수해야 한다 — 화면·입력·시계·난수 함수·타이머를 하나도 부르지 않는다.
// 2단계에서 방장 기기가 이 step() 을 그대로 돌려 상태를 나눠 주고, 다른 사람은 입력만 보낸다.
// 같은 씨앗 + 같은 입력이면 같은 결과여야 그게 된다. 그래서 두 가지를 지킨다.
//   1) 난수는 상태 안의 seed(uint32)에서만 뽑는다(rand). 상태는 JSON 으로 그대로 오갈 수 있는 값만 담는다.
//   2) 브라우저마다 끝자리가 달라질 수 있는 sin·cos·exp·hypot 대신 사칙연산과 sqrt(정확히 반올림되는 연산)만 쓴다.
//
// 단위: 길이는 논리 단위(보통 경기장 1200 × 720 — 크기는 경기마다 config.field), 속도는 단위/초, 시간은 틱(1/60초).
// 원점은 경기장 가운데, x 가 긴 쪽. 0 편은 왼쪽(x<0)에서 시작해 오른쪽 골대(x=+w/2)로 공격한다.
import type { Perf } from './stats.ts';

// ═══════════════════════════ 조절 값 (느낌을 바꾸려면 여기만 고친다) ═══════════════════════════
// 값은 이 경기장(1200×720, 선수 반지름 22, 공 반지름 12)에서 직접 해 보며 잡은 것이다.
// 다른 게임의 값을 가져오지 않는다(스펙 §2).

// ── 경기장 크기(2026-11-07 "최대 인원 같은거 헥스볼처럼 자유롭게 맵 크기도 크기별로 하고") ──
// 스펙 2026-11-07-game-fields-teams-design.md §1. 크기는 우리 값이다(다른 게임의 경기장 치수를 가져오지 않는다).
// 크기마다 다른 것은 가로·세로·골문 폭·가운데 원뿐이고, 몸·공·골 깊이·기둥·선 밖 여백은 모든 크기에서 같다.
export type FieldId = 'S' | 'M' | 'L' | 'XL';
export const FIELD_IDS: readonly FieldId[] = ['S', 'M', 'L', 'XL'];
const FIELD_DIMS: Record<FieldId, { w: number; h: number; goalW: number; centerR: number }> = {
  S: { w: 900, h: 540, goalW: 170, centerR: 70 },      // 작게 — 경기장 위 4명까지
  M: { w: 1200, h: 720, goalW: 200, centerR: 90 },     // 보통 — 6명까지(1단계부터 쓰던 것). 골문은 선수 지름(44)의 4.5배
  L: { w: 1560, h: 900, goalW: 230, centerR: 100 },    // 크게 — 10명까지
  XL: { w: 1920, h: 1080, goalW: 260, centerR: 110 },  // 아주 크게 — 그 이상
};
const FIELD_COMMON = {
  goalDepth: 56,     // 골라인 뒤 공간 깊이. 공이 들어가 뒷벽에 맞고 멈출 만큼만.
  playerR: 22, ballR: 10,   // 공은 12 였다가 줄임(2026-11-06 "공 좀 더 작게")
  postR: 6,
  // 터치라인·골라인 밖 여백 — 선수는 여기까지 나갈 수 있고 공은 선 안에서 튕긴다(2026-11-07 "터치라인 밖 여백도 추가해줘").
  // 벽에 붙은 공 뒤로 돌아 들어갈 자리가 생긴다. 골대 그물은 공만 막고 선수는 지나다닌다(기둥은 선수도 막는다).
  marginX: 70, marginY: 40,
};
/** 경기장·몸 크기. centerR = 킥오프 때 수비 편이 못 들어오는 가운데 원, postR = 골대 기둥 굵기. */
export type Pitch = { id: FieldId; w: number; h: number; goalW: number; centerR: number } & typeof FIELD_COMMON;

/** 능력치가 평균인 선수의 성능. stats.ts 의 BASE_PERF 가 이걸 그대로 쓴다(숫자는 한 곳에서만 고치려고).
 *  maxSpeed 단위/초 — 감쇠 방식 이동에서 계속 누르고 있을 때 닿는 정상 상태 속도(아래 steer).
 *  accel    "반응 속도" — 단위/초² 가 아니다. 평균(400)이면 감쇠 PLAYER_DAMP 그대로, 높을수록 감쇠가 세져 최고 속도에
 *           빨리 닿고 빨리 선다(작을수록 묵직하다).
 *  kick     킥이 공에 더해 주는 속도(단위/초) — 가만있는 공이 이 속도로 나간다. 공은 틱당 1% 감쇠라 486 이면 약 810 단위 간다.
 *  mass     몸 무게 배율(1 = 평균). 실제 질량은 PLAYER_MASS × 이 값. */
// 2026-11-06 "헥스볼 최대한 벤치마킹해" — 움직임의 **구조**를 그 장르의 표준대로 바꿨다(이름·그림·경기장 모양은 우리 것 그대로):
//  · 몸: 매 틱 입력 방향으로 속도를 더하고, 매 틱 속도에 감쇠를 곱한다(지수 감쇠). 처음엔 바로 반응하고 최고 속도엔 천천히 닿으며,
//    손을 떼면 길게 미끄러진다 — 앞서 쓰던 "일정 가속 + 일정 감속" 은 이 쫀득한 맛이 안 났다.
//  · 공: 몸 무게의 절반, 구르기 감쇠는 틱당 1%. 킥은 정해진 속도를 더한다.
//  · 킥: 누르고 있으면 "장전" 상태, 공이 닿는 순간 한 번 나가고, 다시 차려면 뗐다 눌러야 한다. 장전 중엔 가속이 줄어든다.
// maxSpeed 235 면 경기장 길이를 5.3초쯤에 건넌다. accel 은 이제 "반응 속도" — 평균(400)이면 감쇠 PLAYER_DAMP 그대로,
// 높으면 더 빨리 최고 속도에 닿고 더 빨리 선다. kick 486 이면 공이 약 810 단위 간다(경기장 길이의 68%).
export const BASE_PERF_TUNE: Perf = { maxSpeed: 235, accel: 400, kick: 486, mass: 1 };

/** 몸의 틱당 속도 감쇠(능력치 평균 기준). 0.96 이면 속도가 0.28초마다 반으로 — 반응은 빠르고 멈춤은 길다. */
const PLAYER_DAMP = 0.96;
/** 이보다 느리고 입력이 없으면 선 것으로 친다(지수 감쇠는 0 에 닿지 않는다). */
const PLAYER_REST_SPEED = 3;
/** 킥을 장전하고 있는 동안의 가속 배수 — 누른 채 뛰어다니면 느리다. */
const KICK_HOLD_MULT = 0.7;
/** 질량. 선수끼리 부딪칠 때 누가 얼마나 밀리는지, 공이 얼마나 가벼운지의 비율만 의미가 있다. */
const PLAYER_MASS = 10;
const BALL_MASS = 5;      // 몸(10)의 절반 — 밀면 내 몸이 느려지고 공은 튕겨 나가지 않는다(1 → 4.5 → 5)
/** 반발 계수(0 = 붙음, 1 = 완전 탄성). */
const E_PLAYER_PLAYER = 0.25;
const E_PLAYER_BALL = 0.25;   // 몸에 맞고 튀는 공. 크면 드리블이 잘 안 붙는다.
const E_PLAYER_WALL = 0.15;
const E_BALL_WALL = 0.5;
const E_BALL_POST = 0.5;
/** 공 구르기 감속(1/초). 속도가 이 비율로 줄어 한 번 찬 공이 v0 / BALL_DRAG 만큼 가고 선다. */
const BALL_DRAG = 0.6;    // 틱당 1% 감쇠(1 - 0.6/60 = 0.99). 한 번 찬 공이 kick / 0.6 만큼 간다
const BALL_MAX_SPEED = 1250;  // 킥이 겹쳐도 이 이상은 안 나간다(벽을 뚫지 않게 하는 안전선이기도 하다).
const BALL_REST_SPEED = 4;    // 이보다 느리면 선 것으로 친다.
/** 공이 닿는 거리(몸이 맞닿은 거리에 더하는 여유)와 킥 뒤 쉬는 틱. 누르고 있어도 기관총처럼 안 나가게. */
const KICK_REACH = 6;
const KICK_COOLDOWN = 4;      // 킥 뒤 다시 장전되기까지의 틱 — **킥을 뗀 뒤부터** 센다(누르고 있으면 안 줄어든다)
/** 찬 직후 고리가 밝은 틱(0.2초) — 봇의 킥도 눈에 보이게. */
const KICK_FLASH_TICKS = 12;
/** 이 시간 안에 같은 편이 넘겨준 공으로 넣어야 도움(8초). */
const ASSIST_TICKS = 480;
/** 골 뒤 멈춰 세리머니하는 틱. */
const GOAL_TICKS = 90;        // 1.5초
/** 킥오프에서 아무도 공을 안 건드려도 이 틱이 지나면 경기를 시작한다(봇끼리일 때 멈추지 않게). */
const KICKOFF_TIMEOUT = 240;  // 4초
/** 한 틱을 이만큼 쪼개 움직이고 부딪친다. 공이 빠를 때(틱당 20단위) 벽·선수를 뚫지 않게. */
const SUBSTEPS = 4;
/** 킥오프 때 선수 세로 위치를 이만큼(±) 흔든다 — 매번 똑같은 그림이 되지 않게 씨앗을 쓰는 자리. */
const KICKOFF_JITTER = 8;

/** 편성(보통 경기장 1200×720 좌표, 크기에 비례해 늘인다). 0 편 기준(왼쪽 진영, x<0), 1 편은 x 부호만 뒤집는다. slot 0 이 가장 뒤.
 *  4 는 뒤 하나·허리 둘·앞 하나, 3 은 뒤 하나·좌우 하나씩, 2 는 뒤·앞. 5·6 은 뒤 하나 + 두 줄.
 *  앞 선수도 어느 크기에서나 가운데 원(반지름 + 22) 밖이다 — 가장 가까운 앞자리 x=-150 은 작은 경기장에서 -112.5(원 70+22=92 밖). */
const FORMATIONS: Record<number, { x: number; y: number }[]> = {
  1: [{ x: -260, y: 0 }],
  2: [{ x: -440, y: 0 }, { x: -170, y: 0 }],
  3: [{ x: -450, y: 0 }, { x: -200, y: -170 }, { x: -200, y: 170 }],
  4: [{ x: -460, y: 0 }, { x: -280, y: -200 }, { x: -280, y: 200 }, { x: -150, y: 0 }],
  5: [{ x: -460, y: 0 }, { x: -300, y: -170 }, { x: -300, y: 170 }, { x: -150, y: -110 }, { x: -150, y: 110 }],
  6: [{ x: -470, y: 0 }, { x: -330, y: -130 }, { x: -330, y: 130 }, { x: -210, y: -250 }, { x: -210, y: 250 }, { x: -150, y: 0 }],
};
// ═══════════════════════════════════════════════════════════════════════════════════════════════

export const TICK_HZ = 60;
const DT = 1 / TICK_HZ;
const SUB_DT = DT / SUBSTEPS;

export type Side = 0 | 1;
export type Input = { x: number; y: number; kick: boolean };
export const NO_INPUT: Input = { x: 0, y: 0, kick: false };
export type MatchPlayer = { id: number; num: number; name: string; side: Side; bot: boolean; perf: Perf };
/** 경기 설정. 두 편 인원은 달라도 된다(한 편 0~6명, players 의 side 로 센다). field 가 그 경기의 경기장. */
export type MatchConfig = { field: FieldId; minutes: number; scoreLimit: number; players: MatchPlayer[] };
export type Body = { x: number; y: number; vx: number; vy: number };
export type Phase = 'kickoff' | 'play' | 'goal' | 'end';
export type MatchState = {
  tick: number; phase: Phase; phaseTicks: number;
  score: [number, number]; ticksLeft: number;
  // kicking = 지금 킥을 누르고 있나. 화면이 고리를 밝혀 "눌렀다"를 보여 주는 데 쓴다(2026-11-06 "키 누를 때 피드백이 없네").
  // 입력이 아니라 상태에 두는 이유: 2단계에서 다른 사람 화면에도 같은 표시가 떠야 한다.
  // kickFlash = 방금 찼다는 표시가 남은 틱. 봇은 차는 순간에만 누르므로 장전 표시가 안 보인다 — 찬 직후 잠깐 같은 표시를 띄워
  // 사람이든 봇이든 "찼다"가 똑같이 보이게(2026-11-07 "봇들도 똑같이 적용되어야해 애니메이션은").
  ball: Body; players: (Body & { id: number; kickCooldown: number; kicking: boolean; kickFlash: number })[];
  kickoffSide: Side; lastTouch: number | null;
  // 도움(2026-11-07 "골할 때 어시스트 기록도 뜨게") — 득점자 바로 앞에 공을 만진 같은 편 선수. prevTouch = 마지막 터치 직전에 만진 다른 사람,
  // lastTouchTick·prevTouchTick = 각자 마지막으로 만진 틱. lastAssist 는 골 순간에 정한다(없으면 null).
  prevTouch: number | null; lastTouchTick: number; prevTouchTick: number; lastAssist: number | null;
  /** 골 넣은 사람. 자책골이거나 마지막으로 공 만진 사람이 없으면 null(화면은 편 이름만 띄운다). */
  lastScorer: number | null; winner: Side | 'draw' | null;
  seed: number;
};
export type MatchEvent =
  | { type: 'kick'; by: number }
  | { type: 'goal'; side: Side; scorer: number | null; assist: number | null }
  | { type: 'end'; winner: Side | 'draw' };

type Seg = [number, number, number, number];
/** 경기장 하나에서 나오는 벽·기둥. 크기 넷을 모듈을 읽을 때 한 번 만들어 두는 상수 표다 — step() 은 config.field 로 꺼내 쓰기만 해서
 *  부르는 순서와 상관없이 같은 결과다(숨은 상태 없음). */
type Geo = {
  pitch: Pitch;
  HW: number; HH: number; GH: number; GD: number;
  OW: number; OH: number;                 // 선수가 갈 수 있는 바깥 테두리(선 밖 여백까지)
  ballWalls: Seg[]; posts: [number, number][]; playerWalls: Seg[];
  fx: number; fy: number;                 // 킥오프 자리 배율(보통 경기장 = 1)
};
function buildGeo(id: FieldId): Geo {
  const pitch: Pitch = { id, ...FIELD_DIMS[id], ...FIELD_COMMON };
  const HW = pitch.w / 2, HH = pitch.h / 2, GH = pitch.goalW / 2, GD = pitch.goalDepth;
  const OW = HW + pitch.marginX, OH = HH + pitch.marginY;
  return {
    pitch, HW, HH, GH, GD, OW, OH,
    // 공이 부딪치는 벽 — 바깥 사각형(골문 자리는 비움) + 양쪽 골대 상자(옆·뒤 벽). 기둥은 따로.
    ballWalls: [
      [-HW, -HH, HW, -HH], [-HW, HH, HW, HH],
      [-HW, -HH, -HW, -GH], [-HW, GH, -HW, HH], [HW, -HH, HW, -GH], [HW, GH, HW, HH],
      [-HW, -GH, -HW - GD, -GH], [-HW, GH, -HW - GD, GH], [-HW - GD, -GH, -HW - GD, GH],
      [HW, -GH, HW + GD, -GH], [HW, GH, HW + GD, GH], [HW + GD, -GH, HW + GD, GH],
    ],
    posts: [[-HW, -GH], [-HW, GH], [HW, -GH], [HW, GH]],
    // 선수가 부딪치는 벽 — 선 밖 여백까지의 통짜 사각형(그물은 공만 막는다, 기둥은 선수도 막는다).
    playerWalls: [[-OW, -OH, OW, -OH], [-OW, OH, OW, OH], [-OW, -OH, -OW, OH], [OW, -OH, OW, OH]],
    fx: HW / 600, fy: HH / 360,
  };
}
const GEO: Record<FieldId, Geo> = { S: buildGeo('S'), M: buildGeo('M'), L: buildGeo('L'), XL: buildGeo('XL') };
const geoOf = (field: unknown): Geo => (FIELD_IDS.includes(field as FieldId) ? GEO[field as FieldId] : GEO.M);

/** 그 경기의 경기장. 모르는 값이면 보통(M) — 바깥에서 온 설정을 믿지 않는다. */
export function pitchOf(field: unknown): Pitch { return geoOf(field).pitch; }
/** 보통(M) 경기장. 테스트와 "크기와 상관없는 몸 크기(playerR·ballR)"를 읽는 곳만 쓴다 — 경기 계산·그리기는 pitchOf(config.field). */
export const PITCH: Pitch = GEO.M.pitch;

/** 한 편 count 명 중 slot 번째의 킥오프 자리(0 편 기준, 1 편은 좌우를 뒤집는다). 봇이 쉬는 자리를 잡을 때도 쓴다.
 *  편성 표는 보통 경기장 좌표로 적고 경기장 크기에 비례해 늘인다 — 두 편 인원이 달라도 각자 자기 수로 고른다. */
export function formationSpot(field: unknown, count: number, slot: number, side: Side): { x: number; y: number } {
  const g = geoOf(field);
  const f = FORMATIONS[Math.min(6, Math.max(1, Math.round(count) || 1))];
  const s = f[Math.min(Math.max(slot, 0), f.length - 1)];
  const x = s.x * g.fx, y = s.y * g.fy;
  return { x: side === 0 ? x : 0 - x, y };
}

/** 상태 안의 씨앗에서 0 이상 1 미만 값 하나를 뽑고 씨앗을 앞으로 보낸다(mulberry32). 상태를 직접 바꾸므로 복사본에만 쓴다. */
function rand(s: MatchState): number {
  s.seed = (s.seed + 0x6d2b79f5) >>> 0;
  let t = s.seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function fin(v: number): number { return Number.isFinite(v) ? v : 0; }

function clone(s: MatchState): MatchState {
  return {
    ...s,
    score: [s.score[0], s.score[1]],
    ball: { ...s.ball },
    players: s.players.map((p) => ({ ...p })),
  };
}

/** 모두를 킥오프 자리로, 공은 가운데로. 세로 위치만 씨앗으로 살짝 흔든다. */
function placeForKickoff(s: MatchState, config: MatchConfig): void {
  s.ball = { x: 0, y: 0, vx: 0, vy: 0 };
  const per = sideCounts(config);
  const count = [0, 0];
  config.players.forEach((mp, i) => {
    const spot = formationSpot(config.field, per[mp.side], count[mp.side]++, mp.side);
    const p = s.players[i];
    p.x = spot.x;
    p.y = spot.y + (rand(s) - 0.5) * 2 * KICKOFF_JITTER;
    p.vx = 0; p.vy = 0; p.kickCooldown = 0; p.kicking = false; p.kickFlash = 0;
  });
  s.lastTouch = null; s.prevTouch = null; s.lastTouchTick = 0; s.prevTouchTick = 0;
}

/** 편마다 몇 명인가 [0 편, 1 편]. */
export function sideCounts(config: MatchConfig): [number, number] {
  const c: [number, number] = [0, 0];
  for (const p of config.players) c[p.side === 1 ? 1 : 0]++;
  return c;
}

export function createMatch(config: MatchConfig, seed: number): MatchState {
  const s: MatchState = {
    tick: 0, phase: 'kickoff', phaseTicks: 0,
    score: [0, 0], ticksLeft: Math.max(1, Math.round(config.minutes * 60 * TICK_HZ)),
    ball: { x: 0, y: 0, vx: 0, vy: 0 },
    players: config.players.map((mp) => ({ id: mp.id, x: 0, y: 0, vx: 0, vy: 0, kickCooldown: 0, kicking: false, kickFlash: 0 })),
    kickoffSide: 0, lastTouch: null, prevTouch: null, lastTouchTick: 0, prevTouchTick: 0, lastAssist: null, lastScorer: null, winner: null,
    seed: seed >>> 0,
  };
  placeForKickoff(s, config);
  return s;
}

// ───────────────────────────── 충돌 ─────────────────────────────

/** 원 둘. 겹친 만큼을 질량 반비례로 갈라 밀어내고, 다가오던 속도에는 반발을 준다. 겹쳤으면 true. */
function collideCircles(a: Body, ra: number, ma: number, b: Body, rb: number, mb: number, e: number): boolean {
  const dx = b.x - a.x, dy = b.y - a.y;
  const min = ra + rb;
  const d2 = dx * dx + dy * dy;
  if (d2 >= min * min) return false;
  const d = Math.sqrt(d2);
  const nx = d > 1e-6 ? dx / d : 1, ny = d > 1e-6 ? dy / d : 0;   // 정확히 겹친 드문 경우엔 가로로 민다
  const ia = 1 / ma, ib = 1 / mb, sum = ia + ib;
  const over = min - d;
  a.x -= nx * over * (ia / sum); a.y -= ny * over * (ia / sum);
  b.x += nx * over * (ib / sum); b.y += ny * over * (ib / sum);
  const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (vn < 0) {
    const j = (-(1 + e) * vn) / sum;
    a.vx -= j * ia * nx; a.vy -= j * ia * ny;
    b.vx += j * ib * nx; b.vy += j * ib * ny;
  }
  return true;
}

/** 움직이는 원 하나와 못 움직이는 점(기둥은 굵기 pr). */
function collidePoint(b: Body, r: number, px: number, py: number, pr: number, e: number): void {
  const dx = b.x - px, dy = b.y - py;
  const min = r + pr;
  const d2 = dx * dx + dy * dy;
  if (d2 >= min * min) return;
  const d = Math.sqrt(d2);
  const nx = d > 1e-6 ? dx / d : 1, ny = d > 1e-6 ? dy / d : 0;
  b.x = px + nx * min; b.y = py + ny * min;
  const vn = b.vx * nx + b.vy * ny;
  if (vn < 0) { b.vx -= (1 + e) * vn * nx; b.vy -= (1 + e) * vn * ny; }
}

/** 원과 선분. 선분에서 가장 가까운 점 쪽으로 밀어내고 반발. 선분 끝점이면 둥근 모서리가 된다. */
function collideSegment(b: Body, r: number, seg: Seg, e: number): void {
  const [ax, ay, bx, by] = seg;
  const abx = bx - ax, aby = by - ay;
  const len2 = abx * abx + aby * aby;
  let t = ((b.x - ax) * abx + (b.y - ay) * aby) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = ax + abx * t, cy = ay + aby * t;
  const dx = b.x - cx, dy = b.y - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return;
  const d = Math.sqrt(d2);
  let nx: number, ny: number;
  if (d > 1e-6) { nx = dx / d; ny = dy / d; }
  else { const l = Math.sqrt(len2); nx = -aby / l; ny = abx / l; }   // 중심이 선 위면 선분의 수직으로
  b.x = cx + nx * r; b.y = cy + ny * r;
  const vn = b.vx * nx + b.vy * ny;
  if (vn < 0) { b.vx -= (1 + e) * vn * nx; b.vy -= (1 + e) * vn * ny; }
}

/** 킥오프 규칙 — 모두 자기 진영에, 상대 편은 가운데 원 밖에. 공이 건드려지면(phase 가 play 로) 풀린다. */
function kickoffLimits(s: MatchState, config: MatchConfig, g: Geo): void {
  const keepOut = g.pitch.centerR + g.pitch.playerR;
  config.players.forEach((mp, i) => {
    const p = s.players[i];
    if (mp.side === 0 && p.x > 0) { p.x = 0; if (p.vx > 0) p.vx = 0; }
    if (mp.side === 1 && p.x < 0) { p.x = 0; if (p.vx < 0) p.vx = 0; }
    if (mp.side !== s.kickoffSide) {
      const d2 = p.x * p.x + p.y * p.y;
      if (d2 < keepOut * keepOut) {
        const d = Math.sqrt(d2);
        // 정확히 가운데면 자기 진영 쪽으로 민다
        const nx = d > 1e-6 ? p.x / d : (mp.side === 0 ? -1 : 1), ny = d > 1e-6 ? p.y / d : 0;
        p.x = nx * keepOut; p.y = ny * keepOut;
        const vn = p.vx * nx + p.vy * ny;
        if (vn < 0) { p.vx -= vn * nx; p.vy -= vn * ny; }
      }
    }
  });
}

/** 감쇠 방식 이동: 매 틱 입력 방향으로 gain 만큼 속도를 더하고 감쇠(damp)를 곱한다 — 정상 상태가 maxSpeed 가 되게 gain 을 고른다.
 *  감쇠가 늘 걸려 부딪쳐서 최고 속도를 넘긴 몸도 자연스럽게 되돌아오고, 손을 떼면 지수적으로 미끄러지다 선다. */
function steer(p: Body, perf: Perf, inp: Input, armed: boolean): void {
  let ix = fin(inp.x), iy = fin(inp.y);
  const len = Math.sqrt(ix * ix + iy * iy);
  if (len > 1) { ix /= len; iy /= len; }
  // 반응 속도(accel)가 평균보다 높으면 감쇠가 세다 = 최고 속도에 빨리 닿고 빨리 선다. 최고 속도는 maxSpeed 그대로.
  const damp = 1 - (1 - PLAYER_DAMP) * (perf.accel / BASE_PERF_TUNE.accel);
  const gain = perf.maxSpeed * (1 - damp) / damp * (armed ? KICK_HOLD_MULT : 1);   // 틱마다 더하는 속도 — 정상 상태가 maxSpeed 가 되게
  p.vx = (p.vx + ix * gain) * damp;
  p.vy = (p.vy + iy * gain) * damp;
  if (len < 0.05 && p.vx * p.vx + p.vy * p.vy < PLAYER_REST_SPEED * PLAYER_REST_SPEED) { p.vx = 0; p.vy = 0; }
}

/** 공을 만졌다(킥·몸) — 만진 사람이 바뀌면 직전 사람을 prevTouch 로 밀어 둔다(도움 판정용). */
function touched(s: MatchState, i: number): void {
  if (s.lastTouch !== i) { s.prevTouch = s.lastTouch; s.prevTouchTick = s.lastTouchTick; s.lastTouch = i; }
  s.lastTouchTick = s.tick;
}

/** 한 틱 진행. 받은 state 는 건드리지 않고 새 state 를 돌려준다. */
export function step(state: MatchState, config: MatchConfig, inputs: Input[]): MatchState {
  const s = clone(state);
  s.tick += 1;
  s.phaseTicks += 1;
  const controlled = s.phase === 'kickoff' || s.phase === 'play';
  const g = geoOf(config.field);
  const { HW, GH } = g;
  const R = g.pitch.playerR, BR = g.pitch.ballR, postR = g.pitch.postR;
  const n = s.players.length;
  const mass: number[] = config.players.map((mp) => PLAYER_MASS * mp.perf.mass);

  // 1) 입력 → 속도. 세리머니·끝난 뒤엔 입력을 무시하고 서서히 선다.
  for (let i = 0; i < n; i++) {
    const p = s.players[i];
    const held = controlled && !!inputs[i]?.kick;
    // 킥은 한 번 나가면 뗐다 눌러야 다시 장전된다 — 누르고 있는 동안엔 쿨다운이 줄지 않는다.
    if (p.kickCooldown > 0 && !held) p.kickCooldown -= 1;
    if (p.kickFlash > 0) p.kickFlash -= 1;
    p.kicking = held && p.kickCooldown === 0;   // 장전 중(고리가 밝다). 차고 나면 꺼진다.
    steer(p, config.players[i].perf, controlled ? (inputs[i] ?? NO_INPUT) : NO_INPUT, p.kicking);
  }

  // 2) 킥 — 닿는 거리 안이고 쉬는 중이 아니면 공에 속도를 더해 준다.
  let kicked = false;
  if (controlled) {
    for (let i = 0; i < n; i++) {
      const p = s.players[i], inp = inputs[i];
      if (!inp || !inp.kick || p.kickCooldown > 0) continue;
      const dx = s.ball.x - p.x, dy = s.ball.y - p.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > R + BR + KICK_REACH) continue;
      const nx = d > 1e-6 ? dx / d : (config.players[i].side === 0 ? 1 : -1), ny = d > 1e-6 ? dy / d : 0;
      s.ball.vx += nx * config.players[i].perf.kick;
      s.ball.vy += ny * config.players[i].perf.kick;
      p.kickCooldown = KICK_COOLDOWN;
      p.kicking = false;   // 나갔으니 장전 표시를 끈다
      p.kickFlash = KICK_FLASH_TICKS;
      touched(s, i);
      kicked = true;
    }
  }

  // 3) 이동과 충돌 — 한 틱을 SUBSTEPS 로 쪼갠다.
  for (let k = 0; k < SUBSTEPS; k++) {
    s.ball.x += s.ball.vx * SUB_DT; s.ball.y += s.ball.vy * SUB_DT;
    for (const p of s.players) { p.x += p.vx * SUB_DT; p.y += p.vy * SUB_DT; }

    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++)
        collideCircles(s.players[i], R, mass[i], s.players[j], R, mass[j], E_PLAYER_PLAYER);
    for (let i = 0; i < n; i++)
      if (collideCircles(s.players[i], R, mass[i], s.ball, BR, BALL_MASS, E_PLAYER_BALL) && controlled) touched(s, i);

    for (const w of g.ballWalls) collideSegment(s.ball, BR, w, E_BALL_WALL);
    for (const [px, py] of g.posts) collidePoint(s.ball, BR, px, py, postR, E_BALL_POST);
    // 공이 선수와 벽 사이에 끼면 위 처리만으론 겹침이 남는다 — 이때는 공을 못 움직이는 것으로 보고 선수를 비킨다.
    for (const p of s.players) {
      const dx = p.x - s.ball.x, dy = p.y - s.ball.y;
      const d2 = dx * dx + dy * dy, min = R + BR;
      if (d2 < min * min) {
        const d = Math.sqrt(d2);
        const nx = d > 1e-6 ? dx / d : 0, ny = d > 1e-6 ? dy / d : 1;
        p.x = s.ball.x + nx * min; p.y = s.ball.y + ny * min;
      }
    }
    for (const p of s.players) {
      for (const w of g.playerWalls) collideSegment(p, R, w, E_PLAYER_WALL);
      for (const [px, py] of g.posts) collidePoint(p, R, px, py, postR, E_PLAYER_WALL);
    }
    if (s.phase === 'kickoff') kickoffLimits(s, config, g);
  }

  // 4) 공 구르기 감속·속도 상한. 마지막 안전망으로 몸이 판 밖에 나가거나 숫자가 깨지면 되돌린다.
  const keep = 1 - BALL_DRAG * DT;
  s.ball.vx *= keep; s.ball.vy *= keep;
  let sp = Math.sqrt(s.ball.vx * s.ball.vx + s.ball.vy * s.ball.vy);
  if (sp > BALL_MAX_SPEED) { s.ball.vx *= BALL_MAX_SPEED / sp; s.ball.vy *= BALL_MAX_SPEED / sp; sp = BALL_MAX_SPEED; }
  if (sp < BALL_REST_SPEED) { s.ball.vx = 0; s.ball.vy = 0; }
  guardBodies(s, g);

  // 5) 단계 진행
  if (s.phase === 'kickoff') {
    const moved = s.ball.x * s.ball.x + s.ball.y * s.ball.y > 1;
    if (kicked || s.lastTouch !== null || moved || s.phaseTicks >= KICKOFF_TIMEOUT) { s.phase = 'play'; s.phaseTicks = 0; }
  } else if (s.phase === 'play') {
    s.ticksLeft -= 1;
    const bx = s.ball.x;
    if ((bx > HW || bx < -HW) && Math.abs(s.ball.y) < GH) {
      // 공 중심이 골라인을 완전히 넘었고 골문 안쪽이다. 0 편은 오른쪽 골대로 넣는다.
      const side: Side = bx > 0 ? 0 : 1;
      s.score[side] += 1;
      const lt = s.lastTouch;
      s.lastScorer = lt !== null && config.players[lt].side === side ? lt : null;   // 자책이면 null
      // 도움 — 득점자 바로 앞에 만진 같은 편 다른 선수, 그 터치가 ASSIST_TICKS 안일 때만.
      const pt = s.prevTouch;
      s.lastAssist = s.lastScorer !== null && pt !== null && pt !== s.lastScorer && config.players[pt]?.side === side
        && s.tick - s.prevTouchTick <= ASSIST_TICKS ? pt : null;
      s.kickoffSide = side === 0 ? 1 : 0;
      s.phase = 'goal'; s.phaseTicks = 0;
    } else if (s.ticksLeft <= 0) {
      finish(s);
    }
  } else if (s.phase === 'goal') {
    if (s.phaseTicks >= GOAL_TICKS) {
      const hit = config.scoreLimit > 0 && (s.score[0] >= config.scoreLimit || s.score[1] >= config.scoreLimit);
      if (hit || s.ticksLeft <= 0) finish(s);
      else { placeForKickoff(s, config); s.phase = 'kickoff'; s.phaseTicks = 0; }
    }
  }
  return s;
}

function finish(s: MatchState): void {
  s.phase = 'end'; s.phaseTicks = 0;
  s.winner = s.score[0] > s.score[1] ? 0 : s.score[1] > s.score[0] ? 1 : 'draw';
}

/** 마지막 안전망. 정상이면 아무 일도 안 한다 — 숫자가 깨지거나 몸이 판을 벗어난 경우만 되돌린다. */
function guardBodies(s: MatchState, g: Geo): void {
  const { HW, HH, GH, GD, OW, OH } = g;
  const b = s.ball;
  if (!Number.isFinite(b.x + b.y + b.vx + b.vy)) { b.x = 0; b.y = 0; b.vx = 0; b.vy = 0; }
  const BR = g.pitch.ballR;
  if (b.x > HW + GD - BR) { b.x = HW + GD - BR; b.vx = 0; }
  if (b.x < -HW - GD + BR) { b.x = -HW - GD + BR; b.vx = 0; }
  if (b.y > HH - BR) { b.y = HH - BR; if (b.vy > 0) b.vy = 0; }
  if (b.y < -HH + BR) { b.y = -HH + BR; if (b.vy < 0) b.vy = 0; }
  if (Math.abs(b.x) > HW) {
    // 골대 상자 안에서는 옆벽 안쪽에만 있을 수 있다. 벗어났다면 뚫고 나온 것이니 골라인 위로 되돌린다.
    if (Math.abs(b.y) > GH - BR) { b.x = b.x > 0 ? HW : -HW; b.vx = 0; }
  }
  for (const p of s.players) {
    if (!Number.isFinite(p.x + p.y + p.vx + p.vy)) { p.x = 0; p.y = 0; p.vx = 0; p.vy = 0; }
    const R = g.pitch.playerR;
    p.x = Math.min(OW - R, Math.max(-OW + R, p.x));
    p.y = Math.min(OH - R, Math.max(-OH + R, p.y));
  }
}

/** prev → next 사이에 생긴 사건. 틱 하나일 때 가장 정확하지만 몇 틱 묶음이어도 골은 점수 차이로 센다. */
export function eventsBetween(prev: MatchState, next: MatchState): MatchEvent[] {
  const out: MatchEvent[] = [];
  next.players.forEach((p, i) => {
    const before = prev.players[i];
    if (before && p.kickCooldown > before.kickCooldown) out.push({ type: 'kick', by: p.id });
  });
  for (const side of [0, 1] as const)
    for (let g = prev.score[side]; g < next.score[side]; g++)
      out.push({ type: 'goal', side, scorer: g === next.score[side] - 1 && next.lastScorer !== null ? next.lastScorer : null, assist: g === next.score[side] - 1 ? (next.lastAssist ?? null) : null });
  if (prev.phase !== 'end' && next.phase === 'end' && next.winner !== null) out.push({ type: 'end', winner: next.winner });
  return out;
}
