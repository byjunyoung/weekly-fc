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
  /** 경기 화면을 연다. 못 열면(캔버스 문맥 없음) null. surface 가 있는 화면은 이걸 부르지 않는다(아래). */
  mount(o: { root: HTMLElement; canvas: HTMLCanvasElement; config: C; roster: Player[] }): Scene<S, C, I> | null;
  /** 그림판을 스스로 여닫는 화면(WebGL 등, 2026-11-07 4단계) — 있으면 공용 틀은 mount 대신 이걸 쓴다. 아래 Surface 참고. */
  surface?: SurfaceKit<S, C, I>;
  /** 이어진 두 상태 사이의 소리. 혼자는 틱마다, 온라인은 그린 상태마다 부른다(예전 그대로).
   *  config 는 4단계에 더했다(3D 경기는 골키퍼가 누군지 봐야 잡기 소리를 고른다) — 2D 는 안 쓴다. */
  sfx(prev: S, next: S, config?: C): Sfx[];
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

// ═══════════════════════════ 그림판을 스스로 여닫는 화면(2026-11-07 4단계 "3D 경기 온라인") ═══════════════════════════
// 위 약속은 2D 캔버스에 맞춰 쓰였다("WebGL 캔버스를 가진 화면이 나중에 들어올 자리는 남겨 둔다"). 3D 경기가 들어오며 그 자리를 채웠다 —
// 3D 화면은 무거운 묶음(three.js)을 경기 화면이 열릴 때만 받고, 조작 버튼이 다섯이고(2D 는 킥 하나), 점수판·이름표·말풍선을 장면 위 DOM 으로 그린다.
// 그래서 수명을 화면이 쥔다: 받기(load) → 만들기(create) → 크기(resize) → 프레임마다 그리기(render) → 닫기(dispose).
// 공용 틀은 여전히 ✕·♪·한마디·구경 표시·띠·결과 상자와 혼자·방장·손님 루프를 맡는다 — 화면은 받은 상태를 그리고 조작을 그 게임 입력으로 줄 뿐.
// 나중의 3D 미니게임(승부차기·프리킥·훈련장)도 이 모양으로 들어온다(보고서 p4-report.md §2).

/** create 가 받는 것. layer = 캔버스 위 DOM 층(점수판·이름표·버튼을 여기에 단다 — 틀의 ✕·결과 상자보다 아래에 깔린다).
 *  myId = 내 자리(구경이면 null), playing = 조작을 받나(구경이면 false — 버튼·키를 달지 않는다). */
export type SurfaceIn<C> = {
  root: HTMLElement; canvas: HTMLCanvasElement; layer: HTMLElement;
  config: C; roster: Player[]; myId: number | null; playing: boolean;
};

/** 한 프레임. state 는 틀이 이미 틱 사이를 섞은 것(어댑터 bodies — 손님은 예측한 몸 + 스냅샷의 점수·시계·단계)이고,
 *  dt = 지난 그리기에서 흐른 초(걸음·카메라 따라가기처럼 화면에만 있는 움직임용). */
export type SurfaceFrame<S, C> = FrameIn<S, C> & { dt: number };

export type Surface<S, C, I> = {
  /** 그릴 칸의 크기(CSS px)가 바뀌었다 — 틀이 root 크기를 보고 부른다(처음 한 번 포함). */
  resize(w: number, h: number): void;
  render(f: SurfaceFrame<S, C>): void;
  /** 이 화면이 직접 받는 조작 → 그 게임 입력. 틱마다 한 번 불린다(혼자·방장·손님 같은 자리). 구경이면 null.
   *  있으면 틀은 2D 조이스틱·킥 버튼을 달지도 보이지도 않는다. */
  readInput: (() => I) | null;
  camera(): Camera | null;
  /** 디버그 훅(?debug=1)에 덧붙일 것(예: getInfo, goalPatch). 없으면 안 붙인다. */
  debug?(): Record<string, unknown>;
  dispose(): void;
};

export type SurfaceKit<S, C, I> = {
  /** 무거운 묶음을 받는다(동적 import). 경기 화면이 열릴 때 틀이 부르고, 끝날 때까지 "불러오는 중"을 띄운다. 여러 번 불러도 된다. */
  load(): Promise<void>;
  /** load 가 끝난 뒤 그림판을 만든다. 못 열면(WebGL 없음 등) 사람에게 보일 이유 글. */
  create(o: SurfaceIn<C>): Surface<S, C, I> | string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyView = GameView<any, any, any, any>;
