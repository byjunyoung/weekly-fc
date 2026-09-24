// src/lib/matches.ts — 매치 기록과 POTM. 순수 로직만(DOM·저장소·서버 없음), 단위 테스트 대상.
// 설계: docs/superpowers/specs/2026-09-25-matches-potm-design.md
//
// 매치 하나 = 하루. 팀짜기(teams.ts)의 상태를 **이름까지 박은 스냅샷**으로 굳혀 저장한다 —
// 명단에서 빠진 사람도 지난 매치엔 그대로 보여야 하니까. POTM 은 그날 뛴 회원이 한 표씩,
// 매치 날짜부터 7일 동안. 자격은 서버가 다시 보지만 화면이 미리 이유를 알려 주려고 여기서도 센다.
import { VESTS, membersOf, teamViews, unassigned, type TeamsState } from './teams.ts';
import type { Data, Match, MatchMember, MatchTeam, Player, VestKey } from './types.ts';

export const VOTE_DAYS = 7;

/** 'YYYY-MM-DD' 에 며칠을 더한다. 시간대에 안 흔들리게 UTC 자정으로 센다. */
export function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const t = new Date(Date.UTC(y, (m || 1) - 1, d || 1) + n * 86400000);
  return t.toISOString().slice(0, 10);
}

export type Snapshot = { ok: true; lineup: MatchTeam[] } | { ok: false; error: string };

/** 팀짜기 상태 → 저장할 lineup. 빈 팀은 빼고, 안 정한 사람이 있으면 저장하지 않는다(서버도 막지만 문구는 여기서). */
export function snapshot(st: TeamsState, players: Player[]): Snapshot {
  if (membersOf(st, players).length === 0) return { ok: false, error: '온 사람이 없습니다' };
  if (unassigned(st, players).length > 0) return { ok: false, error: '아직 안 정한 사람이 있습니다' };
  const lineup: MatchTeam[] = teamViews(st, players)
    .filter((t) => t.members.length > 0)
    .map((t) => ({ vest: t.vest.key, members: t.members.map((m) => ({ num: m.num, name: m.name })) }));
  if (lineup.length < 2) return { ok: false, error: '팀이 둘 이상이어야 합니다' };
  return { ok: true, lineup };
}

export const vestOf = (key: VestKey): (typeof VESTS)[number] => VESTS.find((v) => v.key === key) ?? VESTS[0];

/** 그날 뛴 명단 선수(용병 제외) — 팀 순서대로. 투표 후보이자 투표 자격의 기준. */
export const attendees = (m: Match): MatchMember[] => m.lineup.flatMap((t) => t.members).filter((x) => x.num != null);

/** 표가 가장 많은 사람. 동점이면 전부(공동 POTM). 표가 없으면 빈 배열. */
export function potmOf(m: Match): { nums: number[]; votes: number } {
  const entries = Object.entries(m.tally).map(([k, v]) => [Number(k), v] as const).filter(([, v]) => v > 0);
  if (!entries.length) return { nums: [], votes: 0 };
  const top = Math.max(...entries.map(([, v]) => v));
  return { nums: entries.filter(([, v]) => v === top).map(([n]) => n).sort((a, b) => a - b), votes: top };
}

export const deadline = (m: Match): string => addDays(m.date, VOTE_DAYS);
/** 투표 창 — 매치 날짜부터 7일째까지(둘 다 포함). today 는 'YYYY-MM-DD'(서울). */
export const voteOpen = (m: Match, today: string): boolean => today <= deadline(m);

export type Voter = { login: boolean; num: number | null };

/** 투표 못 하는 이유. 할 수 있으면 null. 마감이 먼저다 — 끝난 매치에 로그인을 권할 이유가 없다. */
export function voteBlock(m: Match, me: Voter, today: string): string | null {
  if (!voteOpen(m, today)) return '투표가 끝났습니다';
  if (!me.login) return '로그인하면 투표할 수 있습니다';
  if (me.num == null) return '먼저 내 이름을 골라 주세요';
  if (!attendees(m).some((x) => x.num === me.num)) return '그날 뛴 사람만 투표합니다';
  return null;
}

const DOW = ['일', '월', '화', '수', '목', '금', '토'];
/** '2026-09-27' → '9월 27일 (토)'. 해가 다르면 앞에 붙인다. */
export function matchLabel(ymd: string, todayYear?: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return ymd;
  const dow = DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const head = todayYear != null && todayYear !== y ? `${y}년 ` : '';
  return `${head}${m}월 ${d}일 (${dow})`;
}

/** 투표 응답의 집계를 데이터에 얹는다 — 서버가 낸 모양과 같아 다시 읽지 않아도 된다. 원본은 건드리지 않는다. */
export function applyPotm(d: Data, id: number, tally: Record<number, number>, voters: number): Data {
  return { ...d, matches: (d.matches ?? []).map((m) => (m.id === id ? { ...m, tally, voters } : m)) };
}

/** 영상 링크로 쓸 수 있는 문자열인가 — 비면 false, http(s) 로 시작해야 true(서버도 같은 규칙). */
export const isVideoUrl = (v: string): boolean => /^https?:\/\/\S+$/i.test((v ?? '').trim());

/** '2026-09-27' → '9/27'. 카드 리본처럼 좁은 자리용. */
export function shortDate(ymd: string): string {
  const [, m, d] = ymd.split('-').map(Number);
  return m && d ? `${m}/${d}` : ymd;
}

export type CurrentPotm = { date: string; matchId: number; nums: number[]; votes: number };
/** 지금 카드에 붙는 POTM — **표가 하나라도 있는 가장 최근 매치**의 1위(공동 포함). 사용자 결정(2026-09-25):
 *  "첫 표부터 바로". 다음 매치에 첫 표가 들어오면 그쪽으로 넘어간다. 캐시 순서를 믿지 않고 여기서 다시 정렬한다. */
export function currentPotm(matches: Match[]): CurrentPotm | null {
  const withVotes = (matches ?? []).filter((m) => Object.values(m.tally).some((v) => v > 0))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id));
  const m = withVotes[0];
  if (!m) return null;
  const p = potmOf(m);
  return { date: m.date, matchId: m.id, nums: p.nums, votes: p.votes };
}
