import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVideoTitle, proposeMatches } from '../../src/lib/parse.ts';

const V = (id, title) => ({ id, title, published: '' });

test('날짜·유형만 있는 제목', () => {
  assert.deepEqual(parseVideoTitle(V('a', '260905 | 위클리FC 풋살 3파전')), { id: 'a', date: '2026-09-05', type: '3파전', location: '', title: '260905 | 위클리FC 풋살 3파전' });
});
test('메모와 장소가 붙은 제목', () => {
  const p = parseVideoTitle(V('b', '260614 | 위클리FC 풋살 2파전 | 쿠키있음 | 모란공원 풋살장'));
  assert.equal(p.type, '2파전'); assert.equal(p.location, '모란공원 풋살장');
});
test('풋살 단어 없이 장소만', () => {
  const p = parseVideoTitle(V('c', '260530 | 위클리FC 3파전 | 모란공원'));
  assert.equal(p.type, '3파전'); assert.equal(p.location, '모란공원');
});
test('날짜 접두사 없으면 null', () => assert.equal(parseVideoTitle(V('d', '아크로바틱 너프좀요')), null));
test('proposeMatches는 시트에 없는 날짜만, 날짜 오름차순, 같은 날 중복 제거', () => {
  const vids = [V('a', '260905 | 위클리FC 3파전'), V('b', '260822 | 위클리FC 2파전 | 위례공원'), V('c', '260822 | 위클리FC 2파전 2부'), V('d', '잡담')];
  const out = proposeMatches(vids, [{ id: '2026-09-05', date: '2026-09-05', location: '', youtube: 'a', type: '3파전', attendees: [], teams: [], winner: '' }]);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0], { id: '2026-08-22', date: '2026-08-22', location: '위례공원', youtube: 'b', type: '2파전', attendees: [], teams: [], winner: '' });
});
