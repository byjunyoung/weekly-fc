// src/lib/api.ts — Apps Script 호출은 여기 한 곳
import type { Data, Fine, Lineup, Match, Player, RotationRow, Team } from './types';

export const API_URL = 'https://script.google.com/macros/s/AKfycbyUDTkTHsKszkiOeJKmNDHDkVJobrVUjbRqufU251PNKmlyrvC0BZ3ir9x0vM_lCJkkmg/exec';
const CACHE_KEY = 'wfc_cache_v2';
const PIN_KEY = 'wfc_pin';
export const EMPTY: Data = { players: [], matches: [], rotation: [], fines: [], lineups: [] };

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
export function normalizeMatch(r: Raw): Match {
  let teams: Team[] = [];
  if (r.teams) {
    try {
      const t = typeof r.teams === 'string' ? JSON.parse(r.teams) : r.teams;
      if (Array.isArray(t)) teams = t.map((x: Raw) => ({ name: String(x.name ?? ''), players: Array.isArray(x.players) ? x.players.map(String) : [], points: numOrNull(x.points) }));
    } catch { teams = []; }
  }
  const type = String(r.type ?? '');
  return { id: String(r.id ?? ''), date: day(r.date), location: String(r.location ?? ''), youtube: String(r.youtube ?? ''),
    type: type === '2파전' || type === '3파전' ? type : '', attendees: list(r.attendees), teams, winner: String(r.winner ?? '') };
}
export function normalizeFine(r: Raw): Fine {
  const type = String(r.type ?? '');
  return { id: String(r.id ?? ''), date: day(r.date), match_id: String(r.match_id ?? ''), player: String(r.player ?? ''),
    type: type === '노쇼' ? '노쇼' : '지각', amount: num(r.amount), paid: bool(r.paid) };
}
export function normalizeRotation(r: Raw): RotationRow {
  return { year: num(r.year), month: num(r.month), p1: String(r.p1 ?? ''), p2: String(r.p2 ?? ''), done: bool(r.done) };
}
export function normalizeLineup(r: Raw): Lineup {
  return { id: String(r.id ?? ''), match_id: String(r.match_id ?? ''), name: String(r.name ?? ''), formation: String(r.formation ?? ''), assignments: typeof r.assignments === 'string' ? r.assignments : JSON.stringify(r.assignments ?? '') };
}
export function normalizeData(d: Raw): Data {
  const arr = (v: unknown): Raw[] => (Array.isArray(v) ? (v as Raw[]) : []);
  return { players: arr(d.players).map(normalizePlayer).filter((p) => p.num > 0),
    matches: arr(d.matches).map(normalizeMatch).filter((m) => m.id).sort((a, b) => b.date.localeCompare(a.date)),
    rotation: arr(d.rotation).map(normalizeRotation), fines: arr(d.fines).map(normalizeFine).filter((f) => f.id), lineups: arr(d.lineups).map(normalizeLineup) };
}

export const serializePlayer = (p: Player): Raw => ({ ...p, vest: p.vest ?? '', rot: p.rot ?? '', avatar: p.avatar ?? '' });
export const serializeMatch = (m: Match): Record<string, string> => ({ id: m.id, date: m.date, location: m.location, youtube: m.youtube, type: m.type,
  attendees: m.attendees.join(', '), teams: m.teams.length ? JSON.stringify(m.teams) : '', winner: m.winner });
export const serializeFine = (f: Fine): Record<string, string | number> => ({ id: f.id, date: f.date, match_id: f.match_id, player: f.player, type: f.type, amount: f.amount, paid: f.paid ? 'TRUE' : 'FALSE' });
export const serializeRotation = (r: RotationRow): Record<string, string | number> => ({ year: r.year, month: r.month, p1: r.p1, p2: r.p2, done: r.done ? 'TRUE' : 'FALSE' });
export const serializeLineup = (l: Lineup): Record<string, string> => ({ id: l.id, match_id: l.match_id, name: l.name, formation: l.formation, assignments: l.assignments });

export function buildUrl(action: string, params: Record<string, unknown> = {}, base: string = API_URL): string {
  const u = new URL(base);
  u.searchParams.set('action', action);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, typeof v === 'object' && v !== null ? encodeURIComponent(JSON.stringify(v)) : String(v));
  return u.toString();
}
/** 응답을 기다리는 한도. 넘기면 끊고 오류로 돌린다.
 *  카톡 인앱 브라우저에서 이 요청이 **실패가 아니라 멈춤**으로 끝나는 걸 확인했다
 *  (2026-09-22, 12초 무응답). 오류가 안 나니 화면이 "불러오는 중"에서 영영 굳었다.
 *  정상 왕복은 3~4초라 15초면 느린 회선에도 넉넉하면서 멈춤은 붙잡는다. */
export const TIMEOUT_MS = 15000;

async function call(action: string, params: Record<string, unknown> = {}): Promise<Raw> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(buildUrl(action, params), { signal: ac.signal });
    const json = (await res.json()) as Raw;
    if (json.error) throw new Error(String(json.error));
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
export async function fetchData(): Promise<Data> { return normalizeData(await call('getAll')); }

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
export function getPin(): string { try { return sessionStorage.getItem(PIN_KEY) ?? ''; } catch { return ''; } }
export function isAdmin(): boolean { return getPin() !== ''; }
export type LoginResult = 'ok' | 'bad-pin' | 'error';
export async function login(pin: string): Promise<LoginResult> {
  try {
    await call('verifyPin', { pin });
    sessionStorage.setItem(PIN_KEY, pin);
    return 'ok';
  } catch (e) {
    // verifyPin()이 틀린 PIN일 때 던지는 서버 메시지로만 "틀린 PIN"을 구분한다. 그 외(네트워크 실패 등)는 연결 실패.
    return (e as Error).message?.includes('PIN이 올바르지 않습니다') ? 'bad-pin' : 'error';
  }
}
export function logout(): void { try { sessionStorage.removeItem(PIN_KEY); } catch {} }
/** 쓰기: PIN 동봉 → 성공하면 refresh()까지. 실패는 throw. */
export async function write(action: string, payload: unknown): Promise<Raw> {
  const pin = getPin(); if (!pin) throw new Error('관리자 PIN이 필요합니다');
  const r = await call(action, { pin, payload });
  // 쓰기가 끝나기 전부터 돌고 있던 read는 이 쓰기보다 옛 데이터를 볼 수 있다 — 그게 끝나길 기다렸다가 새로 한 번 더 refresh.
  if (inflight) await inflight.catch(() => {});
  await refresh();
  return r;
}
export async function fetchFull(): Promise<Data> { return normalizeData(await call('getAllFull', { pin: getPin() })); }

/** 아바타 전용 잠금 없는 쓰기. write()와 분리한 이유: write()는 PIN을 요구하고
 * 어떤 액션에든 재사용되므로, PIN 없는 경로를 write()에 얹으면 다른 실수(예: 다른
 * 액션에 pin 없이 접근)가 새 필드 하나로 새어나갈 여지가 생긴다. writeAvatar는
 * 서버의 writeAvatar 액션(아바타 칸 하나만 setValue)에만 좁게 대응한다.
 * 서버가 형식 위반·없는 번호를 {error}로 돌려주면 call()이 그대로 throw한다 —
 * 호출부가 toast()로 실패를 보여줘야 한다(성공을 가장하지 않는다). */
export async function writeAvatar(num: number, avatar: string): Promise<Raw> {
  const r = await call('writeAvatar', { payload: { num, avatar } });
  if (inflight) await inflight.catch(() => {});
  await refresh();
  return r;
}
