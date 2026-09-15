import test from 'node:test';
import assert from 'node:assert/strict';
import { amountFor, byAmount, byDate, byPaid, byPlayer, byType, changeRotation, dutyNameOptions, emptyDraft, isCurrentMonth, newFine, togglePaid, unpaidRows, yearOptions } from '../../src/react/rules/model.ts';

const F = (id, player, amount, paid, date = '2026-09-05', type = '지각') => ({ id, date, match_id: '', player, type, amount, paid });
const P = (num, name) => ({ num, name });
const R = (year, month, p1 = '김', p2 = '박', done = false) => ({ year, month, p1, p2, done });

test('unpaidRows: 미납 있는 사람만, 미납액 많은 순·같으면 이름순, 명단에 없으면 num=null', () => {
  const fines = [F('1', '김', 30000, false), F('2', '박', 50000, false), F('3', '김', 30000, true), F('4', '이', 30000, false), F('5', '최', 30000, true), F('6', '퇴단', 30000, false), F('7', '박', 0, false)];
  assert.deepEqual(unpaidRows(fines, [P(7, '김'), P(9, '박'), P(3, '이'), P(5, '최')]), [
    { name: '박', unpaid: 50000, count: 2, num: 9 },
    { name: '김', unpaid: 30000, count: 1, num: 7 },
    { name: '이', unpaid: 30000, count: 1, num: 3 },
    { name: '퇴단', unpaid: 30000, count: 1, num: null },
  ]);
});
test('unpaidRows: 미납이 없거나 미납액이 0이면 빈 배열', () => {
  assert.deepEqual(unpaidRows([F('1', '김', 30000, true)], [P(7, '김')]), []);
  assert.deepEqual(unpaidRows([F('1', '김', 0, false)], [P(7, '김')]), []);
});
test('amountFor: 규칙 금액', () => {
  assert.equal(amountFor('지각'), 30000);
  assert.equal(amountFor('노쇼'), 50000);
});
test('emptyDraft: 오늘·첫 선수·지각·지각 금액, 명단이 비면 이름 빈칸', () => {
  assert.deepEqual(emptyDraft('2026-09-15', [P(7, '김'), P(9, '박')]), { date: '2026-09-15', player: '김', type: '지각', amount: 30000 });
  assert.equal(emptyDraft('2026-09-15', []).player, '');
});
test('newFine: id 는 시각 문자열, 경기 연결 없음, 미납으로 시작', () => {
  assert.deepEqual(newFine({ date: '2026-09-15', player: '박', type: '노쇼', amount: 50000 }, 1789000000000),
    { id: '1789000000000', date: '2026-09-15', match_id: '', player: '박', type: '노쇼', amount: 50000, paid: false });
});
test('togglePaid: 납부 뒤집기, 원본은 그대로', () => {
  const f = F('1', '김', 30000, false);
  assert.equal(togglePaid(f).paid, true);
  assert.equal(togglePaid(togglePaid(f)).paid, false);
  assert.equal(f.paid, false);
});
test('정렬 비교: 날짜·이름(한국어 순)·유형·금액·납부', () => {
  const a = F('1', '이', 50000, true, '2026-09-12', '지각');
  const b = F('2', '김', 30000, false, '2026-09-05', '노쇼');
  assert.ok(byDate(a, b) > 0);
  assert.ok(byPlayer(a, b) > 0);
  assert.ok(byType(a, b) > 0);
  assert.ok(byAmount(a, b) > 0);
  assert.ok(byPaid(a, b) > 0);
  for (const cmp of [byDate, byPlayer, byType, byAmount, byPaid]) assert.equal(cmp(a, a), 0);
});
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
