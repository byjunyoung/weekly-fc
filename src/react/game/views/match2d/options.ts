// src/react/game/views/match2d/options.ts — 2D 경기의 설정 고르기 목록(2026-11-07). 방 설정과 혼자 연습이 같이 쓴다.
// Entry.tsx 에 있던 것을 그대로 옮겼다(게임 묶음 토대 — 설정 화면이 게임마다의 것이 되어서).
import type { FieldChoice } from '../../../../lib/games/match2d-room';

export const SCORE_LIMITS = [0, 1, 3, 5] as const;
/** 경기장 고르기(2026-11-07 "맵 크기도 크기별로") — 방 설정과 혼자 연습이 같이 쓴다. */
export const FIELD_OPTIONS: { value: FieldChoice; label: string }[] = [
  { value: 'auto', label: '자동' }, { value: 'S', label: '작게' }, { value: 'M', label: '보통' }, { value: 'L', label: '크게' }, { value: 'XL', label: '아주 크게' },
];
