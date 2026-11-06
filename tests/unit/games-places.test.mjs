// 기록 게임(프리킥·드리블, 2D·3D가 같이 쓰는 결과 상자)의 등수 — 같은 결과는 같은 등수(2026-11-07 합치기).
import test from 'node:test';
import assert from 'node:assert/strict';
import { placesBy, placeWord, topWord, topName, tiedAt } from '../../src/lib/games/places.ts';
import { fkPlaces, fkRanking } from '../../src/lib/games/freekick2d.ts';
import { drPlaces, drRanking } from '../../src/lib/games/dribble2d.ts';
import { dr3Places, dr3Ranking } from '../../src/lib/games/dribble3d.ts';

test('등수 = 1 + 확실히 나은 사람 수, 머리말은 혼자 1등만 "1등!"', () => {
  const pl = placesBy(4, (a, b) => [5, 3, 3, 1][b] - [5, 3, 3, 1][a]);
  assert.deepEqual(pl, [1, 2, 2, 4]);
  assert.equal(placeWord(pl, 0), '1등!');
  assert.equal(placeWord(pl, 1), '공동 2등');
  assert.equal(placeWord(pl, 3), '4등');
  assert.equal(topWord(pl, '가'), '가 1등');
  const tie = [1, 1, 3];
  assert.equal(placeWord(tie, 0), '공동 1등');
  assert.equal(placeWord(tie, 1), '공동 1등');
  assert.equal(topWord(tie, '가'), '공동 1등 2명');
  assert.equal(topName(tie, '가'), '가 외 1명');
  assert.equal(tiedAt(tie, 1), 2);
});

test('프리킥 — 0점 둘은 둘 다 공동 1등(방장을 세우지 않는다), 같은 점수는 골 수가 달라도 같은 등수, 나간 사람은 아래', () => {
  const none = [{ kicker: 0, spot: 0, out: 'miss' }, { kicker: 1, spot: 0, out: 'save' }];
  assert.deepEqual(fkPlaces([0, 0], none), [1, 1]);
  assert.equal(placeWord(fkPlaces([0, 0], none), 0), '공동 1등');
  assert.equal(placeWord(fkPlaces([0, 0], none), 1), '공동 1등');
  // 3점 = 3점짜리 하나 vs 1점 + 2점 — 줄 차례는 골 많은 쪽이 위, 등수는 같다
  const log = [{ kicker: 0, spot: 3, out: 'goal' }, { kicker: 1, spot: 0, out: 'goal' }, { kicker: 1, spot: 1, out: 'goal' }, { kicker: 2, spot: 0, out: 'miss' }];
  assert.deepEqual(fkRanking([3, 3, 0], log), [1, 0, 2]);
  assert.deepEqual(fkPlaces([3, 3, 0], log), [1, 1, 3]);
  // 나간 사람(0점)과 남은 사람(0점) — 남은 사람이 혼자 1등
  const gone = [{ kicker: 0, spot: 0, out: 'miss' }, { kicker: 1, spot: 0, out: 'gone' }];
  assert.deepEqual(fkPlaces([0, 0], gone), [1, 2]);
  assert.equal(placeWord(fkPlaces([0, 0], gone), 0), '1등!');
});

test('드리블(2D·3D) — 같은 기록·둘 다 못 하고 같은 문이면 같은 등수, 나간 레인은 아래', () => {
  const L = (fin, pen, gate, gone = false) => ({ fin, pen, gate, gone });
  const s = { lanes: [L(600, 1, 5), L(660, 0, 5), L(-1, 0, 2), L(-1, 0, 2), L(-1, 0, 2, true)] };   // 600틱 + 콘 1 = 660틱 = 11초 둘
  assert.deepEqual(drPlaces(s), [1, 1, 3, 3, 5]);
  assert.deepEqual(drRanking(s), [0, 1, 2, 3, 4]);
  assert.equal(placeWord(drPlaces(s), 1), '공동 1등');
  assert.equal(placeWord(drPlaces(s), 3), '공동 3등');
  assert.equal(placeWord(drPlaces(s), 4), '5등');
  // 아무도 못 했고 문도 같음 — 모두 공동 1등
  assert.deepEqual(drPlaces({ lanes: [L(-1, 0, 0), L(-1, 0, 0)] }), [1, 1]);
  assert.deepEqual(dr3Places(s), drPlaces(s));
  assert.deepEqual(dr3Ranking(s), drRanking(s));
});
