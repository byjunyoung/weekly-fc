import test from 'node:test';
import assert from 'node:assert/strict';
import { ladder, posValue, startSearch, answer, pickOpponent, midOf, expectedSteps, DEFAULT_VALUE } from '../../src/lib/placement.ts';

const P = (num, pace, extra = {}) => ({ num, name: `P${num}`, pos: '', detail: '', foot: '', vest: null, note: '',
  pace, dribble: pace, pass: pace, shoot: pace, defend: pace, stamina: pace, rot: null, avatar: '', ...extra });

const team = [P(1, 60), P(2, 70), P(3, 70), P(4, 80), P(5, 90), P(9, 0)];

test('ladder — 서로 다른 값만, 낮은 순, 0·자기 자신은 뺀다', () => {
  const r = ladder(team, 'pace', 5);
  assert.deepEqual(r.map((x) => x.value), [60, 70, 80]);
  assert.deepEqual(r[1].players.map((p) => p.num), [2, 3]);
});

test('posValue — 바깥은 ±3, 사이는 가운데, 1~99 로 자른다', () => {
  const r = ladder(team, 'pace', 0);
  assert.equal(posValue(r, 0), 57);
  assert.equal(posValue(r, 4), 93);
  assert.equal(posValue(r, 2), 75);
  assert.equal(posValue(ladder([P(1, 98)], 'pace', 0), 1), 99);
  assert.equal(posValue([], 0), DEFAULT_VALUE);
});

/** 진짜 값이 truth 인 새 선수를 끝까지 탐색한다. */
function run(rungs, truth) {
  let s = startSearch('pace', rungs);
  let n = 0;
  while (s.value == null && n < 20) {
    const opp = rungs[midOf(s)].players[0];
    const v = opp.pace;
    s = answer(rungs, s, truth > v ? 'win' : truth < v ? 'lose' : 'same', opp);
    n++;
  }
  return { value: s.value, n };
}

test('이분 탐색 — 이기면 위로, 지면 아래로, 판수는 log2', () => {
  const r = ladder(team, 'pace', 0); // 60 70 80 90
  assert.equal(run(r, 99).value, 93);
  assert.equal(run(r, 50).value, 57);
  assert.equal(run(r, 85).value, 85);
  assert.equal(run(r, 70).value, 70);
  const big = ladder(Array.from({ length: 15 }, (_, i) => P(i + 1, 50 + i * 3)), 'pace', 0);
  assert.equal(expectedSteps(big), 4);
  assert.ok(run(big, 77).n <= 4);
});

test('모르겠음 — 같은 값의 다른 선수로, 없으면 구간 가운데로 확정', () => {
  const r = ladder(team, 'pace', 0); // mid = 2 → 80 (P4 혼자)
  let s = startSearch('pace', r);
  s = answer(r, s, 'lose', r[midOf(s)].players[0]); // hi=2 → mid=1 → 70 (P2, P3)
  assert.equal(r[midOf(s)].value, 70);
  s = answer(r, s, 'unsure', r[1].players[0]);
  assert.equal(s.value, null);
  assert.equal(pickOpponent(r, s, '', () => 0).num, 3);
  s = answer(r, s, 'unsure', r[1].players[1]);
  assert.equal(s.value, posValue(r, 1)); // [0,2] 가운데 = 자리 1 → 65
});

test('pickOpponent — 같은 포지션 먼저', () => {
  const r = ladder([P(1, 70, { pos: 'DF' }), P(2, 70, { pos: 'FW' })], 'pace', 0);
  const s = startSearch('pace', r);
  assert.equal(pickOpponent(r, s, 'FW', () => 0).num, 2);
});

test('비교할 사람이 없으면 바로 기본값', () => {
  assert.equal(startSearch('pace', []).value, DEFAULT_VALUE);
});
