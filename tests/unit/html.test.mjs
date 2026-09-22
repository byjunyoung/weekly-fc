import test from 'node:test';
import assert from 'node:assert/strict';
import { esc, fmtDate, fmtWon, monthLabel, seoulToday } from '../../src/lib/html.ts';
test('esc', () => assert.equal(esc('<a href="x">&</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;'));
test('fmtDate는 요일을 붙인다', () => assert.equal(fmtDate('2026-09-05'), '2026.09.05 (토)'));
test('fmtDate는 이상한 값은 그대로', () => assert.equal(fmtDate(''), ''));
test('fmtWon', () => assert.equal(fmtWon(30000), '30,000원'));
test('monthLabel', () => assert.equal(monthLabel(2026, 9), '2026년 9월'));
test('seoulToday는 YYYY-MM-DD 형식이다', () => assert.match(seoulToday(), /^\d{4}-\d{2}-\d{2}$/));

// 능력치 기록 시각 — 서버는 UTC 로 적고 화면은 서울 시간으로 보여 준다.
// 안 옮기면 밤에 고친 게 전날로 찍힌다(UTC 14:36 = 서울 23:36).
// **단위 테스트는 TZ=UTC 로 돈다**(package.json). 개발 기계가 서울 시간대라
// 그대로 돌리면 timeZone 지정을 빼도 통과해 버린다 — 실측으로 확인한 함정이다.
import test2 from 'node:test';
import assert2 from 'node:assert/strict';
import { fmtLogAt } from '../../src/lib/html.ts';

test2('UTC 기록을 서울 시간으로 옮겨 적는다', () => {
  assert2.equal(fmtLogAt('2026-09-22T14:36:12.000Z'), '2026.09.22 23:36');
});

test2('자정을 넘기는 시각도 날짜가 같이 넘어간다', () => {
  // UTC 2026-09-22 15:10 = 서울 2026-09-23 00:10
  assert2.equal(fmtLogAt('2026-09-22T15:10:00.000Z'), '2026.09.23 00:10');
});

test2('못 읽는 값은 원문 그대로 — 기록 줄이 비어 보이지 않게', () => {
  assert2.equal(fmtLogAt(''), '');
  assert2.equal(fmtLogAt('어제쯤'), '어제쯤');
});
