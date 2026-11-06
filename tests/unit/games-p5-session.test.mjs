// 5단계 게임(3D 승부차기·3D 자유 훈련장)을 진짜 등록부로 공용 세션(방장·손님, 지연 30ms 루프백)에서(2026-11-07).
// 손님의 키커(옆·높이 조준)·키퍼(옆걸음·높이 던지기) 입력이 방장 계산에 닿는지, 스냅샷(pack)이 손님에게 풀려 닿는지, 판이 끝나면 방으로,
// 훈련장의 손님 이동·방장 공 모으기·골이 손님 스냅샷에 닿는지, 메시지 수·크기.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHostSession, createGuestSession, STEP_MS } from '../../src/react/game/net/session.ts';
import { createLoopbackHub } from '../../src/react/game/net/transport.ts';
import { gameOf } from '../../src/lib/games/registry.ts';
import { PITCH3D } from '../../src/lib/game3d/sim.ts';

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

test('3D 승부차기 — 손님 키커의 옆·높이 조준이 방장 계산에, 손님 키퍼의 옆걸음·높이 던지기가 방장 상태에, 끝나면 방으로', () => {
  const w = world('penalty3d');
  w.run(1500);
  w.host.setSettings({ kicks: 3, first: 1 });
  w.host.move('c0', 0); w.host.move('c1', 1);
  w.run(300);
  assert.ok(w.host.start());
  w.run(300);
  assert.equal(w.guest.getView().game, 'penalty3d');
  const me = w.guest.getView().myId;
  // 1) 손님 = 키커 — 0.5초 모아 왼쪽(−y) 위로
  w.guest.setInputReader(() => {
    const s = w.guest.getState();
    if (!s || s.phase !== 'aim' || s.kicker !== me || s.phaseTicks < 10) return { x: 0, y: 0, kick: false, aim: null };
    if (s.phaseTicks < 40) return { x: 0, y: 0, kick: true, aim: null };
    return { x: 0, y: 0, kick: false, aim: { y: -1.8, z: 1.4 } };
  });
  assert.ok(w.run(8000, () => w.host.getState().phase === 'flight'));
  const hs = w.host.getState();
  assert.equal(hs.kicker, me);
  assert.ok(hs.ball.vy < -1 && hs.ball.vz > 1, `왼쪽 위 ${hs.ball.vy} ${hs.ball.vz}`);
  assert.ok(hs.power > 0.3 && hs.power < 0.6);
  assert.ok(w.run(3000, () => w.host.getState().phase === 'result'));
  w.run(200);
  assert.equal(w.guest.getBase().log.length, 1, '판정이 손님 스냅샷에');
  // 2) 손님 = 키퍼 — 옆걸음(+y) 그리고 공이 나가면 오른쪽 높이 던지기
  w.guest.setInputReader(() => {
    const s = w.guest.getState();
    if (!s || s.keeper !== me) return { x: 0, y: 0, kick: false, aim: null };
    if (s.phase === 'aim') return { x: 1, y: 0, kick: false, aim: null };
    if (s.phase === 'flight') return { x: 1, y: 1, kick: true, aim: null };
    return { x: 0, y: 0, kick: false, aim: null };
  });
  assert.ok(w.run(6000, () => w.host.getState().phase === 'aim' && w.host.getState().keeper === me && w.host.getState().phaseTicks > 40));
  assert.ok(w.host.getState().gk.y > 0.5, `옆걸음 ${w.host.getState().gk.y}`);
  assert.ok(w.run(8000, () => w.host.getState().gk.dived));
  assert.equal(w.host.getState().gk.dive, 1);
  assert.equal(w.host.getState().gk.diveH, 2);
  // 끝까지 — 둘 다 봇과 같은 입력으로(가만히 두면 약한 가운데 슛을 가운데 선 키퍼가 계속 막아 서든데스가 길어진다 — 2D 와 같다) 결과 → 방
  const g3 = gameOf('penalty3d').adapter;
  const myHost = w.host.getView().myId;
  w.guest.setInputReader(() => { const s = w.guest.getState(); return s ? g3.botInput(s, w.guest.getConfig(), me) : g3.idle; });
  w.host.setInputReader(() => g3.botInput(w.host.getState(), w.host.getConfig(), myHost));
  assert.ok(w.run(120000, () => !!w.guest.getView().result));
  assert.equal(w.guest.getView().result.winner, w.host.getState().winner);
  assert.ok(w.run(8000, () => w.guest.getView().stage === 'lobby' && w.host.getView().stage === 'lobby'));
  assert.ok(w.snaps.length > 50 && Math.max(...w.snaps) < 3000, `스냅샷 최대 ${Math.max(...w.snaps)}B`);
});

test('3D 자유 훈련장 — 편 없는 방, 손님 이동이 방장에, 방장 공 모으기·골이 손님 스냅샷에, ✕ 로 방, 메시지 수', () => {
  const w = world('match3d');
  w.run(1500);
  w.host.setGame('free3d');
  w.run(300);
  assert.equal(w.guest.getRoom().game, 'free3d');
  assert.ok(w.host.start());
  w.run(300);
  const cfg = w.host.getConfig();
  assert.equal(cfg.balls, 4, '사람 둘 + 2');
  const me = w.guest.getView().myId;
  assert.equal(cfg.players[me].num, 101);
  const x0 = w.host.getState().players[me].x;
  w.guest.setInputReader(() => ({ x: 1, y: 0, shoot: false, pass: false }));
  const h0 = w.hostEp.sent, g0 = w.guestEp.sent;
  w.run(1500);
  assert.ok(w.host.getState().players[me].x - x0 > 4, '손님 이동');
  // 방장 공 모으기
  w.host.setInputReader(() => ({ x: 0, y: 0, shoot: false, pass: false, gather: true }));
  w.run(50);
  w.host.setInputReader(null);
  w.run(300);
  // 골 — 방장 디버그로 골 앞에 공을 굴린다
  w.host.debugPatch((s) => ({ ...s, balls: s.balls.map((b, j) => (j === 0 ? { ...b, x: PITCH3D.HW - 0.3, y: 0, z: 0.5, vx: 9, owner: null } : b)) }));
  w.run(500);
  assert.ok(w.host.getState().goals >= 1);
  assert.equal(w.guest.getBase().goals, w.host.getState().goals);
  const hostRate = (w.hostEp.sent - h0) / 2.35, guestRate = (w.guestEp.sent - g0) / 2.35;
  assert.ok(hostRate <= 14 && guestRate <= 6, `방장 ${hostRate.toFixed(1)}/s 손님 ${guestRate.toFixed(1)}/s`);
  w.host.stop();
  w.run(500);
  assert.equal(w.guest.getView().stage, 'lobby');
  assert.ok(Math.max(...w.snaps) < 3000, `스냅샷 최대 ${Math.max(...w.snaps)}B`);
});
