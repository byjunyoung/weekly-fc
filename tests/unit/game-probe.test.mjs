// 조용히 죽은 소켓(2026-11-07 리뷰 #3) — 닫힘 알림 없이 배달만 멈춘 소켓에서 손님이 "방장과 연결이 끊겼습니다"로 나가지 않고
// 떠보기(probe) → 다시 붙기 → 경기를 이어 간다. 정말로 사라진 방장은 예전 한도에 끝낸다.
// 가짜 서버: Phoenix 채널 약속(입장 답·박동 답·방송 배달)만 흉내 낸다. 시계는 node:test 의 가짜 타이머 + 세션의 now 를 같이 민다.
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRealtimeTransport, PROBE_MS } from '../../src/react/game/net/realtime.ts';
import { createHostSession, createGuestSession, STEP_MS, HOST_SILENCE_MATCH_MS } from '../../src/react/game/net/session.ts';
import { gameOf } from '../../src/lib/games/registry.ts';

function server() {
  const socks = [], gone = new Set();
  /** who 마다 따로인 소켓 종류 — gone 에 든 사람의 소켓은 새로 만들어도 처음부터 죽어 있다(정말로 사라진 탭). */
  const wsFor = (whoName) => class FakeWS {
    constructor() { this.who = whoName; this.readyState = 0; this.dead = gone.has(whoName); this.topic = null; socks.push(this); setTimeout(() => { this.readyState = 1; this.onopen?.(); }, 0); }
    send(s) {
      if (this.dead) return;
      const f = JSON.parse(s);
      if (f.event === 'phx_join') { this.topic = f.topic; this.deliver({ topic: f.topic, event: 'phx_reply', ref: f.ref, payload: { status: 'ok' } }); }
      else if (f.event === 'heartbeat') this.deliver({ topic: 'phoenix', event: 'phx_reply', ref: f.ref, payload: { status: 'ok' } });
      else if (f.event === 'broadcast') for (const o of socks) if (o !== this && o.topic === f.topic && o.readyState === 1) o.deliver({ topic: f.topic, event: 'broadcast', payload: f.payload });
    }
    deliver(f) { setTimeout(() => { if (!this.dead && this.readyState === 1) this.onmessage?.({ data: JSON.stringify(f) }); }, 20); }
    close() { this.readyState = 3; this.onclose?.(); }
  };
  return { socks, gone, wsFor };
}
const roster = Array.from({ length: 8 }, (_, i) => ({ num: 100 + i, jersey: i + 1, name: `선수${i}`, pace: 60, dribble: 60, pass: 60, shoot: 60, defend: 60, stamina: 60, avatar: '' }));
const who = (i) => ({ clientId: `c${i}`, num: 100 + i, name: `선수${i}` });

function world(t) {
  const srv = server();
  const clock = { t: 0 };
  const now = () => clock.t;
  const opts = (n) => ({ url: 'https://x.supabase.co', key: 'k', WebSocketImpl: srv.wsFor(n) });
  const host = createHostSession({ transport: createRealtimeTransport('ABCD', opts('host')), roster, me: who(0), code: 'ABCD', now, games: gameOf, game: 'match2d' });
  const gtr = createRealtimeTransport('ABCD', opts('guest'));
  const guest = createGuestSession({ transport: gtr, roster, me: who(1), code: 'ABCD', now, games: gameOf });
  let hostAlive = true;
  const run = (ms) => { const end = clock.t + ms; while (clock.t < end) { clock.t += STEP_MS; t.mock.timers.tick(STEP_MS); if (hostAlive) host.advance(); guest.advance(); } };
  return { srv, host, guest, run, clock, killHost: () => { hostAlive = false; srv.gone.add('host'); for (const k of srv.socks) if (k.who === 'host') k.dead = true; } };
}

test('손님 소켓이 조용히 죽어도(닫힘 없음) 떠보고 다시 붙어 경기를 이어 간다', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const w = world(t);
  w.run(2000);
  assert.equal(w.guest.getView().stage, 'lobby');
  w.host.move('c0', 0); w.host.move('c1', 1); w.host.setSettings({ minutes: 3 });
  w.run(500);
  assert.ok(w.host.start());
  w.run(1500);
  assert.equal(w.guest.getView().stage, 'match');
  const gsock = w.srv.socks.find((k) => k.who === 'guest' && k.readyState === 1);
  const before = w.srv.socks.length;
  gsock.dead = true;   // 배달만 멈춘다 — readyState 는 1 그대로
  w.run(3000 + PROBE_MS + 2500);
  assert.ok(w.srv.socks.length > before, '새 소켓으로 다시 붙었다');
  const t0 = w.guest.getBase().tick;
  w.run(5000);
  assert.equal(w.guest.getView().stage, 'match', '나가지 않았다');
  assert.ok(w.guest.getBase().tick > t0 + 200, '스냅샷을 다시 받는다');
  w.run(HOST_SILENCE_MATCH_MS + 5000);
  assert.equal(w.guest.getView().stage, 'match');
  t.mock.timers.reset();
});

test('정말로 사라진 방장 — 손님은 떠보고 다시 붙어도 방장이 말이 없으면 예전 한도(경기 중 20초)에 끝낸다', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const w = world(t);
  w.run(2000);
  w.host.move('c0', 0); w.host.move('c1', 1);
  w.run(500);
  assert.ok(w.host.start());
  w.run(1500);
  w.killHost();
  let endedAt = null;
  for (let k = 0; k < 60 && endedAt === null; k++) { w.run(1000); if (w.guest.getView().stage === 'ended') endedAt = w.clock.t; }
  assert.equal(w.guest.getView().endedWhy, '방장과 연결이 끊겼습니다');
  assert.ok(endedAt !== null && endedAt - 4000 < HOST_SILENCE_MATCH_MS + PROBE_MS + 3000, `끝난 때 ${endedAt}`);
  t.mock.timers.reset();
});

test('방장 소켓이 조용히 죽어도 — 손님이 모두 조용해지면 방장이 떠보고 다시 붙어 이어 간다', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const w = world(t);
  w.run(2000);
  w.host.move('c0', 0); w.host.move('c1', 1);
  w.run(500);
  assert.ok(w.host.start());
  w.run(1500);
  w.srv.socks.find((k) => k.who === 'host' && k.readyState === 1).dead = true;
  w.run(15000);
  assert.equal(w.guest.getView().stage, 'match');
  const t0 = w.guest.getBase().tick;
  w.run(3000);
  assert.ok(w.guest.getBase().tick > t0 + 100, '손님이 다시 스냅샷을 받는다');
  t.mock.timers.reset();
});
