// src/lib/types.ts
export type Pos = 'GK' | 'DF' | 'MF' | 'FW';
export type Player = { num: number; name: string; pos: Pos | ''; detail: string; foot: string; vest: number | null; note: string;
  pace: number; dribble: number; pass: number; shoot: number; defend: number; stamina: number; rot: number | null; avatar: string; phone?: string };
export type Team = { name: string; players: string[]; points: number | null };
export type MatchType = '2파전' | '3파전' | '';
export type Match = { id: string; date: string; location: string; youtube: string; type: MatchType; attendees: string[]; teams: Team[]; winner: string };
export type FineType = '지각' | '노쇼';
export type Fine = { id: string; date: string; match_id: string; player: string; type: FineType; amount: number; paid: boolean };
export type RotationRow = { year: number; month: number; p1: string; p2: string; done: boolean };
export type Lineup = { id: string; match_id: string; name: string; formation: string; assignments: string };
export type Video = { id: string; title: string; published: string };
/** 능력치를 누가 언제 어떻게 고쳤는지. 고친 사람(by)은 홈에서 고른 번호라 자칭이다 —
 *  막는 장치가 아니라 서로 보면서 조절되라고 남기는 기록이다(2026-09-22). */
export type StatLogRow = { ts: string; by: number | null; byName: string; num: number; field: StatKey; before: number; after: number };
export type Data = { players: Player[]; matches: Match[]; rotation: RotationRow[]; fines: Fine[]; lineups: Lineup[]; statLog: StatLogRow[] };
export const STAT_KEYS = ['pace', 'dribble', 'pass', 'shoot', 'defend', 'stamina'] as const;
export type StatKey = (typeof STAT_KEYS)[number];
