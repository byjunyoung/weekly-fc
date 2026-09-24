import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeFine, normalizePlayer, normalizeRotation, serializeFine, serializeRotation, rpc, RPC_OF } from '../../src/lib/api.ts';

// ── 전달 통로(2026-09-24 Supabase RPC) ────────────────────────────
test('rpc 는 POST 로 /rest/v1/rpc/<함수> 를 부르고 apikey 헤더만 싣는다', async () => {
  const orig = globalThis.fetch; let seen;
  globalThis.fetch = async (url, init) => { seen = { url, init }; return { ok: true, status: 200, text: async () => '{"ok":true}' }; };
  try {
    const r = await rpc('write_fine', { p_pin: '1234', p_payload: { id: 'x' } }, 'https://ex.supabase.co', 'pk');
    assert.deepEqual(r, { ok: true });
    assert.equal(seen.url, 'https://ex.supabase.co/rest/v1/rpc/write_fine');
    assert.equal(seen.init.method, 'POST');
    assert.equal(seen.init.headers.apikey, 'pk');
    assert.equal(seen.init.headers.Authorization, undefined, '공개 키를 Authorization 에 싣지 않는다');
    assert.deepEqual(JSON.parse(seen.init.body), { p_pin: '1234', p_payload: { id: 'x' } });
    assert.ok(!seen.url.includes('1234'), 'PIN 이 주소에 실리면 안 된다');
  } finally { globalThis.fetch = orig; }
});

test('rpc 오류 응답은 서버 문구 그대로 던진다 (틀린 PIN 구분이 이 문구에 기댄다)', async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 400, text: async () => '{"code":"P0001","message":"PIN이 올바르지 않습니다."}' });
  try { await assert.rejects(rpc('verify_pin', { p_pin: 'x' }, 'https://ex', 'pk'), /PIN이 올바르지 않습니다\./); }
  finally { globalThis.fetch = orig; }
});

test('rpc 빈 응답(204)은 빈 객체', async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, status: 204, text: async () => '' });
  try { assert.deepEqual(await rpc('x', {}, 'https://ex', 'pk'), {}); } finally { globalThis.fetch = orig; }
});

test('관리자 쓰기 액션 다섯이 모두 RPC 이름을 가진다', () => {
  assert.deepEqual(RPC_OF, { writePlayer: 'write_player', deletePlayer: 'delete_player', writeRotation: 'write_rotation', writeFine: 'write_fine', deleteFine: 'delete_fine' });
});
test('normalizeFine: paid 문자열 → boolean, amount 숫자', () => {
  const f = normalizeFine({ id: '1', date: '2026-09-05', player: '김철수', type: '지각', amount: '30000', paid: 'TRUE' });
  assert.equal(f.paid, true); assert.equal(f.amount, 30000);
  assert.equal(serializeFine(f).paid, 'TRUE');
});
test('serializeFine ↔ normalizeFine 왕복', () => {
  const f = normalizeFine({ id: '1', date: '2026-09-05', match_id: '2026-09-05', player: '김철수', type: '노쇼', amount: 50000, paid: false });
  assert.deepEqual(normalizeFine(serializeFine(f)), f);
});
test('normalizePlayer: pos 대문자화, 빈 rot는 null, phone은 있을 때만', () => {
  const p = normalizePlayer({ num: '9', name: '김철수', pos: 'mf', rot: '', pace: '80' });
  assert.equal(p.pos, 'MF'); assert.equal(p.rot, null); assert.equal(p.pace, 80); assert.equal('phone' in p, false);
});
test('serializeRotation ↔ normalizeRotation 왕복', () => {
  const r = normalizeRotation({ year: 2026, month: 9, p1: '김철수', p2: '이영희', done: true });
  assert.deepEqual(normalizeRotation(serializeRotation(r)), r);
});

// ── 제한시간 ───────────────────────────────────────────────────────────
// 카톡 인앱 브라우저에서 이 요청이 실패가 아니라 **멈춤**으로 끝났다(2026-09-22).
// 오류가 안 나니 화면이 "불러오는 중"에서 영영 굳는다 — 끊어서 오류로 만들어야 배너가 뜬다.
import test2 from 'node:test';
import assert2 from 'node:assert/strict';
import { fetchData, TIMEOUT_MS } from '../../src/lib/api.ts';

test2('응답이 안 오면 제한시간에 끊고 오류로 돌린다', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const orig = globalThis.fetch;
  let aborted = false;
  globalThis.fetch = (_u, opts) => new Promise((_res, rej) => {
    opts.signal.addEventListener('abort', () => {
      aborted = true;
      const e = new Error('The operation was aborted.'); e.name = 'AbortError'; rej(e);
    });
  });
  try {
    const p = fetchData();
    t.mock.timers.tick(TIMEOUT_MS);
    await assert2.rejects(p, (e) => {
      assert2.match(e.message, /응답이 없습니다/, `문구가 다르다: ${e.message}`);
      return true;
    });
    assert2.ok(aborted, '제한시간이 지나도 요청을 끊지 않았다 — 연결이 그대로 남는다');
  } finally { globalThis.fetch = orig; }
});

test2('서버가 보낸 오류 문구는 제한시간 문구로 덮어쓰지 않는다', async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 400, text: async () => '{"message":"PIN이 올바르지 않습니다"}' });
  try {
    await assert2.rejects(fetchData(), (e) => e.message === 'PIN이 올바르지 않습니다');
  } finally { globalThis.fetch = orig; }
});

// ── 능력치 기록 ────────────────────────────────────────────────────────
// 능력치를 PIN 없이 누구나 고치게 열면서(2026-09-22) 유일한 제동이 "누가 고쳤나" 기록이다.
// 기록이 조용히 비거나 엉뚱한 칸으로 들어오면 그 제동이 사라지므로 정규화를 못 박는다.
import test3 from 'node:test';
import assert3 from 'node:assert/strict';
import { normalizeStatLog, normalizeData } from '../../src/lib/api.ts';

test3('기록 한 줄을 화면이 쓰는 모양으로 바꾼다', () => {
  const r = normalizeStatLog({ ts: '2026-09-22T10:00:00.000Z', by: '7', by_name: '이찬우', num: '2', field: 'pace', before: '70', after: '84' });
  assert3.deepEqual(r, { ts: '2026-09-22T10:00:00.000Z', by: 7, byName: '이찬우', num: 2, field: 'pace', before: 70, after: 84, via: '' });
});

test3('모르는 칸·번호 없는 줄은 버린다 — 화면이 이름을 못 붙인다', () => {
  assert3.equal(normalizeStatLog({ num: '2', field: 'height', before: 1, after: 2 }), null);
  assert3.equal(normalizeStatLog({ num: '', field: 'pace', before: 1, after: 2 }), null);
  assert3.equal(normalizeStatLog({ num: '0', field: 'pace' }), null);
});

test3('이름 없이 고친 줄도 버리지 않는다 — 이름을 안 고른 사람도 고칠 수 있다', () => {
  const r = normalizeStatLog({ ts: 't', by: '', by_name: '', num: '5', field: 'defend', before: '50', after: '60' });
  assert3.equal(r.by, null);
  assert3.equal(r.byName, '');
  assert3.equal(r.num, 5);
});

test3('기록은 최신이 위로 온다 — 시트는 덧붙인 순서라 뒤집어야 한다', () => {
  const d = normalizeData({ statLog: [
    { ts: '2026-09-01', num: '2', field: 'pace', before: 1, after: 2 },
    { ts: '2026-09-22', num: '2', field: 'pace', before: 2, after: 3 },
  ] });
  assert3.deepEqual(d.statLog.map((r) => r.ts), ['2026-09-22', '2026-09-01']);
});

test3('기록이 아예 없어도 빈 배열이다 (서버가 옛 버전이어도 화면이 안 깨진다)', () => {
  assert3.deepEqual(normalizeData({}).statLog, []);
});

// ── 티어 게임(2026-09-24) ─────────────────────────────────────────
import { applyVote } from '../../src/lib/api.ts';

test3('기록 줄의 via 를 그대로 받는다 — 대결로 바뀐 줄은 game', () => {
  assert3.equal(normalizeStatLog({ ts: 't', num: '2', field: 'pace', before: 1, after: 2, via: 'game' }).via, 'game');
  assert3.equal(normalizeStatLog({ ts: 't', num: '2', field: 'pace', before: 1, after: 2 }).via, '');
});

const pl = (num, pace) => ({ num, name: `P${num}`, pos: '', detail: '', foot: '', vest: null, note: '',
  pace, dribble: 70, pass: 70, shoot: 70, defend: 70, stamina: 70, rot: null, avatar: '' });

test3('applyVote — 서버 응답으로 두 선수 숫자를 고치고 기록 두 줄을 맨 위에 얹는다(다시 읽지 않는다)', () => {
  const d = { players: [pl(1, 70), pl(2, 70), pl(3, 50)], rotation: [], fines: [], statLog: [{ ts: 'old', by: null, byName: '', num: 1, field: 'pace', before: 60, after: 70, via: '' }] };
  const r = { ts: 'now', field: 'pace', by: 3, by_name: 'P3', win: { num: 2, before: 70, after: 72 }, lose: { num: 1, before: 70, after: 68 } };
  const n = applyVote(d, r);
  assert3.deepEqual(n.players.map((p) => p.pace), [68, 72, 50]);
  assert3.deepEqual(n.statLog.map((x) => [x.num, x.before, x.after, x.via, x.byName]), [[2, 70, 72, 'game', 'P3'], [1, 70, 68, 'game', 'P3'], [1, 60, 70, '', '']]);
  assert3.equal(d.players[0].pace, 70, '원본은 건드리지 않는다');
});

test3('applyVote — 끝에 막혀 안 바뀐 쪽은 기록을 남기지 않는다(서버와 같다)', () => {
  const d = { players: [pl(1, 99), pl(2, 98)], rotation: [], fines: [], statLog: [] };
  const n = applyVote(d, { ts: 't', field: 'pace', by: null, by_name: '', win: { num: 1, before: 99, after: 99 }, lose: { num: 2, before: 98, after: 96 } });
  assert3.deepEqual(n.statLog.map((x) => x.num), [2]);
});
