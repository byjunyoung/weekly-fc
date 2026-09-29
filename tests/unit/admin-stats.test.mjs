import test from 'node:test';
import assert from 'node:assert/strict';
import { activityOf, ago, kpis, lastActive } from '../../src/lib/adminStats.ts';

const NOW = Date.parse('2026-09-28T12:00:00Z');
const P = (over = {}) => ({ num: 2, name: 'A', claimedAt: null, lastVisit: null, visitDays: 0, views: 0, duels: 0, lastDuel: null, guestbook: 0, potmVotes: 0, ...over });

test('lastActive — 방문·대결 중 늦은 쪽', () => {
  assert.equal(lastActive(P({ lastVisit: '2026-09-27T00:00:00Z', lastDuel: '2026-09-28T01:00:00Z' })), '2026-09-28T01:00:00.000Z');
  assert.equal(lastActive(P()), null);
});

test('activityOf — 오늘 / 7일 / 30일 / 없음', () => {
  assert.equal(activityOf(P({ lastVisit: '2026-09-28T06:00:00Z' }), NOW), 'hot');
  assert.equal(activityOf(P({ lastVisit: '2026-09-25T06:00:00Z' }), NOW), 'week');
  assert.equal(activityOf(P({ lastDuel: '2026-09-10T06:00:00Z' }), NOW), 'month');
  assert.equal(activityOf(P(), NOW), 'none');
});

test('kpis — 요약은 서버 기간 요약, 계정 연결은 claimedAt', () => {
  const s = { today: '2026-09-28', from: '2026-09-22', summary: { devices: 3, members: 2, views: 9, duels: 12, active: 4 }, days: [],
    people: [P({ claimedAt: 'x' }), P({ num: 3, claimedAt: 'x' }), P({ num: 4 })] };
  assert.deepEqual(kpis(s), { devices: 3, members: 2, views: 9, active: 4, duels: 12, claimed: 2, total: 3 });
});

test('ago', () => {
  assert.equal(ago(null, NOW), '–');
  assert.equal(ago('2026-09-28T11:59:40Z', NOW), '방금');
  assert.equal(ago('2026-09-28T11:30:00Z', NOW), '30분 전');
  assert.equal(ago('2026-09-28T09:00:00Z', NOW), '3시간 전');
  assert.equal(ago('2026-09-25T12:00:00Z', NOW), '3일 전');
});
