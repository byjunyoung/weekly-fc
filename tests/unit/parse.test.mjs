import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVideoTitle, proposeMatches, parseAttendance } from '../../src/lib/parse.ts';

const V = (id, title) => ({ id, title, published: '' });
const P = (num, name) => ({ num, name, pos: 'MF', detail: '', foot: '', vest: null, note: '', pace: 0, dribble: 0, pass: 0, shoot: 0, defend: 0, stamina: 0, rot: null });

test('날짜·유형만 있는 제목', () => {
  assert.deepEqual(parseVideoTitle(V('a', '260905 | 위클리FC 풋살 3파전')), { id: 'a', date: '2026-09-05', type: '3파전', location: '', title: '260905 | 위클리FC 풋살 3파전' });
});
test('메모와 장소가 붙은 제목', () => {
  const p = parseVideoTitle(V('b', '260614 | 위클리FC 풋살 2파전 | 쿠키있음 | 모란공원 풋살장'));
  assert.equal(p.type, '2파전'); assert.equal(p.location, '모란공원 풋살장');
});
test('풋살 단어 없이 장소만', () => {
  const p = parseVideoTitle(V('c', '260530 | 위클리FC 3파전 | 모란공원'));
  assert.equal(p.type, '3파전'); assert.equal(p.location, '모란공원');
});
test('날짜 접두사 없으면 null', () => assert.equal(parseVideoTitle(V('d', '아크로바틱 너프좀요')), null));
test('proposeMatches는 시트에 없는 날짜만, 날짜 오름차순, 같은 날 중복 제거', () => {
  const vids = [V('a', '260905 | 위클리FC 3파전'), V('b', '260822 | 위클리FC 2파전 | 위례공원'), V('c', '260822 | 위클리FC 2파전 2부'), V('d', '잡담')];
  const out = proposeMatches(vids, [{ id: '2026-09-05', date: '2026-09-05', location: '', youtube: 'a', type: '3파전', attendees: [], teams: [], winner: '' }]);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0], { id: '2026-08-22', date: '2026-08-22', location: '위례공원', youtube: 'b', type: '2파전', attendees: [], teams: [], winner: '' });
});
test('붙여넣기: 줄·쉼표·공백 구분, 정확 일치', () => {
  const ps = [P(1, '김철수'), P(2, '이영희'), P(3, '박민수')];
  assert.deepEqual(parseAttendance('김철수\n이영희, 박민수', ps), { matched: ['김철수', '이영희', '박민수'], unmatched: [] });
});
test('붙여넣기: 번호·이모지·머리말은 버리고, 못 찾은 이름은 unmatched', () => {
  const ps = [P(1, '김철수'), P(2, '이영희')];
  const r = parseAttendance('참석 (3명)\n1. 김철수 ✅\n2. 이영희님\n3. 홍길동', ps);
  assert.deepEqual(r, { matched: ['김철수', '이영희'], unmatched: ['홍길동'] });
});
test('붙여넣기: 부분 일치가 둘 이상이면 unmatched', () => {
  const ps = [P(1, '이진욱'), P(2, '이진수')];
  assert.deepEqual(parseAttendance('이진', ps), { matched: [], unmatched: ['이진'] });
});
test('붙여넣기: 불참 구획의 이름은 참석으로 안 들어간다', () => {
  const ps = [P(1, '김철수'), P(2, '이영희'), P(3, '박민수'), P(4, '최동현')];
  const text = ['[투표] 9/13 토요일 풋살', '참여 4명', '', '○ 참석 (2)', '김철수', '이영희', '', '○ 불참 (1)', '박민수', '', '○ 미정 (1)', '최동현'].join('\n');
  assert.deepEqual(parseAttendance(text, ps), { matched: ['김철수', '이영희'], unmatched: [] });
});
test('붙여넣기: 한 줄에 머리말과 이름이 같이 있어도 구획을 지킨다', () => {
  const ps = [P(1, '김철수'), P(2, '이영희'), P(3, '박민수')];
  assert.deepEqual(parseAttendance('참석: 김철수, 이영희\n불참: 박민수', ps), { matched: ['김철수', '이영희'], unmatched: [] });
});
test('붙여넣기: 구획 머리가 전혀 없으면 글 전체를 참석으로 본다', () => {
  const ps = [P(1, '김철수'), P(2, '이영희')];
  assert.deepEqual(parseAttendance('김철수\n이영희', ps), { matched: ['김철수', '이영희'], unmatched: [] });
});
test('붙여넣기: 중복은 한 번만', () => {
  assert.deepEqual(parseAttendance('김철수 김철수', [P(1, '김철수')]).matched, ['김철수']);
});
