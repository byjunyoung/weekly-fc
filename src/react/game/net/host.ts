// src/react/game/net/host.ts — 방장 세션(2026-11-06). 방 상태와 경기 계산의 유일한 주인.
// 설계: docs/superpowers/specs/2026-11-06-game-online-design.md §2.3·§2.6
//
// 방장 기기가 계산한다(1단계 인터뷰 결정). 손님은 hello·pick·in·say·ping·bye 만 보내고, 방 상태(room)와 경기(snap)는 여기서만 바뀐다.
// 입력은 셋 다 양자화한 값으로 계산한다 — 내 조작, 봇(botInput), 손님(받은 숫자 그대로). 손님 쪽 예측이 같은 숫자로 step() 을
// 돌려야 화면이 덜 어긋나기 때문이다(스펙 §2.4). 그래서 자리마다 "이번 틱에 쓴 q" 를 모아 스냅샷에 그대로 싣는다.
import type { Player } from '../../../lib/types.ts';
import type { Input, MatchConfig, MatchState } from '../../../lib/game/sim.ts';
import { NO_INPUT, createMatch, step } from '../../../lib/game/sim.ts';
import { botInput } from '../../../lib/game/bot.ts';
import type { NetMsg } from '../../../lib/game/net.ts';
import { Q_IDLE, decodeInput, encodeInput, parseMsg } from '../../../lib/game/net.ts';
import type { RoomSettings, RoomState, Team, Who } from '../../../lib/game/room.ts';
import { autoBalance, buildMatch, createRoom, join, leave, move, pick, setPhase, setSettings } from '../../../lib/game/room.ts';
import type { Transport } from './transport.ts';
import type { Bubble, DrawFrame, NetInfo, SessionView } from './common.ts';
import {
  MAX_CATCHUP, PAUSED_SNAP_MS, RESULT_MS, ROOM_EVERY_MS, SAY_GAP_MS, SILENCE_MS, SNAP_EVERY, STEP_MS,
  createStore, liveBubbles, pushBubble, sayIsValid,
} from './common.ts';
import { lerpState } from './smooth.ts';

export type HostOptions = {
  transport: Transport;
  /** 포털 명단 — 봇을 뽑고 능력치를 정한다. */
  roster: Player[];
  me: Who;
  code: string;
  /** 시계(ms). 브라우저 = performance.now, 테스트 = 가짜 시계. */
  now: () => number;
  /** 봇 뽑기·경기 씨앗용 난수(0..1). 기본 Math.random. */
  rnd?: () => number;
};

export type HostSession = {
  readonly role: 'host';
  subscribe(fn: () => void): () => void;
  getView(): SessionView;
  /** 시간에 따라 할 일 전부. 브라우저는 rAF 와 느슨한 interval 이, 테스트는 가짜 시계가 부른다. */
  advance(now?: number): void;
  /** 탭이 가려졌나(visibilitychange). 가려지면 경기를 멈추고 "멈춤" 스냅샷을 1초마다 보낸다. */
  setHidden(hidden: boolean): void;
  /** 내 조작을 읽는 함수(시뮬레이션 방향). 틱마다 한 번 부른다. null = 손 뗌. */
  setInputReader(fn: (() => Input) | null): void;
  /** 한마디(PHRASES 번호). 1.5초에 한 번. 보냈으면 true. */
  say(k: number): boolean;
  /** 지금 그릴 것(직전·현재 틱을 섞은 상태 + 말풍선). 경기가 없으면 null. */
  frame(now?: number): DrawFrame | null;
  /** 방을 닫는다 — bye 를 보내고 길을 닫는다. 그 뒤로는 아무것도 안 한다. */
  leave(): void;

  setSettings(patch: Partial<RoomSettings>): void;
  move(clientId: string, team: Team): void;
  autoBalance(): void;
  /** 시작할 수 없는 이유(없으면 null). [시작] 을 미리 막는 데 쓴다. */
  startBlock(): string | null;
  start(): boolean;
  /** ✕ — 경기를 끊고 모두 방으로. */
  stop(): void;
  /** 결과 화면에서 [바로 방으로]. */
  toLobby(): void;
  /** 띄운 안내를 지운다. */
  clearNotice(): void;

  getState(): MatchState | null;
  getConfig(): MatchConfig | null;
  getRoom(): RoomState | null;
  getNet(): NetInfo;
  /** 경기 자리마다 누가 조종하나(디버그·테스트). bot = 봇이거나 그 손님이 4초 넘게 조용해 봇이 맡는 중. */
  getSlots(): { clientId: string | null; bot: boolean }[];
};

type Match = {
  config: MatchConfig; seed: number; slots: (string | null)[];
  state: MatchState; prev: MatchState; qs: number[];
  acc: number; endedAt: number | null; lastPausedSnap: number;
};

/** 시작 전에 막을 이유 — buildMatch 가 RangeError 를 내기 전에 화면이 알게(report-3: 필요 봇 수 ≤ 명단 − 방 사람 수). */
export function startBlockOf(room: RoomState, roster: Player[]): string | null {
  const ps = room.settings.perSide;
  const taken = new Set(room.members.map((m) => m.num));
  const free = new Set(roster.filter((p) => !taken.has(p.num)).map((p) => p.num)).size;
  const humans = [0, 1].map((t) => Math.min(ps, room.members.filter((m) => m.team === t).length));
  const need = ps * 2 - humans[0] - humans[1];
  if (free < need) return `명단이 모자라 봇 ${need}명을 채울 수 없습니다 — 인원을 줄여 주세요`;
  return null;
}

export function createHostSession(o: HostOptions): HostSession {
  const t = o.transport, rnd = o.rnd ?? Math.random;
  const me = o.me;
  let room: RoomState = createRoom(o.code, me);
  let match: Match | null = null;
  let hidden = false, closed = false;
  let reader: (() => Input) | null = null;
  let lastAt = o.now();
  let lastRoomSent = -Infinity, lastSilence = -Infinity, lastSay = -Infinity;
  let bubbles: Bubble[] = [];
  /** 손님별 마지막으로 들은 때·받은 입력·입력 번호. 침묵 판정과 "그 자리를 봇이 맡나"가 이 값의 함수다(상태 기계를 따로 두지 않는다). */
  const lastSeen = new Map<string, number>();
  const lastQ = new Map<string, number>();
  const lastSeq = new Map<string, number>();
  let conn: SessionView['conn'] = 'connecting';
  let matchKey = 0;

  const store = createStore<SessionView>({
    role: 'host', code: o.code, clientId: me.clientId, room, conn, stage: 'lobby', matchKey, config: null, myId: null,
    paused: false, hostLost: false, result: null, notice: null, endedWhy: null, joinSlow: false,
  });

  const send = (m: NetMsg): void => { if (!closed) t.send(m); };
  const rosterNums = o.roster.map((p) => p.num).slice(0, 200);
  const sendRoom = (now: number): void => { lastRoomSent = now; send({ t: 'room', room, roster: rosterNums }); };
  const setRoom = (r: RoomState, now: number): void => {
    if (r === room) return;
    room = r;
    store.set({ room });
    sendRoom(now);
  };
  const mySlot = (): number | null => { if (!match) return null; const i = match.slots.indexOf(me.clientId); return i < 0 ? null : i; };
  const alive = (cid: string, now: number): boolean => { const s = lastSeen.get(cid); return s !== undefined && now - s <= SILENCE_MS; };
  const sendSnap = (m: Match, paused: boolean): void => {
    send({ t: 'snap', tick: m.state.tick, state: m.state, inputs: m.qs, paused });
  };
  const sendStart = (m: Match): void => send({ t: 'start', config: m.config, seed: m.seed });

  t.onStatus((s) => {
    conn = s;
    store.set({ conn: s });
    // 다시 붙으면 방 상태를 바로 한 번 — 끊긴 동안 손님 쪽 기록이 낡았을 수 있다.
    if (s === 'open' && !closed) sendRoom(o.now());
  });

  t.onMessage((raw) => {
    if (closed) return;
    const m = parseMsg(raw);
    if (!m) return;
    const now = o.now();
    // 방장에게 오는 것만. 내가 보낸 것(self:false 라 안 오지만 한 번 더)과 남에게 가는 것은 무시.
    if ('from' in m && m.from === me.clientId) return;
    switch (m.t) {
      case 'hello': {
        const r = join(room, { clientId: m.from, num: m.num, name: m.name });
        if (!r.ok) { send({ t: 'deny', to: m.from, reason: r.reason }); return; }
        lastSeen.set(m.from, now);
        lastSeq.delete(m.from);   // 새로고침한 탭은 입력 번호를 0 부터 다시 센다
        if (r.room !== room) setRoom(r.room, now); else sendRoom(now);   // 들어왔다는 답 — 바뀐 게 없어도 보낸다
        // 경기 중에 (다시) 들어왔으면 경기 설정을 다시 — 자리가 있으면 이어서 뛰고, 없으면 구경한다.
        if (match) { sendStart(match); sendSnap(match, hidden); }
        return;
      }
      case 'pick': {
        if (!room.members.some((x) => x.clientId === m.from)) return;
        lastSeen.set(m.from, now);
        if (room.phase !== 'lobby') return;
        const r = pick(room, m.from, m.num, m.name);
        const mine = room.members.find((x) => x.clientId === m.from);
        if (r === room && mine && mine.num !== m.num) { send({ t: 'deny', to: m.from, reason: 'taken' }); sendRoom(now); return; }
        setRoom(r, now);
        return;
      }
      case 'in': {
        if (!room.members.some((x) => x.clientId === m.from)) return;
        lastSeen.set(m.from, now);
        if (m.seq <= (lastSeq.get(m.from) ?? -1)) return;   // 늦게 온 옛 입력
        lastSeq.set(m.from, m.seq);
        lastQ.set(m.from, m.i);
        return;
      }
      case 'ping': {
        if (!room.members.some((x) => x.clientId === m.from)) return;
        lastSeen.set(m.from, now);
        send({ t: 'pong', to: m.from, at: m.at });
        return;
      }
      case 'say': {
        if (!room.members.some((x) => x.clientId === m.from)) return;
        lastSeen.set(m.from, now);
        if (match && sayIsValid(room, match.config, m)) bubbles = pushBubble(bubbles, m.id, m.k, now);
        return;
      }
      case 'bye': {
        // 로비면 명단에서 뺀다. 경기 중이면 그 자리를 봇이 맡는다(들은 때를 지우면 alive 가 거짓) — 명단 정리는 방으로 돌아갈 때.
        lastSeen.delete(m.from);
        if (!match) setRoom(leave(room, m.from), now);
        return;
      }
      default: return;   // room·start·snap·stop·deny·pong 은 방장이 보내는 것 — 누가 흉내 내도 무시
    }
  });

  /** 한 틱. 자리마다 q 를 정하고(내 것·봇·손님), 그 q 를 풀어 step 에 넣는다 — 스냅샷에 싣는 것도 같은 q. */
  const tick = (m: Match, now: number): void => {
    const s = m.state, me_ = mySlot();
    const qs = m.config.players.map((_, i) => {
      if (i === me_) return encodeInput(reader ? reader() : NO_INPUT);
      const cid = m.slots[i];
      if (cid === null || !alive(cid, now)) return encodeInput(botInput(s, m.config, i));   // 봇, 또는 조용해진 손님 자리
      return lastQ.get(cid) ?? Q_IDLE;
    });
    const next = step(s, m.config, qs.map(decodeInput));
    m.prev = s; m.state = next; m.qs = qs;
    if (next.phase !== s.phase) sendSnap(m, false);          // 골·끝은 바로
    else if (next.tick % SNAP_EVERY === 0) sendSnap(m, false);
    if (next.phase === 'end' && m.endedAt === null) {
      m.endedAt = now;
      store.set({ result: { score: [next.score[0], next.score[1]], winner: (next.winner ?? 'draw') as 0 | 1 | 'draw' } });
    }
  };

  const checkSilence = (now: number): void => {
    lastSilence = now;
    if (match) return;   // 경기 중엔 빼지 않는다 — 자리는 alive() 가 봇에게 넘긴다
    let r = room;
    for (const x of room.members) if (x.clientId !== me.clientId && !alive(x.clientId, now)) r = leave(r, x.clientId);
    setRoom(r, now);
  };

  const backToLobby = (now: number): void => {
    if (!match) return;
    match = null;
    bubbles = [];
    let r = setPhase(room, 'lobby');
    for (const x of r.members) if (x.clientId !== me.clientId && !alive(x.clientId, now)) r = leave(r, x.clientId);
    setRoom(r, now);
    send({ t: 'stop' });
    store.set({ stage: 'lobby', config: null, myId: null, result: null });
  };

  const api: HostSession = {
    role: 'host',
    subscribe: store.subscribe,
    getView: store.get,

    advance(now = o.now()) {
      if (closed) return;
      const dt = now - lastAt;
      lastAt = now;
      if (now - lastSilence >= 250) checkSilence(now);
      if (now - lastRoomSent >= ROOM_EVERY_MS) sendRoom(now);
      const m = match;
      if (!m) return;
      if (m.endedAt !== null) { if (now - m.endedAt >= RESULT_MS) backToLobby(now); return; }
      if (hidden) {
        if (now - m.lastPausedSnap >= PAUSED_SNAP_MS) { m.lastPausedSnap = now; sendSnap(m, true); }
        return;
      }
      m.acc += Math.min(Math.max(0, dt), MAX_CATCHUP * STEP_MS);
      let n = 0;
      while (m.acc >= STEP_MS && n < MAX_CATCHUP && m.endedAt === null) { tick(m, now); m.acc -= STEP_MS; n++; }
      if (n === MAX_CATCHUP) m.acc = 0;
    },

    setHidden(h) {
      if (closed || h === hidden) return;
      hidden = h;
      const now = o.now();
      lastAt = now;
      // 돌아옴 — 폰은 가려진 탭을 얼려 손님 소식을 못 들었을 수 있다. 모두 방금 들은 것으로 쳐서 한꺼번에 내보내지 않는다.
      if (!h) for (const k of lastSeen.keys()) lastSeen.set(k, now);
      if (!match || match.endedAt !== null) return;
      if (h) { match.lastPausedSnap = now; sendSnap(match, true); return; }
      match.acc = 0;   // 밀린 시간을 따라잡지 않는다(1단계와 같다)
      sendSnap(match, false);
    },

    setInputReader(fn) { reader = fn; },

    say(k) {
      const now = o.now(), id = mySlot();
      if (!match || id === null || now - lastSay < SAY_GAP_MS) return false;
      lastSay = now;
      send({ t: 'say', from: me.clientId, id, k });
      bubbles = pushBubble(bubbles, id, k, now);
      return true;
    },

    frame(now = o.now()) {
      if (!match) return null;
      const m = match;
      const a = m.endedAt !== null || hidden ? 1 : m.acc / STEP_MS;
      return { state: lerpState(m.prev, m.state, a), config: m.config, myId: mySlot(), bubbles: liveBubbles(bubbles, now) };
    },

    leave() {
      if (closed) return;
      send({ t: 'bye', from: me.clientId });
      closed = true;
      match = null;
      t.close();
      store.set({ stage: 'ended', endedWhy: null, conn: 'closed' });
    },

    setSettings(patch) { if (!match && room.phase === 'lobby') setRoom(setSettings(room, patch), o.now()); },
    move(cid, team) { if (!match && room.phase === 'lobby') setRoom(move(room, cid, team), o.now()); },
    autoBalance() { if (!match && room.phase === 'lobby') setRoom(autoBalance(room, o.roster), o.now()); },
    startBlock() { return startBlockOf(room, o.roster); },

    start() {
      if (closed || match || room.phase !== 'lobby') return false;
      const why = startBlockOf(room, o.roster);
      if (why) { store.set({ notice: why }); return false; }
      let built: { config: MatchConfig; slots: (string | null)[] };
      try { built = buildMatch(room, o.roster, rnd); }
      catch (e) {
        if (e instanceof RangeError) { store.set({ notice: '명단이 모자라 봇을 채울 수 없습니다' }); return false; }
        throw e;
      }
      const now = o.now();
      const seed = Math.floor(rnd() * 0x100000000) >>> 0;
      const state = createMatch(built.config, seed);
      match = {
        config: built.config, seed, slots: built.slots, state, prev: state, qs: built.config.players.map(() => Q_IDLE),
        acc: 0, endedAt: null, lastPausedSnap: -Infinity,
      };
      lastQ.clear();
      bubbles = [];
      lastAt = now;
      matchKey += 1;
      setRoom(setPhase(room, 'match'), now);
      sendStart(match);
      sendSnap(match, hidden);
      store.set({ stage: 'match', matchKey, config: built.config, myId: mySlot(), result: null, notice: null });
      return true;
    },
    stop() { backToLobby(o.now()); },
    toLobby() { backToLobby(o.now()); },
    clearNotice() { store.set({ notice: null }); },

    getState: () => match?.state ?? null,
    getConfig: () => match?.config ?? null,
    getRoom: () => room,
    getNet: () => ({ status: conn, rttMs: null, lead: null, myId: mySlot() }),
    getSlots: () => {
      const m = match, now = o.now();
      if (!m) return [];
      return m.slots.map((cid) => ({ clientId: cid, bot: cid === null || (cid !== me.clientId && !alive(cid, now)) }));
    },
  };
  // 첫 방 상태 — 손님이 이미 hello 를 보내고 있을 수 있다(새로고침해 방을 다시 연 경우).
  sendRoom(o.now());
  return api;
}
