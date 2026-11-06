// 손님 입력 양동이(2026-11-07 리뷰 #1) — 급한 입력(킥·액션 키)도 표를 쓰고, 8명 판의 전체 메시지가 초당 70 을 넘지 않는다.
// 리뷰의 rate.mjs 네 줄(2D 킥 초당 3번 · 2D 킥 연타 · 3D 보통 · 3D 바쁨)을 루프백에서 그대로 돌린다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHostSession, createGuestSession, STEP_MS } from '../../src/react/game/net/session.ts';
import { IN_BURST, fullBucket, inRate, takeToken } from '../../src/react/game/net/common.ts';
import { createLoopbackHub } from '../../src/react/game/net/transport.ts';
import { gameOf } from '../../src/lib/games/registry.ts';

test('양동이 — 4개까지 모이고, 초당 min(20, 52/손님) 개 찬다, 시계가 뒤로 가도 안 찬다', () => {
  assert.equal(inRate(8), 52 / 7); assert.equal(inRate(2), 20); assert.equal(inRate(1), 20); assert.equal(inRate(0), 20);
  let b = fullBucket(0), ok = 0;
  for (let i = 0; i < 10; i++) { const r = takeToken(b, 0, 8); b = r.b; if (r.ok) ok++; }
  assert.equal(ok, IN_BURST, '한꺼번엔 4개');
  let r = takeToken(b, 100, 8); assert.equal(r.ok, false, '0.1초에 0.8개');
  r = takeToken(r.b, 125, 8); assert.equal(r.ok, true, '0.125초면 1개');
  r = takeToken(r.b, 50, 8); assert.equal(r.ok, false, '시계가 뒤로');
  r = takeToken(fullBucket(0), 1e9, 8); assert.ok(r.b.tokens <= IN_BURST - 1 + 1e-9, '오래 쉬어도 4개까지');
});

const roster = Array.from({ length: 20 }, (_, i) => ({ num: 100 + i, jersey: i + 1, name: `선수${i}`, pace: 60, dribble: 60, pass: 60, shoot: 60, defend: 60, stamina: 60, avatar: '' }));
const who = (i) => ({ clientId: `c${i}`, num: 100 + i, name: `선수${i}` });
// 스틱은 계속 돈다(삼각함수는 테스트의 입력 만들기에만).
const CASES = [
  ['match2d', '킥 초당 3번', (t, i) => ({ x: Math.cos(t / 20 + i), y: Math.sin(t / 20 + i), kick: Math.floor((t + i * 7) / 10) % 2 === 0 })],
  ['match2d', '킥 연타(4틱마다)', (t, i) => ({ x: Math.cos(t / 20 + i), y: Math.sin(t / 20 + i), kick: Math.floor((t + i) / 4) % 2 === 0 })],
  ['match3d', '슛 1.5·패스 1/초', (t, i) => ({ x: Math.cos(t / 20 + i), y: Math.sin(t / 20 + i), shoot: Math.floor(t / 20) % 2 === 0, pass: Math.floor(t / 30) % 2 === 0, sprint: Math.floor(t / 120) % 2 === 0, through: false, lob: false })],
  ['match3d', '슛 3·패스 2.3/초', (t, i) => ({ x: Math.cos(t / 20 + i), y: Math.sin(t / 20 + i), shoot: Math.floor(t / 10) % 2 === 0, pass: Math.floor(t / 13) % 2 === 0, sprint: Math.floor(t / 40) % 2 === 0, through: false, lob: false })],
];
export function measure(game, mk) {
  const clock = { t: 1000 }; const now = () => clock.t;
  const hub = createLoopbackHub({ delayMs: 40, now });
  let r = 0.37; const rnd = () => (r = (r * 9301 + 49297) % 233280 / 233280);
  const eps = []; const ep = () => { const e = hub.endpoint(); eps.push(e); return e; };
  const host = createHostSession({ transport: ep(), roster, me: who(0), code: 'ABCD', now, rnd, games: gameOf, game });
  const guests = [1, 2, 3, 4, 5, 6, 7].map((i) => createGuestSession({ transport: ep(), roster, me: who(i), code: 'ABCD', now, games: gameOf }));
  let tick = 0;
  const run = (ms) => { const end = clock.t + ms; while (clock.t < end) { clock.t += STEP_MS; tick++; hub.pump(clock.t); host.advance(); for (const g of guests) g.advance(); } };
  run(2000);
  if (game === 'match3d') host.setSettings({ outfield: 4 });
  [0, 1, 2, 3, 4, 5, 6, 7].forEach((i) => host.move(`c${i}`, i % 2));
  run(500);
  assert.ok(host.start());
  run(1000);
  guests.forEach((g, i) => g.setInputReader(() => mk(tick, i)));
  host.setInputReader(() => mk(tick, 9));
  const b = eps.map((e) => ({ ...e.sentByType })); const t0 = clock.t;
  run(10000);
  const secs = (clock.t - t0) / 1000;
  const tot = {}; eps.forEach((e, k) => { for (const [ty, n] of Object.entries(e.sentByType)) tot[ty] = (tot[ty] ?? 0) + (n - (b[k][ty] ?? 0)); });
  const all = Object.values(tot).reduce((a, x) => a + x, 0);
  return { total: all / secs, in: (tot.in ?? 0) / secs, humans: guests.filter((g) => g.getView().myId !== null).length + 1 };
}
for (const [game, label, mk] of CASES) {
  test(`8명 ${game} ${label} — 전체 메시지 초당 70 이하`, () => {
    const m = measure(game, mk);
    assert.equal(m.humans, 8);
    assert.ok(m.total <= 70, `${m.total.toFixed(1)}건/초 (in ${m.in.toFixed(1)})`);
    assert.ok(m.in > 30, '입력이 막히지는 않는다');
  });
}
