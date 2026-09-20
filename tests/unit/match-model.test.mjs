import test from 'node:test';
import assert from 'node:assert/strict';
import { currentVideoId, findVideo, isValidVideoId, videoMeta } from '../../src/react/match/model.ts';

const M = (id, over = {}) => ({ id, date: '2026-09-12', type: '2파전', location: '모란공원', title: '제목', ...over });

test('isValidVideoId: 유튜브 id 모양(글자·숫자·-·_ 11자)만 참', () => {
  assert.equal(isValidVideoId('Om_WSY8poZc'), true);
  assert.equal(isValidVideoId(''), false);
  assert.equal(isValidVideoId('too-short'), false);
  assert.equal(isValidVideoId('열한글자도넘음됨됨됨'), false);
});
test('findVideo: id 로 찾고 없으면 undefined', () => {
  const list = [M('a'), M('b')];
  assert.equal(findVideo(list, 'b'), list[1]);
  assert.equal(findVideo(list, 'z'), undefined);
});
test('videoMeta: 유형·장소를 가운뎃점으로, 둘 다 없으면 빈 문자열', () => {
  assert.equal(videoMeta(M('a')), '2파전 · 모란공원');
  assert.equal(videoMeta(M('a', { type: '' })), '모란공원');
  assert.equal(videoMeta(M('a', { type: '', location: '' })), '');
});
test('currentVideoId: ?v= 값을 읽고 없으면 빈 문자열', () => {
  assert.equal(currentVideoId('?v=abc'), 'abc');
  assert.equal(currentVideoId(''), '');
  assert.equal(currentVideoId('?other=1'), '');
});
