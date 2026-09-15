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
  'rules/index.html',
  'record/index.html',
  'record/fines/index.html',
  'record/duty/index.html',
  'tactics/index.html',
  'about/index.html',
];
export const INDEXABLE = [];
// 넘김 페이지(Redirect.astro)는 셸을 안 쓴다.
const REDIRECTS = ['record/index.html', 'record/fines/index.html', 'record/duty/index.html', 'tactics/index.html', 'about/index.html'];
export const SHELL_PAGES = PAGES.filter((p) => !REDIRECTS.includes(p));
const read = (p) => readFileSync(`dist/${p}`, 'utf8');

test('모든 페이지가 dist에 있다', () => {
  for (const p of PAGES) assert.ok(existsSync(`dist/${p}`), p);
});
test('모든 페이지는 noindex', () => {
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
test('상단 탭은 홈·스쿼드·매치·운영 네 갈래', () => {
  const html = read('index.html');
  for (const l of ['홈', '스쿼드', '매치', '운영']) assert.ok(html.includes(`<span>${l}</span>`), l);
  for (const l of ['기록', '전술', '소개']) assert.ok(!html.includes(`<span>${l}</span>`), `남은 탭: ${l}`);
});
test('검색 허용 페이지가 없으니 sitemap 도 없다', () => {
  assert.ok(!existsSync('dist/sitemap-index.xml'), 'sitemap-index.xml 이 남아 있다');
  assert.ok(!existsSync('dist/sitemap-0.xml'), 'sitemap-0.xml 이 남아 있다');
  assert.ok(!readFileSync('dist/robots.txt', 'utf8').includes('Sitemap:'), 'robots.txt 에 Sitemap 줄이 남아 있다');
});
test('옛 주소는 새 주소로 넘긴다', () => {
  const cases = {
    'about/index.html': '/weekly-fc/rules/',
    'record/index.html': '/weekly-fc/rules/#fees',
    'record/fines/index.html': '/weekly-fc/rules/#fees',
    'record/duty/index.html': '/weekly-fc/rules/#duty',
    'tactics/index.html': '/weekly-fc/squad/',
  };
  for (const [p, to] of Object.entries(cases)) assert.ok(read(p).includes(`url=${to}"`), `${p} → ${to}`);
});
test('셸 페이지는 빌드 때 뽑은 antd CSS를 head에서 불러온다', () => {
  assert.ok(existsSync('dist/antd.css'), 'dist/antd.css 없음 — prebuild 의 extract-antd-css 가 안 돌았다');
  for (const p of SHELL_PAGES) {
    const head = read(p).split('</head>')[0];
    assert.ok(head.includes('<link rel="stylesheet" href="/weekly-fc/antd.css"'), p);
  }
});
test('antd CSS는 wfc 변수 클래스로 뽑혔고 스펙 부품 규칙을 담는다', () => {
  const css = readFileSync('dist/antd.css', 'utf8');
  assert.ok(css.includes('.wfc'), 'wfc 변수 클래스 없음');
  // 1~4단계에서 쓸 부품이 제외 목록에 잘못 들어가지 않았는지
  for (const c of ['ant-btn', 'ant-modal', 'ant-message', 'ant-app', 'ant-input', 'ant-input-number', 'ant-select', 'ant-picker', 'ant-form', 'ant-table', 'ant-pagination', 'ant-checkbox', 'ant-segmented', 'ant-popover', 'ant-tooltip', 'ant-drawer', 'ant-card', 'ant-descriptions']) {
    assert.ok(css.includes(`.${c}`), c);
  }
  assert.ok(/\.ant-btn[^{]*\{[^}]*background/.test(css), '부품 규칙이 비었다 — zeroRuntime 을 켠 채 뽑았다');
});
test('상단바 이름·관리자 버튼은 React 섬으로 그려지고 옛 모달·토스트는 없다', () => {
  for (const p of SHELL_PAGES) {
    const html = read(p);
    const island = html.match(/<astro-island[^>]*component-url="\/weekly-fc\/_astro\/TopbarActions\.[^"]+\.js"[^>]*>/);
    assert.ok(island, `${p}: TopbarActions 섬 없음`);
    assert.ok(island[0].includes('client="load"'), `${p}: client:load 아님`);
    assert.ok(html.includes('id="me-btn"') && html.includes('id="admin-btn"'), `${p}: 버튼이 빌드 때 안 그려짐`);
    for (const old of ['id="pin-modal"', 'id="me-modal"', 'id="toast"']) assert.ok(!html.includes(old), `${p}: ${old} 가 남음`);
    const adminBtn = html.match(/<button\b[^>]*\bid="admin-btn"[^>]*>/);
    assert.ok(adminBtn, `${p}: admin-btn 태그 없음`);
    assert.ok(/\bclass="[^"]*\bwfc\b[^"]*"/.test(adminBtn[0]), `${p}: 빌드 때 그린 버튼에 wfc 변수 클래스가 없다(빌드 CSS와 어긋남)`);
  }
});
test('운영 탭 벌금 — 기준표는 빌드 때 그린 antd 표, 현황·내역은 FeesLive 섬, 옛 벌금 모달 없음', () => {
  const html = read('rules/index.html');
  const fees = html.slice(html.indexOf('<section id="fees"'), html.indexOf('<section id="duty"'));
  assert.ok(fees.includes('ant-table'), '벌금 기준표가 antd 표가 아니다');
  for (const s of ['지각', '시작 후 도착', '30,000원', '노쇼', '종료까지 미참', '50,000원']) assert.ok(fees.includes(s), `기준표 내용: ${s}`);
  assert.ok(!/component-url="[^"]*FineRulesTable/.test(html), '기준표가 섬이 됐다 — 정적이어야 JS 가 안 붙는다');
  const island = fees.match(/<astro-island[^>]*component-url="\/weekly-fc\/_astro\/FeesLive\.[^"]+\.js"[^>]*>/);
  assert.ok(island, 'FeesLive 섬 없음');
  assert.ok(island[0].includes('client="load"'), 'FeesLive 가 client:load 아님');
  // 기존 CDP 시나리오(t10)가 찾는 자리 — 데이터가 오기 전(빌드 때)에도 있어야 한다
  for (const id of ['fees-total', 'fees-unpaid', 'fees-app']) assert.ok(fees.includes(`id="${id}"`), id);
  assert.ok(!html.includes('id="fine-modal"'), '옛 벌금 모달(wa-dialog)이 남음');
});
