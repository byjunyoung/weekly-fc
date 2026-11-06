// 3D 축구 시제품(2026-11-07) — 화면 쪽 순수 계산(view3d.ts: 스틱 방향·카메라·라인업·시계, voxel.ts: 아바타 → 블록 입체).
import test from 'node:test';
import assert from 'node:assert/strict';
import { cameraGoal, clockText, edgeArrow, firstPersonGoal, fpFov, nextView, rngFrom, stickToWorld, tankStep } from '../../src/react/game/views/match3d/view3d.ts';
import { PITCH3D, carrySpot } from '../../src/lib/game3d/sim.ts';
import { buildFigure, FIGURE_H, legGap } from '../../src/react/game/views/match3d/voxel.ts';
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

test('1인칭 탱크 조작 — 오른쪽을 누르면 시선이 오른쪽(+y 쪽)으로 부드럽게 돌고, 위를 누르면 보는 쪽으로 간다', () => {
  let h = 0, tv = 0;
  const first = tankStep(1, 0, h, tv, 1 / 60);
  assert.ok(first.turnVel > 0 && first.turnVel < 1, '처음엔 천천히 돌기 시작');
  for (let t = 0; t < 60; t++) { const r = tankStep(1, 0, h, tv, 1 / 60); h = r.heading; tv = r.turnVel; }
  assert.ok(h > 1.5 && h < 2.6, `1초에 ${h} 라디안`);
  assert.ok(Math.sin(h) > 0, '+y 쪽(화면 오른쪽)으로 돌았다');
  const go = tankStep(0, -1, 0.5, 0, 1 / 60);
  assert.ok(near(go.move.x, Math.cos(0.5), 1e-3) && near(go.move.y, Math.sin(0.5), 1e-3), '앞으로');
  assert.ok(near(Math.hypot(go.face.x, go.face.y), 1), '보는 방향은 단위 벡터');
  const back = tankStep(0, 1, 0, 0, 1 / 60);
  assert.ok(back.move.x < 0 && near(back.face.x, 1), '뒤로 가도 보는 쪽은 그대로');
  let stop = { heading: 0, turnVel: 2 };
  for (let t = 0; t < 30; t++) stop = tankStep(0, 0, stop.heading, stop.turnVel, 1 / 60);
  assert.ok(Math.abs(stop.turnVel) < 0.01, '손을 떼면 돌기가 멈춘다');
});

test('1인칭 카메라 — 눈높이에서 보는 쪽을 보고, 세로 화면에서도 시야각이 지나치지 않다', () => {
  const g = firstPersonGoal({ x: 2, y: 3 }, 0, 16 / 9);
  assert.ok(g.pz > 1.4 && g.pz < 1.8 && g.lx > g.px && near(g.ly, g.py), JSON.stringify(g));
  // 모는 공이 화면에 보인다(2026-11-07 "1인칭에 공 드리블할 때 공이 앞에 보여야지") — 서 있을 때·달릴 때·질주할 때의 발 앞 공(carrySpot)이
  // 가로 화면(16:9·16:10)에서도 세로 시야의 85% 안, 지평선(먼 골대)도 화면 안에 남는다.
  for (const aspect of [16 / 9, 16 / 10, 9 / 19]) {
    const c = firstPersonGoal({ x: 0, y: 0 }, 0, aspect), half = (fpFov(aspect) / 2) * (Math.PI / 180);
    const pitch = Math.atan2(c.pz - c.lz, c.lx - c.px);   // 시선이 아래로 기운 각
    for (const [vx, sprint] of [[0, false], [5, false], [7, true]]) {
      const b = carrySpot({ x: 0, y: 0, vx, vy: 0, fx: 1, fy: 0, sprint });
      const down = Math.atan2(c.pz - PITCH3D.ballR, b.x - c.px) - pitch;   // 화면 가운데에서 공까지 아래로
      assert.ok(down > 0 && down < half * 0.85, `aspect ${aspect.toFixed(2)} v ${vx}: ${(down / half).toFixed(2)}`);
    }
    assert.ok(pitch < half * 0.9, '지평선이 화면 안');
  }
  assert.ok(fpFov(16 / 9) >= 50 && fpFov(9 / 19) <= 100 && fpFov(9 / 19) > fpFov(16 / 9));
  assert.deepEqual(['broadcast', 'first', 'chase'].map(nextView), ['first', 'chase', 'broadcast']);
});

test('공 화살표 — 화면 안이면 없음, 오른쪽 밖이면 오른쪽 가장자리, 뒤면 아래쪽·옆으로', () => {
  assert.equal(edgeArrow(0, 0, -5, 60, 1.5, 900, 600, 40).show, false);
  const r = edgeArrow(20, 0, -5, 60, 1.5, 900, 600, 40);
  assert.ok(r.show && near(r.x, 900 - 40, 1e-6) && near(r.y, 300, 1e-6) && near(r.angle, 0, 1e-9));
  const b = edgeArrow(-1, -2, 5, 60, 1.5, 900, 600, 40);
  assert.ok(b.show && b.y > 300 && b.x < 450, JSON.stringify(b));
});
