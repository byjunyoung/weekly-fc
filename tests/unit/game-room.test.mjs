import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_HUMANS, MAX_MEMBERS, MAX_PER_SIDE, autoBalance, createRoom as newRoom, isRoomCode, join, leave, makeRoomCode, move, pick, setPhase,
} from '../../src/lib/game/room.ts';
// 2026-11-07 게임 묶음 토대: 2D 경기에만 맞는 방 규칙(설정·시작)은 match2d-room.ts 로 옮겼다(내용 그대로).
import { DEFAULT_SETTINGS, fieldFor, resolveField, sideSizes, startBlock, buildMatch, setSettings } from '../../src/lib/games/match2d-room.ts';
import { rngFrom } from '../../src/react/game/views/match2d/view.ts';

/** 방은 게임 종류와 그 게임의 기본 설정으로 만든다 — 이 파일은 2D 경기의 방. */
const createRoom = (code, host) => newRoom(code, host, 'match2d', DEFAULT_SETTINGS);

const roster = (n, stat = (i) => 60 + i) => Array.from({ length: n }, (_, i) => ({
  num: 100 + i, jersey: i + 1, name: `선수${i}`, pos: '', detail: '', foot: '', vest: null, note: '',
  pace: stat(i), dribble: stat(i), pass: stat(i), shoot: stat(i), defend: stat(i), stamina: stat(i), rot: null, avatar: '',
}));
const who = (i, num = 100 + i) => ({ clientId: `c${i}`, num, name: `선수${num - 100}` });
/** 방장 c0 에 사람 n-1 명이 더 들어온 로비. */
const roomWith = (n, over = {}) => {
  let r = createRoom('ABCD', who(0));
  for (let i = 1; i < n; i++) { const j = join(r, who(i)); assert.ok(j.ok); r = j.room; }
  return { ...r, ...over };
};

test('방 코드 — 헷갈리는 글자 없이 4자', () => {
  const rnd = rngFrom(1);
  for (let i = 0; i < 300; i++) {
    const c = makeRoomCode(rnd);
    assert.match(c, /^[A-Z2-9]{4}$/);
    assert.ok(!/[0O1IL]/.test(c), c);
    assert.ok(isRoomCode(c));
  }
  assert.equal(makeRoomCode(() => 0), 'AAAA');
  assert.equal(makeRoomCode(() => 0.9999999), '9999');
  for (const bad of ['', 'ABC', 'ABCDE', 'abcd', 'AB0D', 'ABOD', 'AB1D', 'ABID', 'ABLD', 'AB D']) assert.ok(!isRoomCode(bad), bad);
});

test('createRoom — 방장만, 대기 칸, 기본 설정', () => {
  const r = createRoom('ABCD', who(0));
  assert.deepEqual(r.members, [{ clientId: 'c0', num: 100, name: '선수0', team: null }]);
  assert.equal(r.hostId, 'c0'); assert.equal(r.phase, 'lobby'); assert.equal(r.rev, 0);
  assert.deepEqual(r.settings, { perSide: 3, minutes: 3, scoreLimit: 0, field: 'auto' });
  assert.deepEqual(DEFAULT_SETTINGS, r.settings);
  r.settings.minutes = 9;
  assert.equal(DEFAULT_SETTINGS.minutes, 3, '기본값을 공유하지 않는다');
});

test('join — 새 사람·새로고침·남이 쓰는 선수·정원', () => {
  const r0 = createRoom('ABCD', who(0));
  const a = join(r0, who(1));
  assert.ok(a.ok); assert.equal(a.room.rev, 1); assert.equal(a.room.members[1].team, null);
  assert.equal(r0.members.length, 1, '원본은 그대로');
  // 새로고침: 같은 사람·같은 선수 → 같은 객체
  const same = join(a.room, who(1));
  assert.ok(same.ok); assert.equal(same.room, a.room);
  // 새로고침하며 선수를 바꿈 → 자리(칸)는 그대로, 선수만 갱신
  const moved = move(a.room, 'c1', 0);
  const swapped = join(moved, { clientId: 'c1', num: 150, name: '새' });
  assert.ok(swapped.ok);
  assert.equal(swapped.room.members[1].team, 0); assert.equal(swapped.room.members[1].num, 150);
  assert.equal(swapped.room.rev, moved.rev + 1);
  // 남이 쓰는 선수
  assert.deepEqual(join(a.room, { clientId: 'x', num: 100, name: 'x' }), { ok: false, reason: 'taken' });
  assert.deepEqual(join(a.room, { clientId: 'c1', num: 100, name: 'x' }), { ok: false, reason: 'taken' });
  // 정원
  const full = roomWith(MAX_MEMBERS);
  assert.equal(full.members.length, MAX_MEMBERS);
  assert.deepEqual(join(full, who(50)), { ok: false, reason: 'full' });
  assert.ok(join(full, who(3)).ok, '이미 있는 사람은 정원이 차도 다시 들어온다');
  // 방장이 없는 방
  assert.deepEqual(join(leave(r0, 'c0'), who(2)), { ok: false, reason: 'closed' });
});

test('join — 경기 중 새로고침은 선수를 안 바꾼다', () => {
  const r = setPhase(roomWith(3), 'match');
  const j = join(r, { clientId: 'c1', num: 170, name: '새' });
  assert.ok(j.ok); assert.equal(j.room, r);
});

test('leave', () => {
  const r = roomWith(3);
  const l = leave(r, 'c1');
  assert.deepEqual(l.members.map((m) => m.clientId), ['c0', 'c2']); assert.equal(l.rev, r.rev + 1);
  assert.equal(leave(r, 'nobody'), r);
});

test('pick — 남이 쓰면 그대로, 비면 바뀐다, 로비에서만', () => {
  const r = roomWith(3);
  assert.equal(pick(r, 'c1', 100, '선수0'), r, '남이 쓰는 선수');
  assert.equal(pick(r, 'c1', 101, '선수1'), r, '내 선수 그대로');
  assert.equal(pick(r, 'zz', 130, 'x'), r, '없는 사람');
  const p = pick(r, 'c1', 130, '새이름');
  assert.equal(p.rev, r.rev + 1);
  assert.deepEqual(p.members[1], { clientId: 'c1', num: 130, name: '새이름', team: null });
  assert.equal(pick(setPhase(r, 'match'), 'c1', 130, 'x').members[1].num, 101, '경기 중엔 못 바꾼다');
  const m = setPhase(r, 'match');
  assert.equal(pick(m, 'c1', 130, 'x'), m);
});

// 2026-11-07 "최대 인원 같은거 헥스볼처럼 자유롭게" — perSide 는 "봇으로 채우는 수"가 되어 칸 옮기기를 막지 않는다. 한 편 상한은 6.
test('move — perSide 와 상관없이 옮긴다, 한 편 6명이 상한', () => {
  let r = setSettings(roomWith(8), { perSide: 1 });
  r = move(r, 'c0', 0); r = move(r, 'c1', 0);
  assert.equal(r.members.filter((m) => m.team === 0).length, 2, 'perSide 1 이어도 둘');
  for (let i = 2; i < 6; i++) r = move(r, `c${i}`, 0);
  assert.equal(r.members.filter((m) => m.team === 0).length, MAX_PER_SIDE);
  const full = move(r, 'c6', 0);
  assert.equal(full, r, '6명 찬 칸');
  const other = move(r, 'c6', 1);
  assert.equal(other.members[6].team, 1); assert.equal(other.rev, r.rev + 1);
  assert.equal(move(other, 'c6', 1), other, '같은 칸');
  assert.equal(move(other, 'nobody', 1), other);
  const back = move(other, 'c0', null);
  assert.equal(back.members[0].team, null);
  const again = move(back, 'c7', 0);
  assert.equal(again.members[7].team, 0, '자리가 나면 들어간다');
});

test('setSettings — perSide 0~6·경기장·시간·점수, 칸의 사람은 그대로', () => {
  let r = roomWith(6);
  for (const [i, t] of [[0, 0], [1, 0], [2, 0], [3, 1], [4, 1], [5, 1]]) r = move(r, `c${i}`, t);
  const s = setSettings(r, { perSide: 2 });
  assert.deepEqual(s.members.map((m) => m.team), [0, 0, 0, 1, 1, 1], 'perSide 를 줄여도 사람은 안 빠진다');
  assert.equal(s.settings.perSide, 2); assert.equal(s.rev, r.rev + 1);
  assert.equal(setSettings(s, { perSide: 2 }), s, '같은 값');
  assert.equal(setSettings(s, {}), s);
  const t = setSettings(s, { minutes: 5, scoreLimit: 3 });
  assert.deepEqual(t.settings, { perSide: 2, minutes: 5, scoreLimit: 3, field: 'auto' }); assert.equal(t.members, s.members);
  assert.equal(setSettings(s, { minutes: 999 }).settings.minutes, 10, '범위 밖은 자른다');
  assert.equal(setSettings(s, { perSide: 9 }).settings.perSide, 6);
  assert.equal(setSettings(s, { perSide: -3 }).settings.perSide, 0);
  assert.equal(setSettings(s, { field: 'XL' }).settings.field, 'XL');
  assert.equal(setSettings(s, { field: 'huge' }), s, '모르는 경기장은 무시');
});

test('자동 경기장 — 경기장 위 인원 4·6·10 을 경계로 S·M·L·XL', () => {
  assert.deepEqual([1, 2, 4, 5, 6, 7, 10, 11, 12].map(fieldFor), ['S', 'S', 'S', 'M', 'M', 'L', 'L', 'XL', 'XL']);
  let r = setSettings(roomWith(3), { perSide: 0 });
  r = move(move(r, 'c0', 0), 'c1', 1);
  assert.deepEqual(sideSizes(r), [1, 1]);
  assert.equal(resolveField(r), 'S');
  assert.equal(resolveField(setSettings(r, { perSide: 3 })), 'M');
  assert.equal(resolveField(setSettings(r, { perSide: 5 })), 'L');
  assert.equal(resolveField(setSettings(r, { perSide: 6 })), 'XL');
  assert.equal(resolveField(setSettings(r, { perSide: 6, field: 'S' })), 'S', '고른 크기는 그대로');
  const { config } = buildMatch(setSettings(r, { perSide: 4 }), roster(20), rngFrom(1));
  assert.equal(config.field, 'L', 'buildMatch 가 auto 를 실제 크기로');
});

test('팀 인원 규칙 — 한 편 = max(사람, perSide), 두 편 달라도, 사람 8명 상한, 두 편 0명은 못 시작', () => {
  const rost = roster(30);
  let r = setSettings(roomWith(9), { perSide: 2 });
  for (let i = 0; i < 4; i++) r = move(r, `c${i}`, 0);     // 0 편 사람 4
  r = move(r, 'c4', 1);                                       // 1 편 사람 1 → 봇 1
  const { config, slots } = buildMatch(r, rost, rngFrom(3));
  const side = (t) => config.players.filter((p) => p.side === t);
  assert.equal(side(0).length, 4); assert.equal(side(0).filter((p) => p.bot).length, 0, '사람이 perSide 보다 많은 편은 다 뛴다');
  assert.equal(side(1).length, 2); assert.equal(side(1).filter((p) => p.bot).length, 1);
  assert.deepEqual(config.players.map((p) => p.id), config.players.map((_, i) => i));
  assert.deepEqual(config.players.map((p) => p.side), [0, 0, 0, 0, 1, 1], '0 편 다음 1 편');
  assert.equal(slots.filter(Boolean).length, 5);
  // 사람 9명이면 막힌다
  for (let i = 5; i < 9; i++) r = move(r, `c${i}`, 1);
  assert.equal(r.members.filter((m) => m.team !== null).length, MAX_HUMANS + 1);
  assert.equal(startBlock(r, rost), 'humans');
  assert.throws(() => buildMatch(r, rost, rngFrom(1)), RangeError);
  // 6대6: 사람 8 + 봇 4
  let six = setSettings(roomWith(8), { perSide: 6 });
  for (let i = 0; i < 8; i++) six = move(six, `c${i}`, i % 2);
  const b6 = buildMatch(six, rost, rngFrom(2));
  assert.equal(b6.config.players.length, 12); assert.equal(b6.config.players.filter((p) => p.bot).length, 4);
  assert.equal(b6.config.field, 'XL');
  // 두 편 0명
  const empty = setSettings(roomWith(2), { perSide: 0 });
  assert.equal(startBlock(empty, rost), 'empty');
  assert.throws(() => buildMatch(empty, rost, rngFrom(1)), RangeError);
  // 한 편만 사람 하나, 봇 없음 — 1대0 연습도 된다
  const solo = move(empty, 'c0', 0);
  assert.equal(startBlock(solo, rost), null);
  assert.equal(buildMatch(solo, rost, rngFrom(1)).config.players.length, 1);
});

const sideSum = (r, rost, t) => r.members.filter((m) => m.team === t).reduce((s, m) => {
  const p = rost.find((x) => x.num === m.num);
  return s + p.pace + p.dribble + p.pass + p.shoot + p.defend + p.stamina;
}, 0);

test('autoBalance — 인원 차 1 이하, 합이 비슷하다', () => {
  const rost = roster(20, (i) => 40 + ((i * 37) % 55));
  for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const r = setSettings(roomWith(n), { perSide: 4 });
    const b = autoBalance(r, rost);
    const a = b.members.filter((m) => m.team === 0).length, c = b.members.filter((m) => m.team === 1).length;
    assert.equal(a + c, n, '대기 없음');
    assert.ok(Math.abs(a - c) <= 1, `${n}명: ${a} vs ${c}`);
    if (n >= 4) {
      const diff = Math.abs(sideSum(b, rost, 0) - sideSum(b, rost, 1));
      const each = b.members.map((m) => sideSum({ members: [m] }, rost, m.team));
      assert.ok(diff <= Math.max(...each) - Math.min(...each), `${n}명 합 차 ${diff}`);   // 최선의 나눔은 가장 센 사람과 약한 사람 차 이내
    }
  }
});

test('autoBalance — 사람 8명이 넘치면 대기, 다시 불러도 그대로(2026-11-07: perSide 대신 MAX_HUMANS)', () => {
  const rost = roster(20);
  const r = setSettings(roomWith(10), { perSide: 2 });
  const b = autoBalance(r, rost);
  assert.equal(b.members.filter((m) => m.team !== null).length, 8);
  assert.equal(b.members.filter((m) => m.team === 0).length, 4);
  assert.deepEqual(b.members.slice(8).map((m) => m.team), [null, null]);
  assert.equal(b.rev, r.rev + 1);
  assert.equal(autoBalance(b, rost), b, '이미 나눈 판');
  // 전부 대기였던 1인 방
  assert.notEqual(autoBalance(createRoom('ABCD', who(0)), rost).members[0].team, null);
});

test('autoBalance — 능력치가 극단이어도 약한 사람끼리 몰아넣지 않는다', () => {
  const rost = roster(8, (i) => (i < 2 ? 95 : 40));   // 강 2 · 약 6
  const r = setSettings(roomWith(8), { perSide: 4 });
  const b = autoBalance(r, rost);
  const strong = b.members.filter((m) => m.num < 102).map((m) => m.team);
  assert.notEqual(strong[0], strong[1], '강한 둘은 갈라진다');
});

test('buildMatch — 사람은 자기 선수·편, 봇은 정확히 채움, 중복 없음', () => {
  const rost = roster(20);
  let r = setSettings(roomWith(5), { perSide: 3 });
  r = move(r, 'c0', 0); r = move(r, 'c1', 0); r = move(r, 'c2', 1);   // c3, c4 는 대기(구경)
  const { config, slots } = buildMatch(r, rost, rngFrom(7));
  assert.equal(config.players.length, 6);
  assert.deepEqual(config.players.map((p) => p.id), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(config.players.map((p) => p.side), [0, 0, 0, 1, 1, 1]);
  assert.equal(config.field, 'M'); assert.equal(config.minutes, 3); assert.equal(config.scoreLimit, 0);
  const nums = config.players.map((p) => p.num);
  assert.equal(new Set(nums).size, 6, '중복 없음');
  const held = new Set(r.members.map((m) => m.num));
  for (const p of config.players) {
    const i = config.players.indexOf(p);
    if (p.bot) { assert.equal(slots[i], null); assert.ok(!held.has(p.num), '봇이 방 사람의 선수를 쓰지 않는다'); }
    else {
      const m = r.members.find((x) => x.clientId === slots[i]);
      assert.equal(m.num, p.num); assert.equal(m.team, p.side); assert.equal(p.name, m.name);
    }
    assert.ok(p.perf.maxSpeed > 0);
  }
  assert.deepEqual(slots.filter(Boolean).sort(), ['c0', 'c1', 'c2'], '대기 칸 사람은 slots 에 없다');
  assert.equal(config.players.filter((p) => !p.bot && p.side === 0).length, 2);
  assert.equal(config.players.filter((p) => p.bot && p.side === 1).length, 2);
  // 사람이 뒤(slot 0)를 차지하지 않는다 — 사람 둘이면 slot 1, 2
  assert.equal(slots[0], null);
});

test('buildMatch — 사람 없는 팀·사람 없는 방도 된다, 정원 꽉 찬 팀은 봇 없음', () => {
  const rost = roster(20);
  let r = setSettings(roomWith(2), { perSide: 4 });
  r = move(r, 'c0', 1);
  let b = buildMatch(r, rost, rngFrom(1));
  assert.equal(b.config.players.length, 8);
  assert.ok(b.config.players.slice(0, 4).every((p) => p.bot), '0 편은 전부 봇');
  assert.equal(b.slots.filter(Boolean).length, 1);
  b = buildMatch(roomWith(1), rost, rngFrom(1));
  assert.ok(b.config.players.every((p) => p.bot));
  assert.ok(!b.config.players.some((p) => p.num === 100), '방장은 대기라도 봇으로 안 뽑힌다');
  // 1대1, 2명 모두 사람
  let r2 = setSettings(roomWith(2), { perSide: 1 });
  r2 = move(move(r2, 'c0', 0), 'c1', 1);
  const b2 = buildMatch(r2, rost, rngFrom(1));
  assert.deepEqual(b2.slots, ['c0', 'c1']); assert.ok(b2.config.players.every((p) => !p.bot));
});

test('buildMatch — 같은 난수열이면 같은 결과, 다르면 달라질 수 있다', () => {
  const rost = roster(30);
  const r = setSettings(roomWith(2), { perSide: 4 });
  const a = buildMatch(r, rost, rngFrom(42)), b = buildMatch(r, rost, rngFrom(42));
  assert.deepEqual(a, b);
  const nums = (rr) => rr.config.players.map((p) => p.num).join();
  const variety = new Set([1, 2, 3, 4, 5, 6].map((s) => nums(buildMatch(r, rost, rngFrom(s)))));
  assert.ok(variety.size > 1);
});

test('buildMatch — 명단이 모자라면 RangeError, 방 사람은 명단에 없어도 된다', () => {
  assert.throws(() => buildMatch(roomWith(1), roster(6), rngFrom(1)), RangeError);   // 3대3 봇 6 필요, 명단 6 중 방장 선수 빼면 5
  const ok = buildMatch(setSettings(roomWith(1), { perSide: 4 }), roster(9), rngFrom(1));
  assert.equal(ok.config.players.length, 8);
});

test('변하지 않으면 같은 객체, 변하면 rev + 1', () => {
  const r = roomWith(3);
  const ops = [
    [(x) => leave(x, 'c2'), (x) => leave(x, 'nope')],
    [(x) => pick(x, 'c1', 140, 'n'), (x) => pick(x, 'c1', 100, 'n')],
    [(x) => move(x, 'c1', 0), (x) => move(x, 'c1', null)],
    [(x) => setSettings(x, { minutes: 4 }), (x) => setSettings(x, { minutes: 3 })],
    [(x) => autoBalance(x, roster(20)), (x) => autoBalance(autoBalance(x, roster(20)), roster(20)) === x],
    [(x) => setPhase(x, 'match'), (x) => setPhase(x, 'lobby')],
  ];
  for (const [change, same] of ops.slice(0, 4)) {
    const c = change(r); assert.notEqual(c, r); assert.equal(c.rev, r.rev + 1);
    assert.equal(same(r), r);
  }
  const ab = autoBalance(r, roster(20)); assert.equal(ab.rev, r.rev + 1);
  assert.equal(setPhase(r, 'match').rev, r.rev + 1);
  assert.equal(setPhase(r, 'lobby'), r);
});

// ───────────── 봇 고르기(2026-11-07 "그리고 봇도 선수를 고를 수 있게 해줘") ─────────────
import { setBotPick, updatePicks, NO_PICKS } from '../../src/lib/game/room.ts';
const nums = (rost) => rost.map((p) => p.num);

test('봇 고르기 — 명단의 선수만, 방 사람 선수·겹침(두 편 모두)·한 편 6 초과는 안 된다, 안 바뀌면 같은 객체', () => {
  const rost = roster(20), R = nums(rost);
  const r = roomWith(2);   // c0=100, c1=101
  assert.deepEqual(r.botPicks, [[], []]);
  const a = setBotPick(r, 0, 0, 110, R);
  assert.deepEqual(a.botPicks, [[110], []]); assert.equal(a.rev, r.rev + 1);
  assert.equal(setBotPick(a, 0, 0, 110, R), a, '같은 값');
  assert.equal(setBotPick(a, 0, 1, 999, R), a, '명단에 없음');
  assert.equal(setBotPick(a, 0, 1, 101, R), a, '방 사람이 잡은 선수');
  assert.equal(setBotPick(a, 1, 0, 110, R), a, '다른 편에 이미 있음');
  assert.equal(setBotPick(a, 0, 3, 110, R), a, '같은 편 다른 자리에 이미 있음');
  assert.equal(setBotPick(a, 0, 6, 111, R), a, '자리 번호 범위 밖');
  assert.equal(setBotPick(a, 2, 0, 111, R), a, '편 범위 밖');
  const b = setBotPick(setBotPick(a, 0, 5, 111, R), 1, 0, 112, R);
  assert.deepEqual(b.botPicks, [[110, 111], [112]], '목록 길이보다 뒤 자리면 끝에 붙는다');
  const c = setBotPick(b, 0, 0, 113, R);
  assert.deepEqual(c.botPicks[0], [113, 111], '자리 바꾸기');
  let full = c;
  for (const n of [114, 115, 116, 117]) full = setBotPick(full, 0, 9 - 4, n, R);
  assert.equal(full.botPicks[0].length, 6);
  assert.equal(setBotPick(full, 0, 5, 118, R).botPicks[0].length, 6, '자리 바꾸기는 된다');
  const back = setBotPick(c, 0, 0, null, R);
  assert.deepEqual(back.botPicks[0], [111], 'null = 무작위로 — 뒤의 것이 당겨진다');
  assert.equal(setBotPick(back, 0, 4, null, R), back, '이미 무작위인 자리');
  assert.equal(updatePicks(NO_PICKS, 0, 0, 5, () => false), NO_PICKS);
});

test('봇 고르기 — 사람이 들어오거나 선수를 바꿔 그 선수를 잡으면 봇 목록에서 빠진다', () => {
  const R = nums(roster(20));
  let r = setBotPick(setBotPick(roomWith(2), 0, 0, 110, R), 1, 0, 111, R);
  const j = join(r, { clientId: 'c9', num: 110, name: '선수10' });
  assert.ok(j.ok);
  assert.deepEqual(j.room.botPicks, [[], [111]]);
  const p = pick(j.room, 'c1', 111, '선수11');
  assert.deepEqual(p.botPicks, [[], []]);
  assert.deepEqual(pick(r, 'c1', 115, '선수15').botPicks, r.botPicks, '상관없는 선수면 그대로');
});

test('buildMatch — 고른 봇을 차례대로 쓰고 나머지는 무작위, 못 쓰게 된 것은 건너뜀, 남는 건 안 쓰지만 방에 남는다', () => {
  const rost = roster(30), R = nums(rost);
  let r = setSettings(roomWith(2), { perSide: 3 });
  r = move(r, 'c0', 0);                                    // 0 편 사람 1 → 봇 2, 1 편 봇 3
  for (const [s, n] of [[0, 120], [0, 121], [0, 122], [1, 125]]) r = setBotPick(r, s, 5, n, R);   // 뒤 자리 = 끝에 붙임
  assert.deepEqual(r.botPicks, [[120, 121, 122], [125]]);
  const { config } = buildMatch(r, rost, rngFrom(5));
  const bots = (side) => config.players.filter((p) => p.side === side && p.bot).map((p) => p.num);
  assert.deepEqual(bots(0), [120, 121], '봇 자리 둘 — 고른 차례대로, 셋째는 안 씀');
  assert.equal(bots(1)[0], 125, '1 편 첫 봇은 고른 선수');
  assert.equal(bots(1).length, 3);
  assert.ok(!bots(1).slice(1).some((n) => [120, 121, 125, 100, 101].includes(n)), '나머지 무작위는 고른 선수·방 사람과 안 겹친다');
  assert.ok(!config.players.some((p) => p.num === 122), '남는 고른 선수는 무작위로도 안 나온다(고른 편이 아닌 데서 나오지 않게)');
  assert.deepEqual(r.botPicks[0], [120, 121, 122], '방 상태엔 남는다');
  // 봇으로 채울 수를 늘리면 셋째도 쓰인다
  const more = buildMatch(setSettings(r, { perSide: 4 }), rost, rngFrom(5));
  assert.deepEqual(more.config.players.filter((p) => p.side === 0 && p.bot).map((p) => p.num), [120, 121, 122]);
  // 같은 rnd 면 같은 결과
  assert.deepEqual(buildMatch(r, rost, rngFrom(5)), buildMatch(r, rost, rngFrom(5)));
  // 고른 선수가 명단에서 빠졌으면 건너뛰고 다음 것
  const fewer = rost.filter((p) => p.num !== 120);
  assert.deepEqual(buildMatch(r, fewer, rngFrom(5)).config.players.filter((p) => p.side === 0 && p.bot).map((p) => p.num), [121, 122]);
});

test('buildMatch — 아무것도 안 고르면 예전과 똑같다(난수 순서까지)', () => {
  const rost = roster(30);
  const r = setSettings(roomWith(3), { perSide: 4 });
  const { botPicks: _, ...old } = r;   // botPicks 가 없는 옛 방 모양
  assert.deepEqual(buildMatch(r, rost, rngFrom(11)), buildMatch(old, rost, rngFrom(11)));
});

test('buildMatch — 명단이 빠듯하면 안 쓰인 고른 선수도 무작위로 채운다(시작이 막히지 않는다)', () => {
  const rost = roster(4), R = nums(rost);   // 100~103, 방장 100 은 대기
  let r = setSettings(roomWith(1), { perSide: 1 });   // 봇 둘 필요, 남는 명단 셋
  r = setBotPick(setBotPick(r, 0, 0, 101, R), 0, 1, 102, R);   // 0 편에 둘 골랐지만 자리는 하나
  const { config } = buildMatch(r, rost, rngFrom(1));
  assert.equal(config.players[0].num, 101);
  assert.ok([102, 103].includes(config.players[1].num));
  assert.equal(new Set(config.players.map((p) => p.num)).size, 2);
});
