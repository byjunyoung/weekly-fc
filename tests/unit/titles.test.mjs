import test from 'node:test';
import assert from 'node:assert/strict';
import { titleOf, teamBests, PAIR, SINGLE } from '../../src/lib/titles.ts';

const P = (num, s) => ({ num, name: `P${num}`, pos: '', detail: '', foot: '', vest: null, note: '', rot: null, avatar: '',
  pace: s[0], dribble: s[1], pass: s[2], shoot: s[3], defend: s[4], stamina: s[5] });
// 20명 보통(70) + 몇 명 튀는 선수 — 튀는 쪽만 칭호
const base = Array.from({ length: 20 }, (_, i) => P(100 + i, [68 + (i % 5), 68 + ((i + 1) % 5), 68 + ((i + 2) % 5), 68 + ((i + 3) % 5), 68 + ((i + 4) % 5), 70]));
const fast = P(1, [95, 70, 70, 70, 70, 70]);
const wing = P(2, [95, 95, 70, 70, 70, 70]);
const hexa = P(3, [90, 90, 90, 90, 90, 90]);
const unplaced = P(4, [0, 70, 70, 70, 70, 70]);
const team = [...base, fast, wing, hexa, unplaced];

test('칭호 — 실제 쓰는 조합 8종·단일 6종', () => {
  assert.equal(Object.keys(PAIR).length, 8);
  assert.equal(Object.keys(SINGLE).length, 6);
});

test('titleOf — 튀는 사람만, 보통은 칭호 없음(희소성)', () => {
  assert.equal(titleOf(fast, team).name, '스피드스타');
  assert.equal(titleOf(wing, team).name, '윙어');
  assert.equal(titleOf(hexa, team).name, '육각형');
  assert.equal(titleOf(base[0], team), null);
  assert.equal(titleOf(unplaced, team), null);
  assert.ok(team.filter((p) => titleOf(p, team)).length <= 4);
});

test('teamBests — 팀 1위 항목(공동 포함), 배치 전은 빈 배열', () => {
  assert.deepEqual(teamBests(fast, team), ['pace']);
  assert.deepEqual(teamBests(unplaced, team), []);
});

test('titleDetail·titleCatalog — 근거 항목과 목록(육각형 1 · 조합 8 · 한 가지 6)', async () => {
  const { titleDetail, titleCatalog } = await import('../../src/lib/titles.ts');
  assert.deepEqual(titleDetail(fast, team).keys, ['pace']);
  assert.deepEqual([...titleDetail(wing, team).keys].sort(), ['dribble', 'pace']);
  assert.equal(titleDetail(base[0], team), null);
  assert.deepEqual(titleCatalog().map((g) => g.items.length), [1, 8, 6]);
});
