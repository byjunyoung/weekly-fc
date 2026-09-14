import test from 'node:test';
import assert from 'node:assert/strict';
import { drawingsSvg, toDrawing } from '../../src/components/board-draw.ts';

test('화살표는 경기장 단위로 선 + 화살촉', () => {
  const svg = drawingsSvg([{ kind: 'arrow', from: [0, 0], to: [0.5, 0.5] }], 'futsal'); // 20×40
  assert.ok(svg.includes('x1="0.00" y1="0.00" x2="10.00" y2="20.00"'));
  assert.ok(svg.includes('<polyline'));
});

test('펜은 polyline 점 목록', () => {
  const svg = drawingsSvg([{ kind: 'pen', points: [[0, 0], [0.5, 1]] }], 'soccer'); // 68×105
  assert.ok(svg.includes('points="0.00,0.00 34.00,105.00"'));
});

test('그림이 없으면 빈 문자열', () => {
  assert.equal(drawingsSvg([], 'soccer'), '');
});

test('toDrawing: 짧은 화살표·점 하나는 버린다', () => {
  assert.equal(toDrawing('arrow', [[0.5, 0.5], [0.51, 0.51]]), null);
  assert.equal(toDrawing('pen', [[0.5, 0.5]]), null);
  assert.deepEqual(toDrawing('arrow', [[0.1, 0.1], [0.3, 0.2], [0.5, 0.5]]), { kind: 'arrow', from: [0.1, 0.1], to: [0.5, 0.5] });
});

test('toDrawing: 펜은 앞 점과 0.008 미만으로 붙은 점을 솎고 소수 셋째 자리로 줄인다', () => {
  const d = toDrawing('pen', [[0, 0], [0.001, 0.001], [0.1, 0.1], [0.10002, 0.1], [0.2, 0.23456]]);
  assert.deepEqual(d, { kind: 'pen', points: [[0, 0], [0.1, 0.1], [0.2, 0.235]] });
});
