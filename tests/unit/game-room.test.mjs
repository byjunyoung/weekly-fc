import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SETTINGS, MAX_MEMBERS, autoBalance, buildMatch, createRoom, isRoomCode, join, leave, makeRoomCode, move, pick, setPhase, setSettings,
} from '../../src/lib/game/room.ts';
import { rngFrom } from '../../src/react/game/view.ts';

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
  assert.deepEqual(r.settings, { perSide: 3, minutes: 3, scoreLimit: 0 });
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

test('move — perSide 를 지킨다', () => {
  let r = setSettings(roomWith(4), { perSide: 2 });
  r = move(r, 'c0', 0); r = move(r, 'c1', 0);
  const full = move(r, 'c2', 0);
  assert.equal(full, r, '정원 찬 칸');
  const other = move(r, 'c2', 1);
  assert.equal(other.members[2].team, 1); assert.equal(other.rev, r.rev + 1);
  assert.equal(move(other, 'c2', 1), other, '같은 칸');
  assert.equal(move(other, 'nobody', 1), other);
  const back = move(other, 'c0', null);
  assert.equal(back.members[0].team, null);
  const again = move(back, 'c3', 0);
  assert.equal(again.members[3].team, 0, '자리가 나면 들어간다');
});

test('setSettings — perSide 를 줄이면 뒤에 온 사람부터 대기로', () => {
  let r = roomWith(6);
  r = setSettings(r, { perSide: 3 });
  for (const [i, t] of [[0, 0], [1, 0], [2, 0], [3, 1], [4, 1], [5, 1]]) r = move(r, `c${i}`, t);
  const s = setSettings(r, { perSide: 2 });
  assert.deepEqual(s.members.map((m) => m.team), [0, 0, null, 1, 1, null]);
  assert.equal(s.settings.perSide, 2); assert.equal(s.rev, r.rev + 1);
  assert.equal(setSettings(s, { perSide: 2 }), s, '같은 값');
  assert.equal(setSettings(s, {}), s);
  const t = setSettings(s, { minutes: 5, scoreLimit: 3 });
  assert.deepEqual(t.settings, { perSide: 2, minutes: 5, scoreLimit: 3 }); assert.equal(t.members, s.members);
  assert.equal(setSettings(s, { minutes: 999 }).settings.minutes, 10, '범위 밖은 자른다');
  assert.equal(setSettings(s, { perSide: 9 }).settings.perSide, 4);
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

test('autoBalance — 넘치면 대기, 다시 불러도 그대로', () => {
  const rost = roster(20);
  const r = setSettings(roomWith(7), { perSide: 2 });
  const b = autoBalance(r, rost);
  assert.equal(b.members.filter((m) => m.team !== null).length, 4);
  assert.deepEqual(b.members.slice(4).map((m) => m.team), [null, null, null]);
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
  assert.equal(config.perSide, 3); assert.equal(config.minutes, 3); assert.equal(config.scoreLimit, 0);
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
