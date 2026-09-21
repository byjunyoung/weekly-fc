import test from 'node:test';
import assert from 'node:assert/strict';
import { ALL_VIEWS, loadView, saveView, byOvr, nextFreeNum } from '../../src/react/squad/model.ts';

const P = (num, name, over = {}) => ({ num, name, pos: 'MF', detail: '', foot: '', vest: null, note: '', pace: 70, dribble: 70, pass: 70, shoot: 70, defend: 70, stamina: 70, rot: null, avatar: '', phone: '', ...over });

// localStorage 가 없는 Node 환경 — 파일 맨 위에서 한 번만 흉내낸다(단위 테스트 관례).
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
};

test('loadView: 저장된 값이 없으면 list', () => {
  store.clear();
  assert.equal(loadView(), 'list');
});
test('loadView: 기본 allowed 안의 값만 유효, 그 외 값은 allowed[0]', () => {
  store.set('wfc.squad.view', 'card');
  assert.equal(loadView(), 'card');
  store.set('wfc.squad.view', 'table');
  assert.equal(loadView(), 'table');
  store.set('wfc.squad.view', '엉뚱한값');
  assert.equal(loadView(), 'list');
});
test('saveView → loadView 왕복', () => {
  saveView('table');
  assert.equal(loadView(), 'table');
});
// 화면마다 고를 수 있는 보기가 다르다 — /squad/ 는 표·카드, /lineup/ 은 목록 하나.
// 저장값이 그 화면에 없는 보기면 첫 번째로 떨어져야 빈 화면이 안 나온다.
test('loadView: allowed 밖의 저장값은 allowed 의 첫 번째로', () => {
  saveView('list');
  assert.equal(loadView(['table', 'card']), 'table');
  assert.equal(loadView(['card', 'table']), 'card');
  saveView('card');
  assert.equal(loadView(['table', 'card']), 'card');
});
test('ALL_VIEWS 는 목록·카드·표 셋', () => {
  assert.deepEqual(ALL_VIEWS, ['list', 'card', 'table']);
});
test('byOvr: OVR 내림차순, 같으면 번호 오름차순', () => {
  const rows = [P(9, '가', { pace: 70, dribble: 70, pass: 70, shoot: 70, defend: 70, stamina: 70 }), P(3, '나', { pace: 90, dribble: 90, pass: 90, shoot: 90, defend: 90, stamina: 90 }), P(1, '다', { pace: 70, dribble: 70, pass: 70, shoot: 70, defend: 70, stamina: 70 })];
  assert.deepEqual(byOvr(rows).map((p) => p.num), [3, 1, 9]);
});
test('nextFreeNum: 비어 있는 가장 작은 번호', () => {
  assert.equal(nextFreeNum([P(1, '가'), P(2, '나'), P(4, '다')]), 3);
  assert.equal(nextFreeNum([]), 1);
});
