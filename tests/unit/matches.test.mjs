import test from 'node:test';
import assert from 'node:assert/strict';
import { fromMatch, isVideoUrl, matchLabel, snapshot, vestOf } from '../../src/lib/matches.ts';
import { addGuest, initialTeams, moveTo, playerKey, guestKey, togglePicked } from '../../src/lib/teams.ts';
import { normalizeMatch, normalizeData, EMPTY } from '../../src/lib/api.ts';

const P = (num, name) => ({ num, jersey: num, name, pos: 'MF', detail: '', foot: '', vest: null, note: '',
  pace: 70, dribble: 70, pass: 70, shoot: 70, defend: 70, stamina: 70, rot: null, avatar: '', phone: '' });
const ROSTER = [P(2, '김현서'), P(3, '김준영'), P(4, '이동훈')];
const M = (over = {}) => ({ id: 1, date: '2026-09-27', video: '',
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
// ── 서버 응답 정규화 ──────────────────────────────────────────
test('normalizeMatch: 모르는 조끼·이름 없는 사람은 버린다', () => {
  const m = normalizeMatch({ id: '5', date: '2026-09-27T00:00:00',
    lineup: [{ vest: 'none', members: [{ num: '2', name: ' 김현서 ' }, { name: '' }] }, { vest: 'pink', members: [{ name: 'x' }] }, { vest: 'neon', members: [] }],
  });
  assert.deepEqual(m, { id: 5, date: '2026-09-27', video: '', opponent: '', scoreUs: null, scoreThem: null,
    lineup: [{ vest: 'none', members: [{ num: 2, name: '김현서' }] }] });
  const ext = normalizeMatch({ id: 7, opponent: ' FC A ', score_us: 3, score_them: '2' });
  assert.deepEqual([ext.opponent, ext.scoreUs, ext.scoreThem], ['FC A', 3, 2]);
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

test('상대팀 매치 — 결과·전적·우리 팀 하나 스냅샷(2026-09-28)', async () => {
  const M2 = await import('../../src/lib/matches.ts');
  const base = { lineup: [], video: '' };
  const ms = [
    { ...base, id: 1, date: '2026-09-01', opponent: 'FC A', scoreUs: 3, scoreThem: 2 },
    { ...base, id: 2, date: '2026-09-08', opponent: 'FC B', scoreUs: 1, scoreThem: 1 },
    { ...base, id: 3, date: '2026-09-15', opponent: 'FC C', scoreUs: 0, scoreThem: 2 },
    { ...base, id: 4, date: '2026-09-22', opponent: 'FC D', scoreUs: null, scoreThem: null },
    { ...base, id: 5, date: '2026-09-26', opponent: '', scoreUs: null, scoreThem: null },
  ];
  assert.deepEqual(ms.map(M2.resultOf), ['W', 'D', 'L', null, null]);
  assert.deepEqual(M2.record(ms), { w: 1, d: 1, l: 1, gf: 4, ga: 5, played: 3 });
  const players = [{ num: 2, jersey: 2, name: '김준영', pos: 'DF', detail: '', foot: '', vest: null, note: '', rot: null, avatar: '', pace: 70, dribble: 70, pass: 70, shoot: 70, defend: 70, stamina: 70 }];
  const st = { teams: 2, picked: [2], guests: [{ id: 'g', name: '용병A' }], assign: {} };
  const snap = M2.snapshotSquad(st, players);
  assert.equal(snap.ok, true);
  assert.equal(snap.lineup.length, 1);
  assert.deepEqual(snap.lineup[0].members.map((m) => m.name), ['김준영', '용병A']);
  assert.equal(M2.snapshotSquad({ teams: 2, picked: [], guests: [], assign: {} }, players).ok, false);
});
