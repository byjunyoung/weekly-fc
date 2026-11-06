import test from 'node:test';
import assert from 'node:assert/strict';
import { changeRotation, dutyNameOptions, isCurrentMonth, yearOptions } from '../../src/react/rules/model.ts';

const R = (year, month, p1 = '김', p2 = '박', done = false) => ({ year, month, p1, p2, done });

test('yearOptions: 앞뒤 한 해씩', () => assert.deepEqual(yearOptions(2026), [2025, 2026, 2027]));
test('dutyNameOptions: 명단에 없는 저장값만 맨 앞에 끼운다', () => {
  assert.deepEqual(dutyNameOptions(['김', '박'], '박'), ['김', '박']);
  assert.deepEqual(dutyNameOptions(['김', '박'], '퇴단'), ['퇴단', '김', '박']);
  assert.deepEqual(dutyNameOptions(['김', '박'], ''), ['김', '박']);
});
test('changeRotation: 한 칸만 바꾸고 원본은 그대로', () => {
  const r = R(2026, 9);
  assert.deepEqual(changeRotation(r, 'p2', '이'), { ...r, p2: '이' });
  assert.deepEqual(changeRotation(r, 'done', true), { ...r, done: true });
  assert.equal(r.p2, '박');
  assert.equal(r.done, false);
});
test('isCurrentMonth: 해·달이 모두 같을 때만', () => {
  const now = new Date(2026, 8, 15);
  assert.equal(isCurrentMonth(R(2026, 9), now), true);
  assert.equal(isCurrentMonth(R(2025, 9), now), false);
  assert.equal(isCurrentMonth(R(2026, 8), now), false);
});
