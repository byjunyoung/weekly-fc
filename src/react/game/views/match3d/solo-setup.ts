// src/react/game/views/match3d/solo-setup.ts — 3D 경기 혼자 하기의 한 판 만들기(2026-11-07 게임 묶음 4단계). DOM·three.js 없음.
// 방의 시작(buildMatch3d)을 그대로 쓴다 — 나 혼자 주황 칸에 선 방을 하나 세워 부른다. 그래서 혼자·방이 같은 편성·같은 봇 뽑기다
// (예전 시제품은 따로 뽑았다 — pickLineup5). 사람은 앞줄, 골키퍼는 봇.
import type { MatchConfig } from '../../../../lib/game3d/sim';
import type { Outfield, Room3d } from '../../../../lib/games/match3d-room';
import { buildMatch3d, startBlock3d } from '../../../../lib/games/match3d-room';
import type { Player } from '../../../../lib/types';
import type { SoloSetup } from '../types';
import { rngFrom } from './view3d';

export type Req3d = { num: number; outfield: Outfield; minutes: number; scoreLimit: number };

const SOLO_ID = 'solo';

/** 나 혼자 주황 칸에 선 방. */
export function soloRoom(req: Req3d, roster: Player[]): Room3d {
  const me = roster.find((p) => p.num === req.num);
  return {
    code: 'SOLO', hostId: SOLO_ID, members: [{ clientId: SOLO_ID, num: req.num, name: me?.name ?? String(req.num), team: 0 }],
    game: 'match3d', settings: { outfield: req.outfield, minutes: req.minutes, scoreLimit: req.scoreLimit }, saved: {},
    phase: 'lobby', rev: 0, botPicks: [[], []],
  };
}

/** 이 명단으로 못 하는 인원이면 true(명단이 모자라 봇을 못 채움). */
export const soloBlocked = (req: Req3d, roster: Player[]): boolean => startBlock3d(soloRoom(req, roster), roster) !== null;

/** 설정 → 경기. 씨앗은 여기(화면 쪽 시계)에서 만든다 — 계산 코드는 시계·난수를 모른다. */
export function buildSolo3d(req: Req3d, roster: Player[]): SoloSetup<MatchConfig> {
  const seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
  const { config, slots } = buildMatch3d(soloRoom(req, roster), roster, rngFrom(seed ^ 0x9e3779b9));
  return { config, seed, myId: slots.indexOf(SOLO_ID) };
}
