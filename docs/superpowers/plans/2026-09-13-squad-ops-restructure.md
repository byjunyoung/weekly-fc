# 스쿼드 한 화면 · 운영 탭 · 기록 걷어내기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기록·출석 기반 화면을 걷어내고, 소개를 운영 탭(벌금·봉사 현황 포함)으로 바꾸고, 스쿼드와 전술을 "명단 + 피치" 한 화면으로 합쳐 이미지로 공유하게 한다.

**Architecture:** Astro 정적 페이지 + 페이지 `<script>`의 바닐라 TS. 배치 규칙·포메이션·공유 분기는 순수 함수(`src/lib/`)로 떼어 `node --test`로 검증하고, 화면은 HTML 문자열 렌더 + 이벤트 배선. 전술판 캔버스 엔진(`pitch.ts`)은 SVG 피치 + HTML 카드로 대체한다. 백엔드·시트는 건드리지 않는다.

**Tech Stack:** Astro 7, TypeScript 6(Node가 `.ts`를 직접 import), node:test, Web Awesome `wa-dialog`, Canvas 2D(공유 이미지만).

**Spec:** `docs/superpowers/specs/2026-09-13-squad-ops-restructure-design.md`

## Global Constraints

- Node ≥ 22.18. 단위 테스트는 `tests/unit/*.test.mjs`에서 `.ts`를 **확장자 포함**해 import.
- 새 의존성 추가 금지.
- 색·크기·간격은 `src/styles/tokens.css` 변수로만. 인라인 `style`에 px를 새로 쓰지 않는다(정규 좌표 `%`는 예외).
- 내부 링크는 전부 `href()`(`src/lib/url.ts`)로 만든다 — dist 검사가 `/weekly-fc/` 접두사를 확인한다.
- `server/`, 시트 열, `src/lib/api.ts`의 정규화·직렬화 계약은 바꾸지 않는다.
- 레포가 iCloud 안이다. `git status`는 2분 넘게 멈출 수 있으니 쓰지 않는다. 커밋은 `git add <경로>`로 명시하고, `* 2.*` 같은 iCloud 충돌 사본은 절대 add 하지 않는다.
- 커밋 메시지는 기존 형식 `feat(scope): 한국어 요약`, 끝에 아래 두 줄:
  ```
  Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01DaDPzugZyKUdGnpyTH5KY4
  ```
- push 금지. 브랜치 `squad-ops-restructure`에서 커밋만 한다(push는 사용자 승인 관문).
- 화면 문구는 한국어, 짧은 명사형 라벨(기존 말투).
- `localStorage` 접근은 `try/catch`로 감싼다.
- 검증 명령: 단위 `npm run test:unit`, 전체 `npm test`(단위 + 빌드 + dist 검사). 기준선(2026-09-13, 착수 전 `main`): 전부 통과, 107페이지 빌드에 약 4분.

## File Map

| 파일 | 상태 | 책임 |
|---|---|---|
| `src/components/Redirect.astro` | 새로 | 옛 주소 → 새 주소 넘김 페이지(noindex) |
| `src/pages/rules.astro` | 새로 | 운영 탭: 규칙 + 벌금 현황 + 봉사표 |
| `src/lib/formation.ts` | 수정 | 인원별(5~11) 포메이션 슬롯, 경기장 기본값, 자동 배치 |
| `src/lib/lineup.ts` | 새로 | 라인업 상태와 배치·교환·벤치·그림·초안 복원 규칙(순수) |
| `src/lib/share.ts` | 새로 | 공유 방식 판단(순수) |
| `src/components/pitch-view.ts` | 새로 | 피치 선 SVG + 선수 카드 HTML 렌더(순수) |
| `src/components/board-draw.ts` | 새로 | 화살표·펜 SVG 렌더(순수) + 포인터 입력 배선 |
| `src/components/share-image.ts` | 새로 | 1080×1350 공유 이미지 캔버스 그리기 |
| `src/pages/squad/index.astro` | 다시 씀 | 명단 + 피치 한 화면 |
| `src/pages/index.astro` | 수정 | 봉사 두 명 타일, 링크 교체, 기록 문구 제거 |
| `src/pages/match/index.astro` | 수정 | 참석·결과·라인업·리캡 제거 |
| `src/pages/squad/[num].astro` | 수정 | 출석·승률·이력·뒷면 제거 |
| `src/layouts/Shell.astro` | 수정 | 상단 탭 4개 |
| `src/lib/stats.ts`, `src/lib/parse.ts`, `src/components/player-card.ts` | 수정 | 출석 파생 함수 제거 |
| `src/pages/about.astro`, `src/pages/record/*.astro`, `src/pages/tactics.astro` | 넘김 페이지로 교체 | |
| `src/components/condition.ts`, `recap.ts`, `lineup-svg.ts`, `pitch.ts`, `Tabs.astro`, `src/lib/pitch-coords.ts` | 삭제 | |
| `tests/build/dist.test.mjs`, `astro.config.mjs` | 수정 | 새 페이지·탭·sitemap |

---

### Task 1: 출석 기반 기능 걷어내기

**Files:**
- Create: `src/components/Redirect.astro`
- Modify: `src/lib/stats.ts`, `src/lib/parse.ts`, `src/components/player-card.ts`, `src/pages/squad/index.astro`, `src/pages/squad/[num].astro`, `src/pages/match/index.astro`, `src/pages/index.astro`, `src/styles/tokens.css`
- Replace: `src/pages/record/index.astro` (넘김 페이지)
- Delete: `src/components/condition.ts`, `src/components/recap.ts`
- Test: `tests/unit/stats.test.mjs`, `tests/unit/parse.test.mjs`

**Interfaces:**
- Consumes: 없음
- Produces: `Redirect.astro` — props `{ to: string; title: string }`, `to`는 base 없는 경로(예: `'/rules/#fees'`). Task 2·9가 쓴다.
- Produces: `playerCard(p: Player, avatarHtml?: string): string` — 세 번째 인자(back) 제거.

- [ ] **Step 1: 테스트에서 걷어낼 함수 기대를 먼저 뺀다**

`tests/unit/stats.test.mjs` 3행 import를 바꾼다:
```js
import { ovr, grade, band, STAT_CUTS, fineSummary } from '../../src/lib/stats.ts';
```
16행을 지우고(RATE_CUTS 검사), 18~49행의 `attendance`·`wins`·`seasonTable`·`condition` 테스트 6개를 통째로 지운다. `M` 헬퍼(6행)도 더 이상 안 쓰니 지운다. 남는 테스트: ovr, grade, band(STAT_CUTS만), fineSummary.

`tests/unit/parse.test.mjs` 3행 import를 바꾼다:
```js
import { parseVideoTitle, proposeMatches } from '../../src/lib/parse.ts';
```
「붙여넣기:」로 시작하는 테스트 7개(26~54행)와 `P` 헬퍼(6행)를 지운다.

- [ ] **Step 2: 단위 테스트가 아직 통과하는지 본다(빼기만 했으므로 통과해야 정상)**

Run: `npm run test:unit`
Expected: PASS (pitch-coords 포함 전부)

- [ ] **Step 3: `src/lib/stats.ts`에서 출석 파생 함수를 지운다**

5행 `RATE_CUTS`, 12~41행(`yearOf`, `seasonMatches`, `attendance`, `wins`, `ConditionLevel`, `Condition`, `condition`, `SeasonRow`, `seasonTable`)을 지운다. 2행 import에서 `Match`를 뺀다:
```ts
import { STAT_KEYS, type Fine, type FineType, type Player } from './types.ts';
```
남는 export: `STAT_CUTS`, `ovr`, `grade`, `band`, `fineSummary`.

- [ ] **Step 4: `src/lib/parse.ts`에서 붙여넣기 파서를 지운다**

36행 주석부터 파일 끝(`parseAttendance` 닫는 중괄호)까지 지운다. `STOP` 상수가 36행 위에 있으면 그것도 지운다(`grep -n "STOP" src/lib/parse.ts`로 확인, `parseAttendance` 말고 쓰는 곳이 없어야 한다). `Player` import가 남는 코드에서 안 쓰이면 import에서 뺀다.

- [ ] **Step 5: `src/components/player-card.ts`에서 뒷면을 지운다**

7~10행 import를 바꾼다:
```ts
import { esc } from '../lib/html.ts';
import { grade, ovr } from '../lib/stats.ts';
import type { Player, StatKey } from '../lib/types.ts';
```
30~31행 주석과 32행 시그니처, 51~58행을 아래로 바꾼다:
```ts
// avatarHtml: 초상을 놓을 자리 — 생략하면 초상 없이 나간다.
export function playerCard(p: Player, avatarHtml = ''): string {
```
```ts
  return `<div class="pcard pcard-${g}"><div class="pcard-body">${body}</div></div>`;
}
```
61~76행 `playerCardBack` 전체를 지운다.

- [ ] **Step 6: 컨디션·리캡 컴포넌트를 지운다**

```bash
git rm -q src/components/condition.ts src/components/recap.ts
```

- [ ] **Step 7: `src/pages/squad/index.astro`에서 컨디션·출석을 뺀다**

10행 select에서 `<option value="att">출석 순</option>`을 지운다.
22행, 27행 import를 바꾼다:
```ts
  import { ovr, band, STAT_CUTS } from '../../lib/stats.ts';
```
(27행 `conditionBadge` import 줄은 삭제)
`cols()`에서 `const matches = d.matches;`, `cond` 열, `att` 열을 지운다. 시그니처는 `function cols(): Column<Player>[]`로, 호출부 `cols(d)` → `cols()`.
`sortCards`의 `att` 키를 지우고 시그니처를 `function sortCards(rows: Player[]): Player[]`로, 호출부 `sortCards(rows, d)` → `sortCards(rows)`.
104행 `oop` 문구의 `<span class="cond cond-mid">${oop}명</span>`을 `<b>${oop}명</b>`으로 바꾼다.
(이 페이지는 Task 6에서 다시 쓰므로 여기서는 빌드가 통과할 만큼만 고친다.)

- [ ] **Step 8: `src/pages/squad/[num].astro`에서 출석·승률·이력·뒷면을 뺀다**

22행, 24행 import를 바꾼다:
```ts
  import { band, STAT_CUTS } from '../../lib/stats.ts';
```
```ts
  import { playerCard, STAT_KO, STAT_LABEL } from '../../components/player-card.ts';
```
21행에서 `fmtDate`를 뺀다(벌금 내역 표가 `fmtDate`를 쓰면 남긴다 — 67행이 쓰므로 **남긴다**).
46~47행(`my`, `a`, `w`)을 지운다.
55행을 `${playerCard(p, avatarHtml)}`로 바꾼다.
58~59행(출석·승률 카드)을 지운다.
66행(참여 이력 카드)을 지운다.
69~73행(카드 뒤집기 리스너)을 지운다.
79~80행(`attEl` 카운트업)을 지운다. 74~76행 주석의 "OVR·출석률·정산" → "OVR·정산"으로 고친다.

- [ ] **Step 9: `src/pages/match/index.astro`에서 참석·결과·라인업·리캡을 뺀다**

8~9행 `att-modal`, `res-modal` 대화상자를 지운다.
14~17행 import를 바꾼다:
```ts
  import { proposeMatches } from '../../lib/parse.ts';
  import { esc, fmtDate, ytThumb, ytEmbed, toast, seoulToday } from '../../lib/html.ts';
```
(`lineup-svg`, `recap`, `condition` import 줄 삭제. 18행 html import는 그대로 두고 중복 줄을 만들지 않는다.)
20행 `Team` import를 뺀다: `import type { Data, Match } from '../../lib/types.ts';`
29행 `let tab …`, 32행 `const result …`를 지운다.
47행 썸네일 문구에서 ` · ${m.attendees.length}명`을 지운다.
51~52행 목록 표를 아래로 바꾼다(결과·참석 열 제거):
```ts
    app.innerHTML = years.map((y, i) => `<details class="year" ${i === 0 ? 'open' : ''}><summary>${y} <span class="muted">${d.matches.filter((m) => m.date.startsWith(y)).length}경기</span></summary><div class="tbl-wrap"><table class="tbl"><thead><tr><th>날짜</th><th>장소</th><th>유형</th><th class="c">영상</th></tr></thead><tbody>
      ${d.matches.filter((m) => m.date.startsWith(y)).map((m) => `<tr><td><a href="${link(m)}"><b>${fmtDate(m.date)}</b></a></td><td>${esc(m.location) || '<span class="muted">–</span>'}</td><td>${esc(m.type) || '<span class="muted">–</span>'}</td><td class="c">${m.youtube ? '▶' : ''}</td></tr>`).join('')}</tbody></table></div></details>`).join('');
```
60~77행 `renderDetail` 본문 뒤쪽을 아래로 바꾼다(59행 제목 설정 다음부터 함수 끝까지):
```ts
    $('actions').innerHTML = `<button id="back">← 목록</button>${isAdmin() ? '<button id="meta">정보</button>' : ''}`;
    $('back').onclick = () => { location.href = href('/match/'); };
    if (isAdmin()) $('meta').onclick = () => openMeta(m);
    app.innerHTML = `<div class="cards"><div class="card"><h2>정보</h2><p>${esc(m.type) || '–'} · ${esc(m.location) || '장소 없음'}</p></div></div>${m.youtube ? `<div class="embed"><iframe src="${ytEmbed(m.youtube)}" title="매치 영상" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>` : ''}`;
  }
```
97~132행 `openAtt`, `openRes` 두 함수를 지운다.
153행 `wfcRecap` 등록 줄을 지운다.

- [ ] **Step 10: `src/pages/index.astro` 최근 매치에서 결과·참석 문구를 뺀다**

40행, 43행, 48행을 바꾼다:
```ts
    const title = esc(m?.type || fromVideo?.type || '') || '매치';
```
(43행 `const who …` 삭제)
```ts
      <p class="art-sub">${date ? fmtDate(date) : '날짜 미정'}${where ? ` · ${esc(where)}` : ''}</p>
```

- [ ] **Step 11: 넘김 컴포넌트를 만들고 기록 시즌 페이지를 넘김으로 바꾼다**

Create `src/components/Redirect.astro`:
```astro
---
// src/components/Redirect.astro — 옛 주소를 새 주소로 넘긴다. 카톡에 공유된 옛 링크를 살리려고 둔다.
import { href } from '../lib/url';
interface Props { to: string; title: string }
const { to, title } = Astro.props;
const url = href(to);
---
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex" />
  <meta http-equiv="refresh" content={`0; url=${url}`} />
  <title>{title} · WEEKLY FC</title>
</head>
<body>
  <p><a href={url}>{title}(으)로 이동</a></p>
</body>
</html>
```
Replace `src/pages/record/index.astro` 전체:
```astro
---
import Redirect from '../../components/Redirect.astro';
---
<Redirect to="/rules/#fees" title="운영 규칙" />
```

- [ ] **Step 12: 걷어낸 화면의 CSS를 지운다**

`src/styles/tokens.css`에서 지운다:
- 331~342행: `.pcard-flip` ~ `.pcard-recent`
- 243~244행: `.att-preview`, `.res-chips`
- 242행의 `.w-tname { … } .w-points { … }` 두 규칙(같은 줄의 `.w-search`, `.w-sort`는 남긴다)
- 410~411행: `.recap-img`, `.recap-dl`

`.cond*`(214~216행)는 Task 9에서 지운다(전술판이 아직 쓸 수 있음).

- [ ] **Step 13: 남은 참조가 없는지 확인한다**

Run: `grep -rnE "attendance|wins\(|condition|conditionBadge|playerCardBack|parseAttendance|seasonTable|RATE_CUTS|mountRecap|lineupSvg" src`
Expected: `src/pages/tactics.astro`, `src/components/pitch.ts`, `src/components/lineup-svg.ts`의 `lineupSvg`/`PitchState` 관련 줄 말고는 없음. 다른 파일이 나오면 그 줄을 이 태스크의 방식대로 정리한다.

- [ ] **Step 14: 전체 테스트**

Run: `npm test`
Expected: 단위 PASS, `astro build` 성공, dist 검사 PASS(탭·페이지 목록은 아직 옛 구조라 그대로 통과).

- [ ] **Step 15: Commit**

```bash
git add tests/unit/stats.test.mjs tests/unit/parse.test.mjs src/lib/stats.ts src/lib/parse.ts src/components/player-card.ts src/components/Redirect.astro src/pages/squad/index.astro "src/pages/squad/[num].astro" src/pages/match/index.astro src/pages/index.astro src/pages/record/index.astro src/styles/tokens.css
git commit -m "refactor: 출석 기반 기능 걷어내기 — 컨디션·출석률·승률·참석·결과·리캡

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DaDPzugZyKUdGnpyTH5KY4"
```
(`git rm`한 두 파일은 Step 6에서 이미 스테이징됨)

### Task 2: 운영 탭 `/rules/` — 규칙 + 벌금 현황 + 봉사표, 탭 4개

**Files:**
- Create: `src/pages/rules.astro`
- Replace: `src/pages/about.astro`, `src/pages/record/fines.astro`, `src/pages/record/duty.astro` (넘김 페이지)
- Delete: `src/components/Tabs.astro`
- Modify: `src/layouts/Shell.astro:8-15`, `src/pages/tactics.astro:4`, `astro.config.mjs`, `src/styles/tokens.css`
- Test: `tests/build/dist.test.mjs`

**Interfaces:**
- Consumes: `Redirect.astro` (Task 1)
- Produces: 앵커 `/rules/#fees`, `/rules/#duty` — Task 3 홈 타일이 링크한다.

- [ ] **Step 1: dist 검사를 새 구조로 먼저 고친다**

`tests/build/dist.test.mjs` 6~18행과 37~45행을 아래로 바꾼다:
```js
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
export const INDEXABLE = ['rules/index.html'];
```
```js
test('상단 탭은 홈·스쿼드·매치·운영 네 갈래', () => {
  const html = read('index.html');
  for (const l of ['홈', '스쿼드', '매치', '운영']) assert.ok(html.includes(`<span>${l}</span>`), l);
  for (const l of ['기록', '전술', '소개']) assert.ok(!html.includes(`<span>${l}</span>`), `남은 탭: ${l}`);
});
test('sitemap에는 rules만', () => {
  const sm = readFileSync('dist/sitemap-0.xml', 'utf8');
  const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).sort();
  assert.deepEqual(locs, ['https://byjunyoung.github.io/weekly-fc/rules/']);
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
```
24행 테스트 이름도 `'팀 페이지는 noindex, 운영 규칙만 index'`로 바꾼다.

- [ ] **Step 2: 실패 확인**

Run: `npm run build && npm run test:build`
Expected: FAIL — `rules/index.html` 없음, 탭 「운영」 없음, sitemap 불일치, 넘김 불일치.

- [ ] **Step 3: `src/pages/rules.astro`를 만든다**

```astro
---
import Shell from '../layouts/Shell.astro';
import { FINE_TYPES, FINE_AMOUNT, FINE_NOTE, FINE_EXEMPT, MATCH_TIME, MATCH_MIN, PLACES, BANK, LINKS, DUTY_PER_MONTH } from '../lib/rules.ts';
const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;
const toc = [['when', '언제 어디서'], ['join', '참여 방법'], ['fees', '비용·벌금'], ['duty', '봉사'], ['bank', '모임 통장'], ['manner', '에티켓']];
---
<Shell title="운영 규칙" index={true} description="WEEKLY FC 운영 규칙 — 매주 토요일 풋살. 참여 방법·비용·벌금·봉사·모임 통장.">
  <Fragment slot="head"><link rel="canonical" href="https://byjunyoung.github.io/weekly-fc/rules/" /></Fragment>
  <div class="page-head"><h1>운영 규칙</h1><div class="actions"><a class="chip" href={LINKS.kakao} target="_blank" rel="noopener">오픈카톡 →</a></div></div>
  <nav class="tabs">{toc.map(([id, l]) => <a href={`#${id}`}>{l}</a>)}</nav>
  <article class="prose stack">
    <section id="when"><h2>언제 어디서</h2><ul><li>매주 카톡 투표, {MATCH_MIN}인 이상 모이면 진행</li><li>시간: {MATCH_TIME}</li><li>장소: {PLACES.join(' / ')}</li><li>대관 실패 시 일정·장소를 유연하게 조정</li><li>비가 오면 논의 후 진행 여부 결정</li></ul></section>
    <section id="join"><h2>참여 방법</h2><ol><li>오픈카톡에 자기소개를 남기고 모임 통장 초대 받기</li><li>매주 카톡 투표로 참석 여부 표시</li><li>매치 참석 후 당일 정산(대관비·음료비)</li></ol><p class="label">자기소개 양식 (채팅방에 붙여넣기)</p><pre class="card rules-pre">이름 :
연락처 :
선호 포지션 (축구 기준) :
주발 :
나이 (OO년생) :</pre></section>
    <section id="fees"><h2>비용 · 벌금</h2>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>유형</th><th>기준</th><th class="r">금액</th></tr></thead><tbody>{FINE_TYPES.map((t) => <tr><td>{t}</td><td>{FINE_NOTE[t]}</td><td class="r">{won(FINE_AMOUNT[t])}</td></tr>)}</tbody></table></div>
      <p class="muted">{FINE_EXEMPT}</p>
      <ul><li>대관비·음료비는 참석자(용병 포함) 정산</li><li>벌금은 당일 구장비·음료비 정산에 우선 사용</li><li>잔액은 모임 통장 공금 → 대관비 선납·공용 물품</li></ul>
      <div class="rules-live">
        <div class="row rules-live-head"><span class="label">미납 현황 <span id="fees-total"></span></span><span id="fees-actions"></span></div>
        <div id="fees-unpaid" class="chips"></div>
        <span class="label">내역</span>
        <div id="fees-app" class="tbl-wrap"></div>
      </div>
    </section>
    <section id="duty"><h2>봉사</h2>
      <ul><li>대관비·음료비 선납</li><li>음료 구매, 조끼 대여·반납</li><li>매치 종료 후 채팅방에서 정산 진행</li><li>매월 {DUTY_PER_MONTH}명 로테이션</li></ul>
      <div class="rules-live">
        <div class="row rules-live-head"><span class="label">봉사표</span><div class="chips" id="duty-year"></div></div>
        <div id="duty-app" class="tbl-wrap"></div>
      </div>
    </section>
    <section id="bank"><h2>모임 통장</h2><p>{BANK.name} {BANK.number} ({BANK.holder})<br/>모임 시작일 {BANK.since} · 통장 초대 문의: {BANK.contact}</p></section>
    <section id="manner"><h2>에티켓</h2><ul><li>투표에 꼭 참여하기</li><li>불참 등 특이사항은 사전에 공유</li><li>서로 존중하는 채팅</li></ul></section>
  </article>
  <wa-dialog id="fine-modal" label="벌금 기록" with-footer><form class="form" id="fine-form"></form><div slot="footer" class="foot"><button data-close="fine-modal">취소</button><button class="primary" id="fine-ok">저장</button></div></wa-dialog>
</Shell>
<script>
  import { onData, isAdmin, write, serializeFine, serializeRotation } from '../lib/api.ts';
  import { href } from '../lib/url.ts';
  import { esc, fmtDate, fmtWon, toast, seoulToday } from '../lib/html.ts';
  import { fineSummary } from '../lib/stats.ts';
  import { FINE_TYPES, FINE_AMOUNT } from '../lib/rules.ts';
  import { yearRows } from '../lib/rotation.ts';
  import { mountTable, type Column, type TableState } from '../components/table.ts';
  import type { Data, Fine, RotationRow } from '../lib/types.ts';

  const $ = (id: string) => document.getElementById(id) as HTMLElement;
  const dlg = (id: string) => document.getElementById(id) as HTMLElement & { open: boolean };
  let data: Data | null = null;
  const fineState: TableState = { sortKey: 'date', sortDir: 'desc' };
  const now = new Date();
  let year = now.getFullYear();
  document.querySelectorAll<HTMLElement>('[data-close]').forEach((b) => (b.onclick = () => (dlg(b.dataset.close!).open = false)));

  // ── 벌금 — record/fines.astro 에서 옮겨 왔다. 요약 카드 대신 미납 합계 한 줄. ──
  function renderFees(d: Data) {
    const s = fineSummary(d.fines);
    $('fees-total').textContent = `· ${fmtWon(s.unpaid)} (${s.unpaidCount}건)`;
    $('fees-actions').innerHTML = isAdmin() ? '<button id="fees-add">벌금 추가</button>' : '';
    if (isAdmin()) $('fees-add').onclick = openAdd;
    const unpaid = [...s.byPlayer].filter(([, v]) => v.unpaid > 0).sort((a, b) => b[1].unpaid - a[1].unpaid);
    $('fees-unpaid').innerHTML = unpaid.length
      ? unpaid.map(([name, v]) => { const p = d.players.find((x) => x.name === name); const body = `${esc(name)} <b class="warn">${fmtWon(v.unpaid)}</b>`; return p ? `<a class="chip" href="${href(`/squad/${p.num}/`)}">${body}</a>` : `<span class="chip">${body}</span>`; }).join('')
      : '<span class="muted">미납 없음</span>';
    const cols: Column<Fine>[] = [
      { key: 'date', label: '날짜', get: (f) => f.date, cell: (f) => fmtDate(f.date) },
      { key: 'player', label: '이름', get: (f) => f.player, cell: (f) => { const p = d.players.find((x) => x.name === f.player); return p ? `<a href="${href(`/squad/${p.num}/`)}">${esc(f.player)}</a>` : esc(f.player); } },
      { key: 'type', label: '유형', get: (f) => f.type },
      { key: 'amount', label: '금액', get: (f) => f.amount, align: 'r', cell: (f) => fmtWon(f.amount) },
      { key: 'paid', label: '납부', get: (f) => (f.paid ? 1 : 0), cell: (f) => (isAdmin() ? `<button data-paid="${f.id}" class="${f.paid ? '' : 'primary'}">${f.paid ? '완료' : '납부 처리'}</button>` : f.paid ? '완료' : '<span class="warn">미납</span>') },
      ...(isAdmin() ? [{ key: 'del', label: '', get: () => '', sortable: false, cell: (f: Fine) => `<button data-del="${f.id}" class="danger">삭제</button>` } as Column<Fine>] : []),
    ];
    mountTable($('fees-app'), cols, d.fines, fineState, { empty: '벌금 기록이 없습니다' });
    $('fees-app').querySelectorAll<HTMLElement>('[data-paid]').forEach((b) => (b.onclick = async () => { const f = d.fines.find((x) => x.id === b.dataset.paid)!; try { await write('writeFine', serializeFine({ ...f, paid: !f.paid })); } catch (e) { toast((e as Error).message); } }));
    $('fees-app').querySelectorAll<HTMLElement>('[data-del]').forEach((b) => (b.onclick = async () => { try { await write('deleteFine', { id: b.dataset.del }); } catch (e) { toast((e as Error).message); } }));
  }
  function openAdd() {
    ($('fine-form') as HTMLFormElement).innerHTML = `<label>날짜<input name="date" type="date" value="${seoulToday()}"></label><label>이름<select name="player">${data!.players.map((p) => `<option value="${esc(p.name)}">${esc(p.name)}</option>`).join('')}</select></label><label>유형<select name="type" id="fine-type">${FINE_TYPES.map((t) => `<option>${t}</option>`).join('')}</select></label><label>금액<input name="amount" id="fine-amt" type="number" value="${FINE_AMOUNT.지각}"></label>`;
    ($('fine-type') as HTMLSelectElement).onchange = (e) => { ($('fine-amt') as HTMLInputElement).value = String(FINE_AMOUNT[(e.target as HTMLSelectElement).value as keyof typeof FINE_AMOUNT]); };
    $('fine-ok').onclick = async () => { const fd = new FormData($('fine-form') as HTMLFormElement); const g = (k: string) => String(fd.get(k) ?? ''); try { await write('writeFine', serializeFine({ id: String(Date.now()), date: g('date'), match_id: '', player: g('player'), type: g('type') as Fine['type'], amount: Number(g('amount')) || 0, paid: false })); dlg('fine-modal').open = false; toast('저장됨'); } catch (e) { toast((e as Error).message); } };
    dlg('fine-modal').open = true;
  }

  // ── 봉사 — record/duty.astro 에서 옮겨 왔다. 두 명은 대등하므로 한 칸에 나란히 둔다. ──
  function renderDuty(d: Data) {
    $('duty-year').innerHTML = [year - 1, year, year + 1].map((y) => `<button class="chip ${y === year ? 'on' : ''}" data-y="${y}" aria-pressed="${y === year}">${y}</button>`).join('');
    $('duty-year').querySelectorAll<HTMLElement>('[data-y]').forEach((b) => (b.onclick = () => { year = Number(b.dataset.y); renderDuty(d); }));
    const rows = yearRows(d.players, d.rotation, year);
    const names = d.players.map((p) => p.name);
    const pick = (r: RotationRow, k: 'p1' | 'p2') => {
      const val = r[k];
      // 시트 값이 현재 명단에 없으면(퇴단 등) 브라우저가 첫 옵션을 대신 보여준다 — 저장된 값을 앞에 끼워 넣는다.
      const extra = val && !names.includes(val) ? `<option selected>${esc(val)}</option>` : '';
      return `<select data-y="${r.year}" data-m="${r.month}" data-k="${k}">${extra}${names.map((n) => `<option ${n === val ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>`;
    };
    const pair = (r: RotationRow) => isAdmin() ? `<span class="duty-pair">${pick(r, 'p1')}${pick(r, 'p2')}</span>` : `<span class="duty-pair"><b>${esc(r.p1)}</b><b>${esc(r.p2)}</b></span>`;
    $('duty-app').innerHTML = `<table class="tbl"><thead><tr><th>월</th><th>당번</th><th class="c">완료</th></tr></thead><tbody>${rows.map((r) => { const cur = r.year === now.getFullYear() && r.month === now.getMonth() + 1; return `<tr class="${cur ? 'row-current' : ''}"><td>${r.month}월${cur ? ' <span class="label">이번 달</span>' : ''}</td><td>${pair(r)}</td><td class="c">${isAdmin() ? `<input type="checkbox" data-y="${r.year}" data-m="${r.month}" data-k="done" ${r.done ? 'checked' : ''}>` : r.done ? '✓' : ''}</td></tr>`; }).join('')}</tbody></table>`;
    $('duty-app').querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-k]').forEach((el) => (el.onchange = async () => {
      const y = Number(el.dataset.y), m = Number(el.dataset.m);
      const r = yearRows(d.players, d.rotation, y).find((x) => x.month === m)!;
      const next: RotationRow = { ...r, [el.dataset.k!]: el.dataset.k === 'done' ? (el as HTMLInputElement).checked : el.value } as RotationRow;
      try { await write('writeRotation', serializeRotation(next)); toast('저장됨'); } catch (e) { toast((e as Error).message); }
    }));
  }

  const render = () => { if (!data) return; renderFees(data); renderDuty(data); };
  window.addEventListener('wfc:admin', render);
  onData((d) => { data = d; render(); });
</script>
<style>
  /* 한글 본문 — 한 줄 길이는 WCAG 1.4.8 의 CJK 40자 상한(--prose-max 600px ÷ 15px),
     행간은 klreq 7.4.1 의 비례 줄간격 예시 160%. w3.org/TR/WCAG22 · w3.org/TR/klreq */
  .prose section { max-width: var(--prose-max); }
  .prose p, .prose li { line-height: 1.6; }
  .prose h2 { font-size: var(--fs-sm); letter-spacing: .06em; text-transform: uppercase; margin: 0 0 var(--m-md); }
  .prose h2::after { content: ""; display: block; width: var(--w-accent); height: var(--h-accent); background: var(--accent); margin-top: var(--m-sm); }
  .prose ul, .prose ol { padding-left: 1.2em; margin: 0; }
  .prose li { margin-bottom: var(--m-xs); }
  .prose p { margin: 0 0 var(--m-md); }
  .rules-pre { white-space: pre-wrap; margin: 0; }
</style>
```
벌금 추가 폼에서 「매치 (선택)」 칸은 뺐다 — 매치 기록을 안 쓰기로 했다(`match_id`는 빈 값으로 저장, 시트 열은 그대로).

- [ ] **Step 4: 페이지가 스크립트로 채우는 요소의 CSS를 전역에 둔다**

스코프 `<style>`은 `innerHTML`로 그린 요소에 안 걸리므로 `src/styles/tokens.css`의 「능력치 막대」 절 앞(359행 위)에 추가한다:
```css
/* ══ 운영 규칙 ══════════════════════════════════════════════ */
.rules-live { display: flex; flex-direction: column; gap: var(--s-sm); margin-top: var(--s-lg); }
.rules-live-head { justify-content: space-between; }
.duty-pair { display: inline-flex; flex-wrap: wrap; gap: var(--s-xs) var(--s-md); }
.duty-pair b { min-width: 4em; font-weight: var(--fw-strong); }
```

- [ ] **Step 5: 옛 페이지를 넘김으로 바꾸고 탭 컴포넌트를 지운다**

Replace `src/pages/about.astro` 전체:
```astro
---
import Redirect from '../components/Redirect.astro';
---
<Redirect to="/rules/" title="운영 규칙" />
```
Replace `src/pages/record/fines.astro` 전체:
```astro
---
import Redirect from '../../components/Redirect.astro';
---
<Redirect to="/rules/#fees" title="운영 규칙" />
```
Replace `src/pages/record/duty.astro` 전체:
```astro
---
import Redirect from '../../components/Redirect.astro';
---
<Redirect to="/rules/#duty" title="운영 규칙" />
```
```bash
git rm -q src/components/Tabs.astro
```

- [ ] **Step 6: 상단 탭·색인·sitemap을 바꾼다**

`src/layouts/Shell.astro` 8~15행:
```ts
const nav = [
  { href: href('/'), label: '홈' },
  { href: href('/squad/'), label: '스쿼드' },
  { href: href('/match/'), label: '매치' },
  { href: href('/rules/'), label: '운영' },
];
```
`src/pages/tactics.astro` 4행에서 `index={true}`를 지운다(Task 9에서 넘김 페이지가 되기 전까지 noindex).
`astro.config.mjs`의 sitemap 필터:
```js
  integrations: [sitemap({ filter: (page) => /\/weekly-fc\/rules\/$/.test(page) })],
```

- [ ] **Step 7: 통과 확인**

Run: `npm test`
Expected: PASS 전부.

- [ ] **Step 8: 관리자 쓰기를 실제 시트로 확인한다**

Run: `npm run dev` (백그라운드) → 브라우저로 `http://localhost:4321/weekly-fc/rules/` 열기.
사용자에게 관리자 PIN 입력을 부탁한다(PIN은 에이전트가 입력하지 않는다). 그다음 확인:
1. 「벌금 추가」 → 저장 → 내역 표에 행이 생김 → 「납부 처리」 → 「완료」로 바뀜 → 「삭제」로 지움(시험 행을 남기지 않는다).
2. 봉사표 이번 달 행 당번 select를 바꿨다가 원래 이름으로 되돌림 → 둘 다 토스트 「저장됨」.
Expected: 네 번의 쓰기 모두 성공, 시트에 시험 흔적 없음.

- [ ] **Step 9: Commit**

```bash
git add tests/build/dist.test.mjs src/pages/rules.astro src/pages/about.astro src/pages/record/fines.astro src/pages/record/duty.astro src/layouts/Shell.astro src/pages/tactics.astro astro.config.mjs src/styles/tokens.css
git commit -m "feat(rules): 운영 탭 — 규칙 섹션에 벌금 현황·봉사표, 상단 탭 4개, 옛 주소 넘김

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DaDPzugZyKUdGnpyTH5KY4"
```

### Task 3: 홈 — 봉사 두 명 나란히, 링크 교체

**Files:**
- Modify: `src/pages/index.astro:25-32, 79-83`, `src/styles/tokens.css:291`

**Interfaces:**
- Consumes: `/rules/#fees`, `/rules/#duty` (Task 2)
- Produces: 없음

- [ ] **Step 1: 두 명용 타일 함수를 추가한다**

`src/pages/index.astro` 32행(`tile` 함수 닫는 중괄호) 다음에 추가:
```ts

  /** 봉사 타일 — 두 명은 대등하다. 한 명을 큰 값, 한 명을 보조 줄에 두면 위계가 생긴다. */
  function duoTile(label: string, a: string, b: string, sub: string, to: string): string {
    return `<a class="tile" href="${to}"><span class="tile-label">${esc(label)}</span><span class="tile-duo"><b>${esc(a)}</b><b>${esc(b)}</b></span><span class="tile-sub">${sub}</span></a>`;
  }
```

- [ ] **Step 2: 타일 네 개를 바꾼다**

80~83행을 아래로 바꾼다:
```ts
        ${tile('라인업', '짜서 공유', '명단에서 골라 이미지로', href('/squad/'))}
        ${duoTile(`${monthLabel(y, mo)} 봉사`, duty.p1, duty.p2, duty.done ? '완료' : '대관비·조끼·정산', href('/rules/#duty'))}
        ${duoTile('다음 봉사', dutyNext.p1, dutyNext.p2, monthLabel(nm.y, nm.mo), href('/rules/#duty'))}
        ${tile('미납 벌금', fmtWon(fs.unpaid), `${fs.unpaidCount}건 · 내역 보기`, href('/rules/#fees'))}
```

- [ ] **Step 3: 두 이름 CSS**

`src/styles/tokens.css` 291행(`.tile-sub`) 다음에 추가:
```css
/* 봉사 두 명 — 같은 크기로 나란히. 좁은 타일에서는 줄바꿈해도 크기는 같다. */
.tile-duo { display: flex; flex-wrap: wrap; gap: 0 var(--s-sm); margin-top: auto; font-size: var(--fs-h-lg); font-weight: var(--fw-num); line-height: 1.25; }
```

- [ ] **Step 4: 빌드와 화면 확인**

Run: `npm test`
Expected: PASS

Run (백그라운드): `npm run preview`
Run:
```bash
S=/private/tmp/claude-501/-Users-junyoungkim/707543c0-f7f4-4fed-b000-a90da8893c64/scratchpad/shots
C="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
"$C" --headless=new --disable-gpu --hide-scrollbars --window-size=1280,1400 --virtual-time-budget=12000 --screenshot=$S/t3-home-d.png http://localhost:4321/weekly-fc/
"$C" --headless=new --disable-gpu --hide-scrollbars --window-size=390,1800 --virtual-time-budget=12000 --screenshot=$S/t3-home-m.png http://localhost:4321/weekly-fc/
```
Expected: 두 스크린샷 모두 봉사 타일 두 개에서 두 이름이 같은 크기, 상태 문구는 아래 한 줄. 390px에서 이름이 타일 밖으로 넘치지 않음. 확인 뒤 preview 프로세스를 끈다.

- [ ] **Step 5: Commit**

```bash
git add src/pages/index.astro src/styles/tokens.css
git commit -m "fix(home): 봉사 두 명을 같은 위계로 나란히 · 운영 탭 링크

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DaDPzugZyKUdGnpyTH5KY4"
```

---

### Task 4: 포메이션 통합 — 인원 5~11

**Files:**
- Modify: `src/lib/formation.ts`
- Test: `tests/unit/formation.test.mjs`

**Interfaces:**
- Consumes: 없음
- Produces (Task 5·6·8이 쓴다):
  - `type PitchKind = 'futsal' | 'soccer'`
  - `MIN_COUNT = 5`, `MAX_COUNT = 11`
  - `SHAPES: Record<number, string[]>` — 인원 → 모양 목록(첫 항목이 기본)
  - `clampCount(n: number): number` — 5~11로 자름, 숫자가 아니면 11
  - `slotsFor(count: number, shape: string): Slot[]` — 길이 = count, `[0]`은 GK, 없는 모양이면 그 인원의 첫 모양
  - `defaultPitch(count: number): PitchKind` — 7 이하 futsal
  - 기존 `Slot`, `FORMATIONS`, `FORMATION_NAMES`, `bestEleven(players, slots)` 유지

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/unit/formation.test.mjs` 3행 import를 바꾸고 파일 끝에 테스트를 더한다:
```js
import { FORMATIONS, FORMATION_NAMES, bestEleven, SHAPES, slotsFor, defaultPitch, clampCount, MIN_COUNT, MAX_COUNT } from '../../src/lib/formation.ts';
```
```js
test('인원 5~11의 모든 모양: 자리 수 = 인원, 첫 자리 GK 하나, 좌표 0~1, 라벨 있음', () => {
  for (let n = MIN_COUNT; n <= MAX_COUNT; n++) {
    assert.ok(SHAPES[n]?.length > 0, `${n}인 모양 없음`);
    for (const shape of SHAPES[n]) {
      const s = slotsFor(n, shape);
      const tag = `${n}인 ${shape}`;
      assert.equal(s.length, n, tag);
      assert.equal(s[0].group, 'GK', tag);
      assert.equal(s.filter((x) => x.group === 'GK').length, 1, tag);
      for (const x of s) {
        assert.ok(x.x >= 0 && x.x <= 1 && x.y >= 0 && x.y <= 1, `${tag} ${x.label} 좌표`);
        assert.ok(x.label, `${tag} 라벨`);
      }
    }
  }
});

test('모양의 줄 인원 합은 인원 - 1(GK 제외)', () => {
  for (let n = MIN_COUNT; n <= MAX_COUNT; n++) {
    for (const shape of SHAPES[n]) assert.equal(shape.split('-').map(Number).reduce((a, b) => a + b, 0), n - 1, `${n} ${shape}`);
  }
});

test('줄이 둘이면 DF·FW, 셋이면 DF·MF·FW', () => {
  assert.deepEqual([...new Set(slotsFor(5, '2-2').slice(1).map((s) => s.group))], ['DF', 'FW']);
  assert.deepEqual([...new Set(slotsFor(6, '2-2-1').slice(1).map((s) => s.group))], ['DF', 'MF', 'FW']);
});

test('같은 줄은 왼쪽부터 놓이고 수비가 공격보다 우리 골대 쪽', () => {
  const s = slotsFor(8, '3-3-1');
  const df = s.filter((x) => x.group === 'DF');
  assert.deepEqual(df.map((x) => x.label), ['LB', 'CB', 'RB']);
  assert.ok(df[0].x < df[1].x && df[1].x < df[2].x);
  assert.ok(df[0].y > s.find((x) => x.group === 'FW').y);
});

test('11인은 손으로 맞춘 배치를 그대로 쓴다', () => {
  assert.equal(slotsFor(11, '4-3-3'), FORMATIONS['4-3-3']);
});

test('그 인원에 없는 모양이면 첫 모양으로', () => {
  assert.deepEqual(slotsFor(6, '4-4-2'), slotsFor(6, '2-2-1'));
});

test('인원은 5~11로 자르고 숫자가 아니면 11', () => {
  assert.equal(clampCount(3), 5);
  assert.equal(clampCount(14), 11);
  assert.equal(clampCount(Number.NaN), 11);
});

test('경기장 기본값: 7명 이하 풋살, 8명 이상 축구', () => {
  assert.equal(defaultPitch(7), 'futsal');
  assert.equal(defaultPitch(8), 'soccer');
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/unit/formation.test.mjs`
Expected: FAIL — `SHAPES`/`slotsFor` 등이 export 되지 않음(SyntaxError: does not provide an export named 'SHAPES').

- [ ] **Step 3: 구현**

`src/lib/formation.ts` 1~10행(머리 주석 ~ `export const FORMATIONS: Record<string, Slot[]> = {`)을 아래로 바꾼다:
```ts
// src/lib/formation.ts — 인원별 포메이션 슬롯과 자동 배치.
// 좌표는 0~1, 세로 피치 기준이고 y=0 이 상대 골대, y=1 이 우리 골대다.
// 전에는 이 파일(11인 4종)과 pitch.ts(CURATED 5·7·11인)에 목록이 흩어져 있었다 — 여기 하나로 합친다.
import { ovr } from './stats.ts';
import type { Player, Pos } from './types.ts';

export type Slot = { label: string; group: Pos; x: number; y: number };
export type PitchKind = 'futsal' | 'soccer';
export const MIN_COUNT = 5;
export const MAX_COUNT = 11;

/** 인원(GK 포함) → 고를 수 있는 모양. 모양은 GK 를 뺀 줄별 인원이고 첫 항목이 기본이다.
 *  6·8인은 플랩에서 흔해 새로 넣었다. */
export const SHAPES: Record<number, string[]> = {
  5: ['1-2-1', '2-2', '3-1', '1-3'],
  6: ['2-2-1', '2-1-2', '3-1-1'],
  7: ['2-3-1', '3-2-1', '2-2-2'],
  8: ['3-3-1', '3-2-2', '2-3-2'],
  9: ['3-3-2', '3-4-1'],
  10: ['4-3-2', '3-4-2'],
  11: ['4-3-3', '4-4-2', '4-2-3-1', '3-5-2'],
};

/** 11인은 손으로 맞춘 배치 — 슬롯 라벨 → 어느 포지션 무리에서 뽑을지. 라벨은 축구 표기를 그대로 쓰고,
 *  명단의 pos 는 GK·DF·MF·FW 네 가지뿐이라 여기서 한 번 접는다. */
export const FORMATIONS: Record<string, Slot[]> = {
```
72행(`bestEleven` 닫는 중괄호) 다음, 파일 끝에 추가:
```ts

// ── 5~10인: 모양 문자열에서 슬롯을 만든다 ─────────────────────────────
const ROW_GROUPS: Record<number, Pos[]> = { 2: ['DF', 'FW'], 3: ['DF', 'MF', 'FW'], 4: ['DF', 'MF', 'MF', 'FW'] };
/** 무리별, 줄 인원별 라벨(왼쪽 → 오른쪽). */
const ROW_LABELS: Record<Exclude<Pos, 'GK'>, string[][]> = {
  DF: [[], ['CB'], ['CB', 'CB'], ['LB', 'CB', 'RB'], ['LB', 'CB', 'CB', 'RB'], ['LWB', 'CB', 'CB', 'CB', 'RWB']],
  MF: [[], ['CM'], ['CM', 'CM'], ['LM', 'CM', 'RM'], ['LM', 'CM', 'CM', 'RM'], ['LM', 'CM', 'CM', 'CM', 'RM']],
  FW: [[], ['ST'], ['ST', 'ST'], ['LW', 'ST', 'RW']],
};
/** 줄 인원별 좌우 여백 — 인원이 적을수록 가운데로 모은다. */
const ROW_MARGIN = [0, 0.5, 0.3, 0.18, 0.14, 0.1];
const r2 = (v: number) => Math.round(v * 100) / 100;

function generate(shape: string): Slot[] {
  const rows = shape.split('-').map(Number);
  const groups = ROW_GROUPS[rows.length];
  const slots: Slot[] = [{ label: 'GK', group: 'GK', x: 0.5, y: 0.92 }];
  rows.forEach((k, r) => {
    const group = groups[r] as Exclude<Pos, 'GK'>;
    const y = 0.75 - (0.53 * r) / (rows.length - 1);
    const m = ROW_MARGIN[k];
    for (let i = 0; i < k; i++) {
      const x = k === 1 ? 0.5 : m + ((1 - 2 * m) * i) / (k - 1);
      slots.push({ label: ROW_LABELS[group][k][i], group, x: r2(x), y: r2(y) });
    }
  });
  return slots;
}

export function clampCount(n: number): number {
  const v = Math.round(n);
  return Number.isFinite(v) ? Math.min(MAX_COUNT, Math.max(MIN_COUNT, v)) : MAX_COUNT;
}

export function slotsFor(count: number, shape: string): Slot[] {
  const n = clampCount(count);
  const key = SHAPES[n].includes(shape) ? shape : SHAPES[n][0];
  return n === 11 ? FORMATIONS[key] : generate(key);
}

/** 7명 이하는 풋살장이 기본 — 사용자가 토글로 바꿀 수 있다. */
export const defaultPitch = (count: number): 'futsal' | 'soccer' => (clampCount(count) <= 7 ? 'futsal' : 'soccer');
```

- [ ] **Step 4: 통과 확인**

Run: `npm run test:unit`
Expected: PASS 전부(기존 bestEleven 테스트 포함).

- [ ] **Step 5: Commit**

```bash
git add src/lib/formation.ts tests/unit/formation.test.mjs
git commit -m "feat(formation): 인원 5~11 포메이션을 한 목록으로 — 6·8인 추가, 경기장 기본값

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DaDPzugZyKUdGnpyTH5KY4"
```

### Task 5: 라인업 상태와 배치 규칙 `src/lib/lineup.ts`

**Files:**
- Create: `src/lib/lineup.ts`
- Test: `tests/unit/lineup.test.mjs`

**Interfaces:**
- Consumes (Task 4): `SHAPES`, `slotsFor`, `defaultPitch`, `clampCount`, `bestEleven`, `type PitchKind`, `type Slot`
- Produces (Task 6·7·8이 쓴다):
  - `type Pt = [number, number]` — 정규 좌표 0~1
  - `type Drawing = { kind: 'arrow'; from: Pt; to: Pt } | { kind: 'pen'; points: Pt[] }`
  - `type LineupState = { v: 1; count: number; shape: string; pitch: PitchKind; slots: (number | null)[]; moved: Record<string, Pt>; drawings: Drawing[]; title: string }` — `slots[i]`는 선수 번호(`Player.num`)
  - `type ListTap = 'placed' | 'benched' | 'full'`
  - `DRAFT_KEY = 'wfc_squad_draft'`
  - `initial(count?: number): LineupState`
  - `slotsOf(s): Slot[]`, `positionOf(s, idx): Pt`
  - `setCount(s, n)`, `setShape(s, shape)`, `setPitch(s, pitch)`, `setTitle(s, title)` → `LineupState`
  - `place(s, idx, num)`, `bench(s, num)`, `swap(s, a, b)`, `moveSlot(s, idx, pt)`, `autoFill(s, players)` → `LineupState`
  - `isStarter(s, num): boolean`
  - `tapPlayer(s, num, selected: number | null): { state: LineupState; result: ListTap }`
  - `benchOf(s, players): Player[]` — OVR 내림차순
  - `addDrawing(s, d)`, `undoDrawing(s)`, `clearDrawings(s)` → `LineupState`
  - `serialize(s): string`, `restore(raw: string | null, players: Player[]): LineupState`
  - `defaultTitle(today: string): string` — `today`는 `'YYYY-MM-DD'`(서울 기준, `seoulToday()` 값)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

Create `tests/unit/lineup.test.mjs`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { initial, setCount, setShape, place, tapPlayer, swap, moveSlot, autoFill, benchOf, positionOf, addDrawing, undoDrawing, clearDrawings, restore, serialize, defaultTitle } from '../../src/lib/lineup.ts';
import { slotsFor } from '../../src/lib/formation.ts';

const P = (num, pos, s = 70) => ({ num, name: `p${num}`, pos, detail: '', foot: '', vest: null, note: '', pace: s, dribble: s, pass: s, shoot: s, defend: s, stamina: s, rot: null, avatar: '' });

test('initial: 인원만큼 빈 슬롯, 그 인원의 첫 모양과 경기장 기본값', () => {
  const s = initial(6);
  assert.equal(s.slots.length, 6);
  assert.ok(s.slots.every((x) => x === null));
  assert.equal(s.shape, '2-2-1');
  assert.equal(s.pitch, 'futsal');
  assert.equal(initial().count, 11);
});

test('tapPlayer: 고른 자리가 없으면 첫 빈자리, 선발을 다시 누르면 벤치', () => {
  let r = tapPlayer(initial(5), 7, null);
  assert.equal(r.result, 'placed');
  assert.equal(r.state.slots[0], 7);
  r = tapPlayer(r.state, 8, null);
  assert.equal(r.state.slots[1], 8);
  r = tapPlayer(r.state, 7, null);
  assert.equal(r.result, 'benched');
  assert.equal(r.state.slots[0], null);
});

test('tapPlayer: 자리가 다 차면 full, 상태는 그대로', () => {
  let s = initial(5);
  for (const n of [1, 2, 3, 4, 5]) s = tapPlayer(s, n, null).state;
  const r = tapPlayer(s, 6, null);
  assert.equal(r.result, 'full');
  assert.equal(r.state, s);
});

test('tapPlayer: 자리를 골랐으면 그 자리에 넣고 원래 사람은 벤치, 다른 자리에 있던 같은 선수는 옮겨진다', () => {
  const s = place(place(initial(5), 0, 1), 1, 2);
  let r = tapPlayer(s, 3, 0);
  assert.equal(r.result, 'placed');
  assert.deepEqual(r.state.slots.slice(0, 2), [3, 2]);
  r = tapPlayer(r.state, 2, 0);
  assert.deepEqual(r.state.slots.slice(0, 2), [2, null]);
});

test('swap: 두 슬롯을 맞바꾸고, 빈 슬롯과도 바꾼다', () => {
  const s = place(place(initial(5), 0, 1), 1, 2);
  assert.deepEqual(swap(s, 0, 1).slots.slice(0, 3), [2, 1, null]);
  assert.deepEqual(swap(s, 0, 2).slots.slice(0, 3), [null, 2, 1]);
  assert.equal(swap(s, 1, 1), s);
});

test('setCount: 선 사람은 앞에서부터 유지, 넘치면 벤치, 모양·경기장은 인원 기본값, 위치 이동 초기화', () => {
  let s = initial(7);
  [11, 12, 13, 14, 15, 16, 17].forEach((n, i) => { s = place(s, i, n); });
  s = moveSlot(s, 0, [0.1, 0.1]);
  const t = setCount(s, 5);
  assert.deepEqual(t.slots, [11, 12, 13, 14, 15]);
  assert.deepEqual(t.moved, {});
  assert.equal(t.shape, '1-2-1');
  const u = setCount(t, 8);
  assert.deepEqual(u.slots, [11, 12, 13, 14, 15, null, null, null]);
  assert.equal(u.pitch, 'soccer');
});

test('setShape: 그 인원에 없는 모양은 첫 모양, 선수는 그대로, 위치 이동은 초기화', () => {
  const s = moveSlot(place(initial(6), 0, 1), 0, [0.2, 0.2]);
  const t = setShape(s, '2-1-2');
  assert.equal(t.shape, '2-1-2');
  assert.equal(t.slots[0], 1);
  assert.deepEqual(t.moved, {});
  assert.equal(setShape(s, '4-4-2').shape, '2-2-1');
});

test('moveSlot: 0~1로 자르고 positionOf가 옮긴 위치를, 안 옮긴 자리는 슬롯 좌표를 돌려준다', () => {
  const s = moveSlot(initial(5), 2, [1.4, -0.2]);
  assert.deepEqual(positionOf(s, 2), [1, 0]);
  const slot = slotsFor(5, '1-2-1')[1];
  assert.deepEqual(positionOf(s, 1), [slot.x, slot.y]);
});

test('autoFill: 자리 무리에 맞는 OVR 높은 사람부터, 벤치는 OVR 높은 순', () => {
  const ps = [P(1, 'MF', 90), P(2, 'GK', 60), P(3, 'DF', 80), P(4, 'FW', 85), P(5, 'DF', 70), P(6, 'MF', 50), P(7, 'MF', 75)];
  const s = autoFill(initial(5), ps); // 1-2-1: GK · CB · CM · CM · ST
  assert.deepEqual(s.slots, [2, 3, 1, 7, 4]);
  assert.deepEqual(benchOf(s, ps).map((p) => p.num), [5, 6]);
});

test('그림: 더하기·되돌리기·지우기', () => {
  const a = { kind: 'arrow', from: [0, 0], to: [1, 1] };
  const b = { kind: 'pen', points: [[0, 0], [0.5, 0.5]] };
  const s = addDrawing(addDrawing(initial(5), a), b);
  assert.deepEqual(undoDrawing(s).drawings, [a]);
  assert.deepEqual(clearDrawings(s).drawings, []);
  assert.deepEqual(undoDrawing(initial(5)).drawings, []);
});

test('restore: serialize 왕복은 같은 상태', () => {
  let s = place(initial(6), 0, 1);
  s = addDrawing(s, { kind: 'arrow', from: [0.1, 0.2], to: [0.3, 0.4] });
  s = { ...s, title: '9/19 (토) 라인업' };
  assert.deepEqual(restore(serialize(s), [P(1, 'GK')]), s);
});

test('restore: 깨진 값·빈 값·모르는 버전은 초기 상태', () => {
  assert.deepEqual(restore('{', []), initial());
  assert.deepEqual(restore(null, []), initial());
  assert.deepEqual(restore('{"v":2}', []), initial());
});

test('restore: 명단에 없는 번호·중복 번호는 비우고, 범위 밖 이동·잘못된 그림·문자열 아닌 제목은 버린다', () => {
  const raw = JSON.stringify({ v: 1, count: 5, shape: '2-2', pitch: 'soccer', slots: [1, 99, 1, 2, null],
    moved: { 9: [0.5, 0.5], 1: [0.2, 0.3] }, drawings: [{ kind: 'pen', points: [[0, 0]] }, { kind: 'arrow', from: [0, 0], to: [1, 1] }], title: 3 });
  const s = restore(raw, [P(1, 'GK'), P(2, 'DF')]);
  assert.deepEqual(s.slots, [1, null, null, 2, null]);
  assert.equal(s.shape, '2-2');
  assert.equal(s.pitch, 'soccer');
  assert.deepEqual(s.moved, { 1: [0.2, 0.3] });
  assert.equal(s.drawings.length, 1);
  assert.equal(s.title, '');
});

test('defaultTitle: 오늘 이후 가장 가까운 토요일, 토요일 당일은 오늘', () => {
  assert.equal(defaultTitle('2026-09-12'), '9/12 (토) 라인업');
  assert.equal(defaultTitle('2026-09-13'), '9/19 (토) 라인업');
  assert.equal(defaultTitle('2026-09-27'), '10/3 (토) 라인업');
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/unit/lineup.test.mjs`
Expected: FAIL — `Cannot find module '.../src/lib/lineup.ts'`

- [ ] **Step 3: 구현**

Create `src/lib/lineup.ts`:
```ts
// src/lib/lineup.ts — 한 팀 라인업 상태와 배치 규칙. DOM 없이 순수 함수만 둔다(단위 테스트 대상).
// 상태는 기기에 초안 하나로만 남는다 — 서버 저장은 하지 않는다(2026-09-13 스펙 §1).
import { SHAPES, slotsFor, defaultPitch, clampCount, bestEleven, type PitchKind, type Slot } from './formation.ts';
import { ovr } from './stats.ts';
import type { Player } from './types.ts';

export type Pt = [number, number];
export type Drawing = { kind: 'arrow'; from: Pt; to: Pt } | { kind: 'pen'; points: Pt[] };
export type LineupState = {
  v: 1; count: number; shape: string; pitch: PitchKind;
  /** 슬롯 순서대로 선수 번호. slotsFor(count, shape)와 길이가 같다. */
  slots: (number | null)[];
  /** 끌어서 옮긴 슬롯의 위치. 키는 슬롯 번호. 모양·인원을 바꾸면 비운다. */
  moved: Record<string, Pt>;
  drawings: Drawing[];
  /** 빈 문자열이면 defaultTitle 을 쓴다. */
  title: string;
};
export type ListTap = 'placed' | 'benched' | 'full';
export const DRAFT_KEY = 'wfc_squad_draft';
const TITLE_MAX = 40;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const inRange = (s: LineupState, i: number) => Number.isInteger(i) && i >= 0 && i < s.count;
const without = (slots: (number | null)[], num: number) => slots.map((x) => (x === num ? null : x));

export function initial(count = 11): LineupState {
  const n = clampCount(count);
  return { v: 1, count: n, shape: SHAPES[n][0], pitch: defaultPitch(n), slots: Array(n).fill(null), moved: {}, drawings: [], title: '' };
}

export const slotsOf = (s: LineupState): Slot[] => slotsFor(s.count, s.shape);

export function positionOf(s: LineupState, idx: number): Pt {
  const m = s.moved[idx];
  if (m) return m;
  const slot = slotsOf(s)[idx];
  return [slot.x, slot.y];
}

/** 인원을 바꾸면 이미 선 사람은 앞 슬롯부터 순서대로 남고 넘치는 사람은 벤치로 간다. */
export function setCount(s: LineupState, count: number): LineupState {
  const n = clampCount(count);
  const starters = s.slots.filter((x): x is number => x != null).slice(0, n);
  const slots = Array.from({ length: n }, (_, i) => starters[i] ?? null);
  return { ...s, count: n, shape: SHAPES[n][0], pitch: defaultPitch(n), slots, moved: {} };
}

export function setShape(s: LineupState, shape: string): LineupState {
  const key = SHAPES[s.count].includes(shape) ? shape : SHAPES[s.count][0];
  return { ...s, shape: key, moved: {} };
}

export const setPitch = (s: LineupState, pitch: PitchKind): LineupState => ({ ...s, pitch });
export const setTitle = (s: LineupState, title: string): LineupState => ({ ...s, title: title.slice(0, TITLE_MAX) });
export const isStarter = (s: LineupState, num: number): boolean => s.slots.includes(num);

/** 그 자리에 넣는다. 원래 있던 사람은 벤치로, 다른 자리에 서 있던 같은 선수는 그 자리를 비운다. */
export function place(s: LineupState, idx: number, num: number): LineupState {
  if (!inRange(s, idx)) return s;
  const slots = without(s.slots, num);
  slots[idx] = num;
  return { ...s, slots };
}

export const bench = (s: LineupState, num: number): LineupState => ({ ...s, slots: without(s.slots, num) });

/** 명단에서 선수를 눌렀을 때. 자리가 골라져 있으면 그 자리로, 아니면 선발↔벤치 토글이거나 첫 빈자리. */
export function tapPlayer(s: LineupState, num: number, selected: number | null): { state: LineupState; result: ListTap } {
  if (selected != null && inRange(s, selected)) return { state: place(s, selected, num), result: 'placed' };
  if (isStarter(s, num)) return { state: bench(s, num), result: 'benched' };
  const empty = s.slots.indexOf(null);
  if (empty < 0) return { state: s, result: 'full' };
  return { state: place(s, empty, num), result: 'placed' };
}

/** 두 슬롯의 선수를 맞바꾼다. 위치(moved)는 슬롯에 붙어 있으므로 그대로 둔다. */
export function swap(s: LineupState, a: number, b: number): LineupState {
  if (a === b || !inRange(s, a) || !inRange(s, b)) return s;
  const slots = [...s.slots];
  [slots[a], slots[b]] = [slots[b], slots[a]];
  return { ...s, slots };
}

export function moveSlot(s: LineupState, idx: number, pt: Pt): LineupState {
  if (!inRange(s, idx)) return s;
  return { ...s, moved: { ...s.moved, [idx]: [r3(clamp01(pt[0])), r3(clamp01(pt[1]))] } };
}

export function autoFill(s: LineupState, players: Player[]): LineupState {
  const { lineup } = bestEleven(players, slotsOf(s));
  return { ...s, slots: lineup.map((a) => a.player?.num ?? null), moved: {} };
}

export function benchOf(s: LineupState, players: Player[]): Player[] {
  return players.filter((p) => !s.slots.includes(p.num)).sort((a, b) => ovr(b) - ovr(a) || a.num - b.num);
}

export const addDrawing = (s: LineupState, d: Drawing): LineupState => ({ ...s, drawings: [...s.drawings, d] });
export const undoDrawing = (s: LineupState): LineupState => ({ ...s, drawings: s.drawings.slice(0, -1) });
export const clearDrawings = (s: LineupState): LineupState => ({ ...s, drawings: [] });

export const serialize = (s: LineupState): string => JSON.stringify(s);

const isPt = (p: unknown): p is Pt => Array.isArray(p) && p.length === 2 && p.every((v) => typeof v === 'number' && Number.isFinite(v));
function isDrawing(d: unknown): d is Drawing {
  if (!d || typeof d !== 'object') return false;
  const o = d as Record<string, unknown>;
  if (o.kind === 'arrow') return isPt(o.from) && isPt(o.to);
  if (o.kind === 'pen') return Array.isArray(o.points) && o.points.length >= 2 && o.points.every(isPt);
  return false;
}

/** 초안 복원 — 무엇이 와도 쓸 수 있는 상태를 돌려준다. 명단에 없는 번호(탈퇴 등)는 비운다. */
export function restore(raw: string | null, players: Player[]): LineupState {
  let o: Record<string, unknown>;
  try { o = JSON.parse(raw ?? ''); } catch { return initial(); }
  if (!o || typeof o !== 'object' || o.v !== 1) return initial();
  const base = setShape(initial(Number(o.count)), String(o.shape ?? ''));
  const known = new Set(players.map((p) => p.num));
  const seen = new Set<number>();
  const src = Array.isArray(o.slots) ? o.slots : [];
  const slots = base.slots.map((_, i) => {
    const v = src[i];
    if (typeof v !== 'number' || !known.has(v) || seen.has(v)) return null;
    seen.add(v);
    return v;
  });
  const moved: Record<string, Pt> = {};
  if (o.moved && typeof o.moved === 'object') {
    for (const [k, v] of Object.entries(o.moved as Record<string, unknown>)) {
      const i = Number(k);
      if (inRange(base, i) && isPt(v)) moved[i] = [clamp01(v[0]), clamp01(v[1])];
    }
  }
  const drawings = (Array.isArray(o.drawings) ? o.drawings : []).filter(isDrawing);
  const pitch: PitchKind = o.pitch === 'futsal' || o.pitch === 'soccer' ? o.pitch : base.pitch;
  const title = typeof o.title === 'string' ? o.title.slice(0, TITLE_MAX) : '';
  return { ...base, pitch, slots, moved, drawings, title };
}

/** 기본 제목 — today('YYYY-MM-DD', 서울 기준) 이후 가장 가까운 토요일. 토요일 당일이면 오늘. */
export function defaultTitle(today: string): string {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + ((6 - d.getUTCDay() + 7) % 7));
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} (토) 라인업`;
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm run test:unit`
Expected: PASS 전부.

- [ ] **Step 5: Commit**

```bash
git add src/lib/lineup.ts tests/unit/lineup.test.mjs
git commit -m "feat(lineup): 한 팀 라인업 상태 — 배치·교환·벤치·그림·초안 복원 규칙

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DaDPzugZyKUdGnpyTH5KY4"
```

### Task 6: 피치 렌더 `src/components/pitch-view.ts`

**Files:**
- Create: `src/components/pitch-view.ts`
- Test: `tests/unit/pitch-view.test.mjs`

**Interfaces:**
- Consumes (Task 4·5): `type PitchKind`, `type LineupState`, `slotsOf`, `positionOf`
- Produces (Task 7·8·9가 쓴다):
  - `PITCH_DIM: Record<PitchKind, { w: number; h: number }>` — futsal 20×40, soccer 68×105(미터). 선 SVG·그림 SVG·공유 이미지가 같은 비율을 쓴다.
  - `pitchLines(kind: PitchKind): string` — `<svg class="bd-lines" viewBox="0 0 w h">`
  - `pitchHtml(s: LineupState, players: Player[], selected: number | null, drawInner?: string): string` — 루트 `.bd-pitch[data-pitch]`, 그림 겹 `svg.bd-draw[data-draw]`, 슬롯마다 `button.bd-slot[data-slot=i]`(빈 자리는 `.bd-empty`, 선수는 `.bd-card`), 고른 자리 `.is-selected`, 자리 밖 `.is-oop`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

Create `tests/unit/pitch-view.test.mjs`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { pitchHtml, pitchLines, PITCH_DIM } from '../../src/components/pitch-view.ts';
import { initial, place, moveSlot } from '../../src/lib/lineup.ts';

const P = (num, name, pos, s = 70) => ({ num, name, pos, detail: '', foot: '', vest: null, note: '', pace: s, dribble: s, pass: s, shoot: s, defend: s, stamina: s, rot: null, avatar: '' });
const count = (html, needle) => html.split(needle).length - 1;

test('슬롯마다 버튼 하나, 빈 자리는 라벨을 보여준다', () => {
  const html = pitchHtml(initial(6), [], null);
  assert.equal(count(html, 'data-slot="'), 6);
  assert.equal(count(html, 'bd-empty'), 6);
  assert.ok(html.includes('>GK</button>'));
});

test('선수가 선 자리는 이름·자리 라벨을 넣고 이름은 이스케이프한다', () => {
  const s = place(initial(5), 0, 1);
  const html = pitchHtml(s, [P(1, '<김>', 'GK', 80)], null);
  assert.ok(html.includes('&lt;김&gt;'));
  assert.ok(!html.includes('<김>'));
  assert.equal(count(html, 'bd-card'), 1);
  assert.ok(html.includes('pcard-silver'));
});

test('고른 자리에 is-selected, 포지션이 다른 자리에 선 선수는 is-oop', () => {
  const s = place(place(initial(5), 0, 1), 1, 2);
  const html = pitchHtml(s, [P(1, 'a', 'GK'), P(2, 'b', 'FW')], 1);
  assert.equal(count(html, 'is-selected'), 1);
  const btn = html.match(/<button[^>]*data-slot="1"[^>]*>/)[0];
  assert.ok(btn.includes('is-selected'), '고른 자리는 1번');
  assert.equal(count(html, 'is-oop'), 1);
});

test('옮긴 자리는 옮긴 좌표를 % 로 쓴다', () => {
  const html = pitchHtml(moveSlot(initial(5), 0, [0.1, 0.25]), [], null);
  assert.ok(html.includes('left:10.0%;top:25.0%'));
});

test('경기장별 viewBox 와 비율', () => {
  assert.ok(pitchLines('futsal').includes('viewBox="0 0 20 40"'));
  assert.ok(pitchLines('soccer').includes('viewBox="0 0 68 105"'));
  assert.deepEqual(PITCH_DIM.futsal, { w: 20, h: 40 });
  const s = { ...initial(8), pitch: 'soccer' };
  assert.ok(pitchHtml(s, [], null).includes('aspect-ratio:68 / 105'));
});

test('그림 겹 내용은 받은 문자열을 그대로 넣는다', () => {
  assert.ok(pitchHtml(initial(5), [], null, '<path d="M0 0"/>').includes('data-draw><path d="M0 0"/></svg>'));
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/unit/pitch-view.test.mjs`
Expected: FAIL — `Cannot find module '.../src/components/pitch-view.ts'`

- [ ] **Step 3: 구현**

Create `src/components/pitch-view.ts`:
```ts
// src/components/pitch-view.ts — 피치 선 SVG와 선수 카드 HTML. 문자열만 만든다(DOM 없음).
// 캔버스 한 장에 그리던 전술판은 크기 계산이 어긋나면 화면 전체가 깨졌다 — 선은 SVG, 카드는
// HTML 로 올려 브라우저가 크기를 맡게 한다(2026-09-13 스펙 §4.4).
import { esc } from '../lib/html.ts';
import { grade, ovr } from '../lib/stats.ts';
import { slotsOf, positionOf, type LineupState } from '../lib/lineup.ts';
import type { PitchKind } from '../lib/formation.ts';
import type { Player } from '../lib/types.ts';

/** 경기장 비율(미터). 선·그림·공유 이미지가 같은 단위를 쓴다. */
export const PITCH_DIM: Record<PitchKind, { w: number; h: number }> = { futsal: { w: 20, h: 40 }, soccer: { w: 68, h: 105 } };

export function pitchLines(kind: PitchKind): string {
  if (kind === 'soccer') {
    return `<svg class="bd-lines" viewBox="0 0 68 105" preserveAspectRatio="none" aria-hidden="true">`
      + `<rect x="2" y="2" width="64" height="101"/><line x1="2" y1="52.5" x2="66" y2="52.5"/><circle cx="34" cy="52.5" r="9.15"/>`
      + `<rect x="13.2" y="2" width="41.6" height="16.5"/><rect x="24.8" y="2" width="18.4" height="5.5"/>`
      + `<rect x="13.2" y="86.5" width="41.6" height="16.5"/><rect x="24.8" y="97.5" width="18.4" height="5.5"/></svg>`;
  }
  // 풋살 페널티 구역은 골대 양쪽 기둥에서 6m 사분원을 이은 모양 — 곡선 하나로 줄여 그린다.
  return `<svg class="bd-lines" viewBox="0 0 20 40" preserveAspectRatio="none" aria-hidden="true">`
    + `<rect x="1" y="1" width="18" height="38"/><line x1="1" y1="20" x2="19" y2="20"/><circle cx="10" cy="20" r="3"/>`
    + `<path d="M4 1 C4 8 16 8 16 1"/><path d="M4 39 C4 32 16 32 16 39"/></svg>`;
}

export function pitchHtml(s: LineupState, players: Player[], selected: number | null, drawInner = ''): string {
  const byNum = new Map(players.map((p) => [p.num, p]));
  const cards = slotsOf(s).map((slot, i) => {
    const [x, y] = positionOf(s, i);
    const at = `left:${(x * 100).toFixed(1)}%;top:${(y * 100).toFixed(1)}%`;
    const num = s.slots[i];
    const p = num != null ? byNum.get(num) : undefined;
    const sel = selected === i ? ' is-selected' : '';
    const label = esc(slot.label);
    if (!p) return `<button type="button" class="bd-slot bd-empty${sel}" style="${at}" data-slot="${i}" aria-label="${label} 빈 자리">${label}</button>`;
    const o = ovr(p);
    const oop = p.pos && p.pos !== slot.group ? ' is-oop' : '';
    return `<button type="button" class="bd-slot bd-card pcard-${grade(o)}${sel}${oop}" style="${at}" data-slot="${i}" aria-label="${label} ${esc(p.name)}">`
      + `<b class="bd-ovr">${o || '–'}</b><span class="bd-name">${esc(p.name)}</span><span class="bd-pos">${label}</span></button>`;
  }).join('');
  const { w, h } = PITCH_DIM[s.pitch];
  return `<div class="bd-pitch bd-${s.pitch}" style="aspect-ratio:${w} / ${h}" data-pitch>${pitchLines(s.pitch)}`
    + `<svg class="bd-draw" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true" data-draw>${drawInner}</svg>${cards}</div>`;
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm run test:unit`
Expected: PASS 전부.

- [ ] **Step 5: Commit**

```bash
git add src/components/pitch-view.ts tests/unit/pitch-view.test.mjs
git commit -m "feat(squad): 피치 렌더 — SVG 선 + HTML 선수 카드, 경기장 두 종

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DaDPzugZyKUdGnpyTH5KY4"
```

### Task 7: 스쿼드 한 화면 — 명단 + 피치 배치

**Files:**
- Rewrite: `src/pages/squad/index.astro`
- Modify: `src/styles/tokens.css:376-400` (「스쿼드 피치」 절 교체)

**Interfaces:**
- Consumes: `pitchHtml` (Task 6), `lineup.ts` 전부 (Task 5), `SHAPES`·`MIN_COUNT`·`MAX_COUNT` (Task 4), `mountTable`, `playerCard`, `avatarSvg`, `avatarSpecFor`
- Produces (Task 8·9가 고친다):
  - 페이지 스크립트 안의 `render()`, `commit(next: LineupState)`, 상태 변수 `st`, `selected`, `data`
  - 빈 도구 줄 `#tools`, 안내 줄 `#hint`

이 태스크는 DOM 배선이라 단위 테스트가 없다. 규칙은 Task 5 테스트가 지키고, 여기서는 실제로 눌러서 확인한다.

- [ ] **Step 1: 페이지를 다시 쓴다**

Replace `src/pages/squad/index.astro` 전체:
```astro
---
import Shell from '../../layouts/Shell.astro';
---
<Shell title="스쿼드">
  <div class="page-head">
    <h1>스쿼드 <span class="muted" id="count"></span></h1>
    <div class="actions"><button id="add" hidden>선수 추가</button></div>
  </div>
  <div class="bd-controls" role="group" aria-label="라인업 설정">
    <div class="bd-stepper"><span class="label">인원</span><button type="button" id="cnt-dec" aria-label="인원 줄이기">−</button><b id="cnt" aria-live="polite"></b><button type="button" id="cnt-inc" aria-label="인원 늘리기">+</button></div>
    <label class="bd-field"><span class="label">포메이션</span><select id="shape"></select></label>
    <div class="chips" id="pitch-kind" role="group" aria-label="경기장"><button class="chip" data-kind="futsal" aria-pressed="false">풋살</button><button class="chip" data-kind="soccer" aria-pressed="false">축구</button></div>
    <button type="button" id="auto">자동 배치</button>
  </div>
  <div class="bd">
    <section class="bd-list" id="list" aria-label="명단">
      <button type="button" class="bd-sheet-handle" id="sheet-handle" aria-expanded="false"><span id="sheet-summary"></span></button>
      <div class="bd-list-head">
        <div class="chips" id="pos-filter" role="group" aria-label="포지션 거르기"><button class="chip on" data-pos="ALL" aria-pressed="true">전체</button><button class="chip" data-pos="GK" aria-pressed="false">GK</button><button class="chip" data-pos="DF" aria-pressed="false">DF</button><button class="chip" data-pos="MF" aria-pressed="false">MF</button><button class="chip" data-pos="FW" aria-pressed="false">FW</button></div>
        <input id="q" type="search" placeholder="이름" class="w-search" />
        <div class="chips" id="view-toggle" role="group" aria-label="명단 보기"><button class="chip" data-view="list" aria-pressed="false">목록</button><button class="chip" data-view="card" aria-pressed="false">카드</button><button class="chip" data-view="table" aria-pressed="false">표</button></div>
      </div>
      <div id="list-body"></div>
    </section>
    <section class="bd-stage" aria-label="피치">
      <div id="pitch-slot"></div>
      <div class="bd-tools" id="tools" role="toolbar" aria-label="도구"></div>
      <p class="muted bd-hint" id="hint"></p>
    </section>
  </div>
</Shell>
<script>
  import { onData, isAdmin } from '../../lib/api.ts';
  import { href } from '../../lib/url.ts';
  import { esc, toast } from '../../lib/html.ts';
  import { ovr, band, grade, STAT_CUTS } from '../../lib/stats.ts';
  import { mountTable, type Column, type TableState } from '../../components/table.ts';
  import { playerCard, STAT_LABEL } from '../../components/player-card.ts';
  import { avatarSvg } from '../../components/avatar.ts';
  import { avatarSpecFor } from '../../lib/avatar.ts';
  import { pitchHtml } from '../../components/pitch-view.ts';
  import { SHAPES, MIN_COUNT, MAX_COUNT, type PitchKind } from '../../lib/formation.ts';
  import * as L from '../../lib/lineup.ts';
  import { STAT_KEYS, type Data, type Player } from '../../lib/types.ts';

  type View = 'list' | 'card' | 'table';
  const VIEW_KEY = 'wfc.squad.view';
  const load = (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } };
  const save = (k: string, v: string): void => { try { localStorage.setItem(k, v); } catch { /* 저장 못 해도 화면은 돈다 */ } };
  const $ = (id: string) => document.getElementById(id) as HTMLElement;
  const setChip = (el: Element, on: boolean) => { el.classList.toggle('on', on); el.setAttribute('aria-pressed', String(on)); };

  let data: Data | null = null;
  let st: L.LineupState = L.initial();
  /** 사용자가 한 번이라도 바꿨는지. 그 전에는 새 데이터가 올 때마다 초안을 다시 복원한다 —
   *  캐시 명단에 없던 선수가 새 명단에 있을 수 있어서다. */
  let touched = false;
  let selected: number | null = null;
  let pos = 'ALL', q = '';
  const savedView = load(VIEW_KEY);
  let view: View = savedView === 'card' || savedView === 'table' ? savedView : 'list';
  const tableState: TableState = { sortKey: 'ovr', sortDir: 'desc' };

  function commit(next: L.LineupState): void {
    st = next;
    touched = true;
    save(L.DRAFT_KEY, L.serialize(st));
    render();
  }

  // ── 명단 ──────────────────────────────────────────────
  const byOvr = (rows: Player[]) => [...rows].sort((a, b) => ovr(b) - ovr(a) || a.num - b.num);

  function cols(): Column<Player>[] {
    return [
      { key: 'pick', label: '선발', sortable: false, align: 'c', get: (p) => (L.isStarter(st, p.num) ? 1 : 0),
        cell: (p) => `<button type="button" class="${L.isStarter(st, p.num) ? 'primary' : ''}" data-pick="${p.num}" aria-pressed="${L.isStarter(st, p.num)}">${L.isStarter(st, p.num) ? '선발' : '넣기'}</button>` },
      { key: 'avatar', label: '', sortable: false, get: () => '', cell: (p) => avatarSvg(avatarSpecFor(p.num, p.avatar), 28, p.num), align: 'c' },
      { key: 'num', label: '#', get: (p) => p.num, align: 'r' },
      { key: 'name', label: '이름', get: (p) => p.name, cell: (p) => `<a href="${href(`/squad/${p.num}/`)}"><b>${esc(p.name)}</b></a>` },
      { key: 'pos', label: '포지션', get: (p) => p.pos, cell: (p) => `<span class="pos pos-${p.pos.toLowerCase()}">${p.pos || '–'}</span> <span class="muted">${esc(p.detail)}</span>` },
      ...STAT_KEYS.map((k): Column<Player> => ({ key: k, label: STAT_LABEL[k], get: (p) => p[k], align: 'r', cell: (p) => `<span class="val val-${band(p[k], STAT_CUTS)}">${p[k] || '–'}</span>` })),
      { key: 'ovr', label: 'OVR', get: (p) => ovr(p), align: 'r', cell: (p) => `<b class="val val-${band(ovr(p), STAT_CUTS)}">${ovr(p) || '–'}</b>` },
    ];
  }

  function renderList(rows: Player[]): void {
    const body = $('list-body');
    const empty = '<p class="pcard-empty">명단이 비어 있습니다</p>';
    if (view === 'table') {
      body.className = 'tbl-wrap';
      mountTable(body, cols(), rows, tableState, { empty: '명단이 비어 있습니다', rowKey: (p) => String(p.num) });
      return;
    }
    if (view === 'card') {
      body.className = 'pcard-wall';
      body.innerHTML = rows.length ? byOvr(rows).map((p) => { const on = L.isStarter(st, p.num);
        return `<div class="bd-cardcell"><div class="bd-cardpick${on ? ' is-on' : ''}" role="button" tabindex="0" data-pick="${p.num}" aria-pressed="${on}">${playerCard(p, avatarSvg(avatarSpecFor(p.num, p.avatar), 116, p.num, true))}</div><a class="bd-card-link" href="${href(`/squad/${p.num}/`)}">선수 페이지 ›</a></div>`; }).join('') : empty;
      return;
    }
    body.className = '';
    body.innerHTML = rows.length ? `<div class="bd-rows">${byOvr(rows).map((p) => { const on = L.isStarter(st, p.num);
      return `<div class="bd-row${on ? ' is-on' : ''}"><button type="button" class="bd-pick" data-pick="${p.num}" aria-pressed="${on}"><span class="pos pos-${p.pos.toLowerCase()}">${p.pos || '–'}</span><b>${esc(p.name)}</b><span class="bd-row-ovr grade-${grade(ovr(p))}">${ovr(p) || '–'}</span>${on ? '<span class="bd-on">선발</span>' : '<span></span>'}</button><a class="bd-row-link" href="${href(`/squad/${p.num}/`)}" aria-label="${esc(p.name)} 선수 페이지">›</a></div>`; }).join('')}</div>` : empty;
  }

  function onPick(num: number): void {
    const r = L.tapPlayer(st, num, selected);
    if (r.result === 'full') { toast('자리가 다 찼습니다 · 자리를 먼저 고르세요'); return; }
    selected = null;
    commit(r.state);
  }

  // ── 피치 ──────────────────────────────────────────────
  const DRAG_PX = 6;

  function tapSlot(idx: number): void {
    if (selected === null) { selected = idx; render(); openSheet(); return; }
    if (selected === idx) { selected = null; render(); return; }
    const a = selected;
    selected = null;
    commit(L.swap(st, a, idx));
  }

  /** 카드 끌기 — 다른 카드 위에 놓으면 교환, 빈 곳이면 그 슬롯 위치만 옮긴다. 6px 안쪽이면 탭으로 본다. */
  function startDrag(e: PointerEvent, el: HTMLElement, pitch: HTMLElement): void {
    if (e.button !== 0) return;
    const idx = Number(el.dataset.slot);
    const x0 = e.clientX, y0 = e.clientY;
    let dragging = false;
    el.setPointerCapture(e.pointerId);
    const off = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', cancel); };
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - x0, dy = ev.clientY - y0;
      if (!dragging && Math.hypot(dx, dy) < DRAG_PX) return;
      dragging = true;
      el.classList.add('is-dragging');
      el.style.translate = `${dx}px ${dy}px`;
    };
    const cancel = () => { off(); render(); };
    const up = (ev: PointerEvent) => {
      off();
      if (!dragging) { tapSlot(idx); return; }
      el.style.visibility = 'hidden';
      const under = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>('[data-slot]');
      el.style.visibility = '';
      if (under && under !== el) { selected = null; commit(L.swap(st, idx, Number(under.dataset.slot))); return; }
      const r = pitch.getBoundingClientRect();
      const inside = ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
      if (inside) commit(L.moveSlot(st, idx, [(ev.clientX - r.left) / r.width, (ev.clientY - r.top) / r.height]));
      else render();
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', cancel);
  }

  function bindPitch(): void {
    const pitch = document.querySelector<HTMLElement>('[data-pitch]');
    if (!pitch) return;
    pitch.querySelectorAll<HTMLElement>('[data-slot]').forEach((el) => {
      el.onpointerdown = (e) => startDrag(e, el, pitch);
      // 키보드(Enter·Space)는 pointer 이벤트가 없다 — detail 0 인 click 으로만 들어온다.
      el.onclick = (e) => { if (e.detail === 0) tapSlot(Number(el.dataset.slot)); };
    });
    pitch.addEventListener('click', (e) => {
      if (!(e.target as Element).closest('[data-slot]') && selected !== null) { selected = null; render(); }
    });
  }

  // ── 모바일 명단 시트 ─────────────────────────────────────
  const narrow = () => matchMedia('(max-width: 899px)').matches;
  function toggleSheet(open?: boolean): void {
    const list = $('list');
    const on = open ?? !list.classList.contains('is-open');
    list.classList.toggle('is-open', on);
    $('sheet-handle').setAttribute('aria-expanded', String(on));
  }
  const openSheet = () => { if (narrow()) toggleSheet(true); };

  // ── 그리기 ────────────────────────────────────────────
  function renderControls(): void {
    $('cnt').textContent = String(st.count);
    ($('cnt-dec') as HTMLButtonElement).disabled = st.count <= MIN_COUNT;
    ($('cnt-inc') as HTMLButtonElement).disabled = st.count >= MAX_COUNT;
    ($('shape') as HTMLSelectElement).innerHTML = SHAPES[st.count].map((k) => `<option value="${k}"${k === st.shape ? ' selected' : ''}>${k}</option>`).join('');
    document.querySelectorAll('#pitch-kind [data-kind]').forEach((b) => setChip(b, (b as HTMLElement).dataset.kind === st.pitch));
    document.querySelectorAll('#view-toggle [data-view]').forEach((b) => setChip(b, (b as HTMLElement).dataset.view === view));
  }

  function render(): void {
    if (!data) return;
    const d = data;
    if (!touched) st = L.restore(load(L.DRAFT_KEY), d.players);
    const rows = d.players.filter((p) => (pos === 'ALL' || p.pos === pos) && (!q || p.name.includes(q)));
    const filled = st.slots.filter((x) => x != null).length;
    $('count').textContent = `${d.players.length}명`;
    $('add').hidden = !isAdmin();
    $('sheet-summary').textContent = `명단 ${d.players.length}명 · 선발 ${filled}/${st.count}`;
    renderControls();
    $('pitch-slot').innerHTML = pitchHtml(st, d.players, selected);
    bindPitch();
    renderList(rows);
    $('hint').textContent = selected !== null
      ? `${L.slotsOf(st)[selected].label} 자리 — 명단에서 선수를 누르거나, 다른 자리를 누르면 맞바꿉니다`
      : '자리를 누르고 선수를 고르세요 · 카드를 끌면 옮기거나 맞바꿉니다';
  }

  // ── 배선 ──────────────────────────────────────────────
  $('cnt-dec').onclick = () => { selected = null; commit(L.setCount(st, st.count - 1)); };
  $('cnt-inc').onclick = () => { selected = null; commit(L.setCount(st, st.count + 1)); };
  ($('shape') as HTMLSelectElement).onchange = (e) => { selected = null; commit(L.setShape(st, (e.target as HTMLSelectElement).value)); };
  document.querySelectorAll<HTMLElement>('#pitch-kind [data-kind]').forEach((b) => (b.onclick = () => commit(L.setPitch(st, b.dataset.kind as PitchKind))));
  $('auto').onclick = () => { if (!data) return; selected = null; commit(L.autoFill(st, data.players)); };
  $('sheet-handle').onclick = () => toggleSheet();

  // 명단은 다시 그릴 때마다 innerHTML 이 바뀌고, 표는 머리글 정렬 때 mountTable 이 스스로 다시 그린다 —
  // 그래서 행마다 붙이지 않고 바깥 한 곳에서 위임으로 받는다.
  const listBody = $('list-body');
  listBody.addEventListener('click', (e) => {
    const el = (e.target as Element).closest<HTMLElement>('[data-pick]');
    if (el) onPick(Number(el.dataset.pick));
  });
  listBody.addEventListener('keydown', (e) => {
    const el = (e.target as Element).closest<HTMLElement>('[role="button"][data-pick]');
    if (el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onPick(Number(el.dataset.pick)); }
  });

  document.querySelectorAll<HTMLElement>('#pos-filter .chip').forEach((b) => (b.onclick = () => { pos = b.dataset.pos!; document.querySelectorAll('#pos-filter .chip').forEach((x) => setChip(x, x === b)); render(); }));
  document.querySelectorAll<HTMLElement>('#view-toggle .chip').forEach((b) => (b.onclick = () => { view = b.dataset.view as View; save(VIEW_KEY, view); render(); }));
  ($('q') as HTMLInputElement).oninput = (e) => { q = (e.target as HTMLInputElement).value.trim(); render(); };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && selected !== null) { selected = null; render(); } });
  $('add').onclick = () => { const used = new Set(data!.players.map((p) => p.num)); let n = 1; while (used.has(n)) n++; location.href = href(`/squad/${n}/?new=1`); };
  window.addEventListener('wfc:admin', render);
  onData((d) => { data = d; render(); });
</script>
```

- [ ] **Step 2: CSS를 교체한다**

`src/styles/tokens.css` 376~400행(「스쿼드 피치」 절 전체: `.sq` ~ 899px 미디어쿼리)을 아래로 바꾼다:
```css
/* ══ 스쿼드 한 화면(명단 + 피치) ═══════════════════════════ */
.bd-controls { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s-sm) var(--s-md); margin-bottom: var(--s-lg); }
.bd-stepper { display: inline-flex; align-items: center; gap: var(--s-xs); }
.bd-stepper button { min-width: 40px; padding: 0; }
.bd-stepper b { min-width: 2ch; text-align: center; font-size: var(--fs-h-md); font-variant-numeric: tabular-nums; }
.bd-field { display: inline-flex; align-items: center; gap: var(--s-xs); }
.bd { display: grid; grid-template-columns: minmax(280px, 380px) minmax(0, 1fr); gap: var(--s-xl); align-items: start; }
.bd-list { display: flex; flex-direction: column; gap: var(--s-sm); min-width: 0; }
.bd-list-head { display: flex; flex-wrap: wrap; gap: var(--s-xs); align-items: center; }
.bd-sheet-handle { display: none; }
#list-body { max-height: calc(100dvh - var(--header-h) - 220px); overflow-y: auto; }
.bd-list .pcard-wall { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--s-md) var(--s-xs); }
.bd-rows { display: flex; flex-direction: column; background: var(--card); border-radius: var(--r-md); }
.bd-row { display: flex; align-items: center; border-bottom: 1px solid var(--hairline); }
.bd-row:last-child { border-bottom: 0; }
.bd-row.is-on { background: rgba(255, 255, 255, .08); }
.bd-pick { flex: 1; display: grid; grid-template-columns: 2.8em minmax(0, 1fr) auto 3.4em; align-items: center; gap: var(--s-xs);
  min-height: var(--row-h); padding: 0 var(--s-sm); border: 0; border-radius: 0; background: none; text-align: left; font-weight: var(--fw-body); }
.bd-pick b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: var(--fw-strong); }
.bd-row-ovr { font-weight: var(--fw-heavy); font-variant-numeric: tabular-nums; }
.bd-on { justify-self: end; padding: 2px var(--s-xs); border-radius: var(--r-full); background: var(--fg); color: var(--canvas); font-size: var(--fs-xs); font-weight: var(--fw-heavy); }
.bd-row-link { display: flex; align-items: center; justify-content: center; width: 40px; min-height: var(--row-h); color: var(--muted); }
.bd-row-link:hover { color: var(--fg); }
.bd-cardcell { display: flex; flex-direction: column; gap: var(--s-xxs); }
.bd-cardpick { border-radius: var(--r-md); cursor: pointer; }
.bd-cardpick.is-on { outline: 3px solid var(--fg); outline-offset: 2px; }
.bd-card-link { font-size: var(--fs-xs); color: var(--muted); text-align: center; }
.bd-stage { display: flex; flex-direction: column; align-items: center; gap: var(--s-sm); min-width: 0; }
#pitch-slot { display: flex; justify-content: center; width: 100%; }
/* 피치 바탕색은 옛 .sq-pitch 값을 그대로 가져왔다. */
.bd-pitch { position: relative; width: min(100%, 440px); background: #0b1a13; border-radius: var(--r-md); overflow: hidden;
  touch-action: none; user-select: none; -webkit-user-select: none; }
.bd-futsal { width: min(100%, 340px); }
.bd-lines, .bd-draw { position: absolute; inset: 0; width: 100%; height: 100%; }
.bd-lines { fill: none; stroke: rgba(255, 255, 255, .22); stroke-width: 1.5px; }
.bd-lines * { vector-effect: non-scaling-stroke; }
.bd-draw { pointer-events: none; }
.bd-slot { position: absolute; transform: translate(-50%, -50%); display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 1px; width: 72px; min-height: 58px; padding: var(--s-xxs); border-radius: var(--r-sm); touch-action: none; }
.bd-card { border: 0; color: var(--ink); }
/* 버튼 기본 :hover 배경이 금속 면을 덮지 않게 등급 면을 다시 박는다. */
.bd-card.pcard-gold, .bd-card.pcard-gold:hover { background: var(--metal-gold); }
.bd-card.pcard-silver, .bd-card.pcard-silver:hover { background: var(--metal-silver); }
.bd-card.pcard-bronze, .bd-card.pcard-bronze:hover { background: var(--metal-bronze); }
.bd-empty { border: 1px dashed var(--hairline-strong); background: rgba(0, 0, 0, .25); color: var(--muted); font-size: var(--fs-xs); }
.bd-slot.is-selected { outline: 3px solid var(--link); outline-offset: 2px; }
.bd-slot.is-oop { box-shadow: 0 0 0 2px var(--cond-mid); }
.bd-slot.is-dragging { z-index: 5; opacity: .85; }
.bd-ovr { font-size: var(--fs-h-md); font-weight: var(--fw-heavy); line-height: 1; font-variant-numeric: tabular-nums; }
.bd-name { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--fs-xs); font-weight: var(--fw-strong); line-height: 1.2; }
.bd-pos { font-size: 10px; font-weight: var(--fw-strong); color: var(--ink-soft); }
.bd-tools { display: flex; flex-wrap: wrap; justify-content: center; gap: var(--s-xs); }
.bd-hint { margin: 0; font-size: var(--fs-xs); text-align: center; }
@media (max-width: 899px) {
  .bd { grid-template-columns: minmax(0, 1fr); gap: var(--s-md); padding-bottom: 72px; }
  .bd-slot { width: 62px; min-height: 50px; }
  .bd-ovr { font-size: var(--fs-body); }
  /* 명단은 아래에서 끌어올리는 시트 — 접힌 높이는 손잡이 한 줄. */
  .bd-list { position: fixed; left: 0; right: 0; bottom: 0; z-index: 15; max-height: 64px; padding: 0 var(--s-md) var(--s-md);
    background: var(--elevated); border-top: 1px solid var(--hairline); border-radius: var(--r-lg) var(--r-lg) 0 0;
    overflow: hidden; transition: max-height var(--dur-slow) var(--ease-std); }
  .bd-list.is-open { max-height: 70dvh; overflow-y: auto; }
  .bd-sheet-handle { display: flex; justify-content: center; width: 100%; min-height: 56px; border: 0; border-radius: 0; background: none; font-size: var(--fs-sm); }
  #list-body { max-height: none; }
}
```

- [ ] **Step 3: 빌드 확인**

Run: `npm test`
Expected: PASS 전부.

- [ ] **Step 4: 실제로 눌러서 확인한다**

Run (백그라운드): `npm run dev` → `http://localhost:4321/weekly-fc/squad/`
Claude in Chrome으로 연다(연결된 브라우저가 여럿이면 사용자에게 고르게 한다). 데스크톱 폭에서 차례로:
1. 「자동 배치」 → 피치 11자리 모두 이름이 차고, 명단 「선발」 표시 11개.
2. 인원 「−」 여섯 번 → 5명, 포메이션 목록이 `1-2-1 · 2-2 · 3-1 · 1-3`, 경기장 풋살, 앞 다섯 명이 남음.
3. 빈 자리 없음 상태에서 벤치 선수 탭 → 토스트 「자리가 다 찼습니다 · 자리를 먼저 고르세요」.
4. 피치 GK 자리 탭 → 파란 테두리 + 안내 줄 「GK 자리 — …」 → 벤치 선수 탭 → GK 교체, 원래 GK는 벤치.
5. 자리 두 개를 차례로 탭 → 두 선수 맞바꿈.
6. 카드를 다른 카드 위로 끌기 → 교환. 카드를 빈 잔디로 끌기 → 그 위치로 이동.
7. 새로고침 → 같은 배치가 복원됨.
8. 명단 「표」 보기 → 머리글 정렬 뒤에도 「넣기」 버튼이 동작.
9. Esc → 고른 자리 풀림.
그다음 창을 390×844로 줄여서:
10. 명단이 아래 시트로 접혀 「명단 30명 · 선발 5/5」 손잡이만 보임, 손잡이 탭 → 펼침.
11. 자리 탭 → 시트가 자동으로 펼쳐지고 선수 탭으로 배치됨.
12. 피치 카드가 피치 밖으로 넘치지 않고, 가로 스크롤이 없음(`document.documentElement.scrollWidth === 390`을 콘솔로 확인).
Expected: 12개 모두 기대대로. 어긋나면 고치고 이 단계를 다시 한다.

- [ ] **Step 5: Commit**

```bash
git add src/pages/squad/index.astro src/styles/tokens.css
git commit -m "feat(squad): 명단 + 피치 한 화면 — 탭 두 번 배치, 끌어서 교환·이동, 모바일 명단 시트, 초안 복원

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DaDPzugZyKUdGnpyTH5KY4"
```

### Task 8: 그리기 도구 — 화살표 · 펜 · 되돌리기 · 지우기

**Files:**
- Create: `src/components/board-draw.ts`
- Modify: `src/pages/squad/index.astro` (도구 줄 마크업, 스크립트 `render`·배선), `src/styles/tokens.css` (스쿼드 절 끝)
- Test: `tests/unit/board-draw.test.mjs`

**Interfaces:**
- Consumes: `PITCH_DIM` (Task 6), `type Drawing`, `type Pt`, `addDrawing`, `undoDrawing`, `clearDrawings` (Task 5)
- Produces (Task 9가 쓴다):
  - `drawingsSvg(drawings: Drawing[], kind: PitchKind): string` — viewBox 단위(m)의 SVG 조각
  - `toDrawing(tool: 'arrow' | 'pen', pts: Pt[]): Drawing | null` — 너무 짧으면 null, 펜은 점을 솎는다
  - `type Tool = 'move' | 'arrow' | 'pen'`
  - `ARROW_HEAD: Record<PitchKind, number>` — 화살촉 길이(m)
  - `attachDraw(pitch: HTMLElement, kind: PitchKind, tool: 'arrow' | 'pen', base: string, onDone: (d: Drawing) => void): void`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

Create `tests/unit/board-draw.test.mjs`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { drawingsSvg, toDrawing } from '../../src/components/board-draw.ts';

test('화살표는 경기장 단위로 선 + 화살촉', () => {
  const svg = drawingsSvg([{ kind: 'arrow', from: [0, 0], to: [0.5, 0.5] }], 'futsal'); // 20×40
  assert.ok(svg.includes('x1="0.00" y1="0.00" x2="10.00" y2="20.00"'));
  assert.ok(svg.includes('<polyline'));
});

test('펜은 polyline 점 목록', () => {
  const svg = drawingsSvg([{ kind: 'pen', points: [[0, 0], [0.5, 1]] }], 'soccer'); // 68×105
  assert.ok(svg.includes('points="0.00,0.00 34.00,105.00"'));
});

test('그림이 없으면 빈 문자열', () => {
  assert.equal(drawingsSvg([], 'soccer'), '');
});

test('toDrawing: 짧은 화살표·점 하나는 버린다', () => {
  assert.equal(toDrawing('arrow', [[0.5, 0.5], [0.51, 0.51]]), null);
  assert.equal(toDrawing('pen', [[0.5, 0.5]]), null);
  assert.deepEqual(toDrawing('arrow', [[0.1, 0.1], [0.3, 0.2], [0.5, 0.5]]), { kind: 'arrow', from: [0.1, 0.1], to: [0.5, 0.5] });
});

test('toDrawing: 펜은 앞 점과 0.008 미만으로 붙은 점을 솎고 소수 셋째 자리로 줄인다', () => {
  const d = toDrawing('pen', [[0, 0], [0.001, 0.001], [0.1, 0.1], [0.10002, 0.1], [0.2, 0.23456]]);
  assert.deepEqual(d, { kind: 'pen', points: [[0, 0], [0.1, 0.1], [0.2, 0.235]] });
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/unit/board-draw.test.mjs`
Expected: FAIL — `Cannot find module '.../src/components/board-draw.ts'`

- [ ] **Step 3: 구현**

Create `src/components/board-draw.ts`:
```ts
// src/components/board-draw.ts — 피치 위 화살표·펜. 렌더(drawingsSvg·toDrawing)는 순수하고,
// 입력 배선은 attachDraw 하나에 모았다. 좌표는 정규 좌표로 저장하고 그릴 때 경기장 단위로 편다.
import type { Drawing, Pt } from '../lib/lineup.ts';
import type { PitchKind } from '../lib/formation.ts';
import { PITCH_DIM } from './pitch-view.ts';

export type Tool = 'move' | 'arrow' | 'pen';

const f = (v: number) => v.toFixed(2);
const r3 = (v: number) => Math.round(v * 1000) / 1000;
/** 화살촉 길이(m) — 축구장은 풋살장보다 세 배 넘게 커서 따로 둔다. 공유 이미지(share-image.ts)도 쓴다. */
export const ARROW_HEAD: Record<PitchKind, number> = { futsal: 1.2, soccer: 3 };
const ARROW_MIN = 0.03;
const PEN_STEP = 0.008;

export function drawingsSvg(drawings: Drawing[], kind: PitchKind): string {
  const { w, h } = PITCH_DIM[kind];
  return drawings.map((d) => {
    if (d.kind === 'pen') return `<polyline class="bd-ink" points="${d.points.map((p) => `${f(p[0] * w)},${f(p[1] * h)}`).join(' ')}"/>`;
    const x1 = d.from[0] * w, y1 = d.from[1] * h, x2 = d.to[0] * w, y2 = d.to[1] * h;
    const a = Math.atan2(y2 - y1, x2 - x1);
    const tip = (s: number) => `${f(x2 - ARROW_HEAD[kind] * Math.cos(a + s))},${f(y2 - ARROW_HEAD[kind] * Math.sin(a + s))}`;
    return `<g class="bd-ink"><line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}"/><polyline points="${tip(0.45)} ${f(x2)},${f(y2)} ${tip(-0.45)}"/></g>`;
  }).join('');
}

export function toDrawing(tool: 'arrow' | 'pen', pts: Pt[]): Drawing | null {
  if (pts.length < 2) return null;
  const a = pts[0], b = pts[pts.length - 1];
  if (tool === 'arrow') return Math.hypot(b[0] - a[0], b[1] - a[1]) < ARROW_MIN ? null : { kind: 'arrow', from: a, to: b };
  const out: Pt[] = [pts[0]];
  for (const p of pts.slice(1)) {
    const q = out[out.length - 1];
    if (Math.hypot(p[0] - q[0], p[1] - q[1]) >= PEN_STEP) out.push(p);
  }
  return out.length < 2 ? null : { kind: 'pen', points: out.map((p) => [r3(p[0]), r3(p[1])] as Pt) };
}

/** 그리기 도구일 때 피치 위 포인터로 선 하나를 만든다. 그리는 동안은 base(이미 있는 그림) 위에 미리보기를 덧그린다. */
export function attachDraw(pitch: HTMLElement, kind: PitchKind, tool: 'arrow' | 'pen', base: string, onDone: (d: Drawing) => void): void {
  const svg = pitch.querySelector<SVGSVGElement>('[data-draw]');
  if (!svg) return;
  pitch.classList.add('is-drawing');
  let pts: Pt[] = [];
  const at = (e: PointerEvent): Pt => {
    const r = pitch.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
  };
  const preview = () => {
    const d: Drawing | null = pts.length < 2 ? null : tool === 'arrow' ? { kind: 'arrow', from: pts[0], to: pts[pts.length - 1] } : { kind: 'pen', points: pts };
    svg.innerHTML = base + (d ? drawingsSvg([d], kind) : '');
  };
  pitch.onpointerdown = (e) => { if (e.button !== 0) return; pitch.setPointerCapture(e.pointerId); pts = [at(e)]; };
  pitch.onpointermove = (e) => { if (!pts.length) return; pts = tool === 'arrow' ? [pts[0], at(e)] : [...pts, at(e)]; preview(); };
  pitch.onpointerup = () => { if (!pts.length) return; const d = toDrawing(tool, pts); pts = []; if (d) onDone(d); else svg.innerHTML = base; };
  pitch.onpointercancel = () => { pts = []; svg.innerHTML = base; };
}
```

- [ ] **Step 4: 단위 테스트 통과 확인**

Run: `npm run test:unit`
Expected: PASS 전부.

- [ ] **Step 5: 페이지에 도구 줄을 붙인다**

`src/pages/squad/index.astro` 마크업의 `<div class="bd-tools" id="tools" role="toolbar" aria-label="도구"></div>`를 바꾼다:
```astro
      <div class="bd-tools" id="tools" role="toolbar" aria-label="도구">
        <div class="chips" id="tool" role="group" aria-label="그리기 도구"><button class="chip on" data-tool="move" aria-pressed="true">이동</button><button class="chip" data-tool="arrow" aria-pressed="false">화살표</button><button class="chip" data-tool="pen" aria-pressed="false">펜</button></div>
        <button type="button" id="undo">되돌리기</button>
        <button type="button" id="clear">지우기</button>
      </div>
```
스크립트 import에 추가:
```ts
  import { drawingsSvg, attachDraw, type Tool } from '../../components/board-draw.ts';
```
상태 변수(`let selected …` 다음 줄)에 추가:
```ts
  let tool: Tool = 'move';
```
`render()` 안의 두 줄
```ts
    $('pitch-slot').innerHTML = pitchHtml(st, d.players, selected);
    bindPitch();
```
을 아래로 바꾼다:
```ts
    const ink = drawingsSvg(st.drawings, st.pitch);
    $('pitch-slot').innerHTML = pitchHtml(st, d.players, selected, ink);
    const pitchEl = document.querySelector<HTMLElement>('[data-pitch]');
    if (tool === 'move') bindPitch();
    else if (pitchEl) attachDraw(pitchEl, st.pitch, tool, ink, (dr) => commit(L.addDrawing(st, dr)));
    ($('undo') as HTMLButtonElement).disabled = st.drawings.length === 0;
    ($('clear') as HTMLButtonElement).disabled = st.drawings.length === 0;
    document.querySelectorAll('#tool [data-tool]').forEach((b) => setChip(b, (b as HTMLElement).dataset.tool === tool));
```
`$('hint').textContent = …` 문장을 아래로 바꾼다:
```ts
    $('hint').textContent = tool === 'arrow' ? '피치 위를 끌어 화살표를 그립니다'
      : tool === 'pen' ? '피치 위를 끌어 자유롭게 그립니다'
      : selected !== null ? `${L.slotsOf(st)[selected].label} 자리 — 명단에서 선수를 누르거나, 다른 자리를 누르면 맞바꿉니다`
      : '자리를 누르고 선수를 고르세요 · 카드를 끌면 옮기거나 맞바꿉니다';
```
배선 절(`$('sheet-handle').onclick …` 다음)에 추가:
```ts
  document.querySelectorAll<HTMLElement>('#tool [data-tool]').forEach((b) => (b.onclick = () => { tool = b.dataset.tool as Tool; selected = null; render(); }));
  $('undo').onclick = () => commit(L.undoDrawing(st));
  $('clear').onclick = () => commit(L.clearDrawings(st));
```
`onPick`에서 그리기 도구 중에도 명단 배치는 그대로 동작하게 둔다(바꿀 것 없음).

- [ ] **Step 6: CSS**

`src/styles/tokens.css` 스쿼드 절의 `.bd-hint` 줄 다음에 추가:
```css
.bd-pitch.is-drawing { cursor: crosshair; }
.bd-pitch.is-drawing .bd-slot { pointer-events: none; }
.bd-ink, .bd-ink * { fill: none; stroke: var(--fg); stroke-width: 3px; stroke-linecap: round; stroke-linejoin: round; vector-effect: non-scaling-stroke; }
```

- [ ] **Step 7: 빌드와 눌러서 확인**

Run: `npm test`
Expected: PASS 전부.

`npm run dev` 상태에서 `/weekly-fc/squad/`를 Claude in Chrome으로:
1. 「화살표」 → 피치를 끌면 끄는 동안 미리보기, 놓으면 화살표가 남음. 화살촉이 끝점을 향함.
2. 「펜」 → 곡선이 남음.
3. 아주 짧게 탭만 하면 아무것도 안 남음.
4. 「되돌리기」 → 펜 선만 사라짐 → 「지우기」 → 전부 사라지고 두 버튼 비활성.
5. 화살표 하나 그리고 새로고침 → 복원됨.
6. 「이동」으로 돌아오면 카드 탭·끌기가 다시 동작, 그리기 중엔 카드가 눌리지 않음.
7. 390×844에서 손가락 끌기(터치 에뮬레이션)로 그려도 페이지가 스크롤되지 않음.
Expected: 7개 모두 기대대로.

- [ ] **Step 8: Commit**

```bash
git add src/components/board-draw.ts tests/unit/board-draw.test.mjs src/pages/squad/index.astro src/styles/tokens.css
git commit -m "feat(squad): 그리기 도구 — 화살표·펜·되돌리기·지우기

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DaDPzugZyKUdGnpyTH5KY4"
```

### Task 9: 이미지 공유

**Files:**
- Create: `src/lib/share.ts`, `src/components/share-image.ts`
- Modify: `src/pages/squad/index.astro` (공유 버튼·대화상자·스크립트), `src/styles/tokens.css` (스쿼드 절 끝)
- Test: `tests/unit/share.test.mjs`

**Interfaces:**
- Consumes: `slotsOf`, `positionOf`, `setTitle`, `defaultTitle`, `type LineupState` (Task 5), `PITCH_DIM` (Task 6), `ARROW_HEAD` (Task 8), `seoulToday` (`src/lib/html.ts`)
- Produces:
  - `type ShareEnv = { canShareFiles: boolean; ua: string; touchPoints: number }`
  - `type ShareMethod = 'share' | 'longpress' | 'download'`
  - `isIOS(env: ShareEnv): boolean`, `fallbackMethod(env: ShareEnv): 'longpress' | 'download'`, `pickShareMethod(env: ShareEnv): ShareMethod`, `shareFileName(today: string): string`
  - `drawLineupImage(c: HTMLCanvasElement, s: LineupState, players: Player[], title: string): void` — 1080×1350

- [ ] **Step 1: 실패하는 테스트를 쓴다**

Create `tests/unit/share.test.mjs`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { pickShareMethod, fallbackMethod, isIOS, shareFileName } from '../../src/lib/share.ts';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 25.5.0';
const IPAD_DESKTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15';
const ANDROID_KAKAO = 'Mozilla/5.0 (Linux; Android 15; SM-S928N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0 Mobile Safari/537.36;KAKAOTALK 2525500';

test('파일 공유가 되면 어디서든 공유 시트', () => {
  assert.equal(pickShareMethod({ canShareFiles: true, ua: ANDROID_KAKAO, touchPoints: 5 }), 'share');
});

test('공유가 안 되는 iOS(카톡 내부 브라우저 포함)는 길게 눌러 저장', () => {
  assert.equal(pickShareMethod({ canShareFiles: false, ua: IPHONE, touchPoints: 5 }), 'longpress');
});

test('데스크톱 모드 iPad(맥 UA + 터치)도 iOS 로 본다', () => {
  assert.equal(isIOS({ canShareFiles: false, ua: IPAD_DESKTOP, touchPoints: 5 }), true);
  assert.equal(isIOS({ canShareFiles: false, ua: IPAD_DESKTOP, touchPoints: 0 }), false);
});

test('그 외(Android 카톡·데스크톱)는 내려받기', () => {
  assert.equal(pickShareMethod({ canShareFiles: false, ua: ANDROID_KAKAO, touchPoints: 5 }), 'download');
  assert.equal(pickShareMethod({ canShareFiles: false, ua: IPAD_DESKTOP, touchPoints: 0 }), 'download');
});

test('공유 시트가 실패했을 때 대안은 OS 로만 가른다', () => {
  assert.equal(fallbackMethod({ canShareFiles: true, ua: IPHONE, touchPoints: 5 }), 'longpress');
  assert.equal(fallbackMethod({ canShareFiles: true, ua: ANDROID_KAKAO, touchPoints: 5 }), 'download');
});

test('파일 이름에 날짜', () => {
  assert.equal(shareFileName('2026-09-19'), 'weeklyfc-lineup-2026-09-19.png');
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/unit/share.test.mjs`
Expected: FAIL — `Cannot find module '.../src/lib/share.ts'`

- [ ] **Step 3: 공유 판단 구현**

Create `src/lib/share.ts`:
```ts
// src/lib/share.ts — 공유 이미지를 어떻게 내보낼지 고른다. 환경 값만 받는 순수 함수.
// 카카오톡 내부 브라우저는 iOS 에선 data URL, Android 에선 <a download> 만 받고 blob URL 다운로드는
// 둘 다 안 된다(devtalk.kakao.com/t/topic/146168). 파일 공유 가능 여부는 canShare 로 먼저 본다(MDN).
export type ShareEnv = { canShareFiles: boolean; ua: string; touchPoints: number };
export type ShareMethod = 'share' | 'longpress' | 'download';

/** iPadOS 는 데스크톱 모드에서 맥 UA 를 보내므로 터치 지점 수로 가른다. */
export const isIOS = (env: ShareEnv): boolean => /iPhone|iPad|iPod/i.test(env.ua) || (/Macintosh/i.test(env.ua) && env.touchPoints > 1);
export const fallbackMethod = (env: ShareEnv): 'longpress' | 'download' => (isIOS(env) ? 'longpress' : 'download');
export const pickShareMethod = (env: ShareEnv): ShareMethod => (env.canShareFiles ? 'share' : fallbackMethod(env));
export const shareFileName = (today: string): string => `weeklyfc-lineup-${today}.png`;
```

- [ ] **Step 4: 통과 확인**

Run: `npm run test:unit`
Expected: PASS 전부.

- [ ] **Step 5: 공유 이미지 그리기**

Create `src/components/share-image.ts`:
```ts
// src/components/share-image.ts — 라인업을 1080×1350(4:5, 카톡·인스타 피드 비율) PNG 로.
// 화면 캡처가 아니라 공유용으로 따로 그린다. 캔버스는 CSS 변수를 못 읽어 그리는 시점에 토큰을 읽는다.
// OVR 은 그리지 않는다 — 단톡방에 능력치 숫자가 도는 건 민감할 수 있다(2026-09-13 스펙 §5.1).
import { slotsOf, positionOf, type LineupState } from '../lib/lineup.ts';
import type { PitchKind } from '../lib/formation.ts';
import type { Player } from '../lib/types.ts';
import { PITCH_DIM } from './pitch-view.ts';
import { ARROW_HEAD } from './board-draw.ts';

export const IMG_W = 1080;
export const IMG_H = 1350;
const M = 64;
const PITCH_TOP = 224;
const PITCH_BOTTOM = 1196;

const tok = (name: string, fallback: string): string => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

function fit(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > maxW) s = s.slice(0, -1);
  return `${s}…`;
}

function box(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
}

/** 피치 선 — pitch-view.ts 의 SVG 와 같은 도형을 같은 단위(m)로 그린다. */
function pitchLines(ctx: CanvasRenderingContext2D, kind: PitchKind, sx: number, sy: number): void {
  const R = (x: number, y: number, w: number, h: number) => ctx.strokeRect(x * sx, y * sy, w * sx, h * sy);
  const Lx = (x1: number, y1: number, x2: number, y2: number) => { ctx.beginPath(); ctx.moveTo(x1 * sx, y1 * sy); ctx.lineTo(x2 * sx, y2 * sy); ctx.stroke(); };
  const C = (x: number, y: number, r: number) => { ctx.beginPath(); ctx.arc(x * sx, y * sy, r * sx, 0, Math.PI * 2); ctx.stroke(); };
  if (kind === 'soccer') {
    R(2, 2, 64, 101); Lx(2, 52.5, 66, 52.5); C(34, 52.5, 9.15);
    R(13.2, 2, 41.6, 16.5); R(24.8, 2, 18.4, 5.5); R(13.2, 86.5, 41.6, 16.5); R(24.8, 97.5, 18.4, 5.5);
    return;
  }
  R(1, 1, 18, 38); Lx(1, 20, 19, 20); C(10, 20, 3);
  for (const [y0, y1] of [[1, 8], [39, 32]]) {
    ctx.beginPath(); ctx.moveTo(4 * sx, y0 * sy); ctx.bezierCurveTo(4 * sx, y1 * sy, 16 * sx, y1 * sy, 16 * sx, y0 * sy); ctx.stroke();
  }
}

export function drawLineupImage(c: HTMLCanvasElement, s: LineupState, players: Player[], title: string): void {
  c.width = IMG_W;
  c.height = IMG_H;
  const ctx = c.getContext('2d')!;
  const font = tok('--font', 'sans-serif');
  const fg = tok('--fg', '#ffffff');
  const muted = tok('--muted', 'rgba(229, 229, 229, .55)');
  const posColor: Record<string, string> = { GK: tok('--pos-gk', '#d58b0b'), DF: tok('--pos-df', '#2a52be'), MF: tok('--pos-mf', '#208174'), FW: tok('--pos-fw', '#e3251e') };

  ctx.fillStyle = tok('--canvas', '#000000');
  ctx.fillRect(0, 0, IMG_W, IMG_H);

  // 머리 — 팀 표시, 제목, 포메이션
  ctx.textAlign = 'left';
  ctx.fillStyle = muted; ctx.font = `600 26px ${font}`; ctx.fillText('WEEKLY FC', M, 104);
  ctx.fillStyle = fg; ctx.font = `600 56px ${font}`; ctx.fillText(fit(ctx, title, IMG_W - M * 2 - 220), M, 178);
  ctx.textAlign = 'right'; ctx.fillStyle = muted; ctx.font = `500 34px ${font}`; ctx.fillText(s.shape, IMG_W - M, 178);

  // 피치 — 경기장 비율을 지키며 가운데
  const { w, h } = PITCH_DIM[s.pitch];
  const ph = PITCH_BOTTOM - PITCH_TOP;
  const pw = Math.min(IMG_W - M * 2, ph * (w / h));
  const px = (IMG_W - pw) / 2;
  const sx = pw / w, sy = ph / h;
  ctx.fillStyle = '#0b1a13'; box(ctx, px, PITCH_TOP, pw, ph, 16); ctx.fill();
  ctx.save();
  ctx.translate(px, PITCH_TOP);
  ctx.strokeStyle = 'rgba(255, 255, 255, .22)'; ctx.lineWidth = 3;
  pitchLines(ctx, s.pitch, sx, sy);

  // 그림 — 화살표·펜
  ctx.strokeStyle = fg; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const d of s.drawings) {
    ctx.beginPath();
    if (d.kind === 'pen') {
      d.points.forEach(([x, y], i) => (i ? ctx.lineTo(x * pw, y * ph) : ctx.moveTo(x * pw, y * ph)));
    } else {
      const x1 = d.from[0] * pw, y1 = d.from[1] * ph, x2 = d.to[0] * pw, y2 = d.to[1] * ph;
      const a = Math.atan2(y2 - y1, x2 - x1), head = ARROW_HEAD[s.pitch] * sx;
      ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
      ctx.moveTo(x2 - head * Math.cos(a + 0.45), y2 - head * Math.sin(a + 0.45)); ctx.lineTo(x2, y2);
      ctx.lineTo(x2 - head * Math.cos(a - 0.45), y2 - head * Math.sin(a - 0.45));
    }
    ctx.stroke();
  }

  // 선수 — 이름과 자리 라벨만. 포지션 색 띠로 무리를 구분한다.
  const byNum = new Map(players.map((p) => [p.num, p]));
  const cw = Math.round(pw * (s.pitch === 'soccer' ? 0.17 : 0.23)), ch = 70;
  ctx.textAlign = 'center';
  slotsOf(s).forEach((slot, i) => {
    const [nx, ny] = positionOf(s, i);
    const cx = nx * pw, cy = ny * ph;
    const num = s.slots[i];
    const p = num != null ? byNum.get(num) : undefined;
    if (!p) {
      ctx.setLineDash([8, 6]); ctx.strokeStyle = 'rgba(255, 255, 255, .38)'; ctx.lineWidth = 2;
      box(ctx, cx - cw / 2, cy - ch / 2, cw, ch, 8); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = muted; ctx.font = `500 22px ${font}`; ctx.fillText(slot.label, cx, cy + 8);
      return;
    }
    ctx.fillStyle = 'rgba(18, 19, 20, .9)'; box(ctx, cx - cw / 2, cy - ch / 2, cw, ch, 8); ctx.fill();
    ctx.fillStyle = posColor[slot.group] ?? muted; ctx.fillRect(cx - cw / 2, cy - ch / 2, cw, 6);
    ctx.fillStyle = fg; ctx.font = `600 26px ${font}`; ctx.fillText(fit(ctx, p.name, cw - 12), cx, cy + 6);
    ctx.fillStyle = muted; ctx.font = `500 18px ${font}`; ctx.fillText(slot.label, cx, cy + 28);
  });
  ctx.restore();

  // 주소. 벤치 줄은 넣지 않는다 — 참석 기록이 없어 선발이 아닌 전체 명단이 찍힌다(2026-09-13 사용자 결정).
  ctx.textAlign = 'left';
  ctx.fillStyle = muted; ctx.font = `400 20px ${font}`; ctx.fillText('byjunyoung.github.io/weekly-fc', M, 1310);
}
```

- [ ] **Step 6: 페이지에 공유 버튼과 대화상자를 붙인다**

`src/pages/squad/index.astro` 마크업 — `#tools` 안 `<button type="button" id="clear">지우기</button>` 다음 줄에 추가:
```astro
        <button type="button" class="primary" id="share">이미지 공유</button>
```
`</Shell>` 바로 앞에 추가:
```astro
  <wa-dialog id="share-modal" label="이미지 공유" with-footer class="bd-share">
    <label class="bd-share-title"><span class="label">제목</span><input id="share-title" maxlength="40" /></label>
    <img id="share-img" class="bd-share-img" alt="라인업 이미지 미리보기" />
    <p class="muted" id="share-note"></p>
    <div slot="footer" class="foot"><button data-close="share-modal">닫기</button><a class="btn" id="share-dl" hidden>내려받기</a><button class="primary" id="share-go" hidden>공유하기</button></div>
  </wa-dialog>
```
(`data-close`는 `Shell.astro`의 스크립트가 문서 전체에서 이미 배선한다.)

스크립트 import를 바꾸고 더한다:
```ts
  import { esc, toast, seoulToday } from '../../lib/html.ts';
  import { drawLineupImage } from '../../components/share-image.ts';
  import { pickShareMethod, fallbackMethod, shareFileName, type ShareEnv, type ShareMethod } from '../../lib/share.ts';
```
배선 절 끝(`onData(…)` 줄 바로 앞)에 추가:
```ts
  // ── 이미지 공유 ────────────────────────────────────────
  const dlg = (id: string) => document.getElementById(id) as HTMLElement & { open: boolean };
  const shareCanvas = document.createElement('canvas');
  let shareFile: File | null = null;
  const titleNow = () => st.title || L.defaultTitle(seoulToday());

  function shareEnv(file: File | null): ShareEnv {
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    let canShareFiles = false;
    try { canShareFiles = !!file && typeof nav.share === 'function' && !!nav.canShare?.({ files: [file] }); } catch { canShareFiles = false; }
    return { canShareFiles, ua: navigator.userAgent, touchPoints: navigator.maxTouchPoints || 0 };
  }

  async function drawShare(): Promise<File> {
    if (!data) throw new Error('명단을 아직 못 불러왔습니다');
    await document.fonts.ready; // Pretendard 가 늦게 오면 캔버스가 대체 글꼴로 굳는다
    drawLineupImage(shareCanvas, st, data.players, titleNow());
    const url = shareCanvas.toDataURL('image/png');
    ($('share-img') as HTMLImageElement).src = url;
    const dl = $('share-dl') as HTMLAnchorElement;
    dl.href = url;
    dl.download = shareFileName(seoulToday());
    const blob = await new Promise<Blob | null>((res) => shareCanvas.toBlob(res, 'image/png'));
    return new File([blob ?? new Blob()], shareFileName(seoulToday()), { type: 'image/png' });
  }

  function showMethod(m: ShareMethod): void {
    $('share-go').hidden = m !== 'share';
    $('share-dl').hidden = m !== 'download';
    $('share-note').textContent = m === 'longpress' ? '이미지를 길게 눌러 사진에 저장한 뒤 카톡으로 보내세요'
      : m === 'download' ? '내려받은 이미지를 카톡으로 보내세요'
      : '공유하기를 누르면 카톡 등으로 바로 보낼 수 있습니다';
  }

  $('share').onclick = async () => {
    selected = null;
    ($('share-title') as HTMLInputElement).value = titleNow();
    dlg('share-modal').open = true;
    try { shareFile = await drawShare(); showMethod(pickShareMethod(shareEnv(shareFile))); } catch (e) { toast((e as Error).message); }
  };
  ($('share-title') as HTMLInputElement).onchange = async (e) => {
    const v = (e.target as HTMLInputElement).value.trim();
    // 기본 제목을 그대로 두면 저장하지 않는다 — 다음 주에 열면 그 주 토요일로 다시 계산돼야 한다.
    commit(L.setTitle(st, v === L.defaultTitle(seoulToday()) ? '' : v));
    try { shareFile = await drawShare(); } catch (err) { toast((err as Error).message); }
  };
  $('share-go').onclick = async () => {
    if (!shareFile) return;
    try { await navigator.share({ files: [shareFile], title: titleNow() }); }
    catch (e) { if ((e as DOMException).name !== 'AbortError') showMethod(fallbackMethod(shareEnv(null))); }
  };
```

- [ ] **Step 7: CSS**

`src/styles/tokens.css` 스쿼드 절의 `.bd-ink` 줄 다음에 추가:
```css
.bd-share { --width: 560px; }
.bd-share-title { display: flex; align-items: center; gap: var(--s-xs); margin-bottom: var(--s-sm); }
.bd-share-title input { flex: 1; }
.bd-share-img { width: 100%; aspect-ratio: 4 / 5; border-radius: var(--r-md); background: var(--charcoal); }
```

- [ ] **Step 8: 빌드와 눌러서 확인**

Run: `npm test`
Expected: PASS 전부.

`npm run dev` 상태에서 `/weekly-fc/squad/`를 Claude in Chrome으로:
1. 6인 · 풋살 · 자동 배치 · 화살표 하나 그린 뒤 「이미지 공유」 → 대화상자에 4:5 미리보기, 제목 기본값이 다가오는 토요일.
2. 미리보기에서 확인: 이름·자리 라벨·화살표·주소가 있고 **OVR 숫자와 벤치 줄이 없음**, 글꼴이 Pretendard.
3. 제목을 「플랩 매치」로 바꾸고 칸 밖을 누름 → 미리보기 제목이 바뀜 → 새로고침 뒤 다시 열어도 「플랩 매치」.
4. 11인 · 축구 · 자동 배치로 바꾸고 다시 열기 → 3-5-2 등 줄 인원 5명 모양에서 이름이 읽힐 만큼만 겹침.
5. 데스크톱 크롬에서 보이는 버튼이 「공유하기」 또는 「내려받기」 중 하나이고, 누르면 동작(내려받기면 PNG 파일, 공유면 시스템 공유 창).
6. 미리보기 이미지를 스크래치패드에 PNG로 저장해 직접 열어 본다(`javascript_tool`로 `document.getElementById('share-img').src` 앞 60자와 길이 확인 → 대화상자 스크린샷을 사용자에게 보여준다).
Expected: 6개 모두 기대대로. iOS·Android 카톡 내부 브라우저 동작은 여기서 확인할 수 없다 — 배포 뒤 실기기 확인 항목으로 남긴다(스펙 §8).

- [ ] **Step 9: Commit**

```bash
git add src/lib/share.ts tests/unit/share.test.mjs src/components/share-image.ts src/pages/squad/index.astro src/styles/tokens.css
git commit -m "feat(squad): 라인업 이미지 공유 — 1080×1350, 공유 시트·iOS 길게 눌러 저장·내려받기 분기

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DaDPzugZyKUdGnpyTH5KY4"
```

### Task 10: 정리 — 전술판 삭제, 옛 주소, 상단바, 최종 확인

**Files:**
- Replace: `src/pages/tactics.astro` (넘김 페이지)
- Delete: `src/components/pitch.ts`, `src/components/lineup-svg.ts`, `src/lib/pitch-coords.ts`, `tests/unit/pitch-coords.test.mjs`
- Modify: `tests/build/dist.test.mjs`, `src/styles/tokens.css`

**Interfaces:**
- Consumes: `Redirect.astro` (Task 1)
- Produces: 없음

- [ ] **Step 1: 넘김 검사에 전술판을 더한다**

`tests/build/dist.test.mjs`의 「옛 주소는 새 주소로 넘긴다」 `cases`에 한 줄 추가:
```js
    'tactics/index.html': '/weekly-fc/squad/',
```

- [ ] **Step 2: 실패 확인**

Run: `npm run build && npm run test:build`
Expected: FAIL — `tactics/index.html → /weekly-fc/squad/`

- [ ] **Step 3: 전술판을 넘김으로 바꾸고 캔버스 엔진을 지운다**

Replace `src/pages/tactics.astro` 전체:
```astro
---
import Redirect from '../components/Redirect.astro';
---
<Redirect to="/squad/" title="스쿼드" />
```
```bash
git rm -q src/components/pitch.ts src/components/lineup-svg.ts src/lib/pitch-coords.ts tests/unit/pitch-coords.test.mjs
```

- [ ] **Step 4: 남은 참조를 찾는다**

Run: `grep -rnE "pitch-coords|lineup-svg|components/pitch'|pitch\.ts|/tactics/|PitchState|\bsq-|\.cond\b|cond-(up|down|none)|pitch-svg" src tests`
Expected: `src/pages/tactics.astro`의 넘김 한 줄과 아래 Step 5에서 지울 CSS·주석 말고는 없음. 다른 곳이 나오면 지운다.

- [ ] **Step 5: 쓰지 않는 CSS와 낡은 주석을 정리한다**

`src/styles/tokens.css`에서:
- `.cond { … }`, `.cond-up … .cond-down …`, `.cond-none { … }` 세 줄을 지운다(`--cond-mid` 변수는 `.is-oop`가 쓰므로 `:root`에 남긴다).
- `.pitch-svg { … }` 한 줄을 지운다.
- 「옛 이름 별칭」 주석의 `pitch.ts·avatar.ts·recap.ts·tactics.astro 는 토큰을 getComputedStyle 로 읽어 캔버스에`를 `avatar.ts 는 토큰을 getComputedStyle 로 읽어 SVG 에`로 고친다. 별칭 값 자체는 남긴다(`var(--accent)` 등 참조가 남아 있다 — `grep -rn "var(--accent)\|var(--bg)\|var(--surface)\|var(--line)" src`로 확인).

- [ ] **Step 6: 모바일 상단바를 확인한다**

Run (백그라운드): `npm run build && npm run preview`
Claude in Chrome으로 390×844 창에서 `/weekly-fc/`, `/weekly-fc/squad/`, `/weekly-fc/match/`, `/weekly-fc/rules/`를 차례로 열고 콘솔에서:
```js
[document.documentElement.scrollWidth, document.querySelector('.topbar-act').getBoundingClientRect().right]
```
Expected: 네 페이지 모두 `[390, ≤374]`(가로 넘침 0, 버튼이 오른쪽 여백 16px 안).
하나라도 `.topbar-act` 오른쪽 끝이 374를 넘으면 `src/styles/tokens.css`의 `@media (max-width: 699px)` 블록 안에 추가하고 다시 잰다:
```css
  .mark { font-size: var(--fs-h-md); }
  .topbar-act button { padding: 6px 12px; }
```

- [ ] **Step 7: 전체 테스트**

Run: `npm test`
Expected: PASS 전부(pitch-coords 테스트는 파일째 사라짐).

- [ ] **Step 8: 최종 화면 확인 — 사용자에게 보여줄 전/후**

preview 서버에서 1280×900, 390×844 두 폭으로 홈·스쿼드(6인 자동 배치 + 화살표 하나)·매치·운영 규칙을 캡처해 스크래치패드 `shots/final-*.png`로 저장한다.
확인 목록:
1. 탭이 네 개이고 옛 탭 이름이 어디에도 없다.
2. 선수 카드에 뒤집기 버튼·컨디션 배지가 없다(`/weekly-fc/squad/9/`).
3. 매치 상세에 참석·결과·라인업·리캡이 없고 영상이 나온다.
4. 운영 규칙에 미납 현황·내역·봉사표가 있고, 봉사표 두 이름이 같은 굵기로 나란히.
5. `/weekly-fc/tactics/`, `/weekly-fc/about/`, `/weekly-fc/record/duty/`를 주소창에 치면 각각 스쿼드·운영 규칙·운영 규칙 봉사 절로 넘어간다.
6. 모든 화면에서 `document.documentElement.scrollWidth`가 창 폭과 같다.
7. `prefers-reduced-motion`은 `tokens.css` 끝의 전역 규칙이 새 전환(`.bd-list`의 max-height)까지 덮는다 — 새 CSS에 `!important` 전환이나 JS 애니메이션을 추가하지 않았는지 `grep -n "animation\|transition" src/styles/tokens.css`로 새로 생긴 줄만 훑는다.
캡처는 SendUserFile로 사용자에게 보여준다(전/후 비교 — 전 화면은 `shots/tactics-d.png`, `tactics-m.png`, `home-d.png`, `squad-d.png`, `about-d.png`).

- [ ] **Step 9: Commit**

```bash
git add tests/build/dist.test.mjs src/pages/tactics.astro src/styles/tokens.css
git commit -m "chore: 캔버스 전술판 삭제 · /tactics/ 넘김 · 쓰지 않는 스타일 정리

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DaDPzugZyKUdGnpyTH5KY4"
```

- [ ] **Step 10: 멈추고 push 승인을 받는다**

push 하지 않는다. 사용자에게 전/후 캡처와 커밋 목록(`git log --oneline main..squad-ops-restructure`)을 보여주고 승인을 받는다. 승인 뒤 절차(이 계획 밖): `gh auth switch --user byjunyoung` → `main`에 병합 → `git push origin main` → 계정 복귀 → 배포 뒤 iOS·Android 폰에서 카톡 링크로 열어 공유 버튼 확인(스펙 §8).

---

## Self-Review (작성자 점검 결과)

**스펙 대조**
| 스펙 | 태스크 |
|---|---|
| §2 정보구조·옛 주소 | 1(기록 시즌), 2(탭·소개·벌금·봉사), 10(전술판) |
| §3.1 걷어내기 | 1 |
| §3.2 운영 탭 | 2 |
| §3.3 봉사 표시 | 2(봉사표), 3(홈) |
| §4.1 레이아웃·명단 보기 | 7 |
| §4.2 인원·포메이션·경기장 | 4, 5(setCount·setShape), 7(컨트롤) |
| §4.3 배치 규칙 | 5(규칙·테스트), 7(입력 배선) |
| §4.4 그리기 방식·도구 | 6, 8 |
| §4.5 빠지는 기능 | 10 |
| §4.6 초안 | 5(restore), 7(저장·복원) |
| §5 이미지 공유 | 9 |
| §6 상단바·dist 검사 | 2, 10 |
| §7 검증·배포 관문 | 각 태스크 확인 단계, 10 |

**스펙에 없는데 넣은 것** — 자리 두 개를 차례로 탭하면 맞바꾼다(Task 7). 스펙 §4.3 "탭 두 번으로 모든 배치가 되게"를 교환에도 적용한 것이다.

