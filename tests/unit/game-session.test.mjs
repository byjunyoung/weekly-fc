import test from 'node:test';
import assert from 'node:assert/strict';
import { createHostSession, createGuestSession, STEP_MS, DENY_TEXT, inputGapMs } from '../../src/react/game/net/session.ts';
import { createLoopbackHub } from '../../src/react/game/net/transport.ts';
import { PHRASES } from '../../src/lib/games/net.ts';
import { encodeInput } from '../../src/lib/game/quant.ts';
import { createMatch } from '../../src/lib/game/sim.ts';
import { rngFrom } from '../../src/react/game/views/match2d/view.ts';
import { gameOf } from '../../src/lib/games/registry.ts';

// 2026-11-07 게임 묶음 토대: 세션은 등록된 게임 찾기(games)와 처음 게임(game)을 받는다 — 이 파일은 등록부를 거친 2D 경기로 돌린다.
const G = { games: gameOf, game: 'match2d' };

// 방장 하나 + 손님 둘을 메모리 길(루프백)과 가짜 시계로 돌린다. 한쪽 지연 30ms(실측 75ms 보다 짧게 — 테스트 시간을 아끼려고).
const roster = (n = 12) => Array.from({ length: n }, (_, i) => ({
  num: 100 + i, jersey: i + 1, name: `선수${i}`, pos: '', detail: '', foot: '', vest: null, note: '',
  pace: 60 + i, dribble: 60, pass: 60, shoot: 60, defend: 60, stamina: 60, rot: null, avatar: '',
}));
const who = (i, num = 100 + i) => ({ clientId: `c${i}`, num, name: `선수${num - 100}` });

function world({ delayMs = 30, n = 20, guests = 2 } = {}) {
  const clock = { t: 1000 };
  const now = () => clock.t;
  const hub = createLoopbackHub({ delayMs, now });
  const R = roster(n);
  const hostEp = hub.endpoint();
  const host = createHostSession({ transport: hostEp, roster: R, me: who(0), code: 'ABCD', now, rnd: rngFrom(7), ...G });
  const gEps = [], gs = [];
  const addGuest = (w) => {
    const ep = hub.endpoint();
    const g = createGuestSession({ transport: ep, roster: R, me: w, code: 'ABCD', now, ...G });
    gEps.push(ep); gs.push(g);
    return g;
  };
  for (let i = 1; i <= guests; i++) addGuest(who(i));
  // 엿듣는 끝점 — 방장이 보낸 것을 모은다(sid·seed 를 알아내고 답 수를 센다).
  const spy = hub.endpoint();
  const heard = [];
  spy.onMessage((m) => heard.push(m));
  const state = { host };
  /** frozen = 이 동안 advance 를 부르지 않는 손님 번호들(폰이 탭을 얼린 흉내). */
  const run = (ms, { frozen = [] } = {}) => {
    const end = clock.t + ms;
    while (clock.t < end) {
      clock.t = Math.min(end, clock.t + STEP_MS);
      hub.pump(clock.t);
      state.host.advance();
      gs.forEach((g, i) => { if (!frozen.includes(i)) g.advance(); });
    }
  };
  return { clock, hub, host, hostEp, gs, gEps, addGuest, run, R, spy, heard, state, now };
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
  const sid = w.heard.find((m) => m.t === 'room').sid, seed = w.heard.find((m) => m.t === 'start').seed;
  const fake = w.hub.endpoint();   // 방장 말투(from·sid·seed 가 진짜와 같음)로 옛것을 보낸다
  fake.send({ t: 'room', from: 'c0', sid, room: { ...w.host.getRoom(), rev: rev - 1, members: [] }, roster: [] });
  fake.send({ t: 'snap', from: 'c0', seed, tick: 1, state: { ...createMatch(w.host.getConfig(), 1), tick: 1 }, inputs: [], paused: false });
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

test('로비에서 30초 조용한 손님은 명단에서 빠지고(2026-11-07: 4초 → 30초, 앱 전환에 쫓겨나서), 다시 살아나면 스스로 다시 들어온다', () => {
  const w = world();
  w.run(1500);
  w.gEps[1].mute(true);
  w.run(10000);
  assert.ok(inRoom(w.host.getRoom(), 'c2'), '10초는 아직 남는다');
  w.run(21000);
  assert.ok(!inRoom(w.host.getRoom(), 'c2'));
  assert.ok(inRoom(w.host.getRoom(), 'c1'), '말하는 손님(ping)은 남는다');
  w.gEps[1].mute(false);
  w.run(2500);
  assert.ok(inRoom(w.host.getRoom(), 'c2'), '빠진 걸 보고 hello 를 다시 보냈다');
});

test('로비에서 방장이 30초 조용하면 손님은 "방장과 연결이 끊겼습니다"(2026-11-07: 4초 → 30초)', () => {
  const w = world();
  w.run(1500);
  w.hostEp.mute(true);
  w.run(4600);
  for (const g of w.gs) { assert.equal(g.getView().stage, 'lobby'); assert.equal(g.getView().hostSlow, true, '띠만'); }
  w.run(26000);
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

// ───────────────────────── 2026-11-07 리뷰 뒤 ─────────────────────────
test('혼자 있는 방장은 10초 동안 room 을 안 보낸다 — 들어오는 hello 엔 답한다', () => {
  const w = world({ guests: 0 });
  w.run(500);
  const r0 = w.hostEp.sentByType.room ?? 0;
  w.run(10000);
  assert.equal((w.hostEp.sentByType.room ?? 0) - r0, 0);
  const g = w.addGuest(who(1));
  w.run(1500);
  assert.equal(g.getView().stage, 'lobby');
});

test('가려진 방장 3분 → 경기를 접고(stop) 그 뒤로 조용하다, 남은 손님은 30초 뒤 스스로 나온다', () => {
  const w = world({ guests: 1 });
  w.run(1500);
  w.host.move('c1', 0);
  w.run(100);
  w.host.start();
  w.run(1000);
  w.host.setHidden(true);
  w.run(181000);
  assert.equal(w.host.getView().stage, 'lobby');
  assert.ok(w.heard.some((m) => m.t === 'stop'));
  assert.equal(w.gs[0].getView().stage, 'lobby', '손님은 stop 을 받고 방으로');
  const s0 = w.hostEp.sent;
  w.run(10000);
  assert.equal(w.hostEp.sent - s0, 0, '잠든 방장은 주기 방송도 pong 도 안 보낸다');
  w.run(21000);
  assert.equal(w.gs[0].getView().stage, 'ended');
  w.host.setHidden(false);
  w.run(2000);
  assert.ok(w.hostEp.sent > s0, '돌아오면 다시 보낸다(hello 답 등)');
});

test('가려진 방장의 로비 room 은 5초마다', () => {
  const w = world({ guests: 1 });
  w.run(1500);
  w.host.setHidden(true);
  const r0 = w.hostEp.sentByType.room;
  w.run(20000);
  const n = w.hostEp.sentByType.room - r0;
  assert.ok(n >= 3 && n <= 5, `20초에 ${n}건`);
});

test('손님 탭이 5초 얼었다 돌아와도 쫓겨나지 않는다(로비·경기)', () => {
  const w = world({ guests: 1 });
  w.run(1500);
  w.gs[0].setHidden(true); w.gEps[0].mute(true);
  w.run(5000, { frozen: [0] });
  w.gs[0].setHidden(false); w.gEps[0].mute(false);
  w.run(2000);
  assert.equal(w.gs[0].getView().stage, 'lobby');
  assert.ok(inRoom(w.host.getRoom(), 'c1'));
  w.host.move('c1', 0);
  w.run(100);
  w.host.start();
  w.run(500);
  const id = w.gs[0].getPredictor().myId;
  w.gs[0].setHidden(true); w.gEps[0].mute(true);
  w.run(5000, { frozen: [0] });
  assert.equal(w.host.getSlots()[id].bot, true, '없는 동안은 봇');
  w.gs[0].setHidden(false); w.gEps[0].mute(false);
  w.gs[0].setInputReader(() => ({ x: 1, y: 0, kick: false }));
  w.run(1000);
  assert.equal(w.gs[0].getView().stage, 'match');
  assert.equal(w.host.getSlots()[id].bot, false, '돌아오면 다시 내 자리');
});

test('가려진 손님은 in·ping 을 안 보낸다', () => {
  const w = world({ guests: 1 });
  w.run(1500);
  w.host.move('c1', 0);
  w.run(100);
  w.host.start();
  w.run(500);
  w.gs[0].setHidden(true);
  const a = { ...w.gEps[0].sentByType };
  w.run(5000);
  assert.equal((w.gEps[0].sentByType.in ?? 0) - (a.in ?? 0), 0);
  assert.equal((w.gEps[0].sentByType.ping ?? 0) - (a.ping ?? 0), 0);
});

test('경기 중 방장이 10초 조용해도 손님은 남고 띠만, 21초면 끝난다', () => {
  const w = world({ guests: 1 });
  w.run(1500);
  w.host.start();
  w.run(500);
  w.hostEp.mute(true);
  w.run(10000);
  assert.equal(w.gs[0].getView().stage, 'match');
  assert.equal(w.gs[0].getView().hostSlow, true);
  w.run(11000);
  assert.equal(w.gs[0].getView().stage, 'ended');
  assert.equal(w.gs[0].getView().endedWhy, '방장과 연결이 끊겼습니다');
});

test('다른 seed 의 snap → 예측기를 버리고 hello, 방장이 start 를 다시 줘 따라잡는다', () => {
  const w = world({ guests: 1 });
  w.run(1500);
  w.host.start();
  w.run(500);
  const seed = w.heard.find((m) => m.t === 'start').seed;
  const g = w.gs[0];
  const fake = w.hub.endpoint();
  fake.send({ t: 'snap', from: 'c0', seed: seed + 1, tick: 99999, state: { ...w.host.getState(), tick: 99999 }, inputs: [], paused: false });
  const h0 = w.gEps[0].sentByType.hello ?? 0;
  w.hub.pump(w.clock.t + 100);
  assert.equal(g.getPredictor(), null, '낡은 예측기를 버렸다');
  assert.equal((w.gEps[0].sentByType.hello ?? 0) - h0, 1, 'hello 를 다시');
  w.run(500);
  assert.ok(g.getPredictor(), '방장의 start 로 다시');
  assert.equal(g.getView().stage, 'match');
  assert.ok(Math.abs(g.getBase().tick - w.host.getState().tick) < 15);
});

test('hostId 가 아닌 from 의 room·snap·stop·bye 는 무시한다', () => {
  const w = world();
  w.run(1500);
  w.host.start();
  w.run(500);
  const g = w.gs[0];
  const rev = g.getRoom().rev, seed = w.heard.find((m) => m.t === 'start').seed, sid = w.heard.find((m) => m.t === 'room').sid;
  const fake = w.hub.endpoint();
  fake.send({ t: 'room', from: 'c2', sid, room: { ...w.host.getRoom(), hostId: 'c2', rev: rev + 10, members: [] }, roster: [] });
  fake.send({ t: 'room', from: 'c2', sid, room: { ...w.host.getRoom(), rev: rev + 10, members: [] }, roster: [] });
  fake.send({ t: 'snap', from: 'c2', seed, tick: 99999, state: { ...w.host.getState(), tick: 99999 }, inputs: [], paused: true });
  fake.send({ t: 'stop', from: 'c2', seed });
  fake.send({ t: 'bye', from: 'c2' });
  w.hub.pump(w.clock.t + 100);
  assert.ok(g.getRoom().rev < rev + 10);
  assert.ok(g.getBase().tick < 99999);
  assert.equal(g.getView().stage, 'match');
  assert.equal(g.getView().paused, false);
});

test('선수 수가 다른 snap 은 버리고 예외 없이 그린다', () => {
  const w = world({ guests: 1 });
  w.run(1500);
  w.host.start();
  w.run(500);
  const g = w.gs[0];
  const seed = w.heard.find((m) => m.t === 'start').seed;
  const st = w.host.getState();
  const tick = g.getBase().tick;
  const fake = w.hub.endpoint();
  fake.send({ t: 'snap', from: 'c0', seed, tick: 99999, state: { ...st, tick: 99999, players: st.players.slice(1) }, inputs: [], paused: false });
  fake.send({ t: 'snap', from: 'c0', seed, tick: 99998, state: { ...st, tick: 99998, lastScorer: 7 }, inputs: [], paused: false });
  w.hub.pump(w.clock.t + 100);
  assert.equal(g.getBase().tick, tick);
  assert.doesNotThrow(() => { w.run(300); g.frame(); });
  assert.ok(g.getBase().tick > tick, '진짜 스냅샷은 계속 받는다');
});

test('떨리는 입력(매 틱 q 가 바뀜)에도 손님 전송은 초당 21건 이하', () => {
  const w = world({ guests: 1 });
  w.run(1500);
  w.host.move('c1', 0);
  w.run(100);
  w.host.start();
  let k = 0;
  w.gs[0].setInputReader(() => { k++; return k % 2 ? { x: 1, y: 0, kick: false } : { x: 0, y: 1, kick: false }; });
  w.run(500);
  const s0 = w.gEps[0].sent;
  w.run(5000);
  const rate = (w.gEps[0].sent - s0) / 5;
  assert.ok(rate <= 21, `${rate}/초`);
});

test('방장 새로고침(sid 바뀜, rev 0) 뒤 bye 를 놓친 손님도 새 방을 받아들이고 다시 들어간다', () => {
  const w = world({ guests: 1 });
  w.run(1500);
  w.host.move('c1', 0); w.host.move('c0', 1);
  w.run(300);
  assert.ok(w.gs[0].getRoom().rev >= 3);
  w.hostEp.close();   // 탭이 bye 없이 사라짐
  const ep = w.hub.endpoint();
  w.state.host = createHostSession({ transport: ep, roster: w.R, me: who(0), code: 'ABCD', now: w.now, rnd: rngFrom(99), ...G });
  w.run(3000);
  assert.equal(w.gs[0].getView().stage, 'lobby');
  assert.ok(inRoom(w.state.host.getRoom(), 'c1'), '새 방에 다시 들어갔다');
  assert.deepEqual(w.gs[0].getRoom(), w.state.host.getRoom());
});

test('같은 clientId 의 연속 hello 는 900ms 안에 한 번만 답한다', () => {
  const w = world({ guests: 0 });
  w.run(500);
  const fake = w.hub.endpoint();
  const r0 = w.hostEp.sentByType.room ?? 0;
  fake.send({ t: 'hello', from: 'c7', num: 107, name: '선수7' });
  w.run(300);
  fake.send({ t: 'hello', from: 'c7', num: 107, name: '선수7' });
  w.run(300);
  assert.equal((w.hostEp.sentByType.room ?? 0) - r0, 1);
  fake.send({ t: 'hello', from: 'c7', num: 107, name: '선수7' });   // 900ms 뒤엔 다시 답한다
  w.run(500);
  assert.equal((w.hostEp.sentByType.room ?? 0) - r0, 2);
});

test('명단에 없는 선수의 hello·pick 은 무시한다(거절 사유를 지어내지 않음)', () => {
  const w = world({ guests: 1 });
  w.run(1500);
  const fake = w.hub.endpoint();
  fake.send({ t: 'hello', from: 'c8', num: 999, name: '유령' });
  fake.send({ t: 'pick', from: 'c1', num: 999, name: '유령' });
  w.run(300);
  assert.ok(!inRoom(w.host.getRoom(), 'c8'));
  assert.equal(w.host.getRoom().members.find((m) => m.clientId === 'c1').num, 101);
  assert.equal(w.hostEp.sentByType.deny ?? 0, 0);
});

test('손님이 3분 못 들어가면 "방장을 찾지 못했습니다"', () => {
  const w = world({ guests: 0 });
  w.host.leave();
  w.run(100);   // 방장이 떠나며 보낸 것은 먼저 지나가게
  const g = w.addGuest(who(1));
  w.run(181000);
  assert.equal(g.getView().stage, 'ended');
  assert.equal(g.getView().endedWhy, '방장을 찾지 못했습니다');
});

// ───────────────────────── 2026-11-07 경기장 크기·팀 인원 ─────────────────────────
test('손님 입력 간격 = max(50, 손님 수 × 28)ms', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 8].map(inputGapMs), [50, 50, 50, 56, 84, 196]);
});

test('사람 8명(손님 7) 경기에서 떨리는 입력이어도 손님마다 초당 6건 이하, 경기장은 자동으로 크게(4대4 = 8명)', () => {
  const w = world({ guests: 7 });
  w.run(2500);
  w.host.setSettings({ perSide: 0 });
  for (let i = 0; i < 8; i++) w.host.move(`c${i}`, i % 2);
  w.run(200);
  assert.ok(w.host.start(), w.host.getView().notice ?? '');
  assert.equal(w.host.getConfig().field, 'L');
  w.run(500);
  let k = 0;
  for (const g of w.gs) g.setInputReader(() => { k++; return k % 2 ? { x: 1, y: 0, kick: false } : { x: 0, y: 1, kick: false }; });
  w.run(500);
  const s0 = w.gEps.map((e) => e.sent);
  w.run(5000);
  for (let i = 0; i < 7; i++) {
    const rate = (w.gEps[i].sent - s0[i]) / 5;
    assert.ok(rate <= 6, `손님 ${i + 1}: ${rate}/초 (간격 196ms → in 5.1 + ping 0.5)`);
  }
  assert.ok(w.gs.every((g) => g.getView().myId !== null));
});

test('9명이 팀 칸에 있으면 시작이 막히고 8명 안내, 구경하는 손님은 ping 5초마다', () => {
  const w = world({ guests: 9 });
  w.run(2500);
  for (let i = 0; i < 9; i++) w.host.move(`c${i}`, i % 2);
  w.run(200);
  assert.match(w.host.startBlock(), /8명까지/);
  assert.equal(w.host.start(), false);
  w.host.move('c9', null); w.host.move('c8', null);   // c8·c9 는 대기 칸에서 구경
  assert.equal(w.host.startBlock(), null);
  assert.ok(w.host.start());
  w.run(1000);
  const spec = w.gs[7];   // c8
  assert.equal(spec.getView().myId, null);
  const p0 = w.gEps[7].sentByType.ping ?? 0;
  w.run(10000);
  const pings = (w.gEps[7].sentByType.ping ?? 0) - p0;
  assert.ok(pings >= 1 && pings <= 3, `구경꾼 10초 ping ${pings}`);
  assert.equal(w.gEps[7].sentByType.in ?? 0, 0, '구경꾼은 입력을 안 보낸다');
});

test('사람 6명 이상인 로비는 room 을 2초마다', () => {
  const w = world({ guests: 5 });
  w.run(3000);
  assert.equal(w.host.getRoom().members.length, 6);
  const r0 = w.hostEp.sentByType.room;
  w.run(10000);
  const n = w.hostEp.sentByType.room - r0;
  assert.ok(n >= 4 && n <= 6, `10초에 ${n}건`);
});

test('두 편 0명이면 시작이 막힌다, 한 편만 사람이어도 된다(봇 없음)', () => {
  const w = world({ guests: 1 });
  w.run(1500);
  w.host.setSettings({ perSide: 0 });
  assert.match(w.host.startBlock(), /두 편 모두 비어/);
  assert.equal(w.host.start(), false);
  w.host.move('c1', 1);
  assert.ok(w.host.start());
  w.run(500);
  assert.equal(w.host.getConfig().players.length, 1);
  assert.equal(w.host.getConfig().field, 'S');
  assert.equal(w.gs[0].getView().myId, 0);
});

test('봇 고르기 — 방장 명령은 로비에서만, 손님은 고른 봇을 방 상태로 받고 경기에 그 선수가 봇으로 뛴다', () => {
  const w = world({ guests: 1 });
  w.run(1500);
  w.host.setSettings({ perSide: 2 });
  w.host.move('c0', 0);
  w.host.setBotPick(0, 0, 110);
  w.host.setBotPick(1, 0, 111);
  w.host.setBotPick(1, 1, 101);   // 손님이 잡은 선수 — 안 된다
  w.run(200);
  assert.deepEqual(w.gs[0].getRoom().botPicks, [[110], [111]]);
  assert.ok(w.host.start());
  const rev = w.host.getRoom().rev;
  w.host.setBotPick(0, 0, 112);
  assert.equal(w.host.getRoom().rev, rev, '경기 중엔 못 바꾼다');
  w.run(300);
  const cfg = w.gs[0].getConfig();
  assert.equal(cfg.players.find((p) => p.side === 0 && p.bot).num, 110);
  assert.equal(cfg.players.find((p) => p.side === 1 && p.bot).num, 111);
});
