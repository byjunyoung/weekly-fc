// src/react/game/net/host.ts — 방장 세션(2026-11-06). 방 상태와 경기 계산의 유일한 주인.
// 설계: docs/superpowers/specs/2026-11-06-game-online-design.md §2.3·§2.6
//
// 방장 기기가 계산한다(1단계 인터뷰 결정). 손님은 hello·pick·in·say·ping·bye 만 보내고, 방 상태(room)와 경기(snap)는 여기서만 바뀐다.
// 입력은 셋 다 양자화한 값으로 계산한다 — 내 조작, 봇(botInput), 손님(받은 숫자 그대로). 손님 쪽 예측이 같은 숫자로 step() 을
// 돌려야 화면이 덜 어긋나기 때문이다(스펙 §2.4). 그래서 자리마다 "이번 틱에 쓴 q" 를 모아 스냅샷에 그대로 싣는다.
// 2026-11-07 게임 묶음: 계산은 방의 게임 종류(room.game)의 어댑터가 한다 — 이 파일은 어느 게임인지 모르고, games(등록부 찾기)로 받는다.
import type { Player } from '../../../lib/types.ts';
import type { AnyAdapter } from '../../../lib/games/adapter.ts';
import type { GameEntry, GameLookup } from '../../../lib/games/entry.ts';
import type { NetMsg } from '../../../lib/games/net.ts';
import { acceptIn, parseMsg } from '../../../lib/games/net.ts';
import type { RoomState, Team, Who } from '../../../lib/game/room.ts';
import { autoBalance, createRoom, join, leave as leaveRoom, move, pick, setBotPick, setGame, setPhase, withSettings } from '../../../lib/game/room.ts';
import type { Transport } from './transport.ts';
import type { Bubble, DrawFrame, NetInfo, SessionView } from './common.ts';
import {
  CROWD_MEMBERS, CROWD_ROOM_EVERY_MS, GIVE_UP_MS, HOST_SLOW_MS, PROBE_EVERY_MS, HELLO_DEDUPE_MS, HIDDEN_ROOM_EVERY_MS, LOBBY_SILENCE_MS, MAX_CATCHUP, PAUSED_SNAP_MS, RESULT_MS, ROOM_EVERY_MS, SAY_GAP_MS, SILENCE_MS, SLACK_MS, SNAP_EVERY, STEP_MS,
  createStore, liveBubbles, pushBubble, sayIsValid,
} from './common.ts';
import type { Smoother } from './smooth.ts';
import { smootherFor } from './smooth.ts';

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
  /** 방장 세션 고유값(room 메시지의 sid). 기본은 rnd 로 만든다 — 새로고침하면 바뀌어 손님이 rev 를 새로 센다. */
  sid?: string;
  /** 등록된 게임 찾기(id → 게임). 브라우저는 등록부(registry.gameOf), 테스트는 가짜 게임도 넣는다. */
  games: GameLookup;
  /** 방을 처음 열 때의 게임 종류. 등록돼 있어야 한다. */
  game: string;
  /** 방을 처음 열 때 그 게임의 설정(2026-11-07 2단계 — 방장이 새로고침해 방을 다시 열 때 고른 설정을 잇는다).
   *  그 게임의 okSettings 를 못 지나면(없거나 낡은 값) 기본 설정. */
  settings?: unknown;
};

export type HostSession = {
  readonly role: 'host';
  subscribe(fn: () => void): () => void;
  getView(): SessionView;
  /** 시간에 따라 할 일 전부. 브라우저는 rAF 와 느슨한 interval 이, 테스트는 가짜 시계가 부른다. */
  advance(now?: number): void;
  /** 탭이 가려졌나(visibilitychange). 가려지면 경기를 멈추고 "멈춤" 스냅샷을 1초마다 보낸다. */
  setHidden(hidden: boolean): void;
  /** 내 조작을 읽는 함수(그 게임의 입력, 시뮬레이션 방향). 틱마다 한 번 부른다. null = 손 뗌. */
  setInputReader(fn: (() => unknown) | null): void;
  /** 한마디(PHRASES 번호). 1.5초에 한 번. 보냈으면 true. */
  say(k: number): boolean;
  /** 지금 그릴 것(직전·현재 틱을 섞은 상태 + 말풍선). 경기가 없으면 null. */
  frame(now?: number): DrawFrame | null;
  /** 방을 닫는다 — bye 를 보내고 길을 닫는다. 그 뒤로는 아무것도 안 한다. */
  leave(): void;

  /** 지금 게임의 설정 고치기(로비에서만) — 그 게임의 applySettings 가 범위를 자른다. */
  setSettings(patch: Record<string, unknown>): void;
  /** 게임 종류 바꾸기(로비에서만). 지금 게임의 설정은 방에 남고(saved), 그 게임의 지난 설정을 꺼낸다. 모르는 id 는 무시. */
  setGame(id: string): void;
  move(clientId: string, team: Team): void;
  autoBalance(): void;
  /** 봇 자리 고르기(로비에서만) — side 편 slot 번째 봇을 num 선수로, null 이면 무작위로. 사용자: "그리고 봇도 선수를 고를 수 있게 해줘". */
  setBotPick(side: 0 | 1, slot: number, num: number | null): void;
  /** 시작할 수 없는 이유(없으면 null). [시작] 을 미리 막는 데 쓴다. */
  startBlock(): string | null;
  start(): boolean;
  /** ✕ — 경기를 끊고 모두 방으로. */
  stop(): void;
  /** 결과 화면에서 [바로 방으로]. */
  toLobby(): void;
  /** 띄운 안내를 지운다. */
  clearNotice(): void;

  getState(): unknown;
  getConfig(): unknown;
  getRoom(): RoomState | null;
  getNet(): NetInfo;
  /** 경기 자리마다 누가 조종하나(디버그·테스트). bot = 봇이거나 그 손님이 4초 넘게 조용해 봇이 맡는 중. */
  getSlots(): { clientId: string | null; bot: boolean }[];
  /** 디버그 전용(?debug=1 의 goalChance 등, 2026-11-07 4단계) — 지금 판의 상태를 한 번 바꾼다. 다음 스냅샷이 손님에게 그대로 간다. */
  debugPatch(fn: (s: unknown) => unknown): void;
};

type Match = {
  game: string; adapter: AnyAdapter; smooth: Smoother<unknown>;
  /** 빈 사람 자리 정책(등록부 absent, 없으면 'bot'). */
  absent: 'bot' | 'idle';
  config: unknown; seed: number; slots: (string | null)[];
  state: unknown; prev: unknown; qs: number[];
  acc: number; endedAt: number | null; lastPausedSnap: number;
};

/** 시작을 막는 이유(화면 문구) — buildConfig 가 RangeError 를 내기 전에 [시작] 을 막고 이유를 보여 준다. 막는 규칙은 게임마다(등록부 startBlock). */
export function startBlockOf(entry: GameEntry | undefined, room: RoomState, roster: Player[]): string | null {
  if (!entry) return '알 수 없는 게임입니다';
  return entry.startBlock ? entry.startBlock(room, roster) : null;
}

export function createHostSession(o: HostOptions): HostSession {
  const t = o.transport, rnd = o.rnd ?? Math.random;
  const me = o.me, games = o.games;
  const first = games(o.game);
  if (!first) throw new RangeError(`등록되지 않은 게임: ${o.game}`);
  let room: RoomState = createRoom(o.code, me, o.game, o.settings !== undefined && first.okSettings(o.settings) ? o.settings : first.defaultSettings);
  let match: Match | null = null;
  let hidden = false, closed = false;
  let reader: (() => unknown) | null = null;
  let lastAt = o.now();
  let lastRoomSent = -Infinity, lastSilence = -Infinity, lastSay = -Infinity;
  /** 가려지기 시작한 때. 3분이 넘으면 경기를 접고 주기 방송을 멈춘다(dormant) — 돌아오면 다시. */
  let hiddenSince: number | null = null, dormant = false;
  const sid = o.sid ?? `${Math.floor(rnd() * 0x100000000).toString(36)}${Math.floor(rnd() * 0x100000000).toString(36)}`;
  const inRoster = new Set(o.roster.map((p) => p.num));
  const allNums = o.roster.map((p) => p.num);
  const lastHelloAt = new Map<string, number>();
  let bubbles: Bubble[] = [];
  /** 손님별 마지막으로 들은 때·받은 입력·입력 번호. 침묵 판정과 "그 자리를 봇이 맡나"가 이 값의 함수다(상태 기계를 따로 두지 않는다). */
  const lastSeen = new Map<string, number>();
  const lastQ = new Map<string, number>();
  const lastSeq = new Map<string, number>();
  let conn: SessionView['conn'] = 'connecting';
  let lastProbe = -Infinity, liveSet = false;   // 길 떠보기·경기 중 박동(리뷰 #3)
  let matchKey = 0;

  const store = createStore<SessionView>({
    role: 'host', code: o.code, clientId: me.clientId, room, conn, stage: 'lobby', matchKey, game: null, config: null, myId: null,
    paused: false, hostLost: false, hostSlow: false, result: null, notice: null, endedWhy: null, joinSlow: false,
  });

  const send = (m: NetMsg): void => { if (!closed) t.send(m); };
  const rosterNums = o.roster.map((p) => p.num).slice(0, 200);
  const sendRoom = (now: number): void => { lastRoomSent = now; send({ t: 'room', from: me.clientId, sid, room, roster: rosterNums }); };
  const setRoom = (r: RoomState, now: number): void => {
    if (r === room) return;
    room = r;
    store.set({ room });
    sendRoom(now);
  };
  const mySlot = (): number | null => { if (!match) return null; const i = match.slots.indexOf(me.clientId); return i < 0 ? null : i; };
  const alive = (cid: string, now: number): boolean => { const s = lastSeen.get(cid); return s !== undefined && now - s <= SILENCE_MS; };
  const sendSnap = (m: Match, paused: boolean): void => {
    // 줄여 보내는 게임(어댑터 pack — 3D 경기)은 줄인 모양으로. 손님이 readSnap 으로 되돌린다.
    const state = m.adapter.pack ? m.adapter.pack(m.state) : m.state;
    send({ t: 'snap', from: me.clientId, seed: m.seed, tick: m.adapter.tick(m.state), state, inputs: m.qs, paused });
  };
  const sendStart = (m: Match): void => send({ t: 'start', from: me.clientId, game: m.game, config: m.config, seed: m.seed });
  const entryOf = (): GameEntry | undefined => games(room.game);
  /** 손님이 방에서 빠질 때 — 손님별 기록도 같이 지운다(오래 열린 방에서 맵이 자라지 않게). */
  const leave = (r: RoomState, cid: string): RoomState => {
    lastSeen.delete(cid); lastQ.delete(cid); lastSeq.delete(cid); lastHelloAt.delete(cid);
    return leaveRoom(r, cid);
  };
  const quietFor = (cid: string, now: number): number => now - (lastSeen.get(cid) ?? -Infinity);

  t.onStatus((s) => {
    conn = s;
    store.set({ conn: s });
    // 다시 붙으면 방 상태를 바로 한 번 — 끊긴 동안 손님 쪽 기록이 낡았을 수 있다.
    if (s === 'open' && !closed) sendRoom(o.now());
  });

  t.onMessage((raw) => {
    if (closed) return;
    const m = parseMsg(raw, games);
    if (!m) return;
    const now = o.now();
    // 방장에게 오는 것만. 내가 보낸 것(self:false 라 안 오지만 한 번 더)과 남에게 가는 것은 무시.
    if ('from' in m && m.from === me.clientId) return;
    switch (m.t) {
      case 'hello': {
        // 같은 clientId 의 hello 가 900ms 안에 또 오면 답하지 않는다(답 하나가 room·start·snap 세 건이다). 살아 있다는 건 받아 둔다.
        if (now - (lastHelloAt.get(m.from) ?? -Infinity) < HELLO_DEDUPE_MS) { if (lastSeen.has(m.from)) lastSeen.set(m.from, now); return; }
        lastHelloAt.set(m.from, now);
        if (!inRoster.has(m.num)) return;   // 명단에 없는 선수 — 거절 사유를 지어내지 않고 무시
        const r = join(room, { clientId: m.from, num: m.num, name: m.name });
        if (!r.ok) { send({ t: 'deny', from: me.clientId, to: m.from, reason: r.reason }); return; }
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
        if (room.phase !== 'lobby' || !inRoster.has(m.num)) return;
        const r = pick(room, m.from, m.num, m.name);
        const mine = room.members.find((x) => x.clientId === m.from);
        if (r === room && mine && mine.num !== m.num) { send({ t: 'deny', from: me.clientId, to: m.from, reason: 'taken' }); sendRoom(now); return; }
        setRoom(r, now);
        return;
      }
      case 'in': {
        if (!room.members.some((x) => x.clientId === m.from)) return;
        const g = match?.adapter ?? entryOf()?.adapter;
        if (!g || !acceptIn(g, m)) return;   // 이 게임의 입력이 아니다(범위 밖)
        lastSeen.set(m.from, now);
        if (m.seq <= (lastSeq.get(m.from) ?? -1)) return;   // 늦게 온 옛 입력
        lastSeq.set(m.from, m.seq);
        lastQ.set(m.from, m.i);
        return;
      }
      case 'ping': {
        if (!room.members.some((x) => x.clientId === m.from)) return;
        lastSeen.set(m.from, now);
        if (!dormant) send({ t: 'pong', from: me.clientId, to: m.from, at: m.at });   // 잠든 방장은 답하지 않는다 — 남은 손님이 30초 뒤 스스로 나가게
        return;
      }
      case 'say': {
        if (!room.members.some((x) => x.clientId === m.from)) return;
        lastSeen.set(m.from, now);
        if (match && sayIsValid(room, match.adapter, match.config, m)) bubbles = pushBubble(bubbles, m.id, m.k, now);
        return;
      }
      case 'bye': {
        // 로비면 명단에서 뺀다. 경기 중이면 그 자리를 봇이 맡는다(들은 때를 지우면 alive 가 거짓) — 명단 정리는 방으로 돌아갈 때.
        if (!match) setRoom(leave(room, m.from), now);
        else lastSeen.delete(m.from);
        return;
      }
      default: return;   // room·start·snap·stop·deny·pong 은 방장이 보내는 것 — 누가 흉내 내도 무시
    }
  });

  /** 한 틱. 자리마다 q 를 정하고(내 것·봇·손님), 그 q 를 풀어 step 에 넣는다 — 스냅샷에 싣는 것도 같은 q. */
  const tick = (m: Match, now: number): void => {
    const g = m.adapter, s = m.state, me_ = mySlot(), idleQ = g.encode(g.idle);
    const qs = Array.from({ length: g.slots(m.config) }, (_, i) => {
      if (i === me_) return g.encode(reader ? reader() : g.idle);
      const cid = m.slots[i];
      if (cid === null) return g.encode(g.botInput ? g.botInput(s, m.config, i) : g.idle);   // 봇 자리
      if (!alive(cid, now)) {
        // 조용해졌거나 나간 손님 자리 — 게임 정책대로(리뷰 #2): 'idle' 이면 대신하지 않고 그 게임의 "빈 자리" 입력, 아니면 봇이 대신
        if (m.absent === 'idle') return g.encode(g.absentInput ?? g.idle);
        return g.encode(g.botInput ? g.botInput(s, m.config, i) : g.idle);
      }
      return lastQ.get(cid) ?? idleQ;
    });
    const next = g.step(s, m.config, qs.map((q) => g.decode(q)));
    m.prev = s; m.state = next; m.qs = qs;
    if (g.phase(next) !== g.phase(s)) sendSnap(m, false);          // 골·끝 같은 단계 전환은 바로
    else if (g.tick(next) % SNAP_EVERY === 0) sendSnap(m, false);
    if (g.ended(next) && m.endedAt === null) {
      m.endedAt = now;
      store.set({ result: next });
    }
  };

  const checkSilence = (now: number): void => {
    lastSilence = now;
    if (match) return;   // 경기 중엔 빼지 않는다 — 자리는 alive() 가 봇에게 넘긴다
    let r = room;
    for (const x of room.members) if (x.clientId !== me.clientId && quietFor(x.clientId, now) > LOBBY_SILENCE_MS) r = leave(r, x.clientId);
    setRoom(r, now);
  };

  const backToLobby = (now: number): void => {
    if (!match) return;
    const seed = match.seed;
    match = null;
    bubbles = [];
    let r = setPhase(room, 'lobby');
    for (const x of r.members) if (x.clientId !== me.clientId && quietFor(x.clientId, now) > LOBBY_SILENCE_MS) r = leave(r, x.clientId);
    setRoom(r, now);
    send({ t: 'stop', from: me.clientId, seed });
    store.set({ stage: 'lobby', game: null, config: null, myId: null, result: null });
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
      // 손님이 모두 3초 넘게 조용하다 — 내 길이 조용히 죽었을 수도 있어 떠본다(5초에 한 번, 리뷰 #3). 경기 중엔 박동도 자주.
      const guestsIn = room.members.filter((x) => x.clientId !== me.clientId);
      if (conn === 'open' && guestsIn.length > 0 && guestsIn.every((x) => quietFor(x.clientId, now) > HOST_SLOW_MS) && now - lastProbe >= PROBE_EVERY_MS) {
        lastProbe = now; t.probe?.();
      }
      if ((match !== null) !== liveSet) { liveSet = match !== null; t.setLive?.(liveSet); }
      // 오래 가려진 탭(잊힌 탭) — 경기를 접고 주기 방송을 멈춘다. hello 에는 그래도 답한다.
      if (hidden && hiddenSince !== null && !dormant && now - hiddenSince >= GIVE_UP_MS) { backToLobby(now); dormant = true; }
      // 주기 방 상태: 혼자면 안 보낸다(들어오는 사람의 hello 엔 답이 간다), 가려진 동안은 5초마다, 잠들면 멈춘다.
      // 사람이 6명 이상이면 2초마다 — 사람이 많은 방일수록 다른 메시지(입력·ping)도 많다(스펙 2026-11-07 §4).
      const every = hidden ? HIDDEN_ROOM_EVERY_MS : room.members.length >= CROWD_MEMBERS ? CROWD_ROOM_EVERY_MS : ROOM_EVERY_MS;
      if (!dormant && room.members.length > 1 && now - lastRoomSent >= every - SLACK_MS) sendRoom(now);
      const m = match;
      if (!m) return;
      if (m.endedAt !== null) { if (now - m.endedAt >= RESULT_MS) backToLobby(now); return; }
      if (hidden) {
        if (!dormant && now - m.lastPausedSnap >= PAUSED_SNAP_MS - SLACK_MS) { m.lastPausedSnap = now; sendSnap(m, true); }
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
      hiddenSince = h ? now : null;
      if (!h) { dormant = false; for (const k of lastSeen.keys()) lastSeen.set(k, now); }
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
      return { state: m.smooth.lerp(m.prev, m.state, a), config: m.config, myId: mySlot(), bubbles: liveBubbles(bubbles, now) };
    },

    leave() {
      if (closed) return;
      send({ t: 'bye', from: me.clientId });
      closed = true;
      match = null;
      t.close();
      store.set({ stage: 'ended', endedWhy: null, conn: 'closed' });
    },

    setSettings(patch) {
      const e = entryOf();
      if (!match && room.phase === 'lobby' && e) setRoom(withSettings(room, e.applySettings(room.settings, patch)), o.now());
    },
    setGame(id) {
      const e = games(id);
      if (!match && room.phase === 'lobby' && e) setRoom(setGame(room, id, e.defaultSettings), o.now());
    },
    move(cid, team) { if (!match && room.phase === 'lobby') setRoom(move(room, cid, team), o.now()); },
    autoBalance() { if (!match && room.phase === 'lobby') setRoom(autoBalance(room, o.roster), o.now()); },
    setBotPick(side, slot, num) { if (!match && room.phase === 'lobby') setRoom(setBotPick(room, side, slot, num, allNums), o.now()); },
    startBlock() { return startBlockOf(entryOf(), room, o.roster); },

    start() {
      if (closed || match || room.phase !== 'lobby') return false;
      const entry = entryOf();
      const why = startBlockOf(entry, room, o.roster);
      if (why || !entry) { store.set({ notice: why }); return false; }
      let built: { config: unknown; slots: (string | null)[] };
      try { built = entry.buildConfig(room, o.roster, rnd); }
      catch (e) {
        if (e instanceof RangeError) { store.set({ notice: '명단이 모자라 봇을 채울 수 없습니다' }); return false; }
        throw e;
      }
      const now = o.now();
      const seed = Math.floor(rnd() * 0x100000000) >>> 0;
      const g = entry.adapter;
      const state = g.create(built.config, seed);
      match = {
        game: room.game, adapter: g, smooth: smootherFor(g.bodies), absent: entry.absent ?? 'bot',
        config: built.config, seed, slots: built.slots, state, prev: state, qs: Array.from({ length: g.slots(built.config) }, () => g.encode(g.idle)),
        acc: 0, endedAt: null, lastPausedSnap: -Infinity,
      };
      lastQ.clear();
      bubbles = [];
      lastAt = now;
      matchKey += 1;
      setRoom(setPhase(room, 'match'), now);
      sendStart(match);
      sendSnap(match, hidden);
      store.set({ stage: 'match', matchKey, game: match.game, config: built.config, myId: mySlot(), result: null, notice: null });
      return true;
    },
    stop() { backToLobby(o.now()); },
    toLobby() { backToLobby(o.now()); },
    clearNotice() { store.set({ notice: null }); },

    getState: () => match?.state ?? null,
    getConfig: () => match?.config ?? null,
    getRoom: () => room,
    getNet: () => ({ status: conn, rttMs: null, lead: null, myId: mySlot() }),
    debugPatch(fn) {
      if (!match) return;
      const next = fn(match.state);
      if (!match.adapter.okState(next, match.config)) return;   // 모양이 틀린 상태로 판을 깨지 않게
      match.state = next; match.prev = next;
      sendSnap(match, hidden);
    },
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
