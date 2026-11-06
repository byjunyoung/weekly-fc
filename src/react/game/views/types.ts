// src/react/game/views/types.ts — 게임 화면의 약속(2026-11-07). 게임 하나 = 어댑터(src/lib/games) + 이 화면.
// 설계: docs/superpowers/specs/2026-11-07-games-program-design.md §2 — "화면은 게임마다 { render, input, hud } 를 낸다.
// 경기 화면 틀(전체 화면 오버레이·✕·소리·한마디·끊김 안내·결과)은 공용."
// 사용자: "자유 훈련장, 여러 드리블 훈련장, 승부차기, 프리킥 같은 게임 만들어서 온라인 가능하게 하자. 다 2d, 3d 모드 별로 가능하게 하고."
//
// 공용 틀(../play)이 하는 것: 오버레이·캔버스 자리·✕(확인)·♪·한마디·구경 표시·멈춤/끊김 띠·결과 상자, 조이스틱·킥 버튼과 키보드,
// 혼자·방장·손님의 고정 틱 루프. 게임 화면이 하는 것: 아래 멤버. 화면은 계산을 모른다 — 상태를 받아 그리고, 조작을 그 게임의 입력으로 바꿀 뿐.
import type { ComponentType, ReactNode, RefObject } from 'react';
import type { RoomState } from '../../../lib/game/room';
import type { Player } from '../../../lib/types';
import type { ScreenInput } from '../input';
import type { Sfx } from '../sfx';

/** 지금 화면의 카메라(디버그 훅 getView 용) — cx·cy(논리 좌표), scale(논리 1 = 몇 px), follow(따라가는 중). */
export type Camera = { cx: number; cy: number; scale: number; follow: boolean };

/** 한 프레임 그릴 것 — 세션(또는 혼자 루프)이 조립해 준다. myId = 내 자리(구경이면 null), bubbles = 한마디 말풍선. */
export type FrameIn<S, C> = { state: S; config: C; myId: number | null; bubbles: { id: number; text: string }[] };

/** 한 판 동안 열려 있는 그림판. 캔버스를 받아 2D 캔버스든 WebGL 이든 장면이 스스로 연다(getContext 를 장면이 정한다). */
export type Scene<S, C, I> = {
  /** 한 프레임. 점수판·안내 같은 캔버스 위 HUD 도 여기서 그린다. 크기가 아직 안 잡혔으면 그냥 돌아간다. */
  draw(f: FrameIn<S, C>): void;
  /** 화면 기준 조작(조이스틱·키, 위가 -y) → 이 게임의 입력. 세로 화면이면 돌리는 것처럼 화면 배치를 아는 건 장면뿐이라 여기. */
  toInput(h: ScreenInput): I;
  /** 지금 카메라(디버그 훅). 없으면 null. */
  camera(): Camera | null;
  dispose(): void;
};

/** 결과 상자 — outcome 큰 글자, tone 색, score 점수 줄, sub 작은 설명. 버튼은 공용 틀이 붙인다(혼자·방장·손님마다). */
export type ResultView = { outcome: string; tone: 'win' | 'lose' | 'draw'; score: ReactNode; sub: string };

/** 혼자 하기의 한 판 — 다시 하기는 make 를 한 번 더 부른다(새 씨앗). */
export type SoloSetup<C> = { config: C; seed: number; myId: number };

export type SettingsProps<T> = {
  room: RoomState<T>;
  players: Player[];
  /** 방장이고 로비라 고칠 수 있나. */
  editable: boolean;
  /** 방장이면 설정 고치기, 손님이면 null(보기만 — 한 줄 요약). */
  onChange: ((patch: Partial<T>) => void) | null;
  /** 설정 줄 맨 앞에 끼울 줄(방장의 게임 종류 고르기). */
  lead?: ReactNode;
};

export type SoloProps<C> = {
  /** 혼자 연습 칸이 열렸나. 닫혀도 컴포넌트는 남아 고른 값을 기억한다. */
  open: boolean;
  /** 열린 칸(스크롤해 보여 줄 곳). */
  cardRef: RefObject<HTMLDivElement | null>;
  players: Player[];
  /** 고른 내 선수(명단 번호). */
  num: number | null;
  onStart(make: () => SoloSetup<C>): void;
};

export type GameView<C, S, I, T> = {
  /** 등록부(src/lib/games/registry)의 같은 id. */
  id: string;
  /** 경기 화면을 연다. 못 열면(캔버스 문맥 없음) null. */
  mount(o: { root: HTMLElement; canvas: HTMLCanvasElement; config: C; roster: Player[] }): Scene<S, C, I> | null;
  /** 이어진 두 상태 사이의 소리. 혼자는 틱마다, 온라인은 그린 상태마다 부른다(예전 그대로). */
  sfx(prev: S, next: S): Sfx[];
  /** 끝난 상태 → 결과 상자. solo = 혼자 하기(문구가 조금 다르다 — 예전 화면 그대로). */
  result(final: S, config: C, o: { myId: number | null; solo: boolean }): ResultView;
  /** 입장 화면 글 — sub = 제목 옆 작은 글, header = 선수 고르기 위 한 줄. */
  entry: { sub: string; header: string };
  /** 명단이 이만큼은 있어야 판을 만든다(방 만들기·혼자 연습). */
  minRoster: number;
  /** 방 화면의 설정 칸 — 방장은 고르기, 손님은 한 줄 요약. */
  Settings: ComponentType<SettingsProps<T>>;
  /** 방 화면 설정 칸 아래 안내(방장에게만) — 없으면 안 그린다. */
  hostHint?: string;
  /** 조작 안내 한 줄(방 화면). */
  controls: string;
  /** 입장 화면의 혼자 연습 칸. */
  Solo: ComponentType<SoloProps<C>>;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyView = GameView<any, any, any, any>;
