import test from 'node:test';
import assert from 'node:assert/strict';
import { toLandscape, toPortrait, packNorm, unpackNorm } from '../../src/lib/pitch-coords.ts';

const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const closeArr = (a, b, eps = 1e-9) => close(a[0], b[0], eps) && close(a[1], b[1], eps);

test('toLandscape → toPortrait는 원래 좌표로 왕복한다 (코너·비대칭 좌표 포함)', () => {
  const pts = [[0, 0], [1, 1], [0, 1], [1, 0], [0.2, 0.8], [0.18, 0.78], [0.5, 0.94]];
  for (const p of pts) {
    const back = toPortrait(toLandscape(p));
    assert.ok(closeArr(back, p), `${JSON.stringify(p)} → landscape → portrait: ${JSON.stringify(back)}`);
  }
});

test('portrait 방향에서는 packNorm·unpackNorm 모두 항등변환', () => {
  const n = [0.3, 0.7];
  assert.deepEqual(packNorm('portrait', n), n);
  assert.deepEqual(unpackNorm('portrait', n), n);
});

test('landscape 방향에서 저장(packNorm) → 복원(unpackNorm) 왕복이 원래 좌표로 돌아온다', () => {
  const pts = [[0.82, 0.78], [0.18, 0.22], [0.5, 0.5], [0.94, 0.5]];
  for (const n of pts) {
    const roundtripped = packNorm('landscape', unpackNorm('landscape', n));
    assert.ok(closeArr(roundtripped, n), `landscape 왕복 실패: ${JSON.stringify(n)} → ${JSON.stringify(roundtripped)}`);
  }
});

test('세로 기준으로 저장된 좌표는 가로에서 대칭 위치에 그려진다 (구체적 좌표 대조)', () => {
  // LB 포지션(4-3-3, PRESETS[11] 실측치): 세로 x=.18, y=.78 → 가로에서는 [y, 1-x]
  const lb = unpackNorm('landscape', [0.18, 0.78]);
  assert.ok(closeArr(lb, [0.78, 0.82]), `LB 좌표가 가로에서 예상 위치가 아님: ${JSON.stringify(lb)}`);
  // GK(세로 중앙 x=.5, y=.94)는 가로에서도 정확히 [.94, .5] — 반올림 오차 없이 떨어지는 값이라 deepEqual로 확인
  assert.deepEqual(unpackNorm('landscape', [0.5, 0.94]), [0.94, 0.5]);
});
