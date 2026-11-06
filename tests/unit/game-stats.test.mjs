import test from 'node:test';
import assert from 'node:assert/strict';
import { perfOf, BASE_PERF } from '../../src/lib/game/stats.ts';

const P = (num, v = {}) => ({ num, jersey: num, name: `P${num}`, pos: '', detail: '', foot: '', vest: null, note: '',
  pace: 0, dribble: 0, pass: 0, shoot: 0, defend: 0, stamina: 0, rot: null, avatar: '', ...v });
const all6 = (v) => ({ pace: v, dribble: v, pass: v, shoot: v, defend: v, stamina: v });

test('배치 전(여섯 칸 전부 0)은 BASE_PERF 와 정확히 같다', () => {
  const roster = [P(1, all6(60)), P(2, all6(80)), P(3)];
  assert.deepEqual(perfOf(roster[2], roster), BASE_PERF);
  assert.deepEqual(perfOf(P(9), []), BASE_PERF);
});

test('명단 평균인 선수는 BASE 와 같고, 최고·최저는 ±10% 안쪽', () => {
  const roster = [P(1, all6(40)), P(2, all6(60)), P(3, all6(80)), P(4, all6(95)), P(5, all6(20)), P(6)];
  const avg = (40 + 60 + 80 + 95 + 20) / 5;   // 0 인 사람은 평균에서 빠진다
  const mid = P(7, all6(avg));
  assert.deepEqual(perfOf(mid, roster), BASE_PERF);
  for (const [key, stat] of [['maxSpeed', 'pace'], ['accel', 'dribble'], ['kick', 'shoot'], ['mass', 'stamina']]) {
    const hi = perfOf(roster[3], roster)[key], lo = perfOf(roster[4], roster)[key];
    assert.ok(hi > BASE_PERF[key] && hi <= BASE_PERF[key] * 1.1 + 1e-9, `${stat} 최고 ${hi}`);
    assert.ok(lo < BASE_PERF[key] && lo >= BASE_PERF[key] * 0.9 - 1e-9, `${stat} 최저 ${lo}`);
  }
});

test('범위를 넘는 능력치는 ±10% 에서 잘린다', () => {
  const roster = [P(1, all6(10)), P(2, all6(99)), P(3, all6(50))];
  for (const key of ['maxSpeed', 'accel', 'kick', 'mass']) {
    assert.ok(perfOf(roster[1], roster)[key] <= BASE_PERF[key] * 1.1 + 1e-9);
    assert.ok(perfOf(roster[0], roster)[key] >= BASE_PERF[key] * 0.9 - 1e-9);
  }
});

test('매핑 — 페이스는 최고 속도만, 드리블은 가속만, 슈팅은 킥만, 피지컬은 무게만 바꾼다', () => {
  const roster = [P(1, all6(50)), P(2, all6(70)), P(3, all6(90))];
  const only = (stat, v) => P(4, { ...all6(70), [stat]: v });
  const keys = { pace: 'maxSpeed', dribble: 'accel', shoot: 'kick', stamina: 'mass' };
  for (const [stat, key] of Object.entries(keys)) {
    const r = perfOf(only(stat, 90), roster);
    for (const k of Object.keys(BASE_PERF)) {
      if (k === key) assert.ok(r[k] > BASE_PERF[k], `${stat} → ${k}`);
      else assert.equal(r[k], BASE_PERF[k], `${stat} 가 ${k} 를 건드림`);
    }
  }
  // 패스·수비는 쓰지 않는다
  const r = perfOf(P(5, { ...all6(70), pass: 99, defend: 99 }), roster);
  assert.deepEqual(r, BASE_PERF);
});

test('단조 — 능력치가 오르면 성능도 안 내려간다', () => {
  const roster = [P(1, all6(50)), P(2, all6(70)), P(3, all6(90))];
  for (const key of ['maxSpeed', 'accel', 'kick', 'mass']) {
    const stat = { maxSpeed: 'pace', accel: 'dribble', kick: 'shoot', mass: 'stamina' }[key];
    let prev = -Infinity;
    for (let v = 1; v <= 99; v++) {
      const cur = perfOf(P(9, { ...all6(60), [stat]: v }), roster)[key];
      assert.ok(cur >= prev, `${stat}=${v}`);
      prev = cur;
    }
    assert.ok(prev > perfOf(P(9, { ...all6(60), [stat]: 1 }), roster)[key], '완전히 평평하면 안 된다');
  }
});

test('한 칸만 0 이면 그 칸만 평균으로 친다', () => {
  const roster = [P(1, all6(50)), P(2, all6(90))];
  const r = perfOf(P(3, { ...all6(90), pace: 0 }), roster);
  assert.equal(r.maxSpeed, BASE_PERF.maxSpeed);
  assert.ok(r.kick > BASE_PERF.kick);
});
