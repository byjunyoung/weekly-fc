// src/react/game/net/guest.ts — 손님 세션(2026-11-06). 방장이 보낸 방 상태와 경기를 받아 그리고, 내 입력만 보낸다.
// 설계: docs/superpowers/specs/2026-11-06-game-online-design.md §2.4·§2.5
//
// 손님은 아무것도 정하지 않는다 — 방 상태는 받은 그대로(rev 가 낮으면 버림), 점수·시계·단계는 스냅샷 것을 믿는다.
// 다만 왕복 150ms 쯤이 걸려 받은 대로만 그리면 내 선수가 굼뜨니, 같은 step() 으로 내 입력을 앞당겨 그린다(net.ts 의 Predictor).
//
// 내 선수 id 를 아는 법: 방장은 slots(누가 어느 자리)를 보내지 않는다. 대신 buildMatch 가 방에 있는 사람(대기 포함)의 선수를
// 봇 후보에서 빼므로, 경기 설정에서 "봇이 아니고 번호가 내 선수와 같은 자리"는 많아야 하나다 — 없으면 구경(대기 칸·경기 중 들어옴).
import type { Player } from '../../../lib/types.ts';
import type { Input, MatchConfig, MatchState } from '../../../lib/game/sim.ts';
import { NO_INPUT } from '../../../lib/game/sim.ts';
import type { NetMsg, Predictor } from '../../../lib/game/net.ts';
import { Q_IDLE, advance, applySnapshot, createPredictor, encodeInput, leadTicks, parseMsg, setLead } from '../../../lib/game/net.ts';
import type { RoomState, Who } from '../../../lib/game/room.ts';
import type { Transport } from './transport.ts';
import type { Bubble, DrawFrame, NetInfo, SessionView, Stage } from './common.ts';
import {
  DENY_TEXT, HELLO_EVERY_MS, JOIN_SLOW_MS, KEEPALIVE_MS, MAX_CATCHUP, PING_EVERY_MS, SAY_GAP_MS, SILENCE_MS, SLACK_MS, STEP_MS,
  createStore, liveBubbles, pushBubble, sayIsValid,
} from './common.ts';
import type { Offsets } from './smooth.ts';
import { correct, decay, lerpState, noOffsets, withOffsets } from './smooth.ts';

export type GuestOptions = {
  transport: Transport;
  roster: Player[];
  me: Who;
  code: string;
  now: () => number;
};

export type GuestSession = {
  readonly role: 'guest';
  subscribe(fn: () => void): () => void;
  getView(): SessionView;
  advance(now?: number): void;
  /** 손님은 가려져도 할 일이 없다(입력은 창이 포커스를 잃으면 비워진다). 방장과 모양을 맞추려고 둔다. */
  setHidden(hidden: boolean): void;
  setInputReader(fn: (() => Input) | null): void;
  say(k: number): boolean;
  frame(now?: number): DrawFrame | null;
  leave(): void;
  /** 내 선수 바꾸기(로비에서만). 남이 고른 선수면 보내지 않고 안내만. */
  pick(num: number, name: string): void;
  clearNotice(): void;

  /** 예측한 상태(그리는 몸). */
  getState(): MatchState | null;
  /** 마지막 스냅샷 상태(점수·시계·단계의 출처). */
  getBase(): MatchState | null;
  getConfig(): MatchConfig | null;
  getRoom(): RoomState | null;
  getNet(): NetInfo;
  /** 테스트용 — 예측기 그대로. */
  getPredictor(): Predictor | null;
};

/** 경기 설정에서 내 자리 — 봇이 아니고 내 선수 번호인 자리. 없으면 null(구경). 위 머리글의 불변식에 기댄다. */
export function myIdFor(config: MatchConfig, myNum: number): number | null {
  const i = config.players.findIndex((p) => !p.bot && p.num === myNum);
  return i < 0 ? null : i;
}

type StartMsg = Extract<NetMsg, { t: 'start' }>;
type SnapMsg = Extract<NetMsg, { t: 'snap' }>;

export function createGuestSession(o: GuestOptions): GuestSession {
  const t = o.transport;
  let me: Who = { ...o.me };
  let room: RoomState | null = null;
  let hostId: string | null = null;
  let stage: Stage = 'joining';
  let closed = false;
  let conn: SessionView['conn'] = 'connecting';
  let reader: (() => Input) | null = null;

  const t0 = o.now();
  let lastAt = t0, joinStartAt = t0, lastHello = -Infinity, lastHostAt = t0, lastPing = -Infinity, lastSay = -Infinity;
  let rtt: number | null = null;

  // 경기
  let pred: Predictor | null = null;
  let seed: number | null = null;
  let pendingStart: StartMsg | null = null;
  let acc = 0;
  let prevShown: MatchState | null = null;   // 직전 틱의 예측(틱 사이 섞기)
  let offsets: Offsets = noOffsets(0);
  let seq = 0, lastSentQ: number | null = null, lastInAt = -Infinity;
  let bubbles: Bubble[] = [];
  let matchKey = 0;

  const store = createStore<SessionView>({
    role: 'guest', code: o.code, clientId: me.clientId, room: null, conn, stage, matchKey, config: null, myId: null,
    paused: false, hostLost: false, result: null, notice: null, endedWhy: null, joinSlow: false,
  });

  const send = (m: NetMsg): void => { if (!closed) t.send(m); };
  const hello = (now: number): void => { lastHello = now; send({ t: 'hello', from: me.clientId, num: me.num, name: me.name }); };
  const mine = (): RoomState['members'][number] | undefined => room?.members.find((x) => x.clientId === me.clientId);

  const end = (why: string | null): void => {
    if (closed) return;
    send({ t: 'bye', from: me.clientId });   // 방장이 살아 있다면 자리를 바로 비우게
    closed = true;
    stage = 'ended';
    pred = null;
    t.close();
    store.set({ stage, endedWhy: why, hostLost: why !== null && why === LOST, conn: 'closed', config: null, myId: null });
  };

  const exitMatch = (): void => {
    pred = null; seed = null; prevShown = null; bubbles = []; acc = 0;
    if (stage === 'match') stage = 'lobby';
    store.set({ stage, config: null, myId: null, result: null, paused: false });
  };

  const applyStart = (m: StartMsg, now: number): void => {
    pendingStart = null;
    if (pred && seed === m.seed) return;   // 방장이 다시 보낸 같은 경기 — 예측기를 새로 만들지 않는다
    const my = mine();
    const myId = my ? myIdFor(m.config, my.num) : null;
    pred = setLead(createPredictor(m.config, myId), rtt === null ? 0 : leadTicks(rtt));
    seed = m.seed;
    acc = 0; lastAt = now; prevShown = null; offsets = noOffsets(m.config.players.length);
    lastSentQ = null; lastInAt = -Infinity; bubbles = [];
    matchKey += 1;
    stage = 'match';
    store.set({ stage, matchKey, config: m.config, myId, result: null, paused: false });
  };

  const applySnap = (snap: SnapMsg): void => {
    let p = pred;
    if (!p) return;
    if (snap.tick === p.lastSnapTick) {
      // 방장이 멈추면 틱이 그대로라 applySnapshot 이 같은 틱을 버린다 — "멈춤/다시"만은 여기서 받아 둔다.
      if (snap.paused !== p.paused) p = { ...p, paused: snap.paused, predicted: snap.paused ? p.base : p.predicted };
    } else {
      const before = p.predicted;
      const next = applySnapshot(p, snap);
      if (next !== p && next.predicted) { offsets = correct(offsets, before, next.predicted); prevShown = next.predicted; }
      p = next;
    }
    pred = p;
    const base = p.base;
    store.set({
      paused: p.paused,
      ...(base && base.phase === 'end' && !store.get().result
        ? { result: { score: [base.score[0], base.score[1]] as [number, number], winner: (base.winner ?? 'draw') as 0 | 1 | 'draw' } } : {}),
    });
  };

  t.onStatus((s) => {
    conn = s;
    if (s === 'open') { lastHostAt = o.now(); if (stage === 'joining') lastHello = -Infinity; }
    if (!closed) store.set({ conn: s });
  });

  t.onMessage((raw) => {
    if (closed) return;
    const m = parseMsg(raw);
    if (!m) return;
    if ('from' in m && m.from === me.clientId) return;
    if ('to' in m && m.to !== me.clientId) return;
    const now = o.now();
    switch (m.t) {
      case 'room': {
        if (m.room.code !== o.code) return;
        lastHostAt = now;
        // 같은 방장의 옛 상태는 버린다. 방장이 바뀌었으면(방을 다시 열었다) 번호를 새로 센다.
        if (room && hostId === m.room.hostId && m.room.rev <= room.rev) return;
        hostId = m.room.hostId;
        room = m.room;
        const my = mine();
        if (my) {
          me = { clientId: me.clientId, num: my.num, name: my.name };
          if (stage === 'joining') stage = 'lobby';
          if (room.phase === 'lobby' && stage === 'match') exitMatch();
          if (pendingStart && room.phase === 'match') applyStart(pendingStart, now);
        } else if (stage === 'lobby' || stage === 'match') {
          // 방에서 빠졌다(오래 조용했다) — 다시 들어간다.
          exitMatch();
          stage = 'joining'; joinStartAt = now; lastHello = -Infinity;
        }
        store.set({ room, stage, joinSlow: stage === 'joining' ? store.get().joinSlow : false });
        return;
      }
      case 'deny': {
        lastHostAt = now;
        if (stage === 'joining') end(DENY_TEXT[m.reason]);
        else store.set({ notice: DENY_TEXT[m.reason] });
        return;
      }
      case 'start': {
        lastHostAt = now;
        if (!mine()) { pendingStart = m; return; }
        applyStart(m, now);
        return;
      }
      case 'snap': lastHostAt = now; applySnap(m); return;
      case 'stop': lastHostAt = now; exitMatch(); return;
      case 'pong': {
        lastHostAt = now;
        const sample = now - m.at;
        if (!(sample >= 0) || sample > 10000) return;
        rtt = rtt === null ? sample : rtt * 0.75 + sample * 0.25;   // 부드럽게 — 한 번 튄 값에 lead 가 출렁이지 않게
        if (pred) pred = setLead(pred, leadTicks(rtt));
        return;
      }
      case 'say': {
        if (pred && sayIsValid(room, pred.config, m)) bubbles = pushBubble(bubbles, m.id, m.k, now);
        return;
      }
      case 'bye': if (m.from === hostId) end('방장이 방을 닫았습니다'); return;
      default: return;   // hello·pick·in·ping 은 방장에게 가는 것
    }
  });

  const api: GuestSession = {
    role: 'guest',
    subscribe: store.subscribe,
    getView: store.get,

    advance(now = o.now()) {
      if (closed) return;
      const dt = now - lastAt;
      lastAt = now;
      offsets = decay(offsets, dt);
      if (stage === 'joining') {
        if (conn === 'open' && now - lastHello >= HELLO_EVERY_MS - SLACK_MS) hello(now);
        if (now - joinStartAt >= JOIN_SLOW_MS) store.set({ joinSlow: true });
        return;
      }
      if (stage === 'ended') return;
      if (conn !== 'open') { lastHostAt = now; return; }   // 내 쪽 길이 끊긴 동안은 방장 침묵으로 치지 않는다(다시 붙는 중 안내만)
      if (now - lastHostAt > SILENCE_MS) { end(LOST); return; }
      if (now - lastPing >= PING_EVERY_MS - SLACK_MS) { lastPing = now; send({ t: 'ping', from: me.clientId, at: now }); }
      // 방은 경기 중인데 경기 설정을 못 받았다(놓쳤다) — hello 를 다시 보내면 방장이 start 를 다시 보낸다.
      if (room?.phase === 'match' && !pred && now - lastHello >= HELLO_EVERY_MS - SLACK_MS) hello(now);
      const p0 = pred;
      if (!p0 || stage !== 'match') return;
      const playing = p0.myId !== null;
      acc += Math.min(Math.max(0, dt), MAX_CATCHUP * STEP_MS);
      let n = 0, q = Q_IDLE;
      let p = p0;
      while (acc >= STEP_MS && n < MAX_CATCHUP) {
        q = playing ? encodeInput(reader ? reader() : NO_INPUT) : Q_IDLE;
        prevShown = p.predicted;
        p = advance(p, q);
        acc -= STEP_MS; n++;
      }
      if (n === MAX_CATCHUP) acc = 0;
      pred = p;
      // 입력은 바뀔 때만 + 0.5초마다 살아 있음 알림(스펙 §2.4). 한 번 부를 때 많아야 하나.
      if (playing && n > 0 && (q !== lastSentQ || now - lastInAt >= KEEPALIVE_MS - SLACK_MS)) {
        lastSentQ = q; lastInAt = now;
        send({ t: 'in', from: me.clientId, seq: seq++, i: q });
      }
    },

    setHidden() { /* 손님 쪽은 할 일 없음 */ },
    setInputReader(fn) { reader = fn; },

    say(k) {
      const now = o.now();
      if (!pred || pred.myId === null || now - lastSay < SAY_GAP_MS) return false;
      lastSay = now;
      send({ t: 'say', from: me.clientId, id: pred.myId, k });
      bubbles = pushBubble(bubbles, pred.myId, k, now);
      return true;
    },

    frame(now = o.now()) {
      const p = pred;
      if (!p || !p.predicted || !p.base) return null;
      const body = withOffsets(lerpState(prevShown ?? p.predicted, p.predicted, p.paused ? 1 : acc / STEP_MS), offsets);
      // 몸은 예측, 점수·시계·단계는 스냅샷(report-3: 예측은 골을 먼저 띄우지 않는다).
      const state: MatchState = { ...p.base, ball: body.ball, players: body.players };
      return { state, config: p.config, myId: p.myId, bubbles: liveBubbles(bubbles, now) };
    },

    leave() { end(null); },

    pick(num, name) {
      if (closed || stage !== 'lobby' || !room || room.phase !== 'lobby') return;
      if (room.members.some((x) => x.clientId !== me.clientId && x.num === num)) { store.set({ notice: DENY_TEXT.taken }); return; }
      send({ t: 'pick', from: me.clientId, num, name });
    },
    clearNotice() { store.set({ notice: null }); },

    getState: () => pred?.predicted ?? null,
    getBase: () => pred?.base ?? null,
    getConfig: () => pred?.config ?? null,
    getRoom: () => room,
    getNet: () => ({ status: conn, rttMs: rtt, lead: pred ? pred.lead : rtt === null ? null : leadTicks(rtt), myId: pred?.myId ?? null }),
    getPredictor: () => pred,
  };
  return api;
}

const LOST = '방장과 연결이 끊겼습니다';
