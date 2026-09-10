import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

// 태스크가 페이지를 추가할 때마다 여기에 줄을 더한다.
export const PAGES = [
  'index.html',
  'squad/index.html',
  'squad/9/index.html',
  'squad/99/index.html',
  'match/index.html',
  'record/index.html',
  'record/fines/index.html',
  'record/duty/index.html',
];
export const INDEXABLE = ['tactics/index.html', 'about/index.html'];
const read = (p) => readFileSync(`dist/${p}`, 'utf8');

test('모든 페이지가 dist에 있다', () => {
  for (const p of PAGES) assert.ok(existsSync(`dist/${p}`), p);
});
test('팀 페이지는 noindex, 전술·소개만 index', () => {
  for (const p of PAGES) {
    const html = read(p);
    const should = !INDEXABLE.includes(p);
    assert.equal(html.includes('name="robots" content="noindex"'), should, p);
  }
});
test('내부 링크는 전부 /weekly-fc/ 로 시작한다', () => {
  for (const p of PAGES) {
    const hrefs = [...read(p).matchAll(/href="(\/[^"]*)"/g)].map((m) => m[1]);
    for (const h of hrefs) assert.ok(h.startsWith('/weekly-fc/'), `${p}: ${h}`);
  }
});
test('사이드바에 여섯 갈래가 있다', () => {
  const html = read('index.html');
  for (const l of ['홈', '스쿼드', '매치', '기록', '전술', '소개']) assert.ok(html.includes(`<span class="nav-label">${l}</span>`), l);
});
