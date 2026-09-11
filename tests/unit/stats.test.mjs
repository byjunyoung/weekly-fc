import test from 'node:test';
import assert from 'node:assert/strict';
import { ovr, grade, band, STAT_CUTS, RATE_CUTS, attendance, wins, seasonTable, fineSummary, condition } from '../../src/lib/stats.ts';

const P = (num, name, s = 70) => ({ num, name, pos: 'MF', detail: '', foot: '', vest: null, note: '', pace: s, dribble: s, pass: s, shoot: s, defend: s, stamina: s, rot: null });
const M = (date, attendees, teams = [], winner = '') => ({ id: date, date, location: '', youtube: '', type: '2파전', attendees, teams, winner });

test('ovr는 0을 빼고 평균, 반올림', () => {
  assert.equal(ovr(P(1, 'a', 80)), 80);
  assert.equal(ovr({ ...P(1, 'a', 0), pace: 90, pass: 81 }), 86);
  assert.equal(ovr(P(1, 'a', 0)), 0);
});
test('grade 경계 84/69', () => { assert.equal(grade(84), 'gold'); assert.equal(grade(83), 'silver'); assert.equal(grade(69), 'silver'); assert.equal(grade(68), 'bronze'); });
test('band 4단계', () => {
  assert.equal(band(84, STAT_CUTS), 'a'); assert.equal(band(70, STAT_CUTS), 'b'); assert.equal(band(55, STAT_CUTS), 'c'); assert.equal(band(54, STAT_CUTS), 'd');
  assert.equal(band(80, RATE_CUTS), 'a'); assert.equal(band(39, RATE_CUTS), 'd');
});
test('attendance는 참석 기록이 있는 매치만 분모', () => {
  const ms = [M('2026-09-05', ['a', 'b']), M('2026-08-22', ['b']), M('2026-08-08', [])];
  assert.deepEqual(attendance('a', ms), { attended: 1, total: 2, rate: 50 });
  assert.deepEqual(attendance('a', ms, 2025), { attended: 0, total: 0, rate: 0 });
});
test('wins는 winner가 적힌 매치에서 이긴 팀 소속 횟수', () => {
  const ms = [M('2026-09-05', ['a', 'b'], [{ name: 'A', players: ['a'], points: 3 }, { name: 'B', players: ['b'], points: 0 }], 'A'), M('2026-08-22', ['a', 'b'])];
  assert.deepEqual(wins('a', ms), { won: 1, played: 1, rate: 100 });
  assert.deepEqual(wins('b', ms), { won: 0, played: 1, rate: 0 });
});
test('seasonTable은 출석 많은 순, 같으면 번호순', () => {
  const ps = [P(9, 'a'), P(3, 'b'), P(5, 'c')];
  const ms = [M('2026-09-05', ['a', 'b']), M('2026-08-22', ['b'])];
  assert.deepEqual(seasonTable(ps, ms).map((r) => r.player.name), ['b', 'a', 'c']);
});
test('condition은 최근 4경기(출석 기록 있는 것만) 중 출석 수로 3단계', () => {
  const up = [M('2026-09-05', ['a']), M('2026-08-29', ['a']), M('2026-08-22', ['a']), M('2026-08-15', [])];
  // 08-15는 attendees가 비어 있어 세는 매치가 아니다 → 실제 최근 3경기 중 a는 3회 출석
  assert.deepEqual(condition('a', up), { level: 'up', attended: 3, of: 3 });
  const mid = [M('2026-09-05', ['a']), M('2026-08-29', ['b']), M('2026-08-22', ['a']), M('2026-08-15', ['b'])];
  assert.deepEqual(condition('a', mid), { level: 'mid', attended: 2, of: 4 });
  const down = [M('2026-09-05', ['b']), M('2026-08-29', ['b']), M('2026-08-22', ['b']), M('2026-08-15', ['a'])];
  assert.deepEqual(condition('a', down), { level: 'down', attended: 1, of: 4 });
});
test('condition은 출석 기록이 있는 매치 자체가 없으면 판단 보류', () => {
  assert.deepEqual(condition('a', []), { level: 'none', attended: 0, of: 0 });
  assert.deepEqual(condition('a', [M('2026-08-15', [])]), { level: 'none', attended: 0, of: 0 });
});
test('condition은 최근 4경기 밖(5번째 이전)은 무시한다', () => {
  const withOldMiss = [M('2026-09-05', ['a']), M('2026-08-29', ['a']), M('2026-08-22', ['a']), M('2026-08-15', ['a']), M('2026-08-08', ['b'])];
  assert.deepEqual(condition('a', withOldMiss), { level: 'up', attended: 4, of: 4 });
});
test('fineSummary', () => {
  const fs = [{ id: '1', date: '', match_id: '', player: 'a', type: '지각', amount: 30000, paid: false }, { id: '2', date: '', match_id: '', player: 'a', type: '노쇼', amount: 50000, paid: true }];
  const s = fineSummary(fs);
  assert.equal(s.total, 80000); assert.equal(s.unpaid, 30000); assert.equal(s.unpaidCount, 1);
  assert.equal(s.byType.노쇼.count, 1); assert.equal(s.byPlayer.get('a').unpaid, 30000);
});
