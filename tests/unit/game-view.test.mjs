import test from 'node:test';
import assert from 'node:assert/strict';
import { makeView, aimCamera, extentOf, FOLLOW_MIN_R, toScreen, toLogical, stickToSim, simToStick, clockText, pickLineup, rngFrom, maxPerSide, EXTENT } from '../../src/react/game/view.ts';
import { keysToInput, stickVector } from '../../src/react/game/input.ts';
import { PITCH, pitchOf } from '../../src/lib/game/sim.ts';

const SIZES = [[390, 844], [844, 390], [1280, 800]];
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test('세로면 경기장을 세우고 가로면 눕힌다', () => {
  assert.equal(makeView(390, 844).portrait, true);
  assert.equal(makeView(844, 390).portrait, false);
  assert.equal(makeView(1280, 800).portrait, false);
  assert.equal(makeView(800, 800).portrait, false, '정사각은 눕힌다');
});

test('논리 → 화면 → 논리 왕복이 두 방향 모두에서 제자리로 돌아온다', () => {
  for (const [w, h] of SIZES) {
    const v = makeView(w, h, { margin: 8, top: 46 });
    for (const [x, y] of [[0, 0], [600, 360], [-600, 360], [123.4, -250], [-656, 0]]) {
      const s = toScreen(v, x, y);
      const l = toLogical(v, s.x, s.y);
      near(l.x, x); near(l.y, y);
    }
  }
});

// 2026-11-07: 전체가 들어가는 배율에서 선수가 11px 보다 작으면 화면이 따라간다 — 그런 크기(폰의 보통 경기장)는 아래 카메라 테스트가 본다.
test('골 상자까지 포함한 경기장 전체가 뷰포트 안(여백·점수판 줄 아래)에 들어온다 — 따라가지 않는 화면', () => {
  const margin = 8, top = 46;
  assert.equal(makeView(1280, 800, { margin, top }).follow, false, 'PC 보통 경기장은 고정');
  for (const [w, h] of SIZES) {
    const v = makeView(w, h, { margin, top });
    if (v.follow) { assert.equal(v.scale, FOLLOW_MIN_R / PITCH.playerR); continue; }
    const hx = EXTENT.w / 2, hy = EXTENT.h / 2;
    for (const [x, y] of [[-hx, -hy], [hx, -hy], [-hx, hy], [hx, hy]]) {
      const s = toScreen(v, x, y);
      assert.ok(s.x >= margin - 1e-6 && s.x <= w - margin + 1e-6, `${w}x${h} x=${s.x}`);
      assert.ok(s.y >= margin + top - 1e-6 && s.y <= h - margin + 1e-6, `${w}x${h} y=${s.y}`);
    }
    assert.ok(v.scale > 0);
  }
});

test('여백·점수판 줄 없이도 꽉 들어온다(기본값)', () => {
  for (const [w, h] of SIZES) {
    const v = makeView(w, h);
    if (v.follow) continue;
    for (const [x, y] of [[-EXTENT.w / 2, -EXTENT.h / 2], [EXTENT.w / 2, EXTENT.h / 2]]) {
      const s = toScreen(v, x, y);
      assert.ok(s.x >= 0 && s.x <= w && s.y >= 0 && s.y <= h);
    }
  }
});

test('가로: 사람 편(0)은 오른쪽으로 공격 — 내 골대는 왼쪽, 스틱 오른쪽 = 시뮬레이션 +x', () => {
  const v = makeView(844, 390);
  assert.ok(toScreen(v, -PITCH.w / 2, 0).x < v.ox);
  assert.ok(toScreen(v, PITCH.w / 2, 0).x > v.ox);
  assert.deepEqual(stickToSim(v, 1, 0), { x: 1, y: 0 });
  assert.deepEqual(stickToSim(v, 0, -1), { x: 0, y: -1 });
});

test('세로: 사람 골대는 아래, 상대 골대는 위 — 화면 위로 미는 것이 상대 골대 쪽(+x)', () => {
  const v = makeView(390, 844);
  assert.ok(toScreen(v, -PITCH.w / 2, 0).y > v.oy, '내 골대(x=-600)는 화면 아래');
  assert.ok(toScreen(v, PITCH.w / 2, 0).y < v.oy, '상대 골대(x=+600)는 화면 위');
  const up = stickToSim(v, 0, -1);
  assert.deepEqual([up.x, up.y], [1, 0], '화면 위 → 시뮬레이션 +x(0 편이 공격하는 쪽)');
  const right = stickToSim(v, 1, 0);
  assert.deepEqual([right.x, right.y], [0, 1]);
  // 회전이지 거울이 아니다: 시뮬레이션 +y 는 화면 오른쪽
  assert.ok(toScreen(v, 0, 100).x > v.ox);
});

test('스틱 변환은 화면에서 실제로 그 방향으로 움직이게 한다(두 방향 모두)', () => {
  for (const [w, h] of [[390, 844], [844, 390]]) {
    const v = makeView(w, h);
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0], [0.6, -0.8]]) {
      const d = stickToSim(v, dx, dy);
      const a = toScreen(v, 0, 0), b = toScreen(v, d.x * 10, d.y * 10);
      const sx = (b.x - a.x) / (10 * v.scale), sy = (b.y - a.y) / (10 * v.scale);
      near(sx, dx); near(sy, dy);
      const back = simToStick(v, d.x, d.y);
      near(back.x, dx); near(back.y, dy);
    }
  }
});

test('시계 글자', () => {
  assert.equal(clockText(185), '3:05');
  assert.equal(clockText(60), '1:00');
  assert.equal(clockText(59.2), '1:00', '올림 — 0:59 는 59초가 남았을 때만');
  assert.equal(clockText(9), '0:09');
  assert.equal(clockText(0), '0:00');
  assert.equal(clockText(-3), '0:00');
  assert.equal(clockText(300), '5:00');
});

const roster = (n) => Array.from({ length: n }, (_, i) => 100 + i);

test('라인업: 겹침 없음, 사람은 0 편, 편마다 정확히 perSide 명 — 여러 씨앗·인원', () => {
  for (const per of [1, 2, 3, 4]) for (let seed = 1; seed <= 40; seed++) {
    const r = roster(20);
    const human = r[seed % r.length];
    const l = pickLineup(r, human, per, rngFrom(seed));
    assert.equal(l.length, per * 2);
    assert.equal(new Set(l.map((x) => x.num)).size, per * 2, '중복');
    assert.equal(l.filter((x) => x.side === 0).length, per);
    assert.equal(l.filter((x) => x.side === 1).length, per);
    assert.equal(l.filter((x) => x.human).length, 1);
    const me = l.find((x) => x.human);
    assert.equal(me.num, human); assert.equal(me.side, 0);
    assert.ok(l.every((x) => r.includes(x.num)));
    assert.ok(l.slice(0, per).every((x) => x.side === 0), '시뮬레이션 id 순서 = 0 편 먼저');
  }
});

test('라인업: 사람은 2명 이상일 때 맨 뒤(slot 0)가 아닌 자리 — 그 편 봇이 수비를 맡도록', () => {
  for (const per of [2, 3, 4]) {
    const l = pickLineup(roster(10), 103, per, rngFrom(5));
    assert.equal(l.findIndex((x) => x.human), 1);
  }
  assert.equal(pickLineup(roster(10), 103, 1, rngFrom(5)).findIndex((x) => x.human), 0);
});

test('라인업: 명단이 딱 모자라지 않게 2×perSide 명이어도 된다 / 그보다 적으면 거부', () => {
  for (const per of [1, 2, 3, 4]) {
    const r = roster(per * 2);
    const l = pickLineup(r, r[0], per, rngFrom(9));
    assert.deepEqual(l.map((x) => x.num).sort(), r.slice().sort(), '명단 전원이 한 번씩');
    assert.throws(() => pickLineup(roster(per * 2 - 1), 100, per, rngFrom(9)), RangeError);
  }
  assert.throws(() => pickLineup(roster(8), 999, 2, rngFrom(1)), RangeError, '명단에 없는 사람');
});

test('라인업: 씨앗이 같으면 같고 다르면 달라진다', () => {
  const r = roster(20);
  const a = pickLineup(r, 100, 3, rngFrom(7)).map((x) => x.num).join();
  assert.equal(a, pickLineup(r, 100, 3, rngFrom(7)).map((x) => x.num).join());
  const others = new Set(Array.from({ length: 20 }, (_, s) => pickLineup(r, 100, 3, rngFrom(s + 1)).map((x) => x.num).join()));
  assert.ok(others.size > 5);
});

test('고를 수 있는 최대 인원', () => {
  assert.equal(maxPerSide(1), 0);
  assert.equal(maxPerSide(2), 1);
  assert.equal(maxPerSide(7), 3);
  assert.equal(maxPerSide(8), 4);
  assert.equal(maxPerSide(12), 6);
  assert.equal(maxPerSide(40), 6, '2026-11-07: 한 편 6명까지');
});

test('키보드 → 방향: 대각선은 길이 1, 반대 키는 상쇄, 킥은 스페이스·X', () => {
  assert.deepEqual(keysToInput(new Set()), { x: 0, y: 0, kick: false });
  assert.deepEqual(keysToInput(new Set(['ArrowRight'])), { x: 1, y: 0, kick: false });
  assert.deepEqual(keysToInput(new Set(['w'])), { x: 0, y: -1, kick: false });
  const d = keysToInput(new Set(['ArrowUp', 'd']));
  near(Math.hypot(d.x, d.y), 1); assert.ok(d.x > 0 && d.y < 0);
  assert.deepEqual(keysToInput(new Set(['a', 'd'])), { x: 0, y: 0, kick: false });
  assert.equal(keysToInput(new Set([' '])).kick, true);
  assert.equal(keysToInput(new Set(['x'])).kick, true);
});

test('조이스틱 벡터: 데드존 안은 0, 최대 반지름 밖은 크기 1', () => {
  assert.deepEqual(stickVector(3, 3), { x: 0, y: 0 });
  const full = stickVector(200, 0);
  near(full.x, 1); near(full.y, 0);
  const half = stickVector(0, -(8 + (56 - 8) / 2));
  near(half.y, -0.5);
  const diag = stickVector(500, 500);
  near(Math.hypot(diag.x, diag.y), 1);
});

// ───────────── 화면 따라가기(2026-11-07 스펙 §2) ─────────────
const visRect = (v) => ({ x0: v.ox - v.aw / 2, x1: v.ox + v.aw / 2, y0: v.oy - v.ah / 2, y1: v.oy + v.ah / 2 });

test('카메라 — 작은 경기장·큰 화면은 고정(전체가 들어감), 큰 경기장·폰은 선수 11px 로 따라간다', () => {
  const S = pitchOf('S'), XL = pitchOf('XL');
  const fixed = makeView(1280, 800, { margin: 8, top: 46, pitch: S });
  assert.equal(fixed.follow, false);
  assert.ok(S.playerR * fixed.scale >= FOLLOW_MIN_R);
  assert.equal(aimCamera(fixed, { x: 400, y: 200 }), fixed, '고정 화면은 움직이지 않는다');
  for (const [w, h] of [[390, 844], [844, 390]]) {
    const v = makeView(w, h, { margin: 8, top: 46, pitch: XL });
    assert.equal(v.follow, true, `${w}x${h}`);
    assert.equal(XL.playerR * v.scale, FOLLOW_MIN_R);
    assert.equal(v.ew, extentOf(XL).w);
  }
});

test('카메라 — 내 선수 쪽으로 가되 경기장 끝에서 멈춘다(밖을 비추지 않는다), 세로·가로 모두', () => {
  const XL = pitchOf('XL'), ext = extentOf(XL);
  for (const [w, h] of [[390, 844], [844, 390]]) {
    const base = makeView(w, h, { margin: 8, top: 46, pitch: XL });
    const mid = aimCamera(base, { x: 100, y: -50 });
    near(mid.cx, 100); near(mid.cy, -50);
    const s = toScreen(mid, 100, -50);
    near(s.x, mid.ox); near(s.y, mid.oy, 1e-6);   // 초점이 화면 한가운데
    // 구석 너머로 밀어도 경기장 모서리가 그릴 칸 끝에 닿은 데서 멈춘다
    const far = aimCamera(base, { x: 99999, y: 99999 });
    const r = visRect(far);
    const corner = toScreen(far, ext.w / 2, ext.h / 2);
    if (far.portrait) { near(corner.y, r.y0); near(corner.x, r.x1); }
    else { near(corner.x, r.x1); near(corner.y, r.y1); }
    const far2 = aimCamera(base, { x: -99999, y: -99999 });
    const c2 = toScreen(far2, -ext.w / 2, -ext.h / 2), r2 = visRect(far2);
    if (far2.portrait) { near(c2.y, r2.y1); near(c2.x, r2.x0); } else { near(c2.x, r2.x0); near(c2.y, r2.y0); }
    // 이상한 초점(NaN)은 가운데로
    const nan = aimCamera(base, { x: NaN, y: Infinity });
    assert.ok(Number.isFinite(nan.cx) && Number.isFinite(nan.cy));
  }
});

test('카메라 — 한 방향이 통째로 들어가면 그 방향은 가운데 고정', () => {
  // 가로로 긴 화면에 보통 경기장: 배율 11/22 에서 세로(경기장 h+80=800 → 400px)는 들어가고 가로(1340 → 670px)는 안 들어가게
  const v = makeView(600, 520, { margin: 8, pitch: PITCH });
  assert.equal(v.portrait, false);
  assert.equal(v.follow, true);
  const a = aimCamera(v, { x: 300, y: 300 });
  assert.equal(a.cy, 0, '세로는 다 들어가 가운데');
  assert.ok(a.cx > 0, '가로는 따라간다');
});

test('카메라 — 화면↔논리 왕복이 카메라가 움직여도 제자리, 스틱 방향은 카메라와 상관없이 화면 방향', () => {
  const XL = pitchOf('XL');
  for (const [w, h] of [[390, 844], [844, 390], [1280, 800]]) {
    const v = aimCamera(makeView(w, h, { margin: 8, top: 46, pitch: XL }), { x: 700, y: -300 });
    for (const [x, y] of [[0, 0], [700, -300], [-900, 500], [123.4, -250]]) {
      const s = toScreen(v, x, y), l = toLogical(v, s.x, s.y);
      near(l.x, x); near(l.y, y);
    }
    // 스틱을 화면 오른쪽으로 밀면 화면에서 오른쪽으로 간다(카메라 이동과 무관)
    const d = stickToSim(v, 1, 0);
    const a = toScreen(v, 0, 0), b = toScreen(v, d.x * 10, d.y * 10);
    assert.ok(b.x - a.x > 0 && Math.abs(b.y - a.y) < 1e-6);
  }
});
