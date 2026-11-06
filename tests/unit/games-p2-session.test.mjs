// 2단계 게임(승부차기·자유 훈련장)을 진짜 등록부로 공용 세션(방장·손님, 지연 30ms 루프백)에서 끝까지(2026-11-07).
// 손님의 키커·키퍼 입력이 방장 계산에 닿는지, 훈련장의 손님 선수가 움직이고 공 모으기가 닿는지, 경기 중 들어온 사람은 구경하다 다음 판에 끼는지,
// 판이 끝나면(또는 ✕) 모두 방으로 돌아와 방장이 다른 게임으로 바꿀 수 있는지.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHostSession, createGuestSession, STEP_MS, RESULT_MS } from '../../src/react/game/net/session.ts';
import { createLoopbackHub } from '../../src/react/game/net/transport.ts';
import { gameOf } from '../../src/lib/games/registry.ts';
import { freeBot } from '../../src/lib/games/free2d.ts';

const roster = Array.from({ length: 14 }, (_, i) => ({ num: 100 + i, jersey: i + 1, name: `선수${i}`, pace: 60, dribble: 60, pass: 60, shoot: 60, defend: 60, stamina: 60, avatar: '' }));
const who = (i) => ({ clientId: `c${i}`, num: 100 + i, name: `선수${i}` });

function world(game) {
  const clock = { t: 1000 };
  const now = () => clock.t;
  const hub = createLoopbackHub({ delayMs: 30, now });
  let r = 0.37;
  const rnd = () => (r = (r * 9301 + 49297) % 233280 / 233280);
  const host = createHostSession({ transport: hub.endpoint(), roster, me: who(0), code: 'ABCD', now, rnd, games: gameOf, game });
  const guests = [createGuestSession({ transport: hub.endpoint(), roster, me: who(1), code: 'ABCD', now, games: gameOf })];
  const run = (ms, until) => {
    const end = clock.t + ms;
    while (clock.t < end) {
      clock.t = Math.min(end, clock.t + STEP_MS); hub.pump(clock.t); host.advance(); for (const g of guests) g.advance();
      if (until && until()) return true;
    }
    return false;
  };
  const addGuest = (i) => { const g = createGuestSession({ transport: hub.endpoint(), roster, me: who(i), code: 'ABCD', now, games: gameOf }); guests.push(g); return g; };
  return { host, guest: guests[0], guests, run, addGuest };
}

test('승부차기 — 손님이 키커로 겨누고 모았다 떼면 방장 계산에서 그 쪽으로 나가고, 키퍼로 옆걸음·몸 던지기가 닿는다', () => {
  const w = world('match2d');
  w.run(1500);
  w.host.setGame('penalty2d');
  w.host.setSettings({ kicks: 3, first: 1 });   // 흰(손님) 먼저
  w.host.move('c0', 0); w.host.move('c1', 1);
  w.run(300);
  assert.equal(w.guest.getRoom().game, 'penalty2d');
  assert.deepEqual(w.guest.getRoom().settings, { kicks: 3, first: 1 });
  assert.equal(w.host.startBlock(), null);
  assert.ok(w.host.start());
  w.run(300);
  assert.equal(w.guest.getView().stage, 'match');
  assert.equal(w.guest.getView().game, 'penalty2d');
  const me = w.guest.getView().myId;
  assert.equal(w.host.getConfig().players[me].num, 101);
  // 1) 손님 = 키커. 조준 단계에서 0.5초 모았다가 오른쪽(120)으로 뗀다.
  w.guest.setInputReader(() => {
    const s = w.guest.getState();
    if (!s || s.phase !== 'aim' || s.kicker !== me) return { x: 0, kick: false, aim: null };
    if (s.phaseTicks < 10) return { x: 0, kick: false, aim: null };
    if (s.phaseTicks < 40) return { x: 0, kick: true, aim: null };
    return { x: 0, kick: false, aim: 120 };
  });
  assert.ok(w.run(8000, () => w.host.getState().phase === 'flight'), '방장 쪽에서 공이 나가지 않았다');
  const hs = w.host.getState();
  assert.equal(hs.kicker, me);
  assert.ok(hs.ball.vx > 0, `오른쪽으로 나간다 vx=${hs.ball.vx}`);
  assert.ok(hs.power > 0.3 && hs.power < 0.6, `0.5초쯤 모은 세기 ${hs.power}`);
  // 2) 다음 차기 = 방장이 차고 손님이 막는다. 손님은 조준 중 오른쪽으로 걷고, 공이 나가면 오른쪽으로 던진다.
  w.host.setInputReader(() => ({ x: 0, kick: false, aim: null }));   // 방장은 안 찬다 → 5초 뒤 약한 가운데 슛
  w.guest.setInputReader(() => {
    const s = w.guest.getState();
    if (!s || s.keeper !== me) return { x: 0, kick: false, aim: null };
    if (s.phase === 'aim') return { x: 1, kick: false, aim: null };
    if (s.phase === 'flight') return { x: 1, kick: true, aim: null };
    return { x: 0, kick: false, aim: null };
  });
  assert.ok(w.run(8000, () => { const s = w.host.getState(); return s.keeper === me && s.phase === 'aim' && s.phaseTicks > 60; }), '손님 키퍼 차례가 안 왔다');
  assert.ok(w.host.getState().gk.x > 30, `손님 키퍼가 옆걸음 x=${w.host.getState().gk.x}`);
  assert.ok(w.run(8000, () => w.host.getState().gk.dived), '손님 키퍼가 몸을 던지지 않았다');
  assert.equal(w.host.getState().gk.dive, 1);
  // 3) 끝까지 — 결과는 양쪽 같고, 4초 뒤 방으로
  w.guest.setInputReader(null); w.host.setInputReader(null);
  assert.ok(w.run(120000, () => !!w.guest.getView().result), '끝나지 않았다');
  assert.deepEqual(w.guest.getView().result.scored, w.host.getView().result.scored);
  w.run(RESULT_MS + 500);
  assert.equal(w.guest.getView().stage, 'lobby'); assert.equal(w.host.getView().stage, 'lobby');
  // 4) 방장이 훈련장으로 바꾸면 손님 방도 바뀌고, 승부차기 설정은 남는다
  w.host.setGame('free2d');
  w.run(300);
  assert.equal(w.guest.getRoom().game, 'free2d');
  assert.deepEqual(w.guest.getRoom().saved.penalty2d, { kicks: 3, first: 1 });
});

test('자유 훈련장 — 손님 선수가 움직이고, 방장의 공 모으기가 닿고, 경기 중 들어온 사람은 구경하다 다음 판에 낀다', () => {
  const w = world('free2d');
  w.run(1500);
  assert.equal(w.guest.getView().stage, 'lobby');
  assert.equal(w.host.startBlock(), null, '편을 나누지 않아도 시작할 수 있다');
  w.host.setSettings({ bots: 1, field: 'S' });
  assert.ok(w.host.start());
  w.run(300);
  const me = w.guest.getView().myId;
  assert.equal(me, 1, '방장 다음으로 들어온 손님은 자리 1');
  const x0 = w.host.getState().players[me].x;
  w.guest.setInputReader(() => ({ x: 1, y: 0, kick: false, gather: false }));
  w.run(1500);
  assert.ok(w.host.getState().players[me].x > x0 + 100, `손님 선수가 오른쪽으로: ${x0} → ${w.host.getState().players[me].x}`);
  // 손님은 자동으로 공을 쫓아 찬다(훈련장 봇과 같은 길) — 골이 하나 들어가면 그 공은 가운데로
  w.guest.setInputReader(() => { const s = w.guest.getState(); return s ? freeBot(s, w.guest.getConfig(), me) : { x: 0, y: 0, kick: false, gather: false }; });
  assert.ok(w.run(90000, () => w.host.getState().goals > 0), '골이 안 들어갔다');
  // 공 모으기 — 방장 입력 한 번(손님이 보내면 무시된다)
  let once = true;
  w.host.setInputReader(() => { const g = once; once = false; return { x: 0, y: 0, kick: false, gather: g }; });
  w.guest.setInputReader(() => ({ x: 0, y: 0, kick: false, gather: false }));
  w.run(50);
  const hb = w.host.getState().balls;
  assert.ok(hb.every((b) => Math.abs(b.x) < 120 && Math.abs(b.y) < 120), '방장 쪽 공이 가운데로');
  w.run(400);
  assert.ok(w.guest.getBase().balls.every((b) => Math.abs(b.x) < 160 && Math.abs(b.y) < 160), '손님 스냅샷에도');
  // 경기 중 들어온 사람 — 구경
  const late = w.addGuest(2);
  w.run(2000);
  assert.equal(late.getView().stage, 'match'); assert.equal(late.getView().myId, null, '이번 판은 구경');
  assert.equal(w.host.getState().phase, 'play'); assert.equal(w.host.getView().result, null, '저절로 끝나지 않는다');
  // ✕ → 방으로, 다시 시작하면 낀다
  w.host.stop();
  w.run(500);
  assert.equal(late.getView().stage, 'lobby'); assert.equal(w.guest.getView().stage, 'lobby');
  assert.ok(w.host.start());
  w.run(500);
  assert.equal(late.getView().myId, 2, '다음 판엔 자리가 있다');
  w.host.stop(); w.run(300);
  // 경기로 바꾸면 경기 설정 칸이 그대로
  w.host.setGame('match2d');
  w.run(300);
  assert.equal(late.getRoom().game, 'match2d');
  assert.equal(late.getRoom().settings.perSide, 3);
});

test('방장이 다시 열 때 고른 설정으로(HostOptions.settings) — 모양이 틀리면 기본값', () => {
  const now = () => 0;
  const hub = createLoopbackHub({ now });
  const a = createHostSession({ transport: hub.endpoint(), roster, me: who(0), code: 'ABCD', now, games: gameOf, game: 'penalty2d', settings: { kicks: 3, first: 0 } });
  assert.equal(a.getRoom().game, 'penalty2d');
  assert.deepEqual(a.getRoom().settings, { kicks: 3, first: 0 });
  const b = createHostSession({ transport: hub.endpoint(), roster, me: who(0), code: 'ABCE', now, games: gameOf, game: 'penalty2d', settings: { kicks: 4 } });
  assert.deepEqual(b.getRoom().settings, { kicks: 5, first: 'random' });
});
