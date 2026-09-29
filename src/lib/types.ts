// src/lib/types.ts
export type Pos = 'GK' | 'DF' | 'MF' | 'FW';
export type Player = { num: number; name: string; pos: Pos | ''; detail: string; foot: string; vest: number | null; note: string;
  pace: number; dribble: number; pass: number; shoot: number; defend: number; stamina: number; rot: number | null; avatar: string; phone?: string };
export type FineType = '지각' | '노쇼';
export type Fine = { id: string; date: string; match_id: string; player: string; type: FineType; amount: number; paid: boolean };
export type RotationRow = { year: number; month: number; p1: string; p2: string; done: boolean };
/** 능력치를 누가 언제 어떻게 고쳤는지. 고친 사람(by)은 홈에서 고른 번호라 자칭이다 —
 *  막는 장치가 아니라 서로 보면서 조절되라고 남기는 기록이다(2026-09-22). */
/** via: '' = 직접 고친 줄(옛 스텝퍼·관리자), 'game' = 티어 게임 대결(2026-09-24), 'place' = 새 선수 배치 대결,
 *  'potm' = POTM 보상 +1(2026-09-28, 서버 예약 작업 private.settle_potm 이 매치 다음 날 0시 5분에). */
/** opp·oppName: 티어 게임 대결 상대(2026-09-29) — 서버 stat_history 만 붙여 준다(get_all 의 8줄엔 없다). 못 찾으면 없음. */
export type StatLogRow = { ts: string; by: number | null; byName: string; num: number; field: StatKey; before: number; after: number; via: string;
  opp?: number; oppName?: string };
/** 매치(2026-09-25) — 하루 하나. lineup 은 저장 때 이름까지 박은 스냅샷이라 명단에서 빠진 사람도 남는다.
 *  tally 는 POTM 표 집계(번호 → 표). 누가 누구를 찍었는지는 서버가 내보내지 않는다. */
export type VestKey = 'none' | 'orange' | 'neon' | 'black';
export type MatchMember = { num: number | null; name: string };   // num 없으면 용병
export type MatchTeam = { vest: VestKey; members: MatchMember[] };
/** opponent = '' 이면 자체전(조끼 팀 둘 이상), 이름이 있으면 상대팀전(lineup 은 우리 팀 하나). 스코어는 경기 뒤 관리자가 — 없으면 null(2026-09-28). */
export type Match = { id: number; date: string; lineup: MatchTeam[]; tally: Record<number, number>; voters: number; video: string;
  opponent: string; scoreUs: number | null; scoreThem: number | null };
export type Data = { players: Player[]; rotation: RotationRow[]; fines: Fine[]; statLog: StatLogRow[]; matches: Match[] };
export const STAT_KEYS = ['pace', 'dribble', 'pass', 'shoot', 'defend', 'stamina'] as const;
export type StatKey = (typeof STAT_KEYS)[number];
/** 선수 방명록 한 줄(2026-09-25). 이름은 쓴 시점의 것 — 서버가 붙인다. */
export type GuestbookRow = { id: number; num: number; authorNum: number | null; authorName: string; text: string; ts: string };
