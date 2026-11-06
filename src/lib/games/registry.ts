// src/lib/games/registry.ts — 게임 등록부(2026-11-07). id → 게임. 순수(화면을 모른다 — 목록 페이지가 빌드 때 이걸 읽는다).
// 설계: docs/superpowers/specs/2026-11-07-games-program-design.md §1·§2
//
// 사용자: "게임 메뉴는 아래 게임 여러개 고를 수 있게 만들고 만든 게임은 거기에 하나씩 추가하자",
// "자유 훈련장, 여러 드리블 훈련장, 승부차기, 프리킥 같은 게임 만들어서 온라인 가능하게 하자. 다 2d, 3d 모드 별로 가능하게 하고."
// 게임을 하나 만들면 여기 GAMES 에 한 줄 더한다 — 목록 카드(/games/·/games/3d/), 방의 게임 종류 고르기, 메시지 검사, 세션이 모두 이 목록을 본다.
// 화면 쪽 짝(그리기·조작·설정 화면)은 src/react/game/views/index.ts 에 같은 id 로 둔다(이 파일은 리액트·캔버스를 부르지 않는다).
import type { GameEntry, GameLookup, GameMode } from './entry.ts';
import { MATCH2D } from './match2d.ts';
import { MATCH3D } from './match3d.ts';
import { PENALTY2D } from './penalty2d.ts';
import { FREE2D } from './free2d.ts';
import { FREEKICK2D } from './freekick2d.ts';
import { DRIBBLE2D } from './dribble2d.ts';
import { PENALTY3D } from './penalty3d.ts';
import { FREE3D } from './free3d.ts';

/** 목록에 보이는 차례대로. */
export const GAMES: readonly GameEntry[] = [MATCH2D, PENALTY2D, FREE2D, FREEKICK2D, DRIBBLE2D, MATCH3D, PENALTY3D, FREE3D];

/** 방을 만들 때·주소에 ?g= 가 없거나 모를 때의 게임. */
export const DEFAULT_GAME = 'match2d';

const BY_ID = new Map(GAMES.map((g) => [g.adapter.id, g]));

/** id → 게임. 모르는 id(채널에서 온 것 포함)는 undefined. */
export const gameOf: GameLookup = (id) => (typeof id === 'string' ? BY_ID.get(id) : undefined);

/** 그 모드의 게임들(목록 차례). */
export function gamesOf(mode: GameMode): GameEntry[] {
  return GAMES.filter((g) => g.mode === mode);
}

/** 주소의 ?g= 값 → 게임 id. 모르면 기본 게임. */
export function gameFromParam(v: string | null | undefined): string {
  return v && BY_ID.has(v) ? v : DEFAULT_GAME;
}
