// src/lib/matches.ts — 매치 기록. 순수 로직만(DOM·저장소·서버 없음), 단위 테스트 대상.
// 설계: docs/superpowers/specs/ 의 2026-09-25 매치 설계 문서(투표 기능은 2026-11-06 에 뺐다).
//
// 매치 하나 = 하루. 팀짜기(teams.ts)의 상태를 **이름까지 박은 스냅샷**으로 굳혀 저장한다 —
// 명단에서 빠진 사람도 지난 매치엔 그대로 보여야 하니까.
import { MIN_TEAMS, VESTS, guestKey, membersOf, playerKey, teamViews, unassigned, type TeamsState } from './teams.ts';
import type { Match, MatchTeam, Player, VestKey } from './types.ts';

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

/** 상대팀 매치용 — 온 사람(명단+용병) 전부를 우리 팀 하나로. 팀 나누기는 필요 없다(2026-09-28). */
export function snapshotSquad(st: TeamsState, players: Player[]): Snapshot {
  const members = membersOf(st, players);
  if (members.length === 0) return { ok: false, error: '온 사람이 없습니다' };
  return { ok: true, lineup: [{ vest: 'none', members: members.map((m) => ({ num: m.num, name: m.name })) }] };
}

export type Result = 'W' | 'D' | 'L';
export const RESULT_KO: Record<Result, string> = { W: '승', D: '무', L: '패' };
export const isExternal = (m: Match): boolean => !!m.opponent;
/** 상대팀 매치 결과. 자체전이거나 스코어 전이면 null. */
export function resultOf(m: Match): Result | null {
  if (!isExternal(m) || m.scoreUs == null || m.scoreThem == null) return null;
  return m.scoreUs > m.scoreThem ? 'W' : m.scoreUs < m.scoreThem ? 'L' : 'D';
}
/** 상대팀 전적 — 스코어가 들어간 경기만. */
export function record(matches: Match[]): { w: number; d: number; l: number; gf: number; ga: number; played: number } {
  const r = { w: 0, d: 0, l: 0, gf: 0, ga: 0, played: 0 };
  for (const m of matches) {
    const x = resultOf(m);
    if (!x) continue;
    r.played += 1; r.gf += m.scoreUs!; r.ga += m.scoreThem!;
    if (x === 'W') r.w += 1; else if (x === 'D') r.d += 1; else r.l += 1;
  }
  return r;
}

export const vestOf = (key: VestKey): (typeof VESTS)[number] => VESTS.find((v) => v.key === key) ?? VESTS[0];

const DOW = ['일', '월', '화', '수', '목', '금', '토'];
/** '2026-09-27' → '9월 27일 (토)'. 해가 다르면 앞에 붙인다. */
export function matchLabel(ymd: string, todayYear?: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return ymd;
  const dow = DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const head = todayYear != null && todayYear !== y ? `${y}년 ` : '';
  return `${head}${m}월 ${d}일 (${dow})`;
}

/** 영상 링크로 쓸 수 있는 문자열인가 — 비면 false, http(s) 로 시작해야 true(서버도 같은 규칙). */
export const isVideoUrl = (v: string): boolean => /^https?:\/\/\S+$/i.test((v ?? '').trim());

/** 저장된 매치를 팀짜기 상태로 되돌린다(2026-09-25 "수정도 가능하게"). 팀은 조끼 순서대로 0·1·2·3 번 칸.
 *  명단에서 빠진 사람(번호가 지금 명단에 없음)은 이름만 든 용병으로 옮겨 **한 명도 잃지 않는다** —
 *  membersOf 가 명단에 없는 번호를 화면에서 거르기 때문이다. 용병 id 는 부르는 쪽이 준다(순수 함수). */
export function fromMatch(m: Match, players: Player[], guestId: (i: number) => string = (i) => `m${m.id}-${i}`): TeamsState {
  const have = new Set(players.map((p) => p.num));
  const st: TeamsState = { teams: MIN_TEAMS, picked: [], guests: [], assign: {} };
  let gi = 0;
  m.lineup.forEach((t) => {
    const team = Math.max(0, VESTS.findIndex((v) => v.key === t.vest));
    st.teams = Math.max(st.teams, team + 1);
    for (const x of t.members) {
      if (x.num != null && have.has(x.num)) {
        if (!st.picked.includes(x.num)) st.picked.push(x.num);
        st.assign[playerKey(x.num)] = team;
      } else {
        const id = guestId(gi++);
        st.guests.push({ id, name: x.name });
        st.assign[guestKey(id)] = team;
      }
    }
  });
  return st;
}
