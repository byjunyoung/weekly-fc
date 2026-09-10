import test from 'node:test';
import assert from 'node:assert/strict';
import { sortRows, renderTable } from '../../src/components/table.ts';

const cols = [{ key: 'n', label: '#', get: (r) => r.n, align: 'r' }, { key: 'name', label: '이름', get: (r) => r.name }];
const rows = [{ n: 9, name: '나' }, { n: 3, name: '가' }, { n: 5, name: '다' }];

test('sortRows 숫자 오름·내림', () => {
  assert.deepEqual(sortRows(rows, cols, { sortKey: 'n', sortDir: 'asc' }).map((r) => r.n), [3, 5, 9]);
  assert.deepEqual(sortRows(rows, cols, { sortKey: 'n', sortDir: 'desc' }).map((r) => r.n), [9, 5, 3]);
});
test('sortRows 문자열은 localeCompare', () => {
  assert.deepEqual(sortRows(rows, cols, { sortKey: 'name', sortDir: 'asc' }).map((r) => r.name), ['가', '나', '다']);
});
test('sortRows는 원본을 바꾸지 않는다', () => { sortRows(rows, cols, { sortKey: 'n', sortDir: 'asc' }); assert.equal(rows[0].n, 9); });
test('renderTable은 정렬된 th에 sorted 클래스와 방향 표시', () => {
  const html = renderTable(cols, rows, { sortKey: 'n', sortDir: 'desc' });
  assert.ok(html.includes('class="r sorted"')); assert.ok(html.includes('▾'));
  assert.ok(html.indexOf('<td class="r">9</td>') < html.indexOf('<td class="r">3</td>'));
});
test('renderTable 빈 표', () => assert.ok(renderTable(cols, [], { sortKey: 'n', sortDir: 'asc' }, { empty: '없음' }).includes('class="empty"')));
test('renderTable은 값을 이스케이프한다', () => assert.ok(renderTable(cols, [{ n: 1, name: '<b>' }], { sortKey: 'n', sortDir: 'asc' }).includes('&lt;b&gt;')));
