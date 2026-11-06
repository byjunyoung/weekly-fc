import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, step, NO_INPUT, PITCH, pitchOf, formationSpot, sideCounts, FIELD_IDS } from '../../src/lib/game/sim.ts';
import { BASE_PERF } from '../../src/lib/game/stats.ts';
import { botInput } from '../../src/lib/game/bot.ts';

// 2026-11-07 "최대 인원 같은거 헥스볼처럼 자유롭게 맵 크기도 크기별로 하고" — 네 경기장 각각에서 같은 규칙이 서는지.
const mk = (field, a = 1, b = a, extra = {}) => ({
  field, minutes: 2, scoreLimit: 0, ...extra,
  players: Array.from({ length: a + b }, (_, i) => ({ id: i, num: 10 + i, name: `P${i}`, side: i < a ? 0 : 1, bot: true, perf: { ...BASE_PERF } })),
});
const idle = (cfg) => cfg.players.map(() => ({ ...NO_INPUT }));
const put = (s, o) => {
  const n = JSON.parse(JSON.stringify(s));
  Object.assign(n, o.state ?? {});
  if (o.ball) n.ball = { vx: 0, vy: 0, ...o.ball };
  for (const [i, p] of Object.entries(o.players ?? {})) Object.assign(n.players[i], { vx: 0, vy: 0 }, p);
  return n;
};
/** 1대1 에서 두 선수를 공 길 밖 구석으로. */
const away = (P) => ({ 0: { x: -P.w / 2 + 60, y: P.h / 2 - 60 }, 1: { x: -P.w / 2 + 60, y: -P.h / 2 + 60 } });

test('경기장 표 — 스펙의 크기, 몸·여백·골 깊이·기둥은 모두 같다, 모르는 값은 보통', () => {
  const want = { S: [900, 540, 170, 70], M: [1200, 720, 200, 90], L: [1560, 900, 230, 100], XL: [1920, 1080, 260, 110] };
  for (const f of FIELD_IDS) {
    const P = pitchOf(f);
    assert.deepEqual([P.w, P.h, P.goalW, P.centerR], want[f], f);
    assert.deepEqual([P.playerR, P.ballR, P.goalDepth, P.postR, P.marginX, P.marginY], [22, 10, 56, 6, 70, 40], f);
    assert.equal(P.id, f);
  }
  assert.equal(pitchOf('toString'), PITCH); assert.equal(pitchOf(undefined), PITCH); assert.equal(PITCH.id, 'M');
});

for (const f of FIELD_IDS) {
  const P = pitchOf(f), W = P.w / 2, H = P.h / 2, G = P.goalW / 2;
  test(`${f} — 골, 옆벽, 기둥, 골대 상자, 선 밖 여백`, () => {
    const cfg = mk(f);
    const base = createMatch(cfg, 1);
    // 골
    let s = put(base, { state: { phase: 'play' }, ball: { x: W - 60, y: 0, vx: 700 }, players: away(P) });
    for (let t = 0; t < 120 && s.phase === 'play'; t++) s = step(s, cfg, idle(cfg));
    assert.deepEqual(s.score, [1, 0], '오른쪽 골');
    s = put(base, { state: { phase: 'play' }, ball: { x: -W + 60, y: 0, vx: -700 }, players: away(P) });
    for (let t = 0; t < 120 && s.phase === 'play'; t++) s = step(s, cfg, idle(cfg));
    assert.deepEqual(s.score, [0, 1], '왼쪽 골');
    // 골문 옆 벽: 튕겨 나온다
    s = put(base, { state: { phase: 'play' }, ball: { x: W - 60, y: G + 80, vx: 700 }, players: away(P) });
    let maxX = -Infinity;
    for (let t = 0; t < 60; t++) { s = step(s, cfg, idle(cfg)); maxX = Math.max(maxX, s.ball.x); }
    assert.deepEqual(s.score, [0, 0]); assert.ok(maxX <= W - P.ballR + 0.01, `벽 ${maxX}`); assert.ok(s.ball.vx < 0);
    // 기둥 정면: 되돌아온다
    s = put(base, { state: { phase: 'play' }, ball: { x: W - 60, y: G, vx: 700 }, players: away(P) });
    let back = false;
    for (let t = 0; t < 40; t++) { s = step(s, cfg, idle(cfg)); if (s.ball.vx < 0) back = true; }
    assert.ok(back, '기둥'); assert.deepEqual(s.score, [0, 0]);
    // 골대 상자 안: 뒷벽·옆벽 밖으로 안 샌다
    s = put(base, { state: { phase: 'play' }, ball: { x: W - 40, y: 0, vx: 1200, vy: 300 }, players: away(P) });
    for (let t = 0; t < 100; t++) {
      s = step(s, cfg, idle(cfg));
      assert.ok(s.ball.x <= W + P.goalDepth, `뒷벽 ${s.ball.x}`);
      if (Math.abs(s.ball.x) > W) assert.ok(Math.abs(s.ball.y) <= G, `상자 옆벽 ${s.ball.y}`);
    }
    // 선 밖 여백: 선수는 나가고 바깥 테두리에서 멈춘다, 공은 선 안
    s = put(base, { state: { phase: 'play' }, ball: { x: 0, y: H - 60, vy: 400 }, players: { 0: { x: -200, y: H - 80 }, 1: { x: W - 100, y: -H + 100 } } });
    let maxBallY = 0, maxMeY = 0;
    for (let t = 0; t < 180; t++) { s = step(s, cfg, [{ x: 0, y: 1, kick: false }, NO_INPUT]); maxBallY = Math.max(maxBallY, s.ball.y); maxMeY = Math.max(maxMeY, s.players[0].y); }
    assert.ok(maxMeY > H + 5 && maxMeY <= H + P.marginY - P.playerR + 1e-6, `선수 ${maxMeY}`);
    assert.ok(maxBallY <= H - P.ballR + 1e-6, `공 ${maxBallY}`);
  });

  test(`${f} — 킥오프 자리: 1~6명, 두 편 인원이 달라도 자기 진영·가운데 원 밖·안 겹침`, () => {
    for (let a = 0; a <= 6; a++) for (let b = 0; b <= 6; b++) {
      if (a + b === 0) continue;
      const cfg = mk(f, a, b);
      assert.deepEqual(sideCounts(cfg), [a, b]);
      const s = createMatch(cfg, 5);
      for (const p of s.players) {
        const side = cfg.players[p.id].side;
        assert.ok(side === 0 ? p.x < -P.w * 0.05 : p.x > P.w * 0.05, `${a}대${b} id ${p.id} x=${p.x}`);
        assert.ok(Math.hypot(p.x, p.y) >= P.centerR + P.playerR, `${a}대${b} 가운데 원 밖`);
        assert.ok(Math.abs(p.x) < W && Math.abs(p.y) < H, '선 안');
      }
      for (let i = 0; i < s.players.length; i++) for (let j = i + 1; j < s.players.length; j++) {
        const d = Math.hypot(s.players[i].x - s.players[j].x, s.players[i].y - s.players[j].y);
        assert.ok(d >= P.playerR * 2, `${a}대${b} ${i}·${j} 겹침 ${d}`);
      }
    }
    // 같은 인원이면 좌우 대칭(흔들기 전 자리)
    for (let n = 1; n <= 6; n++) for (let k = 0; k < n; k++) {
      const l = formationSpot(f, n, k, 0), r = formationSpot(f, n, k, 1);
      assert.equal(l.x, -r.x); assert.equal(l.y, r.y);
    }
  });

  test(`${f} — 결정성: 같은 씨앗·입력이면 봇 600틱 뒤 글자까지 같다, 판 밖으로 안 나간다`, () => {
    const cfg = mk(f, 3, 2);
    const run = () => {
      let s = createMatch(cfg, 9);
      for (let t = 0; t < 600; t++) {
        s = step(s, cfg, cfg.players.map((p) => botInput(s, cfg, p.id)));
        for (const p of s.players) assert.ok(Math.abs(p.x) <= W + P.marginX && Math.abs(p.y) <= H + P.marginY);
        assert.ok(Math.abs(s.ball.x) <= W + P.goalDepth && Math.abs(s.ball.y) <= H);
      }
      return JSON.stringify(s);
    };
    assert.equal(run(), run());
  });
}

test('경기장마다 계산이 다르다 — 같은 상태라도 field 에 따라 골이 되고 안 되고', () => {
  // 보통 경기장 골라인 바로 앞(x=590)은 작은 경기장에선 선 밖(공은 못 있다) — 대신 x=440 으로 쏜 공은 S 에서만 골
  const s0 = (cfg) => put(createMatch(cfg, 1), { state: { phase: 'play' }, ball: { x: 400, y: 0, vx: 900 }, players: { 0: { x: -300, y: 200 }, 1: { x: -300, y: -200 } } });
  const goalBy = (field, ticks) => { const cfg = mk(field); let s = s0(cfg); for (let t = 0; t < ticks && s.phase === 'play'; t++) s = step(s, cfg, idle(cfg)); return s.score[0]; };
  assert.equal(goalBy('S', 10), 1, 'S: 450 이 골라인');
  assert.equal(goalBy('M', 10), 0, 'M: 아직 골라인(600) 전');
});

test('봇 6대6(XL) — 실제로 차고, 한 편 봇들이 한 점에 몰리지 않고, 가장 뒤 봇은 공이 멀면 자기 진영', () => {
  const cfg = mk('XL', 6, 6, { minutes: 1 });
  let s = createMatch(cfg, 21);
  let kicks = 0, crowded = 0, samples = 0, keeperOut = 0, keeperSamples = 0;
  const W = pitchOf('XL').w / 2;
  for (let t = 0; t < 3600 && s.phase !== 'end'; t++) {
    const n = step(s, cfg, cfg.players.map((p) => botInput(s, cfg, p.id)));
    for (let i = 0; i < n.players.length; i++) if (n.players[i].kickCooldown > s.players[i].kickCooldown) kicks++;
    s = n;
    if (s.phase === 'play' && t % 10 === 0) {
      for (const side of [0, 1]) {
        const mine = s.players.filter((_, i) => cfg.players[i].side === side);
        const near = mine.filter((p) => Math.hypot(p.x - s.ball.x, p.y - s.ball.y) < 120).length;
        samples++; if (near >= 3) crowded++;
        const dir = side === 0 ? 1 : -1;
        if (dir * s.ball.x > W / 3) { keeperSamples++; if (dir * mine[0].x > 0) keeperOut++; }
      }
    }
  }
  assert.ok(kicks > 20, `킥 ${kicks}`);
  assert.ok(crowded / samples < 0.2, `공 옆 셋 이상 몰림 ${(crowded / samples).toFixed(2)}`);
  if (keeperSamples > 0) assert.ok(keeperOut / keeperSamples < 0.1, `수비가 상대 진영 ${keeperOut}/${keeperSamples}`);
});
