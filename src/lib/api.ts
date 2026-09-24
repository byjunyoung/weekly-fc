// src/lib/api.ts — 서버 호출은 여기 한 곳. 2026-09-24 에 Apps Script → Supabase RPC 로 옮겼다.
// 공개 함수(fetchData·refresh·login·write·writeAvatar·writeStats·fetchFull)의 모양은 그대로라 화면은 모른다.
import { SUPABASE_KEY, SUPABASE_URL } from './backend.ts';
import { STAT_KEYS, type Data, type Fine, type Player, type RotationRow, type StatKey, type StatLogRow } from './types.ts';

const CACHE_KEY = 'wfc_cache_v2';
const PIN_KEY = 'wfc_pin';
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
    num: who, field, before: num(r.before), after: num(r.after) };
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

/** DB 함수 하나를 부른다 — POST · JSON 본문(PIN 이 주소에 안 실린다) · apikey 헤더만. */
export async function rpc(fn: string, args: Record<string, unknown> = {}, base: string = SUPABASE_URL, key: string = SUPABASE_KEY): Promise<Raw> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/rest/v1/rpc/${fn}`, {
      method: 'POST', signal: ac.signal,
      headers: { apikey: key, 'Content-Type': 'application/json' },
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
export function getPin(): string { try { return sessionStorage.getItem(PIN_KEY) ?? ''; } catch { return ''; } }
export function isAdmin(): boolean { return getPin() !== ''; }
export type LoginResult = 'ok' | 'bad-pin' | 'error';
export async function login(pin: string): Promise<LoginResult> {
  try {
    await rpc('verify_pin', { p_pin: pin });
    sessionStorage.setItem(PIN_KEY, pin);
    return 'ok';
  } catch (e) {
    // verify_pin 이 틀린 PIN일 때 던지는 서버 문구로만 "틀린 PIN"을 구분한다. 그 외(네트워크 실패 등)는 연결 실패.
    return (e as Error).message?.includes('PIN이 올바르지 않습니다') ? 'bad-pin' : 'error';
  }
}
export function logout(): void { try { sessionStorage.removeItem(PIN_KEY); } catch {} }
/** 쓰기: PIN 동봉 → 성공하면 refresh()까지. 실패는 throw. */
export async function write(action: string, payload: unknown): Promise<Raw> {
  const pin = getPin(); if (!pin) throw new Error('관리자 PIN이 필요합니다');
  const fn = RPC_OF[action]; if (!fn) throw new Error(`알 수 없는 액션: ${action}`);
  const r = await rpc(fn, { p_pin: pin, p_payload: payload });
  // 쓰기가 끝나기 전부터 돌고 있던 read는 이 쓰기보다 옛 데이터를 볼 수 있다 — 그게 끝나길 기다렸다가 새로 한 번 더 refresh.
  if (inflight) await inflight.catch(() => {});
  await refresh();
  return r;
}
export async function fetchFull(): Promise<Data> { return normalizeData(await rpc('get_all_full', { p_pin: getPin() })); }

/** 아바타 전용 잠금 없는 쓰기. write()와 분리한 이유: write()는 PIN을 요구하고
 * 어떤 액션에든 재사용되므로, PIN 없는 경로를 write()에 얹으면 다른 실수(예: 다른
 * 액션에 pin 없이 접근)가 새 필드 하나로 새어나갈 여지가 생긴다. writeAvatar는
 * 서버의 write_avatar 함수(아바타 칸 하나만 고친다)에만 좁게 대응한다.
 * 서버가 형식 위반·없는 번호를 오류로 돌려주면 rpc()가 그 문구 그대로 throw한다 —
 * 호출부가 toast()로 실패를 보여줘야 한다(성공을 가장하지 않는다). */
/** 능력치 전용 쓰기. writeAvatar 와 같은 이유로 write() 와 나눠 둔다 — 이쪽은 PIN 을
 *  요구하지 않으므로, 한 함수에 얹으면 PIN 없는 경로가 다른 액션으로 새어나갈 여지가 생긴다.
 *  by 는 홈에서 고른 내 번호(자칭)다. 서버가 값을 1~99 로 검사하고, 바뀐 칸마다 기록을 남긴다.
 *  **바꾼 칸만 보낸다** — 여섯 칸을 통째로 보내면 아직 값이 0 인 칸까지 덮어쓴다. */
export async function writeStats(num: number, stats: Partial<Record<StatKey, number>>, by: number | null): Promise<Raw> {
  const r = await rpc('write_stats', { p_num: num, p_stats: stats, p_by: by });
  if (inflight) await inflight.catch(() => {});
  await refresh();
  return r;
}

export async function writeAvatar(num: number, avatar: string): Promise<Raw> {
  const r = await rpc('write_avatar', { p_num: num, p_avatar: avatar });
  if (inflight) await inflight.catch(() => {});
  await refresh();
  return r;
}
