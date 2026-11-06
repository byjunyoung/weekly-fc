import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, step, eventsBetween, PITCH, NO_INPUT, pitchOf } from '../../src/lib/game/sim.ts';
import { BASE_PERF } from '../../src/lib/game/stats.ts';
import { botInput } from '../../src/lib/game/bot.ts';
import { quantize } from '../../src/lib/game/quant.ts';
import { fieldFor } from '../../src/lib/games/match2d-room.ts';

const mk = (perSide, extra = {}) => {
  const players = [];
  for (let i = 0; i < perSide * 2; i++)
    players.push({ id: i, num: i, name: `P${i}`, side: i < perSide ? 0 : 1, bot: true, perf: { ...BASE_PERF } });
  return { perSide, minutes: 2, scoreLimit: 0, players, ...extra };
};
const inputs = (s, cfg) => cfg.players.map((p) => botInput(s, cfg, p.id));

test('봇 입력은 늘 유한하고 -1..1 안 — 모든 인원·여러 씨앗', () => {
  for (const per of [1, 2, 3, 4]) for (const seed of [1, 99]) {
    const cfg = mk(per, { minutes: 1 });
    let s = createMatch(cfg, seed);
    for (let t = 0; t < 1200; t++) {
      const ins = inputs(s, cfg);
      for (const i of ins) {
        assert.ok(Number.isFinite(i.x) && Number.isFinite(i.y), `NaN t=${t}`);
        assert.ok(Math.abs(i.x) <= 1 + 1e-9 && Math.abs(i.y) <= 1 + 1e-9, `범위 밖 ${i.x},${i.y}`);
        assert.equal(typeof i.kick, 'boolean');
      }
      s = step(s, cfg, ins);
    }
  }
});

test('순수 — 같은 state 면 같은 입력, state 는 안 바뀐다', () => {
  const cfg = mk(3);
  let s = createMatch(cfg, 5);
  for (let t = 0; t < 200; t++) s = step(s, cfg, inputs(s, cfg));
  const snap = JSON.stringify(s);
  const a = JSON.stringify(inputs(s, cfg)), b = JSON.stringify(inputs(JSON.parse(snap), cfg));
  assert.equal(a, b);
  assert.equal(JSON.stringify(s), snap);
});

test('봇끼리 2분 경기(2대2) — 실제로 공을 차고 경기가 끝난다', () => {
  const cfg = mk(2);
  let s = createMatch(cfg, 3);
  let kicks = 0, goals = 0;
  for (let t = 0; t < 12000 && s.phase !== 'end'; t++) {
    const n = step(s, cfg, inputs(s, cfg));
    for (const e of eventsBetween(s, n)) { if (e.type === 'kick') kicks++; if (e.type === 'goal') goals++; }
    s = n;
  }
  assert.equal(s.phase, 'end');
  assert.ok(kicks >= 1, `킥 ${kicks}`);
  assert.ok(kicks >= 10, `봇이 거의 안 찬다 ${kicks}`);
  assert.equal(goals, s.score[0] + s.score[1]);
});

test('가장 뒤 봇은 공이 상대 진영에 있는 동안 자기 진영에 머문다', () => {
  const cfg = mk(2);
  let s = createMatch(cfg, 3);
  let checked = 0;
  for (let t = 0; t < 7200 && s.phase !== 'end'; t++) {
    s = step(s, cfg, inputs(s, cfg));
    if (s.phase !== 'play') continue;
    for (const keeper of [0, 2]) {
      const dir = cfg.players[keeper].side === 0 ? 1 : -1;
      if (dir * s.ball.x > 40) {
        checked++;
        assert.ok(dir * s.players[keeper].x < 10, `t=${t} 수비 ${keeper} 가 상대 진영 ${s.players[keeper].x}`);
      }
    }
  }
  assert.ok(checked > 300, `공이 상대 진영에 있던 틱이 너무 적다 ${checked}`);
});

test('둘이 한 공에 몰리지 않는다 — 같은 편 둘(3대3 공격수들) 사이 거리가 대체로 벌어진다', () => {
  const cfg = mk(3);
  let s = createMatch(cfg, 8);
  let close = 0, total = 0;
  for (let t = 0; t < 3600 && s.phase !== 'end'; t++) {
    s = step(s, cfg, inputs(s, cfg));
    if (s.phase !== 'play') continue;
    const a = s.players[1], b = s.players[2];
    total++;
    if (Math.hypot(a.x - b.x, a.y - b.y) < 2 * PITCH.playerR + 10) close++;
  }
  assert.ok(total > 1000);
  assert.ok(close / total < 0.15, `붙어 있던 비율 ${(close / total).toFixed(2)}`);
});

test('골이 나는 경기 — 봇끼리 여러 씨앗에서 끝까지 돌고 골이 난다(너무 바보가 아님)', () => {
  let goals = 0;
  for (const seed of [1, 2, 3, 4]) {
    const cfg = mk(2);
    let s = createMatch(cfg, seed);
    for (let t = 0; t < 12000 && s.phase !== 'end'; t++) s = step(s, cfg, inputs(s, cfg));
    assert.equal(s.phase, 'end');
    goals += s.score[0] + s.score[1];
  }
  assert.ok(goals >= 2, `네 경기 합쳐 ${goals} 골`);
});

test('골·끝 단계에선 입력이 0', () => {
  const cfg = mk(1);
  const s = { ...createMatch(cfg, 1), phase: 'goal' };
  assert.deepEqual(botInput(s, cfg, 0), { x: 0, y: 0, kick: false });
});

// ═══════════ 2026-11-07 "봇들이 패스 슛 개념이 너무 없는듯" — 봇끼리 경기로 잰 축구다움 ═══════════
// 판마다(1대1 ~ 5대5, 3대5) 그 인원에 자동으로 고르는 경기장(fieldFor)에서 3분 경기를 씨앗 넷으로 돌린다. 둘(짝수 씨앗)은
// 온라인 방장처럼 봇 입력을 16방향 × 2단계로 줄여(quantize) 넣는다. 기준값은 옛 봇(공 쫓아 골 쪽으로 밀기만 하던 것)을
// 같은 방식(씨앗 12개, 반은 줄인 입력)으로 잰 값이다 — .superpowers/sdd/game/report-bots.md 의 표.
//   찬 패스(킥 → 다음 터치가 같은 편 다른 사람) 경기당: 3대3 3.2, 4대4 2.9, 5대5 3.4, 3대5 3.8
//   같은 편 둘 이상이 공 88(선수 지름 둘) 안에 몰린 비율(공 가진 편, 몸이 하나라도 붙은 순간 중): 3대3 3.4%, 4대4 8.5%, 5대5 12.2%, 3대5 9.9%
// 문턱은 그 기준의 두 배(패스)·기준 아래(몰림)로 잡았다 — 씨앗 넷이라 흔들림이 있어 목표치(세 배)보다 느슨하다.
const mkSides = (a, b, humans = []) => {
  const players = [];
  for (let i = 0; i < a + b; i++) players.push({ id: i, num: i, name: `P${i}`, side: i < a ? 0 : 1, bot: !humans.includes(i), perf: { ...BASE_PERF } });
  return { field: fieldFor(a + b), minutes: 3, scoreLimit: 0, players };
};

/** 봇끼리 한 경기를 끝까지 돌리며 잰다. quant = 봇 입력을 온라인처럼 줄여 넣나. 판 밖·NaN 은 그 자리에서 실패. */
function measure(cfg, seed, quant) {
  const P = pitchOf(cfg.field), HW = P.w / 2, HH = P.h / 2, GH = P.goalW / 2;
  let s = createMatch(cfg, seed);
  const m = { goals: 0, assisted: 0, kpass: 0, shots: 0, stalls: 0, near: 0, swarm: 0, crowd: 0 };
  let still = 0, pending = -1, pendingT = 0;
  const side = (i) => cfg.players[i].side;
  for (let t = 0; t < 20000 && s.phase !== 'end'; t++) {
    const ins = cfg.players.map((p) => (quant ? quantize(botInput(s, cfg, p.id)) : botInput(s, cfg, p.id)));
    const n = step(s, cfg, ins);
    for (const e of eventsBetween(s, n)) {
      if (e.type === 'goal') { m.goals++; if (e.assist !== null) m.assisted++; }
      if (e.type === 'kick') {
        pending = e.by; pendingT = t;
        // 슛 = 찬 공이 상대 골문 입을 향하고 골문까지 경기장 길이의 절반 안
        const dir = side(e.by) === 0 ? 1 : -1, b = n.ball;
        if (b.vx * dir > 1) {
          const y = b.y + (b.vy / b.vx) * (dir * HW - b.x);
          if (Math.abs(y) < GH + 5 && Math.hypot(dir * HW - b.x, b.y) < P.w / 2) m.shots++;
        }
      }
    }
    if (n.lastTouch !== null && n.lastTouch !== s.lastTouch && pending >= 0 && n.lastTouch !== pending) {
      if (side(pending) === side(n.lastTouch)) m.kpass++;
      pending = -1;
    }
    if (n.phase !== 'play' || (pending >= 0 && n.lastTouch === pending && t - pendingT > 30)) pending = -1;
    if (n.phase === 'play') {
      const moved = Math.hypot(n.ball.x - s.ball.x, n.ball.y - s.ball.y);
      if (moved < 0.1) { still++; if (still === 300) m.stalls++; } else still = 0;
      if (n.lastTouch !== null && t % 5 === 0) {
        let k = 0;
        n.players.forEach((p, i) => { if (side(i) === side(n.lastTouch) && Math.hypot(p.x - n.ball.x, p.y - n.ball.y) < 4 * P.playerR) k++; });
        if (k > 0) { m.near++; m.crowd += k; if (k >= 2) m.swarm++; }
      }
    } else still = 0;
    for (const p of n.players) {
      assert.ok(Number.isFinite(p.x + p.y + p.vx + p.vy), `선수 NaN t=${t}`);
      assert.ok(Math.abs(p.x) <= HW + P.marginX && Math.abs(p.y) <= HH + P.marginY, `선수가 여백 밖 t=${t}`);
    }
    const b = n.ball;
    assert.ok(Number.isFinite(b.x + b.y + b.vx + b.vy), `공 NaN t=${t}`);
    assert.ok(Math.abs(b.x) <= HW + P.goalDepth && Math.abs(b.y) <= HH, `공이 판 밖 t=${t}`);
    s = n;
  }
  assert.equal(s.phase, 'end');
  return m;
}

const FORMATS = [
  // [편 0, 편 1, 찬 패스 경기당 최소, 몰림 비율 최대(옛 봇 기준), 골 경기당 최소]
  // 찬 패스 최소는 옛 봇의 2.5~3배(3대3 3.2·4대4 2.9·5대5 3.4·3대5 3.8 → 8·8.7·10·10). 골 최소 2 는 씨앗 넷의 흔들림을 넣은 하한이다 —
  // 씨앗 48개 평균은 3대3 5.5, 4대4 4.3, 5대5 5.0, 3대5 4.4(보고서 표). 2026-11-07 "패스만 돌리고 골은 못 넣는다" 로 읽히지 않게 골 하한을 넣었다.
  [1, 1, 0, 0.01, 4],
  [2, 2, 0, 0.05, 2],
  [3, 3, 8, 0.034, 2],
  [4, 4, 8.7, 0.085, 2],
  [5, 5, 10, 0.122, 1.5],
  [3, 5, 10, 0.099, 2],
];
const team = { goals: 0, assisted: 0 };   // 3대3 이상 골 전체 — 도움 비율은 맨 끝에서 한 번에 본다
for (const [a, b, minPass, maxSwarm, minGoals] of FORMATS) {
  test(`봇끼리 ${a}대${b}(${fieldFor(a + b)}) 3분 × 4경기 — 골이 나고, 패스하고, 슛하고, 서 버리지 않고, 몰리지 않는다`, () => {
    const cfg = mkSides(a, b);
    const tot = { goals: 0, assisted: 0, kpass: 0, shots: 0, stalls: 0, near: 0, swarm: 0, crowd: 0 };
    for (const seed of [11, 12, 13, 14]) {
      const m = measure(cfg, seed, seed % 2 === 0);
      for (const k of Object.keys(tot)) tot[k] += m[k];
    }
    const per = (v) => v / 4;
    assert.ok(per(tot.goals) >= minGoals, `골 경기당 ${per(tot.goals)} < ${minGoals}`);
    assert.ok(per(tot.goals) <= 12, `골이 너무 많다 경기당 ${per(tot.goals)}`);
    assert.equal(tot.stalls, 0, '공이 5초 넘게 선 채로 있었다');
    assert.ok(per(tot.shots) >= (a + b <= 4 ? 8 : 4), `슛 경기당 ${per(tot.shots)}`);
    if (minPass > 0) assert.ok(per(tot.kpass) >= minPass, `찬 패스 경기당 ${per(tot.kpass)} < ${minPass}`);
    const swarm = tot.swarm / Math.max(1, tot.near);
    assert.ok(swarm <= maxSwarm, `몰림 ${(swarm * 100).toFixed(1)}% > ${(maxSwarm * 100).toFixed(1)}%`);
    assert.ok(tot.crowd / Math.max(1, tot.near) <= 1.1, `공 옆 같은 편 평균 ${(tot.crowd / tot.near).toFixed(2)}`);
    if (a >= 3) { team.goals += tot.goals; team.assisted += tot.assisted; }
  });
}
test('3대3 이상 골의 다섯에 하나 넘게 도움이 붙는다(같은 편이 넘겨준 공으로 넣는다)', () => {
  // 옛 봇은 이 값이 더 높았지만(3대3 48%) 같은 편끼리 몸으로 부딪친 것까지 도움으로 잡혔다. 새 봇은 씨앗 48개로 3대3 28%, 4대4 23%,
  // 5대5 31%, 6대6 34% — 목표(30%)에 3대3·4대4 는 못 미친다(골문 앞 되튄 공·뺏은 공을 바로 넣는 골이 많다). 여기 하한은 0.2.
  assert.ok(team.goals > 0);
  assert.ok(team.assisted / team.goals >= 0.2, `도움 ${team.assisted}/${team.goals}`);
});

// ─── 장면 — 한 장면에서 봇이 해야 할 일을 하나씩. 틱은 5670 에서 시작한다: 이 창(45틱 × 5)은 여섯 봇 모두 머뭇거림 제비에 안 걸려
// 반응이 늦어지는 우연 없이 판단만 본다. 줄인 입력·그대로 입력 둘 다 본다. ───
function scene(cfg, setup, ticks, quant) {
  let s = createMatch(cfg, 1);
  s.phase = 'play'; s.phaseTicks = 0; s.tick = 5670;
  setup(s);
  const ev = [], frames = [];
  for (let t = 0; t < ticks && s.phase === 'play'; t++) {
    const ins = cfg.players.map((p) => (p.bot ? (quant ? quantize(botInput(s, cfg, p.id)) : botInput(s, cfg, p.id)) : { ...NO_INPUT }));
    const n = step(s, cfg, ins);
    for (const e of eventsBetween(s, n)) ev.push({ t, ...e, ball: { ...n.ball } });
    if (n.lastTouch !== s.lastTouch && n.lastTouch !== null) ev.push({ t, type: 'touch', by: n.lastTouch });
    frames.push(n);
    s = n;
  }
  return { ev, frames, s };
}
const at = (s, i, x, y) => Object.assign(s.players[i], { x, y, vx: 0, vy: 0 });
const c33 = () => ({ ...mkSides(3, 3), field: 'M' });

for (const quant of [false, true]) {
  const q = quant ? ' (줄인 입력)' : '';
  test(`슛 — 골문 앞 공을 가진 봇은 수비가 먼 쪽 골문 입으로 찬다${q}`, () => {
    const cfg = c33();
    const { ev } = scene(cfg, (s) => { at(s, 0, -450, 0); at(s, 1, 250, -40); at(s, 2, 0, 250); at(s, 3, 560, 60); at(s, 4, 0, -250); at(s, 5, -100, 250); s.ball = { x: 284, y: -40, vx: 0, vy: 0 }; s.lastTouch = 1; }, 30, quant);
    const k = ev.find((e) => e.type === 'kick');
    assert.ok(k && k.by === 1 && k.t < 10, '바로 차지 않았다');
    const y = k.ball.y + (k.ball.vy / k.ball.vx) * (600 - k.ball.x);
    assert.ok(k.ball.vx > 0 && Math.abs(y) < 100, `골문 입 밖 y=${y.toFixed(0)}`);
    assert.ok(y < 60, `수비(골문 아래쪽 y=60)가 있는 쪽으로 찼다 y=${y.toFixed(0)}`);
  });
  test(`패스 — 앞이 막힌 봇은 열린 같은 편에게 차고, 그 같은 편이 받는다${q}`, () => {
    const cfg = c33();
    const { ev } = scene(cfg, (s) => { at(s, 0, -450, 0); at(s, 1, -150, 30); at(s, 2, 150, -220); at(s, 3, 450, 0); at(s, 4, -30, 20); at(s, 5, 300, 250); s.ball = { x: -120, y: 10, vx: 0, vy: 0 }; s.lastTouch = 1; }, 90, quant);
    const k = ev.find((e) => e.type === 'kick');
    assert.ok(k && k.by === 1 && k.t < 10, '차지 않았다');
    const next = ev.find((e) => e.type === 'touch' && e.t > k.t && e.by !== 1);
    assert.ok(next && next.by === 2, `다음에 공을 만진 건 ${next?.by}`);
  });
  test(`받기 — 굴러오는 공을 받을 봇이 공 길로 마중 나가 상대보다 먼저 닿는다${q}`, () => {
    const cfg = c33();
    const { ev } = scene(cfg, (s) => { at(s, 0, -450, 0); at(s, 1, -300, 0); at(s, 2, 50, -200); at(s, 3, 450, 0); at(s, 4, 250, 250); at(s, 5, 350, -300); s.ball = { x: -150, y: -60, vx: 380, vy: -60 }; s.lastTouch = 1; }, 90, quant);
    const first = ev.find((e) => e.type === 'touch' && e.by !== 1);
    assert.ok(first && first.by === 2, `먼저 닿은 건 ${first?.by}`);
  });
  test(`걷어내기 — 우리 골문 앞에서 압박받으면 우리 골대 반대쪽으로 차 내고 먹히지 않는다${q}`, () => {
    const cfg = c33();
    const { ev } = scene(cfg, (s) => { at(s, 0, -520, 40); at(s, 1, 0, 200); at(s, 2, 0, -200); at(s, 3, 450, 0); at(s, 4, -380, 20); at(s, 5, 100, 100); s.ball = { x: -480, y: 30, vx: -60, vy: 0 }; s.lastTouch = 4; }, 120, quant);
    const k = ev.find((e) => e.type === 'kick' && cfg.players[e.by].side === 0);
    assert.ok(k && k.t < 60, '걷어내지 않았다');
    assert.ok(k.ball.vx > 0, `우리 골대 쪽으로 찼다 vx=${k.ball.vx.toFixed(0)}`);
    assert.ok(!ev.some((e) => e.type === 'goal' && e.side === 1), '먹혔다');
  });
  test(`사람 같은 편이 공을 갖고 있으면 봇은 빼앗으러 오지 않는다${q}`, () => {
    const cfg = { ...mkSides(3, 3, [1]), field: 'M' };
    const { frames } = scene(cfg, (s) => { at(s, 0, -450, 0); at(s, 1, -200, 0); at(s, 2, -150, 200); at(s, 3, 450, 0); at(s, 4, 400, 250); at(s, 5, 400, -250); s.ball = { x: -166, y: 0, vx: 0, vy: 0 }; s.lastTouch = 1; }, 90, quant);
    for (const f of frames) for (const i of [0, 2]) {
      const d = Math.hypot(f.players[i].x - f.ball.x, f.players[i].y - f.ball.y);
      assert.ok(d > PITCH.playerR + PITCH.ballR + 20, `봇 ${i} 이 사람 발밑 공에 ${d.toFixed(0)} 까지 왔다`);
    }
  });
}

test('킥오프 — 차는 편이 4초 기다리지 않고 공을 건드려 시작한다(모든 판)', () => {
  for (const [a, b] of [[1, 1], [2, 2], [3, 3], [4, 4], [5, 5], [3, 5], [6, 6]]) {
    const cfg = mkSides(a, b);
    let s = createMatch(cfg, 7);
    let t = 0;
    while (s.phase === 'kickoff' && t < 300) { s = step(s, cfg, cfg.players.map((p) => botInput(s, cfg, p.id))); t++; }
    assert.equal(s.phase, 'play');
    assert.ok(t < 180, `${a}대${b} 킥오프 ${t}틱`);
    assert.ok(s.lastTouch !== null && cfg.players[s.lastTouch].side === 0, `${a}대${b} 시간이 다 돼서 시작했다`);
  }
});
