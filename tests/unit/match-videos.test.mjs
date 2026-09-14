import test from 'node:test';
import assert from 'node:assert/strict';
import { matchVideos } from '../../src/lib/match-videos.ts';

const V = (id, title, published = '') => ({ id, title, published });

test('제목에서 날짜·유형·장소를 읽고 최신순으로 늘어놓는다', () => {
  const out = matchVideos([V('a', '260822 | 위클리FC 2파전 | 위례공원', '2026-08-23'), V('b', '260905 | 위클리FC 풋살 3파전', '2026-09-06')]);
  assert.deepEqual(out.map((m) => m.id), ['b', 'a']);
  assert.deepEqual(out[1], { id: 'a', date: '2026-08-22', type: '2파전', location: '위례공원', title: '260822 | 위클리FC 2파전 | 위례공원' });
});

test('제목 형식이 아니면 게시일과 제목을 그대로 쓴다', () => {
  const [m] = matchVideos([V('c', '아크로바틱 너프좀요', '2026-07-01')]);
  assert.deepEqual(m, { id: 'c', date: '2026-07-01', type: '', location: '', title: '아크로바틱 너프좀요' });
});

test('id 없는 영상은 버리고 같은 id 는 한 번만', () => {
  const out = matchVideos([V('', '260912 | 2파전'), V('d', '260912 | 2파전'), V('d', '260912 | 2파전')]);
  assert.deepEqual(out.map((m) => m.id), ['d']);
});

test('날짜가 같으면 id 순으로 고정', () => {
  const out = matchVideos([V('z', '260912 | 2파전'), V('y', '260912 | 3파전')]);
  assert.deepEqual(out.map((m) => m.id), ['y', 'z']);
});

test('빈 목록', () => {
  assert.deepEqual(matchVideos([]), []);
});
