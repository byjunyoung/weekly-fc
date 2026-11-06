// src/lib/games/predict.ts — 손님 쪽 예측(2026-11-06, 모든 게임 공용으로 2026-11-07). 순수.
// 설계: docs/superpowers/specs/2026-11-06-game-online-design.md §2.5
//
// 지연이 왕복 150ms 쯤이라 받은 상태를 그대로 그리면 내 선수가 굼뜨다. 계산이 순수라서 손님도 같은 step() 을 돌릴 수 있다 —
// 그 생각은 게임마다 같아서 예전 net.ts 의 예측기를 어댑터만 보게 옮겼다(동작은 그대로). 2D 경기 계산은 부르지 않는다.
// 이 파일은 시계·타이머·네트워크를 모른다. 시간은 바깥(세션)이 "틱"으로 불러 준다.
import type { GameAdapter } from './adapter.ts';

export type Predictor<C = unknown, S = unknown, I = unknown> = {
  game: GameAdapter<C, S, I>;
  config: C; myId: number | null;                    // myId = 내가 조종하는 자리(구경이면 null)
  base: S | null; baseInputs: number[];              // 마지막 스냅샷과 그때의 모든 자리 입력(양자화 값)
  predicted: S | null;                               // 지금 화면에 그릴 상태
  history: number[];                                 // 내 입력 기록(양자화 값), 최근 60틱, 뒤가 최신
  lead: number;                                      // 스냅샷에서 몇 틱 앞서 그릴지
  lastSnapTick: number;
  paused: boolean;                                   // 마지막 스냅샷이 "방장 멈춤"이었나 — 멈춘 동안은 advance 가 상태를 진행하지 않는다
};

const HISTORY = 60, MAX_LEAD = 20;

export function createPredictor<C, S, I>(game: GameAdapter<C, S, I>, config: C, myId: number | null): Predictor<C, S, I> {
  return { game, config, myId, base: null, baseInputs: [], predicted: null, history: [], lead: 0, lastSnapTick: -1, paused: false };
}

/** 왕복 시간(ms) → lead 틱. clamp(round(rtt/1000*60), 0, 20). 이상한 값(NaN·음수)은 0. */
export function leadTicks(rttMs: number): number {
  if (!Number.isFinite(rttMs)) return 0;
  return Math.min(MAX_LEAD, Math.max(0, Math.round((rttMs / 1000) * 60)));
}

export function setLead<P extends { lead: number }>(p: P, lead: number): P {
  const l = Number.isFinite(lead) ? Math.min(MAX_LEAD, Math.max(0, Math.round(lead))) : 0;
  return l === p.lead ? p : { ...p, lead: l };
}

/** 손을 뗀 입력의 정수. */
const idleQ = <C, S, I>(g: GameAdapter<C, S, I>): number => g.encode(g.idle);

/** 이 틱의 입력 한 벌 — 스냅샷의 입력을 풀고(모자란 자리는 정지), 내 자리만 mineQ 로 바꾼다. 구경이면 아무것도 안 바꾼다. */
function inputsFor<C, S, I>(p: Predictor<C, S, I>, mineQ: number | null): I[] {
  const g = p.game, idle = idleQ(g);
  const out: I[] = Array.from({ length: g.slots(p.config) }, (_, i) => g.decode(p.baseInputs[i] ?? idle));
  if (p.myId !== null && mineQ !== null && p.myId >= 0 && p.myId < out.length) out[p.myId] = g.decode(mineQ);
  return out;
}

/** 예측이 넘어가도 되는 단계 전환인가. 점수·시계·골 세리머니·끝은 스냅샷만 믿는다 — 예측이 먼저 "골"을 띄우지 않게
 *  기준 스냅샷과 단계가 달라지는 틱에서 멈춘다(그 전 상태에서 얼린다). 넘어가도 되는 전환은 어댑터가 정한다(predictsAcross). */
function mayEnter<C, S, I>(g: GameAdapter<C, S, I>, base: S, next: S): boolean {
  const a = g.phase(base), b = g.phase(next);
  return a === b || (!!g.predictsAcross && g.predictsAcross(a, b));
}

function advanceState<C, S, I>(p: Predictor<C, S, I>, from: S, base: S, mineQ: number | null): S {
  const next = p.game.step(from, p.config, inputsFor(p, mineQ));
  return mayEnter(p.game, base, next) ? next : from;
}

/** 스냅샷 반영. 틱이 lastSnapTick 이하면 무시(같은 객체). 아니면 그 상태에서 lead 틱을 다시 돌린다 —
 *  내 자리엔 history 의 최근 lead 개를, 다른 자리엔 스냅샷의 입력을 그대로 쓴다. paused 면 다시 돌리지 않고 그 상태를 그대로 보여 준다. */
export function applySnapshot<C, S, I>(p: Predictor<C, S, I>, snap: { tick: number; state: S; inputs: number[]; paused: boolean }): Predictor<C, S, I> {
  if (!(snap.tick > p.lastSnapTick)) return p;
  const next: Predictor<C, S, I> = { ...p, base: snap.state, baseInputs: snap.inputs, lastSnapTick: snap.tick, predicted: snap.state, paused: snap.paused };
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
export function advance<C, S, I>(p: Predictor<C, S, I>, myInputQ: number): Predictor<C, S, I> {
  const q = Number.isInteger(myInputQ) && myInputQ >= 0 && myInputQ < p.game.codes ? myInputQ : idleQ(p.game);
  const history = p.history.length >= HISTORY ? [...p.history.slice(p.history.length - HISTORY + 1), q] : [...p.history, q];
  if (!p.base || !p.predicted || p.paused) return { ...p, history };
  return { ...p, history, predicted: advanceState(p, p.predicted, p.base, q) };
}
