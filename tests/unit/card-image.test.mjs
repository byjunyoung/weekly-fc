// 선수 카드 공유 이미지(2026-09-25) — 가짜 컨텍스트로 실제로 그려 보고 검사한다(tier-image.test 와 같은 방식).
import test from 'node:test';
import assert from 'node:assert/strict';
import { CARD_H, CARD_W, drawCardImage, POTM_GOLD } from '../../src/components/card-image.ts';
import { IMG_W, IMG_H } from '../../src/components/share-image.ts';

const P = (num, s, extra = {}) => ({ num, name: `선수${num}`, pos: 'DF', detail: '', foot: '오른발', vest: null, note: '',
  pace: s, dribble: s, pass: s, shoot: s, defend: s, stamina: s, rot: null, avatar: '', ...extra });

// 캔버스가 getComputedStyle(document.documentElement) 로 토큰을 읽는다 — node 엔 없으니 세워 둔다(share-image.test 와 같은 방식).
globalThis.document ??= { documentElement: {}, fonts: { load: async () => {}, ready: Promise.resolve() } };
globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' });   // 전부 폴백 값을 쓰게 한다

function fakeCanvas() {
  const rects = [], texts = [], fonts = [];
  let font = '', fillStyle = '', textAlign = 'left';
  const ctx = {
    get font() { return font; }, set font(v) { font = v; fonts.push(v); },
    set fillStyle(v) { fillStyle = v; }, get fillStyle() { return fillStyle; },
    set textAlign(v) { textAlign = v; }, get textAlign() { return textAlign; },
    set textBaseline(v) {},
    fillRect: (x, y, w, h) => rects.push({ x, y, w, h, fill: fillStyle }),
    fillText: (t, x, y) => texts.push({ t: String(t), x, y, font, align: textAlign, fill: fillStyle }),
    measureText: (t) => ({ width: [...String(t)].length * (Number(/(\d+)px/.exec(font)?.[1]) || 10) }),
    save() {}, restore() {},
  };
  return { canvas: { width: 0, height: 0, getContext: () => ctx }, rects, texts, fonts };
}

test('카드 이미지 — 1080×1350, 티어 색 테두리, OVR 60px, 여섯 칸 값, undefined 없음', () => {
  const f = fakeCanvas();
  const m = drawCardImage(f.canvas, P(7, 80, { pace: 90 }), 'A', { sub: '부제' });
  assert.equal(f.canvas.width, IMG_W); assert.equal(f.canvas.height, IMG_H);
  assert.equal(m.tier, 'A');
  const frame = f.rects.find((r) => r.w === CARD_W && r.h === CARD_H);
  assert.ok(frame && frame.fill === '#59cf84', 'A 티어 초록 테두리');
  const ovr = f.texts.find((t) => t.t === '82');
  assert.ok(ovr && /60px/.test(ovr.font), 'OVR 은 60px');
  assert.ok(f.texts.some((t) => t.t === '선수7'));
  assert.ok(f.texts.some((t) => t.t === '#7'));
  for (const label of ['페이스', '드리블', '슈팅', '수비', '패스', '피지컬']) assert.ok(f.texts.some((t) => t.t === label), label);
  assert.equal(f.texts.filter((t) => t.t === '80').length, 5, '80 짜리 다섯 칸');
  assert.ok(f.texts.some((t) => t.t === '90'));
  assert.ok(f.texts.some((t) => t.t === '부제'));
  assert.ok(!f.texts.some((t) => t.t.startsWith('★ POTM')), 'potmDate 없으면 띠 없음');
  for (const t of f.texts) assert.ok(!/undefined|NaN/.test(t.font + t.fill + t.t), JSON.stringify(t));
  for (const r of f.rects) assert.ok(r.fill && !/undefined/.test(String(r.fill)), JSON.stringify(r));
  const sizes = new Set(f.fonts.map((x) => Number(/(\d+)px/.exec(x)?.[1])));
  for (const px of sizes) assert.ok([20, 30, 60].includes(px), `미리 불러오는 크기만: ${px}`);
});

test('카드 이미지 — 태극기·축구화 격자가 찍히고, 티어 없으면 회색 테두리', () => {
  const f = fakeCanvas();
  drawCardImage(f.canvas, P(3, 70, { foot: '왼발' }), null);
  assert.ok(f.rects.some((r) => r.fill === '#cd2e3a') && f.rects.some((r) => r.fill === '#0f4fa8'), '태극기 빨강·파랑');
  assert.ok(f.rects.some((r) => r.fill === '#f4f4f4' && r.h === 4), '밝은 축구화 칸(왼발)');
  const frame = f.rects.find((r) => r.w === CARD_W && r.h === CARD_H);
  assert.equal(frame.fill, '#3a3d44');
  assert.ok(f.texts.some((t) => t.t === '–' && /30px/.test(t.font)), '티어 자리는 –');
});

test('카드 이미지 — POTM 띠와 캡션', () => {
  const f = fakeCanvas();
  drawCardImage(f.canvas, P(2, 85), 'S', { title: 'POTM', sub: '9월 27일 (일) 매치 · 5표', potmDate: '2026-09-27', caption: '9월 27일 (일) · 5표' });
  const band = f.texts.find((t) => t.t === '★ POTM 9/27');
  assert.ok(band && /30px/.test(band.font) && band.fill === '#111111');
  assert.ok(f.rects.some((r) => r.fill === POTM_GOLD && r.w === CARD_W), '금색 띠');
  assert.ok(f.texts.some((t) => t.t === 'POTM' && /60px/.test(t.font)));
  assert.ok(f.texts.some((t) => t.t === '9월 27일 (일) 매치 · 5표'));
  assert.ok(f.texts.some((t) => t.t === '9월 27일 (일) · 5표'));
});
