// src/react/game/online.ts — 온라인 방의 브라우저 쪽 잔일(2026-11-06): 내 기기 번호, 주소(?room=), 방장 표시, 초대 링크 공유.
// 세션(net/*)은 이걸 모른다 — 저장소·주소창·공유 창은 화면 쪽 사정이라 여기 모았다. 저장소를 못 쓰는 웹뷰에서도 판은 돌아가게 전부 try 로 감싼다.
import { isRoomCode } from '../../lib/game/room';

const CID_KEY = 'wfc:game:cid';        // 기기(탭)마다 무작위 — 새로고침해도 같은 자리로(스펙 §2.2)
const HOST_KEY = 'wfc:game:host';      // 이 탭이 방장인 방 코드 — 새로고침하면 손님이 아니라 방장으로 다시 연다
const JOINED_KEY = 'wfc:game:joined';  // 이 탭이 손님으로 들어가 있던 방 코드 — 새로고침하면 같은 clientId 로 다시 hello
const HOST_GAME_KEY = 'wfc:game:host-game';   // 방장 탭의 방 게임 종류와 설정 { code, game, settings } — 새로고침해도 방의 게임이 그대로(2026-11-07 2단계)

const ss = {
  get(k: string): string | null { try { return sessionStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string): void { try { sessionStorage.setItem(k, v); } catch { /* 저장 못 해도 이번 판은 된다 */ } },
  del(k: string): void { try { sessionStorage.removeItem(k); } catch { /* 위와 같음 */ } },
};

let memCid: string | null = null;
export function clientId(): string {
  const saved = ss.get(CID_KEY);
  if (saved && saved.length <= 64) return saved;
  if (!memCid) {
    try { memCid = crypto.randomUUID(); }
    catch { memCid = `c${Date.now().toString(36)}${Math.floor(Math.random() * 1e9).toString(36)}`; }
  }
  ss.set(CID_KEY, memCid);
  return memCid;
}

export const hostedCode = (): string | null => ss.get(HOST_KEY);
export const joinedCode = (): string | null => ss.get(JOINED_KEY);
export function markHost(code: string): void { ss.set(HOST_KEY, code); ss.del(JOINED_KEY); }
export function markJoined(code: string): void { ss.set(JOINED_KEY, code); ss.del(HOST_KEY); ss.del(HOST_GAME_KEY); }
export function clearMarks(): void { ss.del(HOST_KEY); ss.del(JOINED_KEY); ss.del(HOST_GAME_KEY); }

/** 방장 탭이 지금 방의 게임 종류와 설정을 적어 둔다(방 표시 옆). 바뀔 때마다 부른다. */
export function saveHostGame(code: string, game: string, settings: unknown): void {
  try { ss.set(HOST_GAME_KEY, JSON.stringify({ code, game, settings })); } catch { /* 못 적어도 방은 돈다 — 새로고침하면 주소의 게임으로 */ }
}
/** 이 방(code)에 적어 둔 게임 종류와 설정. 없거나 다른 방 것이면 null. 설정 모양은 부르는 쪽(세션)이 그 게임의 okSettings 로 본다. */
export function hostedGame(code: string): { game: string; settings: unknown } | null {
  try {
    const v = JSON.parse(ss.get(HOST_GAME_KEY) ?? 'null') as { code?: unknown; game?: unknown; settings?: unknown } | null;
    return v && v.code === code && typeof v.game === 'string' ? { game: v.game, settings: v.settings } : null;
  } catch { return null; }
}

/** 주소의 ?room= — 형식이 틀리면 없는 것으로. */
export function roomFromUrl(): string | null {
  try {
    const c = new URLSearchParams(location.search).get('room');
    return c && isRoomCode(c.toUpperCase()) ? c.toUpperCase() : null;
  } catch { return null; }
}

/** 주소창을 초대 링크로(다른 파라미터 — ?debug=1 등 — 는 그대로 둔다). null 이면 room 을 뺀다. */
export function setRoomInUrl(code: string | null): void {
  try {
    const q = new URLSearchParams(location.search);
    if (code) q.set('room', code); else q.delete('room');
    const s = q.toString();
    history.replaceState(history.state, '', location.pathname + (s ? `?${s}` : '') + location.hash);
  } catch { /* 주소를 못 바꿔도 방은 돌아간다 */ }
}

export function inviteUrl(code: string): string {
  return `${location.origin}${location.pathname}?room=${code}`;
}

/** 초대 링크 보내기 — 공유 창이 있으면 그걸로, 없으면 복사. 돌려주는 값: 'shared' | 'copied' | 'cancel' | 'manual'(직접 복사해야 함). */
export async function shareInvite(code: string): Promise<'shared' | 'copied' | 'cancel' | 'manual'> {
  const url = inviteUrl(code);
  const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
  if (typeof nav.share === 'function') {
    try { await nav.share({ title: 'WEEKLY FC 게임', text: `방 ${code} 에서 한 판 해요`, url }); return 'shared'; }
    catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') return 'cancel';   // 사용자가 닫았다 — 복사로 넘어가지 않는다
    }
  }
  try { await navigator.clipboard.writeText(url); return 'copied'; }
  catch { /* 권한·웹뷰 — 아래로 */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = url; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    if (ok) return 'copied';
  } catch { /* 아래로 */ }
  return 'manual';
}
