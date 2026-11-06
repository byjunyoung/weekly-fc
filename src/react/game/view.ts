// src/react/game/view.ts — 경기 화면의 순수 계산(DOM·캔버스 없음, node 단위 테스트가 그대로 가져온다).
// 하는 일 셋: ① 경기장 좌표(논리 단위) ↔ 화면 픽셀 변환과 가로/세로 방향 고르기, ② 사람 선수가 낀 라인업 뽑기,
// ③ 남은 시간 글자. 그리기·입력·시계는 다른 파일이 맡고, 여기엔 "어디에 놓이나"만 있다.
import { PITCH } from '../../lib/game/sim.ts';

/** 골 상자까지 포함한 경기장 전체의 논리 크기. 화면에 이게 통째로 들어와야 한다. */
export const EXTENT = { w: PITCH.w + PITCH.goalDepth * 2, h: PITCH.h };

export type View = {
  /** 세로 화면이면 경기장을 세워 그린다(골대가 위아래, 사람 편은 위로 공격). 아니면 눕힌다(오른쪽으로 공격). */
  portrait: boolean;
  /** 논리 1단위 = 화면 몇 픽셀(CSS px). */
  scale: number;
  /** 경기장 중심(논리 0,0)이 놓이는 화면 좌표. */
  ox: number; oy: number;
  /** 뷰포트(CSS px). */
  vw: number; vh: number;
};

export type ViewOpts = { margin?: number; top?: number; bottom?: number };

/** 뷰포트에 맞춰 방향과 배율을 정한다. 세로로 더 길면 세운다(폭 < 높이).
 *  top·bottom = 점수판처럼 경기장 위를 덮는 줄이 차지하는 높이 — 그만큼 빼고 남은 칸 한가운데에 놓는다.
 *  margin = 사방 여백. 골 상자와 기둥까지 안 잘리게 EXTENT 기준으로 맞춘다. */
export function makeView(vw: number, vh: number, opts: ViewOpts = {}): View {
  const margin = opts.margin ?? 8, top = opts.top ?? 0, bottom = opts.bottom ?? 0;
  const portrait = vh > vw;
  const availW = Math.max(1, vw - margin * 2);
  const availH = Math.max(1, vh - margin * 2 - top - bottom);
  // 세우면 긴 변(골~골)이 화면 세로를 따른다.
  const needW = portrait ? EXTENT.h : EXTENT.w;
  const needH = portrait ? EXTENT.w : EXTENT.h;
  const scale = Math.min(availW / needW, availH / needH);
  return { portrait, scale, ox: vw / 2, oy: margin + top + availH / 2, vw, vh };
}

/** 논리 → 화면. 세로: 논리 +x(공격 방향)가 화면 위(-y), 논리 +y 가 화면 오른쪽(+x) — 거울이 아니라 90도 회전이라 좌우가 뒤집히지 않는다. */
export function toScreen(v: View, x: number, y: number): { x: number; y: number } {
  return v.portrait
    ? { x: v.ox + y * v.scale, y: v.oy - x * v.scale }
    : { x: v.ox + x * v.scale, y: v.oy + y * v.scale };
}

/** 화면 → 논리(toScreen 의 역). */
export function toLogical(v: View, sx: number, sy: number): { x: number; y: number } {
  return v.portrait
    ? { x: -(sy - v.oy) / v.scale, y: (sx - v.ox) / v.scale }
    : { x: (sx - v.ox) / v.scale, y: (sy - v.oy) / v.scale };
}

/** 화면 위의 방향(스틱 벡터, 아래가 +y)을 시뮬레이션 방향으로. 크기는 그대로, 방향만 돌린다.
 *  세로에선 "화면 위" = 논리 +x. 이걸 빼먹으면 세로 화면에서 스틱을 올려도 선수가 옆으로 간다. */
export function stickToSim(v: View, dx: number, dy: number): { x: number; y: number } {
  return v.portrait ? { x: 0 - dy, y: dx } : { x: dx, y: dy };
}

/** 시뮬레이션 방향(키보드 입력이 아니라 화면 방향 기준 입력)을 화면 방향으로 되돌릴 때 쓰는 역변환 — 테스트·표시용. */
export function simToStick(v: View, x: number, y: number): { x: number; y: number } {
  return v.portrait ? { x: y, y: 0 - x } : { x, y };
}

/** 남은 시간(초) → "m:ss". 올림이라 0:00 은 정말 끝났을 때만 나온다. */
export function clockText(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds - 1e-9));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** 씨앗 하나로 도는 작은 난수기(mulberry32). 라인업 뽑기를 테스트로 고정하려고 Math.random 을 직접 안 쓴다. */
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

export type LineupSlot = { num: number; side: 0 | 1; human: boolean };

/** 명단에서 양 편을 뽑는다. 사람 선수는 0 편, 나머지는 무작위(겹침 없음, 사람 선수 제외).
 *  반환 순서 = 시뮬레이션 id 순서(0 편 perSide 명 다음 1 편). 편 안 순서는 slot 이고 0 이 가장 뒤라서,
 *  사람은 2명 이상이면 slot 1 에 둔다 — slot 0 을 사람이 차지하면 그 편 봇에 수비가 없어진다(report-1).
 *  명단이 2*perSide 보다 작으면 겹치게 뽑지 않고 RangeError — 화면이 그런 인원을 못 고르게 막는다. */
export function pickLineup(roster: number[], humanNum: number, perSide: number, rnd: () => number): LineupSlot[] {
  const others = roster.filter((n, i) => n !== humanNum && roster.indexOf(n) === i);
  if (!roster.includes(humanNum)) throw new RangeError('내 선수가 명단에 없다');
  if (others.length < perSide * 2 - 1) throw new RangeError('명단이 모자란다');
  const pool = others.slice();
  for (let i = pool.length - 1; i > 0; i--) {   // Fisher–Yates
    const j = Math.floor(rnd() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const humanSlot = Math.min(1, perSide - 1);
  const out: LineupSlot[] = [];
  let k = 0;
  for (let slot = 0; slot < perSide; slot++) {
    out.push(slot === humanSlot ? { num: humanNum, side: 0, human: true } : { num: pool[k++], side: 0, human: false });
  }
  for (let slot = 0; slot < perSide; slot++) out.push({ num: pool[k++], side: 1, human: false });
  return out;
}

/** 이 명단에서 고를 수 있는 가장 큰 인원(한 편 최대 4). */
export const maxPerSide = (rosterSize: number): number => Math.max(0, Math.min(4, Math.floor(rosterSize / 2)));
