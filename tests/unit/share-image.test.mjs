// 공유 이미지(캔버스) 계약 — 캔버스엔 CSS 가 안 닿아 화면 쪽 규약(tokens-scope·formation-fit)이
// 못 지킨다. 여기서는 **가짜 컨텍스트로 실제로 그려 보고** 나온 도형·글꼴을 검사한다.
// 처음엔 소스를 정규식으로 훑었는데, 리뷰의 뮤테이션 8종 중 5종이 그냥 통과했다(2026-09-22) —
// 캔버스가 좌표를 직접 그리거나, OVR 을 변수에 담아 찍거나, 카드 폭을 키워도 안 걸렸다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { drawLineupImage, ensureShareFonts, lineupLayout, NAME_PILL, PIXEL_SIZES, IMG_W, IMG_H } from '../../src/components/share-image.ts';
import { SHAPES, MIN_COUNT, MAX_COUNT } from '../../src/lib/formation.ts';
import { initial, setCount, setShape, setPitch, place } from '../../src/lib/lineup.ts';
import { ovr } from '../../src/lib/stats.ts';

const P = (num, name, pos, s = 70) => ({ num, name, pos, detail: '', foot: '', vest: null, note: '',
  pace: s, dribble: s, pass: s, shoot: s, defend: s, stamina: s, rot: null, avatar: '', phone: '' });

/** 호출을 받아 적는 가짜 2d 컨텍스트. 실제 렌더 없이 "무엇을 어디에 그렸나"만 본다. */
function fakeCanvas() {
  const rects = [], texts = [], fonts = [];
  let font = '', fillStyle = '', textAlign = 'left';
  const ctx = {
    get font() { return font; },
    set font(v) { font = v; fonts.push(v); },
    set fillStyle(v) { fillStyle = v; }, get fillStyle() { return fillStyle; },
    set strokeStyle(v) {}, set lineWidth(v) {},
    set textAlign(v) { textAlign = v; }, get textAlign() { return textAlign; },
    fillRect: (x, y, w, h) => rects.push({ x, y, w, h, fill: fillStyle }),
    strokeRect: (x, y, w, h) => rects.push({ x, y, w, h, stroke: true }),
    fillText: (t, x, y) => texts.push({ t: String(t), x, y, font, align: textAlign }),
    measureText: (t) => ({ width: [...String(t)].length * (Number(/(\d+)px/.exec(font)?.[1]) || 10) }),
    save() {}, restore() {}, translate() {}, beginPath() {}, rect() {}, clip() {}, setLineDash() {},
  };
  return { canvas: { width: 0, height: 0, getContext: () => ctx }, rects, texts, fonts };
}

/** 캔버스가 `getComputedStyle` 로 토큰을 읽는다 — node 엔 없으니 세워 둔다. */
function withDom(run) {
  const g = globalThis;
  const had = 'document' in g;
  const prevDoc = g.document, prevGcs = g.getComputedStyle;
  g.document = { documentElement: {}, fonts: { load: async () => {}, ready: Promise.resolve() } };
  g.getComputedStyle = () => ({ getPropertyValue: () => '' });   // 전부 폴백 값을 쓰게 한다
  try { return run(); } finally {
    if (had) { g.document = prevDoc; g.getComputedStyle = prevGcs; } else { delete g.document; delete g.getComputedStyle; }
  }
}

const ROSTER = Array.from({ length: 11 }, (_, i) => P(i + 1, ['김현서', '이찬우', '김효종', '곽민제', '장민준', '김준영', '이동훈', '유성현', '방오준', '양재원', '강준영'][i], ['GK', 'DF', 'MF', 'FW'][i % 4], 60 + i * 4));

function drawAll(st, players = ROSTER) {
  const f = fakeCanvas();
  withDom(() => drawLineupImage(f.canvas, st, players, '9/26 (토) 라인업'));
  return f;
}
const filled = (n, shape, kind) => {
  let st = setShape(setCount(initial(n), n), shape);
  st = setPitch(st, kind);
  ROSTER.slice(0, n).forEach((p, i) => { st = place(st, i, p.num); });
  return st;
};

test('PIXEL_SIZES 는 전부 10의 배수다 (갈무리 격자)', () => {
  assert.ok(PIXEL_SIZES.length > 0);
  for (const px of PIXEL_SIZES) assert.equal(px % 10, 0, `${px}px 는 10의 배수가 아니다`);
});

test('실제로 지정된 글꼴이 전부 굵기 400 · PIXEL_SIZES 안의 크기다', () => {
  const { fonts } = drawAll(filled(11, '4-3-3', 'soccer'));
  assert.ok(fonts.length > 0, '글꼴을 한 번도 안 지정했다');
  for (const f of new Set(fonts)) {
    const m = /^(\d{3}) (\d+)px/.exec(f);
    assert.ok(m, `글꼴 문자열이 "굵기 크기px …" 모양이 아니다: ${f}`);
    assert.equal(m[1], '400', `굵기 ${m[1]} — 캔버스엔 font-synthesis 가 없어 가짜 볼드가 도트를 뭉갠다`);
    assert.ok(PIXEL_SIZES.includes(Number(m[2])), `${m[2]}px 를 쓰는데 PIXEL_SIZES 에 없다 — 미리 안 불러와 대체 글꼴로 굳는다`);
  }
});

test('OVR 숫자는 캔버스에 안 찍는다 (단톡방에 능력치가 도는 걸 막은 결정, 2026-09-13)', () => {
  const { texts } = drawAll(filled(11, '4-3-3', 'soccer'));
  const printed = new Set(texts.map((t) => t.t));
  for (const p of ROSTER) {
    assert.ok(!printed.has(String(ovr(p))), `OVR ${ovr(p)} 가 찍혔다`);
  }
});

test('아바타는 24×32 격자의 정수배로만 그린다 (배수가 아니면 도트가 뭉갠다)', () => {
  const { rects } = drawAll(filled(11, '4-3-3', 'soccer'));
  // 아바타 칸은 같은 높이의 작은 사각형 무리다 — 높이가 전부 정수여야 한다.
  const small = rects.filter((r) => !r.stroke && r.h > 0 && r.h <= 8);
  assert.ok(small.length > 100, `아바타 칸을 못 찾았다: ${small.length}`);
  for (const r of small) assert.ok(Number.isInteger(r.h), `아바타 칸 높이가 정수가 아니다: ${r.h}`);
});

test('자리 네모가 서로 겹치지도, 피치 밖으로 나가지도 않는다 — 모든 인원 × 모든 모양 × 두 코트', () => {
  // 화면 쪽은 formation-fit 이 지키지만 캔버스는 크기 계산이 따로다(피치 높이 972 고정, 폭만 코트별).
  for (let n = MIN_COUNT; n <= MAX_COUNT; n++) {
    for (const shape of SHAPES[n]) {
      for (const kind of ['soccer', 'futsal']) {
        const { pw, ph, boxes } = lineupLayout(filled(n, shape, kind));
        assert.equal(boxes.length, n, `${kind} ${n}인 ${shape}: 자리가 ${boxes.length}개`);
        for (const b of boxes) {
          assert.ok(b.y >= 0, `${kind} ${n}인 ${shape}: 자리가 피치 위로 ${(-b.y).toFixed(1)}px 튀어나간다`);
          assert.ok(b.y + b.h <= ph, `${kind} ${n}인 ${shape}: 자리가 피치 아래로 ${(b.y + b.h - ph).toFixed(1)}px 튀어나간다`);
          assert.ok(b.x >= 0, `${kind} ${n}인 ${shape}: 자리가 피치 왼쪽으로 ${(-b.x).toFixed(1)}px 잘린다`);
          assert.ok(b.x + b.w <= pw, `${kind} ${n}인 ${shape}: 자리가 피치 오른쪽으로 ${(b.x + b.w - pw).toFixed(1)}px 잘린다`);
          // 네모는 폭 기준으로만 겹침을 보므로, 아바타가 제 네모보다 넓으면 검사가 통째로 헛돈다.
          assert.ok(b.cell * 24 <= b.w, `${kind} ${n}인 ${shape}: 아바타(${b.cell * 24}px)가 제 자리(${b.w}px)보다 넓다`);
        }
        for (let i = 0; i < boxes.length; i++) {
          for (let j = i + 1; j < boxes.length; j++) {
            const a = boxes[i], b = boxes[j];
            const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
            const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
            assert.ok(ox <= 0 || oy <= 0, `${kind} ${n}인 ${shape}: 자리가 ${ox.toFixed(1)}×${oy.toFixed(1)}px 겹친다`);
          }
        }
      }
    }
  }
});

test('실제로 그린 이름표가 선수 수만큼이고, 저마다 제 자리 네모 안에 있다', () => {
  // 위 계약이 계산만 맞고 그리는 쪽이 딴 데 찍으면 소용없다 — 그린 결과를 자리 네모와 맞춰 본다.
  const st = filled(11, '4-3-3', 'soccer');
  const { rects } = drawAll(st);
  const pills = rects.filter((r) => r.fill === NAME_PILL);
  assert.equal(pills.length, 11, `이름표를 ${pills.length}개 그렸다`);
  const { boxes } = lineupLayout(st);
  for (const pill of pills) {
    const cx = pill.x + pill.w / 2;
    const hit = boxes.some((b) => Math.abs(b.x + b.w / 2 - cx) < 1 && pill.y >= b.y && pill.y + pill.h <= b.y + b.h + 1);
    assert.ok(hit, `이름표(x=${cx.toFixed(1)}, y=${pill.y.toFixed(1)})가 어느 자리 네모에도 안 들어간다`);
  }
});

test('ensureShareFonts 가 쓸 크기를 전부 미리 불러온다', async () => {
  const asked = [];
  await withDom(async () => {
    globalThis.document.fonts.load = async (spec) => { asked.push(spec); };
    await ensureShareFonts();
  });
  for (const px of PIXEL_SIZES) {
    assert.ok(asked.some((a) => a.includes(`${px}px`)), `${px}px 를 미리 안 불러온다`);
  }
});

test('이미지 크기는 4:5 (카톡·인스타 피드 비율)', () => {
  assert.equal(IMG_W / IMG_H, 4 / 5);
});
