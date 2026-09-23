import test from 'node:test';
import assert from 'node:assert/strict';
import { rotationOrder, computeMonth, rotationFor, yearRows } from '../../src/lib/rotation.ts';

const P = (num, name, rot) => ({ num, name, pos: 'MF', detail: '', foot: '', vest: null, note: '', pace: 0, dribble: 0, pass: 0, shoot: 0, defend: 0, stamina: 0, rot });
const ps = Array.from({ length: 29 }, (_, i) => P(i + 1, `p${i + 1}`, i + 1)).concat([P(99, 'admin', null)]);
const NOW = new Date(2026, 8, 10); // 2026-09-10

test('rotationOrder는 rot>0만, rot 오름차순 이름', () => {
  const o = rotationOrder([P(2, 'b', 2), P(1, 'a', 1), P(3, 'c', null)]);
  assert.deepEqual(o, ['a', 'b']);
});
test('2026-01은 rot 1·2, 02는 3·4', () => {
  assert.deepEqual([computeMonth(ps, 2026, 1, NOW).p1, computeMonth(ps, 2026, 1, NOW).p2], ['p1', 'p2']);
  assert.deepEqual([computeMonth(ps, 2026, 2, NOW).p1, computeMonth(ps, 2026, 2, NOW).p2], ['p3', 'p4']);
});
test('29명이면 2027-03(offset 14)은 p29·p1로 감싼다', () => {
  const r = computeMonth(ps, 2027, 3, NOW);
  assert.deepEqual([r.p1, r.p2], ['p29', 'p1']);
});
test('사이클 시작 이전 달도 음수 offset으로 계산된다', () => {
  const r = computeMonth(ps, 2025, 12, NOW); // offset -1 → i1 = 27
  assert.deepEqual([r.p1, r.p2], ['p28', 'p29']);
});
test('done은 지난 달만 true', () => {
  assert.equal(computeMonth(ps, 2026, 8, NOW).done, true);
  assert.equal(computeMonth(ps, 2026, 9, NOW).done, false);
});
test('명단이 비면 -', () => assert.deepEqual([computeMonth([], 2026, 1, NOW).p1, computeMonth([], 2026, 1, NOW).p2], ['-', '-']));
test('시트 행이 있으면 그 값이 이긴다', () => {
  const r = rotationFor(ps, [{ year: 2026, month: 9, p1: 'p7', p2: '', done: true }], 2026, 9, NOW);
  assert.deepEqual([r.p1, r.p2, r.done], ['p7', computeMonth(ps, 2026, 9, NOW).p2, true]);
});
test('yearRows는 12줄', () => assert.equal(yearRows(ps, [], 2026, NOW).length, 12));

// 운영 규칙 봉사표의 기본 보기 — 이번 달부터 석 달(2026-09-23).
import test2 from 'node:test';
import assert2 from 'node:assert/strict';
import { upcomingRows } from '../../src/lib/rotation.ts';

test2('upcomingRows: 이번 달부터 석 달', () => {
  const r = upcomingRows([], [], new Date(2026, 8, 23));   // 9월
  assert2.deepEqual(r.map((x) => [x.year, x.month]), [[2026, 9], [2026, 10], [2026, 11]]);
});

test2('upcomingRows: 11월이면 다음 해 1월까지 넘어간다', () => {
  const r = upcomingRows([], [], new Date(2026, 10, 5));   // 11월
  assert2.deepEqual(r.map((x) => [x.year, x.month]), [[2026, 11], [2026, 12], [2027, 1]]);
});

test2('upcomingRows: 시트에 적힌 당번을 그대로 쓴다 (계산값보다 시트가 우선)', () => {
  const sheet = [{ year: 2026, month: 10, p1: '가', p2: '나', done: false }];
  const r = upcomingRows([], sheet, new Date(2026, 8, 1));
  assert2.deepEqual([r[1].p1, r[1].p2], ['가', '나']);
});
