// 포메이션 자리가 피치 위에서 카드와 부딪히지 않는지 — 모든 인원 × 모든 모양을 계산으로 검사한다.
//
// 왜 이 테스트가 있나: 2026-09-22 에 같은 결함을 두 번 놓쳤다. 헤드리스로 "인원 5~11 ×
// 축구/풋살 전수"를 돌렸는데 **포메이션 축은 인원별 기본값만**(11인이면 4-3-3) 돌고 있었고,
// 가장 빡빡한 3-5-2 가 데스크톱(1000~1095px)과 폰(320~390px) 양쪽에서 겹쳐 있었다.
// 브라우저로 모든 조합을 도는 건 느리지만, 자리 좌표는 순수 데이터라 계산으로 전수가 된다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SHAPES, MIN_COUNT, MAX_COUNT, slotsFor } from '../../src/lib/formation.ts';

const css = readFileSync(new URL('../../src/styles/tokens.css', import.meta.url), 'utf8');

/** 화면 구간별 카드 크기와, **그 구간에서 가장 좁을 때의** 피치 폭(px).
 *  폭은 tokens.css 선언에서 읽고(아래에서 대조), 높이는 내용이 정하므로 헤드리스로 잰 값이다.
 *  카드 크기를 바꾸면 높이는 다시 재서 여기 적어야 한다 — 폭이 어긋나면 이 파일이 먼저 깨진다. */
const BANDS = [
  // [이름, 카드폭, 카드높이, 축구 피치폭, 풋살 피치폭]
  ['≥1120px', 104, 108, 672, 672],   // 1120px 에서 본문 1056 − 명단 360 − 간격 24
  ['900~1119px', 72, 73, 452, 452],  // 900px 에서 본문 836 − 384
  ['421~899px', 66, 73, 389, 340],   // 세로로 쌓임: 축구는 min(100%,440), 풋살은 min(100%,340)
  ['341~420px', 56, 63, 309, 309],
  ['≤340px', 56, 48, 288, 288],
];
const RATIO = { 축구: 105 / 68, 풋살: 2 };

test('BANDS 의 카드 폭이 tokens.css 선언과 같다 (CSS 를 바꾸면 이 표도 바꿔야 한다)', () => {
  const declared = [...css.matchAll(/\.bd-slot\s*\{[^}]*?width:\s*(\d+)px/g)].map((m) => Number(m[1]));
  assert.ok(declared.length >= 4, `.bd-slot 의 width 선언을 못 찾았다: ${declared}`);
  for (const [name, w] of BANDS) {
    assert.ok(declared.includes(w), `${name} 의 카드 폭 ${w}px 가 tokens.css 에 없다 (선언된 값: ${declared})`);
  }
});

/** 두 카드가 겹치려면 가로·세로가 **둘 다** 카드 크기 안으로 들어와야 한다. */
function worstPair(slots, dxMax, dyMax) {
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      const dx = Math.abs(slots[i].x - slots[j].x);
      const dy = Math.abs(slots[i].y - slots[j].y);
      if (dx < dxMax && dy < dyMax) return { a: slots[i].label, b: slots[j].label, dx, dy };
    }
  }
  return null;
}

test('모든 인원 × 모든 모양에서 카드끼리 안 겹친다', () => {
  for (const [name, w, h, ps, pf] of BANDS) {
    for (const [kind, pw] of [['축구', ps], ['풋살', pf]]) {
      const dxMax = w / pw;
      const dyMax = h / (pw * RATIO[kind]);
      for (let n = MIN_COUNT; n <= MAX_COUNT; n++) {
        for (const shape of SHAPES[n]) {
          const hit = worstPair(slotsFor(n, shape), dxMax, dyMax);
          assert.equal(hit, null, hit && `${name}/${kind} ${n}인 ${shape}: ${hit.a}↔${hit.b} 가 겹친다`
            + ` (dx ${hit.dx.toFixed(3)} < ${dxMax.toFixed(3)}, dy ${hit.dy.toFixed(3)} < ${dyMax.toFixed(3)})`);
        }
      }
    }
  }
});

test('모든 인원 × 모든 모양에서 카드가 피치 밖으로 안 나간다', () => {
  // 카드는 자리 좌표를 중심으로 translate(-50%,-50%) 된다 — 가장자리 자리는 반쪽이 밖으로 나가기 쉽다.
  // 피치는 overflow:hidden 이라 나간 만큼 잘린다(맨 아래 GK 자리가 늘 첫 희생자였다).
  for (const [name, w, h, ps, pf] of BANDS) {
    for (const [kind, pw] of [['축구', ps], ['풋살', pf]]) {
      const ph = pw * RATIO[kind];
      for (let n = MIN_COUNT; n <= MAX_COUNT; n++) {
        for (const shape of SHAPES[n]) {
          for (const s of slotsFor(n, shape)) {
            const room = [s.x * pw, (1 - s.x) * pw, s.y * ph, (1 - s.y) * ph];
            const need = [w / 2, w / 2, h / 2, h / 2];
            for (let k = 0; k < 4; k++) {
              assert.ok(room[k] >= need[k], `${name}/${kind} ${n}인 ${shape} ${s.label}: `
                + `${['왼','오른','위','아래'][k]}쪽으로 ${(need[k] - room[k]).toFixed(1)}px 잘린다`);
            }
          }
        }
      }
    }
  }
});

test('모양 문자열과 실제 자리 수가 맞는다', () => {
  for (let n = MIN_COUNT; n <= MAX_COUNT; n++) {
    for (const shape of SHAPES[n]) {
      const rows = shape.split('-').map(Number);
      assert.ok(rows.every((k) => Number.isInteger(k) && k > 0), `${n}인 ${shape}: 줄 인원이 이상하다`);
      assert.equal(rows.reduce((a, b) => a + b, 0) + 1, n, `${n}인 ${shape}: GK 포함 인원이 ${n} 이 아니다`);
      assert.ok(rows.length >= 2 && rows.length <= 4, `${n}인 ${shape}: 줄 수는 2~4 만 그릴 수 있다`);
      assert.equal(slotsFor(n, shape).length, n, `${n}인 ${shape}: 자리 수가 ${n} 이 아니다`);
    }
  }
});

test('같은 인원 안에서 모양 이름이 겹치지 않는다', () => {
  for (let n = MIN_COUNT; n <= MAX_COUNT; n++) {
    assert.equal(new Set(SHAPES[n]).size, SHAPES[n].length, `${n}인에 같은 이름이 두 번 있다`);
  }
});
