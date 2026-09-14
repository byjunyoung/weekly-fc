import test from 'node:test';
import assert from 'node:assert/strict';
import { ovr, grade, band, STAT_CUTS, fineSummary } from '../../src/lib/stats.ts';

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
test('fineSummary', () => {
  const fs = [{ id: '1', date: '', match_id: '', player: 'a', type: '지각', amount: 30000, paid: false }, { id: '2', date: '', match_id: '', player: 'a', type: '노쇼', amount: 50000, paid: true }];
  const s = fineSummary(fs);
  assert.equal(s.total, 80000); assert.equal(s.unpaid, 30000); assert.equal(s.unpaidCount, 1);
  assert.equal(s.byType.노쇼.count, 1); assert.equal(s.byPlayer.get('a').unpaid, 30000);
});
