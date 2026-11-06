// src/react/game/views/match2d/solo-setup.ts — 2D 경기 혼자 연습의 한 판 만들기(2026-11-06). SoloMatch.tsx 에 있던 것을 그대로 옮겼다(2026-11-07).
// 방의 buildMatch 와 다른 뽑기(pickLineup)를 쓴다 — 1단계 혼자 연습의 라인업·난수 순서를 그대로 지키려고 합치지 않는다.
import { fieldFor, type FieldChoice } from '../../../../lib/games/match2d-room';
import { sideCounts, type MatchConfig, type MatchPlayer } from '../../../../lib/game/sim';
import { perfOf } from '../../../../lib/game/stats';
import type { Player } from '../../../../lib/types';
import type { SoloSetup } from '../types';
import { pickLineup, rngFrom } from './view';

/** 혼자 연습 설정 — 인원 1대1~6대6, 경기장 자동/작게/보통/크게/아주 크게(2026-11-07). */
/** botPicks = 우리 편·상대 봇으로 고른 선수(차례대로, 비면 무작위) — "그리고 봇도 선수를 고를 수 있게 해줘". */
export type Req = { num: number; perSide: 1 | 2 | 3 | 4 | 5 | 6; minutes: number; scoreLimit: number; field: FieldChoice; botPicks?: [number[], number[]] };

/** "3대3"·"4대2" — 두 편 인원이 달라도 된다. */
export function sidesText(config: MatchConfig): string {
  const [a, b] = sideCounts(config);
  return `${a}대${b}`;
}

/** 설정 → 경기. 씨앗은 여기(화면 쪽 시계)에서 만든다 — 계산 코드는 시계·난수를 모른다. */
export function buildSoloMatch(req: Req, roster: Player[]): SoloSetup<MatchConfig> {
  const seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
  const lineup = pickLineup(roster.map((p) => p.num), req.num, req.perSide, rngFrom(seed ^ 0x9e3779b9), req.botPicks);
  const players: MatchPlayer[] = lineup.map((l, id) => {
    const p = roster.find((r) => r.num === l.num) as Player;
    return { id, num: l.num, name: p.name, side: l.side, bot: !l.human, perf: perfOf(p, roster) };
  });
  const field = req.field === 'auto' ? fieldFor(req.perSide * 2) : req.field;
  const config: MatchConfig = { field, minutes: req.minutes, scoreLimit: req.scoreLimit, players };
  return { config, seed, myId: lineup.findIndex((l) => l.human) };
}
