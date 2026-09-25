// src/lib/teams.ts — 자체전 팀 나누기. 순수 로직만(DOM·저장소 접근 없음), 단위 테스트 대상.
//
// 왜 라인업과 따로인가: 라인업은 **한 팀의 자리 배치**고, 이건 **온 사람을 몇 팀으로 가르는** 일이다.
// 사용자가 매주 카톡에 손으로 적던 걸 그대로 옮긴다(2026-09-22 요청) —
//   [노란조끼팀]
//   현서 / 동훈 / 준영
// 팀 이름은 그날 입는 조끼 색이고, 명단에 없는 용병도 이름만 적어 끼운다.
import { ovr } from './stats.ts';
import type { Player } from './types.ts';

/** 그날 입는 조끼 = 팀 이름. 카톡에 적던 순서 그대로다(노조끼 → 주황 → 야광).
 *  **"노조끼"는 노란조끼가 아니라 조끼를 안 입는 팀이다**(사용자 확인 2026-09-22) — 자기 옷을
 *  그대로 입으므로 점도 색 대신 밝은 회색이다. 네 팀으로 가를 때만 쓰는 검정조끼가 맨 뒤. */
export const VESTS = [
  { key: 'none', label: '노조끼', color: '#e5e5e5' },
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
    // 스탯이 전부 비면 ovr() 는 null 이 아니라 0 을 준다 — 그대로 두면 평균이 무너지므로
    // 용병과 같은 취급(머릿수만 맞춤)으로 돌린다(2026-09-22 리뷰).
    .map((p) => ({ key: playerKey(p.num), name: p.name, ovr: ovr(p) || null, num: p.num }));
  const guests = st.guests.map((g) => ({ key: guestKey(g.id), name: g.name, ovr: null, num: null }));
  return [...roster, ...guests];
}

/**
 * 자동 배치 — OVR 내림차순 **뱀 드래프트**(1·2·3 / 3·2·1 / 1·2·3 …).
 * 단순 반씩 가르기보다 팀 평균이 고르게 모이고, 같은 입력이면 항상 같은 결과다.
 * 용병은 능력치를 모르므로 맨 뒤에서 사람 수가 적은 팀부터 채운다 — 실력이 아니라 머릿수를 맞춘다.
 */
export function autoBalance(st: TeamsState, players: Player[], rnd?: () => number): TeamsState {
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
  const balanced = refine(assign, rated, st.teams);
  // 난수가 오면(화면) 누를 때마다 다른 조합 — 균형은 지킨다(2026-09-25 "누를 때마다 계속 섞이게").
  // 난수가 없으면(테스트·대조) 예전처럼 같은 입력이면 같은 결과.
  return { ...st, assign: rnd ? wander(balanced, rated, rest, st.teams, rnd) : balanced };
}

/** 균형 잡힌 배치에서 출발해 **평균 차이가 기준(원래 차이 + 1) 안에 머무는 맞바꿈만** 무작위로 받아들인다.
 *  그래서 팀 평균은 거의 그대로인데 조합은 매번 달라진다. 용병은 실력이 없으니 팀 사이에서 자유롭게 섞는다(머릿수 유지). */
function wander(assign: Record<string, number>, rated: Member[], rest: Member[], teams: number, rnd: () => number): Record<string, number> {
  const out = { ...assign };
  const limit = spread(out, rated, teams) + 1;
  const pick = (n: number): number => Math.min(n - 1, Math.floor(rnd() * n));
  const tries = rated.length * 6;
  for (let k = 0; k < tries && rated.length >= 2; k++) {
    const a = rated[pick(rated.length)].key, b = rated[pick(rated.length)].key;
    if (a === b || out[a] === out[b]) continue;
    const ta = out[a], tb = out[b];
    out[a] = tb; out[b] = ta;
    if (spread(out, rated, teams) > limit + 1e-9) { out[a] = ta; out[b] = tb; }
  }
  // 용병끼리 자리 섞기(팀별 머릿수는 그대로)
  for (let i = rest.length - 1; i > 0; i--) {
    const j = pick(i + 1);
    const a = rest[i].key, b = rest[j].key;
    const t = out[a]; out[a] = out[b]; out[b] = t;
  }
  return out;
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
/** 그날 나온 사람들 안에서 짧은 이름이 겹치면(준영: 강준영·김준영) 그 사람만 성을 붙여 낸다 —
 *  안 그러면 카톡만 보고 누가 어느 팀인지 알 수 없다(2026-09-22 리뷰가 실제 명단에서 두 쌍 발견). */
function nameMap(members: Member[]): Map<string, string> {
  const count = new Map<string, number>();
  for (const m of members) {
    if (m.num == null) continue;
    const s = shortName(m.name);
    count.set(s, (count.get(s) ?? 0) + 1);
  }
  const out = new Map<string, string>();
  for (const m of members) {
    if (m.num == null) { out.set(m.key, m.name); continue; }
    const s = shortName(m.name);
    out.set(m.key, (count.get(s) ?? 0) > 1 ? m.name : s);
  }
  return out;
}

/** 저장된 lineup(번호·이름만)에서도 같은 규칙으로 — 키는 명단 선수 `p{번호}`, 용병은 이름. 공유 이미지가 쓴다. */
export function nameMapOf(members: Array<{ num: number | null; name: string }>): Map<string, string> {
  return nameMap(members.map((m) => ({ key: m.num != null ? playerKey(m.num) : m.name, name: m.name, ovr: null, num: m.num })));
}

/** 카톡에 그대로 붙여넣을 텍스트. 사용자가 손으로 적던 모양을 그대로 따른다. */
export function shareText(st: TeamsState, players: Player[]): string {
  const names = nameMap(membersOf(st, players));
  return teamViews(st, players)
    .filter((t) => t.members.length > 0)
    .map((t) => `[${t.vest.label}팀]\n${t.members.map((m) => names.get(m.key) ?? m.name).join(' / ')}`)
    .join('\n\n');
}

/** 팀 평균이 이만큼 넘게 벌어지면 화면이 알려 준다 — 인원이 적거나 팀이 많으면 알고리즘으로
 *  못 맞추는 구간이 있다(5명 4팀은 브루트포스도 17 차이). 사용자가 "배치됐으니 됐다"고
 *  믿는 걸 막는다(2026-09-22 리뷰). */
export const SPREAD_WARN = 5;
export function avgSpread(st: TeamsState, players: Player[]): number {
  const avgs = teamViews(st, players).map((t) => t.avg).filter((v): v is number => v != null);
  return avgs.length < 2 ? 0 : Math.max(...avgs) - Math.min(...avgs);
}

const KEY = 'wfc.teams.draft';

export const serialize = (st: TeamsState): string => JSON.stringify(st);

/**
 * 저장된 초안 복원 — 모양이 깨진 값만 버린다.
 *
 * **명단과 대조해 거르지 않는다.** 예전엔 `players` 에 없는 번호를 버렸는데, `useData` 가
 * 캐시 → 네트워크로 두 번 값을 주므로 **첫 값이 비었거나 낡으면 초안이 그 자리에서 잘리고**
 * 다음 조작 한 번에 그대로 저장돼 영구 소실됐다(2026-09-22 리뷰가 재현). 안 온 사람을 거르는
 * 건 화면을 그리는 `membersOf` 가 이미 하므로, 저장 단계의 필터는 중복이고 손해만 낸다.
 */
export function restore(raw: string | null): TeamsState {
  const base = initialTeams();
  if (!raw) return base;
  try {
    const o = JSON.parse(raw) as Partial<TeamsState>;
    const picked = Array.isArray(o.picked) ? o.picked.filter((n) => typeof n === 'number' && Number.isFinite(n)) : [];
    const guests = Array.isArray(o.guests)
      ? o.guests.filter((g): g is Guest => !!g && typeof g.id === 'string' && typeof g.name === 'string')
      : [];
    // teams 가 숫자가 아니면(문자열 JSON 등) 기본값을 쓴다 — clampTeams 에 NaN 을 넣으면
    // 최솟값 2 로 떨어져 기본 3 과 달라진다(테스트가 잡았다).
    const teams = Number.isFinite(Number(o.teams)) ? clampTeams(Number(o.teams)) : base.teams;
    // 배정은 **이 초안이 아는 사람**에게만 남긴다(명단이 아니라 초안 자신을 기준으로).
    const keys = new Set([...picked.map(playerKey), ...guests.map((g) => guestKey(g.id))]);
    const assign: Record<string, number> = {};
    for (const [k, t] of Object.entries(o.assign ?? {})) {
      if (keys.has(k) && typeof t === 'number' && t >= 0 && t < teams) assign[k] = t;
    }
    return { teams, picked, guests, assign };
  } catch { return base; }
}

export function load(): TeamsState {
  try { return restore(localStorage.getItem(KEY)); } catch { return initialTeams(); }
}
export function save(st: TeamsState): void {
  try { localStorage.setItem(KEY, serialize(st)); } catch { /* 저장 못 해도 화면은 돈다 */ }
}
