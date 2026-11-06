// 게임 등록부·방의 게임 종류(2026-11-07 게임 묶음 토대).
// 사용자: "자유 훈련장, 여러 드리블 훈련장, 승부차기, 프리킥 같은 게임 만들어서 온라인 가능하게 하자. 다 2d, 3d 모드 별로 가능하게 하고."
// 한 방에서 게임 종류를 바꿔 가며 논다 — 바꿔도 각 게임의 설정은 남아야 하고, 모르는 게임 id 는 채널에서 와도 받지 않는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_GAME, GAMES, gameFromParam, gameOf, gamesOf } from '../../src/lib/games/registry.ts';
import { MATCH2D } from '../../src/lib/games/match2d.ts';
import { DEFAULT_SETTINGS, applySettings, setSettings } from '../../src/lib/games/match2d-room.ts';
import { parseMsg } from '../../src/lib/games/net.ts';
import { createRoom, join, move, setBotPick, setGame, withSettings } from '../../src/lib/game/room.ts';
import { rngFrom } from '../../src/react/game/views/match2d/view.ts';

const who = (i) => ({ clientId: `c${i}`, num: 100 + i, name: `선수${i}` });

test('기본 게임은 2D 경기 — 모르는 ?g= 도 기본으로', () => {
  assert.equal(DEFAULT_GAME, 'match2d');
  assert.equal(gameOf(DEFAULT_GAME), MATCH2D);
  for (const v of [null, undefined, '', 'nope', 'MATCH2D', 'constructor', '__proto__']) assert.equal(gameFromParam(v), 'match2d', String(v));
  assert.equal(gameFromParam('match2d'), 'match2d');
  for (const v of ['nope', '', 'constructor', '__proto__', 'toString', 3, null, undefined]) assert.equal(gameOf(v), undefined, String(v));
});

test('등록부 — id 는 겹치지 않고, 모드별로 나뉜다, 지금 2D 는 경기 하나', () => {
  const ids = GAMES.map((g) => g.adapter.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const g of GAMES) {
    assert.ok(g.mode === '2d' || g.mode === '3d');
    assert.ok(g.name && g.describe && Array.isArray(g.tags));
    assert.ok(g.okSettings(g.defaultSettings), `${g.adapter.id} 기본 설정이 자기 검사를 통과`);
    assert.equal(g.applySettings(g.defaultSettings, {}), g.defaultSettings, '안 바뀌면 같은 객체');
  }
  assert.deepEqual(gamesOf('2d').map((g) => g.adapter.id), ['match2d']);
  assert.deepEqual(gamesOf('3d'), []);
});

test('방 — 게임 종류와 그 게임의 기본 설정으로 만들고, 기본값을 나눠 쓰지 않는다', () => {
  const r = createRoom('ABCD', who(0), 'match2d', DEFAULT_SETTINGS);
  assert.equal(r.game, 'match2d');
  assert.deepEqual(r.settings, DEFAULT_SETTINGS);
  assert.notEqual(r.settings, DEFAULT_SETTINGS);
  assert.deepEqual(r.saved, {});
});

test('게임을 바꿔도 게임마다의 설정이 남는다 — 돌아오면 그대로, 같은 게임이면 그대로(같은 객체)', () => {
  let r = createRoom('ABCD', who(0), 'match2d', DEFAULT_SETTINGS);
  r = setSettings(r, { perSide: 2, field: 'L' });
  const rev = r.rev;
  assert.equal(setGame(r, 'match2d', DEFAULT_SETTINGS), r);
  const fresh = { len: 120 };
  let s = setGame(r, 'counter', fresh);
  assert.equal(s.rev, rev + 1);
  assert.equal(s.game, 'counter');
  assert.deepEqual(s.settings, { len: 120 });
  assert.notEqual(s.settings, fresh, '기본값을 복사한다');
  assert.deepEqual(s.saved, { match2d: { ...DEFAULT_SETTINGS, perSide: 2, field: 'L' } });
  s = withSettings(s, { len: 300 });
  const back = setGame(s, 'match2d', DEFAULT_SETTINGS);
  assert.deepEqual(back.settings, { ...DEFAULT_SETTINGS, perSide: 2, field: 'L' }, '경기 설정이 돌아온다');
  assert.deepEqual(back.saved, { counter: { len: 300 } }, '카운터 설정은 남는다');
  assert.deepEqual(setGame(back, 'counter', fresh).settings, { len: 300 });
  assert.equal(withSettings(back, back.settings), back, '같은 설정이면 같은 객체');
});

test('채널에서 온 방 — 게임을 바꾼 방(saved 에 다른 게임)도, 모르는 게임은 거절', () => {
  const counter = { okSettings: (v) => !!v && Number.isInteger(v.len), adapter: { id: 'counter' } };
  const lookup = (id) => (id === 'counter' ? counter : gameOf(id));
  let r = setSettings(createRoom('ABCD', who(0), 'match2d', DEFAULT_SETTINGS), { perSide: 1 });
  r = setGame(r, 'counter', { len: 60 });
  const msg = { t: 'room', from: 'c0', sid: 's', room: r, roster: [] };
  assert.ok(parseMsg(msg, lookup), '두 게임을 아는 쪽은 받는다');
  assert.equal(parseMsg(msg, gameOf), null, 'counter 를 모르면 받지 않는다');
  assert.equal(parseMsg({ ...msg, room: { ...r, settings: { len: 'x' } } }, lookup), null, '그 게임의 설정 검사');
  assert.equal(parseMsg({ ...msg, room: { ...r, saved: { match2d: { perSide: 99 } } } }, lookup), null, 'saved 도 그 게임의 설정 검사');
  assert.equal(parseMsg({ t: 'start', from: 'c0', game: 'counter2', config: {}, seed: 1 }, lookup), null);
});

test('match2d buildConfig = 예전 buildMatch — 같은 방·명단·난수면 설정과 자리가 그대로(origin/main 에서 뽑은 기준)', () => {
  const FIX = JSON.parse(readFileSync(new URL('./fixtures/match2d-buildmatch.json', import.meta.url), 'utf8'));
  assert.ok(FIX.length >= 6);
  // 기준을 뽑은 스크립트와 같은 명단(능력치가 사람마다 달라 perf 까지 비교된다).
  const roster = (n) => Array.from({ length: n }, (_, i) => ({
    num: 100 + i, jersey: i + 1, name: `선수${i}`, pos: '', detail: '', foot: '', vest: null, note: '',
    pace: 50 + (i * 7) % 40, dribble: 55 + (i * 3) % 35, pass: 60, shoot: 45 + (i * 11) % 50, defend: 60, stamina: 40 + (i * 13) % 55, rot: null, avatar: '',
  }));
  for (const sc of FIX) {
    const ros = roster(sc.n);
    let r = createRoom('ABCD', who(0), 'match2d', MATCH2D.defaultSettings);
    for (let i = 1; i < sc.members; i++) r = join(r, who(i)).room;
    for (const [cid, t] of sc.moves) r = move(r, cid, t);
    r = withSettings(r, MATCH2D.applySettings(r.settings, sc.settings));
    for (const [side, slot, num] of sc.picks) r = setBotPick(r, side, slot, num, ros.map((p) => p.num));
    assert.deepEqual(MATCH2D.buildConfig(r, ros, rngFrom(sc.seed)), sc.result, `시나리오 seed ${sc.seed}`);
  }
});

test('match2d 설정 — applySettings 는 범위를 자르고 모르는 값은 무시, 바뀐 게 없으면 같은 객체', () => {
  const cur = { ...DEFAULT_SETTINGS };
  assert.equal(applySettings(cur, {}), cur);
  assert.equal(applySettings(cur, null), cur);
  assert.equal(applySettings(cur, { perSide: 3 }), cur);
  assert.deepEqual(applySettings(cur, { perSide: 99, minutes: -4, scoreLimit: 1000, field: 'XXL' }), { perSide: 6, minutes: 1, scoreLimit: 20, field: 'auto' });
  assert.equal(MATCH2D.okSettings({ ...DEFAULT_SETTINGS, perSide: 7 }), false);
});

test('match2d 방 화면의 봇 자리 — 한 편이 perSide 보다 적으면 모자란 만큼', () => {
  let r = createRoom('ABCD', who(0), 'match2d', DEFAULT_SETTINGS);
  for (let i = 1; i < 5; i++) r = join(r, who(i)).room;
  for (const [cid, t] of [['c0', 0], ['c1', 0], ['c2', 1], ['c3', 1], ['c4', 1]]) r = move(r, cid, t);
  assert.deepEqual(MATCH2D.botSeats(r), [1, 0]);
  assert.deepEqual(MATCH2D.botSeats(setSettings(r, { perSide: 0 })), [0, 0]);
  assert.match(MATCH2D.startBlock(setSettings(createRoom('ABCD', who(0), 'match2d', DEFAULT_SETTINGS), { perSide: 0 }), []), /두 편 모두 비어/);
});

// 세션·메시지 검사·예측기는 어댑터만 보고 돈다 — 2D 경기 계산(sim·bot·양자화·match2d)을 부르지 않는다(가짜 게임 테스트가 동작으로, 이 테스트가 import 로 지킨다).
test('공용 세션·메시지·예측기는 2D 경기 코드를 import 하지 않는다', () => {
  const files = [
    'src/lib/games/net.ts', 'src/lib/games/predict.ts', 'src/lib/games/adapter.ts', 'src/lib/games/entry.ts', 'src/lib/game/room.ts',
    'src/react/game/net/host.ts', 'src/react/game/net/guest.ts', 'src/react/game/net/common.ts', 'src/react/game/net/smooth.ts',
    'src/react/game/net/session.ts', 'src/react/game/net/transport.ts',
  ];
  for (const f of files) {
    const src = readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');
    const imports = [...src.matchAll(/^import[^;]*?from '([^']+)'/gm)].map((m) => m[1]);
    for (const p of imports) assert.ok(!/game\/(sim|bot|quant|stats|lineup)|games\/(match2d|registry)/.test(p), `${f} → ${p}`);
  }
});
