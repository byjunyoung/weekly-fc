// src/lib/api.ts — Apps Script 호출은 여기 한 곳
import type { Data, Fine, Lineup, Match, Player, RotationRow, Team, Video } from './types';

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
    rot: numOrNull(r.rot),
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

export const serializePlayer = (p: Player): Raw => ({ ...p, vest: p.vest ?? '', rot: p.rot ?? '' });
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
async function call(action: string, params: Record<string, unknown> = {}): Promise<Raw> {
  const res = await fetch(buildUrl(action, params));
  const json = (await res.json()) as Raw;
  if (json.error) throw new Error(String(json.error));
  return json;
}

export function cached(): Data | null { try { const s = localStorage.getItem(CACHE_KEY); return s ? (JSON.parse(s) as Data) : null; } catch { return null; } }
function saveCache(d: Data): void { try { localStorage.setItem(CACHE_KEY, JSON.stringify(d)); } catch {} }
export async function fetchData(): Promise<Data> { return normalizeData(await call('getAll')); }
export async function refresh(): Promise<Data> {
  const d = await fetchData(); saveCache(d);
  window.dispatchEvent(new CustomEvent<Data>('wfc:data', { detail: d }));
  return d;
}
/** 캐시가 있으면 즉시 한 번, 서버 응답이 오면 다시 한 번 render. 이후 wfc:data 마다. */
export function onData(render: (d: Data) => void): void {
  const c = cached(); if (c) render(c);
  window.addEventListener('wfc:data', (e) => render((e as CustomEvent<Data>).detail));
  refresh().catch(() => { if (!c) render(EMPTY); });
}
export async function loadVideos(): Promise<Video[]> {
  const j = await call('getChannelVideos');
  return (Array.isArray(j.videos) ? (j.videos as Raw[]) : []).map((v) => ({ id: String(v.id ?? ''), title: String(v.title ?? ''), published: String(v.published ?? '') })).filter((v) => v.id);
}
export function getPin(): string { try { return sessionStorage.getItem(PIN_KEY) ?? ''; } catch { return ''; } }
export function isAdmin(): boolean { return getPin() !== ''; }
export async function login(pin: string): Promise<boolean> {
  try { await call('verifyPin', { pin }); sessionStorage.setItem(PIN_KEY, pin); return true; } catch { return false; }
}
export function logout(): void { try { sessionStorage.removeItem(PIN_KEY); } catch {} }
/** 쓰기: PIN 동봉 → 성공하면 refresh()까지. 실패는 throw. */
export async function write(action: string, payload: unknown): Promise<Raw> {
  const pin = getPin(); if (!pin) throw new Error('관리자 PIN이 필요합니다');
  const r = await call(action, { pin, payload });
  await refresh();
  return r;
}
export async function fetchFull(): Promise<Data> { return normalizeData(await call('getAllFull', { pin: getPin() })); }
