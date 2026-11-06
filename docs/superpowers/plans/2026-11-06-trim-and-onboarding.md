# 포털 덜어내기 + 신규 멤버 안내 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 방명록·POTM·벌금 기록을 화면과 코드에서 빼고, 상단 메뉴를 8개에서 6개로 묶고, 새 멤버용 안내 페이지 `/guide/` 를 만든다.

**Architecture:** 지우는 일(Task 1~3)을 먼저 끝내 깨끗한 바닥을 만든 뒤 메뉴(Task 4)와 안내 페이지(Task 5)를 얹는다. 메뉴 구조는 순수 모듈 `src/lib/nav.ts` 하나에 두고 `Shell.astro` 가 그걸 읽어 상단 메뉴와 하위 탭 줄을 그린다. 서버(Supabase)는 건드리지 않는다.

**Tech Stack:** Astro 정적 페이지 + React 섬(Ant Design), `node --test` 단위·빌드 테스트.

**Spec:** `docs/superpowers/specs/2026-11-06-trim-and-onboarding-design.md`

## Global Constraints

- 서버 표·함수·마이그레이션은 손대지 않는다. `supabase/` 아래 파일 변경 없음.
- 기존 주소 `/matches/`, `/matches/new/`, `/lineup/`, `/rules/`, `/kit/` 는 그대로 열린다. `/matches/potm/` 은 `/matches/` 로 넘기는 `Redirect.astro` 페이지.
- 규칙 페이지 「비용 · 벌금」의 `FineRulesTable`·`FINE_EXEMPT`·사용처 문장과 `lib/rules.ts` 의 `FINE_*` 상수는 남긴다.
- `StatHistory.tsx` 의 `via === 'potm'` → 「POTM 보상」 분기는 남긴다. `StatLogRow.via` 타입의 `'potm'` 도 남긴다.
- 안내 페이지 문구는 포털 가입을 의무처럼 쓰지 않는다. "필수는 아니고 재미로" 를 밝힌다.
- 모든 페이지 noindex 유지. 코드 주석은 주변처럼 한국어, 날짜와 사용자 말 인용 형식.
- 커밋 메시지 끝에 다음 두 줄:
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01Piz8RToXgzX1GcLG5Re9Zr`

## Review Focus

1. 지난 POTM 보상 줄이 있는 선수의 능력치 기록 — 「POTM 보상」으로 계속 읽혀야 한다(「직접 고침」 금지). → Task 2 테스트.
2. 서버 `get_all` 은 계속 `fines`·매치의 `tally`·`voters` 를 보낸다 — 모르는 칸이 와도 `normalize` 가 죽지 않아야 한다. → Task 2·3 테스트.
3. 카톡에 남은 옛 링크 `/matches/potm/?m=12` — 빈 화면이 아니라 매치 목록으로 넘어가야 한다. → Task 2 빌드 테스트.
4. 하위 주소 `/matches/new/`, `/squad/12/`, `/guide/` 에서 상단 메뉴 활성 표시가 정확히 하나만 켜져야 한다. → Task 4 단위 테스트.
5. 안내 페이지에서 이미 이름을 고른 사람·로그인만 한 사람·로그인 안 한 사람 각각의 버튼 문구. → Task 5 단위 테스트.

---

### Task 1: 방명록 빼기

**Files:**
- Delete: `src/react/player/Guestbook.tsx`
- Modify: `src/react/player/PlayerDetail.tsx`(Guestbook 삽입부·import, 옮기기 Popconfirm 문구에서 "·방명록" 제거), `src/react/home/HomeApp.tsx`(guests 상태·`fetchRecentGuestbook`·「최근 방명록」 칸·오늘 요약의 `방명록 <b>` 줄), `src/lib/api.ts`(방명록 fetch/write 함수·RPC 이름·`RecentGuest`), `src/lib/types.ts`(`GuestbookRow`), `src/lib/card.ts`(`GUESTBOOK_MAX`·`guestbookProblem`), `src/react/shell/TopbarActions.tsx:167-168`, `src/react/stats/StatsApp.tsx`(방명록 열·머리 주석), `src/styles/tokens.css`(방명록 전용 규칙 `.hm-guests`·`.hm-guest-text`·`.gb-*` 등)
- Test: `tests/unit/card.test.mjs`, `tests/unit/admin-stats.test.mjs`, `tests/unit/home-model.test.mjs`

**Interfaces:**
- Produces: 라커룸 `.rail` 의 「최근 방명록」 자리에 임시로 아무것도 두지 않는다 — **이 Task 에서는 그 `LinkTile` 을 아래 안내 칸으로 바로 바꿔 넣는다**(격자에 구멍이 생긴 커밋을 만들지 않으려는 것):

```tsx
{/* 방명록 칸 자리(2026-11-06 방명록 제거) — 새 멤버 안내로. */}
<LinkTile to={href('/guide/')}>
  <span className="tile-label">처음 왔다면</span>
  <b className="tile-big">팀 안내</b>
  <span className="tile-sub">한 주 흐름 · 경기 영상 · 포털 쓰는 법</span>
</LinkTile>
```
  (`/guide/` 페이지는 Task 5 에서 생긴다. 그 전까지는 404 링크다 — Task 5 전에 배포하지 않는다.)

- [ ] **Step 1: 테스트에서 방명록 단언을 지우고, 남지 않음을 확인하는 테스트를 추가**

`tests/unit/card.test.mjs` 에서 `guestbookProblem`·`GUESTBOOK_MAX` 를 쓰는 테스트를 지운다. `tests/unit/admin-stats.test.mjs` 의 방명록 기대값을 지운다. `tests/build/dist.test.mjs` 맨 아래에 추가:

```js
import { execSync } from 'node:child_process';
const grepSrc = (re) => execSync(`grep -rilE "${re}" src || true`, { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
test('방명록은 화면·코드에서 뺐다(2026-11-06) — src 어디에도 남지 않는다', () => {
  assert.deepEqual(grepSrc('guestbook|방명록'), []);
});
```

- [ ] **Step 2: 실패 확인** — `npm run test:unit` 은 통과, `node --test tests/build/dist.test.mjs` 는 새 테스트가 파일 목록을 내며 FAIL.
- [ ] **Step 3: 위 Files 대로 지우고 고친다.** `TopbarActions` 문구는 `…지금까지 한 대결 판정도 ${picked.name} 이름으로 옮겨집니다.` / `이 선수가 맞나요? 대결 판정이 이 이름으로 남습니다.` 로.
- [ ] **Step 4: 통과 확인** — `npm test` 전부 PASS, `npx astro check` 새 오류 0.
- [ ] **Step 5: 커밋** — `feat: 방명록 제거 — 선수 페이지 칸·라커룸 칸(→ 팀 안내)·통계 열`

---

### Task 2: POTM 빼기

**Files:**
- Delete: `src/react/matches/PotmApp.tsx`, `public/og-potm.png`
- Modify: `src/pages/matches/potm/index.astro` → 내용 전체를 `<Redirect to="/matches/" title="매치" />` 로(형식은 `src/pages/about.astro` 와 같게)
- Modify: `src/lib/matches.ts`(`potmOf`·`applyPotm`·`currentPotm`·`CurrentPotm`·`potmShareText` 삭제, 머리 주석 정리), `src/lib/api.ts`(POTM 투표·집계 RPC와 관련 타입), `src/lib/auth.ts`(`Me.potm`), `src/lib/types.ts`(`Match` 의 tally·voters 칸과 주석. **`via` 의 `'potm'` 은 남긴다**)
- Modify: `src/react/matches/MatchesApp.tsx`([POTM 투표] 버튼·결과 줄·[POTM 이미지] 버튼), `src/react/PlayerCard.tsx`(`potmDate` prop·띠), `src/components/card-image.ts`(`potmDate` 옵션·띠 그리기. 상수 `POTM_GOLD` 는 다른 금색 표시에도 쓰이므로 `GOLD` 로 이름만 바꾼다. `CARD_Y` 등 배치 숫자는 그대로 두어 다른 카드 이미지 모양이 변하지 않게), `src/react/CardShareModal.tsx`·`ImageShareModal.tsx`(주석·옵션), `src/react/squad/RosterList.tsx`·`SquadApp.tsx`·`src/react/player/PlayerDetail.tsx`·`src/react/home/HomeApp.tsx`(`currentPotm`·`potm` prop·오늘 요약의 `POTM 표` 줄), `src/react/teams/TeamsApp.tsx:101,152`(문구), `src/react/stats/StatsApp.tsx`(POTM 표 열), `src/styles/tokens.css`(`.fcard-potm`·`.fcard-is-potm`·POTM 페이지 전용 규칙)
- Test: `tests/unit/matches.test.mjs`, `tests/unit/card.test.mjs`, `tests/unit/card-image.test.mjs`, `tests/unit/api.test.mjs`, `tests/unit/history.test.mjs`, `tests/build/dist.test.mjs`

**Interfaces:**
- Consumes: Task 1 의 `grepSrc` 헬퍼(`tests/build/dist.test.mjs`).
- Produces: `TeamsApp` 문구 — 101행 content `'팀 구성을 이걸로 덮어씁니다.'`, 152행 `external ? '스코어는 경기 뒤 매치 목록에서 넣습니다' : '그날 팀 구성이 매치 탭에 남습니다'`.

- [ ] **Step 1: 테스트를 먼저 바꾼다**

지울 것: `matches.test.mjs`·`card.test.mjs`·`card-image.test.mjs` 의 POTM 테스트, `dist.test.mjs:212` 의 og-potm 단언. 추가할 것:

```js
// tests/build/dist.test.mjs
test('POTM 은 뺐다(2026-11-06) — 옛 투표 주소는 매치 목록으로 넘긴다, 코드엔 기록 표기 하나만 남는다', () => {
  const html = read('matches/potm/index.html');
  assert.ok(html.includes('/weekly-fc/matches/'), '넘김 목적지');
  assert.ok(!html.includes('og-potm.png'));
  assert.ok(!existsSync('dist/og-potm.png'));
  assert.deepEqual(grepSrc('potm').sort(), ['src/lib/types.ts', 'src/react/player/StatHistory.tsx']);
});
```
(`existsSync` 가 import 돼 있지 않으면 `node:fs` 에서 추가.)

```js
// tests/unit/api.test.mjs — 서버가 옛 칸을 계속 보내도 죽지 않는다
test('normalize: 매치의 tally·voters 같은 옛 칸이 와도 무시한다', () => {
  const d = normalize({ players: [], matches: [{ id: 1, date: '2026-10-31', tally: { 7: 2 }, voters: 3 }] });
  assert.equal(d.matches.length, 1);
  assert.equal('tally' in d.matches[0], false);
});
```
(매치 한 줄에 필요한 최소 칸은 같은 파일의 기존 매치 정규화 테스트에서 가져온다.)

`tests/unit/history.test.mjs` — `StatHistory` 의 `why()` 가 export 돼 있지 않으면 export 하고:

```js
test("why: via 'potm' 줄은 계속 「POTM 보상」", () => {
  assert.equal(why({ via: 'potm' }, [], false), 'POTM 보상');
});
```
(인자 모양은 `why` 의 실제 시그니처에 맞춘다. `.tsx` 를 node 테스트가 못 읽으면 `why` 를 `src/react/player/model.ts` 로 옮겨 거기서 import.)

- [ ] **Step 2: 실패 확인** — `npm test` 에서 새 테스트 FAIL.
- [ ] **Step 3: 위 Files 대로 지우고 고친다.**
- [ ] **Step 4: 통과 확인** — `npm test` PASS, `npx astro check` 새 오류 0.
- [ ] **Step 5: 커밋** — `feat: POTM 제거 — 투표 페이지는 매치로 넘김, 카드 금색 띠·매치 카드 버튼·통계 열`

---

### Task 3: 벌금 기록 코드 빼기

**Files:**
- Modify: `src/lib/api.ts`(`normalizeFine`·`serializeFine`·`writeFine`/`deleteFine` RPC 이름, `EMPTY`·`normalize` 의 `fines`), `src/lib/types.ts`(`Fine`, `Data.fines`. `FineType` 은 `FineRulesTable`·`rules.ts` 가 쓰면 남긴다), `src/lib/stats.ts`(`fineSummary`), `src/react/rules/model.ts`(`unpaidRows`·`UnpaidRow`·`amountFor`·`FineDraft`·`emptyDraft`·`newFine`·`togglePaid`·`byDate`·`byPlayer`·`byType`·`byAmount`·`byPaid` — 다른 파일이 쓰는 것이 있으면 그것만 남긴다)
- 건드리지 않음: `src/react/rules/FineRulesTable.tsx`, `src/pages/rules.astro`, `src/lib/rules.ts`
- Test: `tests/unit/api.test.mjs`, `tests/unit/rules-model.test.mjs`, `tests/unit/stats.test.mjs`

- [ ] **Step 1: 테스트** — 세 파일에서 지운 함수의 테스트를 지우고 `api.test.mjs` 에 추가:

```js
test('normalize: 서버가 fines 를 보내도 Data 에 싣지 않는다(2026-11-06 벌금 기록 제거)', () => {
  const d = normalize({ players: [], fines: [{ id: 'f1', player: '김', type: '지각', amount: 30000 }] });
  assert.equal('fines' in d, false);
});
```
그리고 `dist.test.mjs` 에:

```js
test('벌금은 규칙 표만 남는다 — 기록 코드는 없다', () => {
  assert.deepEqual(grepSrc('writeFine|deleteFine|normalizeFine|unpaidRows|fineSummary'), []);
  assert.ok(read('rules/index.html').includes('노쇼'), '규칙의 벌금표는 그대로');
});
```
- [ ] **Step 2: 실패 확인**
- [ ] **Step 3: 구현**
- [ ] **Step 4: 통과 확인** — `npm test` PASS, `npx astro check` 새 오류 0.
- [ ] **Step 5: 커밋** — `chore: 벌금 기록 코드 제거 — 규칙의 벌금표는 그대로`

---

### Task 4: 메뉴 6개 + 하위 탭

**Files:**
- Create: `src/lib/nav.ts`, `tests/unit/nav.test.mjs`
- Modify: `src/layouts/Shell.astro`(`nav` 배열·`isActive` 를 `nav.ts` 로 교체, `<main>` 안 `<slot />` 위에 하위 탭 줄), `src/styles/tokens.css`(`.subnav`), `tests/build/dist.test.mjs:46-48`

**Interfaces:**
- Produces (`src/lib/nav.ts`, 경로는 전부 base 없는 `/…/` 꼴):

```ts
export type SubItem = { to: string; label: string; also?: string[] };   // also = 이 탭이 켜지는 다른 경로 접두
export type NavItem = { to: string; label: string; sub?: SubItem[] };
export const NAV: NavItem[] = [
  { to: '/', label: '라커룸' },
  { to: '/squad/', label: '명단' },
  { to: '/matches/', label: '매치', sub: [
    { to: '/matches/', label: '지난 경기' },          // /matches/new/ · /matches/potm/ 도 여기
    { to: '/lineup/', label: '라인업 짜기' },
  ] },
  { to: '/tier/', label: '티어' },
  { to: '/tactics/', label: '전술' },
  { to: '/guide/', label: '안내', sub: [
    { to: '/guide/', label: '처음 왔다면' },
    { to: '/rules/', label: '규칙' },
    { to: '/kit/', label: '자료' },
  ] },
];
/** 지금 경로에서 켜질 상단 메뉴와 하위 탭. 못 찾으면 둘 다 null(예: /stats/). */
export function activeNav(path: string): { top: NavItem | null; sub: SubItem | null };
```
  규칙: `/` 는 정확히 일치할 때만. 그 밖은 접두 일치이고, 하위 탭이 있는 메뉴는 하위 탭 중 하나가 맞으면 켜진다.

- [ ] **Step 1: 실패하는 테스트** (`tests/unit/nav.test.mjs`)

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { NAV, activeNav } from '../../src/lib/nav.ts';
const at = (p) => { const a = activeNav(p); return [a.top?.label ?? null, a.sub?.label ?? null]; };
test('상단 메뉴는 여섯', () => assert.deepEqual(NAV.map((n) => n.label), ['라커룸', '명단', '매치', '티어', '전술', '안내']));
test('activeNav: 경로마다 정확히 하나', () => {
  assert.deepEqual(at('/'), ['라커룸', null]);
  assert.deepEqual(at('/squad/12/'), ['명단', null]);
  assert.deepEqual(at('/squad/place/'), ['명단', null]);
  assert.deepEqual(at('/matches/'), ['매치', '지난 경기']);
  assert.deepEqual(at('/matches/new/'), ['매치', '지난 경기']);
  assert.deepEqual(at('/lineup/'), ['매치', '라인업 짜기']);
  assert.deepEqual(at('/tier/'), ['티어', null]);
  assert.deepEqual(at('/guide/'), ['안내', '처음 왔다면']);
  assert.deepEqual(at('/rules/'), ['안내', '규칙']);
  assert.deepEqual(at('/kit/'), ['안내', '자료']);
  assert.deepEqual(at('/stats/'), [null, null]);
});
```
`dist.test.mjs:46-48` 을 여섯 개로 바꾸고(`'라커룸','명단','매치','티어','전술','안내'`, 제목의 날짜 메모에 2026-11-06 덧붙임) 추가:

```js
test('묶인 메뉴는 하위 탭 줄을 보인다(2026-11-06) — 규칙에선 안내 > 규칙, 라인업에선 매치 > 라인업 짜기', () => {
  const rules = read('rules/index.html');
  assert.match(rules, /class="subnav"[\s\S]*처음 왔다면[\s\S]*규칙[\s\S]*자료/);
  assert.ok(!read('index.html').includes('class="subnav"'), '하위 탭 없는 메뉴엔 줄이 없다');
  assert.match(read('lineup/index.html'), /class="subnav"[\s\S]*지난 경기[\s\S]*라인업 짜기/);
});
```
- [ ] **Step 2: 실패 확인** — `npm run test:unit` 에서 nav.test FAIL(모듈 없음).
- [ ] **Step 3: `src/lib/nav.ts` 구현.**
- [ ] **Step 4: `Shell.astro`** — base 를 뗀 경로(이미 `ogUrl` 계산에 있는 방식)로 `activeNav` 를 부르고, 상단 메뉴는 `NAV` 로, `top?.sub` 가 있으면 `<main>` 첫 줄에:

```astro
<nav class="subnav" aria-label={`${top.label} 하위 메뉴`}>
  {top.sub.map((s) => <a href={href(s.to)} class:list={[{ active: s === sub }]}>{s.label}</a>)}
</nav>
```
  `.subnav` 는 `/rules/` 의 `.tabs` 목차 줄과 눈에 구분되게: 밑줄 탭 모양(활성 탭 아래 2px 줄, 배경 없음), 390px 에서 한 줄 가로 스크롤. `.tabs`(칩 모양)는 그대로 둔다.
- [ ] **Step 5: 통과 확인** — `npm test` PASS.
- [ ] **Step 6: 커밋** — `feat: 상단 메뉴 여덟 → 여섯 — 매치(지난 경기·라인업 짜기)·안내(처음 왔다면·규칙·자료) 하위 탭`

---

### Task 5: 안내 페이지 `/guide/`

**Files:**
- Create: `src/pages/guide/index.astro`, `src/react/guide/GuideStart.tsx`, `src/react/guide/model.ts`, `tests/unit/guide-model.test.mjs`
- Modify: `src/styles/tokens.css`(`.guide-*`), `tests/build/dist.test.mjs`

**Interfaces:**
- Consumes: `LINKS`·`MATCH_TIME`·`MATCH_MIN`·`PLACES`·`BANK`(`src/lib/rules.ts`), `useMeInfo()`(`src/react/useMe.ts`), `window.dispatchEvent(new Event('wfc:open-me'))` 로 로그인 창 열기, `Me` 타입(`src/lib/auth.ts`), Task 4 의 `/guide/` 메뉴.
- Produces (`src/react/guide/model.ts`):

```ts
import type { Me } from '../../lib/auth.ts';
export type StartView =
  | { kind: 'linked'; text: string; to: string }    // 이미 이름을 고름
  | { kind: 'cta'; button: string; hint: string };
export function startView(me: Me): StartView;
```

- [ ] **Step 1: 실패하는 테스트** (`tests/unit/guide-model.test.mjs`)

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { startView } from '../../src/react/guide/model.ts';
test('startView: 로그인 전', () => assert.deepEqual(startView({ login: false }),
  { kind: 'cta', button: '로그인하고 내 이름 고르기', hint: '메일로 6자리 코드를 받아 로그인합니다' }));
test('startView: 로그인만 함', () => assert.deepEqual(startView({ login: true, num: null }),
  { kind: 'cta', button: '내 이름 고르기', hint: '명단에 이름이 없으면 단톡방에 알려 주세요' }));
test('startView: 이름까지 고름', () => assert.deepEqual(startView({ login: true, num: 37, name: '송유림' }),
  { kind: 'linked', text: '송유림 님으로 연결됐습니다', to: '/squad/37/' }));
```
`dist.test.mjs` 에 추가(파일 맨 위 필수 페이지 목록에도 `'guide/index.html'`):

```js
test('안내 > 처음 왔다면(2026-11-06) — 꼭 알아 둘 것과 재미로 하는 것을 나눈다, 가입은 필수가 아니다', () => {
  const html = read('guide/index.html');
  for (const s of ['꼭 알아 둘 것', '재미로 하는 것', '필수는 아니고', 'youtube.com/@WEEKLYFC2020', '카카오뱅크', '토요일 오전 10–12시']) assert.ok(html.includes(s), s);
  assert.ok(html.includes('/weekly-fc/og.png'));
  assert.ok(!html.includes('자기소개 양식'), '양식은 봇이 보낸다');
});
```
- [ ] **Step 2: 실패 확인**
- [ ] **Step 3: `model.ts`·`GuideStart.tsx`** — `GuideStart` 는 `useMeInfo()` → `startView`. `cta` 면 Ant `Button type="primary"`(누르면 `wfc:open-me`) + hint 한 줄, `linked` 면 문구 + [내 선수 페이지 →] 링크(`href(to)`).
- [ ] **Step 4: `src/pages/guide/index.astro`** — `<Shell title="처음 왔다면" description="WEEKLY FC 새 멤버 안내 — 한 주 흐름, 시간·장소·정산, 경기 영상, 포털 쓰는 법.">`. `rules.astro` 처럼 `page-head` + `article.prose.stack`. 문구(이대로):

```
h1  처음 왔다면
머리 한 줄  WEEKLY FC 에 오신 걸 환영합니다. 매주 토요일 풋살을 하는 팀입니다.

[묶음 제목] 꼭 알아 둘 것
h2 한 주 흐름
  ol 1. 주중에 단톡방 투표로 참석 여부 표시
     2. {MATCH_MIN}명 이상 모이면 진행 — {MATCH_TIME}
     3. 경기 끝나고 단톡방에서 당일 정산
h2 언제 어디서
  ul 시간: {MATCH_TIME} / 장소: {PLACES.join(' / ')} / 비가 오면 논의 후 결정
h2 비용 · 모임 통장
  ul 대관비·음료비는 그날 참석자끼리 나눕니다
     {BANK.name} {BANK.number} ({BANK.holder}) · 통장 초대 문의: {BANK.contact}
     지각·노쇼 벌금 등 자세한 건 [규칙 →](/rules/)

[묶음 제목] 재미로 하는 것
h2 경기 영상
  p 경기 영상은 유튜브 채널에 올라갑니다. 지난 경기는 매치 탭에서도 볼 수 있습니다.
  버튼줄 [유튜브 채널 →](LINKS.youtube, 새 창) [매치 →](/matches/) [인스타그램 →](LINKS.instagram, 새 창)
h2 포털
  p 지금 보고 있는 이 사이트입니다. 필수는 아니고 재미로 쓰는 곳입니다.
    이름을 고르면 내 선수 카드를 꾸미고, 티어 대결에서 팀원 능력치를 판정할 수 있습니다.
  <GuideStart client:load />

[마무리]
h2 에티켓
  ul 투표에 꼭 참여하기 / 불참 등 특이사항은 미리 공유 / 서로 존중하는 채팅
  p 궁금한 건 단톡방에 편하게 물어보세요.
```
  묶음 제목은 `.guide-part`(작은 라벨 + 윗줄 구분선)로, 두 묶음이 한눈에 나뉘게.
- [ ] **Step 5: 통과 확인** — `npm test` PASS, `npx astro check` 새 오류 0.
- [ ] **Step 6: 커밋** — `feat: 안내 > 처음 왔다면(/guide/) — 새 멤버용 고정 안내, 가입은 권유`

---

### Task 6: 눌러서 확인 · 배포 · 기록

- [ ] **Step 1:** `npm run build && npm run preview` 뒤 브라우저로 1280px·390px 에서 확인 — 메뉴 여섯 개가 한 줄에 들어가는가, 하위 탭 전환과 활성 표시, `/rules/` 에서 하위 탭 줄과 목차 줄이 구분되는가, 라커룸 격자에 구멍이 없는가, `/guide/` 버튼이 로그인 창을 여는가, `/matches/potm/?m=1` 이 매치로 넘어가는가, 선수 페이지·매치 카드에 방명록·POTM 흔적이 없는가.
- [ ] **Step 2:** 문제를 고치고 `npm test` 재확인.
- [ ] **Step 3:** `git push origin main`, Pages 배포 완료 뒤 실제 주소 `https://byjunyoung.github.io/weekly-fc/guide/` 가 200 인지 확인(캐시 10분 감안).
- [ ] **Step 4:** 메모리 `weekly-fc-portal.md` 에 2026-11-06 항목 추가.
