// 3단계 게임(프리킥·드리블 훈련장)을 진짜 등록부로 공용 세션(방장·손님, 지연 30ms 루프백)에서 끝까지(2026-11-07).
// 손님 차례의 조준·감기·세기가 방장 계산에 닿는지, 드리블 레인이 따로 도는지, 끝나면 둘 다 방으로 돌아와 게임을 바꿀 수 있는지.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHostSession, createGuestSession, STEP_MS, RESULT_MS } from '../../src/react/game/net/session.ts';
import { createLoopbackHub } from '../../src/react/game/net/transport.ts';
import { gameOf } from '../../src/lib/games/registry.ts';
import { FK_AIM_SCALE } from '../../src/lib/games/freekick2d.ts';
import { dribbleBot } from '../../src/lib/games/dribble2d.ts';

const roster = Array.from({ length: 14 }, (_, i) => ({ num: 100 + i, jersey: i + 1, name: `선수${i}`, pace: 60, dribble: 60, pass: 60, shoot: 60, defend: 60, stamina: 60, avatar: '' }));
const who = (i) => ({ clientId: `c${i}`, num: 100 + i, name: `선수${i}` });
const IDLE = { x: 0, kick: false, aim: null };

function world(game) {
  const clock = { t: 1000 };
  const now = () => clock.t;
  const hub = createLoopbackHub({ delayMs: 30, now });
  let r = 0.37;
  const rnd = () => (r = (r * 9301 + 49297) % 233280 / 233280);
  const host = createHostSession({ transport: hub.endpoint(), roster, me: who(0), code: 'ABCD', now, rnd, games: gameOf, game });
  const guest = createGuestSession({ transport: hub.endpoint(), roster, me: who(1), code: 'ABCD', now, games: gameOf });
  const run = (ms, until) => {
    const end = clock.t + ms;
    while (clock.t < end) { clock.t = Math.min(end, clock.t + STEP_MS); hub.pump(clock.t); host.advance(); guest.advance(); if (until && until()) return true; }
    return false;
  };
  return { host, guest, run };
}

test('프리킥 — 손님 차례에 감아 찬 공이 방장 계산에서 그 조준·감기로 나가고, 끝까지 차례가 돌고, 방으로 돌아와 게임을 바꾼다', () => {
  const w = world('freekick2d');
  w.run(1500);
  assert.equal(w.guest.getRoom().game, 'freekick2d');
  assert.equal(w.host.startBlock(), null);
  assert.ok(w.host.start());
  w.run(300);
  const me = w.guest.getView().myId;
  assert.equal(me, 1);
  // 손님: 자기 차례 조준 단계에서 0.5초 모았다가 오른쪽(+200)으로 오른쪽 감기로 뗀다. 방장은 손 뗌(5초 뒤 자동 슛).
  w.guest.setInputReader(() => {
    const s = w.guest.getState();
    if (!s || s.kicker !== me || s.phase !== 'aim' || s.phaseTicks < 10) return IDLE;
    return s.phaseTicks < 40 ? { x: 0, kick: true, aim: null } : { x: 1, kick: false, aim: 200 / FK_AIM_SCALE };
  });
  assert.ok(w.run(20000, () => { const s = w.host.getState(); return s.kicker === me && s.phase === 'flight'; }), '손님 차례에 공이 안 나갔다');
  const hs = w.host.getState();
  assert.equal(hs.curl, 1); assert.ok(hs.ball.vx > 0); assert.ok(hs.power > 0.3 && hs.power < 0.6);
  assert.ok(w.run(200000, () => !!w.guest.getView().result), '안 끝났다');
  const res = w.guest.getView().result;
  assert.equal(res.log.length, 10);
  assert.deepEqual(res.points, w.host.getView().result.points);
  w.run(RESULT_MS + 500);
  assert.equal(w.guest.getView().stage, 'lobby');
  w.host.setGame('dribble2d');
  w.run(300);
  assert.equal(w.guest.getRoom().game, 'dribble2d');
});

test('드리블 — 3·2·1 동안 손님 입력은 안 듣고, 출발 뒤 손님 레인만 움직이고, 둘 다 도착하면 끝', () => {
  const w = world('dribble2d');
  w.run(1500);
  w.host.setSettings({ course: 3 });
  w.run(200);
  assert.deepEqual(w.guest.getRoom().settings, { course: 3 });
  assert.ok(w.host.start());
  w.run(300);
  const me = w.guest.getView().myId;
  assert.equal(me, 1);
  w.guest.setInputReader(() => ({ x: 1, y: 0, kick: false }));
  w.run(1500);   // 아직 3·2·1
  const s0 = w.host.getState();
  assert.equal(s0.phase, 'count');
  assert.equal(s0.lanes[1].p.x, -540, '출발 전엔 안 움직인다');
  // 출발 뒤 — 손님은 대본 주자로, 방장은 손 뗌 → 손님 레인만 움직인다
  w.guest.setInputReader(() => { const s = w.guest.getState(); return s ? dribbleBot(s, w.guest.getConfig(), me) : { x: 0, y: 0, kick: false }; });
  w.run(4000);
  const s1 = w.host.getState();
  assert.equal(s1.phase, 'run');
  assert.ok(s1.lanes[1].p.x > -400, `손님 레인이 움직였다 ${s1.lanes[1].p.x}`);
  assert.equal(s1.lanes[0].p.x, -540, '방장 레인은 그대로');
  w.host.setInputReader(() => { const s = w.host.getState(); return s ? dribbleBot(s, w.host.getConfig(), 0) : { x: 0, y: 0, kick: false }; });
  assert.ok(w.run(90000, () => !!w.guest.getView().result), '안 끝났다');
  const r = w.guest.getView().result;
  assert.ok(r.lanes.every((l) => l.fin >= 0), '둘 다 도착');
  assert.deepEqual(r.lanes.map((l) => l.fin), w.host.getView().result.lanes.map((l) => l.fin));
});

// ── 리뷰 #2: 기록 게임에서 나간 사람 자리는 봇이 대신하지 않는다(absent 'idle') ──
test('드리블 — 출발 직후 나간 손님 레인은 서 있고 "나감", 방장이 도착하면 바로 끝, 나간 사람은 맨 아래', () => {
  const w = world('dribble2d');
  w.run(1500);
  w.host.setSettings({ course: 3 });
  w.run(200);
  assert.ok(w.host.start());
  w.run(4000);   // 3·2·1 지나 출발
  w.guest.leave();
  w.host.setInputReader(() => { const s = w.host.getState(); return s ? dribbleBot(s, w.host.getConfig(), 0) : { x: 0, y: 0, kick: false }; });
  w.run(5000);
  const mid = w.host.getState();
  assert.equal(mid.lanes[1].gone, true, '나간 레인 표시');
  assert.ok(mid.lanes[1].gate === 0 && Math.abs(mid.lanes[1].p.x + 540) < 30, '나간 레인을 아무도 대신 달리지 않는다');
  assert.ok(w.run(60000, () => !!w.host.getView().result), '안 끝났다');
  const r = w.host.getView().result;
  assert.ok(r.lanes[0].fin >= 0 && r.lanes[1].fin < 0 && r.lanes[1].gone);
  // 첫 도착 뒤 30초를 기다리지 않고 끝 — 나간 레인은 기다리지 않는다
  assert.ok(r.tick - 180 - r.lanes[0].fin < 60, `방장 도착 뒤 곧 끝(${r.tick - 180 - r.lanes[0].fin}틱)`);
});

test('프리킥 — 시작 직후 나간 손님 차례는 바로 넘어가고(점수 없음) 맨 아래, 방은 멈추지 않는다', () => {
  const w = world('freekick2d');
  w.run(1500);
  assert.ok(w.host.start());
  w.run(300);
  w.guest.leave();
  // 방장은 대본 키커
  w.host.setInputReader(() => { const s = w.host.getState(); return s ? gameOf('freekick2d').adapter.botInput(s, w.host.getConfig(), 0) : IDLE; });
  assert.ok(w.run(200000, () => !!w.host.getView().result), '안 끝났다');
  const r = w.host.getView().result;
  const guestKicks = r.log.filter((e) => e.kicker === 1);
  assert.equal(guestKicks.length, 5);
  assert.ok(guestKicks.every((e) => e.out === 'gone'), '나간 사람 차례는 모두 넘김');
  assert.equal(r.points[1], 0);
  // 넘긴 차기는 짧다 — 손님 차례 다섯 번이 합쳐 5초 남짓
  const goneTicks = guestKicks.length * (24 + 30);
  assert.ok(goneTicks < 400);
});
