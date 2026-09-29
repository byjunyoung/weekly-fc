// 팀 단체 사진(2026-09-30) — 줄 나누기와, 가짜 컨텍스트로 실제로 그려 본 결과를 검사한다(teams-image.test 와 같은 방식).
import test from 'node:test';
import assert from 'node:assert/strict';
import { drawSquadImage, squadRows, SQUAD_FORMATS } from '../../src/components/squad-image.ts';

globalThis.document ??= { documentElement: {}, fonts: { load: async () => {}, ready: Promise.resolve() } };
globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' });

const P = (num, name) => ({ num, name, pos: '', detail: '', foot: '', vest: null, note: '',
  pace: 70, dribble: 70, pass: 70, shoot: 70, defend: 70, stamina: 70, rot: null, avatar: '' });

function fakeCanvas() {
  const rects = [], texts = [], fonts = [];
  let font = '', fillStyle = '';
  const ctx = {
    get font() { return font; }, set font(v) { font = v; fonts.push(v); },
    set fillStyle(v) { fillStyle = v; }, get fillStyle() { return fillStyle; },
    textBaseline: 'alphabetic',
    fillRect: (x, y, w, h) => rects.push({ x, y, w, h, fill: fillStyle }),
    fillText: (t, x, y) => texts.push({ t: String(t), x, y, font }),
    measureText: (t) => ({ width: [...String(t)].length * (Number(/(\d+)px/.exec(font)?.[1]) || 10) }),
  };
  return { canvas: { width: 0, height: 0, getContext: () => ctx }, rects, texts, fonts };
}

test('squadRows — 뒷줄부터 채우고 남는 사람은 뒷줄이 더 받는다', () => {
  assert.deepEqual(squadRows(31, 8), [8, 8, 8, 7]);
  assert.deepEqual(squadRows(31, 7), [7, 6, 6, 6, 6]);
  assert.deepEqual(squadRows(31, 11), [11, 10, 10]);
  assert.deepEqual(squadRows(31, 16), [16, 15]);
  assert.deepEqual(squadRows(5, 8), [5]);
  assert.deepEqual(squadRows(0, 8), []);
});

const TEAM = Array.from({ length: 31 }, (_, i) => P(i + 2, `선수${i + 2}`));

for (const fmt of Object.keys(SQUAD_FORMATS)) {
  test(`drawSquadImage(${fmt}) — 규격 크기, 전원 이름표, 캔버스 밖으로 안 나간다, 글꼴은 10의 배수`, () => {
    const f = fakeCanvas();
    drawSquadImage(f.canvas, TEAM, fmt, 2026);
    const S = SQUAD_FORMATS[fmt];
    assert.equal(f.canvas.width, S.w); assert.equal(f.canvas.height, S.h);
    for (const p of TEAM) assert.ok(f.texts.some((t) => t.t === p.name), `${p.name} 이름표`);
    const names = f.texts.filter((t) => t.t.startsWith('선수'));
    for (const t of names) assert.ok(t.x >= 0 && t.x < S.w && t.y > 0 && t.y < S.h, `${t.t} 가 캔버스 안`);
    for (const ft of f.fonts) assert.equal(Number(/(\d+)px/.exec(ft)[1]) % 10, 0, ft);
    assert.equal(f.texts.some((t) => t.t === 'WEEKLY'), S.title > 0, '제목은 title 이 있는 규격에만');
  });
}

test('drawSquadImage — 같은 입력이면 같은 그림(공유 직전 다시 그려도 안 바뀐다)', () => {
  const a = fakeCanvas(), b = fakeCanvas();
  drawSquadImage(a.canvas, TEAM, 'feed', 2026); drawSquadImage(b.canvas, TEAM, 'feed', 2026);
  assert.deepEqual(a.rects, b.rects);
});
