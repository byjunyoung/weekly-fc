// src/lib/api.ts — 서버 호출은 여기 한 곳. 2026-09-24 에 Apps Script → Supabase RPC 로 옮겼다.
// 공개 함수(fetchData·refresh·login·write·writeAvatar·fetchFull)의 모양은 그대로라 화면은 모른다.
// 2026-09-24 티어 게임: 스텝퍼(writeStats)를 걷고 대결 한 판(vote)을 더했다.
// 2026-09-24 본인인증: 관리자 PIN 을 없애고 로그인 세션(auth.ts)으로 — 로그인 중이면 모든 호출에 토큰을 싣는다.
import { accessToken, adminOn, cachedMe, session, setCachedMe, type Me } from './auth.ts';
import { SUPABASE_KEY, SUPABASE_URL } from './backend.ts';
import { STAT_KEYS, type Data, type Fine, type Player, type RotationRow, type StatKey, type StatLogRow } from './types.ts';

const CACHE_KEY = 'wfc_cache_v2';
export const EMPTY: Data = { players: [], rotation: [], fines: [], statLog: [] };

type Raw = Record<string, unknown>;
const num = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const numOrNull = (v: unknown): number | null => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v));
const bool = (v: unknown): boolean => v === true || String(v).toUpperCase() === 'TRUE';
const list = (v: unknown): string[] => String(v ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const day = (v: unknown): string => String(v ?? '').slice(0, 10);
const POS = ['GK', 'DF', 'MF', 'FW'] as const;

export function normalizePlayer(r: Raw): Player {
  const pos = String(r.pos ?? '').toUpperCase();
  const p: Player = {
    num: num(r.num), name: String(r.name ?? '').trim(), pos: POS.find((x) => x === pos) ?? '',
    detail: String(r.detail ?? ''), foot: String(r.foot ?? ''), vest: numOrNull(r.vest), note: String(r.note ?? ''),
    pace: num(r.pace), dribble: num(r.dribble), pass: num(r.pass), shoot: num(r.shoot), defend: num(r.defend), stamina: num(r.stamina),
    rot: numOrNull(r.rot), avatar: String(r.avatar ?? ''),
  };
  if (r.phone !== undefined) p.phone = String(r.phone);
  return p;
}
export function normalizeFine(r: Raw): Fine {
  const type = String(r.type ?? '');
  return { id: String(r.id ?? ''), date: day(r.date), match_id: String(r.match_id ?? ''), player: String(r.player ?? ''),
    type: type === '노쇼' ? '노쇼' : '지각', amount: num(r.amount), paid: bool(r.paid) };
}
export function normalizeRotation(r: Raw): RotationRow {
  return { year: num(r.year), month: num(r.month), p1: String(r.p1 ?? ''), p2: String(r.p2 ?? ''), done: bool(r.done) };
}
export function normalizeStatLog(r: Raw): StatLogRow | null {
  const field = String(r.field ?? '') as StatKey;
  if (!STAT_KEYS.includes(field)) return null;        // 모르는 칸은 버린다 — 화면이 이름을 못 붙인다
  const who = num(r.num);
  if (who <= 0) return null;
  return { ts: String(r.ts ?? ''), by: numOrNull(r.by), byName: String(r.by_name ?? '').trim(),
    num: who, field, before: num(r.before), after: num(r.after), via: String(r.via ?? '') };
}

export function normalizeData(d: Raw): Data {
  const arr = (v: unknown): Raw[] => (Array.isArray(v) ? (v as Raw[]) : []);
  return { players: arr(d.players).map(normalizePlayer).filter((p) => p.num > 0),
    rotation: arr(d.rotation).map(normalizeRotation), fines: arr(d.fines).map(normalizeFine).filter((f) => f.id),
    // 최신이 위로 — 서버는 오래된 것부터 보낸다(옛 시트와 같은 순서)라 뒤집는다.
    statLog: arr(d.statLog).map(normalizeStatLog).filter((x): x is StatLogRow => x !== null).reverse() };
}

export const serializePlayer = (p: Player): Raw => ({ ...p, vest: p.vest ?? '', rot: p.rot ?? '', avatar: p.avatar ?? '' });
export const serializeFine = (f: Fine): Record<string, string | number> => ({ id: f.id, date: f.date, match_id: f.match_id, player: f.player, type: f.type, amount: f.amount, paid: f.paid ? 'TRUE' : 'FALSE' });
export const serializeRotation = (r: RotationRow): Record<string, string | number> => ({ year: r.year, month: r.month, p1: r.p1, p2: r.p2, done: r.done ? 'TRUE' : 'FALSE' });

/** 응답을 기다리는 한도. 넘기면 끊고 오류로 돌린다.
 *  카톡 인앱 브라우저에서 이 요청이 **실패가 아니라 멈춤**으로 끝나는 걸 확인했다
 *  (2026-09-22, 12초 무응답). 오류가 안 나니 화면이 "불러오는 중"에서 영영 굳었다.
 *  정상 왕복은 3~4초라 15초면 느린 회선에도 넉넉하면서 멈춤은 붙잡는다. */
export const TIMEOUT_MS = 15000;

/** 관리자 쓰기 액션 → DB 함수 이름. 화면은 옛 액션 이름으로 부른다. */
export const RPC_OF: Record<string, string> = {
  writePlayer: 'write_player', deletePlayer: 'delete_player', writeRotation: 'write_rotation',
  writeFine: 'write_fine', deleteFine: 'delete_fine',
};

/** DB 함수 하나를 부른다 — POST · JSON 본문 · apikey 헤더. 로그인 중이면 Authorization 에 토큰을 싣는다
 *  (서버가 auth.uid() 로 누구인지 정한다). 공개 키는 Authorization 에 넣지 않는다. */
export async function rpc(fn: string, args: Record<string, unknown> = {}, base: string = SUPABASE_URL, key: string = SUPABASE_KEY): Promise<Raw> {
  // 토큰을 먼저 얻고 나서 제한시간을 잰다 — 갱신 왕복이 요청 제한시간을 갉아먹지 않게.
  // 로그인 전이면 기다리지 않는다(요청이 같은 박자에 바로 나간다).
  const token = session() ? await accessToken() : null;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const headers: Record<string, string> = { apikey: key, 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${base}/rest/v1/rpc/${fn}`, {
      method: 'POST', signal: ac.signal, headers,
      body: JSON.stringify(args),
    });
    const text = await res.text();
    const json = (text ? JSON.parse(text) : {}) as Raw;
    // DB 함수가 raise exception 으로 알린 문구는 PostgREST 오류 응답의 message 에 담겨 온다.
    if (!res.ok) throw new Error(String(json.message ?? `서버 오류 ${res.status}`));
    return json;
  } catch (e) {
    // 끊은 것과 진짜 네트워크 오류를 다른 문구로 — 배너만 보고도 어느 쪽인지 알게.
    if ((e as Error).name === 'AbortError') throw new Error(`${TIMEOUT_MS / 1000}초 동안 응답이 없습니다`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export function cached(): Data | null { try { const s = localStorage.getItem(CACHE_KEY); return s ? (JSON.parse(s) as Data) : null; } catch { return null; } }
function saveCache(d: Data): void { try { localStorage.setItem(CACHE_KEY, JSON.stringify(d)); } catch {} }
export async function fetchData(): Promise<Data> { return normalizeData(await rpc('get_all')); }

let inflight: Promise<Data> | null = null;
let lastErr: string | null = null;
/** 마지막 refresh() 실패 메시지. 성공하면 null. Shell.astro가 배너에 쓴다. */
export function lastError(): string | null { return lastErr; }
/** 동시에 여러 곳(Shell + 각 페이지)에서 불러도 서버 왕복은 한 번만 나간다. */
export async function refresh(): Promise<Data> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const d = await fetchData();
      saveCache(d);
      lastErr = null;
      window.dispatchEvent(new CustomEvent<Data>('wfc:data', { detail: d }));
      return d;
    } catch (e) {
      lastErr = (e as Error).message || '연결 실패';
      window.dispatchEvent(new CustomEvent<string>('wfc:error', { detail: lastErr }));
      throw e;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}
/** 캐시가 있으면 즉시 한 번, 서버 응답이 오면 다시 한 번 render. 이후 wfc:data 마다. */
export function onData(render: (d: Data) => void): void {
  const c = cached(); if (c) render(c);
  window.addEventListener('wfc:data', (e) => render((e as CustomEvent<Data>).detail));
  refresh().catch(() => { if (!c) render(EMPTY); });
}
/** 관리자 모드가 켜져 있나 — 관리자 계정(서버 me().admin)이고 상단바에서 켰을 때. 서버도 매 호출 다시 확인한다. */
export function isAdmin(): boolean { return !!cachedMe().admin && adminOn(); }

/** 로그인한 사람을 서버에서 다시 읽어 저장한다(이름 차지·관리자·오늘 판수). 로그인 전이면 {login:false}. */
export async function refreshMe(): Promise<Me> {
  if (!session()) { const none = { login: false }; setCachedMe(none); return none; }
  const r = (await rpc('me')) as Me;
  setCachedMe(r);
  return r;
}
/** 명단 번호 차지 — 먼저 고른 사람이 차지한다(관리자가 풀어 준다). */
export async function claim(num: number): Promise<Me> { await rpc('claim', { p_num: num }); return refreshMe(); }
/** 이미 차지된 번호들(누가인지는 안 알려 준다). */
export async function claimedNums(): Promise<number[]> { const r = await rpc('claimed_nums'); return Array.isArray(r) ? (r as unknown[]).map(Number) : []; }
export type MemberRow = { num: number; email: string; claimed_at: string };
export async function adminMembers(): Promise<MemberRow[]> { const r = await rpc('admin_members'); return Array.isArray(r) ? (r as MemberRow[]) : []; }
export async function adminRelease(num: number): Promise<void> { await rpc('admin_release', { p_num: num }); }

/** 관리자 쓰기 → 성공하면 refresh()까지. 실패는 throw. 관리자인지는 서버가 토큰으로 다시 확인한다. */
export async function write(action: string, payload: unknown): Promise<Raw> {
  if (!isAdmin()) throw new Error('관리자 모드에서만 할 수 있습니다');
  const fn = RPC_OF[action]; if (!fn) throw new Error(`알 수 없는 액션: ${action}`);
  const r = await rpc(fn, { p_payload: payload });
  // 쓰기가 끝나기 전부터 돌고 있던 read는 이 쓰기보다 옛 데이터를 볼 수 있다 — 그게 끝나길 기다렸다가 새로 한 번 더 refresh.
  if (inflight) await inflight.catch(() => {});
  await refresh();
  return r;
}
export async function fetchFull(): Promise<Data> { return normalizeData(await rpc('get_all_full')); }

/** 대결 한 판의 서버 응답(public.vote). */
export type VoteResult = { ts: string; field: StatKey; by: number | null; by_name: string;
  win: { num: number; before: number; after: number }; lose: { num: number; before: number; after: number } };

/** 대결 결과를 데이터에 얹는다 — 두 선수 숫자를 고치고, 실제로 바뀐 쪽만 기록 줄을 맨 위에.
 *  서버가 남긴 것과 같은 모양이라 다시 읽지 않아도 화면이 맞는다. 원본은 건드리지 않는다. */
export function applyVote(d: Data, r: VoteResult): Data {
  const after = new Map([[r.win.num, r.win.after], [r.lose.num, r.lose.after]]);
  const players = d.players.map((p) => (after.has(p.num) ? { ...p, [r.field]: after.get(p.num)! } : p));
  const rows: StatLogRow[] = [r.win, r.lose].filter((x) => x.before !== x.after).map((x) => ({
    ts: r.ts, by: r.by, byName: r.by_name, num: x.num, field: r.field, before: x.before, after: x.after, via: 'game',
  }));
  return { ...d, players, statLog: [...rows, ...d.statLog] };
}

/** 대결 한 판. 로그인 + 이름 차지가 있어야 한다 — 누른 사람은 서버가 토큰으로 정한다(본인인증 2026-09-24).
 *  하루 30판·같은 선수 3번 제한도 서버가 센다. 판마다 전체를 다시 읽지 않는다: 응답으로 캐시와 내 오늘 판수를 고친다. */
export async function vote(field: StatKey, win: number, lose: number): Promise<VoteResult> {
  const raw = await rpc('vote', { p_field: field, p_win: win, p_lose: lose });
  const r: VoteResult = {
    ts: String(raw.ts ?? ''), field, by: numOrNull(raw.by), by_name: String(raw.by_name ?? ''),
    win: raw.win as VoteResult['win'], lose: raw.lose as VoteResult['lose'],
  };
  const m = cachedMe();
  const by = { ...(m.todayBy ?? {}) };
  for (const n of [win, lose]) by[n] = (by[n] ?? 0) + 1;
  setCachedMe({ ...m, today: (m.today ?? 0) + 1, todayBy: by });
  const base = cached();
  if (base) {
    const d = applyVote(base, r);
    saveCache(d);
    window.dispatchEvent(new CustomEvent<Data>('wfc:data', { detail: d }));
  }
  return r;
}

/** 아바타 전용 잠금 없는 쓰기. write()와 분리한 이유: write()는 PIN을 요구하고
 * 어떤 액션에든 재사용되므로, PIN 없는 경로를 write()에 얹으면 다른 실수(예: 다른
 * 액션에 pin 없이 접근)가 새 필드 하나로 새어나갈 여지가 생긴다. writeAvatar는
 * 서버의 write_avatar 함수(아바타 칸 하나만 고친다)에만 좁게 대응한다.
 * 서버가 형식 위반·없는 번호를 오류로 돌려주면 rpc()가 그 문구 그대로 throw한다 —
 * 호출부가 toast()로 실패를 보여줘야 한다(성공을 가장하지 않는다). */
export async function writeAvatar(num: number, avatar: string): Promise<Raw> {
  const r = await rpc('write_avatar', { p_num: num, p_avatar: avatar });
  if (inflight) await inflight.catch(() => {});
  await refresh();
  return r;
}
