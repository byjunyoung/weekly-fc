import test from 'node:test';
import assert from 'node:assert/strict';
import { NAV, activeNav } from '../../src/lib/nav.ts';
const at = (p) => { const a = activeNav(p); return [a.top?.label ?? null, a.sub?.label ?? null]; };
test('상단 메뉴는 다섯', () => assert.deepEqual(NAV.map((n) => n.label), ['라커룸', '명단', '매치', '전술', '안내']));
test('activeNav: 경로마다 정확히 하나', () => {
  assert.deepEqual(at('/'), ['라커룸', null]);
  assert.deepEqual(at('/squad/12/'), ['명단', '선수']);
  assert.deepEqual(at('/squad/place/'), ['명단', '선수']);
  assert.deepEqual(at('/matches/'), ['매치', '지난 경기']);
  assert.deepEqual(at('/matches/new/'), ['매치', '지난 경기']);
  assert.deepEqual(at('/lineup/'), ['매치', '라인업 짜기']);
  assert.deepEqual(at('/tier/'), ['명단', '티어']);
  assert.deepEqual(at('/guide/'), ['안내', '시작하기']);
  assert.deepEqual(at('/rules/'), ['안내', '규칙']);
  assert.deepEqual(at('/kit/'), ['안내', '자료']);
  assert.deepEqual(at('/stats/'), [null, null]);
});
