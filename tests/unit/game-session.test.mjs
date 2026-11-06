import test from 'node:test';
import assert from 'node:assert/strict';
import { createHostSession, createGuestSession, STEP_MS, DENY_TEXT } from '../../src/react/game/net/session.ts';
import { createLoopbackHub } from '../../src/react/game/net/transport.ts';
import { encodeInput, PHRASES } from '../../src/lib/game/net.ts';
import { createMatch } from '../../src/lib/game/sim.ts';
import { rngFrom } from '../../src/react/game/view.ts';

// 방장 하나 + 손님 둘을 메모리 길(루프백)과 가짜 시계로 돌린다. 한쪽 지연 30ms(실측 75ms 보다 짧게 — 테스트 시간을 아끼려고).
const roster = (n = 12) => Array.from({ length: n }, (_, i) => ({
  num: 100 + i, jersey: i + 1, name: `선수${i}`, pos: '', detail: '', foot: '', vest: null, note: '',
  pace: 60 + i, dribble: 60, pass: 60, shoot: 60, defend: 60, stamina: 60, rot: null, avatar: '',
}));
const who = (i, num = 100 + i) => ({ clientId: `c${i}`, num, name: `선수${num - 100}` });

function world({ delayMs = 30, n = 12, guests = 2 } = {}) {
  const clock = { t: 1000 };
  const now = () => clock.t;
  const hub = createLoopbackHub({ delayMs, now });
  const R = roster(n);
  const hostEp = hub.endpoint();
  const host = createHostSession({ transport: hostEp, roster: R, me: who(0), code: 'ABCD', now, rnd: rngFrom(7) });
  const gEps = [], gs = [];
  const addGuest = (w) => {
    const ep = hub.endpoint();
    const g = createGuestSession({ transport: ep, roster: R, me: w, code: 'ABCD', now });
    gEps.push(ep); gs.push(g);
    return g;
  };
  for (let i = 1; i <= guests; i++) addGuest(who(i));
  const run = (ms) => {
    const end = clock.t + ms;
    while (clock.t < end) {
      clock.t = Math.min(end, clock.t + STEP_MS);
      hub.pump(clock.t);
      host.advance();
      for (const g of gs) g.advance();
    }
  };
  return { clock, hub, host, hostEp, gs, gEps, addGuest, run, R };
}
const inRoom = (room, cid) => !!room?.members.some((m) => m.clientId === cid);

test('hello → 방장 방에 손님 둘이 들어오고, 손님도 그 방을 받는다', () => {
  const w = world();
  w.run(1500);
  const room = w.host.getRoom();
  assert.deepEqual(room.members.map((m) => m.clientId), ['c0', 'c1', 'c2']);
  for (const g of w.gs) {
    assert.equal(g.getView().stage, 'lobby');
    assert.equal(g.getRoom().rev, room.rev);
    assert.ok(inRoom(g.getRoom(), g.getView().clientId));
  }
});

test('이미 다른 사람이 고른 선수로 들어오면 taken 으로 거절된다', () => {
  const w = world();
  w.run(1500);
  const g3 = w.addGuest({ clientId: 'c9', num: 101, name: '흉내' });   // c1 과 같은 선수
  w.run(1500);
  assert.equal(g3.getView().stage, 'ended');
  assert.equal(g3.getView().endedWhy, DENY_TEXT.taken);
  assert.ok(!inRoom(w.host.getRoom(), 'c9'));
});

test('방장이 옮기고 자동으로 나누면 손님이 새 방을 받는다 — 경기 중엔 옮기기·설정이 안 먹는다', () => {
  const w = world();
  w.run(1500);
  w.host.move('c1', 0);
  w.run(200);
  assert.equal(w.gs[0].getRoom().members.find((m) => m.clientId === 'c1').team, 0);
  w.host.setSettings({ perSide: 2 });
  w.host.autoBalance();
  w.run(200);
  const hr = w.host.getRoom();
  for (const g of w.gs) assert.deepEqual(g.getRoom(), hr);
  assert.equal(hr.settings.perSide, 2);
  assert.ok(hr.members.every((m) => m.team !== null), '셋 다 팀 칸으로');
  assert.ok(w.host.start());
  const rev = w.host.getRoom().rev;
  w.host.move('c1', null); w.host.setSettings({ perSide: 1 }); w.host.autoBalance();
  assert.equal(w.host.getRoom().rev, rev, '경기 중에는 방이 안 바뀐다');
});

test('시작 → 손님마다 맞는 myId 의 예측기, 대기 칸 손님은 구경(null)', () => {
  const w = world();
  w.run(1500);
  w.host.setSettings({ perSide: 2 });
  w.host.move('c0', 0); w.host.move('c1', 1);   // c2 는 대기
  w.run(200);
  assert.ok(w.host.start());
  w.run(300);
  const cfg = w.host.getConfig();
  const g1 = w.gs[0], g2 = w.gs[1];
  assert.equal(g1.getView().stage, 'match');
  const id1 = g1.getPredictor().myId;
  assert.equal(cfg.players[id1].num, 101);
  assert.equal(cfg.players[id1].bot, false);
  assert.equal(cfg.players[id1].side, 1);
  assert.equal(g2.getView().stage, 'match');
  assert.equal(g2.getPredictor().myId, null, '대기 칸은 구경');
  assert.equal(w.host.getView().myId, cfg.players.findIndex((p) => p.num === 100));
  assert.deepEqual(g1.getConfig(), cfg);
});

test('손님의 입력이 방장 경기 상태에서 그 손님 선수를 움직이고, 스냅샷이 손님에게 닿아 base 틱이 오른다', () => {
  const w = world();
  w.run(1500);
  w.host.move('c1', 0);
  w.run(100);
  w.host.start();
  w.run(200);
  const g1 = w.gs[0];
  const id = g1.getPredictor().myId;
  assert.notEqual(id, null);
  const x0 = w.host.getState().players[id].y;
  g1.setInputReader(() => ({ x: 0, y: 1, kick: false }));   // 아래로 달리기
  const tick0 = g1.getBase().tick;
  w.run(1000);
  const y1 = w.host.getState().players[id].y;
  assert.ok(y1 - x0 > 60, `방장 상태에서 손님 선수가 움직였다: ${x0} → ${y1}`);
  assert.ok(g1.getBase().tick > tick0 + 40, '스냅샷이 계속 온다');
  assert.ok(w.gs[1].getBase().tick > tick0 + 40, '구경꾼도 받는다');
  // 방장이 그 자리에 쓴 입력 = 손님이 보낸 양자화 값
  const slots = w.host.getSlots();
  assert.equal(slots[id].clientId, 'c1');
  assert.equal(slots[id].bot, false);
  // 예측은 방장 상태와 크게 다르지 않다(같은 입력·같은 step)
  const gy = g1.getState().players[id].y, hy = w.host.getState().players[id].y;
  assert.ok(Math.abs(gy - hy) < 40, `예측 ${gy} vs 방장 ${hy}`);
});

test('낮은 rev 의 방 상태와 옛 스냅샷은 버린다', () => {
  const w = world();
  w.run(1500);
  w.host.start();
  w.run(500);
  const g = w.gs[0];
  const rev = g.getRoom().rev, tick = g.getBase().tick;
  const fake = w.hub.endpoint();
  fake.send({ t: 'room', room: { ...w.host.getRoom(), rev: rev - 1, members: [] }, roster: [] });
  fake.send({ t: 'snap', tick: 1, state: { ...createMatch(w.host.getConfig(), 1), tick: 1 }, inputs: [], paused: false });
  w.hub.pump(w.clock.t + 1000);
  assert.equal(g.getRoom().rev, rev);
  assert.ok(g.getBase().tick >= tick, '옛 스냅샷으로 되돌아가지 않는다');
  assert.ok(inRoom(g.getRoom(), 'c1'));
});

test('남에게 가는 것·이상한 모양은 무시한다', () => {
  const w = world({ guests: 1 });
  w.run(1500);
  const fake = w.hub.endpoint();
  fake.send({ t: 'deny', to: 'someone-else', reason: 'closed' });
  fake.send({ t: 'room', room: { code: 'ABCD', hostId: 'x', members: 'nope' }, roster: [] });
  w.run(200);
  assert.equal(w.gs[0].getView().stage, 'lobby');
  assert.equal(w.gs[0].getRoom().hostId, 'c0');
});

test('경기 중 조용해진 손님 자리는 봇이 맡고, 다시 말하면 돌려받는다', () => {
  const w = world();
  w.run(1500);
  w.host.move('c1', 0);
  w.run(100);
  w.host.start();
  w.gs[0].setInputReader(() => ({ x: 1, y: 0, kick: false }));
  w.run(500);
  const id = w.gs[0].getPredictor().myId;
  assert.equal(w.host.getSlots()[id].bot, false);
  w.gEps[0].mute(true);
  w.run(4500);
  assert.equal(w.host.getSlots()[id].bot, true, '4초 넘게 조용 → 봇');
  assert.ok(inRoom(w.host.getRoom(), 'c1'), '경기 중엔 명단에서 빼지 않는다');
  w.gEps[0].mute(false);
  w.run(700);
  assert.equal(w.host.getSlots()[id].bot, false, '입력이 다시 오면 그 손님이 조종');
});

test('로비에서 조용해진 손님은 명단에서 빠지고, 다시 살아나면 스스로 다시 들어온다', () => {
  const w = world();
  w.run(1500);
  w.gEps[1].mute(true);
  w.run(4600);
  assert.ok(!inRoom(w.host.getRoom(), 'c2'));
  assert.ok(inRoom(w.host.getRoom(), 'c1'), '말하는 손님(ping)은 남는다');
  w.gEps[1].mute(false);
  w.run(2500);
  assert.ok(inRoom(w.host.getRoom(), 'c2'), '빠진 걸 보고 hello 를 다시 보냈다');
});

test('방장이 조용해지면 손님은 "방장과 연결이 끊겼습니다"', () => {
  const w = world();
  w.run(1500);
  w.hostEp.mute(true);
  w.run(4600);
  for (const g of w.gs) {
    assert.equal(g.getView().stage, 'ended');
    assert.equal(g.getView().endedWhy, '방장과 연결이 끊겼습니다');
    assert.equal(g.getView().hostLost, true);
  }
});

test('방장이 나가면(bye) 손님은 바로 끝난다', () => {
  const w = world({ guests: 1 });
  w.run(1500);
  w.host.leave();
  w.run(100);
  assert.equal(w.gs[0].getView().stage, 'ended');
  assert.equal(w.gs[0].getView().endedWhy, '방장이 방을 닫았습니다');
});

test('stop → 모두 로비로, 같은 사람들로 다시 시작할 수 있다', () => {
  const w = world();
  w.run(1500);
  w.host.move('c1', 0);
  w.run(100);
  w.host.start();
  w.run(1000);
  w.host.stop();
  w.run(300);
  assert.equal(w.host.getView().stage, 'lobby');
  assert.equal(w.host.getRoom().phase, 'lobby');
  for (const g of w.gs) { assert.equal(g.getView().stage, 'lobby'); assert.equal(g.getPredictor(), null); }
  assert.equal(w.host.getRoom().members.find((m) => m.clientId === 'c1').team, 0, '칸은 그대로');
  assert.ok(w.host.start());
  w.run(300);
  assert.equal(w.gs[0].getView().matchKey, 2);
});

test('경기가 끝나면 모두 결과를 보고 4초 뒤 로비로', () => {
  const w = world({ guests: 1 });
  w.run(1500);
  w.host.setSettings({ minutes: 1, perSide: 1 });
  w.run(100);
  w.host.start();
  // 시계는 킥오프·골 세리머니 동안 멈추므로 1분 경기가 1분보다 길다 — 결과가 뜰 때까지(최대 2분) 민다.
  for (let i = 0; i < 1200 && !w.host.getView().result; i++) w.run(100);
  w.run(200);
  assert.ok(w.host.getView().result, '방장 결과');
  assert.ok(w.gs[0].getView().result, '손님 결과');
  assert.deepEqual(w.gs[0].getView().result.score, w.host.getView().result.score);
  assert.equal(w.gs[0].getView().stage, 'match');
  w.run(4300);
  assert.equal(w.host.getView().stage, 'lobby');
  assert.equal(w.gs[0].getView().stage, 'lobby');
  assert.equal(w.gs[0].getView().result, null);
});

test('방장 탭이 가려지면 경기가 멈추고 손님은 "멈춤"을 받는다, 돌아오면 이어 간다', () => {
  const w = world({ guests: 1 });
  w.run(1500);
  w.host.start();
  w.run(1000);
  w.host.setHidden(true);
  const tick = w.host.getState().tick;
  w.run(3000);
  assert.equal(w.host.getState().tick, tick, '가려진 동안 진행 안 함');
  assert.equal(w.gs[0].getView().paused, true);
  assert.equal(w.gs[0].getView().stage, 'match', '멈춤 스냅샷이 살아 있음 알림이 된다');
  w.host.setHidden(false);
  w.run(500);
  assert.ok(w.host.getState().tick > tick);
  assert.equal(w.gs[0].getView().paused, false);
});

test('한마디 — 보낸 사람과 다른 사람 모두 그 선수 머리 위에, 1.5초에 한 번', () => {
  const w = world();
  w.run(1500);
  w.host.move('c1', 0);
  w.run(100);
  w.host.start();
  w.run(300);
  const g1 = w.gs[0], id = g1.getPredictor().myId;
  assert.ok(g1.say(2));
  assert.ok(!g1.say(3), '1.5초 안에 또는 안 된다');
  w.run(200);
  for (const s of [w.host, g1, w.gs[1]]) assert.deepEqual(s.frame().bubbles, [{ id, text: PHRASES[2] }]);
  assert.ok(!w.gs[1].say(0), '구경꾼은 못 한다');
  w.run(2100);
  assert.deepEqual(w.host.frame().bubbles, []);
  // 남의 선수를 사칭한 한마디는 무시
  const fake = w.hub.endpoint();
  fake.send({ t: 'say', from: 'c2', id, k: 1 });
  w.run(100);
  assert.deepEqual(w.host.frame().bubbles, []);
});

test('경기 중 새로고침한 손님(같은 clientId)은 자기 자리로 돌아와 다시 뛴다', () => {
  const w = world({ guests: 1 });
  w.run(1500);
  w.host.move('c1', 1);
  w.run(100);
  w.host.start();
  w.run(500);
  const id = w.gs[0].getPredictor().myId;
  w.gEps[0].close();   // 탭이 닫힘(bye 없이)
  w.run(4500);
  assert.equal(w.host.getSlots()[id].bot, true);
  const again = w.addGuest(who(1));
  w.run(1500);
  assert.equal(again.getView().stage, 'match');
  assert.equal(again.getPredictor().myId, id);
  again.setInputReader(() => ({ x: -1, y: 0, kick: false }));
  w.run(300);
  assert.equal(w.host.getSlots()[id].bot, false);
});

test('명단이 모자라면 시작하지 않고 이유를 알린다(RangeError 로 죽지 않는다)', () => {
  const w = world({ n: 5, guests: 2 });
  w.run(1500);
  w.host.setSettings({ perSide: 3 });   // 6 자리, 사람 셋 다 대기 → 봇 6 필요, 남는 명단 2
  assert.ok(w.host.startBlock());
  assert.equal(w.host.start(), false);
  assert.ok(w.host.getView().notice);
  assert.equal(w.host.getView().stage, 'lobby');
  w.host.setSettings({ perSide: 1 });
  w.host.move('c0', 0); w.host.move('c1', 1);
  assert.equal(w.host.startBlock(), null);
  assert.ok(w.host.start());
});

test('방송 한도 — 손님 둘이 가만있는 10초 경기: 방장 ≤ 13/초, 손님 ≤ 3/초', () => {
  // 예상: 방장 = 스냅샷 10 + 방 상태 1 + pong(손님마다 0.5) ≈ 12/초. 손님 = 살아 있음 알림 2 + ping 0.5 = 2.5/초.
  const w = world();
  w.run(1500);
  w.host.move('c1', 0); w.host.move('c2', 1);
  w.run(100);
  w.host.start();
  w.run(500);
  const h0 = w.hostEp.sent, g0 = w.gEps.map((e) => e.sent);
  w.run(10000);
  const hostRate = (w.hostEp.sent - h0) / 10;
  const gRates = w.gEps.map((e, i) => (e.sent - g0[i]) / 10);
  assert.ok(hostRate <= 13, `방장 ${hostRate}/초 ${JSON.stringify(w.hostEp.sentByType)}`);
  assert.ok(hostRate >= 10, `스냅샷이 초당 10번은 간다: ${hostRate}`);
  for (const r of gRates) assert.ok(r <= 3, `손님 ${r}/초`);
});

test('입력은 바뀔 때만 + 0.5초마다 — 같은 입력이면 초당 2번', () => {
  const w = world({ guests: 1 });
  w.run(1500);
  w.host.move('c1', 0);
  w.run(100);
  w.host.start();
  let q = { x: 1, y: 0, kick: false };
  w.gs[0].setInputReader(() => q);
  w.run(500);
  const s0 = w.gEps[0].sentByType.in ?? 0;
  w.run(2000);
  const idle = (w.gEps[0].sentByType.in ?? 0) - s0;
  assert.ok(idle >= 3 && idle <= 5, `같은 입력 2초: ${idle}`);
  q = { x: 0, y: 1, kick: true };
  w.run(50);
  const s1 = w.gEps[0].sentByType.in;
  assert.ok(s1 > s0 + idle, '바뀌면 바로');
  assert.equal(encodeInput(q) > 32, true);
});
