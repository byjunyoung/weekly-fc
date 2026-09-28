import test from 'node:test';
import assert from 'node:assert/strict';
import { activityOf, ago, kpis, lastActive } from '../../src/lib/adminStats.ts';

const NOW = Date.parse('2026-09-28T12:00:00Z');
const P = (over = {}) => ({ num: 2, name: 'A', claimedAt: null, lastVisit: null, visitDays: 0, views: 0, duels: 0, duels7d: 0, lastDuel: null, guestbook: 0, potmVotes: 0, ...over });

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

test('kpis — 오늘 숫자는 마지막 날, 활성은 7일 안, 연결은 claimedAt', () => {
  const s = { today: '2026-09-28', days: [{ day: '2026-09-27', devices: 1, members: 1, views: 2, duels: 5 }, { day: '2026-09-28', devices: 3, members: 2, views: 9, duels: 7 }],
    people: [P({ claimedAt: 'x', lastVisit: '2026-09-28T06:00:00Z' }), P({ num: 3, claimedAt: 'x', lastDuel: '2026-09-01T00:00:00Z' }), P({ num: 4 })] };
  assert.deepEqual(kpis(s, NOW), { todayDevices: 3, todayMembers: 2, todayViews: 9, active7: 1, claimed: 2, total: 3, duels7: 12 });
});

test('ago', () => {
  assert.equal(ago(null, NOW), '–');
  assert.equal(ago('2026-09-28T11:59:40Z', NOW), '방금');
  assert.equal(ago('2026-09-28T11:30:00Z', NOW), '30분 전');
  assert.equal(ago('2026-09-28T09:00:00Z', NOW), '3시간 전');
  assert.equal(ago('2026-09-25T12:00:00Z', NOW), '3일 전');
});
