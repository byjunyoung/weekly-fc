// src/lib/me.ts — 내 이름(선수 번호)을 기기에 기억
const KEY = 'wfc_me';
export function getMe(): number | null {
  try { const v = localStorage.getItem(KEY); return v ? Number(v) : null; } catch { return null; }
}
export function setMe(num: number | null): void {
  try { if (num == null) localStorage.removeItem(KEY); else localStorage.setItem(KEY, String(num)); } catch {}
  window.dispatchEvent(new Event('wfc:me'));
}
