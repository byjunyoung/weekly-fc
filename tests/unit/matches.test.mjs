import test from 'node:test';
import assert from 'node:assert/strict';
import { addDays, applyPotm, attendees, deadline, matchLabel, potmOf, snapshot, vestOf, voteBlock, voteOpen } from '../../src/lib/matches.ts';
import { addGuest, initialTeams, moveTo, playerKey, guestKey, togglePicked } from '../../src/lib/teams.ts';
import { normalizeMatch, normalizeData, EMPTY } from '../../src/lib/api.ts';

const P = (num, name) => ({ num, name, pos: 'MF', detail: '', foot: '', vest: null, note: '',
  pace: 70, dribble: 70, pass: 70, shoot: 70, defend: 70, stamina: 70, rot: null, avatar: '', phone: '' });
const ROSTER = [P(2, '김현서'), P(3, '김준영'), P(4, '이동훈')];
const M = (over = {}) => ({ id: 1, date: '2026-09-27', voters: 0, tally: {},
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
test('voteOpen: 매치 날짜부터 7일째까지 열리고 8일째 닫힌다', () => {
  const m = M();
  assert.equal(deadline(m), '2026-10-04');
  assert.equal(voteOpen(m, '2026-09-27'), true);
  assert.equal(voteOpen(m, '2026-10-04'), true);
  assert.equal(voteOpen(m, '2026-10-05'), false);
  assert.equal(addDays('2026-12-30', 7), '2027-01-06', '해 넘김');
});
test('voteBlock: 마감 → 로그인 → 이름 차지 → 그날 뛴 사람 순으로 이유를 낸다', () => {
  const m = M();
  assert.equal(voteBlock(m, { login: false, num: null }, '2026-10-05'), '투표가 끝났습니다');
  assert.equal(voteBlock(m, { login: false, num: null }, '2026-09-28'), '로그인하면 투표할 수 있습니다');
  assert.equal(voteBlock(m, { login: true, num: null }, '2026-09-28'), '먼저 내 이름을 골라 주세요');
  assert.equal(voteBlock(m, { login: true, num: 4 }, '2026-09-28'), '그날 뛴 사람만 투표합니다');
  assert.equal(voteBlock(m, { login: true, num: 2 }, '2026-09-28'), null);
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
  assert.deepEqual(m, { id: 5, date: '2026-09-27', voters: 2, tally: { 3: 2 },
    lineup: [{ vest: 'none', members: [{ num: 2, name: '김현서' }] }] });
  assert.equal(normalizeMatch({ date: '2026-09-27' }), null, 'id 없으면 버린다');
});
test('normalizeData: matches 가 없어도 빈 배열', () => {
  assert.deepEqual(normalizeData({}).matches, []);
});
