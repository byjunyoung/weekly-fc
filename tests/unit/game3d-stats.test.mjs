// 3D 축구 시제품(2026-11-07) — 능력치 → 성능(src/lib/game3d/stats.ts). 2D 와 같은 방식(±10%, 배치 전은 평균).
import test from 'node:test';
import assert from 'node:assert/strict';
import { perfOf, BASE_PERF } from '../../src/lib/game3d/stats.ts';

const P = (num, v = {}) => ({ num, jersey: num, name: `P${num}`, pos: '', detail: '', foot: '', vest: null, note: '',
  pace: 0, dribble: 0, pass: 0, shoot: 0, defend: 0, stamina: 0, rot: null, avatar: '', ...v });
const all6 = (v) => ({ pace: v, dribble: v, pass: v, shoot: v, defend: v, stamina: v });
const KEYS = { pace: 'maxSpeed', dribble: 'control', shoot: 'shot', pass: 'pass', defend: 'tackle', stamina: 'mass' };

test('배치 전(여섯 칸 전부 0)은 BASE_PERF 그대로', () => {
  const roster = [P(1, all6(60)), P(2, all6(80)), P(3)];
  assert.deepEqual(perfOf(roster[2], roster), BASE_PERF);
  assert.deepEqual(perfOf(P(9), []), BASE_PERF);
});

test('명단 평균이면 BASE, 최고·최저도 ±10% 안쪽', () => {
  const roster = [P(1, all6(40)), P(2, all6(60)), P(3, all6(80)), P(4, all6(99)), P(5, all6(10)), P(6)];
  const avg = (40 + 60 + 80 + 99 + 10) / 5;
  assert.deepEqual(perfOf(P(7, all6(avg)), roster), BASE_PERF);
  for (const key of Object.values(KEYS)) {
    const hi = perfOf(roster[3], roster)[key], lo = perfOf(roster[4], roster)[key];
    assert.ok(hi > BASE_PERF[key] && hi <= BASE_PERF[key] * 1.1 + 1e-9, `${key} 최고 ${hi}`);
    assert.ok(lo < BASE_PERF[key] && lo >= BASE_PERF[key] * 0.9 - 1e-9, `${key} 최저 ${lo}`);
  }
});

test('매핑 — 능력치 하나는 성능 하나만 바꾼다(페이스→속도, 드리블→공 간수, 슈팅→슛, 패스→패스, 수비→빼앗기, 피지컬→무게)', () => {
  const roster = [P(1, all6(50)), P(2, all6(70)), P(3, all6(90))];
  for (const [stat, key] of Object.entries(KEYS)) {
    const r = perfOf(P(4, { ...all6(70), [stat]: 90 }), roster);
    for (const k of Object.values(KEYS)) {
      if (k === key) assert.ok(r[k] > BASE_PERF[k], `${stat} → ${k}`);
      else assert.equal(r[k], BASE_PERF[k], `${stat} 이 ${k} 를 건드렸다`);
    }
  }
});
