import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VESTS, MIN_TEAMS, MAX_TEAMS, initialTeams, setTeams, togglePicked, addGuest, removeGuest, moveTo,
  membersOf, autoBalance, teamViews, unassigned, shortName, shareText, restore, serialize, playerKey, guestKey,
  avgSpread, SPREAD_WARN,
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

test('자동 배치 — 인원이 고르고 상위권이 한 팀에 안 몰린다', () => {
  // 처음엔 이 테스트가 "뱀 드래프트의 핵심"을 지킨다고 적어 놨는데, 순차 배분으로 바꿔도
  // 통과했다(2026-09-22 리뷰의 뮤테이션 M1) — 상위 셋을 흩는 건 순차도 하고, 평균은 뒤따르는
  // 다듬기가 맞춘다. 그래서 **실제로 지키는 것**만 적는다: 인원 균형과 상위권 분산.
  const st = autoBalance(setTeams(pickAll(12), 3), ROSTER);
  const views = teamViews(st, ROSTER);
  assert.deepEqual(views.map((v) => v.members.length), [4, 4, 4], '인원이 고르지 않다');
  const avgs = views.map((v) => v.avg);
  assert.ok(Math.max(...avgs) - Math.min(...avgs) <= 2, `팀 평균이 벌어졌다: ${avgs}`);
  const top3 = [1, 2, 3].map((n) => st.assign[playerKey(n)]);
  assert.equal(new Set(top3).size, 3, `상위 셋이 같은 팀에 몰렸다: ${top3}`);
});

test('자동 배치 — 고른 순서가 달라도 같은 결과다 (동점 타이브레이커)', () => {
  // 실제 명단엔 동점이 많다(70점 7명 등). 정렬 타이브레이커가 없으면 고른 순서에 따라
  // 결과가 갈린다 — 뮤테이션 M14 가 이걸 안 잡았다.
  const tied = Array.from({ length: 8 }, (_, i) => P(i + 1, `동점${i + 1}`, 70));
  const fwd = [1, 2, 3, 4, 5, 6, 7, 8].reduce((st, n) => togglePicked(st, n), setTeams(initialTeams(), 3));
  const rev = [8, 7, 6, 5, 4, 3, 2, 1].reduce((st, n) => togglePicked(st, n), setTeams(initialTeams(), 3));
  assert.deepEqual(autoBalance(fwd, tied).assign, autoBalance(rev, tied).assign);
});

test('moveTo — 범위 밖 팀 번호는 배정을 푼다', () => {
  const st = moveTo(pickAll(2), playerKey(1), 0);
  assert.equal(moveTo(st, playerKey(1), 99).assign[playerKey(1)], undefined);
  assert.equal(moveTo(st, playerKey(1), -1).assign[playerKey(1)], undefined);
  assert.equal(moveTo(st, playerKey(1), null).assign[playerKey(1)], undefined);
});

test('평균 벌어짐 — 용병만 있는 팀은 빼고 잰다 (0 으로 치면 늘 그 팀이 최솟값)', () => {
  let st = setTeams(togglePicked(initialTeams(), 1), 2);   // OVR 90 한 명
  st = addGuest(st, 'g1', '용병');
  st = moveTo(moveTo(st, playerKey(1), 0), guestKey('g1'), 1);
  assert.equal(avgSpread(st, ROSTER), 0, '용병만 있는 팀을 0 으로 쳤다');
});

test('스탯이 전부 빈 선수는 용병과 같은 취급 — 평균을 무너뜨리지 않는다', () => {
  const rookie = P(20, '신입', 0);
  let st = setTeams(initialTeams(), 2);
  for (const n of [1, 2, 20]) st = togglePicked(st, n);
  const ms = membersOf(st, [...ROSTER, rookie]);
  assert.equal(ms.find((m) => m.num === 20).ovr, null, 'OVR 0 이 평균에 섞인다');
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
    '[노조끼팀]', '수1 / 오준 용병+2', '', '[주황조끼팀]', '수2 / 수3',
  ].join('\n'));
});

test('shareText — 짧은 이름이 겹치면 그 사람만 성을 붙인다', () => {
  // 실제 명단에 강준영·김준영, 곽민제·장민제가 있다 — 둘 다 오면 "준영"이 두 팀에 나와
  // 카톡만 보고 누가 어느 팀인지 알 수 없다(2026-09-22 리뷰).
  const dup = [P(1, '강준영', 80), P(2, '김준영', 70), P(3, '이동훈', 75)];
  let st = setTeams(initialTeams(), 2);
  for (const n of [1, 2, 3]) st = togglePicked(st, n);
  st = moveTo(moveTo(moveTo(st, playerKey(1), 0), playerKey(2), 1), playerKey(3), 0);
  const text = shareText(st, dup);
  assert.ok(text.includes('강준영') && text.includes('김준영'), `겹치는 이름에 성이 안 붙었다:\n${text}`);
  assert.ok(text.includes('동훈'), `안 겹치는 이름까지 성이 붙었다:\n${text}`);
});

test('shareText — 빈 팀은 빼고 낸다', () => {
  let st = setTeams(togglePicked(initialTeams(), 1), 3);
  st = moveTo(st, playerKey(1), 2);
  assert.equal(shareText(st, ROSTER), '[야광조끼팀]\n수1');
});

test('조끼 이름은 팀 수만큼 있고, 첫 팀은 사용자가 쓰던 "노조끼"(조끼 안 입는 팀)다', () => {
  assert.equal(VESTS.length, MAX_TEAMS);
  assert.equal(new Set(VESTS.map((v) => v.label)).size, VESTS.length, '같은 이름이 둘');
  // 처음엔 "노란조끼"로 적었다가 사용자 확인으로 바로잡았다(2026-09-22) — 노란색이 아니라
  // 조끼를 안 입는 팀이다. 카톡 원문이 "[노조끼팀]" 이라 텍스트도 그대로 나와야 한다.
  assert.equal(VESTS[0].label, '노조끼');
  assert.deepEqual(VESTS.slice(0, 3).map((v) => v.label), ['노조끼', '주황조끼', '야광조끼']);
});

test('restore — 왕복이 되고, 모양이 깨진 값·범위 밖 팀·모르는 키는 버린다', () => {
  let st = setTeams(pickAll(3), 2);
  st = addGuest(st, 'g1', '용병');
  st = moveTo(moveTo(st, playerKey(1), 0), guestKey('g1'), 1);
  assert.deepEqual(restore(serialize(st)), st);

  const dirty = JSON.stringify({ teams: 2, picked: [1, 'x', null], guests: [{ id: 'g1', name: '용병' }, { nope: 1 }],
    assign: { p1: 0, g1: 5, zz: 0 } });
  const got = restore(dirty);
  assert.deepEqual(got.picked, [1], '숫자가 아닌 번호가 남았다');
  assert.deepEqual(got.guests, [{ id: 'g1', name: '용병' }]);
  assert.deepEqual(got.assign, { p1: 0 }, '범위 밖 팀·모르는 키가 남았다');
});

test('restore — **명단과 대조해 거르지 않는다** (초안이 조용히 지워지던 경로)', () => {
  // useData 가 캐시 → 네트워크로 두 번 값을 준다. 예전엔 첫 값으로 걸러서, 명단이 비었거나
  // 낡으면 초안이 잘린 채 저장됐다(2026-09-22 리뷰가 브라우저에서 재현). 안 온 사람을 거르는
  // 건 화면(membersOf)이 한다 — 저장은 적힌 그대로 보존한다.
  const saved = JSON.stringify({ teams: 3, picked: [2, 7, 99], guests: [{ id: 'g1', name: '용병' }],
    assign: { p2: 0, p7: 1, p99: 2, g1: 2 } });
  const got = restore(saved);
  assert.deepEqual(got.picked, [2, 7, 99], '명단에 없다고 버렸다');
  assert.equal(got.assign.p99, 2, '명단에 없다고 배정을 버렸다');
  // 명단이 비어 있어도 화면에는 안 나온다 — 거르는 자리는 여기다.
  assert.deepEqual(membersOf(got, []).map((m) => m.name), ['용병']);
  // 명단이 오면 그대로 살아난다.
  assert.deepEqual(membersOf(got, ROSTER).map((m) => m.num), [2, 7, null]);
});

test('restore — 빈 값·깨진 JSON 은 기본 상태', () => {
  assert.deepEqual(restore(null), initialTeams());
  assert.deepEqual(restore('{{{'), initialTeams());
  assert.deepEqual(restore('"문자열"'), initialTeams());
});
