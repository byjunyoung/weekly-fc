import test from 'node:test';
import assert from 'node:assert/strict';
import { byAmount, byDate, byPaid, byType, numClash, playerFineSummary, playerFormDefaults, playerFromForm } from '../../src/react/player/model.ts';

const P = (num, name, over = {}) => ({ num, name, pos: 'MF', detail: '', foot: '', vest: null, note: '', pace: 70, dribble: 70, pass: 70, shoot: 70, defend: 70, stamina: 70, rot: null, avatar: '', phone: '', ...over });
const F = (id, player, amount, paid, date = '2026-09-05', type = '지각') => ({ id, date, match_id: '', player, type, amount, paid });

test('playerFineSummary: 이 선수 것만, 미납·전체 합계', () => {
  const fines = [F('1', '김', 30000, false), F('2', '박', 50000, false), F('3', '김', 30000, true)];
  assert.deepEqual(playerFineSummary(fines, '김'), { fines: [F('1', '김', 30000, false), F('3', '김', 30000, true)], unpaid: 30000, total: 60000 });
});
test('playerFineSummary: 벌금 없으면 0', () => {
  assert.deepEqual(playerFineSummary([], '김'), { fines: [], unpaid: 0, total: 0 });
});

test('playerFormDefaults: 있는 선수는 그 값(전화 없으면 빈칸)', () => {
  const p = P(7, '김민수', { phone: undefined });
  assert.deepEqual(playerFormDefaults(7, p), { num: 7, name: '김민수', pos: 'MF', detail: '', foot: '', vest: null, rot: null, phone: '', pace: 70, dribble: 70, pass: 70, shoot: 70, defend: 70, stamina: 70, note: '' });
});
test('playerFormDefaults: 새 선수는 번호만 있고 능력치 70', () => {
  assert.deepEqual(playerFormDefaults(15, undefined), { num: 15, name: '', pos: '', detail: '', foot: '', vest: null, rot: null, phone: '', pace: 70, dribble: 70, pass: 70, shoot: 70, defend: 70, stamina: 70, note: '' });
});

test('playerFromForm: 앞뒤 공백을 지우고 avatar 는 지금 값을 그대로 옮긴다', () => {
  const v = { num: 7, name: ' 김민수 ', pos: 'MF', detail: ' 공격형 ', foot: '오른발', vest: 3, rot: 1, phone: '010', pace: 80, dribble: 80, pass: 80, shoot: 80, defend: 80, stamina: 80, note: ' 메모 ' };
  assert.deepEqual(playerFromForm(v, 'f1:h2:s0:e1:k#333a45'), { num: 7, name: '김민수', pos: 'MF', detail: '공격형', foot: '오른발', vest: 3, note: '메모', rot: 1, pace: 80, dribble: 80, pass: 80, shoot: 80, defend: 80, stamina: 80, phone: '010', avatar: 'f1:h2:s0:e1:k#333a45' });
});

test('numClash: 번호를 안 바꾸면 겹침 없음', () => {
  assert.equal(numClash([P(7, '김'), P(9, '박')], 7, 7), undefined);
});
test('numClash: 안 쓰는 번호면 겹침 없음', () => {
  assert.equal(numClash([P(7, '김'), P(9, '박')], 15, 7), undefined);
});
test('numClash: 다른 선수가 쓰는 번호면 그 선수를 돌려준다', () => {
  assert.deepEqual(numClash([P(7, '김'), P(9, '박')], 9, 7), P(9, '박'));
});

test('정렬 비교: 날짜·유형(한국어)·금액·납부', () => {
  const a = F('1', '김', 50000, true, '2026-09-12', '지각');
  const b = F('2', '김', 30000, false, '2026-09-05', '노쇼');
  assert.ok(byDate(a, b) > 0);
  assert.ok(byType(a, b) > 0);
  assert.ok(byAmount(a, b) > 0);
  assert.ok(byPaid(a, b) > 0);
  for (const cmp of [byDate, byType, byAmount, byPaid]) assert.equal(cmp(a, a), 0);
});
