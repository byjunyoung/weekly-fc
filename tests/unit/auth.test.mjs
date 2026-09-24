// 본인인증(2026-09-24) — 세션 토큰이 서버 호출에 실리는지, 만료 직전엔 갱신하는지, 오류 문구.
import test from 'node:test';
import assert from 'node:assert/strict';
import { accessToken, authMessage, maskEmail, logout } from '../../src/lib/auth.ts';
import { rpc } from '../../src/lib/api.ts';

function withStorage(run) {
  const mk = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m }; };
  const g = globalThis;
  const prev = { ls: Object.getOwnPropertyDescriptor(g, 'localStorage'), ss: Object.getOwnPropertyDescriptor(g, 'sessionStorage'), w: g.window };
  const ls = mk(), ss = mk();
  Object.defineProperty(g, 'localStorage', { value: ls, configurable: true, writable: true });
  Object.defineProperty(g, 'sessionStorage', { value: ss, configurable: true, writable: true });
  g.window = { dispatchEvent: () => true };
  const restore = () => {
    if (prev.ls) Object.defineProperty(g, 'localStorage', prev.ls); else delete g.localStorage;
    if (prev.ss) Object.defineProperty(g, 'sessionStorage', prev.ss); else delete g.sessionStorage;
    if (prev.w === undefined) delete g.window; else g.window = prev.w;
  };
  return Promise.resolve(run(ls)).finally(restore);
}
const now = () => Math.floor(Date.now() / 1000);

test('로그인 중이면 rpc 가 Authorization 에 access 토큰을 싣는다', () => withStorage(async (ls) => {
  ls.setItem('wfc_session_v1', JSON.stringify({ access_token: 'AT', refresh_token: 'RT', expires_at: now() + 3600, email: 'a@b.c' }));
  const orig = globalThis.fetch; let seen;
  globalThis.fetch = async (url, init) => { seen = init; return { ok: true, status: 200, text: async () => '{}' }; };
  try {
    await rpc('me', {}, 'https://ex', 'pk');
    assert.equal(seen.headers.Authorization, 'Bearer AT');
    assert.equal(seen.headers.apikey, 'pk');
  } finally { globalThis.fetch = orig; }
}));

test('만료 60초 전이면 refresh 토큰으로 갱신하고 새 토큰을 쓴다', () => withStorage(async (ls) => {
  ls.setItem('wfc_session_v1', JSON.stringify({ access_token: 'OLD', refresh_token: 'RT', expires_at: now() + 30, email: 'a@b.c' }));
  const orig = globalThis.fetch; const calls = [];
  globalThis.fetch = async (url, init) => { calls.push([url, JSON.parse(init.body)]); return { ok: true, status: 200, text: async () => JSON.stringify({ access_token: 'NEW', refresh_token: 'RT2', expires_in: 3600 }) }; };
  try {
    assert.equal(await accessToken(), 'NEW');
    assert.match(calls[0][0], /\/auth\/v1\/token\?grant_type=refresh_token$/);
    assert.deepEqual(calls[0][1], { refresh_token: 'RT' });
    assert.equal(JSON.parse(ls.getItem('wfc_session_v1')).refresh_token, 'RT2');
  } finally { globalThis.fetch = orig; }
}));

test('갱신이 거절되면(401) 로그아웃된 것으로 본다, 망 끊김이면 옛 토큰을 그대로 쓴다', () => withStorage(async (ls) => {
  const orig = globalThis.fetch;
  try {
    ls.setItem('wfc_session_v1', JSON.stringify({ access_token: 'OLD', refresh_token: 'RT', expires_at: now() + 10, email: 'a@b.c' }));
    globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
    assert.equal(await accessToken(), 'OLD');
    globalThis.fetch = async () => ({ ok: false, status: 401, text: async () => '{"msg":"Invalid Refresh Token"}' });
    assert.equal(await accessToken(), null);
    assert.equal(ls.getItem('wfc_session_v1'), null);
  } finally { globalThis.fetch = orig; }
}));

test('로그아웃하면 세션·me 를 지운다(서버 호출이 실패해도)', () => withStorage(async (ls) => {
  ls.setItem('wfc_session_v1', JSON.stringify({ access_token: 'AT', refresh_token: 'RT', expires_at: now() + 3600, email: 'a@b.c' }));
  ls.setItem('wfc_me_v2', JSON.stringify({ login: true, num: 3 }));
  const orig = globalThis.fetch;
  globalThis.fetch = async () => { throw new TypeError('offline'); };
  try { await logout(); assert.equal(ls.getItem('wfc_session_v1'), null); assert.equal(ls.getItem('wfc_me_v2'), null); }
  finally { globalThis.fetch = orig; }
}));

test('authMessage — 코드 만료·틀림, 보내기 제한, 이메일 형식', () => {
  assert.match(authMessage(403, { error_code: 'otp_expired', msg: 'Token has expired or is invalid' }), /코드가 틀렸거나 만료/);
  assert.match(authMessage(429, { error_code: 'over_email_send_rate_limit' }), /잠시 뒤/);
  assert.match(authMessage(400, { error_code: 'email_address_invalid' }), /이메일 주소/);
  assert.equal(authMessage(500, { msg: 'boom' }), 'boom');
});

test('maskEmail — 앞 두 글자만', () => {
  assert.equal(maskEmail('abcdef@gmail.com'), 'ab***@gmail.com');
  assert.equal(maskEmail('x'), 'x');
});
