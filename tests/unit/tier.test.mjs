import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { voteDelta, VOTE_SCALE, VOTE_K, tierQuota, TIERS, tierRows, pickPair, QUESTION, statValue } from '../../src/lib/tier.ts';
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

test('tierQuota — 비율 10/20/40/20/10, 합은 정확히 n', () => {
  assert.deepEqual(TIERS, ['S', 'A', 'B', 'C', 'D']);
  assert.deepEqual(tierQuota(30), { S: 3, A: 6, B: 12, C: 6, D: 3 });
  assert.deepEqual(tierQuota(29), { S: 3, A: 6, B: 11, C: 6, D: 3 }, '2.9·5.8·11.6·5.8·2.9 → 나머지 큰 S·D·A·C 에 한 명씩');
  assert.deepEqual(tierQuota(10), { S: 1, A: 2, B: 4, C: 2, D: 1 });
  assert.deepEqual(tierQuota(0), { S: 0, A: 0, B: 0, C: 0, D: 0 });
  for (let n = 0; n <= 40; n++) assert.equal(Object.values(tierQuota(n)).reduce((a, b) => a + b, 0), n, `n=${n}`);
});

test('tierRows — 순위로 담는다: 30명이면 3·6·12·6·3, 칸 안은 높은 순, 종합은 여섯 평균', () => {
  const ps = Array.from({ length: 30 }, (_, i) => P(i + 1, 99 - i));   // 1번이 99 … 30번이 70
  const rows = tierRows(ps, 'ovr');
  assert.deepEqual(rows.map((r) => r.tier), ['S', 'A', 'B', 'C', 'D']);
  assert.deepEqual(rows.map((r) => r.players.length), [3, 6, 12, 6, 3]);
  assert.deepEqual(rows[0].players.map((p) => p.num), [1, 2, 3]);
  assert.deepEqual(rows[4].players.map((p) => p.num), [28, 29, 30]);
  const mixed = [P(1, 90), P(2, 70), P(3, 71), P(4, 60, { pace: 99 })];
  assert.deepEqual(tierRows(mixed, 'ovr').flatMap((r) => r.players.map((p) => p.num)), [1, 3, 2, 4], '(99+60*5)/6 = 66.5 → 67, 71 보다 아래');
  assert.deepEqual(tierRows(mixed, 'pace').flatMap((r) => r.players.map((p) => p.num)), [4, 1, 3, 2]);
});

test('tierRows — 정원은 동점이어도 지킨다: 종합 동점은 여섯 항목 합계, 그다음 번호순', () => {
  // 10명: 정원 1·2·4·2·1. 1~3번이 종합 90 이라도 S 는 한 명.
  const ps = [P(1, 90), P(2, 90, { pace: 92 }), P(3, 90), ...Array.from({ length: 7 }, (_, i) => P(i + 4, 80 - i))];
  const rows = tierRows(ps, 'ovr');
  assert.deepEqual(rows.map((r) => r.players.length), [1, 2, 4, 2, 1]);
  assert.deepEqual(rows[0].players.map((p) => p.num), [2], '합계가 큰 2번이 S');
  assert.deepEqual(rows[1].players.map((p) => p.num), [1, 3], '나머지 동점은 번호순');
  // 전원 동점이어도 정원대로 갈린다(D 가 비지 않는다)
  const same = Array.from({ length: 30 }, (_, i) => P(i + 1, 70));
  assert.deepEqual(tierRows(same, 'ovr').map((r) => r.players.length), [3, 6, 12, 6, 3]);
});

test('tierRows — 인원이 적어도 빈 칸 줄은 남고 아무도 안 잃는다', () => {
  const ps = [P(1, 90), P(2, 80), P(3, 70)];
  const rows = tierRows(ps, 'ovr');
  assert.deepEqual(rows.map((r) => r.tier), ['S', 'A', 'B', 'C', 'D']);
  assert.deepEqual(rows.flatMap((r) => r.players.map((p) => p.num)), [1, 2, 3]);
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

import { rivalPairs } from '../../src/lib/tier.ts';

test('rivalPairs — 종합 순 이웃끼리 둘씩, 서로가 서로의 라이벌', () => {
  const ps = [P(1, 90), P(2, 60), P(3, 88), P(4, 61), P(5, 75), P(6, 74)];
  const r = rivalPairs(ps);
  assert.equal(r.get(1), 3); assert.equal(r.get(3), 1);
  assert.equal(r.get(5), 6); assert.equal(r.get(6), 5);
  assert.equal(r.get(4), 2); assert.equal(r.get(2), 4);
});

test('rivalPairs — 홀수면 남은 한 명은 바로 위 사람을 라이벌로(한쪽만)', () => {
  const r = rivalPairs([P(1, 90), P(2, 80), P(3, 70)]);
  assert.equal(r.get(1), 2); assert.equal(r.get(2), 1); assert.equal(r.get(3), 2);
});

test('rivalPairs — 숫자 없는 선수는 빼고, 같은 점수는 번호순으로 고정', () => {
  const r = rivalPairs([P(4, 70), P(2, 70), P(3, 0), P(1, 70), P(5, 70)]);
  assert.equal(r.has(3), false);
  assert.equal(r.get(1), 2); assert.equal(r.get(4), 5);
});

test('pickPair — rivals 를 주면 네 판에 한 번꼴로 라이벌끼리 붙인다', () => {
  const ps = Array.from({ length: 30 }, (_, i) => P(i + 1, 50 + (i * 7) % 40));
  const rivals = rivalPairs(ps);
  const r = rng(5);
  let hit = 0;
  for (let i = 0; i < 400; i++) {
    const { a, b } = pickPair(ps, { field: 'pace', seen: {}, recent: [], rand: r, rivals });
    if (rivals.get(a.num) === b.num || rivals.get(b.num) === a.num) hit++;
  }
  assert.ok(hit >= 80 && hit <= 160, `${hit}/400`);
});
