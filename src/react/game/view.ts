// src/react/game/view.ts — 경기 화면의 순수 계산(DOM·캔버스 없음, node 단위 테스트가 그대로 가져온다).
// 하는 일 셋: ① 경기장 좌표(논리 단위) ↔ 화면 픽셀 변환과 가로/세로 방향 고르기, ② 사람 선수가 낀 라인업 뽑기,
// ③ 남은 시간 글자. 그리기·입력·시계는 다른 파일이 맡고, 여기엔 "어디에 놓이나"만 있다.
import { PITCH, type Pitch } from '../../lib/game/sim.ts';
import { shuffle } from '../../lib/game/lineup.ts';

/** 골 상자와 선 밖 여백까지 포함한 경기장 전체의 논리 크기. 화면에 이게 통째로 들어오거나, 카메라가 이 밖을 비추지 않는다. */
export function extentOf(p: Pitch): { w: number; h: number } {
  return { w: p.w + Math.max(p.goalDepth, p.marginX) * 2, h: p.h + p.marginY * 2 };
}
/** 보통 경기장의 EXTENT(1단계부터 있던 값 — 테스트가 읽는다). */
export const EXTENT = extentOf(PITCH);

/** 화면에서 선수 반지름이 이보다 작아지면 전체를 보여 주지 않고 화면이 따라간다(스펙 2026-11-07 §2 — 큰 경기장은 폰에서 선수가 점이 된다). */
export const FOLLOW_MIN_R = 11;

export type View = {
  /** 세로 화면이면 경기장을 세워 그린다(골대가 위아래, 사람 편은 위로 공격). 아니면 눕힌다(오른쪽으로 공격). */
  portrait: boolean;
  /** 논리 1단위 = 화면 몇 픽셀(CSS px). */
  scale: number;
  /** 카메라 중심(논리 cx,cy)이 놓이는 화면 좌표 = 그릴 칸의 한가운데. */
  ox: number; oy: number;
  /** 뷰포트(CSS px). */
  vw: number; vh: number;
  /** 그릴 칸(여백·점수판 줄을 뺀 곳)의 크기(CSS px). */
  aw: number; ah: number;
  /** 카메라가 보는 논리 좌표. 전체가 들어가면 늘 0,0. */
  cx: number; cy: number;
  /** 화면이 따라가는 중인가(경기장이 한 화면에 안 들어간다). */
  follow: boolean;
  /** 그 경기장의 EXTENT(논리 단위) — 카메라가 이 밖을 비추지 않게 자르는 데 쓴다. */
  ew: number; eh: number;
};

export type ViewOpts = { margin?: number; top?: number; bottom?: number; pitch?: Pitch };

/** 뷰포트에 맞춰 방향과 배율을 정한다. 세로로 더 길면 세운다(폭 < 높이).
 *  top·bottom = 점수판처럼 경기장 위를 덮는 줄이 차지하는 높이 — 그만큼 빼고 남은 칸 한가운데에 놓는다.
 *  margin = 사방 여백. 골 상자와 기둥까지 안 잘리게 그 경기장의 EXTENT 로 맞춘다.
 *  전체가 들어가는 배율에서 선수 반지름이 FOLLOW_MIN_R(11px) 이상이면 그대로(고정), 작으면 배율을 11px 에 고정하고 따라가기(follow) —
 *  카메라 위치는 aimCamera 가 정한다(처음엔 가운데). */
export function makeView(vw: number, vh: number, opts: ViewOpts = {}): View {
  const margin = opts.margin ?? 8, top = opts.top ?? 0, bottom = opts.bottom ?? 0;
  const pitch = opts.pitch ?? PITCH;
  const ext = extentOf(pitch);
  const portrait = vh > vw;
  const aw = Math.max(1, vw - margin * 2);
  const ah = Math.max(1, vh - margin * 2 - top - bottom);
  // 세우면 긴 변(골~골)이 화면 세로를 따른다.
  const needW = portrait ? ext.h : ext.w;
  const needH = portrait ? ext.w : ext.h;
  const fit = Math.min(aw / needW, ah / needH);
  const follow = pitch.playerR * fit < FOLLOW_MIN_R;
  const scale = follow ? FOLLOW_MIN_R / pitch.playerR : fit;
  return { portrait, scale, ox: vw / 2, oy: margin + top + ah / 2, vw, vh, aw, ah, cx: 0, cy: 0, follow, ew: ext.w, eh: ext.h };
}

/** 카메라를 focus(내 선수, 구경이면 공) 쪽으로. 화면이 경기장 밖을 비추지 않게 끝에서 멈추고, 한 방향이 통째로 들어가면 그 방향은 가운데 고정.
 *  따라가지 않는 화면(follow=false)이면 받은 것 그대로. 순수 — 같은 입력이면 같은 결과. */
export function aimCamera(v: View, focus: { x: number; y: number }): View {
  if (!v.follow) return v;
  // 논리 x 는 세로 화면에선 화면 세로(ah)를, 가로 화면에선 화면 가로(aw)를 따른다.
  const visX = (v.portrait ? v.ah : v.aw) / 2 / v.scale, visY = (v.portrait ? v.aw : v.ah) / 2 / v.scale;
  const clampAxis = (f: number, half: number, vis: number): number => {
    if (vis >= half) return 0;
    const lim = half - vis;
    const c = Number.isFinite(f) ? f : 0;
    return c < -lim ? -lim : c > lim ? lim : c;
  };
  const cx = clampAxis(focus.x, v.ew / 2, visX), cy = clampAxis(focus.y, v.eh / 2, visY);
  return cx === v.cx && cy === v.cy ? v : { ...v, cx, cy };
}

/** 논리 → 화면. 세로: 논리 +x(공격 방향)가 화면 위(-y), 논리 +y 가 화면 오른쪽(+x) — 거울이 아니라 90도 회전이라 좌우가 뒤집히지 않는다.
 *  카메라(cx,cy)가 화면 칸의 한가운데(ox,oy)에 온다. */
export function toScreen(v: View, x: number, y: number): { x: number; y: number } {
  const dx = x - v.cx, dy = y - v.cy;
  return v.portrait
    ? { x: v.ox + dy * v.scale, y: v.oy - dx * v.scale }
    : { x: v.ox + dx * v.scale, y: v.oy + dy * v.scale };
}

/** 화면 → 논리(toScreen 의 역). */
export function toLogical(v: View, sx: number, sy: number): { x: number; y: number } {
  return v.portrait
    ? { x: v.cx - (sy - v.oy) / v.scale, y: v.cy + (sx - v.ox) / v.scale }
    : { x: v.cx + (sx - v.ox) / v.scale, y: v.cy + (sy - v.oy) / v.scale };
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
  const pool = shuffle(others, rnd);   // 2단계 방(room.ts)과 같은 섞기를 쓴다
  const humanSlot = Math.min(1, perSide - 1);
  const out: LineupSlot[] = [];
  let k = 0;
  for (let slot = 0; slot < perSide; slot++) {
    out.push(slot === humanSlot ? { num: humanNum, side: 0, human: true } : { num: pool[k++], side: 0, human: false });
  }
  for (let slot = 0; slot < perSide; slot++) out.push({ num: pool[k++], side: 1, human: false });
  return out;
}

/** 이 명단에서 고를 수 있는 가장 큰 인원(한 편 최대 6 — 2026-11-07, 혼자 연습도 6대6까지). */
export const maxPerSide = (rosterSize: number): number => Math.max(0, Math.min(6, Math.floor(rosterSize / 2)));
