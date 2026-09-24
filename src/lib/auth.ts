// src/lib/auth.ts — 이메일 코드 로그인(2026-09-24). 설계: docs/superpowers/specs/2026-09-24-email-auth-design.md
// 라이브러리 없이 Supabase Auth REST 를 부른다(api.ts 가 fetch 로 RPC 를 부르는 것과 같은 이유 — 번들이 안 커진다).
// 링크가 아니라 6자리 코드: 카톡 인앱에서 메일 앱의 링크를 누르면 다른 브라우저가 열려 로그인이 엉뚱한 곳에 남는다.
//
// 이 파일이 들고 있는 두 가지:
//   세션  — access·refresh 토큰(이 기기 localStorage). access 는 1시간, 만료 60초 전부터 갱신.
//   me    — 서버 me() 의 마지막 응답(이름 차지·관리자·오늘 판수). 화면이 매번 서버를 기다리지 않게 둔다.
// 바뀌면 wfc:me · wfc:admin 을 보낸다 — 옛 화면들이 이 두 이벤트로 "나"와 관리자 여부를 다시 읽는다.
import { SUPABASE_KEY, SUPABASE_URL } from './backend.ts';

const SESSION_KEY = 'wfc_session_v1';
const ME_KEY = 'wfc_me_v2';
const ADMIN_ON_KEY = 'wfc_admin_on';

export type Session = { access_token: string; refresh_token: string; expires_at: number; email: string };
export type Me = { login: boolean; email?: string; num?: number | null; name?: string | null; admin?: boolean; today?: number; todayBy?: Record<string, number> };

const store = {
  get<T>(k: string): T | null { try { const s = localStorage.getItem(k); return s ? (JSON.parse(s) as T) : null; } catch { return null; } },
  set(k: string, v: unknown): void { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const emit = (): void => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event('wfc:me'));
  window.dispatchEvent(new Event('wfc:admin'));
};

export const session = (): Session | null => store.get<Session>(SESSION_KEY);
export const cachedMe = (): Me => store.get<Me>(ME_KEY) ?? { login: false };
export function setCachedMe(me: Me): void { store.set(ME_KEY, me); emit(); }

/** 관리자 모드 — 관리자 계정이어도 켜야 편집 버튼이 나온다(평소엔 팀원과 같은 화면). 탭을 닫으면 꺼진다. */
export function adminOn(): boolean { try { return sessionStorage.getItem(ADMIN_ON_KEY) === '1'; } catch { return false; } }
export function setAdminOn(on: boolean): void { try { if (on) sessionStorage.setItem(ADMIN_ON_KEY, '1'); else sessionStorage.removeItem(ADMIN_ON_KEY); } catch {} emit(); }

type Raw = Record<string, unknown>;
async function authPost(path: string, body: unknown, token?: string): Promise<Raw> {
  const headers: Record<string, string> = { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${SUPABASE_URL}/auth/v1${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  const text = await res.text();
  const json = (text ? JSON.parse(text) : {}) as Raw;
  if (!res.ok) throw new Error(authMessage(res.status, json));
  return json;
}

/** Supabase Auth 오류 → 한국어. 코드가 없으면 원문을 그대로 둔다(모르는 오류를 숨기지 않는다). */
export function authMessage(status: number, j: Raw): string {
  const code = String(j.error_code ?? j.code ?? '');
  const raw = String(j.msg ?? j.error_description ?? j.message ?? '');
  if (code === 'otp_expired' || (status === 403 && /expired|invalid/i.test(raw))) return '코드가 틀렸거나 만료됐습니다. 새 코드를 받아 주세요';
  if (code === 'over_email_send_rate_limit' || status === 429) return '잠시 뒤에 다시 시도해 주세요(메일 보내기 횟수 제한)';
  if (code === 'email_address_invalid' || /invalid.*email|email.*invalid/i.test(raw)) return '이메일 주소를 확인해 주세요';
  return raw || `로그인 서버 오류 ${status}`;
}

function saveSession(r: Raw, email: string): Session {
  const s: Session = {
    access_token: String(r.access_token ?? ''), refresh_token: String(r.refresh_token ?? ''),
    expires_at: Number(r.expires_at ?? Math.floor(Date.now() / 1000) + Number(r.expires_in ?? 3600)),
    email: String((r.user as Raw | undefined)?.email ?? email),
  };
  store.set(SESSION_KEY, s);
  return s;
}

/** 메일로 6자리 코드를 보낸다. 처음 보는 이메일이면 계정도 만든다. */
export async function sendCode(email: string): Promise<void> {
  await authPost('/otp', { email: email.trim().toLowerCase(), create_user: true });
}

/** 코드 확인 → 세션 저장. me() 는 부르는 쪽(api.refreshMe)이 이어서 읽는다. */
export async function verifyCode(email: string, code: string): Promise<Session> {
  const e = email.trim().toLowerCase();
  const r = await authPost('/verify', { type: 'email', email: e, token: code.trim() });
  return saveSession(r, e);
}

let refreshing: Promise<string | null> | null = null;
/** 쓸 수 있는 access 토큰. 곧 만료면 갱신한다. 갱신이 실패하면 로그아웃된 것으로 본다(null). */
export async function accessToken(): Promise<string | null> {
  const s = session();
  if (!s) return null;
  if (s.expires_at - Date.now() / 1000 > 60) return s.access_token;
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const r = await authPost('/token?grant_type=refresh_token', { refresh_token: s.refresh_token });
      return saveSession(r, s.email).access_token;
    } catch (e) {
      // 망이 끊긴 것(fetch 의 TypeError)은 로그아웃 사유가 아니다 — 옛 토큰을 그대로 쓰고 다음에 다시 갱신한다.
      if (e instanceof TypeError) return s.access_token;
      store.set(SESSION_KEY, null); store.set(ME_KEY, null); emit();
      return null;
    } finally { refreshing = null; }
  })();
  return refreshing;
}

export async function logout(): Promise<void> {
  const s = session();
  store.set(SESSION_KEY, null); store.set(ME_KEY, null);
  try { sessionStorage.removeItem(ADMIN_ON_KEY); } catch {}
  emit();
  if (s) { try { await authPost('/logout', {}, s.access_token); } catch { /* 서버 쪽 무효화는 실패해도 이 기기에선 이미 나갔다 */ } }
}

/** 이메일 가운데를 가린다 — ab***@gmail.com. 관리자 화면에서 쓴다. */
export const maskEmail = (e: string): string => {
  const [id, host] = e.split('@');
  if (!host) return e;
  return `${id.slice(0, 2)}***@${host}`;
};
