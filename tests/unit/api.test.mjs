import test from 'node:test';
import assert from 'node:assert/strict';
import { buildUrl, normalizeMatch, normalizeFine, normalizePlayer, serializeMatch, serializeFine } from '../../src/lib/api.ts';

test('buildUrl은 action과 payload를 쿼리에 싣는다', () => {
  const u = new URL(buildUrl('writeMatch', { pin: '1234', payload: { id: 'x' } }, 'https://example.com/exec'));
  assert.equal(u.searchParams.get('action'), 'writeMatch');
  assert.equal(u.searchParams.get('pin'), '1234');
  assert.equal(JSON.parse(decodeURIComponent(u.searchParams.get('payload'))).id, 'x');
});
test('normalizeMatch: attendees 문자열·teams JSON·날짜를 정리한다', () => {
  const m = normalizeMatch({ id: '2026-09-05', date: '2026-09-05T00:00:00.000Z', type: '3파전', attendees: '김철수, 이영희 ,', teams: '[{"name":"A","players":["김철수"],"points":3}]', winner: 'A' });
  assert.equal(m.date, '2026-09-05');
  assert.deepEqual(m.attendees, ['김철수', '이영희']);
  assert.equal(m.teams[0].points, 3);
  assert.equal(m.type, '3파전');
});
test('normalizeMatch: 깨진 teams는 빈 배열', () => {
  assert.deepEqual(normalizeMatch({ id: '1', teams: '{oops' }).teams, []);
});
test('serializeMatch ↔ normalizeMatch 왕복', () => {
  const m = normalizeMatch({ id: '2026-09-05', date: '2026-09-05', location: '모란공원', youtube: 'abc', type: '2파전', attendees: '김철수, 이영희', teams: '[{"name":"A","players":["김철수"],"points":null}]', winner: '' });
  const s = serializeMatch(m);
  assert.equal(s.attendees, '김철수, 이영희');
  assert.deepEqual(normalizeMatch(s), m);
});
test('normalizeFine: paid 문자열 → boolean, amount 숫자', () => {
  const f = normalizeFine({ id: '1', date: '2026-09-05', player: '김철수', type: '지각', amount: '30000', paid: 'TRUE' });
  assert.equal(f.paid, true); assert.equal(f.amount, 30000);
  assert.equal(serializeFine(f).paid, 'TRUE');
});
test('normalizePlayer: pos 대문자화, 빈 rot는 null, phone은 있을 때만', () => {
  const p = normalizePlayer({ num: '9', name: '김철수', pos: 'mf', rot: '', pace: '80' });
  assert.equal(p.pos, 'MF'); assert.equal(p.rot, null); assert.equal(p.pace, 80); assert.equal('phone' in p, false);
});
