// src/lib/teams.ts — 자체전 팀 나누기. 순수 로직만(DOM·저장소 접근 없음), 단위 테스트 대상.
//
// 왜 라인업과 따로인가: 라인업은 **한 팀의 자리 배치**고, 이건 **온 사람을 몇 팀으로 가르는** 일이다.
// 사용자가 매주 카톡에 손으로 적던 걸 그대로 옮긴다(2026-09-22 요청) —
//   [노란조끼팀]
//   현서 / 동훈 / 준영
// 팀 이름은 그날 입는 조끼 색이고, 명단에 없는 용병도 이름만 적어 끼운다.
import { ovr } from './stats.ts';
import type { Player } from './types.ts';

/** 그날 입는 조끼 색 = 팀 이름. 팀을 늘리면 이 순서대로 쓴다. */
export const VESTS = [
  { key: 'yellow', label: '노란조끼', color: '#f1c40f' },
  { key: 'orange', label: '주황조끼', color: '#e67e22' },
  { key: 'neon', label: '야광조끼', color: '#c8ff3d' },
  { key: 'black', label: '검정조끼', color: '#34495e' },
] as const;

export const MIN_TEAMS = 2;
export const MAX_TEAMS = VESTS.length;

/** 명단에 없는 사람. 이름만 있고 능력치가 없어 평균 계산에서 빠진다. */
export type Guest = { id: string; name: string };

/** 사람 한 명을 가리키는 키 — 명단 선수는 `p{번호}`, 용병은 `g{id}`. 한 곳에서만 만든다. */
export const playerKey = (num: number): string => `p${num}`;
export const guestKey = (id: string): string => `g${id}`;

export type TeamsState = {
  teams: number;                      // 2~4
  picked: number[];                   // 참석하는 명단 선수 번호
  guests: Guest[];
  assign: Record<string, number>;     // 사람 키 → 팀 번호(0-based)
};

export const initialTeams = (): TeamsState => ({ teams: 3, picked: [], guests: [], assign: {} });

const clampTeams = (n: number): number => Math.min(MAX_TEAMS, Math.max(MIN_TEAMS, Math.round(n) || MIN_TEAMS));

/** 팀 수를 바꾼다. 줄어들어 갈 곳이 없어진 사람은 배정을 푼다(지우지 않는다). */
export function setTeams(st: TeamsState, n: number): TeamsState {
  const teams = clampTeams(n);
  const assign: Record<string, number> = {};
  for (const [k, t] of Object.entries(st.assign)) if (t < teams) assign[k] = t;
  return { ...st, teams, assign };
}

/** 참석 토글. 빼면 배정도 같이 푼다 — 안 온 사람이 팀에 남아 있으면 안 된다. */
export function togglePicked(st: TeamsState, num: number): TeamsState {
  const has = st.picked.includes(num);
  const picked = has ? st.picked.filter((n) => n !== num) : [...st.picked, num];
  const assign = { ...st.assign };
  if (has) delete assign[playerKey(num)];
  return { ...st, picked, assign };
}

/** 용병 추가. 이름이 비면 무시하고, id 는 부르는 쪽이 준다(순수 함수를 지키려고). */
export function addGuest(st: TeamsState, id: string, name: string): TeamsState {
  const clean = name.trim();
  if (!clean) return st;
  return { ...st, guests: [...st.guests, { id, name: clean }] };
}

export function removeGuest(st: TeamsState, id: string): TeamsState {
  const assign = { ...st.assign };
  delete assign[guestKey(id)];
  return { ...st, guests: st.guests.filter((g) => g.id !== id), assign };
}

/** 한 사람을 팀으로 옮긴다. `null` 이면 배정을 푼다(아직 안 정한 칸으로 돌아간다). */
export function moveTo(st: TeamsState, key: string, team: number | null): TeamsState {
  const assign = { ...st.assign };
  if (team == null || team < 0 || team >= st.teams) delete assign[key];
  else assign[key] = team;
  return { ...st, assign };
}

export type Member = { key: string; name: string; ovr: number | null; num: number | null };

/** 참석자 전체 — 명단 선수(능력치 있음) 다음에 용병(없음). 화면·자동배치·텍스트가 같이 쓴다. */
export function membersOf(st: TeamsState, players: Player[]): Member[] {
  const byNum = new Map(players.map((p) => [p.num, p]));
  const roster = st.picked
    .map((num) => byNum.get(num))
    .filter((p): p is Player => !!p)
    .map((p) => ({ key: playerKey(p.num), name: p.name, ovr: ovr(p), num: p.num }));
  const guests = st.guests.map((g) => ({ key: guestKey(g.id), name: g.name, ovr: null, num: null }));
  return [...roster, ...guests];
}

/**
 * 자동 배치 — OVR 내림차순 **뱀 드래프트**(1·2·3 / 3·2·1 / 1·2·3 …).
 * 단순 반씩 가르기보다 팀 평균이 고르게 모이고, 같은 입력이면 항상 같은 결과다.
 * 용병은 능력치를 모르므로 맨 뒤에서 사람 수가 적은 팀부터 채운다 — 실력이 아니라 머릿수를 맞춘다.
 */
export function autoBalance(st: TeamsState, players: Player[]): TeamsState {
  const all = membersOf(st, players);
  const rated = all.filter((m) => m.ovr != null).sort((a, b) => (b.ovr! - a.ovr!) || (a.num! - b.num!));
  const rest = all.filter((m) => m.ovr == null);

  const assign: Record<string, number> = {};
  const size = Array.from({ length: st.teams }, () => 0);
  rated.forEach((m, i) => {
    const round = Math.floor(i / st.teams);
    const slot = i % st.teams;
    const team = round % 2 === 0 ? slot : st.teams - 1 - slot;   // 뱀
    assign[m.key] = team;
    size[team] += 1;
  });
  for (const m of rest) {
    let team = 0;
    for (let t = 1; t < st.teams; t++) if (size[t] < size[team]) team = t;
    assign[m.key] = team;
    size[team] += 1;
  }
  return { ...st, assign: refine(assign, rated, st.teams) };
}

/** 팀 평균의 최댓값−최솟값. 사람이 없는 팀은 뺀다(0으로 치면 늘 그 팀이 최솟값이 된다). */
function spread(assign: Record<string, number>, rated: Member[], teams: number): number {
  const sum = Array.from({ length: teams }, () => 0);
  const cnt = Array.from({ length: teams }, () => 0);
  for (const m of rated) { const t = assign[m.key]; sum[t] += m.ovr!; cnt[t] += 1; }
  const avgs = sum.map((s, t) => (cnt[t] ? s / cnt[t] : null)).filter((v): v is number => v != null);
  return avgs.length < 2 ? 0 : Math.max(...avgs) - Math.min(...avgs);
}

/**
 * 뱀 드래프트 뒤 **맞바꿈으로 다듬기**. 인원이 안 맞아떨어지면(10명을 3팀으로) 뱀만으로는
 * 평균이 꽤 벌어진다 — 실제로 10명·3팀에서 84/86/79 가 나왔다. 두 팀에서 한 명씩 바꿔 보고
 * 평균 차이가 **더 줄어들 때만** 받아들인다. 머릿수는 안 바뀌므로 인원 균형은 그대로다.
 * 같은 입력이면 같은 결과다 — 훑는 순서가 고정이고 더 나아질 때만 바꾼다.
 */
function refine(assign: Record<string, number>, rated: Member[], teams: number): Record<string, number> {
  const out = { ...assign };
  for (let pass = 0; pass < 50; pass++) {
    let best = null as null | { a: string; b: string; gain: number };
    const cur = spread(out, rated, teams);
    for (let i = 0; i < rated.length; i++) {
      for (let j = i + 1; j < rated.length; j++) {
        const a = rated[i].key, b = rated[j].key;
        if (out[a] === out[b]) continue;
        const ta = out[a], tb = out[b];
        out[a] = tb; out[b] = ta;
        const gain = cur - spread(out, rated, teams);
        out[a] = ta; out[b] = tb;
        if (gain > 1e-9 && (!best || gain > best.gain)) best = { a, b, gain };
      }
    }
    if (!best) break;
    const ta = out[best.a];
    out[best.a] = out[best.b];
    out[best.b] = ta;
  }
  return out;
}

export type TeamView = { vest: (typeof VESTS)[number]; members: Member[]; avg: number | null };

/** 팀별로 묶어 보여 줄 모양. 평균은 **능력치가 있는 사람만**으로 낸다(용병은 모르니까). */
export function teamViews(st: TeamsState, players: Player[]): TeamView[] {
  const all = membersOf(st, players);
  return Array.from({ length: st.teams }, (_, t) => {
    const members = all.filter((m) => st.assign[m.key] === t);
    const rated = members.filter((m) => m.ovr != null);
    const avg = rated.length ? Math.round(rated.reduce((s, m) => s + m.ovr!, 0) / rated.length) : null;
    return { vest: VESTS[t], members, avg };
  });
}

/** 아직 팀을 안 정한 사람. */
export const unassigned = (st: TeamsState, players: Player[]): Member[] =>
  membersOf(st, players).filter((m) => st.assign[m.key] == null);

/** 카톡에 붙여넣는 이름 — 성을 뗀다(사용자가 늘 그렇게 적는다: 김현서 → 현서).
 *  두 글자 이하는 그대로 둔다. 네 글자(두 글자 성)는 이 규칙으로 한 글자만 떨어지는데,
 *  드물기도 하고 잘못 떼는 것보다 한 글자 남는 편이 알아보기 쉽다.
 *  **용병에는 안 쓴다** — "오준 용병+2" 처럼 성+이름이 아닌 자유 문구라 첫 글자를 떼면 망가진다. */
export const shortName = (name: string): string => (name.length >= 3 ? name.slice(1) : name);
const listName = (m: Member): string => (m.num == null ? m.name : shortName(m.name));

/** 카톡에 그대로 붙여넣을 텍스트. 사용자가 손으로 적던 모양을 그대로 따른다. */
export function shareText(st: TeamsState, players: Player[]): string {
  return teamViews(st, players)
    .filter((t) => t.members.length > 0)
    .map((t) => `[${t.vest.label}팀]\n${t.members.map(listName).join(' / ')}`)
    .join('\n\n');
}

const KEY = 'wfc.teams.draft';

export const serialize = (st: TeamsState): string => JSON.stringify(st);

/** 저장된 초안 복원 — 모양이 깨졌거나 명단에 없는 번호는 조용히 버린다. */
export function restore(raw: string | null, players: Player[]): TeamsState {
  const base = initialTeams();
  if (!raw) return base;
  try {
    const o = JSON.parse(raw) as Partial<TeamsState>;
    const live = new Set(players.map((p) => p.num));
    const picked = Array.isArray(o.picked) ? o.picked.filter((n) => typeof n === 'number' && live.has(n)) : [];
    const guests = Array.isArray(o.guests)
      ? o.guests.filter((g): g is Guest => !!g && typeof g.id === 'string' && typeof g.name === 'string')
      : [];
    // teams 가 숫자가 아니면(문자열 JSON 등) 기본값을 쓴다 — clampTeams 에 NaN 을 넣으면
    // 최솟값 2 로 떨어져 기본 3 과 달라진다(테스트가 잡았다).
    const teams = Number.isFinite(Number(o.teams)) ? clampTeams(Number(o.teams)) : base.teams;
    const st: TeamsState = { ...base, teams, picked, guests, assign: {} };
    const keys = new Set(membersOf(st, players).map((m) => m.key));
    const assign: Record<string, number> = {};
    for (const [k, t] of Object.entries(o.assign ?? {})) {
      if (keys.has(k) && typeof t === 'number' && t >= 0 && t < st.teams) assign[k] = t;
    }
    return { ...st, assign };
  } catch { return base; }
}

export function load(players: Player[]): TeamsState {
  try { return restore(localStorage.getItem(KEY), players); } catch { return initialTeams(); }
}
export function save(st: TeamsState): void {
  try { localStorage.setItem(KEY, serialize(st)); } catch { /* 저장 못 해도 화면은 돈다 */ }
}
