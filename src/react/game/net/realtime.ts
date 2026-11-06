// src/react/game/net/realtime.ts — Supabase 실시간 채널(Broadcast) 위의 Transport(2026-11-06).
// 설계: docs/superpowers/specs/2026-11-06-game-online-design.md §1·§2.1
//
// 왜 이 길인가: 기기끼리 직접 붙는 방식(WebRTC)은 폰 통신사 망끼리 중계 서버 없이 자주 실패하고, 중계 서버는 사용자가 뺀 선택지다.
// 포털이 이미 쓰는 Supabase 의 실시간 채널은 가입·표·마이그레이션 없이 익명 키로 바로 된다(실측 2026-11-06: 입장 ok, 한쪽 75ms).
// supabase-js 를 들이지 않고 WebSocket 위에 Phoenix 채널 약속을 직접 말한다 — 쓰는 건 입장·방송·심장 박동 셋뿐이라.
// Presence 는 쓰지 않는다 — 누가 있는지는 우리 메시지(hello·room·bye)와 침묵 시간으로 판단한다(스펙 §2.1).
import { SUPABASE_KEY, SUPABASE_URL } from '../../../lib/backend.ts';
import type { NetMsg } from '../../../lib/game/net.ts';
import type { ConnStatus, Transport } from './transport.ts';

const HEARTBEAT_MS = 25000;
const JOIN_TIMEOUT_MS = 10000;
const BACKOFF_MS = [1000, 2000, 4000, 8000, 10000];
/** 입장 뒤 이만큼 버텨야 재시도 간격을 처음(1초)으로 돌린다 — 입장 직후 끊기기를 반복할 때 1초마다 두드리지 않게(2026-11-07 리뷰). */
const STABLE_MS = 5000;

type Frame = { topic?: unknown; event?: unknown; payload?: unknown; ref?: unknown };

export type RealtimeOptions = {
  url?: string; key?: string;
  /** 테스트·node 에서 바꿔 끼울 WebSocket. 기본 globalThis.WebSocket. */
  WebSocketImpl?: typeof WebSocket;
};

export function realtimeUrl(url = SUPABASE_URL, key = SUPABASE_KEY): string {
  return `${url.replace(/^http/, 'ws')}/realtime/v1/websocket?apikey=${encodeURIComponent(key)}&vsn=1.0.0`;
}

/** 방 하나(game:<코드>)에 붙는 길. 끊기면 늘려 가며 다시 붙고 다시 입장한다. close() 뒤로는 다시 안 붙는다. */
export function createRealtimeTransport(code: string, opts: RealtimeOptions = {}): Transport {
  const WS = opts.WebSocketImpl ?? globalThis.WebSocket;
  const url = realtimeUrl(opts.url, opts.key);
  const topic = `realtime:game:${code}`;
  const msgCbs: ((m: unknown) => void)[] = [];
  const statusCbs: ((s: ConnStatus) => void)[] = [];
  let status: ConnStatus = 'connecting';
  let ws: WebSocket | null = null;
  let ref = 0, joinRef: string | null = null, hbRef: string | null = null;
  let attempt = 0, closedByMe = false;
  let hbTimer: ReturnType<typeof setInterval> | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let joinTimer: ReturnType<typeof setTimeout> | undefined;
  let stableTimer: ReturnType<typeof setTimeout> | undefined;
  /** 열리기 전에 보낸 hello 는 마지막 하나만 들고 있다가 입장하자마자 보낸다 — 들어가는 첫 말이라 놓치면 1초를 더 기다린다.
   *  다른 메시지는 버린다(방 상태·스냅샷·입력은 어차피 곧 다시 보낸다). */
  let pendingHello: NetMsg | null = null;

  const setStatus = (s: ConnStatus): void => {
    if (s === status) return;
    status = s;
    for (const cb of statusCbs) cb(s);
  };
  const raw = (f: Record<string, unknown>): void => {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(f));
  };
  const nextRef = (): string => String(++ref);
  const clearTimers = (): void => {
    if (hbTimer) clearInterval(hbTimer);
    if (joinTimer) clearTimeout(joinTimer);
    if (stableTimer) clearTimeout(stableTimer);
    hbTimer = undefined; joinTimer = undefined; stableTimer = undefined;
  };

  const scheduleRetry = (): void => {
    if (closedByMe || retryTimer) return;
    const wait = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
    attempt++;
    retryTimer = setTimeout(() => { retryTimer = undefined; connect(); }, wait);
  };

  const drop = (next: ConnStatus = 'connecting'): void => {
    // 소켓을 버리고 다시 붙을 준비 — onclose 가 이어서 불러도 한 번만 다시 붙는다.
    clearTimers();
    joinRef = null; hbRef = null;
    const old = ws;
    ws = null;
    if (old) {
      old.onopen = null; old.onmessage = null; old.onclose = null; old.onerror = null;
      try { old.close(); } catch { /* 이미 닫힘 */ }
    }
    if (!closedByMe) { setStatus(next); scheduleRetry(); }
  };

  const join = (): void => {
    joinRef = nextRef();
    raw({ topic, event: 'phx_join', payload: { config: { broadcast: { self: false, ack: false } } }, ref: joinRef, join_ref: joinRef });
    joinTimer = setTimeout(() => drop(), JOIN_TIMEOUT_MS);
  };

  const onFrame = (f: Frame): void => {
    if (f.event === 'phx_reply') {
      const p = f.payload as { status?: unknown } | null;
      if (f.ref === joinRef && f.topic === topic) {
        if (joinTimer) { clearTimeout(joinTimer); joinTimer = undefined; }
        if (p && p.status === 'ok') {
          if (stableTimer) clearTimeout(stableTimer);
          stableTimer = setTimeout(() => { stableTimer = undefined; attempt = 0; }, STABLE_MS);
          setStatus('open');
          if (pendingHello) { const h = pendingHello; pendingHello = null; api.send(h); }
        } else {
          // 입장 거절(키·주제 문제 등) — 숨기지 않고 '끊김'으로 보이게 하고, 늘려 가며 다시 시도한다.
          drop('closed');
        }
        return;
      }
      if (f.ref === hbRef) hbRef = null;   // 심장 박동 답
      return;
    }
    if (f.topic !== topic) return;
    if (f.event === 'phx_error' || f.event === 'phx_close') { drop(); return; }
    if (f.event === 'broadcast') {
      const p = f.payload as { event?: unknown; payload?: unknown } | null;
      if (p && p.event === 'm') for (const cb of msgCbs) cb(p.payload);
    }
    // system·presence_state 등은 쓰지 않는다
  };

  function connect(): void {
    if (closedByMe) return;
    let sock: WebSocket;
    try { sock = new WS(url); }
    catch { setStatus('closed'); scheduleRetry(); return; }
    ws = sock;
    if (status !== 'connecting') setStatus('connecting');
    sock.onopen = () => {
      join();
      hbTimer = setInterval(() => {
        // 지난 박동에 답이 없으면 죽은 연결로 보고 다시 붙는다(모바일이 소켓을 조용히 끊는 경우).
        if (hbRef !== null) { drop(); return; }
        hbRef = nextRef();
        raw({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: hbRef });
      }, HEARTBEAT_MS);
    };
    sock.onmessage = (e: MessageEvent) => {
      let f: Frame;
      try { f = JSON.parse(typeof e.data === 'string' ? e.data : '') as Frame; } catch { return; }
      if (f && typeof f === 'object') onFrame(f);
    };
    sock.onerror = () => { /* onclose 가 뒤따른다 */ };
    sock.onclose = () => { if (ws === sock) drop(); };
  }

  const api: Transport = {
    send(m) {
      if (closedByMe) return;
      if (status !== 'open' || joinRef === null) { if (m.t === 'hello') pendingHello = m; return; }
      raw({ topic, event: 'broadcast', payload: { type: 'broadcast', event: 'm', payload: m }, ref: nextRef(), join_ref: joinRef });
    },
    onMessage(cb) { msgCbs.push(cb); },
    onStatus(cb) { statusCbs.push(cb); cb(status); },
    close() {
      if (closedByMe) return;
      // 떠나기 전 마지막 말(bye)은 send 가 이미 보냈다. 채널에서 나간 뒤 소켓을 닫는다.
      if (ws && ws.readyState === 1 && joinRef) raw({ topic, event: 'phx_leave', payload: {}, ref: nextRef(), join_ref: joinRef });
      closedByMe = true;
      if (retryTimer) { clearTimeout(retryTimer); retryTimer = undefined; }
      clearTimers();
      const old = ws;
      ws = null;
      if (old) {
        old.onopen = null; old.onmessage = null; old.onerror = null; old.onclose = null;
        try { old.close(); } catch { /* 이미 닫힘 */ }
      }
      setStatus('closed');
      msgCbs.length = 0; statusCbs.length = 0;
    },
  };
  connect();
  return api;
}
