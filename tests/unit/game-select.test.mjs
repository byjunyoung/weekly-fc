import test from 'node:test';
import assert from 'node:assert/strict';
import { sortRoster, moveCursor, keyToCursor, statRows, disabledReason, initialCursor } from '../../src/react/game/select/select-model.ts';

// 2026-11-07 "약간 옛날 오락실게임에서 고르듯이" — 선수 선택 화면의 순수 계산.
const P = (num, jersey, stat = 60) => ({ num, jersey, name: `선수${num}`, pos: 'MF', detail: '', foot: '오른발', vest: null, note: '',
  pace: stat, dribble: stat, pass: stat, shoot: stat, defend: stat, stamina: stat, rot: null, avatar: '' });

test('명단은 등번호 순, 같으면 num 순, 원본은 그대로', () => {
  const list = [P(5, 10), P(1, 7), P(9, 7), P(3, 0), P(2, 99)];
  assert.deepEqual(sortRoster(list).map((p) => p.num), [1, 9, 5, 2, 3], '등번호 없음(0)은 맨 뒤');
  assert.deepEqual(list.map((p) => p.num), [5, 1, 9, 3, 2]);
});

test('커서 — 좌우는 줄을 넘어 이어지고 양 끝에서 감아 돈다', () => {
  for (const cols of [1, 3, 5, 6]) {
    assert.equal(moveCursor(0, 'left', 10, cols), 9);
    assert.equal(moveCursor(9, 'right', 10, cols), 0);
    assert.equal(moveCursor(2, 'right', 10, cols), 3);
    assert.equal(moveCursor(3, 'left', 10, cols), 2);
    assert.equal(moveCursor(4, 'home', 10, cols), 0);
    assert.equal(moveCursor(4, 'end', 10, cols), 9);
  }
});

test('커서 — 위아래, 마지막 덜 찬 줄 감아 돌기(37명 · 6칸 = 6줄 + 1칸)', () => {
  const n = 37, c = 6;   // 마지막 줄은 36 하나
  assert.equal(moveCursor(0, 'down', n, c), 6);
  assert.equal(moveCursor(30, 'down', n, c), 36, '바로 아래(36)가 있다');
  assert.equal(moveCursor(31, 'down', n, c), 36, '바로 아래가 비면 마지막 칸으로');
  assert.equal(moveCursor(36, 'down', n, c), 0, '마지막 줄 → 같은 칸 첫 줄');
  assert.equal(moveCursor(0, 'up', n, c), 36, '첫 줄 → 같은 칸 맨 아래 줄');
  assert.equal(moveCursor(3, 'up', n, c), 33, '맨 아래 줄에 그 칸이 없으면 한 줄 위');
  assert.equal(moveCursor(36, 'up', n, c), 30);
  // 모든 칸에서 네 방향 모두 범위 안
  for (const cols of [1, 2, 4, 6, 7, 40]) for (let i = 0; i < n; i++) for (const k of ['left', 'right', 'up', 'down']) {
    const j = moveCursor(i, k, n, cols);
    assert.ok(j >= 0 && j < n, `${cols}칸 ${i} ${k} → ${j}`);
  }
  // 한 줄(cols ≥ n) — 위아래는 제자리
  assert.equal(moveCursor(5, 'up', 10, 40), 5); assert.equal(moveCursor(5, 'down', 10, 40), 5);
  // 한 칸 폭(cols 1) — 위아래가 좌우와 같다
  assert.equal(moveCursor(0, 'up', 4, 1), 3); assert.equal(moveCursor(3, 'down', 4, 1), 0);
  // 이상한 값
  assert.equal(moveCursor(0, 'down', 0, 6), -1);
  assert.equal(moveCursor(99, 'left', 5, 0), 3);
  assert.equal(moveCursor(NaN, 'right', 5, NaN), 1);
});

test('키 이름 → 방향', () => {
  assert.deepEqual(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'a', 'Enter'].map(keyToCursor), ['left', 'right', 'up', 'down', 'home', 'end', null, null]);
});

test('능력치 줄 — 카드 순서(페이스·드리블·슈팅·수비·패스·피지컬), 전부 0 이면 배치 전', () => {
  const r = statRows(P(1, 7, 72), 'A');
  assert.equal(r.rated, true);
  assert.deepEqual(r.model.stats.map((s) => s.label), ['페이스', '드리블', '슈팅', '수비', '패스', '피지컬']);
  assert.ok(r.model.stats.every((s) => s.value === 72));
  assert.equal(r.model.tier, 'A'); assert.equal(r.model.jersey, 7);
  const u = statRows(P(2, 8, 0), undefined);
  assert.equal(u.rated, false); assert.equal(u.model.tier, null);
});

test('못 고르는 선수 — 이유, 빈 이유는 기본 문구, 처음 커서는 고른 선수 또는 첫 고를 수 있는 선수', () => {
  const d = new Map([[1, '다른 사람이 고른 선수'], [2, '']]);
  assert.equal(disabledReason(1, d), '다른 사람이 고른 선수');
  assert.equal(disabledReason(2, d), '고를 수 없는 선수');
  assert.equal(disabledReason(3, d), null);
  assert.equal(disabledReason(3, undefined), null);
  const list = [P(1, 1), P(2, 2), P(3, 3)];
  assert.equal(initialCursor(list, 3, d), 2);
  assert.equal(initialCursor(list, null, d), 2, '앞 둘은 못 고른다');
  assert.equal(initialCursor(list, 99, undefined), 0);
});
