import test from 'node:test';
import assert from 'node:assert/strict';
import { playerFormDefaults, playerFromForm } from '../../src/react/player/model.ts';

const P = (num, name, over = {}) => ({ num, jersey: num, name, pos: 'MF', detail: '', foot: '', vest: null, note: '', pace: 70, dribble: 70, pass: 70, shoot: 70, defend: 70, stamina: 70, rot: null, avatar: '', phone: '', ...over });

test('playerFormDefaults: 있는 선수는 그 값(전화 없으면 빈칸)', () => {
  const p = P(7, '김민수', { phone: undefined });
  assert.deepEqual(playerFormDefaults(7, p), { num: 7, jersey: 7, name: '김민수', pos: 'MF', detail: '', foot: '', vest: null, rot: null, phone: '', pace: 70, dribble: 70, pass: 70, shoot: 70, defend: 70, stamina: 70, note: '' });
});
test('playerFormDefaults: 새 선수는 번호만 있고 능력치 70', () => {
  assert.deepEqual(playerFormDefaults(15, undefined), { num: 15, jersey: 15, name: '', pos: '', detail: '', foot: '', vest: null, rot: null, phone: '', pace: 70, dribble: 70, pass: 70, shoot: 70, defend: 70, stamina: 70, note: '' });
});

test('playerFormDefaults: 등번호(jersey)는 고유 번호와 따로 실린다', () => {
  assert.equal(playerFormDefaults(7, P(7, '김', { jersey: 31 })).jersey, 31);
});
test('playerFromForm: 앞뒤 공백을 지우고 avatar 는 지금 값을 그대로 옮긴다', () => {
  const v = { num: 7, jersey: 12, name: ' 김민수 ', pos: 'MF', detail: ' 공격형 ', foot: '오른발', vest: 3, rot: 1, phone: '010', pace: 80, dribble: 80, pass: 80, shoot: 80, defend: 80, stamina: 80, note: ' 메모 ' };
  assert.deepEqual(playerFromForm(v, 'f1:h2:s0:e1:k#333a45'), { num: 7, jersey: 12, name: '김민수', pos: 'MF', detail: '공격형', foot: '오른발', vest: 3, note: '메모', rot: 1, pace: 80, dribble: 80, pass: 80, shoot: 80, defend: 80, stamina: 80, phone: '010', avatar: 'f1:h2:s0:e1:k#333a45' });
});
