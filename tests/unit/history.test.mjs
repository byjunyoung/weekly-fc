import test from 'node:test';
import assert from 'node:assert/strict';
import { series, judges, byDay, change, seoulDay } from '../../src/lib/history.ts';

const P = { num: 2, name: '나', pos: 'DF', detail: '', foot: '', vest: null, note: '', rot: null, avatar: '',
  pace: 80, dribble: 70, pass: 70, shoot: 70, defend: 70, stamina: 70 };
const R = (ts, field, before, after, by = 4, via = 'game', byName = `P${by}`) => ({ ts, by, byName, num: 2, field, before, after, via });
const rows = [
  R('2026-09-24T01:00:00Z', 'pace', 76, 78, 4),
  R('2026-09-25T01:00:00Z', 'dribble', 72, 70, 5),
  R('2026-09-26T16:00:00Z', 'pace', 78, 80, 4),
  R('2026-09-27T01:00:00Z', 'pace', 80, 81, 2),   // 내가 나를
  R('2026-09-27T02:00:00Z', 'pace', 81, 80, 5),
];

test('series — 항목은 첫 before 에서 출발해 after 를 따라간다', () => {
  assert.deepEqual(series(rows, P, 'pace').map((p) => p.value), [76, 78, 80, 81, 80]);
  assert.deepEqual(series(rows, P, 'shoot').map((p) => p.value), [70]);
});

test('series — 종합은 여섯 값 평균, 안 바뀐 줄은 건너뛰고 마지막 점은 남긴다', () => {
  const v = series(rows, P, 'ovr').map((p) => p.value);
  assert.equal(v[0], Math.round((76 + 72 + 70 * 4) / 6));
  assert.equal(v[v.length - 1], Math.round((80 + 70 * 5) / 6));
});

test('series — 0(배치 전) 점은 뺀다', () => {
  const placed = [R('2026-09-28T01:00:00Z', 'pace', 0, 85, 2, 'place')];
  assert.deepEqual(series(placed, { ...P, pace: 85 }, 'pace').map((p) => p.value), [85]);
});

test('judges — 팬은 순합 +, 천적은 순합 −, 나 자신은 빼고 대결만', () => {
  const j = judges([...rows, R('2026-09-28T01:00:00Z', 'pace', 80, 90, 7, 'potm', '')], 2);
  assert.equal(j.fan.num, 4); assert.equal(j.fan.net, 4); assert.equal(j.fan.up, 2);
  assert.equal(j.rival.num, 5); assert.equal(j.rival.net, -3); assert.equal(j.rival.down, 2);
  assert.equal(j.all.length, 2);
  assert.equal(judges([], 2).fan, null);
});

test('byDay — 최신 날짜부터, 서울 날짜로 묶는다', () => {
  assert.equal(seoulDay('2026-09-26T16:00:00Z'), '2026-09-27');
  const d = byDay(rows);
  assert.deepEqual(d.map((x) => x.day), ['2026-09-27', '2026-09-25', '2026-09-24']);
  assert.equal(d[0].rows.length, 3);
  assert.equal(d[0].rows[0].ts, '2026-09-27T02:00:00Z');
});

test('change — 최근 7일 변화', () => {
  const pts = series(rows, P, 'pace');
  assert.equal(change(pts, Date.parse('2026-09-28T00:00:00Z'), 7), 4);
  assert.equal(change(pts, Date.parse('2026-09-28T00:00:00Z'), 2), 2);   // 9/26 0시 직전 값 78 → 지금 80
});

test('normalizeStatLog — 대결 상대는 있을 때만 붙는다(2026-09-29)', async () => {
  const { normalizeStatLog } = await import('../../src/lib/api.ts');
  const a = normalizeStatLog({ ts: 't', by: 4, by_name: 'P4', num: 2, field: 'pace', before: 70, after: 72, via: 'game', opp: 5, opp_name: ' 이동훈 ' });
  assert.equal(a.opp, 5); assert.equal(a.oppName, '이동훈');
  const b = normalizeStatLog({ ts: 't', by: 4, by_name: 'P4', num: 2, field: 'pace', before: 70, after: 72, via: 'game' });
  assert.equal('opp' in b, false);
});
