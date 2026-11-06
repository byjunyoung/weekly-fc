import test from 'node:test';
import assert from 'node:assert/strict';
import { createRealtimeTransport, realtimeUrl } from '../../src/react/game/net/realtime.ts';
import { correct, decay, noOffsets, withOffsets, lerpState } from '../../src/react/game/net/smooth.ts';

// 가짜 WebSocket — Phoenix 채널 약속(입장·방송·박동)을 Supabase 대신 받아 본다. 실제 채널은 2026-11-06 node 에서 직접 붙여 확인했다(보고 4).
class FakeWS {
  static all = [];
  constructor(url) { this.url = url; this.readyState = 0; this.sent = []; FakeWS.all.push(this); }
  send(s) { this.sent.push(JSON.parse(s)); }
  close() { this.readyState = 3; this.onclose?.(); }
  open() { this.readyState = 1; this.onopen?.(); }
  recv(f) { this.onmessage?.({ data: JSON.stringify(f) }); }
  joinRef() { return this.sent.find((f) => f.event === 'phx_join')?.ref; }
}
const T = 'realtime:game:ABCD';

test('주소는 wss + apikey + vsn=1.0.0', () => {
  assert.equal(realtimeUrl('https://x.supabase.co', 'k y'), 'wss://x.supabase.co/realtime/v1/websocket?apikey=k%20y&vsn=1.0.0');
});

test('입장 답(ok) 뒤에야 open — 그 전에 보낸 건 버리되 마지막 hello 는 들고 있다가 보낸다', () => {
  FakeWS.all = [];
  const tr = createRealtimeTransport('ABCD', { url: 'https://x.supabase.co', key: 'k', WebSocketImpl: FakeWS });
  const st = [];
  tr.onStatus((s) => st.push(s));
  const got = [];
  tr.onMessage((m) => got.push(m));
  const ws = FakeWS.all[0];
  tr.send({ t: 'ping', from: 'a', at: 1 });
  tr.send({ t: 'hello', from: 'a', num: 1, name: 'x' });
  tr.send({ t: 'hello', from: 'a', num: 2, name: 'y' });
  ws.open();
  const join = ws.sent.find((f) => f.event === 'phx_join');
  assert.equal(join.topic, T);
  assert.deepEqual(join.payload, { config: { broadcast: { self: false, ack: false } } });
  assert.equal(ws.sent.filter((f) => f.event === 'broadcast').length, 0);
  ws.recv({ topic: T, event: 'phx_reply', ref: join.ref, payload: { status: 'ok', response: {} } });
  assert.deepEqual(st, ['connecting', 'open']);
  const b = ws.sent.filter((f) => f.event === 'broadcast');
  assert.equal(b.length, 1, 'ping 은 버리고 hello 하나');
  assert.deepEqual(b[0].payload, { type: 'broadcast', event: 'm', payload: { t: 'hello', from: 'a', num: 2, name: 'y' } });
  ws.recv({ topic: T, event: 'broadcast', payload: { type: 'broadcast', event: 'm', payload: { t: 'stop' } } });
  ws.recv({ topic: T, event: 'broadcast', payload: { type: 'broadcast', event: 'other', payload: { t: 'stop' } } });
  ws.recv({ topic: 'realtime:game:ZZZZ', event: 'broadcast', payload: { type: 'broadcast', event: 'm', payload: { t: 'x' } } });
  ws.onmessage?.({ data: 'not json' });
  assert.deepEqual(got, [{ t: 'stop' }]);
  tr.close();
  assert.equal(ws.sent.at(-1).event, 'phx_leave');
  assert.equal(ws.readyState, 3);
  assert.equal(st.at(-1), 'closed');
});

test('끊기면 다시 붙고 다시 입장한다, 입장 거절은 closed 로 보인다, close 뒤로는 안 붙는다', async () => {
  FakeWS.all = [];
  const tr = createRealtimeTransport('ABCD', { url: 'https://x.supabase.co', key: 'k', WebSocketImpl: FakeWS });
  const st = [];
  tr.onStatus((s) => st.push(s));
  const ws = FakeWS.all[0];
  ws.open();
  ws.recv({ topic: T, event: 'phx_reply', ref: ws.joinRef(), payload: { status: 'error', response: { reason: 'x' } } });
  assert.equal(st.at(-1), 'closed');
  await new Promise((r) => setTimeout(r, 1100));   // 첫 재시도 1초
  assert.equal(FakeWS.all.length, 2);
  const ws2 = FakeWS.all[1];
  ws2.open();
  ws2.recv({ topic: T, event: 'phx_reply', ref: ws2.joinRef(), payload: { status: 'ok' } });
  assert.equal(st.at(-1), 'open');
  ws2.close();   // 서버가 끊음
  assert.equal(st.at(-1), 'connecting');
  tr.close();
  await new Promise((r) => setTimeout(r, 1100));
  assert.equal(FakeWS.all.length, 2, 'close 뒤 재접속 없음');
  assert.equal(st.at(-1), 'closed');
});

test('보정: 작은 차이는 그리던 자리를 지키다 0.1초에 걸쳐 따라가고, 큰 차이는 바로 맞춘다', () => {
  const st = (x, bx = 0) => ({ tick: 0, phase: 'play', phaseTicks: 0, score: [0, 0], ticksLeft: 1, ball: { x: bx, y: 0, vx: 0, vy: 0 },
    players: [{ id: 0, x, y: 0, vx: 0, vy: 0, kickCooldown: 0, kicking: false }], kickoffSide: 0, lastTouch: null, lastScorer: null, winner: null, seed: 1 });
  let off = correct(noOffsets(1), st(100), st(110, 500));
  assert.equal(off.x[1], -10, '선수 10 어긋남은 따라간다');
  assert.equal(off.x[0], 0, '공 500 은 바로 맞춘다');
  assert.equal(withOffsets(st(110, 500), off).players[0].x, 100, '그 순간엔 그리던 자리 그대로');
  off = decay(off, 100);
  assert.ok(Math.abs(off.x[1]) < 1, `0.1초 뒤 ${off.x[1]}`);
  assert.equal(lerpState(st(0), st(10), 0.5).players[0].x, 5);
  assert.equal(lerpState(st(0), st(300), 0.5).players[0].x, 300, '순간 이동은 섞지 않는다');
});
