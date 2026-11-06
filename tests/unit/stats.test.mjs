import test from 'node:test';
import assert from 'node:assert/strict';
import { ovr, grade, band, STAT_CUTS } from '../../src/lib/stats.ts';

const P = (num, name, s = 70) => ({ num, name, pos: 'MF', detail: '', foot: '', vest: null, note: '', pace: s, dribble: s, pass: s, shoot: s, defend: s, stamina: s, rot: null });

test('ovr는 0을 빼고 평균, 반올림', () => {
  assert.equal(ovr(P(1, 'a', 80)), 80);
  assert.equal(ovr({ ...P(1, 'a', 0), pace: 90, pass: 81 }), 86);
  assert.equal(ovr(P(1, 'a', 0)), 0);
});
test('grade 경계 84/69', () => { assert.equal(grade(84), 'gold'); assert.equal(grade(83), 'silver'); assert.equal(grade(69), 'silver'); assert.equal(grade(68), 'bronze'); });
test('band 4단계', () => {
  assert.equal(band(84, STAT_CUTS), 'a'); assert.equal(band(70, STAT_CUTS), 'b'); assert.equal(band(55, STAT_CUTS), 'c'); assert.equal(band(54, STAT_CUTS), 'd');
});
