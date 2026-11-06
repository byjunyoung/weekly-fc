import test from 'node:test';
import assert from 'node:assert/strict';
import { jerseyCells, lockedReason } from '../../src/lib/jersey.ts';

// 능력치 v 하나로 만든 선수. 번호(num)와 등번호(jersey)는 따로 준다. v = 0 이면 배치 전.
const P = (num, jersey, v, name = `P${num}`) => ({ num, jersey, name, pos: '', detail: '', foot: '', vest: null, note: '',
  pace: v, dribble: v, pass: v, shoot: v, defend: v, stamina: v, rot: null, avatar: '' });

// 10명: 능력치 90..50 순서라 티어 정원은 S1·A2·B4·C2·D1 — num 1 = S, 2~3 = A, 4~7 = B, 8~9 = C, 10 = D.
const ten = () => [P(1, 11, 90), P(2, 12, 85), P(3, 13, 80), P(4, 14, 75), P(5, 15, 70), P(6, 16, 65), P(7, 17, 60), P(8, 18, 55), P(9, 19, 52), P(10, 20, 50)];
const cell = (cells, n) => cells.find((c) => c.n === n);

test('jerseyCells — 99칸이 한 번씩, 번호 순', () => {
  const cells = jerseyCells(ten(), 5);
  assert.equal(cells.length, 99);
  assert.deepEqual(cells.map((c) => c.n), Array.from({ length: 99 }, (_, i) => i + 1));
});

test('빈 번호는 free, 내 번호는 mine — 고유 번호가 아니라 등번호로 찾는다', () => {
  const c = jerseyCells(ten(), 5);
  assert.deepEqual(cell(c, 7), { n: 7, state: 'free' });
  assert.deepEqual(cell(c, 15), { n: 15, state: 'mine' });
  assert.equal(cell(c, 5).state, 'free', '고유 번호 5 는 등번호가 아니다');
});

test('낮은 티어가 쥔 번호는 steal(맞바꿈) — 주인 이름·티어가 따라온다', () => {
  const c = jerseyCells(ten(), 2);           // A → B 의 14번
  assert.deepEqual(cell(c, 14), { n: 14, state: 'steal', holder: 'P4', holderTier: 'B' });
});

test('같은 티어는 locked', () => {
  const c = jerseyCells(ten(), 2);           // A 와 A
  assert.deepEqual(cell(c, 13), { n: 13, state: 'locked', holder: 'P3', holderTier: 'A' });
});

test('더 높은 티어가 쥔 번호는 locked', () => {
  const c = jerseyCells(ten(), 5);           // B → S
  assert.deepEqual(cell(c, 11), { n: 11, state: 'locked', holder: 'P1', holderTier: 'S' });
});

test('배치 전인 나는 주인 있는 번호를 못 가져온다', () => {
  const ps = [...ten(), P(11, 21, 0)];
  const c = jerseyCells(ps, 11);
  assert.equal(cell(c, 20).state, 'locked', '꼴찌 D 의 번호도 못 가져온다');
  assert.equal(cell(c, 21).state, 'mine');
  assert.equal(cell(c, 50).state, 'free');
});

test('티어 있는 나는 배치 전 선수의 번호를 가져온다', () => {
  const ps = [...ten(), P(11, 21, 0, '새내기')];
  const c = jerseyCells(ps, 10);             // 가장 낮은 티어도
  assert.deepEqual(cell(c, 21), { n: 21, state: 'steal', holder: '새내기', holderTier: null });
});

test('둘 다 배치 전이면 locked', () => {
  const ps = [P(1, 5, 0, '가'), P(2, 6, 0, '나')];
  assert.equal(cell(jerseyCells(ps, 1), 6).state, 'locked');
});

test('관리자는 주인 있는 칸을 전부 steal — 더 높은 티어도, 배치 전인 선수도', () => {
  const ps = [...ten(), P(11, 21, 0)];
  const c = jerseyCells(ps, 11, true);
  for (const n of [11, 12, 20]) assert.equal(cell(c, n).state, 'steal', `${n}번`);
  assert.equal(cell(c, 21).state, 'mine');
  assert.equal(cell(c, 77).state, 'free');
  assert.equal(c.filter((x) => x.state === 'locked').length, 0);
});

test('lockedReason — 서버 거절 문구와 같은 말투', () => {
  const c = cell(jerseyCells(ten(), 5), 11);
  assert.equal(lockedReason(c, 'B'), 'P1 님(S)의 번호 — 내 티어(B)가 더 높아야 가져올 수 있습니다');
  assert.match(lockedReason({ ...c, holderTier: null }, null), /배치 전에는 빈 번호만/);
});
