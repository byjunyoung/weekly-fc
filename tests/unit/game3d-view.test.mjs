// 3D 축구 시제품(2026-11-07) — 화면 쪽 순수 계산(view3d.ts: 스틱 방향·카메라·라인업·시계, voxel.ts: 아바타 → 블록 입체).
import test from 'node:test';
import assert from 'node:assert/strict';
import { cameraGoal, clockText, pickLineup5, rngFrom, stickToWorld } from '../../src/react/game3d/view3d.ts';
import { buildFigure, FIGURE_H, legGap } from '../../src/react/game3d/voxel.ts';
import { avatarPixels } from '../../src/components/avatar.ts';
import { avatarSpecFor } from '../../src/lib/avatar.ts';

const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test('스틱 → 경기장 방향: 가로(옆에서 보는 카메라)는 화면 오른쪽 = +x, 화면 위 = 먼 쪽(-y)', () => {
  const g = cameraGoal(false, 16 / 9, { x: 0, y: 0 }, { x: 0, y: 0 });
  const fwd = { x: g.lx - g.px, y: g.ly - g.py };
  const r = stickToWorld(1, 0, fwd.x, fwd.y), u = stickToWorld(0, -1, fwd.x, fwd.y);
  assert.ok(near(r.x, 1) && near(r.y, 0), JSON.stringify(r));
  assert.ok(near(u.x, 0) && near(u.y, -1), JSON.stringify(u));
});

test('스틱 → 경기장 방향: 세로(우리 골대 뒤 카메라)는 화면 위 = 상대 골대 쪽(+x), 화면 오른쪽 = +y', () => {
  const g = cameraGoal(true, 9 / 19, { x: 0, y: 0 }, { x: 0, y: 0 });
  const fwd = { x: g.lx - g.px, y: g.ly - g.py };
  const u = stickToWorld(0, -1, fwd.x, fwd.y), r = stickToWorld(1, 0, fwd.x, fwd.y);
  assert.ok(near(u.x, 1) && near(u.y, 0), JSON.stringify(u));
  assert.ok(near(r.x, 0) && near(r.y, 1), JSON.stringify(r));
  assert.ok(g.px < g.lx, '카메라는 우리 골대 쪽 뒤에 있다');
});

test('스틱 크기는 그대로(대각선도 길이 보존)', () => {
  const v = stickToWorld(0.6, -0.8, 0.3, -0.7);
  assert.ok(near(Math.sqrt(v.x * v.x + v.y * v.y), 1, 1e-9));
});

test('카메라(가로)는 공을 따라가되 내 선수에서 너무 멀어지지 않는다', () => {
  const g = cameraGoal(false, 16 / 9, { x: 15, y: 0 }, { x: -10, y: 0 });
  assert.ok(Math.abs(g.lx - -10) <= 8 + 1e-9, `${g.lx}`);
});

test('라인업 — 5대5, 편마다 slot 0 이 골키퍼, 사람은 0 편 slot 3, 겹침 없이 뽑는다(명단이 넉넉하면)', () => {
  const roster = Array.from({ length: 14 }, (_, i) => i + 1);
  const l = pickLineup5(roster, 7, rngFrom(1));
  assert.equal(l.length, 10);
  assert.deepEqual(l.map((s) => s.side), [0, 0, 0, 0, 0, 1, 1, 1, 1, 1]);
  assert.deepEqual(l.map((s) => s.gk), [true, false, false, false, false, true, false, false, false, false]);
  assert.equal(l.findIndex((s) => s.human), 3);
  assert.equal(l[3].num, 7);
  assert.equal(new Set(l.map((s) => s.num)).size, 10);
  assert.deepEqual(pickLineup5(roster, 7, rngFrom(1)), l, '같은 씨앗이면 같은 라인업');
});

test('라인업 — 명단이 모자라면 겹쳐서라도 판을 연다(혼자여도)', () => {
  const small = pickLineup5([1, 2, 3], 2, rngFrom(5));
  assert.equal(small.length, 10);
  assert.ok(small.every((s) => [1, 2, 3].includes(s.num)));
  const alone = pickLineup5([4], 4, rngFrom(5));
  assert.ok(alone.every((s) => s.num === 4));
});

test('시계 글자 — 틱을 올림해 m:ss', () => {
  assert.equal(clockText(3 * 60 * 60), '3:00');
  assert.equal(clockText(1), '0:01');
  assert.equal(clockText(0), '0:00');
  assert.equal(clockText(61 * 60 + 30), '1:02');
});

test('도트 아바타 → 블록 입체: 키는 FIGURE_H, 다리는 좌우로 갈려 따로, 겉면만(픽셀마다 상자 6면이 아니다)', () => {
  const pix = avatarPixels(avatarSpecFor(3, ''));
  assert.ok(pix);
  assert.ok(legGap(pix) >= 0, '다리 사이 빈 열');
  const f = buildFigure(pix, () => [1, 1, 1]);
  assert.ok(f.legL && f.legR, '다리 둘');
  let top = 0;
  for (let i = 1; i < f.body.positions.length; i += 3) top = Math.max(top, f.body.positions[i]);
  assert.ok(top <= FIGURE_H + 1e-9 && top > FIGURE_H * 0.85, `키 ${top}`);
  assert.ok(f.legX[0] < 0 && f.legX[1] > 0, '왼다리는 왼쪽, 오른다리는 오른쪽');
  // 다리는 엉덩이가 원점 — 아래로 매달린다
  for (let i = 1; i < f.legL.positions.length; i += 3) assert.ok(f.legL.positions[i] <= 1e-9);
  const filled = pix.map.slice(0, 31).join('').replace(/\./g, '').length;
  const tris = (f.body.indices.length + f.legL.indices.length + f.legR.indices.length) / 3;
  assert.ok(tris < filled * 4 * 12 * 0.5, `삼각형 ${tris} — 안쪽 면을 뺐다`);
  assert.equal(f.body.positions.length, f.body.colors.length);
  assert.equal(f.body.positions.length, f.body.normals.length);
});
