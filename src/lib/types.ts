// src/lib/types.ts
export type Pos = 'GK' | 'DF' | 'MF' | 'FW';
export type Player = { num: number; name: string; pos: Pos | ''; detail: string; foot: string; vest: number | null; note: string;
  pace: number; dribble: number; pass: number; shoot: number; defend: number; stamina: number; rot: number | null; avatar: string; phone?: string };
export type FineType = '지각' | '노쇼';
export type Fine = { id: string; date: string; match_id: string; player: string; type: FineType; amount: number; paid: boolean };
export type RotationRow = { year: number; month: number; p1: string; p2: string; done: boolean };
/** 능력치를 누가 언제 어떻게 고쳤는지. 고친 사람(by)은 홈에서 고른 번호라 자칭이다 —
 *  막는 장치가 아니라 서로 보면서 조절되라고 남기는 기록이다(2026-09-22). */
/** via: '' = 직접 고친 줄(옛 스텝퍼·관리자), 'game' = 티어 게임 대결(2026-09-24). */
export type StatLogRow = { ts: string; by: number | null; byName: string; num: number; field: StatKey; before: number; after: number; via: string };
/** 매치(2026-09-25) — 하루 하나. lineup 은 저장 때 이름까지 박은 스냅샷이라 명단에서 빠진 사람도 남는다.
 *  tally 는 POTM 표 집계(번호 → 표). 누가 누구를 찍었는지는 서버가 내보내지 않는다. */
export type VestKey = 'none' | 'orange' | 'neon' | 'black';
export type MatchMember = { num: number | null; name: string };   // num 없으면 용병
export type MatchTeam = { vest: VestKey; members: MatchMember[] };
export type Match = { id: number; date: string; lineup: MatchTeam[]; tally: Record<number, number>; voters: number };
export type Data = { players: Player[]; rotation: RotationRow[]; fines: Fine[]; statLog: StatLogRow[]; matches: Match[] };
export const STAT_KEYS = ['pace', 'dribble', 'pass', 'shoot', 'defend', 'stamina'] as const;
export type StatKey = (typeof STAT_KEYS)[number];
