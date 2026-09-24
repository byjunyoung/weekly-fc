// 티어표 공유 이미지(2026-09-24) — 가짜 컨텍스트로 실제로 그려 보고 검사한다(share-image.test 와 같은 방식).
import test from 'node:test';
import assert from 'node:assert/strict';
import { drawTierImage, tierLayout } from '../../src/components/tier-image.ts';
import { IMG_W, IMG_H } from '../../src/components/share-image.ts';
import { tierRows } from '../../src/lib/tier.ts';
import { ovr } from '../../src/lib/stats.ts';

const P = (num, s, extra = {}) => ({ num, name: `선수${num}`, pos: '', detail: '', foot: '', vest: null, note: '',
  pace: s, dribble: s, pass: s, shoot: s, defend: s, stamina: s, rot: null, avatar: '', ...extra });

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


const TEAM = Array.from({ length: 30 }, (_, i) => P(i + 1, 55 + i, { pace: 40 + i * 2 }));

function draw(players = TEAM, key = 'ovr') {
  const f = fakeCanvas();
  withDom(() => drawTierImage(f.canvas, players, key, 'WEEKLY FC 티어', '종합 · 2026.09.24'));
  return f;
}

test('선수마다 이름이 한 번씩 찍힌다', () => {
  const f = draw();
  for (const p of TEAM) assert.equal(f.texts.filter((t) => t.t === p.name).length, 1, p.name);
});

test('능력치 숫자는 한 글자도 찍지 않는다 — 칸이 곧 구간이다', () => {
  const f = draw();
  const nums = new Set(TEAM.flatMap((p) => [ovr(p), p.pace, p.shoot].map(String)));
  const leaked = f.texts.filter((t) => t.t !== '종합 · 2026.09.24' && /\d/.test(t.t) && [...nums].some((n) => t.t.includes(n)));
  assert.deepEqual(leaked, []);
});

test('S~D 다섯 글자가 찍힌다(빈 칸도 줄은 남는다)', () => {
  const f = draw([P(1, 90), P(2, 50)]);
  for (const t of ['S', 'A', 'B', 'C', 'D']) assert.ok(f.texts.some((x) => x.t === t), t);
});

test('글꼴은 갈무리 10의 배수 크기만', () => {
  const f = draw();
  for (const font of f.fonts) assert.match(font, /^400 (20|30|60)px Galmuri9/, font);
});

test('배치 — 한 칸에 몰려도 30·40명 모두 캔버스 안, 서로 안 겹친다', () => {
  for (const n of [30, 40]) {
    for (const players of [Array.from({ length: n }, (_, i) => P(i + 1, 72)), Array.from({ length: n }, (_, i) => P(i + 1, 40 + i))]) {
      const lay = tierLayout(tierRows(players, 'ovr'));
      const slots = lay.rows.flatMap((r) => r.slots);
      assert.equal(slots.length, n);
      for (const s of slots) {
        assert.ok(s.x >= 0 && s.x + s.w <= IMG_W, `x ${s.x}`);
        assert.ok(s.y >= 240 && s.y + 32 * s.cell + 30 <= IMG_H - 40, `y ${s.y} cell ${s.cell} n ${n}`);
      }
      for (let i = 0; i < slots.length; i++) for (let j = i + 1; j < slots.length; j++) {
        const a = slots[i], b = slots[j];
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + 32 * b.cell + 30 && b.y < a.y + 32 * a.cell + 30;
        assert.ok(!overlap, `${a.num} × ${b.num}`);
      }
    }
  }
});
