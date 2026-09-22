import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VESTS, MIN_TEAMS, MAX_TEAMS, initialTeams, setTeams, togglePicked, addGuest, removeGuest, moveTo,
  membersOf, autoBalance, teamViews, unassigned, shortName, shareText, restore, serialize, playerKey, guestKey,
} from '../../src/lib/teams.ts';

const P = (num, name, s) => ({ num, name, pos: 'MF', detail: '', foot: '', vest: null, note: '',
  pace: s, dribble: s, pass: s, shoot: s, defend: s, stamina: s, rot: null, avatar: '', phone: '' });
// OVR 이 전부 다른 12명 — 뱀 드래프트가 제대로 도는지 보려면 동점이 없어야 한다.
const ROSTER = Array.from({ length: 12 }, (_, i) => P(i + 1, `선수${i + 1}`, 90 - i * 3));
const pickAll = (n = 12) => ROSTER.slice(0, n).reduce((st, p) => togglePicked(st, p.num), initialTeams());

test('참석 토글 — 빼면 배정도 같이 풀린다 (안 온 사람이 팀에 남으면 안 된다)', () => {
  let st = togglePicked(initialTeams(), 3);
  st = moveTo(st, playerKey(3), 1);
  assert.equal(st.assign[playerKey(3)], 1);
  st = togglePicked(st, 3);
  assert.deepEqual(st.picked, []);
  assert.equal(st.assign[playerKey(3)], undefined);
});

test('팀 수는 2~4 로 묶이고, 줄이면 갈 곳 없는 배정만 풀린다', () => {
  let st = setTeams(pickAll(4), 4);
  st = moveTo(moveTo(st, playerKey(1), 0), playerKey(2), 3);
  st = setTeams(st, 2);
  assert.equal(st.teams, 2);
  assert.equal(st.assign[playerKey(1)], 0, '남는 팀의 배정은 유지');
  assert.equal(st.assign[playerKey(2)], undefined, '없어진 팀의 배정은 해제');
  assert.equal(setTeams(st, 99).teams, MAX_TEAMS);
  assert.equal(setTeams(st, 0).teams, MIN_TEAMS);
});

test('용병 — 이름만으로 넣고, 빼면 배정도 같이 사라진다. 빈 이름은 무시', () => {
  let st = addGuest(initialTeams(), 'a', '오준 용병');
  st = addGuest(st, 'b', '   ');
  assert.deepEqual(st.guests.map((g) => g.name), ['오준 용병']);
  st = moveTo(st, guestKey('a'), 2);
  st = removeGuest(st, 'a');
  assert.deepEqual(st.guests, []);
  assert.equal(st.assign[guestKey('a')], undefined);
});

test('membersOf — 명단 선수 다음에 용병, 용병은 능력치가 없다', () => {
  const st = addGuest(pickAll(3), 'g1', '용병');
  const ms = membersOf(st, ROSTER);
  assert.deepEqual(ms.map((m) => m.name), ['선수1', '선수2', '선수3', '용병']);
  assert.equal(ms[3].ovr, null);
  assert.equal(ms[0].ovr, 90);
});

test('자동 배치 — 뱀 드래프트라 팀 평균이 고르게 모인다', () => {
  const st = autoBalance(setTeams(pickAll(12), 3), ROSTER);
  const views = teamViews(st, ROSTER);
  assert.deepEqual(views.map((v) => v.members.length), [4, 4, 4], '인원이 고르지 않다');
  const avgs = views.map((v) => v.avg);
  assert.ok(Math.max(...avgs) - Math.min(...avgs) <= 2, `팀 평균이 벌어졌다: ${avgs}`);
  // 1·2·3순위가 서로 다른 팀으로 갈린다 — 뱀 드래프트의 핵심.
  const top3 = [1, 2, 3].map((n) => st.assign[playerKey(n)]);
  assert.equal(new Set(top3).size, 3, `상위 셋이 같은 팀에 몰렸다: ${top3}`);
});

test('자동 배치 — 인원이 안 맞아떨어져도 팀 평균이 2 이내로 모인다 (밸붕 방지)', () => {
  // 뱀 드래프트만으로는 10명·3팀에서 84/86/79 까지 벌어졌다 — 맞바꿈으로 다듬는 단계가 이걸 막는다.
  for (const [n, t] of [[10, 3], [11, 2], [9, 4], [7, 3], [12, 3], [5, 2]]) {
    let st = setTeams(initialTeams(), t);
    for (let i = 1; i <= n; i++) st = togglePicked(st, i);
    const views = teamViews(autoBalance(st, ROSTER), ROSTER).filter((v) => v.members.length > 0);
    const avgs = views.map((v) => v.avg);
    assert.ok(Math.max(...avgs) - Math.min(...avgs) <= 2, `${n}명 ${t}팀: 평균이 벌어졌다 ${avgs}`);
    // 머릿수는 다듬기 뒤에도 그대로여야 한다(맞바꿈이라 사람 수는 안 움직인다).
    const sizes = views.map((v) => v.members.length);
    assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1, `${n}명 ${t}팀: 인원이 벌어졌다 ${sizes}`);
  }
});

test('자동 배치 — 같은 입력이면 같은 결과다 (결정적)', () => {
  const st = setTeams(addGuest(pickAll(7), 'g1', '용병'), 3);
  assert.deepEqual(autoBalance(st, ROSTER).assign, autoBalance(st, ROSTER).assign);
});

test('자동 배치 — 용병은 머릿수가 적은 팀부터 채운다', () => {
  let st = setTeams(pickAll(4), 3);        // 명단 4명 → 2·1·1
  st = addGuest(addGuest(st, 'g1', '용병1'), 'g2', '용병2');
  const views = teamViews(autoBalance(st, ROSTER), ROSTER);
  assert.deepEqual(views.map((v) => v.members.length).sort(), [2, 2, 2], '머릿수가 안 맞는다');
});

test('자동 배치 — 사람이 팀 수보다 적어도 안 죽고, 한 명씩 흩어진다', () => {
  const views = teamViews(autoBalance(setTeams(pickAll(2), 4), ROSTER), ROSTER);
  assert.deepEqual(views.map((v) => v.members.length), [1, 1, 0, 0]);
});

test('teamViews 평균은 능력치 있는 사람만으로 — 용병이 평균을 끌어내리지 않는다', () => {
  let st = setTeams(togglePicked(initialTeams(), 1), 2);   // OVR 90 한 명
  st = addGuest(st, 'g1', '용병');
  st = moveTo(moveTo(st, playerKey(1), 0), guestKey('g1'), 0);
  const [t0] = teamViews(st, ROSTER);
  assert.equal(t0.members.length, 2);
  assert.equal(t0.avg, 90, '용병이 평균 계산에 섞였다');
});

test('아직 안 정한 사람은 unassigned 로 남는다', () => {
  const st = moveTo(pickAll(3), playerKey(1), 0);
  assert.deepEqual(unassigned(st, ROSTER).map((m) => m.name), ['선수2', '선수3']);
});

test('shortName — 성을 뗀다(김현서 → 현서), 두 글자는 그대로', () => {
  assert.equal(shortName('김현서'), '현서');
  assert.equal(shortName('이동훈'), '동훈');
  assert.equal(shortName('민수'), '민수');
  assert.equal(shortName(''), '');
});

test('shareText — 카톡에 손으로 적던 모양 그대로', () => {
  let st = setTeams(initialTeams(), 2);
  for (const n of [1, 2, 3]) st = togglePicked(st, n);
  st = addGuest(st, 'g1', '오준 용병+2');
  st = moveTo(st, playerKey(1), 0);
  st = moveTo(st, playerKey(2), 1);
  st = moveTo(st, playerKey(3), 1);
  st = moveTo(st, guestKey('g1'), 0);
  assert.equal(shareText(st, ROSTER), [
    '[노란조끼팀]', '수1 / 오준 용병+2', '', '[주황조끼팀]', '수2 / 수3',
  ].join('\n'));
});

test('shareText — 빈 팀은 빼고 낸다', () => {
  let st = setTeams(togglePicked(initialTeams(), 1), 3);
  st = moveTo(st, playerKey(1), 2);
  assert.equal(shareText(st, ROSTER), '[야광조끼팀]\n수1');
});

test('조끼 이름은 팀 수만큼 있다', () => {
  assert.equal(VESTS.length, MAX_TEAMS);
  assert.equal(new Set(VESTS.map((v) => v.label)).size, VESTS.length, '같은 이름이 둘');
});

test('restore — 왕복이 되고, 명단에서 빠진 번호·범위 밖 팀은 조용히 버린다', () => {
  let st = setTeams(pickAll(3), 2);
  st = addGuest(st, 'g1', '용병');
  st = moveTo(moveTo(st, playerKey(1), 0), guestKey('g1'), 1);
  assert.deepEqual(restore(serialize(st), ROSTER), st);

  // 명단에 없는 99번, 없는 팀 5, 깨진 용병
  const dirty = JSON.stringify({ teams: 2, picked: [1, 99], guests: [{ id: 'g1', name: '용병' }, { nope: 1 }],
    assign: { p1: 0, p99: 1, g1: 5, zz: 0 } });
  const got = restore(dirty, ROSTER);
  assert.deepEqual(got.picked, [1]);
  assert.deepEqual(got.guests, [{ id: 'g1', name: '용병' }]);
  assert.deepEqual(got.assign, { p1: 0 }, '버려야 할 배정이 남았다');
});

test('restore — 빈 값·깨진 JSON 은 기본 상태', () => {
  assert.deepEqual(restore(null, ROSTER), initialTeams());
  assert.deepEqual(restore('{{{', ROSTER), initialTeams());
  assert.deepEqual(restore('"문자열"', ROSTER), initialTeams());
});
