// 게임 어댑터 약속 검사(2026-11-07 게임 묶음 토대). 등록할 게임마다 CASES 에 한 줄 — 같은 검사를 그대로 받는다.
// 왜 이것들인가: 방장이 계산하고 손님이 같은 step 으로 예측한다(온라인 스펙 §2.5). 그러려면 step 이 결정적이고, 상태가 JSON 으로
// 그대로 오가고, 받은 상태를 바꾸지 않고, 입력 정수가 안정해야 한다. 채널에서 온 것(설정·상태)은 모양 검사가 걸러야 한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TICK_HZ } from '../../src/lib/games/adapter.ts';
import { GAMES } from '../../src/lib/games/registry.ts';
import { match2d } from '../../src/lib/games/match2d.ts';
import { match3d } from '../../src/lib/games/match3d.ts';
import { MAX_CODES } from '../../src/lib/games/net.ts';
import { BASE_PERF as BASE_PERF_3D } from '../../src/lib/game3d/stats.ts';
import { TICK_HZ as SIM_HZ } from '../../src/lib/game/sim.ts';
import { BASE_PERF } from '../../src/lib/game/stats.ts';
import { P2_CASES } from './fixtures/games-cases-p2.mjs';
import { P3_CASES } from './fixtures/games-cases-p3.mjs';
import { P5_CASES } from './fixtures/games-cases-p5.mjs';

const cfg2d = (a, b, field = 'M', minutes = 2) => ({
  field, minutes, scoreLimit: 0,
  players: Array.from({ length: a + b }, (_, i) => ({ id: i, num: 10 + i, name: `P${i}`, side: i < a ? 0 : 1, bot: i !== 0, perf: { ...BASE_PERF } })),
});

// 3D 경기 — 편마다 [골키퍼 봇, 필드…](방 규칙 match3d-room.ts 의 차례). human = 사람 자리 id 들.
const cfg3d = (a, b, minutes = 2, human = [3]) => ({
  minutes, scoreLimit: 0,
  players: Array.from({ length: a + b }, (_, i) => {
    const side = i < a ? 0 : 1, gk = i === 0 || i === a;
    return { id: i, num: 10 + i, name: `P${i}`, side, bot: gk || !human.includes(i), gk, perf: { ...BASE_PERF_3D } };
  }),
});

/** 게임마다: 검사에 쓸 설정들, 짧게 끝나는 설정과 그 틱 한도, 상태를 그 게임만 아는 방식으로 망가뜨리는 법, 빠져도 되는 상태 필드. */
const CASES = [
  {
    adapter: match2d,
    configs: [cfg2d(1, 1, 'S'), cfg2d(3, 3, 'M'), cfg2d(2, 4, 'L'), cfg2d(6, 6, 'XL'), cfg2d(1, 0, 'S')],
    short: { config: cfg2d(2, 2, 'S', 1), maxTicks: 60 * 60 * 2 },
    // 자리 수가 다른 상태(설정과 어긋남), 자리 id 가 어긋난 상태, 모르는 단계
    mangleState: [
      (s) => ({ ...s, players: s.players.slice(1) }),
      (s) => ({ ...s, players: [...s.players, s.players[0]] }),
      (s) => ({ ...s, players: s.players.map((p, i) => ({ ...p, id: i === 0 ? 1 : p.id })) }),
      (s) => ({ ...s, phase: 'zz' }),
      (s) => ({ ...s, lastTouch: s.players.length }),
      (s) => ({ ...s, score: [0] }),
    ],
    mangleConfig: [
      (c) => ({ ...c, field: 'auto' }),
      (c) => ({ ...c, players: [] }),
      (c) => ({ ...c, players: c.players.map((p, i) => ({ ...p, id: i + 1 })) }),
      (c) => ({ ...c, players: [...c.players, ...cfg2d(7, 0).players].map((p, i) => ({ ...p, id: i, side: 0 })) }),
    ],
    optionalStateKeys: ['lastAssist', 'prevTouch'],   // 도움 기록 전의 상태도 받던 너그러움(예전 net.ts 그대로)
  },
  {
    adapter: match3d,
    configs: [cfg3d(5, 5), cfg3d(3, 3, 2, [1, 4, 5]), cfg3d(4, 5, 3, [2, 3]), cfg3d(5, 3, 1, [])],
    short: { config: cfg3d(5, 5, 0.5, []), maxTicks: 60 * 60 * 2 },
    // 자리 수가 다른 상태, 자리 id 어긋남, 모르는 단계, 소유자가 자리 밖, 점수 칸 모자람, 찬 사람이 자리 밖, 기록 칸 모자람
    mangleState: [
      (s) => ({ ...s, players: s.players.slice(1) }),
      (s) => ({ ...s, players: [...s.players, s.players[0]] }),
      (s) => ({ ...s, players: s.players.map((p, i) => ({ ...p, id: i === 0 ? 1 : p.id })) }),
      (s) => ({ ...s, phase: 'zz' }),
      (s) => ({ ...s, owner: s.players.length }),
      (s) => ({ ...s, score: [0] }),
      (s) => ({ ...s, lastKick: { by: s.players.length, kind: 'shot', tick: 1 } }),
      (s) => ({ ...s, count: { ...s.count, lobs: [0] } }),
      (s) => ({ ...s, players: s.players.map((p, i) => (i === 0 ? { ...p, sprint: 1 } : p)) }),
    ],
    // 골키퍼가 사람, 한 편 골키퍼 둘, 골키퍼가 편 첫 자리가 아님, 한 편 여섯, 선수 없음
    mangleConfig: [
      (c) => ({ ...c, players: c.players.map((p, i) => (i === 0 ? { ...p, bot: false } : p)) }),
      (c) => ({ ...c, players: c.players.map((p, i) => (i === 1 ? { ...p, gk: true, bot: true } : p)) }),
      (c) => ({ ...c, players: c.players.map((p, i) => (i === 0 ? { ...p, gk: false } : i === 1 ? { ...p, gk: true, bot: true } : p)) }),
      (c) => ({ ...c, players: [...c.players, ...cfg3d(6, 0).players].map((p, i) => ({ ...p, id: i, side: 0, gk: i === 0 })) }),
      (c) => ({ ...c, players: [] }),
    ],
    optionalStateKeys: [],
  },
  ...P2_CASES,
  ...P3_CASES,
  ...P5_CASES,
];

// ── 도구 ──
/** 작은 난수기(mulberry32) — 입력 열을 고정하려고. */
const rng = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
/** 정해진 입력 열로 n 틱. 입력은 정수에서 풀어 쓴다(방장·손님이 하는 대로). */
function run(g, config, seed, n, inSeed = 7) {
  const r = rng(inSeed), out = [];
  let s = g.create(config, seed);
  out.push(s);
  for (let t = 0; t < n; t++) {
    const inputs = Array.from({ length: g.slots(config) }, () => g.decode(Math.floor(r() * g.codes)));
    s = g.step(s, config, inputs);
    out.push(s);
  }
  return out;
}
/** 숫자 잎마다 경로. */
function numberPaths(v, path = []) {
  if (typeof v === 'number') return [path];
  if (Array.isArray(v)) return v.flatMap((x, i) => numberPaths(x, [...path, i]));
  if (v && typeof v === 'object') return Object.keys(v).flatMap((k) => numberPaths(v[k], [...path, k]));
  return [];
}
function setAt(v, path, x) {
  const c = structuredClone(v);
  let o = c;
  for (let i = 0; i < path.length - 1; i++) o = o[path[i]];
  o[path.at(-1)] = x;
  return c;
}
const deepFreeze = (o) => { if (o && typeof o === 'object') { Object.freeze(o); for (const k of Object.keys(o)) deepFreeze(o[k]); } return o; };

for (const C of CASES) {
  const g = C.adapter;

  test(`[${g.id}] 결정적 — 같은 설정·씨앗·입력이면 두 번 돌려도 매 틱 같다`, () => {
    for (const config of C.configs) {
      const a = run(g, config, 12345, 400), b = run(g, config, 12345, 400);
      assert.deepEqual(a, b);
      assert.notDeepEqual(run(g, config, 12345, 400, 8).at(-1), a.at(-1), '다른 입력이면 다른 결과(입력이 실제로 쓰인다)');
    }
  });

  test(`[${g.id}] JSON 그대로 — 상태·설정이 JSON 을 오가도 같고, 오간 상태에서 이어 돌려도 같다`, () => {
    for (const config of C.configs) {
      assert.deepEqual(JSON.parse(JSON.stringify(config)), config);
      const states = run(g, config, 99, 300);
      for (const s of states) assert.deepEqual(JSON.parse(JSON.stringify(s)), s);
      const mid = states[150], again = JSON.parse(JSON.stringify(mid));
      const idle = Array.from({ length: g.slots(config) }, () => g.idle);
      assert.deepEqual(g.step(again, config, idle), g.step(mid, config, idle));
    }
  });

  test(`[${g.id}] step 은 받은 상태·설정·입력을 바꾸지 않는다`, () => {
    for (const config of C.configs) {
      const states = run(g, config, 5, 120);
      const s = deepFreeze(structuredClone(states[60])), c = deepFreeze(structuredClone(config));
      const inputs = deepFreeze(Array.from({ length: g.slots(config) }, (_, i) => g.decode(i % g.codes)));
      assert.doesNotThrow(() => g.step(s, c, inputs));
      assert.deepEqual(s, states[60]);
    }
  });

  test(`[${g.id}] 틱은 step 마다 커진다, 단계는 글자`, () => {
    for (const config of C.configs) {
      const states = run(g, config, 3, 200);
      for (let i = 1; i < states.length; i++) assert.ok(g.tick(states[i]) > g.tick(states[i - 1]));
      for (const s of states) assert.equal(typeof g.phase(s), 'string');
    }
  });

  test(`[${g.id}] 입력 정수 — 0..codes-1 이 안정하고, 범위 밖은 idle, idle 은 범위 안`, () => {
    assert.ok(Number.isInteger(g.codes) && g.codes > 0 && g.codes <= MAX_CODES);
    for (let q = 0; q < g.codes; q++) {
      const i = g.decode(q), e = g.encode(i);
      assert.ok(Number.isInteger(e) && e >= 0 && e < g.codes, `코드 ${q}`);
      assert.deepEqual(g.decode(e), i, `한 번 거치면 안정 ${q}`);
      assert.equal(g.encode(g.decode(e)), e);
    }
    const iq = g.encode(g.idle);
    assert.ok(iq >= 0 && iq < g.codes);
    for (const bad of [-1, g.codes, 1.5, NaN, Infinity, undefined, null, '3']) assert.deepEqual(g.decode(bad), g.idle, String(bad));
    if (g.urgent) for (let q = 0; q < g.codes; q++) assert.equal(g.urgent(q, q), false, '같은 입력은 급하지 않다');
  });

  test(`[${g.id}] okState — 진짜 상태는 받고, 망가진 상태(자리 수·NaN·빠진 필드)는 거른다`, () => {
    for (const config of C.configs) {
      const states = run(g, config, 77, 240);
      for (const s of states) assert.ok(g.okState(s, config), `틱 ${g.tick(s)}`);
      const s = states[120];
      for (const bad of [null, undefined, 3, 'x', [], {}]) assert.equal(g.okState(bad, config), false);
      for (const path of numberPaths(s)) assert.equal(g.okState(setAt(s, path, NaN), config), false, `NaN ${path.join('.')}`);
      for (const k of Object.keys(s)) {
        if (C.optionalStateKeys.includes(k)) continue;
        const { [k]: _, ...rest } = s;
        assert.equal(g.okState(rest, config), false, `빠진 필드 ${k}`);
      }
      for (const [i, f] of C.mangleState.entries()) assert.equal(g.okState(f(s), config), false, `망가뜨리기 ${i}`);
    }
    // 다른 판(자리 수가 다른 설정)의 상태는 이 판 상태가 아니다
    const [a, b] = [C.configs[0], C.configs.find((c) => g.slots(c) !== g.slots(C.configs[0]))];
    assert.equal(g.okState(g.create(b, 1), a), false);
  });

  test(`[${g.id}] okConfig — 쓰는 설정은 받고, 망가진 설정(NaN·빠진 필드)은 거른다`, () => {
    for (const config of C.configs) {
      assert.ok(g.okConfig(config));
      assert.ok(g.okConfig(JSON.parse(JSON.stringify(config))));
      for (const bad of [null, undefined, 3, 'x', [], {}]) assert.equal(g.okConfig(bad), false);
      for (const path of numberPaths(config)) assert.equal(g.okConfig(setAt(config, path, NaN)), false, `NaN ${path.join('.')}`);
      for (const k of Object.keys(config)) { const { [k]: _, ...rest } = config; assert.equal(g.okConfig(rest), false, `빠진 필드 ${k}`); }
      for (const [i, f] of C.mangleConfig.entries()) assert.equal(g.okConfig(f(config)), false, `망가뜨리기 ${i}`);
    }
  });

  test(`[${g.id}] 자리 — slots 만큼의 입력으로 돌고, slotNum 은 자리 안에서만 번호(봇 null)`, () => {
    for (const config of C.configs) {
      const n = g.slots(config);
      assert.ok(Number.isInteger(n) && n >= 1 && n <= 16);
      const s = g.create(config, 1);
      assert.doesNotThrow(() => g.step(s, config, Array.from({ length: n }, () => g.idle)));
      for (let i = 0; i < n; i++) { const v = g.slotNum(config, i); assert.ok(v === null || Number.isInteger(v)); }
      for (const i of [-1, n, n + 5]) assert.equal(g.slotNum(config, i), null);
      if (g.botInput) for (let i = 0; i < n; i++) {
        const q = g.encode(g.botInput(s, config, i));
        assert.ok(q >= 0 && q < g.codes);
        assert.deepEqual(g.botInput(s, config, i), g.botInput(s, config, i), '봇도 결정적');
      }
    }
  });

  if (C.short) test(`[${g.id}] 짧은 판은 끝난다(ended), 끝난 뒤 판정이 바뀌지 않는다`, () => {
    const { config, maxTicks } = C.short;
    let s = g.create(config, 4);
    const idle = Array.from({ length: g.slots(config) }, () => g.idle);
    let t = 0;
    while (!g.ended(s) && t < maxTicks) {
      s = g.step(s, config, Array.from({ length: g.slots(config) }, (_, i) => (g.botInput ? g.botInput(s, config, i) : g.idle)));
      t++;
    }
    assert.ok(g.ended(s), `${maxTicks} 틱 안에 안 끝났다`);
    assert.ok(g.okState(s, config));
    assert.ok(g.ended(g.step(s, config, idle)), '끝난 판은 끝난 채');
  });

  // 저절로 끝나지 않는 게임(자유 훈련장 — 2026-11-07 2단계): short 대신 neverEnds. 봇 입력으로 오래 돌려도 끝나지 않고 상태가 성하다.
  if (C.neverEnds) test(`[${g.id}] 저절로 끝나지 않는다 — 봇끼리 오래 돌려도 ended 가 거짓, 상태는 성하다`, () => {
    const { config, ticks } = C.neverEnds;
    let s = g.create(config, 4);
    for (let t = 0; t < ticks; t++) {
      s = g.step(s, config, Array.from({ length: g.slots(config) }, (_, i) => g.decode(g.encode(g.botInput ? g.botInput(s, config, i) : g.idle))));
      assert.equal(g.ended(s), false, `틱 ${t}`);
    }
    assert.ok(g.okState(s, config));
  });

  if (g.bodies) test(`[${g.id}] 몸 목록 — 읽고 그대로 쓰면 같은 상태, 개수는 한 판 동안 같다`, () => {
    for (const config of C.configs) {
      const states = run(g, config, 8, 100);
      const n = g.bodies.get(states[0]).length;
      for (const s of states) {
        const b = g.bodies.get(s);
        assert.equal(b.length, n);
        assert.deepEqual(g.bodies.set(s, b), s);
        assert.ok(b.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)));
      }
    }
  });
}

// 스냅샷 줄이기(어댑터 pack/unpack, 2026-11-07 4단계) — 잃는 게 없어야 한다: JSON 을 오간 뒤 풀면 같은 상태, 거기서 이어 돌려도 같다.
for (const C of CASES.filter((c) => c.adapter.pack)) {
  const g = C.adapter;
  test(`[${g.id}] pack/unpack — 풀면 같은 상태, 이어 돌린 결과도 같다, 망가진 것은 null`, () => {
    for (const config of C.configs) {
      const states = run(g, config, 21, 400);
      for (const s of states) {
        const back = g.unpack(JSON.parse(JSON.stringify(g.pack(s))), config);
        assert.deepEqual(back, s);
        const ins = Array.from({ length: g.slots(config) }, (_, i) => g.decode((i * 7919 + g.tick(s)) % g.codes));
        assert.deepEqual(g.step(back, config, ins), g.step(s, config, ins));
      }
      const p = g.pack(states[200]);
      assert.ok(p && typeof p === 'object' && !Array.isArray(p), '객체여야 parseMsg 를 지난다');
      for (const bad of [null, undefined, 3, 'x', [], {}, { ...p, v: 99 }, { ...p, p: [] }, { ...p, b: [1, 2] }, { ...p, o: null }]) {
        assert.doesNotThrow(() => g.unpack(bad, config));
        const u = g.unpack(bad, config);
        assert.ok(u === null || !g.okState(u, config), JSON.stringify(bad)?.slice(0, 40));
      }
      // 다른 판(자리 수가 다른 설정)의 스냅샷은 풀지 않는다
      const other = C.configs.find((c) => g.slots(c) !== g.slots(config));
      assert.equal(g.unpack(g.pack(g.create(other, 1)), config), null);
    }
  });
}

test('등록된 게임은 모두 이 검사를 받는다', () => {
  assert.deepEqual(GAMES.map((e) => e.adapter.id).sort(), CASES.map((c) => c.adapter.id).sort());
});

test('[match2d] 경기 계산의 틱 = 세션의 틱(60)', () => assert.equal(SIM_HZ, TICK_HZ));
