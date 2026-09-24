import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { voteDelta, VOTE_SCALE, VOTE_K, tierOf, TIERS, tierRows, pickPair, QUESTION, statValue } from '../../src/lib/tier.ts';
import { STAT_KEYS } from '../../src/lib/types.ts';

const P = (num, v, extra = {}) => ({ num, name: `P${num}`, pos: '', detail: '', foot: '', vest: null, note: '',
  pace: v, dribble: v, pass: v, shoot: v, defend: v, stamina: v, rot: null, avatar: '', ...extra });

test('voteDelta — 비슷하면 2, 예상대로 1, 이변이면 3~4 (서버에서 잰 값과 같다)', () => {
  assert.equal(voteDelta(70, 70), 2);
  assert.equal(voteDelta(90, 70), 1);
  assert.equal(voteDelta(80, 60), 1);
  assert.equal(voteDelta(70, 90), 3);
  assert.equal(voteDelta(99, 98), 2);
  assert.equal(voteDelta(50, 99), 4);
});

test('voteDelta 는 0 이 되지 않는다 — 이기면 반드시 오른다', () => {
  for (let a = 1; a <= 99; a += 7) for (let b = 1; b <= 99; b += 7) assert.ok(voteDelta(a, b) >= 1, `${a} vs ${b}`);
});

test('SQL 의 vote_delta 와 상수가 같다 — 앱과 서버 식이 갈리지 않게', () => {
  const sql = readFileSync('supabase/migrations/20260924100000_tier_game.sql', 'utf8');
  const m = /greatest\(1, round\((\d+) \* \(1 - 1 \/ \(1 \+ power\(10::numeric, \(p_lose - p_win\) \/ ([\d.]+)\)\)\)\)\)/.exec(sql);
  assert.ok(m, 'vote_delta 식을 찾지 못했다');
  assert.equal(Number(m[1]), VOTE_K);
  assert.equal(Number(m[2]), VOTE_SCALE);
});

test('tierOf — 경계값', () => {
  assert.equal(tierOf(85), 'S'); assert.equal(tierOf(84), 'A'); assert.equal(tierOf(78), 'A');
  assert.equal(tierOf(77), 'B'); assert.equal(tierOf(70), 'B'); assert.equal(tierOf(69), 'C');
  assert.equal(tierOf(63), 'C'); assert.equal(tierOf(62), 'D'); assert.equal(tierOf(1), 'D');
  assert.deepEqual(TIERS, ['S', 'A', 'B', 'C', 'D']);
});

test('tierRows — 종합은 여섯 평균, 칸 안은 높은 순, 빈 칸도 줄은 남는다', () => {
  const ps = [P(1, 90), P(2, 70), P(3, 71), P(4, 60, { pace: 99 })];
  const rows = tierRows(ps, 'ovr');
  assert.deepEqual(rows.map((r) => r.tier), ['S', 'A', 'B', 'C', 'D']);
  assert.deepEqual(rows[0].players.map((p) => p.num), [1]);
  assert.deepEqual(rows[1].players, []);
  assert.deepEqual(rows[2].players.map((p) => p.num), [3, 2]);
  assert.deepEqual(rows[3].players.map((p) => p.num), [4], '(99+60*5)/6 = 66.5 → 67 → C');
  assert.deepEqual(tierRows(ps, 'pace')[0].players.map((p) => p.num), [4, 1]);
});

test('tierRows — 능력치가 아직 없는(0) 선수는 뺀다', () => {
  const rows = tierRows([P(1, 0), P(2, 70)], 'ovr');
  assert.deepEqual(rows.flatMap((r) => r.players.map((p) => p.num)), [2]);
});

test('statValue — 종합과 항목', () => {
  assert.equal(statValue(P(4, 60, { pace: 99 }), 'ovr'), 67);
  assert.equal(statValue(P(4, 60, { pace: 99 }), 'pace'), 99);
});

function rng(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; }

test('pickPair — 서로 다른 두 선수, 숫자가 가까운 쪽과 붙인다', () => {
  const ps = Array.from({ length: 30 }, (_, i) => P(i + 1, 40 + i * 2));
  const r = rng(7);
  for (let i = 0; i < 200; i++) {
    const { a, b, field } = pickPair(ps, { field: 'pace', seen: {}, recent: [], rand: r });
    assert.equal(field, 'pace');
    assert.notEqual(a.num, b.num);
    assert.ok(Math.abs(a.pace - b.pace) <= 12, `${a.pace} vs ${b.pace} — 가까운 여섯 안`);
  }
});

test('pickPair — focus 선수가 반드시 끼고, 덜 나온 선수를 먼저 뽑는다', () => {
  const ps = Array.from({ length: 10 }, (_, i) => P(i + 1, 60 + i));
  const r = rng(3);
  for (let i = 0; i < 50; i++) {
    const { a, b } = pickPair(ps, { field: 'shoot', seen: {}, recent: [], rand: r, focus: 4 });
    assert.ok(a.num === 4 || b.num === 4);
  }
  const seen = Object.fromEntries(ps.map((p) => [p.num, 10]));
  seen[9] = 0;
  const { a, b } = pickPair(ps, { field: 'shoot', seen, recent: [], rand: r });
  assert.ok(a.num === 9 || b.num === 9, '혼자 안 나온 9번이 뽑힌다');
});

test('pickPair — 직전에 나온 쌍은 피한다(다른 길이 있으면)', () => {
  const ps = [P(1, 70), P(2, 70), P(3, 70)];
  const r = rng(11);
  for (let i = 0; i < 50; i++) {
    const { a, b } = pickPair(ps, { field: 'pace', seen: {}, recent: ['1-2', '1-3'], rand: r });
    assert.deepEqual([a.num, b.num].sort(), [2, 3]);
  }
});

test('pickPair — 선수가 둘 미만이면 null', () => {
  assert.equal(pickPair([P(1, 70)], { field: 'pace', seen: {}, recent: [], rand: Math.random }), null);
});

test('QUESTION — 여섯 항목 모두 질문 문구가 있다', () => {
  for (const k of STAT_KEYS) assert.match(QUESTION[k], /^누가 .+\?$/);
});
