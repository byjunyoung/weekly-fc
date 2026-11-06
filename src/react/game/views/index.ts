// src/react/game/views/index.ts — 게임 화면 등록부(2026-11-07). 계산 쪽 등록부(src/lib/games/registry.ts)와 같은 id 로 짝을 맞춘다.
// 따로 두는 이유: 목록 페이지(빌드 때)는 계산 쪽 등록부만 읽는다 — 여기를 부르면 캔버스·리액트 코드까지 딸려 간다.
// 게임을 하나 만들면 여기에도 한 줄(그 게임의 views/<id>).
import type { AnyView } from './types';
import { match2dView } from './match2d';

const VIEWS: Record<string, AnyView> = { match2d: match2dView };

/** id → 그 게임의 화면. 모르면 undefined. */
export function viewOf(id: string | null | undefined): AnyView | undefined {
  return id && Object.prototype.hasOwnProperty.call(VIEWS, id) ? VIEWS[id] : undefined;
}
