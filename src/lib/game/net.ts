// src/lib/game/net.ts — 온라인 메시지 모양, 입력 줄이기, 손님 쪽 예측(2026-11-06). 순수.
// 설계: docs/superpowers/specs/2026-11-06-game-online-design.md §2.4·§2.5
//
// 이 파일은 시계·타이머·네트워크를 모른다. 시간은 바깥(세션)이 "틱"으로 불러 준다.
// step() 에 들어가는 값 경로에는 삼각함수·hypot·pow·exp 를 쓰지 않는다 — 방장과 손님이 서로 다른 브라우저 엔진에서
// 같은 결과를 내야 해서, 방향 표는 상수로 적어 두고 가장 가까운 방향은 내적(곱셈·덧셈)으로 찾는다.
import type { Input, MatchConfig, MatchState } from './sim.ts';
import { NO_INPUT, step } from './sim.ts';
import type { RoomState } from './room.ts';
import { FIELD_IDS } from './sim.ts';
import { FIELD_CHOICES, MAX_MEMBERS, MAX_PER_SIDE, isRoomCode } from './room.ts';

// 방장이 보내는 것(deny·room·start·snap·stop·pong)에도 from(= 방장 clientId)을 싣는다 — 손님은 처음 받은 방의 hostId 와 같은 from 만 믿는다.
// room 의 sid = 방장 세션 고유값(방장 탭이 새로 열릴 때마다 새로). 방장이 새로고침하면 rev 가 0 부터라, sid 가 바뀌면 손님이 rev 비교를 새로 시작한다.
// snap·stop 의 seed = 그 경기의 씨앗 — 손님이 놓친 start 뒤의 낡은 예측기를 알아보게(2026-11-07 리뷰).
export type NetMsg =
  | { t: 'hello'; from: string; num: number; name: string }
  | { t: 'deny'; from: string; to: string; reason: 'taken' | 'full' | 'closed' }
  | { t: 'room'; from: string; sid: string; room: RoomState; roster: number[] }
  | { t: 'pick'; from: string; num: number; name: string }
  | { t: 'start'; from: string; config: MatchConfig; seed: number }
  | { t: 'in'; from: string; seq: number; i: number }
  | { t: 'snap'; from: string; seed: number; tick: number; state: MatchState; inputs: number[]; paused: boolean }
  | { t: 'stop'; from: string; seed: number }
  | { t: 'say'; from: string; id: number; k: number }
  | { t: 'ping'; from: string; at: number } | { t: 'pong'; from: string; to: string; at: number }
  | { t: 'bye'; from: string };

// ═══════════════════════════ 입력 양자화 ═══════════════════════════
// 방향 16 × 세기 2단계(걷기 0.5 · 달리기 1) + 정지 = 33 가지, 킥 여부 ×2 = 66 가지 → 정수 0..65 하나.
// 부호화: q = (kick ? 33 : 0) + m,  m = 0 정지 / 1 + dir * 2 + (달리기 ? 1 : 0).
// 모든 계산(방장·봇·손님·예측)은 이 표에서 꺼낸 값만 쓴다 — 손님의 예측과 방장의 계산이 같은 입력을 쓰게 하려는 것.

/** 정지(방향 없음·킥 없음). */
export const Q_IDLE = 0;
export const Q_COUNT = 66;
const KICK_OFFSET = 33;
const WALK = 0.5, RUN = 1;
const WALK_BELOW = 0.75;   // 크기가 이 밑이면 걷기, 이상이면 달리기(아날로그 스틱의 중간쯤)
const DEAD = 0.15;          // 이 밑은 손을 뗀 것으로 본다

// 방향 k = 22.5° × k 의 (cos, sin). 상수 표 — 삼각함수를 부르지 않는다. 길이가 1 을 넘지 않게 끝자리를 내림했다.
const C1 = 0.9238795325112867, S1 = 0.3826834323650898, C2 = 0.7071067811865475;
const DIRS: readonly (readonly [number, number])[] = [
  [1, 0], [C1, S1], [C2, C2], [S1, C1],
  [0, 1], [-S1, C1], [-C2, C2], [-C1, S1],
  [-1, 0], [-C1, -S1], [-C2, -C2], [-S1, -C1],
  [0, -1], [S1, -C1], [C2, -C2], [C1, -S1],
];

const fin = (v: number): number => (Number.isFinite(v) ? v : 0);

/** 입력 → 0..65. 크기가 작으면 정지, 가장 가까운 16방향 하나로 맞춘다(내적이 가장 큰 방향). */
export function encodeInput(i: Input): number {
  const x = fin(i.x), y = fin(i.y);
  const len = Math.sqrt(x * x + y * y);
  const kick = i.kick ? KICK_OFFSET : 0;
  if (len < DEAD) return kick;
  let best = 0, bestDot = -Infinity;
  for (let k = 0; k < 16; k++) {
    const d = x * DIRS[k][0] + y * DIRS[k][1];
    if (d > bestDot) { bestDot = d; best = k; }
  }
  return kick + 1 + best * 2 + (len < WALK_BELOW ? 0 : 1);
}

/** 0..65 → 입력. 범위 밖·정수 아님은 정지로 본다(바깥에서 온 값이라). 표에서 꺼내므로 어느 엔진에서나 같다. */
export function decodeInput(q: number): Input {
  if (!Number.isInteger(q) || q < 0 || q >= Q_COUNT) return { ...NO_INPUT };
  const kick = q >= KICK_OFFSET;
  const m = q - (kick ? KICK_OFFSET : 0);
  if (m === 0) return { x: 0, y: 0, kick };
  const dir = (m - 1) >> 1, mag = (m - 1) & 1 ? RUN : WALK;
  return { x: DIRS[dir][0] * mag, y: DIRS[dir][1] * mag, kick };
}

/** 사람 입력을 양자화해서 다시 풀어낸 것 — 방장도 손님도 자기 입력을 이걸 거쳐 쓴다(양쪽 계산이 같은 값을 쓰게). */
export function quantize(i: Input): Input { return decodeInput(encodeInput(i)); }

// ═══════════════════════════ 메시지 검사 ═══════════════════════════
// 바깥에서 온 JSON 을 믿지 않는다. 모양(타입·범위·길이)만 보고, 맞으면 받은 객체를 그대로 돌려준다.
// 계산(step)이 NaN·잘못된 길이에서 죽지 않는 건 sim.ts 쪽 몫이고, 여기서는 "크기를 부풀려 먹통 만들기"를 막는다.
// 한 경기 선수는 한 편 6 × 2 = 12 까지(2026-11-07 — 사람은 8명까지지만 봇이 채운다).
const MAX_PLAYERS = MAX_PER_SIDE * 2, MAX_ROSTER = 200, MAX_STR = 64;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isInt = (v: unknown, lo = -Infinity, hi = Infinity): v is number => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;
const isStr = (v: unknown, max = MAX_STR): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;
const isName = (v: unknown): v is string => typeof v === 'string' && v.length <= 24;
const isArr = (v: unknown, max: number): v is unknown[] => Array.isArray(v) && v.length <= max;

function okBody(b: unknown): boolean {
  return isObj(b) && isNum(b.x) && isNum(b.y) && isNum(b.vx) && isNum(b.vy);
}
function okMember(m: unknown): boolean {
  return isObj(m) && isStr(m.clientId) && isInt(m.num, 0) && isName(m.name) && (m.team === 0 || m.team === 1 || m.team === null);
}
function okRoom(r: unknown): boolean {
  if (!isObj(r)) return false;
  const s = r.settings;
  return typeof r.code === 'string' && isRoomCode(r.code) && isStr(r.hostId) && isInt(r.rev, 0)
    && (r.phase === 'lobby' || r.phase === 'match')
    && isArr(r.members, MAX_MEMBERS) && r.members.every(okMember)
    && isObj(s) && isInt(s.perSide, 0, MAX_PER_SIDE) && isInt(s.minutes, 1, 60) && isInt(s.scoreLimit, 0, 99)
    && (FIELD_CHOICES as readonly unknown[]).includes(s.field);
}
function okPerf(p: unknown): boolean {
  return isObj(p) && isNum(p.maxSpeed) && isNum(p.accel) && isNum(p.kick) && isNum(p.mass) && p.mass > 0;
}
function okConfig(c: unknown): boolean {
  if (!isObj(c)) return false;
  if (!(FIELD_IDS as readonly unknown[]).includes(c.field) || !isInt(c.minutes, 1, 60) || !isInt(c.scoreLimit, 0, 99)) return false;
  if (!isArr(c.players, MAX_PLAYERS) || c.players.length < 1) return false;
  const ok = c.players.every((p, i) => isObj(p) && p.id === i && isInt(p.num, 0) && isName(p.name)
    && (p.side === 0 || p.side === 1) && typeof p.bot === 'boolean' && okPerf(p.perf));
  // 두 편 인원은 달라도 되지만 한 편 6명을 넘지 않는다.
  return ok && [0, 1].every((side) => (c.players as Record<string, unknown>[]).filter((p) => p.side === side).length <= MAX_PER_SIDE);
}
function okState(s: unknown): boolean {
  if (!isObj(s)) return false;
  const phases = ['kickoff', 'play', 'goal', 'end'];
  return isInt(s.tick, 0) && typeof s.phase === 'string' && phases.includes(s.phase) && isInt(s.phaseTicks, 0)
    && Array.isArray(s.score) && s.score.length === 2 && s.score.every((v) => isInt(v, 0))
    && isNum(s.ticksLeft) && okBody(s.ball)
    && isArr(s.players, MAX_PLAYERS) && s.players.every((p) => okBody(p) && isInt((p as Record<string, unknown>).id, 0)
      && isNum((p as Record<string, unknown>).kickCooldown) && typeof (p as Record<string, unknown>).kicking === 'boolean')
    && (s.kickoffSide === 0 || s.kickoffSide === 1)
    && (s.lastTouch === null || isInt(s.lastTouch, 0)) && (s.lastScorer === null || isInt(s.lastScorer, 0))
    && (s.winner === null || s.winner === 0 || s.winner === 1 || s.winner === 'draw') && isNum(s.seed);
}

/** 메시지 검사 — 바깥에서 온 JSON 을 믿지 않는다. 모양이 틀리면 null. */
export function parseMsg(raw: unknown): NetMsg | null {
  if (!isObj(raw) || typeof raw.t !== 'string') return null;
  const m = raw;
  switch (m.t) {
    case 'hello': case 'pick':
      return isStr(m.from) && isInt(m.num, 0) && isName(m.name) ? (raw as NetMsg) : null;
    case 'deny':
      return isStr(m.from) && isStr(m.to) && (m.reason === 'taken' || m.reason === 'full' || m.reason === 'closed') ? (raw as NetMsg) : null;
    case 'room':
      return isStr(m.from) && isStr(m.sid) && okRoom(m.room) && isArr(m.roster, MAX_ROSTER) && m.roster.every((n) => isInt(n, 0)) ? (raw as NetMsg) : null;
    case 'start':
      return isStr(m.from) && okConfig(m.config) && isNum(m.seed) ? (raw as NetMsg) : null;
    case 'in':
      return isStr(m.from) && isInt(m.seq, 0) && isInt(m.i, 0, Q_COUNT - 1) ? (raw as NetMsg) : null;
    case 'snap':
      return isStr(m.from) && isNum(m.seed) && isInt(m.tick, 0) && okState(m.state) && isArr(m.inputs, MAX_PLAYERS) && m.inputs.every((q) => isInt(q, 0, Q_COUNT - 1))
        && typeof m.paused === 'boolean' ? (raw as NetMsg) : null;
    case 'stop': return isStr(m.from) && isNum(m.seed) ? (raw as NetMsg) : null;
    case 'say':
      return isStr(m.from) && isInt(m.id, 0, MAX_PLAYERS - 1) && isInt(m.k, 0, PHRASES.length - 1) ? (raw as NetMsg) : null;
    case 'ping': return isStr(m.from) && isNum(m.at) ? (raw as NetMsg) : null;
    case 'pong': return isStr(m.from) && isStr(m.to) && isNum(m.at) ? (raw as NetMsg) : null;
    case 'bye': return isStr(m.from) ? (raw as NetMsg) : null;
    default: return null;
  }
}

/** 한마디 문구(스펙 §3). 메시지의 k 는 이 배열의 번호다. */
export const PHRASES: readonly string[] = ['나이스', '패스!', 'ㅋㅋㅋ', '미안', '가자', '수비!'];

// ═══════════════════════════ 손님 쪽 예측 ═══════════════════════════
export type Predictor = {
  config: MatchConfig; myId: number | null;          // myId = 내가 조종하는 선수 id(구경이면 null)
  base: MatchState | null; baseInputs: number[];     // 마지막 스냅샷과 그때의 모든 선수 입력(양자화 값)
  predicted: MatchState | null;                      // 지금 화면에 그릴 상태
  history: number[];                                 // 내 입력 기록(양자화 값), 최근 60틱, 뒤가 최신
  lead: number;                                      // 스냅샷에서 몇 틱 앞서 그릴지
  lastSnapTick: number;
  paused: boolean;                                   // 마지막 스냅샷이 "방장 멈춤"이었나 — 멈춘 동안은 advance 가 상태를 진행하지 않는다
};

const HISTORY = 60, MAX_LEAD = 20;

export function createPredictor(config: MatchConfig, myId: number | null): Predictor {
  return { config, myId, base: null, baseInputs: [], predicted: null, history: [], lead: 0, lastSnapTick: -1, paused: false };
}

/** 왕복 시간(ms) → lead 틱. clamp(round(rtt/1000*60), 0, 20). 이상한 값(NaN·음수)은 0. */
export function leadTicks(rttMs: number): number {
  if (!Number.isFinite(rttMs)) return 0;
  return Math.min(MAX_LEAD, Math.max(0, Math.round((rttMs / 1000) * 60)));
}

export function setLead(p: Predictor, lead: number): Predictor {
  const l = Number.isFinite(lead) ? Math.min(MAX_LEAD, Math.max(0, Math.round(lead))) : 0;
  return l === p.lead ? p : { ...p, lead: l };
}

/** 이 틱의 입력 한 벌 — 스냅샷의 입력을 풀고(모자란 자리는 정지), 내 자리만 mineQ 로 바꾼다. 구경이면 아무것도 안 바꾼다. */
function inputsFor(p: Predictor, mineQ: number | null): Input[] {
  const out: Input[] = p.config.players.map((_, i) => decodeInput(p.baseInputs[i] ?? Q_IDLE));
  if (p.myId !== null && mineQ !== null && p.myId >= 0 && p.myId < out.length) out[p.myId] = decodeInput(mineQ);
  return out;
}

/** 예측이 넘어가도 되는 단계 전환인가. 점수·시계·골 세리머니·끝은 스냅샷만 믿는다 — 예측이 먼저 "골"을 띄우지 않게
 *  기준 스냅샷과 단계가 달라지는 틱에서 멈춘다(그 전 상태에서 얼린다). 단 킥오프 → 경기 중은 점수와 시계에 영향이 없고
 *  공을 처음 찬 직후라 얼리면 100ms 가까이 굳어 보이니 통과시킨다. */
function mayEnter(base: MatchState, next: MatchState): boolean {
  return next.phase === base.phase || (base.phase === 'kickoff' && next.phase === 'play');
}

function advanceState(p: Predictor, from: MatchState, base: MatchState, mineQ: number | null): MatchState {
  const next = step(from, p.config, inputsFor(p, mineQ));
  return mayEnter(base, next) ? next : from;
}

/** 스냅샷 반영. 틱이 lastSnapTick 이하면 무시(같은 객체). 아니면 그 상태에서 lead 틱을 다시 돌린다 —
 *  내 자리엔 history 의 최근 lead 개를, 다른 자리엔 스냅샷의 입력을 그대로 쓴다. paused 면 다시 돌리지 않고 그 상태를 그대로 보여 준다. */
export function applySnapshot(p: Predictor, snap: { tick: number; state: MatchState; inputs: number[]; paused: boolean }): Predictor {
  if (!(snap.tick > p.lastSnapTick)) return p;
  const next: Predictor = { ...p, base: snap.state, baseInputs: snap.inputs, lastSnapTick: snap.tick, predicted: snap.state, paused: snap.paused };
  if (snap.paused || p.lead <= 0) return next;
  let cur = snap.state;
  const h = p.history;
  for (let j = 0; j < p.lead; j++) {
    const idx = h.length - p.lead + j;
    cur = advanceState(next, cur, snap.state, idx >= 0 ? h[idx] : null);   // 기록이 모자란 앞쪽은 스냅샷에 실린 내 입력
  }
  next.predicted = cur;
  return next;
}

/** 로컬 한 틱 — 내 입력(양자화 값)을 기록하고 predicted 를 한 틱 진행한다(남의 입력은 마지막으로 안 것). base 가 없으면 기록만. */
export function advance(p: Predictor, myInputQ: number): Predictor {
  const q = Number.isInteger(myInputQ) && myInputQ >= 0 && myInputQ < Q_COUNT ? myInputQ : Q_IDLE;
  const history = p.history.length >= HISTORY ? [...p.history.slice(p.history.length - HISTORY + 1), q] : [...p.history, q];
  if (!p.base || !p.predicted || p.paused) return { ...p, history };
  return { ...p, history, predicted: advanceState(p, p.predicted, p.base, q) };
}
