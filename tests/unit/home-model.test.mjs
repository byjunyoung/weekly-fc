import test from 'node:test';
import assert from 'node:assert/strict';
import { computeHomeSummary, nextMonthOf } from '../../src/react/home/model.ts';

const P = (num, name, pos, over = {}) => ({ num, name, pos, detail: '', foot: '', vest: null, note: '', pace: 70, dribble: 70, pass: 70, shoot: 70, defend: 70, stamina: 70, rot: null, avatar: '', phone: '', ...over });
const players = [P(7, '김민수', 'MF', { rot: 1 }), P(9, '박지훈', 'FW', { pace: 85, dribble: 80, shoot: 88, pass: 70, defend: 40, stamina: 75 }), P(3, '이서준', 'DF')];
const fines = [
  { id: 'f1', date: '2026-09-12', match_id: '', player: '박지훈', type: '지각', amount: 30000, paid: false },
  { id: 'f2', date: '2026-09-05', match_id: '', player: '김민수', type: '노쇼', amount: 50000, paid: true },
];
const rotation = [{ year: 2026, month: 9, p1: '김민수', p2: '이서준', done: false }];
const data = { players, matches: [], rotation, fines, lineups: [] };
const now = new Date(2026, 8, 15); // 2026-09-15, rotation 시트와 같은 달

test('nextMonthOf: 12월 다음은 다음 해 1월', () => {
  assert.deepEqual(nextMonthOf(2026, 9), { y: 2026, mo: 10 });
  assert.deepEqual(nextMonthOf(2026, 12), { y: 2027, mo: 1 });
});

test('computeHomeSummary: 이름을 골랐으면 meTile 이 picked, OVR·포지션 포함', () => {
  const s = computeHomeSummary(data, 9, now);
  assert.deepEqual(s.meTile, { kind: 'picked', ovr: 73, name: '박지훈', pos: 'FW', num: 9 }); // (85+80+88+70+40+75)/6 = 73
});
test('computeHomeSummary: 이름 안 골랐으면 meTile 이 empty', () => {
  assert.deepEqual(computeHomeSummary(data, null, now).meTile, { kind: 'empty' });
});
test('computeHomeSummary: 스쿼드 인원·포지션 요약', () => {
  const s = computeHomeSummary(data, null, now);
  assert.equal(s.squadCount, 3);
  assert.equal(s.posSummary, 'GK 0 · DF 1 · MF 1 · FW 1');
});
test('computeHomeSummary: 이번 달·다음 달 봉사 — 시트 값 우선', () => {
  const s = computeHomeSummary(data, null, now);
  assert.deepEqual(s.duty, { p1: '김민수', p2: '이서준', monthLabel: '2026년 9월', sub: '대관비·조끼·정산' });
  assert.equal(s.dutyNext.monthLabel, '2026년 10월');
});
test('computeHomeSummary: 미납 벌금 합계·건수', () => {
  const s = computeHomeSummary(data, null, now);
  assert.equal(s.unpaidAmount, 30000);
  assert.equal(s.unpaidCount, 1);
});
test('computeHomeSummary: 도장 문구는 인원수만(영상 카운트 없음)', () => {
  assert.equal(computeHomeSummary(data, null, now).stamp, '3명');
});
