import test from 'node:test';
import assert from 'node:assert/strict';
import { buildUrl, normalizeMatch, normalizeFine, normalizePlayer, normalizeRotation, normalizeLineup, serializeMatch, serializeFine, serializeRotation, serializeLineup } from '../../src/lib/api.ts';

test('buildUrl은 action과 payload를 쿼리에 싣는다', () => {
  const u = new URL(buildUrl('writeMatch', { pin: '1234', payload: { id: 'x' } }, 'https://example.com/exec'));
  assert.equal(u.searchParams.get('action'), 'writeMatch');
  assert.equal(u.searchParams.get('pin'), '1234');
  assert.equal(JSON.parse(decodeURIComponent(u.searchParams.get('payload'))).id, 'x');
});
test('normalizeMatch: attendees 문자열·teams JSON·날짜를 정리한다', () => {
  const m = normalizeMatch({ id: '2026-09-05', date: '2026-09-05T00:00:00.000Z', type: '3파전', attendees: '김철수, 이영희 ,', teams: '[{"name":"A","players":["김철수"],"points":3}]', winner: 'A' });
  assert.equal(m.date, '2026-09-05');
  assert.deepEqual(m.attendees, ['김철수', '이영희']);
  assert.equal(m.teams[0].points, 3);
  assert.equal(m.type, '3파전');
});
test('normalizeMatch: 깨진 teams는 빈 배열', () => {
  assert.deepEqual(normalizeMatch({ id: '1', teams: '{oops' }).teams, []);
});
test('serializeMatch ↔ normalizeMatch 왕복', () => {
  const m = normalizeMatch({ id: '2026-09-05', date: '2026-09-05', location: '모란공원', youtube: 'abc', type: '2파전', attendees: '김철수, 이영희', teams: '[{"name":"A","players":["김철수"],"points":null}]', winner: '' });
  const s = serializeMatch(m);
  assert.equal(s.attendees, '김철수, 이영희');
  assert.deepEqual(normalizeMatch(s), m);
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
test('serializeLineup ↔ normalizeLineup 왕복', () => {
  const l = normalizeLineup({ id: '1', match_id: '2026-09-05', name: '', formation: '4-3-3', assignments: JSON.stringify({ formation: { home: '4-3-3', away: '4-4-2' } }) });
  assert.deepEqual(normalizeLineup(serializeLineup(l)), l);
});
// normalizeMatch의 id는 date와 달리 day()로 자르지 않는다 — 의도된 비대칭이다.
// match.id는 freeId()가 같은 날짜에 "-2","-3" 접미사를 붙여 만드는 경우가 있어(match/index.astro),
// day()가 앞 10자로 자르면 서로 다른 매치의 id가 같은 값으로 뭉개진다.
// Date로 저장된 셀은 백엔드 cell()이 이미 'yyyy-MM-dd'로 정리해 내려주므로(apps-script.gs handleWriteMatch/#1 수정),
// 프런트에서 id를 다시 자를 필요가 없다 — id는 불투명 문자열로 취급하고 백엔드 수정만으로 충분하다.
test('normalizeMatch: id는 date와 달리 자르지 않는다 (freeId의 "-2" 접미사를 보존)', () => {
  const m = normalizeMatch({ id: '2026-09-05T00:00:00.000Z', date: '2026-09-05T00:00:00.000Z' });
  assert.equal(m.date, '2026-09-05');
  assert.equal(m.id, '2026-09-05T00:00:00.000Z');
  const suffixed = normalizeMatch({ id: '2026-09-05-2', date: '2026-09-05' });
  assert.equal(suffixed.id, '2026-09-05-2');
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
  globalThis.fetch = async () => ({ json: async () => ({ error: 'PIN이 올바르지 않습니다' }) });
  try {
    await assert2.rejects(fetchData(), (e) => e.message === 'PIN이 올바르지 않습니다');
  } finally { globalThis.fetch = orig; }
});
