// 6단계 게임(3D 프리킥·3D 드리블 훈련장)을 진짜 등록부로 공용 세션(방장·손님, 지연 30ms 루프백)에서(2026-11-07).
// 손님 차례의 조준(옆·높이)·감기가 방장 계산에, 끝나면 방으로 / 3·2·1 동안 손님 입력 무시, 손님 레인이 움직임, 둘 다 도착하면 결과 → 방. 메시지 수·크기.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHostSession, createGuestSession, STEP_MS } from '../../src/react/game/net/session.ts';
import { createLoopbackHub } from '../../src/react/game/net/transport.ts';
import { gameOf } from '../../src/lib/games/registry.ts';
import { COUNT_TICKS } from '../../src/lib/games/dribble2d.ts';
import { fkGone, fkRanking } from '../../src/lib/games/freekick2d.ts';
import { dr3Ranking } from '../../src/lib/games/dribble3d.ts';

const roster = Array.from({ length: 14 }, (_, i) => ({ num: 100 + i, jersey: i + 1, name: `선수${i}`, pace: 60, dribble: 60, pass: 60, shoot: 60, defend: 60, stamina: 60, avatar: '' }));
const who = (i) => ({ clientId: `c${i}`, num: 100 + i, name: `선수${i}` });

function world(game) {
  const clock = { t: 1000 };
  const now = () => clock.t;
  const hub = createLoopbackHub({ delayMs: 30, now });
  let r = 0.37;
  const rnd = () => (r = (r * 9301 + 49297) % 233280 / 233280);
  const hostEp = hub.endpoint(), guestEp = hub.endpoint();
  const host = createHostSession({ transport: hostEp, roster, me: who(0), code: 'ABCD', now, rnd, games: gameOf, game });
  const guest = createGuestSession({ transport: guestEp, roster, me: who(1), code: 'ABCD', now, games: gameOf });
  const snaps = [];
  hub.endpoint().onMessage((m) => { if (m.t === 'snap') snaps.push(JSON.stringify(m).length); });
  const run = (ms, until) => {
    const end = clock.t + ms;
    while (clock.t < end) {
      clock.t = Math.min(end, clock.t + STEP_MS); hub.pump(clock.t); host.advance(); guest.advance();
      if (until && until()) return true;
    }
    return false;
  };
  return { host, guest, run, hostEp, guestEp, snaps };
}

test('3D 프리킥 — 편 없는 방, 손님 차례에 모았다 뗀 조준(옆·높이)·감기가 방장 계산에, 끝까지 → 결과 같음 → 방', () => {
  const w = world('freekick3d');
  w.run(1500);
  assert.equal(w.guest.getRoom().game, 'freekick3d');
  assert.ok(w.host.start());
  w.run(300);
  const me = w.guest.getView().myId;
  assert.equal(me, 1);
  const g3 = gameOf('freekick3d').adapter;
  // 손님 차례(차기 1)에 0.5초 모아 왼쪽 위·감기 +1
  w.guest.setInputReader(() => {
    const s = w.guest.getState();
    if (!s || s.kicker !== me || s.phase !== 'aim' || s.phaseTicks < 10) return g3.idle;
    if (s.phaseTicks < 40) return { x: 0, y: 0, kick: true, aim: null };
    return { x: 1, y: 0, kick: false, aim: { y: -1.2, z: 1.5 } };
  });
  w.host.setInputReader(() => g3.botInput(w.host.getState(), w.host.getConfig(), 0));
  assert.ok(w.run(30000, () => w.host.getState().kicker === me && w.host.getState().phase === 'flight'));
  const hs = w.host.getState();
  assert.equal(hs.curl, 1);
  assert.ok(hs.ball.vz > 1 && hs.power > 0.3 && hs.power < 0.6, `vz ${hs.ball.vz} power ${hs.power}`);
  // 끝까지 — 손님도 대본 키커로
  w.guest.setInputReader(() => { const s = w.guest.getState(); return s ? g3.botInput(s, w.guest.getConfig(), me) : g3.idle; });
  assert.ok(w.run(240000, () => !!w.guest.getView().result));
  assert.deepEqual(w.guest.getView().result.points, w.host.getState().points);
  assert.ok(w.run(8000, () => w.guest.getView().stage === 'lobby' && w.host.getView().stage === 'lobby'));
  assert.ok(Math.max(...w.snaps) < 2500, `스냅샷 최대 ${Math.max(...w.snaps)}B`);
});

test('3D 드리블 — 3·2·1 동안 손님 입력은 안 먹고, 그 뒤 손님 레인이 움직인다, 둘 다 도착하면 결과 → 방, 메시지 수', () => {
  const w = world('dribble3d');
  w.run(1500);
  w.host.setSettings({ course: 3 });
  w.run(300);
  assert.deepEqual(w.guest.getRoom().settings, { course: 3 });
  assert.ok(w.host.start());
  w.run(200);
  const me = w.guest.getView().myId;
  const x0 = w.host.getState().lanes[me].p.x;
  w.guest.setInputReader(() => ({ x: 1, y: 0, shoot: false, pass: false }));
  w.run(1500);
  assert.equal(w.host.getState().phase, 'count');
  assert.ok(Math.abs(w.host.getState().lanes[me].p.x - x0) < 1e-9, '3·2·1 동안은 안 움직인다');
  const h0 = w.hostEp.sent, g0 = w.guestEp.sent;
  assert.ok(w.run(3000, () => w.host.getState().phase === 'run' && w.host.getState().lanes[me].p.x - x0 > 2));
  // 둘 다 대본 주자로 끝까지
  const g3 = gameOf('dribble3d').adapter;
  w.guest.setInputReader(() => { const s = w.guest.getState(); return s ? g3.botInput(s, w.guest.getConfig(), me) : g3.idle; });
  w.host.setInputReader(() => g3.botInput(w.host.getState(), w.host.getConfig(), 0));
  assert.ok(w.run(60000, () => !!w.guest.getView().result));
  const fin = w.guest.getView().result.lanes.map((l) => l.fin);
  assert.ok(fin.every((f) => f > 0), `도착 ${fin}`);
  assert.deepEqual(fin, w.host.getState().lanes.map((l) => l.fin));
  assert.ok(w.run(8000, () => w.guest.getView().stage === 'lobby'));
  assert.ok(w.hostEp.sent - h0 > 0 && w.guestEp.sent - g0 > 0);
  assert.ok(Math.max(...w.snaps) < 2500);
});

// ── 리뷰 #2(합치기): 3D 기록 게임도 나간 사람 자리를 봇이 대신하지 않는다(absent 'idle') — 2D 시험과 같은 흐름 ──
test('3D 드리블 — 출발 직후 나간 손님 레인은 서 있고 "나감", 방장이 도착하면 바로 끝, 나간 사람은 1등이 아니다', () => {
  const w = world('dribble3d');
  w.run(1500);
  w.host.setSettings({ course: 3 });
  w.run(200);
  assert.ok(w.host.start());
  w.run(4000);   // 3·2·1 지나 출발
  const x1 = w.host.getState().lanes[1].p.x;
  w.guest.leave();
  const a = gameOf('dribble3d').adapter;
  w.host.setInputReader(() => { const s = w.host.getState(); return s ? a.botInput(s, w.host.getConfig(), 0) : a.idle; });
  w.run(5000);
  const mid = w.host.getState();
  assert.equal(mid.lanes[1].gone, true, '나간 레인 표시');
  assert.ok(mid.lanes[1].gate === 0 && Math.abs(mid.lanes[1].p.x - x1) < 1.5, `나간 레인을 아무도 대신 달리지 않는다(x ${x1} → ${mid.lanes[1].p.x})`);
  assert.ok(w.run(60000, () => !!w.host.getView().result), '안 끝났다');
  const r = w.host.getView().result;
  assert.ok(r.lanes[0].fin >= 0 && r.lanes[1].fin < 0 && r.lanes[1].gone);
  assert.ok(r.tick - COUNT_TICKS - r.lanes[0].fin < 60, `방장 도착 뒤 곧 끝(${r.tick - COUNT_TICKS - r.lanes[0].fin}틱)`);
  assert.deepEqual(dr3Ranking(r), [0, 1], '나간 사람은 맨 아래');
});

test('3D 프리킥 — 시작 직후 나간 손님 차례는 바로 넘어가고(점수 없음) 1등이 아니다, 방은 멈추지 않는다', () => {
  const w = world('freekick3d');
  w.run(1500);
  assert.ok(w.host.start());
  w.run(300);
  w.guest.leave();
  const a = gameOf('freekick3d').adapter;
  w.host.setInputReader(() => { const s = w.host.getState(); return s ? a.botInput(s, w.host.getConfig(), 0) : a.idle; });
  assert.ok(w.run(200000, () => !!w.host.getView().result), '안 끝났다');
  const r = w.host.getView().result;
  const guestKicks = r.log.filter((e) => e.kicker === 1);
  assert.equal(guestKicks.length, 5);
  assert.ok(guestKicks.every((e) => e.out === 'gone'), '나간 사람 차례는 모두 넘김');
  assert.equal(r.points[1], 0);
  assert.equal(fkRanking(r.points, r.log)[0], 0, '나간 사람은 1등이 아니다');
  assert.ok(fkGone(r.log, 1));
});
