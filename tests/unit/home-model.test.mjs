import test from 'node:test';
import assert from 'node:assert/strict';
import { computeHomeSummary, nextMonthOf } from '../../src/react/home/model.ts';

const P = (num, name, pos, over = {}) => ({ num, name, pos, detail: '', foot: '', vest: null, note: '', pace: 70, dribble: 70, pass: 70, shoot: 70, defend: 70, stamina: 70, rot: null, avatar: '', phone: '', ...over });
const players = [P(7, '김민수', 'MF', { rot: 1 }), P(9, '박지훈', 'FW', { pace: 85, dribble: 80, shoot: 88, pass: 70, defend: 40, stamina: 75 }), P(3, '이서준', 'DF')];
const fines = [
  { id: 'f1', date: '2026-09-12', match_id: '', player: '박지훈', type: '지각', amount: 30000, paid: false },
  { id: 'f2', date: '2026-09-05', match_id: '', player: '김민수', type: '노쇼', amount: 50000, paid: true },
];
const rotation = [{ year: 2026, month: 9, p1: '김민수', p2: '이서준', done: false }];
const data = { players, matches: [], rotation, fines, lineups: [] };
// 제목 형식은 src/lib/parse.ts 의 parseVideoTitle 규칙("YYMMDD | 유형 | 장소")을 따른다.
const videos = [
  { id: 'v1', title: '260913 | 2파전 | 모란공원', published: '2026-09-13T00:00:00Z' },
  { id: 'v2', title: '260906 | 3파전 | 위례공원', published: '2026-09-06T00:00:00Z' },
];
const now = new Date(2026, 8, 15); // 2026-09-15, rotation 시트와 같은 달

test('nextMonthOf: 12월 다음은 다음 해 1월', () => {
  assert.deepEqual(nextMonthOf(2026, 9), { y: 2026, mo: 10 });
  assert.deepEqual(nextMonthOf(2026, 12), { y: 2027, mo: 1 });
});

test('computeHomeSummary: 이름을 골랐으면 meTile 이 picked, OVR·포지션 포함', () => {
  const s = computeHomeSummary(data, videos, 9, now);
  assert.deepEqual(s.meTile, { kind: 'picked', ovr: 73, name: '박지훈', pos: 'FW', num: 9 }); // (85+80+88+70+40+75)/6 = 73
});
test('computeHomeSummary: 이름 안 골랐으면 meTile 이 empty', () => {
  assert.deepEqual(computeHomeSummary(data, videos, null, now).meTile, { kind: 'empty' });
});
test('computeHomeSummary: 스쿼드 인원·포지션 요약', () => {
  const s = computeHomeSummary(data, videos, null, now);
  assert.equal(s.squadCount, 3);
  assert.equal(s.posSummary, 'GK 0 · DF 1 · MF 1 · FW 1');
});
test('computeHomeSummary: 매치 = 채널 영상 수(파싱 실패해도 전부 센다)', () => {
  assert.equal(computeHomeSummary(data, videos, null, now).matchCount, 2);
});
test('computeHomeSummary: 이번 달·다음 달 봉사 — 시트 값 우선', () => {
  const s = computeHomeSummary(data, videos, null, now);
  assert.deepEqual(s.duty, { p1: '김민수', p2: '이서준', monthLabel: '2026년 9월', sub: '대관비·조끼·정산' });
  assert.equal(s.dutyNext.monthLabel, '2026년 10월');
});
test('computeHomeSummary: 미납 벌금 합계·건수', () => {
  const s = computeHomeSummary(data, videos, null, now);
  assert.equal(s.unpaidAmount, 30000);
  assert.equal(s.unpaidCount, 1);
});
test('computeHomeSummary: 최신 영상 4개 썸네일, 최근 매치 = 가장 최근 영상', () => {
  const s = computeHomeSummary(data, videos, null, now);
  assert.equal(s.videoCount, 2);
  assert.deepEqual(s.thumbIds, ['v1', 'v2']);
  assert.equal(s.recentMatch.id, 'v1');
  assert.equal(s.recentMatch.location, '모란공원');
});
test('computeHomeSummary: 영상이 없으면 최근 매치 null, 도장 문구', () => {
  const s = computeHomeSummary(data, [], null, now);
  assert.equal(s.recentMatch, null);
  assert.equal(s.stamp, '3명 · 영상 0');
});
