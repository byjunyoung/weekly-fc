// 3D 승부차기(2026-11-07 게임 묶음 5단계) — 2D 와 같은 차례·끝 규칙, 셋째 차원(높이·크로스바·골대·키퍼 몸 부피), 봇 성공률.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  penalty3d, createPenalty3, stepPenalty3, PEN3_IDLE, PEN3_CODES, KEEPER_X, SPOT_X, keeperCapsules, kickerPlan3,
} from '../../src/lib/games/penalty3d.ts';
import { penalty2d, buildPenalty, READY_TICKS, AIM_TICKS, AUTO_POWER } from '../../src/lib/games/penalty2d.ts';
import { PITCH3D } from '../../src/lib/game3d/sim.ts';
import { MAX_CODES } from '../../src/lib/games/net.ts';
import { penCfg } from './fixtures/games-cases-p2.mjs';

const { HW, goalHalfW: GW, goalH: GH } = PITCH3D;
const g = penalty3d;
const rng = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const idle = (c) => c.players.map(() => PEN3_IDLE);

/** 날아가는 공 하나를 손으로 세워(키퍼 자리 지정) 판정이 날 때까지. */
function fly(ball, gk = {}) {
  const c = penCfg(1, 1);
  let s = createPenalty3(c, 3);
  s = { ...s, phase: 'flight', phaseTicks: 0, ball: { x: HW - 1.2, y: 0, z: 1, vx: 15, vy: 0, vz: 0, ...ball }, gk: { ...s.gk, ...gk } };
  for (let t = 0; t < 200 && s.phase === 'flight'; t++) s = stepPenalty3(s, c, idle(c));
  return s.outcome;
}

test('판정 — 골문 안은 골, 크로스바 위는 노골(빗나감), 기둥·크로스바를 맞히면 골대, 키퍼 몸(서 있는 몸통)에 닿으면 막았다', () => {
  const away = { y: -GW - 0.3 };
  assert.equal(fly({ y: 1, z: 1 }, away), 'goal');
  assert.equal(fly({ y: 0, z: GH + 0.4, vz: 0 }, away), 'miss', '크로스바 위');
  assert.equal(fly({ y: GW + 0.7, z: 0.5 }, away), 'miss', '옆으로 빗나감');
  assert.equal(fly({ y: GW + 0.05, z: 1 }, away), 'post', '기둥');
  assert.equal(fly({ y: 0.8, z: GH + 0.05, vz: 0 }, away), 'post', '크로스바');
  assert.equal(fly({ y: 0, z: 1 }), 'save', '가운데 서 있는 키퍼 몸통');
  assert.equal(fly({ y: 1.9, z: 1 }), 'goal', '서 있으면 구석은 못 막는다');
  // 오른쪽 높이 던진 몸(손끝까지)이 구석 높은 공을 막는다
  assert.equal(fly({ y: 1.9, z: 1.6 }, { dive: 1, diveH: 2, dived: true, diveT: 0, lie: 30, y: 0.4 }), 'save');
  // 낮게 던진 몸 위로 높은 공은 지나간다
  assert.equal(fly({ y: 1.9, z: 1.85 }, { dive: 1, diveH: 0, dived: true, diveT: 0, lie: 30, y: 0.4 }), 'goal');
});

test('키퍼 몸 부피 — 서 있으면 몸통 + 짧은 팔, 던지면 그 쪽으로 누운 몸 하나, 가운데 던지기는 팔 벌리고 뛴다', () => {
  const base = { x: KEEPER_X, y: 0, vx: 0, vy: 0, z: 0, vz: 0, dive: 0, diveH: 1, diveT: 0, lie: 0, dived: false, armed: true };
  assert.equal(keeperCapsules(base).length, 2);
  const lying = keeperCapsules({ ...base, dive: -1, diveH: 2, dived: true, lie: 10 });
  assert.equal(lying.length, 1);
  assert.ok(lying[0][4] < -1.4, '왼쪽(−y)으로 손끝');
  const c = penCfg(1, 1, 5, 0, 2);
  let s = { ...createPenalty3(c, 1), phase: 'aim', phaseTicks: 0 };
  s = { ...s, gk: { ...s.gk, armed: true } };
  s = stepPenalty3(s, c, c.players.map((_, i) => (i === s.keeper ? { x: 0, y: 1, kick: true, aim: null } : PEN3_IDLE)));
  for (let t = 0; t < 8; t++) s = stepPenalty3(s, c, idle(c));
  assert.ok(s.gk.dived && s.gk.dive === 0 && s.gk.z > 0.3, `뛰었다 ${s.gk.z}`);
});

test('차례 — 2D 승부차기와 같은 편·키커·키퍼 순서(사람 수가 달라도)', () => {
  const c = penCfg(2, 3, 5, 1, 2);
  const turns = (adapter) => {
    let s = adapter.create(c, 9);
    const out = [];
    for (let t = 0; t < 60 * 60 * 8 && !adapter.ended(s) && out.length < 10; t++) {
      if (s.phase === 'ready' && s.phaseTicks === 0) out.push([s.side, s.kicker, s.keeper]);
      s = adapter.step(s, c, c.players.map((_, i) => adapter.botInput(s, c, i)));
    }
    return out;
  };
  // 결과가 달라 판이 끝나는 때는 다를 수 있다 — 둘 다 간 데까지(차례는 찬 수에만 달려 있다)
  const a = turns(penalty3d), b = turns(penalty2d), n = Math.min(a.length, b.length);
  assert.ok(n >= 6);
  assert.deepEqual(a.slice(0, n), b.slice(0, n));
});

test('5초 안에 안 차면 약한 가운데 땅볼이 나간다, 킥은 이 차기 안에서 뗐다가 눌러야 센다', () => {
  const c = penCfg(1, 1, 5, 0, 2);
  let s = createPenalty3(c, 4);
  const hold = c.players.map((_, i) => (i === s.kicker ? { x: 0, y: 0, kick: true, aim: null } : PEN3_IDLE));
  for (let t = 0; t < READY_TICKS + 30; t++) s = stepPenalty3(s, c, hold);   // 눌린 채 넘어왔다 — 안 모인다
  assert.equal(s.st.charge, 0);
  for (let t = 0; t < AIM_TICKS; t++) s = stepPenalty3(s, c, hold);
  assert.equal(s.phase, 'flight');
  assert.equal(s.power, AUTO_POWER);
  assert.ok(Math.abs(s.ball.vy) < 2 && s.ball.vz === 0, '가운데 땅볼');
});

test('조준은 떼는 순간의 입력에만 — 모으는 동안의 입력 정수에는 조준이 없고, 뗀 입력의 옆·높이로 공이 간다', () => {
  const c = penCfg(1, 1, 5, 0, 2);
  let s = createPenalty3(c, 6);
  for (let t = 0; t < READY_TICKS; t++) s = stepPenalty3(s, c, idle(c));
  const k = s.kicker;
  const charge = { x: 0, y: 0, kick: true, aim: null };
  assert.equal(g.decode(g.encode(charge)).aim, null);
  for (let t = 0; t < 36; t++) s = stepPenalty3(s, c, c.players.map((_, i) => (i === k ? charge : PEN3_IDLE)));
  const shot = g.decode(g.encode({ x: 0, y: 0, kick: false, aim: { y: -1.8, z: 1.5 } }));
  assert.deepEqual(shot.aim, { y: -1.8, z: 1.5 });
  s = stepPenalty3(s, c, c.players.map((_, i) => (i === k ? shot : PEN3_IDLE)));
  assert.equal(s.phase, 'flight');
  assert.ok(s.ball.vy < -1 && s.ball.vz > 1, `왼쪽 위로 ${s.ball.vy} ${s.ball.vz}`);
  assert.ok(PEN3_CODES <= MAX_CODES);
});

test('봇 키커 계획은 차기 씨앗만으로 — 높이가 섞여 있다(낮게·가운데·높이)', () => {
  const zs = Array.from({ length: 300 }, (_, i) => kickerPlan3(i * 2654435761 >>> 0).aim.z);
  assert.ok(zs.some((z) => z < 0.7) && zs.some((z) => z >= 0.7 && z < 1.45) && zs.some((z) => z >= 1.45));
  assert.deepEqual(kickerPlan3(12345), kickerPlan3(12345));
});

test('봇끼리 200판(무작위 능력치) — 성공률이 2D(68.6%)와 비슷하게 60~80%, 점수가 여러 가지', () => {
  const cnt = { goal: 0, save: 0, miss: 0, post: 0 }; const scores = new Set();
  for (let k = 0; k < 200; k++) {
    const r = rng(k * 7919 + 1);
    const roster = Array.from({ length: 14 }, (_, i) => ({ num: 100 + i, jersey: i + 1, name: `P${i}`, pace: 40 + Math.floor(r() * 50), dribble: 60, pass: 60, shoot: 40 + Math.floor(r() * 50), defend: 60, stamina: 60 }));
    const { config } = buildPenalty({ humans: [[], []], kicks: 5, first: 'random', roster, rnd: r });
    let s = g.create(config, k * 31 + 7);
    for (let t = 0; t < 60 * 60 * 10 && !g.ended(s); t++) s = g.step(s, config, config.players.map((_, i) => g.decode(g.encode(g.botInput(s, config, i)))));
    assert.ok(g.ended(s));
    for (const e of s.log) cnt[e.out]++;
    scores.add(`${s.scored[0]}:${s.scored[1]}`);
  }
  const tot = cnt.goal + cnt.save + cnt.miss + cnt.post, rate = cnt.goal / tot;
  assert.ok(rate > 0.6 && rate < 0.8, `성공률 ${(rate * 100).toFixed(1)}% ${JSON.stringify(cnt)}`);
  assert.ok(cnt.save > 0 && cnt.post > 0 && cnt.miss > 0);
  assert.ok(scores.size >= 8, `점수 ${scores.size}가지`);
  assert.ok(SPOT_X < HW);
});

test('3D 미니게임 계산 소스에 삼각함수·시계·난수 함수가 없다', () => {
  for (const f of ['src/lib/games/penalty3d.ts', 'src/lib/games/free3d.ts', 'src/lib/game3d/multiball3d.ts']) {
    const code = readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(code, /Math\.(sin|cos|tan|atan2?|hypot|pow|exp|log|random)\b|Date\.now|performance\.now|\*\*/, f);
  }
});

test('키커 화면 조준(aim3) — 모으는 동안엔 입력에 조준이 없고 떼는 틱에만, 키퍼 차례는 화면 좌우를 뒤집어 넘긴다', async () => {
  const { AIM3_START, pen3Input } = await import('../../src/react/game/views/penalty3d/aim3.ts');
  let l = { ...AIM3_START, kickNo: 0 };
  const sent = [];
  const tick = (h, phase = 'aim') => { const r = pen3Input(l, h, 'kick', phase); l = r.local; sent.push(r.input); };
  for (let i = 0; i < 20; i++) tick({ x: 1, y: -1, kick: false });          // 오른쪽 위로 겨눔(화면 위 = −y)
  for (let i = 0; i < 30; i++) tick({ x: 0, y: 0, kick: true });
  assert.ok(sent.every((i) => i.aim === null), '떼기 전엔 어디에도 조준이 없다');
  tick({ x: 0, y: 0, kick: false });
  const last = sent.at(-1).aim;
  assert.ok(last && last.y > 1 && last.z > 0.9, JSON.stringify(last));
  const keep = pen3Input(AIM3_START, { x: 1, y: -1, kick: true }, 'keep', 'flight').input;
  assert.deepEqual(keep, { x: -1, y: 1, kick: true, aim: null }, '골대 뒤 화면: 화면 오른쪽 = 경기 −y, 화면 위 = 높이');
  assert.deepEqual(pen3Input(AIM3_START, { x: 1, y: 0, kick: true }, null, 'aim').input, PEN3_IDLE, '구경은 입력 없음');
});

test('서든데스 상한 10쌍 — 둘 다 가만히 있어도(자동 슛을 가운데 키퍼가 막는다) 2D·3D 모두 4분 반 안에 무승부로 끝난다(전엔 7분 넘게)', async () => {
  const { SD_MAX, penalty2d: p2 } = await import('../../src/lib/games/penalty2d.ts');
  assert.equal(SD_MAX, 10);
  for (const adapter of [penalty3d, p2]) {
    const c = penCfg(1, 1, 5, 0, 2);
    let s = adapter.create(c, 11), t = 0;
    while (!adapter.ended(s) && t < 60 * 60 * 5) { s = adapter.step(s, c, c.players.map(() => adapter.idle)); t++; }
    assert.ok(adapter.ended(s), `${adapter.id} 5분 안에 안 끝났다`);
    assert.ok(t < 60 * 270, `${adapter.id} ${Math.round(t / 60)}초`);
    assert.equal(s.taken[0], 5 + SD_MAX);
  }
});
