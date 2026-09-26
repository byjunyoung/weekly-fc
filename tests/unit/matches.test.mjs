import test from 'node:test';
import assert from 'node:assert/strict';
import { addDays, applyPotm, attendees, currentPotm, deadline, fromMatch, potmShareText, isVideoUrl, matchLabel, potmOf, shortDate, snapshot, vestOf, voteBlock, voteOpen } from '../../src/lib/matches.ts';
import { addGuest, initialTeams, moveTo, playerKey, guestKey, togglePicked } from '../../src/lib/teams.ts';
import { normalizeMatch, normalizeData, EMPTY } from '../../src/lib/api.ts';

const P = (num, name) => ({ num, name, pos: 'MF', detail: '', foot: '', vest: null, note: '',
  pace: 70, dribble: 70, pass: 70, shoot: 70, defend: 70, stamina: 70, rot: null, avatar: '', phone: '' });
const ROSTER = [P(2, '김현서'), P(3, '김준영'), P(4, '이동훈')];
const M = (over = {}) => ({ id: 1, date: '2026-09-27', voters: 0, tally: {}, video: '',
  lineup: [{ vest: 'none', members: [{ num: 2, name: '김현서' }, { num: null, name: '오준 용병+2' }] },
           { vest: 'orange', members: [{ num: 3, name: '김준영' }] }], ...over });

// ── 저장 스냅샷 ────────────────────────────────────────────────
test('snapshot: 빈 팀은 빠지고 용병은 num 없이 이름만, 팀 순서는 조끼 순서', () => {
  let st = togglePicked(togglePicked(initialTeams(), 2), 3);
  st = addGuest(st, 'g1', '오준 용병+2');
  st = moveTo(moveTo(moveTo(st, playerKey(2), 0), guestKey('g1'), 0), playerKey(3), 2);  // 1번 팀(주황)은 빈다
  const r = snapshot(st, ROSTER);
  assert.equal(r.ok, true);
  assert.deepEqual(r.lineup, [
    { vest: 'none', members: [{ num: 2, name: '김현서' }, { num: null, name: '오준 용병+2' }] },
    { vest: 'neon', members: [{ num: 3, name: '김준영' }] },
  ]);
});
test('snapshot: 안 정한 사람이 있으면 저장하지 않는다', () => {
  let st = togglePicked(togglePicked(initialTeams(), 2), 3);
  st = moveTo(st, playerKey(2), 0);
  assert.deepEqual(snapshot(st, ROSTER), { ok: false, error: '아직 안 정한 사람이 있습니다' });
});
test('snapshot: 온 사람이 없거나 팀이 하나면 저장하지 않는다', () => {
  assert.deepEqual(snapshot(initialTeams(), ROSTER), { ok: false, error: '온 사람이 없습니다' });
  let st = togglePicked(togglePicked(initialTeams(), 2), 3);
  st = moveTo(moveTo(st, playerKey(2), 1), playerKey(3), 1);
  assert.deepEqual(snapshot(st, ROSTER), { ok: false, error: '팀이 둘 이상이어야 합니다' });
});

// ── POTM ──────────────────────────────────────────────────────
test('potmOf: 최다 득표, 동점이면 공동(번호순), 표가 없으면 빈 배열', () => {
  assert.deepEqual(potmOf(M()), { nums: [], votes: 0 });
  assert.deepEqual(potmOf(M({ tally: { 3: 2, 2: 1 } })), { nums: [3], votes: 2 });
  assert.deepEqual(potmOf(M({ tally: { 3: 2, 2: 2, 4: 1 } })), { nums: [2, 3], votes: 2 });
});
test('attendees 는 용병을 뺀 명단 선수만, 팀 순서대로', () => {
  assert.deepEqual(attendees(M()).map((x) => x.num), [2, 3]);
});
test('voteOpen: 매치 당일만 열린다(2026-09-26)', () => {
  const m = M();
  assert.equal(deadline(m), '2026-09-27');
  assert.equal(voteOpen(m, '2026-09-26'), false, '경기 전날은 닫힘');
  assert.equal(voteOpen(m, '2026-09-27'), true);
  assert.equal(voteOpen(m, '2026-09-28'), false, '다음 날은 닫힘');
  assert.equal(addDays('2026-12-30', 7), '2027-01-06', '해 넘김');
});
test('voteBlock: 경기 전 → 마감 → 로그인 → 이름 차지 → 그날 뛴 사람 순으로 이유를 낸다', () => {
  const m = M();
  assert.equal(voteBlock(m, { login: true, num: 2 }, '2026-09-26'), '경기 뒤에 투표할 수 있습니다');
  assert.equal(voteBlock(m, { login: false, num: null }, '2026-09-28'), '투표는 경기 당일 자정까지였습니다');
  assert.equal(voteBlock(m, { login: false, num: null }, '2026-09-27'), '로그인하면 투표할 수 있습니다');
  assert.equal(voteBlock(m, { login: true, num: null }, '2026-09-27'), '먼저 내 이름을 골라 주세요');
  assert.equal(voteBlock(m, { login: true, num: 4 }, '2026-09-27'), '그날 뛴 사람만 투표합니다');
  assert.equal(voteBlock(m, { login: true, num: 2 }, '2026-09-27'), null);
});
test('matchLabel: 월 일 (요일), 다른 해면 해를 앞에', () => {
  assert.equal(matchLabel('2026-09-27'), '9월 27일 (일)');
  assert.equal(matchLabel('2025-12-06', 2026), '2025년 12월 6일 (토)');
  assert.equal(matchLabel('2026-09-27', 2026), '9월 27일 (일)');
  assert.equal(matchLabel('없음'), '없음');
});
test('vestOf: 모르는 키는 노조끼로', () => {
  assert.equal(vestOf('orange').label, '주황조끼');
  assert.equal(vestOf('zzz').key, 'none');
});
test('applyPotm 은 그 매치의 집계만 바꾸고 원본은 건드리지 않는다', () => {
  const d = { ...EMPTY, matches: [M(), M({ id: 2, date: '2026-09-20' })] };
  const out = applyPotm(d, 2, { 3: 1 }, 1);
  assert.deepEqual(out.matches[1].tally, { 3: 1 });
  assert.equal(out.matches[1].voters, 1);
  assert.deepEqual(d.matches[1].tally, {});
  assert.equal(out.matches[0], d.matches[0]);
});

// ── 서버 응답 정규화 ──────────────────────────────────────────
test('normalizeMatch: 모르는 조끼·이름 없는 사람은 버리고, 집계는 숫자 키로', () => {
  const m = normalizeMatch({ id: '5', date: '2026-09-27T00:00:00', voters: '2',
    lineup: [{ vest: 'none', members: [{ num: '2', name: ' 김현서 ' }, { name: '' }] }, { vest: 'pink', members: [{ name: 'x' }] }, { vest: 'neon', members: [] }],
    tally: { '3': 2, '0': 1, '2': '0' } });
  assert.deepEqual(m, { id: 5, date: '2026-09-27', voters: 2, tally: { 3: 2 }, video: '',
    lineup: [{ vest: 'none', members: [{ num: 2, name: '김현서' }] }] });
  assert.equal(normalizeMatch({ id: 6, video: ' https://youtu.be/x ' }).video, 'https://youtu.be/x');
  assert.equal(normalizeMatch({ date: '2026-09-27' }), null, 'id 없으면 버린다');
});
test('normalizeData: matches 가 없어도 빈 배열', () => {
  assert.deepEqual(normalizeData({}).matches, []);
});

test('isVideoUrl — http(s) 로 시작하는 한 덩어리만', () => {
  assert.equal(isVideoUrl('https://youtu.be/abc'), true);
  assert.equal(isVideoUrl(' http://youtube.com/watch?v=1 '), true);
  assert.equal(isVideoUrl('youtu.be/abc'), false);
  assert.equal(isVideoUrl(''), false);
  assert.equal(isVideoUrl('https://a b'), false);
});

test('shortDate — 9/27, 깨진 값은 그대로', () => {
  assert.equal(shortDate('2026-09-27'), '9/27');
  assert.equal(shortDate('2026-12-06'), '12/6');
  assert.equal(shortDate('없음'), '없음');
});

test('currentPotm — 표가 있는 가장 최근 매치의 1위(공동 포함). 더 새 매치라도 표가 없으면 건너뛴다', () => {
  assert.equal(currentPotm([]), null);
  assert.equal(currentPotm([M()]), null, '표 없음');
  const older = M({ id: 1, date: '2026-09-20', tally: { 2: 3 } });
  const newerNoVotes = M({ id: 2, date: '2026-09-27' });
  assert.deepEqual(currentPotm([newerNoVotes, older]), { date: '2026-09-20', matchId: 1, nums: [2], votes: 3 });
  const newerVoted = M({ id: 3, date: '2026-09-27', tally: { 3: 1, 2: 1 } });
  assert.deepEqual(currentPotm([older, newerVoted]), { date: '2026-09-27', matchId: 3, nums: [2, 3], votes: 1 }, '캐시 순서와 무관, 공동');
  const sameDay = M({ id: 4, date: '2026-09-27', tally: { 2: 2 } });
  assert.equal(currentPotm([newerVoted, sameDay]).matchId, 4, '같은 날이면 id 큰 쪽');
});

test('fromMatch — 저장된 매치를 팀짜기 상태로: 조끼 순서 칸, 명단에 없는 사람은 이름만 든 용병으로', () => {
  const m = M({ id: 9, lineup: [
    { vest: 'none', members: [{ num: 2, name: '김현서' }, { num: null, name: '오준 용병+2' }] },
    { vest: 'neon', members: [{ num: 3, name: '김준영' }, { num: 1, name: '강준영' }] },   // 1번은 명단에서 빠진 사람
  ] });
  const st = fromMatch(m, ROSTER, (i) => `g${i}`);
  assert.equal(st.teams, 3, '야광조끼(2번 칸)까지 → 3팀');
  assert.deepEqual(st.picked, [2, 3]);
  assert.deepEqual(st.guests, [{ id: 'g0', name: '오준 용병+2' }, { id: 'g1', name: '강준영' }]);
  assert.deepEqual(st.assign, { [playerKey(2)]: 0, [guestKey('g0')]: 0, [playerKey(3)]: 2, [guestKey('g1')]: 2 });
  // 되돌린 상태를 다시 스냅샷하면 같은 팀 구성(용병은 이름만)
  const snap = snapshot(st, ROSTER);
  assert.equal(snap.ok, true);
  assert.deepEqual(snap.lineup.map((t) => [t.vest, t.members.map((x) => x.name)]), [['none', ['김현서', '오준 용병+2']], ['neon', ['김준영', '강준영']]]);
});

test('potmShareText — 담백하게 두 줄, 링크는 빈 줄 뒤 마지막 줄', () => {
  const t = potmShareText(M(), 'https://x/y', 2026);
  assert.deepEqual(t.split('\n'), ['9월 27일 (일) 매치 POTM 투표', '오늘 자정까지, 한 사람만.', '', 'https://x/y']);
  assert.ok(!/[🏆!]/.test(t), '이모지·느낌표 없음');
});
