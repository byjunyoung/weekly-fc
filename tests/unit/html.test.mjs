import test from 'node:test';
import assert from 'node:assert/strict';
import { esc, fmtDate, fmtWon, monthLabel } from '../../src/lib/html.ts';
test('esc', () => assert.equal(esc('<a href="x">&</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;'));
test('fmtDate는 요일을 붙인다', () => assert.equal(fmtDate('2026-09-05'), '2026.09.05 (토)'));
test('fmtDate는 이상한 값은 그대로', () => assert.equal(fmtDate(''), ''));
test('fmtWon', () => assert.equal(fmtWon(30000), '30,000원'));
test('monthLabel', () => assert.equal(monthLabel(2026, 9), '2026년 9월'));
