import test from 'node:test';
import assert from 'node:assert/strict';
import { cardModel, CARD_STAT_ORDER, footMode, FOOT_OPTIONS, GUESTBOOK_MAX, guestbookProblem, tierByNum } from '../../src/lib/card.ts';
import { normalizeGuestbook } from '../../src/lib/api.ts';
import { feetPixels, feetSvg, flagKrPixels, flagKrSvg, FLAG_KR_H, FLAG_KR_W, FEET_W, FEET_H, gridRects } from '../../src/components/pixel-icons.ts';

const P = (num, v, over = {}) => ({ num, name: `P${num}`, pos: 'MF', detail: '', foot: '오른발', vest: null, note: '',
  pace: v, dribble: v, pass: v, shoot: v, defend: v, stamina: v, rot: null, avatar: '', ...over });

test('tierByNum — 종합 순위 비율제 그대로, 숫자 없는 선수는 없다', () => {
  const ps = Array.from({ length: 10 }, (_, i) => P(i + 1, 90 - i));
  const m = tierByNum([...ps, P(99, 0)]);
  assert.equal(m.get(1), 'S'); assert.equal(m.get(2), 'A'); assert.equal(m.get(4), 'B'); assert.equal(m.get(10), 'D');
  assert.equal(m.has(99), false);
});

test('footMode — 세 값과 옛 자유 입력', () => {
  assert.equal(footMode('오른발'), 'right'); assert.equal(footMode('왼발'), 'left'); assert.equal(footMode('양발'), 'both');
  assert.equal(footMode(' 오른발 잡이'), 'right'); assert.equal(footMode(''), 'none'); assert.equal(footMode(undefined), 'none');
  assert.deepEqual(FOOT_OPTIONS, ['오른발', '왼발', '양발']);
});

test('cardModel — 여섯 칸은 본가 2열 순서, 밴드는 STAT_CUTS, 티어 없으면 null', () => {
  const m = cardModel(P(7, 70, { pace: 90, shoot: 50, pos: '', foot: '양발' }), 'B');
  assert.equal(m.ovr, 70); assert.equal(m.tier, 'B'); assert.equal(m.pos, ''); assert.equal(m.foot, 'both');
  assert.deepEqual(m.stats.map((s) => s.key), CARD_STAT_ORDER);
  assert.deepEqual(m.stats.map((s) => s.key), ['pace', 'dribble', 'shoot', 'defend', 'pass', 'stamina']);
  assert.deepEqual(m.stats.find((s) => s.key === 'pace'), { key: 'pace', label: '페이스', value: 90, band: 'a' });
  assert.equal(m.stats.find((s) => s.key === 'shoot').band, 'd');
  assert.equal(cardModel(P(1, 70), undefined).tier, null);
});

test('gridRects — 가로 런을 합치고 팔레트에 없는 글자는 건너뛴다', () => {
  const r = gridRects(['AAB.', 'A?AA'], { A: '#a', B: '#b' });
  assert.equal(r, '<rect x="0" y="0" width="2" height="1" fill="#a"/><rect x="2" y="0" width="1" height="1" fill="#b"/><rect x="0" y="1" width="1" height="1" fill="#a"/><rect x="2" y="1" width="2" height="1" fill="#a"/>');
});

test('flagKrSvg — 18×12 정수배, 빨강·파랑·검정 있고 undefined 없다', () => {
  const s = flagKrSvg(2);
  assert.ok(s.startsWith('<svg'));
  assert.ok(s.includes(`width="${FLAG_KR_W * 2}" height="${FLAG_KR_H * 2}"`));
  assert.ok(s.includes('#cd2e3a') && s.includes('#0f4fa8') && s.includes('#111111'));
  assert.ok(!s.includes('undefined'));
});

test('feetSvg — 주발 쪽만 밝고, 양발이면 둘 다, 미정이면 둘 다 흐리다', () => {
  const on = (s) => (s.match(/#f4f4f4/g) ?? []).length;
  assert.ok(feetSvg('right').includes(`width="${FEET_W}" height="${FEET_H}"`));
  assert.equal(on(feetSvg('none')), 0);
  assert.ok(on(feetSvg('right')) > 0 && on(feetSvg('left')) === on(feetSvg('right')));
  assert.equal(on(feetSvg('both')), on(feetSvg('right')) * 2);
  assert.ok(feetSvg('right').includes('aria-label="오른발"') && feetSvg('both').includes('aria-label="양발"'));
  for (const m of ['right', 'left', 'both', 'none']) assert.ok(!feetSvg(m).includes('undefined'), m);
});

test('flagKrPixels·feetPixels — 캔버스용 격자는 SVG 와 같은 데이터, 행 길이 불변', () => {
  const f = flagKrPixels();
  assert.equal(f.w, FLAG_KR_W); assert.equal(f.h, FLAG_KR_H); assert.equal(f.map.length, FLAG_KR_H);
  for (const row of f.map) { assert.equal(row.length, FLAG_KR_W); for (const ch of row) assert.ok(ch in f.palette, `팔레트에 없는 글자 ${ch}`); }
  const b = feetPixels('left');
  assert.equal(b.w, FEET_W); assert.equal(b.h, FEET_H);
  for (const row of b.map) assert.equal(row.length, FEET_W);
  assert.equal(b.palette.L, '#f4f4f4'); assert.equal(b.palette.R, '#4a4f57');
});

test('guestbookProblem — 서버와 같은 규칙: 빈 글·140자 초과만 막고 공백은 하나로 센다', () => {
  assert.equal(guestbookProblem('  안녕  '), null);
  assert.equal(guestbookProblem('   '), '내용을 적어 주세요');
  assert.equal(guestbookProblem(''), '내용을 적어 주세요');
  assert.equal(guestbookProblem('가'.repeat(GUESTBOOK_MAX)), null);
  assert.equal(guestbookProblem('가'.repeat(GUESTBOOK_MAX + 1)), '140자까지만 남길 수 있습니다');
  assert.equal(guestbookProblem('가   '.repeat(50)), null, '겹공백은 하나로 — 99자');
  assert.equal(guestbookProblem('가   '.repeat(71)), '140자까지만 남길 수 있습니다', '141자');
});
test('normalizeGuestbook — id·글 없으면 버리고 이름은 다듬는다', () => {
  assert.deepEqual(normalizeGuestbook({ id: '5', num: 3, author_num: 2, author_name: ' 김현서 ', text: ' 잘했다 ', ts: 'T' }),
    { id: 5, num: 3, authorNum: 2, authorName: '김현서', text: '잘했다', ts: 'T' });
  assert.equal(normalizeGuestbook({ id: 5, text: '   ' }), null);
  assert.equal(normalizeGuestbook({ text: 'x' }), null);
  assert.equal(normalizeGuestbook({ id: 1, text: 'x', author_num: null }).authorNum, null);
});
