import test from 'node:test';
import assert from 'node:assert/strict';
import { pitchHtml, pitchLines, PITCH_DIM } from '../../src/components/pitch-view.ts';
import { initial, place, moveSlot } from '../../src/lib/lineup.ts';

const P = (num, name, pos, s = 70) => ({ num, name, pos, detail: '', foot: '', vest: null, note: '', pace: s, dribble: s, pass: s, shoot: s, defend: s, stamina: s, rot: null, avatar: '' });
const count = (html, needle) => html.split(needle).length - 1;

test('슬롯마다 버튼 하나, 빈 자리는 라벨을 보여준다', () => {
  const html = pitchHtml(initial(6), [], null);
  assert.equal(count(html, 'data-slot="'), 6);
  assert.equal(count(html, 'bd-empty'), 6);
  assert.ok(html.includes('>GK</button>'));
});

test('선수가 선 자리는 이름·자리 라벨을 넣고 이름은 이스케이프한다', () => {
  const s = place(initial(5), 0, 1);
  const html = pitchHtml(s, [P(1, '<김>', 'GK', 80)], null);
  assert.ok(html.includes('&lt;김&gt;'));
  assert.ok(!html.includes('<김>'));
  assert.equal(count(html, 'bd-card'), 1);
  assert.ok(html.includes('pcard-silver'));
});

test('고른 자리에 is-selected, 포지션이 다른 자리에 선 선수는 is-oop', () => {
  const s = place(place(initial(5), 0, 1), 1, 2);
  const html = pitchHtml(s, [P(1, 'a', 'GK'), P(2, 'b', 'FW')], 1);
  assert.equal(count(html, 'is-selected'), 1);
  const btn = html.match(/<button[^>]*data-slot="1"[^>]*>/)[0];
  assert.ok(btn.includes('is-selected'), '고른 자리는 1번');
  assert.equal(count(html, 'is-oop'), 1);
});

test('옮긴 자리는 옮긴 좌표를 % 로 쓴다', () => {
  const html = pitchHtml(moveSlot(initial(5), 0, [0.1, 0.25]), [], null);
  assert.ok(html.includes('left:10.0%;top:25.0%'));
});

test('경기장별 viewBox 와 비율', () => {
  assert.ok(pitchLines('futsal').includes('viewBox="0 0 20 40"'));
  assert.ok(pitchLines('soccer').includes('viewBox="0 0 68 105"'));
  assert.deepEqual(PITCH_DIM.futsal, { w: 20, h: 40 });
  const s = { ...initial(8), pitch: 'soccer' };
  assert.ok(pitchHtml(s, [], null).includes('aspect-ratio:68 / 105'));
});

test('그림 겹 내용은 받은 문자열을 그대로 넣는다', () => {
  assert.ok(pitchHtml(initial(5), [], null, '<path d="M0 0"/>').includes('data-draw><path d="M0 0"/></svg>'));
});
