import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// 태스크가 페이지를 추가할 때마다 여기에 줄을 더한다.
export const PAGES = [
  'index.html',
  'squad/index.html',
  'lineup/index.html',
  'teams/index.html',
  'matches/index.html',
  'matches/new/index.html',
  'matches/potm/index.html',
  'squad/9/index.html',
  'squad/99/index.html',
  'rules/index.html',
  'record/index.html',
  'record/fines/index.html',
  'record/duty/index.html',
  'tactics/index.html',
  'kit/index.html',
  'guide/index.html',
  'about/index.html',
];
export const INDEXABLE = [];
// 넘김 페이지(Redirect.astro)는 셸을 안 쓴다.
const REDIRECTS = ['matches/potm/index.html', 'teams/index.html', 'record/index.html', 'record/fines/index.html', 'record/duty/index.html', 'about/index.html'];   // tactics 는 2026-09-26 부터 진짜 페이지
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
test('상단 탭은 라커룸·명단·매치·티어·전술·안내 여섯 갈래(2026-11-06 여덟 → 여섯; 이전: 2026-09-28 운영 규칙 → 규칙, 2026-09-30 자료) — 라인업·규칙·자료는 하위 탭으로', () => {
  const html = read('index.html');
  for (const l of ['라커룸', '명단', '매치', '티어', '전술', '안내']) assert.ok(html.includes(`<span>${l}</span>`), l);
  for (const l of ['스쿼드', '기록', '소개', '팀짜기', '라인업', '규칙', '자료']) assert.ok(!html.includes(`<span>${l}</span>`), `남은 탭: ${l}`);
});
test('묶인 메뉴는 하위 탭 줄을 보인다(2026-11-06) — 규칙에선 안내 > 규칙, 라인업에선 매치 > 라인업 짜기', () => {
  const rules = read('rules/index.html');
  assert.match(rules, /class="subnav"[\s\S]*처음 왔다면[\s\S]*규칙[\s\S]*자료/);
  assert.ok(!read('index.html').includes('class="subnav"'), '하위 탭 없는 메뉴엔 줄이 없다');
  assert.match(read('lineup/index.html'), /class="subnav"[\s\S]*지난 경기[\s\S]*라인업 짜기/);
});
test('푸터 — 셸 페이지마다 인스타·오픈카톡·유튜브 링크(2026-09-30)', () => {
  for (const p of SHELL_PAGES) {
    const html = read(p);
    const foot = html.slice(html.indexOf('<footer class="site-foot"'));
    assert.ok(foot.startsWith('<footer'), `${p}: 푸터 없음`);
    for (const u of ['instagram.com/weeklyfootballclub', 'open.kakao.com/o/gQLPdm5f', 'youtube.com/@WEEKLYFC2020']) assert.ok(foot.includes(u), `${p}: ${u}`);
  }
});
test('옛 /teams/ 는 /matches/new/ 로 넘긴다(카톡에 남은 링크)', () => {
  assert.ok(read('teams/index.html').includes('url=/weekly-fc/matches/new/'));
  // [팀 짜기] 버튼은 React 섬이 브라우저에서 그리므로 정적 HTML 엔 없다 — 페이지 존재는 PAGES 가 본다.
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
test('상단바 로그인 버튼은 React 섬으로 그려지고, 관리자 버튼은 빌드 때 없다(관리자 계정일 때만), 옛 모달·토스트는 없다', () => {
  for (const p of SHELL_PAGES) {
    const html = read(p);
    const island = html.match(/<astro-island[^>]*component-url="\/weekly-fc\/_astro\/TopbarActions\.[^"]+\.js"[^>]*>/);
    assert.ok(island, `${p}: TopbarActions 섬 없음`);
    assert.ok(island[0].includes('client="load"'), `${p}: client:load 아님`);
    assert.ok(html.includes('id="me-btn"'), `${p}: 로그인 버튼이 빌드 때 안 그려짐`);
    // 2026-09-24 본인인증: 관리자 버튼은 서버가 관리자라고 답한 계정에만 뜬다 — 빌드 결과엔 없어야 한다.
    assert.ok(!html.includes('id="admin-btn"'), `${p}: 관리자 버튼이 빌드 때 그려짐`);
    for (const old of ['id="pin-modal"', 'id="me-modal"', 'id="toast"', 'id="pin-input"']) assert.ok(!html.includes(old), `${p}: ${old} 가 남음`);
    const meBtn = html.match(/<button\b[^>]*\bid="me-btn"[^>]*>/);
    assert.ok(meBtn, `${p}: me-btn 태그 없음`);
    assert.ok(/\bclass="[^"]*\bwfc\b[^"]*"/.test(meBtn[0]), `${p}: 빌드 때 그린 버튼에 wfc 변수 클래스가 없다(빌드 CSS와 어긋남)`);
  }
});
test('운영 탭 벌금 — 기준표만 빌드 때 그린 antd 표, 미납·내역 표는 없다(2026-09-30 "규칙 페이지 간소화")', () => {
  const html = read('rules/index.html');
  const fees = html.slice(html.indexOf('<section id="fees"'), html.indexOf('<section id="duty"'));
  assert.ok(fees.includes('ant-table'), '벌금 기준표가 antd 표가 아니다');
  for (const s of ['지각', '시작 후 도착', '30,000원', '노쇼', '종료까지 미참', '50,000원']) assert.ok(fees.includes(s), `기준표 내용: ${s}`);
  assert.ok(!/component-url="[^"]*FineRulesTable/.test(html), '기준표가 섬이 됐다 — 정적이어야 JS 가 안 붙는다');
  assert.ok(!/component-url="[^"]*FeesLive/.test(html), '벌금 미납·내역 섬이 남았다');
  assert.ok(!html.includes('id="fine-modal"'), '옛 벌금 모달(wa-dialog)이 남음');
});
test('팀 자료 — /kit/ 은 KitApp 섬, 로고 PNG 여섯 개가 dist/brand 에 있다(2026-09-30)', () => {
  const html = read('kit/index.html');
  assert.ok(/component-url="\/weekly-fc\/_astro\/KitApp\.[^"]+\.js"/.test(html), 'KitApp 섬 없음');
  for (const v of ['word', 'stack', 'ball']) for (const t of ['', '-transparent']) {
    assert.ok(existsSync(`dist/brand/weeklyfc-logo-${v}${t}.png`), `로고 ${v}${t}`);
  }
});
test('운영 탭 봉사 — 봉사표는 DutyLive 섬, 이 페이지엔 옛 페이지 스크립트·Web Awesome 대화상자가 없다', () => {
  const html = read('rules/index.html');
  const duty = html.slice(html.indexOf('<section id="duty"'), html.indexOf('<section id="manner"'));
  const island = duty.match(/<astro-island[^>]*component-url="\/weekly-fc\/_astro\/DutyLive\.[^"]+\.js"[^>]*>/);
  assert.ok(island, 'DutyLive 섬 없음');
  assert.ok(island[0].includes('client="load"'), 'DutyLive 가 client:load 아님');
  for (const id of ['duty-year', 'duty-app']) assert.ok(duty.includes(`id="${id}"`), id);
  assert.ok(!html.includes('<wa-dialog'), 'wa-dialog 가 남음');
  assert.ok(!/rules\.astro_astro_type_script/.test(html), '옛 페이지 스크립트가 남음');
});
test('선수 상세는 PlayerDetail 섬 하나, 옛 페이지 스크립트·편집 모달 없음', () => {
  for (const p of ['squad/9/index.html', 'squad/99/index.html']) {
    const html = read(p);
    const island = html.match(/<astro-island[^>]*component-url="\/weekly-fc\/_astro\/PlayerDetail\.[^"]+\.js"[^>]*>/);
    assert.ok(island, `${p}: PlayerDetail 섬 없음`);
    assert.ok(island[0].includes('client="load"'), `${p}: client:load 아님`);
    assert.ok(html.includes('id="title"') && html.includes('id="actions"'), `${p}: 제목·버튼 자리 없음`);
    assert.ok(!html.includes('id="edit-modal"'), `${p}: 옛 편집 모달이 남음`);
    assert.ok(!/\[num\]\.astro_astro_type_script/.test(html), `${p}: 옛 페이지 스크립트가 남음`);
  }
});
test('선수 상세 — 아바타 에디터는 antd 모달 틀 안에 있고, wa-dialog 없음', () => {
  const html = read('squad/9/index.html');
  assert.ok(!html.includes('<wa-dialog'), 'squad/9/ 에 wa-dialog 가 남음');
});
test('홈 — HomeApp 섬 하나, client:load, 옛 페이지 스크립트 없음', () => {
  const html = read('index.html');
  const island = html.match(/<astro-island[^>]*component-url="\/weekly-fc\/_astro\/HomeApp\.[^"]+\.js"[^>]*>/);
  assert.ok(island, 'HomeApp 섬 없음');
  assert.ok(island[0].includes('client="load"'), 'client:load 아님');
  assert.ok(!/index\.astro_astro_type_script/.test(html), '옛 페이지 스크립트가 남음');
});
test('스쿼드 — SquadApp 섬 하나, client:load, 옛 페이지 스크립트·wa-dialog 없음', () => {
  const html = read('squad/index.html');
  const island = html.match(/<astro-island[^>]*component-url="\/weekly-fc\/_astro\/SquadApp\.[^"]+\.js"[^>]*>/);
  assert.ok(island, 'SquadApp 섬 없음');
  assert.ok(island[0].includes('client="load"'), 'client:load 아님');
  assert.ok(!html.includes('<wa-dialog'), 'wa-dialog 가 남음');
  assert.ok(!/squad\/index\.astro_astro_type_script/.test(html), '옛 페이지 스크립트가 남음');
});
test('4단계 뒤 dist 전체에 webawesome 문자열이 없다(스펙 §7.3)', () => {
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]);
  const files = walk('dist').filter((f) => /\.(html|js|css)$/.test(f));
  const hit = files.find((f) => readFileSync(f, 'utf8').includes('webawesome'));
  assert.ok(!hit, `webawesome 문자열이 남음: ${hit}`);
});
// 2026-09-25 의 새 '매치' 탭(/matches/, 팀 구성·POTM)은 다른 것이다 — 옛 영상 목록(/match/, MatchApp)만 없는지 본다.
test('옛 영상 목록 매치 탭이 완전히 삭제됐다(스펙 §7 · 2026-09-21 리프레시)', () => {
  assert.ok(!existsSync('dist/match'), 'dist/match 디렉터리가 남음');
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]);
  const files = walk('dist').filter((f) => /\.(html|js|css)$/.test(f));
  const hit = files.find((f) => readFileSync(f, 'utf8').includes('MatchApp'));
  assert.ok(!hit, `MatchApp 흔적이 남음: ${hit}`);
});
test('갈무리 도트 폰트가 제목·OVR·능력치 숫자에 적용된다(1a단계, 2026-09-21 리프레시 스펙 §3)', () => {
  const files = readdirSync('dist/_astro', { withFileTypes: true }).filter((e) => e.name.endsWith('.css')).map((e) => `dist/_astro/${e.name}`);
  const hit = files.find((f) => readFileSync(f, 'utf8').includes('Galmuri9'));
  assert.ok(hit, 'Galmuri9 @font-face 를 담은 CSS 청크를 dist/_astro 에서 못 찾음');
  const css = readFileSync(hit, 'utf8');
  assert.ok(css.includes('--font-pixel'), '--font-pixel 토큰이 빌드된 CSS에 없음');
});
test('등급 카드 배경이 그라디언트에서 단색으로 바뀐다(1a단계, 2026-09-21 리프레시 스펙 §3)', () => {
  const files = readdirSync('dist/_astro', { withFileTypes: true }).filter((e) => e.name.endsWith('.css')).map((e) => `dist/_astro/${e.name}`);
  const hit = files.find((f) => readFileSync(f, 'utf8').includes('--metal-gold'));
  assert.ok(hit, '--metal-gold 를 담은 CSS 청크를 dist/_astro 에서 못 찾음');
  const css = readFileSync(hit, 'utf8');
  assert.ok(!css.includes('linear-gradient(160deg'), '옛 등급 그라디언트가 아직 남아 있음');
  assert.ok(css.includes('--metal-gold:var(--gold)'), '--metal-gold 가 var(--gold) 를 참조하지 않음');
});

test('전술 페이지 — 법칙 34개가 빌드 때 그려지고(JS 섬 없음), 사람 이름이 없다', () => {
  const html = read('tactics/index.html');
  assert.equal((html.match(/class="tl-card"/g) ?? []).length, 34);
  assert.ok(html.includes('<svg'), '보드 SVG 가 정적으로 들어 있다');
  for (const n of ['현서', '동훈', '준영', '효종', '찬우']) assert.ok(!html.includes(n), `이름 ${n}`);
});

test('링크 미리보기 — 셸 페이지마다 og:image 가 절대 주소로 있고, 그 파일이 dist 에 있다(2026-09-26)', () => {
  for (const p of SHELL_PAGES) {
    const html = read(p);
    const m = /property="og:image" content="(https:\/\/byjunyoung\.github\.io\/weekly-fc\/[^"]+)"/.exec(html);
    assert.ok(m, `${p}: og:image 절대 주소`);
    assert.ok(existsSync(`dist/${m[1].replace('https://byjunyoung.github.io/weekly-fc/', '')}`), `${p}: ${m[1]} 파일`);
    assert.ok(html.includes('property="og:title"') && html.includes('name="twitter:card"'), `${p}: og:title/twitter:card`);
  }
  assert.ok(read('tactics/index.html').includes('/weekly-fc/og-tactics.png'), '전술은 자기 그림');
  assert.ok(read('teams/index.html').includes('property="og:image"'), '넘김 페이지도 미리보기');
});

// cwd 를 저장소 루트로 못 박는다 — 다른 디렉터리에서 돌려도 src 를 못 찾아 조용히 통과하는 일이 없게.
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
// grep 은 못 찾으면 1, 오류면 2 로 끝난다 — 1 만 "없음"으로 치고 나머지는 그대로 던져 테스트가 헛통과하지 않게.
const grepSrc = (re) => {
  try { return execSync(`grep -rilE "${re}" src`, { encoding: 'utf8', cwd: ROOT }).trim().split('\n').filter(Boolean); }
  catch (e) { if (e.status === 1) return []; throw e; }
};
test('방명록은 화면·코드에서 뺐다(2026-11-06) — src 어디에도 남지 않는다', () => {
  assert.deepEqual(grepSrc('guestbook|방명록'), []);
});

test('POTM 은 뺐다(2026-11-06) — 옛 투표 주소는 매치 목록으로 넘긴다, 코드엔 기록 표기 하나만 남는다', () => {
  const html = read('matches/potm/index.html');
  assert.ok(html.includes('/weekly-fc/matches/'), '넘김 목적지');
  assert.ok(!html.includes('og-potm.png'));
  assert.ok(!existsSync('dist/og-potm.png'));
  // 남는 건 둘: 능력치 기록의 「POTM 보상」 줄(why, model.ts)과 StatLogRow.via 의 'potm'(types.ts).
  assert.deepEqual(grepSrc('potm').sort(), ['src/lib/types.ts', 'src/react/player/model.ts']);
});

test('벌금은 규칙 표만 남는다 — 기록 코드는 없다', () => {
  assert.deepEqual(grepSrc('writeFine|deleteFine|normalizeFine|unpaidRows|fineSummary'), []);
  assert.ok(read('rules/index.html').includes('노쇼'), '규칙의 벌금표는 그대로');
});

test('안내 > 처음 왔다면(2026-11-06) — 소제목 셋(매주 이렇게·경기 영상·포털)으로 한 단, 가입은 필수가 아니다(같은 날 "뎁스 줄이고 간소화")', () => {
  const html = read('guide/index.html');
  for (const s of ['매주 이렇게', '필수는 아니고', 'youtube.com/@WEEKLYFC2020', 'instagram.com/weeklyfootballclub', '/weekly-fc/rules/', '카카오뱅크', '토요일 오전 10–12시']) assert.ok(html.includes(s), s);
  assert.equal((html.match(/<h2/g) ?? []).length, 3, '소제목은 셋');
  assert.ok(!html.includes('guide-part'), '묶음 제목 단은 없앴다');
  assert.ok(html.includes('/weekly-fc/og.png'));
  assert.ok(!html.includes('자기소개 양식'), '양식은 봇이 보낸다');
});

test('규칙은 한 단(2026-11-06 "규칙도 뎁스가 너무 깊어") — 제목 아래 목차 줄 없이 소제목 넷, 통장은 비용 칸 안에', () => {
  const html = read('rules/index.html');
  assert.ok(!html.includes('class="tabs"'), '목차 줄이 남았다');
  assert.deepEqual([...html.matchAll(/<section id="([a-z]+)"/g)].map((m) => m[1]), ['when', 'fees', 'duty', 'manner']);
  const fees = html.slice(html.indexOf('<section id="fees"'), html.indexOf('<section id="duty"'));
  assert.ok(fees.includes('카카오뱅크'), '통장 줄은 비용 칸에');
  assert.ok(!html.includes('자기소개 양식'), '양식은 봇이 보낸다');
});
