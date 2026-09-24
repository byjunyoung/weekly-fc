// 팀 나누기 공유 이미지(2026-09-25) — 가짜 컨텍스트로 실제로 그려 보고 검사한다(tier-image.test 와 같은 방식).
import test from 'node:test';
import assert from 'node:assert/strict';
import { drawTeamsImage, teamsLayout } from '../../src/components/teams-image.ts';
import { IMG_W, IMG_H } from '../../src/components/share-image.ts';
import { nameMapOf } from '../../src/lib/teams.ts';

const P = (num, name) => ({ num, name, pos: '', detail: '', foot: '', vest: null, note: '',
  pace: 70, dribble: 70, pass: 70, shoot: 70, defend: 70, stamina: 70, rot: null, avatar: '' });
const PLAYERS = [P(2, '김현서'), P(3, '김준영'), P(1, '강준영'), P(4, '이동훈')];
const LINEUP = [
  { vest: 'none', members: [{ num: 2, name: '김현서' }, { num: null, name: '오준 용병+2' }] },
  { vest: 'orange', members: [{ num: 3, name: '김준영' }, { num: 1, name: '강준영' }] },
  { vest: 'neon', members: [{ num: 4, name: '이동훈' }] },
];

globalThis.document ??= { documentElement: {}, fonts: { load: async () => {}, ready: Promise.resolve() } };
globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' });

function fakeCanvas() {
  const rects = [], texts = [], fonts = [];
  let font = '', fillStyle = '', textAlign = 'left';
  const ctx = {
    get font() { return font; }, set font(v) { font = v; fonts.push(v); },
    set fillStyle(v) { fillStyle = v; }, get fillStyle() { return fillStyle; },
    set textAlign(v) { textAlign = v; }, get textAlign() { return textAlign; },
    fillRect: (x, y, w, h) => rects.push({ x, y, w, h, fill: fillStyle }),
    fillText: (t, x, y) => texts.push({ t: String(t), x, y, font, align: textAlign }),
    measureText: (t) => ({ width: [...String(t)].length * (Number(/(\d+)px/.exec(font)?.[1]) || 10) }),
    save() {}, restore() {},
  };
  return { canvas: { width: 0, height: 0, getContext: () => ctx }, rects, texts, fonts };
}

test('nameMapOf — 준영이 둘이면 둘 다 성을 붙이고, 용병은 그대로', () => {
  const m = nameMapOf(LINEUP.flatMap((t) => t.members));
  assert.equal(m.get('p2'), '현서'); assert.equal(m.get('p3'), '김준영'); assert.equal(m.get('p1'), '강준영');
  assert.equal(m.get('오준 용병+2'), '오준 용병+2');
});

test('teamsLayout — 줄은 조끼 순서, 한 줄 6명, 세로 안에 들어간다', () => {
  const lay = teamsLayout(LINEUP);
  assert.deepEqual(lay.rows.map((r) => r.vest), ['none', 'orange', 'neon']);
  assert.deepEqual(lay.rows.map((r) => r.slots.length), [2, 2, 1]);
  const big = [{ vest: 'none', members: Array.from({ length: 14 }, (_, i) => ({ num: i + 1, name: `선수${i + 1}` })) },
    { vest: 'orange', members: Array.from({ length: 14 }, (_, i) => ({ num: i + 20, name: `선수${i + 20}` })) },
    { vest: 'neon', members: Array.from({ length: 14 }, (_, i) => ({ num: i + 40, name: `선수${i + 40}` })) }];
  const lay2 = teamsLayout(big);
  const last = lay2.rows[lay2.rows.length - 1];
  assert.ok(last.y + last.h <= IMG_H - 60, '세로 안');
  assert.ok(lay2.rows[0].slots[0].cell < 4, '많으면 아바타를 줄인다');
  const per = lay2.rows[0].slots.filter((s) => s.y === lay2.rows[0].slots[0].y).length;
  assert.ok(per >= 6 && lay2.rows[0].slots[per].y > lay2.rows[0].slots[0].y, '한 줄이 차면 다음 줄');
});

test('drawTeamsImage — 1080×1350, 조끼 색 띠, 이름(짧게)·용병 표시, 숫자 없음, undefined 없음', () => {
  const f = fakeCanvas();
  drawTeamsImage(f.canvas, LINEUP, PLAYERS, '팀 나누기', '9월 27일 (일) · 5명');
  assert.equal(f.canvas.width, IMG_W); assert.equal(f.canvas.height, IMG_H);
  for (const c of ['#e5e5e5', '#e67e22', '#c8ff3d']) assert.ok(f.rects.some((r) => r.fill === c && r.w === 16), `조끼 띠 ${c}`);
  for (const t of ['노조끼', '주황조끼', '야광조끼', '현서', '김준영', '강준영', '동훈', '오준 용병+2', '용병', '팀 나누기']) assert.ok(f.texts.some((x) => x.t === t), t);
  assert.ok(!f.texts.some((x) => /^\d{2}$/.test(x.t)), '두 자리 숫자(OVR) 없음');
  for (const t of f.texts) assert.ok(!/undefined|NaN/.test(t.font + t.t), JSON.stringify(t));
  const sizes = new Set(f.fonts.map((x) => Number(/(\d+)px/.exec(x)?.[1])));
  for (const px of sizes) assert.ok([20, 30, 60].includes(px), `미리 불러오는 크기만: ${px}`);
});
