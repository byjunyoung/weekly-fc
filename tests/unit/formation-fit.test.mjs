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
/** tokens.css 에서 숫자를 꺼낸다 — 피치 폭을 손으로 적어 두면 틀려도 아무도 안 잡는다
 *  (2026-09-22 리뷰의 뮤테이션 M5: 표의 피치 폭을 부풀려도 테스트가 통과했다). */
const tok = (name) => {
  const m = css.match(new RegExp(`--${name}:\\s*(\\d+)px`));
  assert.ok(m, `tokens.css 에 --${name} 가 없다`);
  return Number(m[1]);
};
const MAX = tok('max'), LIST_W = tok('bd-list-w'), S_MD = tok('s-md'), S_LG = tok('s-lg'), S_XL = tok('s-xl');
const cap = (sel) => {
  const m = css.match(new RegExp(`\\${sel}\\s*\\{[^}]*?width:\\s*min\\(100%,\\s*(\\d+)px\\)`));
  assert.ok(m, `tokens.css 에서 ${sel} 의 최대 폭을 못 찾았다`);
  return Number(m[1]);
};
const SOCCER_CAP = cap('.bd-pitch'), FUTSAL_CAP = cap('.bd-futsal');

/** 뷰포트 폭 → 그 폭에서의 피치 폭. CSS 와 같은 식으로 계산한다.
 *  ≥900px 은 2컬럼이라 본문에서 명단·간격을 뺀 나머지를 피치가 다 쓰고,
 *  그 아래는 세로로 쌓이며 축구 440 · 풋살 340 으로 묶인다. */
function pitchWidth(vw, kind) {
  if (vw >= 900) return Math.min(MAX, vw) - 2 * S_XL - LIST_W - S_LG;
  const content = vw - 2 * S_MD;
  return Math.min(content, kind === '축구' ? SOCCER_CAP : FUTSAL_CAP);
}

/** 화면 구간: [이름, 그 구간에서 가장 좁은 뷰포트, 카드폭, 카드높이, 폭을 정하는 미디어 쿼리].
 *  카드 **높이**는 내용이 정하므로 헤드리스로 잰 값을 적는다 — 카드 크기를 바꾸면 다시 잰다.
 *  **가로 피치(≥1100px)는 따로 잰다** — 아래 LAND_BANDS. 같은 폭에서 높이가 세로의 42% 라
 *  구속 조건의 축이 뒤바뀐다(세로 규격의 가로 간격이 화면에선 세로 간격이 된다). */
const BANDS = [
  ['≥1120px', 1120, 104, 108, /@media \(min-width: 1120px\)[^@]*?\.bd-slot\s*\{[^}]*?width:\s*(\d+)px/],
  ['900~1119px', 900, 72, 73, /\n\.bd-slot\s*\{[^}]*?width:\s*(\d+)px/],
  ['421~899px', 421, 66, 73, /@media \(max-width: 899px\)[^@]*?\.bd-slot\s*\{[^}]*?width:\s*(\d+)px/],
  ['350~420px', 350, 62, 63, /@media \(max-width: 420px\)[^@]*?\.bd-slot\s*\{[^}]*?width:\s*(\d+)px/],
  ['341~349px', 341, 56, 63, /@media \(max-width: 349px\)[^@]*?\.bd-slot\s*\{[^}]*?width:\s*(\d+)px/],
  ['≤340px', 320, 56, 48, /@media \(max-width: 349px\)[^@]*?\.bd-slot\s*\{[^}]*?width:\s*(\d+)px/],
];
/** 가로 피치 구간 — `.bd-land .bd-slot` 이 미디어 쿼리보다 명시도가 높아 한 벌뿐이다.
 *  가장 좁은 뷰포트는 LineupApp 의 LAND_QUERY(1100px). */
const LAND_BANDS = [
  ['가로 ≥1100px', 1100, 72, 72, /\.bd-land \.bd-slot\s*\{[^}]*?width:\s*(\d+)px/],
];

/** 0.2 같은 값이 좌표 뺄셈에서 0.19999999999999998 로 나온다 — 그만큼은 겹침이 아니다. */
const EPS = 1e-9;

const RATIO = { 축구: 105 / 68, 풋살: 2 };

test('BANDS 의 카드 폭이 tokens.css 의 **그 구간 선언**과 같다 (CSS 를 바꾸면 이 표도 바꿔야 한다)', () => {
  // 처음엔 "선언된 폭 어딘가에 이 숫자가 있으면 통과"로 짰는데, 한 구간을 되돌려도 같은 숫자가
  // 다른 구간에 남아 있어 통과해 버렸다(2026-09-22 리뷰의 뮤테이션 M2). 구간별로 짚어 본다.
  for (const [name, , w, , re] of [...BANDS, ...LAND_BANDS]) {
    const m = css.match(re);
    assert.ok(m, `${name} 의 .bd-slot width 선언을 tokens.css 에서 못 찾았다`);
    assert.equal(Number(m[1]), w, `${name} 의 카드 폭이 tokens.css 에서는 ${m[1]}px 인데 표에는 ${w}px 로 적혀 있다`);
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
  for (const [name, vw, w, h] of BANDS) {
    for (const kind of ['축구', '풋살']) {
      const pw = pitchWidth(vw, kind);
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
  for (const [name, vw, w, h] of BANDS) {
    for (const kind of ['축구', '풋살']) {
      const pw = pitchWidth(vw, kind);
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

// ── 가로 피치(≥1100px) ──────────────────────────────────────
// 피치를 눕히면 세로 규격 좌표 (x, y) 가 화면에서 (1−y, x) 로 간다 — 즉 **세로 규격의 가로
// 간격이 화면의 세로 간격**이 된다. 세로 피치용 표를 그대로 쓰면 이 뒤바뀜을 못 잡는다.
const landPitch = (vw) => { const pw = Math.min(MAX, vw) - 2 * S_XL - LIST_W - S_LG; return { w: pw, h: pw * (68 / 105) }; };

test('가로 피치에서도 카드끼리 안 겹친다 (구속 축이 뒤바뀐다)', () => {
  for (const [name, vw, w, h] of LAND_BANDS) {
    const box = landPitch(vw);
    for (let n = MIN_COUNT; n <= MAX_COUNT; n++) {
      for (const shape of SHAPES[n]) {
        const slots = slotsFor(n, shape).map((s2) => ({ label: s2.label, x: 1 - s2.y, y: s2.x }));
        const hit = worstPair(slots, w / box.w, h / box.h);
        assert.equal(hit, null, hit && `${name} ${n}인 ${shape}: ${hit.a}↔${hit.b} 가 겹친다`
          + ` (dx ${hit.dx.toFixed(3)} · dy ${hit.dy.toFixed(3)})`);
      }
    }
  }
});

test('가로 피치에서도 카드가 피치 밖으로 안 나간다', () => {
  for (const [name, vw, w, h] of LAND_BANDS) {
    const box = landPitch(vw);
    for (let n = MIN_COUNT; n <= MAX_COUNT; n++) {
      for (const shape of SHAPES[n]) {
        for (const s2 of slotsFor(n, shape)) {
          const x = 1 - s2.y, y = s2.x;
          const room = [x * box.w, (1 - x) * box.w, y * box.h, (1 - y) * box.h];
          const need = [w / 2, w / 2, h / 2, h / 2];
          for (let k = 0; k < 4; k++) {
            assert.ok(room[k] >= need[k], `${name} ${n}인 ${shape} ${s2.label}: `
              + `${['왼', '오른', '위', '아래'][k]}쪽으로 ${(need[k] - room[k]).toFixed(1)}px 잘린다`);
          }
        }
      }
    }
  }
});
