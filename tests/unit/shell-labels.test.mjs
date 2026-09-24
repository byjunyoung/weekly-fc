import test from 'node:test';
import assert from 'node:assert/strict';
import { adminLabel, meLabel, pickOrder } from '../../src/react/shell/labels.ts';

const P = (num, name) => ({ num, name });
test('meLabel: 고른 번호의 이름, 없거나 명단에 없으면 "이름"', () => {
  assert.equal(meLabel([P(7, '김'), P(9, '박')], 9), '박');
  assert.equal(meLabel([P(7, '김')], 3), '이름');
  assert.equal(meLabel([], null), '이름');
});
test('adminLabel', () => {
  assert.equal(adminLabel(true), '관리자 모드 끄기');
  assert.equal(adminLabel(false), '관리자');
});
test('pickOrder 는 번호순이고 원본을 바꾸지 않는다', () => {
  const src = [P(9, '박'), P(2, '이'), P(7, '김')];
  assert.deepEqual(pickOrder(src).map((p) => p.num), [2, 7, 9]);
  assert.deepEqual(src.map((p) => p.num), [9, 2, 7]);
});
