import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, step, eventsBetween, NO_INPUT, PITCH, TICK_HZ } from '../../src/lib/game/sim.ts';
import { BASE_PERF } from '../../src/lib/game/stats.ts';
import { botInput } from '../../src/lib/game/bot.ts';

const mk = (perSide, extra = {}) => {
  const players = [];
  for (let i = 0; i < perSide * 2; i++)
    players.push({ id: i, num: 10 + i, name: `P${i}`, side: i < perSide ? 0 : 1, bot: true, perf: { ...BASE_PERF } });
  return { perSide, minutes: 2, scoreLimit: 0, players, ...extra };
};
const botInputs = (s, cfg) => cfg.players.map((p) => botInput(s, cfg, p.id));
const idle = (cfg) => cfg.players.map(() => ({ ...NO_INPUT }));
/** 상태를 복사해 일부만 바꾼다(테스트용 배치). 선수는 {i:{x,y}} 로 옮기고 속도는 0. */
const put = (s, o) => {
  const n = JSON.parse(JSON.stringify(s));
  Object.assign(n, o.state ?? {});
  if (o.ball) n.ball = { vx: 0, vy: 0, ...o.ball };
  for (const [i, p] of Object.entries(o.players ?? {})) Object.assign(n.players[i], { vx: 0, vy: 0 }, p);
  return n;
};
const deepFreeze = (o) => { Object.values(o).forEach((v) => typeof v === 'object' && v !== null && deepFreeze(v)); return Object.freeze(o); };
const speed = (b) => Math.hypot(b.vx, b.vy);
const AWAY = { 0: { x: -300, y: 300 }, 1: { x: 300, y: -300 } };   // 1대1 에서 선수를 공 길 밖으로

test('TICK_HZ 는 60', () => assert.equal(TICK_HZ, 60));

test('결정성 — 같은 설정·씨앗·입력이면 600틱 뒤 상태가 글자까지 같다', () => {
  const cfg = mk(2);
  const run = (seed) => {
    let s = createMatch(cfg, seed);
    for (let t = 0; t < 600; t++) {
      const ins = cfg.players.map((p) => ({ x: Math.sin(t / 30 + p.id) , y: Math.cos(t / 40 - p.id), kick: (t + p.id) % 25 === 0 }));
      s = step(s, cfg, ins);
    }
    return s;
  };
  assert.equal(JSON.stringify(run(7)), JSON.stringify(run(7)));
  assert.notEqual(JSON.stringify(run(7)), JSON.stringify(run(8)), '씨앗이 다르면 킥오프 자리가 달라진다');
});

test('직렬화 — 봇 대 봇 600틱 뒤 JSON 왕복이 같고, 거기서 이어 가도 같다', () => {
  const cfg = mk(3);
  let s = createMatch(cfg, 5);
  for (let t = 0; t < 600; t++) s = step(s, cfg, botInputs(s, cfg));
  const copy = JSON.parse(JSON.stringify(s));
  assert.deepEqual(copy, s);
  const ins = botInputs(s, cfg);
  assert.equal(JSON.stringify(step(copy, cfg, ins)), JSON.stringify(step(s, cfg, ins)));
});

test('step 은 받은 state 를 바꾸지 않는다 — 깊이 얼린 상태로도 돈다', () => {
  const cfg = mk(2);
  let s = createMatch(cfg, 3);
  for (let t = 0; t < 300; t++) s = step(s, cfg, botInputs(s, cfg));
  const before = JSON.stringify(s);
  deepFreeze(s);
  const next = step(s, cfg, botInputs(s, cfg));   // 얼린 걸 쓰려 하면 strict 모드에서 던진다
  assert.equal(JSON.stringify(s), before);
  assert.notEqual(next, s);
  assert.equal(next.tick, s.tick + 1);
});

test('골 — 공이 골문으로 들어가면 goal 단계·점수 1·사건 하나, 뒤에 실점한 편 킥오프', () => {
  const cfg = mk(1);
  let s = put(createMatch(cfg, 1), { state: { phase: 'play', phaseTicks: 0 }, ball: { x: 540, y: 0, vx: 700 }, players: AWAY });
  const events = [];
  let goalAt = -1;
  for (let t = 0; t < 120 && goalAt < 0; t++) {
    const n = step(s, cfg, idle(cfg));
    events.push(...eventsBetween(s, n));
    s = n;
    if (s.phase === 'goal') goalAt = t;
  }
  assert.ok(goalAt >= 0, '120틱 안에 골이 나야 한다');
  assert.deepEqual(s.score, [1, 0]);
  assert.equal(events.filter((e) => e.type === 'goal').length, 1);
  assert.deepEqual(events.find((e) => e.type === 'goal'), { type: 'goal', side: 0, scorer: null });
  assert.equal(s.kickoffSide, 1);
  for (let t = 0; t < 200 && s.phase === 'goal'; t++) {
    const n = step(s, cfg, idle(cfg));
    events.push(...eventsBetween(s, n));
    s = n;
  }
  assert.equal(s.phase, 'kickoff');
  assert.equal(s.kickoffSide, 1);
  assert.deepEqual(s.ball, { x: 0, y: 0, vx: 0, vy: 0 });
  assert.equal(events.filter((e) => e.type === 'goal').length, 1, '골 사건이 두 번 나오면 안 된다');
});

test('왼쪽 골대로 들어가면 1 편이 득점', () => {
  const cfg = mk(1);
  let s = put(createMatch(cfg, 1), { state: { phase: 'play' }, ball: { x: -540, y: 30, vx: -700 }, players: AWAY });
  for (let t = 0; t < 120 && s.phase === 'play'; t++) s = step(s, cfg, idle(cfg));
  assert.deepEqual(s.score, [0, 1]);
  assert.equal(s.kickoffSide, 0);
});

test('골이 아니다 — 골문 옆 벽에 맞은 공은 튕겨 나오고 경기가 계속된다', () => {
  const cfg = mk(1);
  let s = put(createMatch(cfg, 1), { state: { phase: 'play' }, ball: { x: 540, y: 200, vx: 700 }, players: AWAY });
  let maxX = -Infinity;
  for (let t = 0; t < 60; t++) { s = step(s, cfg, idle(cfg)); maxX = Math.max(maxX, s.ball.x); }
  assert.equal(s.phase, 'play');
  assert.deepEqual(s.score, [0, 0]);
  assert.ok(maxX <= PITCH.w / 2 - PITCH.ballR + 0.01, `벽을 넘으면 안 된다(${maxX})`);
  assert.ok(s.ball.vx < 0, '튕겨 돌아와야 한다');
});

test('기둥에 맞은 공은 튕긴다 — 골이 아니다', () => {
  const cfg = mk(1);
  let s = put(createMatch(cfg, 1), { state: { phase: 'play' }, ball: { x: 540, y: PITCH.goalW / 2, vx: 700 }, players: AWAY });
  let hit = false;
  for (let t = 0; t < 40; t++) { s = step(s, cfg, idle(cfg)); if (s.ball.vx < 0) hit = true; }
  assert.ok(hit, '기둥 정면이면 되돌아온다');
  assert.equal(s.phase, 'play');
  assert.deepEqual(s.score, [0, 0]);
});

test('골대 상자 안 — 공은 뒷벽에 맞고 상자 밖으로 새지 않는다', () => {
  const cfg = mk(1);
  let s = put(createMatch(cfg, 1), { state: { phase: 'play' }, ball: { x: 560, y: 0, vx: 1200, vy: 300 }, players: AWAY });
  for (let t = 0; t < 100; t++) {
    s = step(s, cfg, idle(cfg));
    assert.ok(s.ball.x <= PITCH.w / 2 + PITCH.goalDepth, `뒷벽 뒤로 나감 ${s.ball.x}`);
    assert.ok(Math.abs(s.ball.y) <= PITCH.h / 2);
  }
});

test('가둠 — 4대4 봇 3000틱 동안 모든 몸이 유한하고 판 안에 있다', () => {
  const cfg = mk(4, { minutes: 5 });
  let s = createMatch(cfg, 11);
  const W = PITCH.w / 2, H = PITCH.h / 2, D = PITCH.goalDepth;
  const ok = (v) => Number.isFinite(v);
  for (let t = 0; t < 3000; t++) {
    s = step(s, cfg, botInputs(s, cfg));
    const b = s.ball;
    assert.ok([b.x, b.y, b.vx, b.vy].every(ok), `공 NaN t=${t}`);
    assert.ok(Math.abs(b.x) <= W + D && Math.abs(b.y) <= H, `공이 판 밖 t=${t} ${b.x},${b.y}`);
    if (Math.abs(b.x) > W) assert.ok(Math.abs(b.y) <= PITCH.goalW / 2, `상자 옆벽 밖 t=${t}`);
    for (const p of s.players) {
      assert.ok([p.x, p.y, p.vx, p.vy].every(ok), `선수 NaN t=${t}`);
      assert.ok(Math.abs(p.x) <= W + PITCH.marginX && Math.abs(p.y) <= H + PITCH.marginY, `선수가 여백 밖 t=${t}`);
    }
  }
  assert.ok(s.tick === 3000);
});

test('선수는 골문을 지나 그물 안까지 들어갈 수 있고(그물은 공만 막는다), 바깥 테두리에서 멈춘다', () => {
  const cfg = mk(1);
  let s = put(createMatch(cfg, 1), { state: { phase: 'play' }, ball: { x: 0, y: 300 }, players: { 0: { x: 500, y: 0 }, 1: { x: -300, y: 300 } } });
  for (let t = 0; t < 180; t++) s = step(s, cfg, [{ x: 1, y: 0, kick: false }, NO_INPUT]);
  assert.ok(s.players[0].x > PITCH.w / 2, `골라인을 넘었다 x=${s.players[0].x}`);
  assert.ok(s.players[0].x <= PITCH.w / 2 + PITCH.marginX - PITCH.playerR + 0.01, `바깥 테두리 x=${s.players[0].x}`);
});

test('킥 — 붙어 있는 공은 킥이 걷기보다 훨씬 빨리 보낸다', () => {
  const cfg = mk(1);
  const base = put(createMatch(cfg, 1), { state: { phase: 'play' }, ball: { x: 0, y: 0 }, players: { 0: { x: -35, y: 0 }, 1: { x: 300, y: 300 } } });
  let kicked = step(base, cfg, [{ x: 0, y: 0, kick: true }, NO_INPUT]);
  let walked = base, walkMax = 0;
  for (let t = 0; t < 10; t++) { walked = step(walked, cfg, [{ x: 1, y: 0, kick: false }, NO_INPUT]); walkMax = Math.max(walkMax, speed(walked.ball)); }
  assert.ok(speed(kicked.ball) > BASE_PERF.kick * 0.9, `킥 속도 ${speed(kicked.ball)}`);
  assert.ok(speed(kicked.ball) > walkMax * 1.5, `킥 ${speed(kicked.ball)} vs 걷기 ${walkMax}`);
  assert.ok(kicked.ball.vx > 0 && Math.abs(kicked.ball.vy) < 1, '선수→공 방향으로 간다');
  assert.equal(kicked.lastTouch, 0);
  assert.deepEqual(eventsBetween(base, kicked).filter((e) => e.type === 'kick'), [{ type: 'kick', by: 0 }]);
});

test('킥 쿨다운 — 바로 다음 틱엔 다시 안 찬다', () => {
  const cfg = mk(1);
  const base = put(createMatch(cfg, 1), { state: { phase: 'play' }, ball: { x: 0, y: 0 }, players: { 0: { x: -35, y: 0 }, 1: { x: 300, y: 300 } } });
  const k1 = step(base, cfg, [{ x: 0, y: 0, kick: true }, NO_INPUT]);
  assert.ok(k1.players[0].kickCooldown > 0);
  // 공을 다시 멈춰 세워 붙여 놓고 또 누른다
  const again = put(k1, { ball: { x: 0, y: 0 }, players: { 0: { x: -35, y: 0 } } });
  const k2 = step(again, cfg, [{ x: 0, y: 0, kick: true }, NO_INPUT]);
  assert.ok(speed(k2.ball) < 50, `쿨다운 중인데 찼다 ${speed(k2.ball)}`);
  assert.deepEqual(eventsBetween(again, k2).filter((e) => e.type === 'kick'), []);
  // 쿨다운이 끝나면 다시 찬다
  let s = k1;
  for (let t = 0; t < 30; t++) s = step(s, cfg, idle(cfg));
  assert.equal(s.players[0].kickCooldown, 0);
});

test('킥은 닿는 거리 밖이면 헛스윙', () => {
  const cfg = mk(1);
  const base = put(createMatch(cfg, 1), { state: { phase: 'play' }, ball: { x: 0, y: 0 }, players: { 0: { x: -120, y: 0 }, 1: { x: 300, y: 300 } } });
  const n = step(base, cfg, [{ x: 0, y: 0, kick: true }, NO_INPUT]);
  assert.equal(speed(n.ball), 0);
  assert.equal(n.players[0].kickCooldown, 0);
});

test('이동 — 최고 속도를 넘지 않고, 손을 떼면 선다', () => {
  const cfg = mk(1);
  let s = put(createMatch(cfg, 1), { state: { phase: 'play' }, ball: { x: 0, y: 300 }, players: { 0: { x: -500, y: 0 }, 1: { x: 300, y: 300 } } });
  let max = 0;
  let at10 = 0;
  for (let t = 0; t < 100; t++) { s = step(s, cfg, [{ x: 5, y: 5, kick: false }, NO_INPUT]); max = Math.max(max, speed(s.players[0])); if (t === 9) at10 = speed(s.players[0]); }   // 길이 1 넘는 입력은 1 로
  // 감쇠 방식("헥스볼 최대한 벤치마킹해"): 처음엔 바로 반응하고(0.17초에 최고 속도의 3분의 1 넘게), 최고 속도엔 천천히 닿는다
  assert.ok(at10 > BASE_PERF.maxSpeed * 0.3 && at10 < BASE_PERF.maxSpeed * 0.5, `10틱 뒤 ${at10}`);
  assert.ok(max <= BASE_PERF.maxSpeed + 1e-6, `최고 속도 ${max}`);
  assert.ok(max > BASE_PERF.maxSpeed * 0.95);
  // 손을 떼면 바로 서지 않고 길게 미끄러지다 선다(2026-11-06 "쫀득함" — 관성). 0.25초 뒤엔 반쯤 속도, 1초 뒤에도 조금, 2.5초 안엔 선다.
  for (let t = 0; t < 15; t++) s = step(s, cfg, idle(cfg));
  assert.ok(speed(s.players[0]) > BASE_PERF.maxSpeed * 0.45, '0.25초 뒤에도 미끄러지는 중');
  for (let t = 0; t < 45; t++) s = step(s, cfg, idle(cfg));
  assert.ok(speed(s.players[0]) > 1 && speed(s.players[0]) < BASE_PERF.maxSpeed * 0.15, '1초 뒤엔 거의 다 줄었다');
  for (let t = 0; t < 90; t++) s = step(s, cfg, idle(cfg));
  assert.ok(speed(s.players[0]) < 1e-6, '2.5초 안에 선다');
});

test('이동 — 경기장 길이를 4.5~6초에 건넌다', () => {
  const cfg = mk(1);
  let s = put(createMatch(cfg, 1), { state: { phase: 'play' }, ball: { x: 0, y: 300 }, players: { 0: { x: -PITCH.w / 2 + PITCH.playerR, y: 0 }, 1: { x: 300, y: 300 } } });
  let t = 0;
  while (s.players[0].x < PITCH.w / 2 - PITCH.playerR - 5 && t < 600) { s = step(s, cfg, [{ x: 1, y: 0, kick: false }, NO_INPUT]); t++; }
  assert.ok(t / TICK_HZ >= 4.5 && t / TICK_HZ <= 6, `건너는 데 ${t / TICK_HZ}초`);
});

test('시계와 끝 — 시간이 다 되면 end, 점수 앞선 편이 승자, 같으면 draw', () => {
  const cfg = mk(1, { minutes: 0.05 });   // 180틱
  const runOut = (score) => {
    let s = put(createMatch(cfg, 1), { state: { score } });
    for (let t = 0; t < 1500 && s.phase !== 'end'; t++) s = step(s, cfg, idle(cfg));
    return s;
  };
  assert.equal(runOut([0, 0]).winner, 'draw');
  assert.equal(runOut([1, 0]).winner, 0);
  assert.equal(runOut([1, 2]).winner, 1);
  assert.equal(runOut([0, 0]).phase, 'end');
});

test('시계는 play 중에만 간다', () => {
  const cfg = mk(1);
  let s = createMatch(cfg, 1);
  const start = s.ticksLeft;
  for (let t = 0; t < 100; t++) s = step(s, cfg, idle(cfg));   // 킥오프(타임아웃 240 전)
  assert.equal(s.phase, 'kickoff');
  assert.equal(s.ticksLeft, start);
  s = put(s, { state: { phase: 'play' } });
  for (let t = 0; t < 10; t++) s = step(s, cfg, idle(cfg));
  assert.equal(s.ticksLeft, start - 10);
});

test('점수 제한 1 — 첫 골 뒤 end, 득점한 편이 승자', () => {
  const cfg = mk(1, { scoreLimit: 1 });
  let s = put(createMatch(cfg, 1), { state: { phase: 'play' }, ball: { x: 540, y: 0, vx: 700 }, players: AWAY });
  const events = [];
  for (let t = 0; t < 400 && s.phase !== 'end'; t++) { const n = step(s, cfg, idle(cfg)); events.push(...eventsBetween(s, n)); s = n; }
  assert.equal(s.phase, 'end');
  assert.equal(s.winner, 0);
  assert.deepEqual(s.score, [1, 0]);
  assert.deepEqual(events.map((e) => e.type).filter((t) => t !== 'kick'), ['goal', 'end']);
});

test('킥오프 규칙 — 상대 편은 첫 접촉 전 가운데 원에 못 들어온다', () => {
  const cfg = mk(2);
  let s = createMatch(cfg, 4);
  assert.equal(s.kickoffSide, 0);
  const keepOut = PITCH.centerR + PITCH.playerR;
  let minD = Infinity;
  for (let t = 0; t < 200 && s.phase === 'kickoff'; t++) {
    // 1 편(2, 3번)이 가운데로 돌진, 0 편은 가만히
    const ins = cfg.players.map((p) => (p.side === 1 ? { x: -1, y: -0.05 * p.id, kick: false } : { ...NO_INPUT }));
    s = step(s, cfg, ins);
    for (const p of s.players.filter((q) => cfg.players[q.id].side === 1)) minD = Math.min(minD, Math.hypot(p.x, p.y));
  }
  assert.equal(s.phase, 'kickoff');
  assert.ok(minD >= keepOut - 0.5, `원 안으로 들어옴 ${minD} < ${keepOut}`);
});

test('킥오프 — 공을 차면 바로 play, 아무도 안 건드려도 4초 뒤엔 시작', () => {
  const cfg = mk(1);
  let s = createMatch(cfg, 2);
  s = put(s, { players: { 0: { x: -35, y: 0 } } });
  s = step(s, cfg, [{ x: 0, y: 0, kick: true }, NO_INPUT]);
  assert.equal(s.phase, 'play');
  let q = createMatch(cfg, 2);
  for (let t = 0; t < 239; t++) q = step(q, cfg, idle(cfg));
  assert.equal(q.phase, 'kickoff');
  q = step(q, cfg, idle(cfg));
  assert.equal(q.phase, 'play');
});

test('편성 — 1~4 명 모두 자기 진영에서 시작, 좌우 대칭', () => {
  for (const n of [1, 2, 3, 4]) {
    const cfg = mk(n);
    const s = createMatch(cfg, 1);
    for (const p of s.players) {
      const side = cfg.players[p.id].side;
      assert.ok(side === 0 ? p.x < -100 : p.x > 100, `${n}명 id ${p.id} x=${p.x}`);
      assert.ok(Math.hypot(p.x, p.y) >= PITCH.centerR + PITCH.playerR, '가운데 원 밖');
    }
    for (let i = 0; i < n; i++) assert.ok(Math.abs(s.players[i].x + s.players[n + i].x) < 1e-9);
  }
});

test('킥 사거리 — 가운데 3분의 1 끝(x=-200)에서 한 번 차면 골이 되고, 자기 진영 깊은 곳에선 안 된다', () => {
  const cfg = mk(1);
  const shootFrom = (x0) => {
    let s = put(createMatch(cfg, 1), { state: { phase: 'play' }, ball: { x: x0, y: 0 }, players: { 0: { x: x0 - 35, y: 0 }, 1: { x: 300, y: 300 } } });
    s = step(s, cfg, [{ x: 0, y: 0, kick: true }, NO_INPUT]);
    for (let t = 0; t < 600 && s.phase === 'play'; t++) s = step(s, cfg, idle(cfg));
    return s.score[0];
  };
  assert.equal(shootFrom(-200), 1);
  assert.equal(shootFrom(-450), 0);
});

test('킥을 누르고 있는 동안 kicking 이 켜진다 — 공이 멀어 차지 못해도, 세리머니·종료 중엔 꺼진다', () => {
  const cfg = mk(1);
  let s = put(createMatch(cfg, 1), { state: { phase: 'play' }, players: AWAY });
  const hold = [{ x: 0, y: 0, kick: true }, { ...NO_INPUT }];
  s = step(s, cfg, hold);
  assert.equal(s.players[0].kicking, true, '누르는 중');
  assert.equal(s.players[1].kicking, false, '안 누른 사람');
  assert.equal(s.players[0].kickCooldown, 0, '공이 멀어 실제로 차지는 않았다');
  s = step(s, cfg, idle(cfg));
  assert.equal(s.players[0].kicking, false, '떼면 꺼진다');
  s = step(put(s, { state: { phase: 'goal' } }), cfg, hold);
  assert.equal(s.players[0].kicking, false, '세리머니 중엔 입력을 안 받는다');
});

test('공에 무게가 있다 — 달려가 부딪치면 내 몸이 느려지고, 공은 멀리 튕겨 나가지 않고 내 앞에 붙어 간다', () => {
  const cfg = mk(1);
  let s = put(createMatch(cfg, 1), { state: { phase: 'play' }, ball: { x: 0, y: 0 }, players: { 0: { x: -200, y: 0 }, 1: { x: 400, y: 300 } } });
  const run = [{ x: 1, y: 0, kick: false }, { ...NO_INPUT }];
  let before = 0, hit = null;
  for (let t = 0; t < 120 && !hit; t++) { before = s.players[0].vx; s = step(s, cfg, run); if (s.ball.vx > 1) hit = s; }
  assert.ok(hit, '공에 닿았다');
  assert.ok(hit.players[0].vx < before * 0.9, `부딪친 순간 몸이 느려진다: ${before} → ${hit.players[0].vx}`);
  assert.ok(hit.ball.vx < before * 1.05, `공이 내 속도보다 훨씬 빠르게 튕겨 나가지 않는다: ${hit.ball.vx}`);
  // 계속 밀면 공은 1초 뒤에도 몸 앞 가까이에 있다(드리블이 붙는다)
  for (let t = 0; t < 60; t++) s = step(s, cfg, run);
  const gap = s.ball.x - s.players[0].x - PITCH.playerR - PITCH.ballR;
  assert.ok(gap < 40, `1초 뒤 공과 몸 사이 ${gap}`);
});

test('킥은 장전식 — 누르고 있으면 공이 닿는 순간 한 번 나가고, 계속 눌러도 다시 안 나가며, 뗐다 누르면 다시 나간다', () => {
  const cfg = mk(1);
  const near = { ball: { x: 0, y: 0 }, players: { 0: { x: -31, y: 0 }, 1: { x: 400, y: 300 } } };
  const hold = [{ x: 0, y: 0, kick: true }, { ...NO_INPUT }];
  let s = put(createMatch(cfg, 1), { state: { phase: 'play' }, ...near });
  const k1 = step(s, cfg, hold);
  assert.equal(eventsBetween(s, k1).filter((e) => e.type === 'kick').length, 1, '첫 킥');
  assert.equal(k1.players[0].kicking, false, '나가면 장전 표시가 꺼진다');
  // 계속 누른 채 0.5초 — 공을 다시 붙여 놔도 안 나간다
  s = k1; let extra = 0;
  for (let t = 0; t < 30; t++) { const b = put(s, near); const n = step(b, cfg, hold); extra += eventsBetween(b, n).filter((e) => e.type === 'kick').length; s = n; }
  assert.equal(extra, 0, '누르고만 있으면 다시 안 찬다');
  // 뗐다가(쿨다운 몇 틱) 다시 누르면 나간다
  for (let t = 0; t < 6; t++) s = step(put(s, near), cfg, idle(cfg));
  const b = put(s, near); const k2 = step(b, cfg, hold);
  assert.equal(eventsBetween(b, k2).filter((e) => e.type === 'kick').length, 1, '뗐다 누르면 다시 찬다');
});

test('킥을 장전하고 있으면 몸이 굼떠진다', () => {
  const cfg = mk(1);
  const start = put(createMatch(cfg, 1), { state: { phase: 'play' }, ball: { x: 0, y: 300 }, players: { 0: { x: -500, y: 0 }, 1: { x: 300, y: 300 } } });
  let free = start, armed = start;
  for (let t = 0; t < 120; t++) { free = step(free, cfg, [{ x: 1, y: 0, kick: false }, NO_INPUT]); armed = step(armed, cfg, [{ x: 1, y: 0, kick: true }, NO_INPUT]); }
  assert.ok(armed.players[0].vx < free.players[0].vx * 0.8, `${armed.players[0].vx} vs ${free.players[0].vx}`);
});

test('선 밖 여백 — 선수는 터치라인을 넘어 여백까지 나가고 바깥 테두리에서 멈춘다, 공은 선 안에서 튕긴다', () => {
  const cfg = mk(1);
  const H = PITCH.h / 2, R = PITCH.playerR, BR = PITCH.ballR;
  let s = put(createMatch(cfg, 1), { state: { phase: 'play' }, ball: { x: 0, y: H - 60, vx: 0, vy: 400 }, players: { 0: { x: -200, y: H - 80 }, 1: { x: 400, y: -300 } } });
  let maxBallY = 0, maxMeY = 0;
  for (let t = 0; t < 180; t++) { s = step(s, cfg, [{ x: 0, y: 1, kick: false }, NO_INPUT]); maxBallY = Math.max(maxBallY, s.ball.y); maxMeY = Math.max(maxMeY, s.players[0].y); }
  assert.ok(maxMeY > H + 5, `선수가 선을 넘었다: ${maxMeY}`);
  assert.ok(maxMeY <= H + PITCH.marginY - R + 1e-6, `바깥 테두리에서 멈춘다: ${maxMeY}`);
  assert.ok(maxBallY <= H - BR + 1e-6, `공은 선 안: ${maxBallY}`);
});

test('골대 기둥은 선수도 막는다 — 골라인을 따라 달려도 기둥을 뚫지 못한다', () => {
  const cfg = mk(1);
  const W = PITCH.w / 2, G = PITCH.goalW / 2, R = PITCH.playerR;
  let s = put(createMatch(cfg, 1), { state: { phase: 'play' }, ball: { x: 0, y: 300 }, players: { 0: { x: W, y: G + 120 }, 1: { x: -400, y: -300 } } });
  let minDist = Infinity;
  for (let t = 0; t < 150; t++) { s = step(s, cfg, [{ x: 0, y: -1, kick: false }, NO_INPUT]); const p = s.players[0]; minDist = Math.min(minDist, Math.hypot(p.x - W, p.y - G)); }
  assert.ok(minDist >= R + PITCH.postR - 1.5, `기둥과 가장 가까웠던 거리 ${minDist}`);
});
