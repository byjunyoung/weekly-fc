import test from 'node:test';
import assert from 'node:assert/strict';
import { initial, setCount, setShape, place, tapPlayer, swap, moveSlot, autoFill, benchOf, positionOf, addDrawing, undoDrawing, clearDrawings, restore, serialize, defaultTitle } from '../../src/lib/lineup.ts';
import { slotsFor } from '../../src/lib/formation.ts';

const P = (num, pos, s = 70) => ({ num, name: `p${num}`, pos, detail: '', foot: '', vest: null, note: '', pace: s, dribble: s, pass: s, shoot: s, defend: s, stamina: s, rot: null, avatar: '' });

test('initial: 인원만큼 빈 슬롯, 그 인원의 첫 모양과 경기장 기본값', () => {
  const s = initial(6);
  assert.equal(s.slots.length, 6);
  assert.ok(s.slots.every((x) => x === null));
  assert.equal(s.shape, '2-2-1');
  assert.equal(s.pitch, 'futsal');
  assert.equal(initial().count, 11);
});

test('tapPlayer: 고른 자리가 없으면 첫 빈자리, 선발을 다시 누르면 벤치', () => {
  let r = tapPlayer(initial(5), 7, null);
  assert.equal(r.result, 'placed');
  assert.equal(r.state.slots[0], 7);
  r = tapPlayer(r.state, 8, null);
  assert.equal(r.state.slots[1], 8);
  r = tapPlayer(r.state, 7, null);
  assert.equal(r.result, 'benched');
  assert.equal(r.state.slots[0], null);
});

test('tapPlayer: 자리가 다 차면 full, 상태는 그대로', () => {
  let s = initial(5);
  for (const n of [1, 2, 3, 4, 5]) s = tapPlayer(s, n, null).state;
  const r = tapPlayer(s, 6, null);
  assert.equal(r.result, 'full');
  assert.equal(r.state, s);
});

test('tapPlayer: 자리를 골랐으면 그 자리에 넣고 원래 사람은 벤치, 다른 자리에 있던 같은 선수는 옮겨진다', () => {
  const s = place(place(initial(5), 0, 1), 1, 2);
  let r = tapPlayer(s, 3, 0);
  assert.equal(r.result, 'placed');
  assert.deepEqual(r.state.slots.slice(0, 2), [3, 2]);
  r = tapPlayer(r.state, 2, 0);
  assert.deepEqual(r.state.slots.slice(0, 2), [2, null]);
});

test('swap: 두 슬롯을 맞바꾸고, 빈 슬롯과도 바꾼다', () => {
  const s = place(place(initial(5), 0, 1), 1, 2);
  assert.deepEqual(swap(s, 0, 1).slots.slice(0, 3), [2, 1, null]);
  assert.deepEqual(swap(s, 0, 2).slots.slice(0, 3), [null, 2, 1]);
  assert.equal(swap(s, 1, 1), s);
});

test('setCount: 선 사람은 앞에서부터 유지, 넘치면 벤치, 모양·경기장은 인원 기본값, 위치 이동 초기화', () => {
  let s = initial(7);
  [11, 12, 13, 14, 15, 16, 17].forEach((n, i) => { s = place(s, i, n); });
  s = moveSlot(s, 0, [0.1, 0.1]);
  const t = setCount(s, 5);
  assert.deepEqual(t.slots, [11, 12, 13, 14, 15]);
  assert.deepEqual(t.moved, {});
  assert.equal(t.shape, '1-2-1');
  const u = setCount(t, 8);
  assert.deepEqual(u.slots, [11, 12, 13, 14, 15, null, null, null]);
  assert.equal(u.pitch, 'soccer');
});

test('setShape: 그 인원에 없는 모양은 첫 모양, 선수는 그대로, 위치 이동은 초기화', () => {
  const s = moveSlot(place(initial(6), 0, 1), 0, [0.2, 0.2]);
  const t = setShape(s, '2-1-2');
  assert.equal(t.shape, '2-1-2');
  assert.equal(t.slots[0], 1);
  assert.deepEqual(t.moved, {});
  assert.equal(setShape(s, '4-4-2').shape, '2-2-1');
});

test('moveSlot: 0~1로 자르고 positionOf가 옮긴 위치를, 안 옮긴 자리는 슬롯 좌표를 돌려준다', () => {
  const s = moveSlot(initial(5), 2, [1.4, -0.2]);
  assert.deepEqual(positionOf(s, 2), [1, 0]);
  const slot = slotsFor(5, '1-2-1')[1];
  assert.deepEqual(positionOf(s, 1), [slot.x, slot.y]);
});

test('autoFill: 자리 무리에 맞는 OVR 높은 사람부터, 벤치는 OVR 높은 순', () => {
  const ps = [P(1, 'MF', 90), P(2, 'GK', 60), P(3, 'DF', 80), P(4, 'FW', 85), P(5, 'DF', 70), P(6, 'MF', 50), P(7, 'MF', 75)];
  const s = autoFill(initial(5), ps); // 1-2-1: GK · CB · CM · CM · ST
  assert.deepEqual(s.slots, [2, 3, 1, 7, 4]);
  assert.deepEqual(benchOf(s, ps).map((p) => p.num), [5, 6]);
});

test('그림: 더하기·되돌리기·지우기', () => {
  const a = { kind: 'arrow', from: [0, 0], to: [1, 1] };
  const b = { kind: 'pen', points: [[0, 0], [0.5, 0.5]] };
  const s = addDrawing(addDrawing(initial(5), a), b);
  assert.deepEqual(undoDrawing(s).drawings, [a]);
  assert.deepEqual(clearDrawings(s).drawings, []);
  assert.deepEqual(undoDrawing(initial(5)).drawings, []);
});

test('restore: serialize 왕복은 같은 상태', () => {
  let s = place(initial(6), 0, 1);
  s = addDrawing(s, { kind: 'arrow', from: [0.1, 0.2], to: [0.3, 0.4] });
  s = { ...s, title: '9/19 (토) 라인업' };
  assert.deepEqual(restore(serialize(s), [P(1, 'GK')]), s);
});

test('restore: 깨진 값·빈 값·모르는 버전은 초기 상태', () => {
  assert.deepEqual(restore('{', []), initial());
  assert.deepEqual(restore(null, []), initial());
  assert.deepEqual(restore('{"v":2}', []), initial());
});

test('restore: 명단에 없는 번호·중복 번호는 비우고, 범위 밖 이동·잘못된 그림·문자열 아닌 제목은 버린다', () => {
  const raw = JSON.stringify({ v: 1, count: 5, shape: '2-2', pitch: 'soccer', slots: [1, 99, 1, 2, null],
    moved: { 9: [0.5, 0.5], 1: [0.2, 0.3] }, drawings: [{ kind: 'pen', points: [[0, 0]] }, { kind: 'arrow', from: [0, 0], to: [1, 1] }], title: 3 });
  const s = restore(raw, [P(1, 'GK'), P(2, 'DF')]);
  assert.deepEqual(s.slots, [1, null, null, 2, null]);
  assert.equal(s.shape, '2-2');
  assert.equal(s.pitch, 'soccer');
  assert.deepEqual(s.moved, { 1: [0.2, 0.3] });
  assert.equal(s.drawings.length, 1);
  assert.equal(s.title, '');
});

test('defaultTitle: 오늘 이후 가장 가까운 토요일, 토요일 당일은 오늘', () => {
  assert.equal(defaultTitle('2026-09-12'), '9/12 (토) 라인업');
  assert.equal(defaultTitle('2026-09-13'), '9/19 (토) 라인업');
  assert.equal(defaultTitle('2026-09-27'), '10/3 (토) 라인업');
});
