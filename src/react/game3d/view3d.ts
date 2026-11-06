// src/react/game3d/view3d.ts — 3D 축구 **시제품** 화면의 순수 계산(DOM·three.js 없음 — node 단위 테스트가 그대로 가져온다).
// 하는 일: ① 화면 기준 스틱 → 경기장 방향(카메라가 실제로 보는 방향으로), ② 카메라가 가려는 자리, ③ 라인업, ④ 남은 시간 글자.
// 2D 의 view.ts 는 가져오지 않는다 — 그쪽은 2D 경기 계산을 끌고 와서 이 페이지 묶음이 무거워진다.
//
// 좌표: 경기 계산은 바닥 x·y + 높이 z, three.js 는 위가 y 라서 three(x, y, z) = 경기(x, z, y).
import { PITCH3D, type Side } from '../../lib/game3d/sim.ts';

/** 화면 위 스틱(오른쪽 +x, 아래 +y — 2D 와 같은 꼴) → 경기장 방향. fwdX·fwdY = 카메라가 보는 방향을 바닥에 눕힌 것(경기 좌표).
 *  화면 위 = 카메라 앞, 화면 오른쪽 = 앞을 오른쪽으로 돌린 것((−fy, fx) — three 의 forward × up 을 경기 좌표로 옮긴 값).
 *  카메라가 천천히 도는 중에도 "보이는 대로" 가게, 가로/세로 구분 대신 카메라의 실제 방향을 받는다. */
export function stickToWorld(sx: number, sy: number, fwdX: number, fwdY: number): { x: number; y: number } {
  const l = Math.sqrt(fwdX * fwdX + fwdY * fwdY);
  const fx = l > 1e-6 ? fwdX / l : 0, fy = l > 1e-6 ? fwdY / l : -1;
  const rx = 0 - fy, ry = fx;
  return { x: rx * sx + fx * (0 - sy), y: ry * sx + fy * (0 - sy) };
}

export type CamGoal = { px: number; py: number; pz: number; lx: number; ly: number; lz: number; fov: number };

// ── 카메라 조절 값(화면 쪽 — 경기 계산과 상관없다) ──
const LAND_HEIGHT = 19;      // 가로: 카메라 높이(m)
const LAND_BACK = 23;        // 가로: 경기장 옆(사람 쪽 +y)으로 물러난 거리
const LAND_FOV = 32;         // 좁게 — 넓으면 화면 가장자리 선수가 바깥으로 누워 보인다(헤드리스 화면으로 확인)
const PORT_HEIGHT = 17;      // 세로: 카메라 높이
const PORT_BACK = 11;        // 세로: 우리 골대 쪽으로 물러난 거리
const PORT_FOV = 56;
const KEEP_ME = 8;           // 가로: 카메라 중심이 내 선수에서 이보다 멀어지지 않는다(내 선수가 화면 밖으로 안 나가게)

/** 카메라가 가려는 자리(경기 좌표: p = 카메라 위치, l = 바라보는 점, z 가 높이). 실제 카메라는 여기로 천천히 따라간다(화면 쪽에서 easing).
 *  가로·PC: 옆에서 비스듬히 내려다보며 공을 따라가되 내 선수를 화면 안에 둔다.
 *  세로: 우리 골대 쪽 뒤에서 상대 골대 쪽으로(내 편이 화면 위로 공격). aspect = 가로/세로. */
export function cameraGoal(portrait: boolean, aspect: number, ball: { x: number; y: number }, me: { x: number; y: number } | null): CamGoal {
  const { HW, HH } = PITCH3D;
  const m = me ?? ball;
  if (!portrait) {
    let fx = ball.x * 0.65 + m.x * 0.35;
    fx = Math.min(m.x + KEEP_ME, Math.max(m.x - KEEP_ME, fx));
    fx = Math.min(HW - 7, Math.max(-HW + 7, fx));
    const fy = (ball.y * 0.6 + m.y * 0.4) * 0.45;
    // 화면이 좁을수록(정사각에 가까울수록) 더 물러나 경기장 너비가 들어오게
    const k = Math.max(1, 1.75 / Math.max(0.6, aspect));
    return { px: fx, py: fy + LAND_BACK * k, pz: LAND_HEIGHT * k, lx: fx, ly: fy - 1, lz: 0, fov: LAND_FOV };
  }
  let fx = m.x * 0.55 + ball.x * 0.45;
  fx = Math.min(HW - 8, Math.max(-HW + 5, fx));
  const fy = Math.min(HH - 4, Math.max(-HH + 4, m.y * 0.6 + ball.y * 0.4));
  return { px: fx - PORT_BACK, py: fy, pz: PORT_HEIGHT, lx: fx + 4, ly: fy, lz: 0, fov: PORT_FOV };
}

/** 남은 틱 → "m:ss"(올림 — 0:00 은 정말 끝났을 때만). */
export function clockText(ticks: number, hz = 60): string {
  const s = Math.max(0, Math.ceil(ticks / hz - 1e-9));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** 씨앗 하나로 도는 작은 난수기(mulberry32) — 라인업 섞기용(화면 쪽, 경기 계산 밖). */
export function rngFrom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Slot3 = { num: number; side: Side; human: boolean; gk: boolean };

/** 5대5 라인업 — 반환 순서가 곧 경기 id(0 편 다섯, 1 편 다섯), 편 안에서 slot 0 이 골키퍼(sim 의 편성과 같은 순서).
 *  사람은 0 편 slot 3(앞줄). 나머지는 명단에서 섞어 뽑는다.
 *  명단이 10명이 안 되면 같은 사람이 봇으로 두 번 나올 수 있다(결정: 시제품은 5대5 고정이라 막는 것보다 판이 열리는 게 낫다 —
 *  이름표가 같아도 경기엔 지장이 없다). 사람 혼자면 봇이 전부 그 사람 그림이다. */
export function pickLineup5(roster: number[], humanNum: number, rnd: () => number): Slot3[] {
  const uniq = roster.filter((n, i) => roster.indexOf(n) === i);
  const others = uniq.filter((n) => n !== humanNum);
  const pool = others.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const src = pool.length ? pool : [humanNum];
  let k = 0;
  const next = (): number => src[k++ % src.length];
  const out: Slot3[] = [];
  for (const side of [0, 1] as const)
    for (let slot = 0; slot < 5; slot++) {
      const human = side === 0 && slot === 3;
      out.push({ num: human ? humanNum : next(), side, human, gk: slot === 0 });
    }
  return out;
}
