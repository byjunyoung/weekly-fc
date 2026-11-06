// 3D 프리킥(2026-11-07 게임 묶음 6단계) — 2D 와 같은 자리·점수·차례, 셋째 차원(벽 넘기기·크로스바·벽 뛰기·감기), 대본 키커 성공률, 조준 비밀.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { freekick3d, createFreekick3, stepFreekick3, FK3_SPOTS, FK_SCALE, fk3Path, fk3Wall, wallCapsules } from '../../src/lib/games/freekick3d.ts';
import { FK_SPOTS, buildFreekick, fkTurn } from '../../src/lib/games/freekick2d.ts';
import { PEN3_IDLE } from '../../src/lib/games/penalty3d.ts';
import { PITCH3D } from '../../src/lib/game3d/sim.ts';
import { fk3Cfg } from './fixtures/games-cases-p6.mjs';

const { HW, goalHalfW: GW, goalH: GH } = PITCH3D;
const g = freekick3d;
const idle = (c) => c.players.map(() => PEN3_IDLE);

/** 날아가는 공 하나를 손으로(키퍼·벽은 그 자리) — 판정까지. */
function fly(spot, ball, gk = {}) {
  const c = fk3Cfg(1);
  let s = createFreekick3(c, 3);
  s = { ...s, kickNo: spot, spot, phase: 'flight', phaseTicks: 0, ball: { ...s.ball, ...ball }, gk: { ...s.gk, ...gk } };
  for (let t = 0; t < 200 && s.phase === 'flight'; t++) s = stepFreekick3(s, c, idle(c));
  return s;
}

test('자리 다섯 — 2D 자리를 m 로(같은 배치·점수), 벽은 공과 가까운 기둥 사이', () => {
  assert.equal(FK3_SPOTS.length, 5);
  FK3_SPOTS.forEach((s, i) => {
    assert.equal(s.pts, FK_SPOTS[i].pts);
    assert.ok(Math.abs(s.x - (HW - FK_SPOTS[i].y * FK_SCALE)) < 1e-9 && Math.abs(s.y - FK_SPOTS[i].x * FK_SCALE) < 1e-9);
    const w = fk3Wall(i);
    assert.equal(w.length, 3);
    assert.ok(w.every((p) => p.x > s.x + 2 && p.x < HW - 3), `벽 ${i}`);
  });
});

test('판정 — 골문 안 골(+점수), 크로스바 위 빗나감, 벽 몸에 닿으면 벽, 키퍼 몸 막음, 크로스바 맞히면 골대', () => {
  const away = { y: -GW - 0.3 };
  const goal = fly(0, { x: HW - 1.2, y: 1, z: 1, vx: 15, vy: 0, vz: 0 }, away);
  assert.equal(goal.outcome, 'goal');
  assert.equal(goal.points[0], FK3_SPOTS[0].pts);
  assert.equal(fly(0, { x: HW - 1.2, y: 0.5, z: GH + 0.4, vx: 15, vy: 0, vz: 0 }, away).outcome, 'miss');
  assert.equal(fly(0, { x: HW - 1.2, y: 0.8, z: GH + 0.05, vx: 15, vy: 0, vz: 0 }, away).outcome, 'post');
  assert.equal(fly(0, { x: HW - 1.2, y: 0, z: 1, vx: 15, vy: 0, vz: 0 }, { y: 0 }).outcome, 'save');
  const w = fk3Wall(0)[1];
  assert.equal(fly(0, { x: w.x - 1, y: w.y, z: 1, vx: 15, vy: 0, vz: 0 }, away).outcome, 'wall');
});

test('벽은 공이 나가고 곧 같이 뛴다(결정적), 몸 캡슐이 그만큼 올라간다', () => {
  const c = fk3Cfg(1);
  let s = { ...createFreekick3(c, 5), phase: 'flight', phaseTicks: 0, ball: { x: 0, y: 3, z: 0.18, vx: 5, vy: 0, vz: 0 } };
  let top = 0;
  for (let t = 0; t < 40; t++) { s = stepFreekick3(s, c, idle(c)); top = Math.max(top, s.wallZ); }
  assert.ok(top > 0.2 && top < 0.4, `뛴 높이 ${top}`);
  assert.ok(wallCapsules(0, 0.3)[0][2] > wallCapsules(0, 0)[0][2]);
});

test('감아차기 — 같은 조준·세기에서 감기 +1 이면 +y 쪽으로, −1 이면 −y 쪽으로 휘어 닿는다', () => {
  const end = (curl) => fk3Path(3, { y: 0, z: 1 }, 0.6, curl, 1).at(-1);
  const a = end(-1), b = end(0), c = end(1);
  assert.ok(a.y < b.y && b.y < c.y, `${a.y} ${b.y} ${c.y}`);
});

test('차례 — 2D 와 같다(자리마다 방 사람이 차례로 한 번씩, 모두 5n 번)', () => {
  const c = fk3Cfg(3, 3);
  let s = g.create(c, 1);
  const seen = [];
  for (let t = 0; t < 60 * 60 * 20 && !g.ended(s); t++) {
    if (s.phase === 'ready' && s.phaseTicks === 0) seen.push([s.spot, s.kicker]);
    s = g.step(s, c, c.players.map((_, i) => g.botInput(s, c, i)));
  }
  assert.ok(g.ended(s));
  assert.deepEqual(seen, Array.from({ length: 15 }, (_, k) => { const t = fkTurn(k, 3); return [t.spot, t.kicker]; }));
  assert.equal(s.log.length, 15);
});

test('조준·감기는 떼는 틱의 입력에만 — 모으는 동안엔 입력 정수에 없고, 뗀 입력의 옆·높이·감기로 나간다', async () => {
  const { FK3_LOCAL, fk3Input } = await import('../../src/react/game/views/freekick3d/aim3.ts');
  let l = { ...FK3_LOCAL, kickNo: 0 };
  const sent = [];
  const tick = (h, phase = 'aim') => { const r = fk3Input(l, h, true, phase); l = r.local; sent.push(r.input); };
  for (let i = 0; i < 20; i++) tick({ x: 1, y: -1, kick: false });
  for (let i = 0; i < 30; i++) tick({ x: -1, y: 0, kick: true });   // 모으는 동안 ← = 감기 −1
  assert.ok(sent.every((i) => i.aim === null && i.x === 0));
  tick({ x: 0, y: 0, kick: false });
  const last = sent.at(-1);
  assert.equal(last.x, -1);
  assert.ok(last.aim.y > 0.5 && last.aim.z > 0.9, JSON.stringify(last));
  assert.deepEqual(g.decode(g.encode(last)).x, -1);
  assert.deepEqual(fk3Input(l, { x: 1, y: 0, kick: true }, false, 'aim').input, PEN3_IDLE, '구경은 입력 없음');
});

test('대본 키커 자리마다 성공률 — 2D(69·40·32·34·32%) 와 같은 띠: 정면 50~85%, 나머지 20~60%', () => {
  const roster = [{ num: 7, jersey: 7, name: 'A', pace: 60, dribble: 60, pass: 60, shoot: 60, defend: 60, stamina: 60 }];
  const config = buildFreekick([{ num: 7, name: 'A' }], roster);
  config.players[0].bot = true;
  const goals = [0, 0, 0, 0, 0], N = 120;
  for (let k = 0; k < N; k++) {
    let s = g.create(config, k * 7919 + 3);
    while (!g.ended(s)) s = g.step(s, config, [g.decode(g.encode(g.botInput(s, config, 0)))]);
    for (const e of s.log) if (e.out === 'goal') goals[e.spot]++;
  }
  const rate = goals.map((v) => v / N);
  assert.ok(rate[0] > 0.5 && rate[0] < 0.85, `정면 ${rate[0]}`);
  rate.slice(1).forEach((r, i) => assert.ok(r > 0.2 && r < 0.6, `자리 ${i + 1}: ${r}`));
});

test('8명 판 스냅샷(pack) 2.5KB 이하 — 기록 40줄이 다 찬 끝까지', () => {
  const c = fk3Cfg(8, 8);
  let s = g.create(c, 2), max = 0;
  while (!g.ended(s)) {
    const qs = c.players.map((_, i) => g.encode(g.botInput(s, c, i)));
    s = g.step(s, c, qs.map((q) => g.decode(q)));
    if (s.tick % 6 === 0) max = Math.max(max, JSON.stringify({ t: 'snap', from: 'c-0123456789abcdef', seed: 4294967295, tick: s.tick, state: g.pack(s), inputs: qs, paused: false }).length);
  }
  assert.equal(s.log.length, 40);
  assert.ok(max <= 2500, `${max}B`);
});

test('6단계 계산 소스에 삼각함수·시계·난수 함수가 없다', () => {
  for (const f of ['src/lib/games/freekick3d.ts', 'src/lib/games/dribble3d.ts', 'src/lib/games/penalty3d.ts']) {
    const code = readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(code, /Math\.(sin|cos|tan|atan2?|hypot|pow|exp|log|random)\b|Date\.now|performance\.now|\*\*/, f);
  }
});
