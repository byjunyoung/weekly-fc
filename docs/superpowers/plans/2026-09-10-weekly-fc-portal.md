# WEEKLY FC 포탈 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 단일 index.html 모바일 앱 흉내를 Astro 기반 반응형 웹 포탈로 다시 짜고, 전술보드를 그 안으로 흡수한다.

**Architecture:** Astro 정적 페이지 + 페이지마다 `<script>`에서 Apps Script(구글시트)를 fetch해 HTML 문자열로 렌더. 프레임워크·외부 라이브러리 없음. 공통 로직은 `src/lib/*.ts`(순수 함수, node:test로 검증), 화면은 `src/pages/*.astro`, 셸은 `src/layouts/Shell.astro`. 전술보드 엔진은 `src/components/pitch.ts`로 이식.

**Tech Stack:** Astro 7, @astrojs/sitemap, TypeScript(타입만), node:test, GitHub Actions → Pages, Google Apps Script.

**Spec:** `docs/superpowers/specs/2026-09-10-weekly-fc-portal-design.md` — 이 계획은 스펙을 근거로 한다. 실행자는 둘 다 읽는다.

## Global Constraints

- Node ≥ 22.18 (`.ts`를 node가 직접 읽는다). 로컬 v25.8.1. 테스트는 `.mjs`에서 `.ts`를 확장자 포함해 import.
- 의존성은 `astro`·`@astrojs/sitemap`만. devDependencies는 `@astrojs/check`·`typescript`(타입 검사용)만. 다른 패키지 추가 금지 — 필요하면 이유를 적고 사용자 확인.
- 색·치수·글자 크기는 `src/styles/tokens.css`에서만. 컴포넌트·페이지에 hex·px 직접 쓰기 금지 (예외: `0`, `1px` 선 두께, `100%`, 비율).
- 폰트 Pretendard Variable 하나 (jsdelivr dynamic subset). 모서리 각지게(`border-radius: 0`), 1px 선, 그림자·트랜지션·애니메이션 없음.
- `base: '/weekly-fc'`, `site: 'https://byjunyoung.github.io'`, `trailingSlash: 'always'`. 내부 링크는 `href()` 헬퍼로만.
- 기본 `<meta name="robots" content="noindex">`. `/tactics/`·`/about/`만 index 허용 + sitemap.
- 라이트 고정. `prefers-color-scheme` 대응 없음.
- 공개 소스에 실명·전화번호를 넣지 않는다. 명단은 항상 시트에서 온다. 전화는 `getAllFull(pin)`으로만.
- 커밋 identity는 이 레포에 로컬로 `byjunyoung <junyoung735@gmail.com>` 설정돼 있다. 커밋은 자유, **push는 사용자 "go" 이후에만** (`gh auth switch --user byjunyoung` → push → `gh auth switch --user xyz-jun`).
- `~/Documents`는 iCloud. `node_modules`는 `node_modules.nosync` 실폴더 + 심링크로 둔다. `nosync-setup.sh` 스크립트는 돌리지 않는다(메모리의 함정). 손으로 만든다.
- 외부 쓰기(Apps Script 재배포, GitHub Pages 설정 변경, tactics-board 레포 아카이브, push)는 전부 미리보기 → 사용자 "go".
- 커밋 메시지 끝에 붙일 것:
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_019xENDCK12Exf9tR6cxD9Vd
  ```

## 파일 지도

```
weekly-fc/
  package.json · astro.config.mjs · tsconfig.json · .gitignore
  .github/workflows/deploy.yml       main push → 빌드 → Pages
  public/robots.txt · public/favicon.svg
  src/styles/tokens.css              색·치수·글자 + 공통 클래스 (유일한 출처)
  src/layouts/Shell.astro            사이드바 · 모바일 헤더 · noindex · PIN 모달 · 이름 고르기
  src/components/Tabs.astro          화면 안 탭 줄 (정적 링크)
  src/components/table.ts            정렬 표 렌더러
  src/components/lineup-svg.ts       저장된 라인업을 SVG로 (읽기 전용)
  src/components/pitch.ts            전술보드 엔진 (tactics-board 이식)
  src/components/recap.ts            리캡 카드 canvas
  src/lib/types.ts                   데이터 타입
  src/lib/url.ts                     href(base)
  src/lib/html.ts                    esc · 날짜·금액 포맷 · 유튜브 URL
  src/lib/api.ts                     Apps Script 호출 · 캐시 · PIN
  src/lib/me.ts                      내 이름(기기 저장)
  src/lib/rules.ts                   벌금·시간·장소·통장·링크 상수
  src/lib/stats.ts                   OVR · 등급 · 색밴드 · 출석률 · 승률 · 정산 집계
  src/lib/rotation.ts                봉사 로테이션
  src/lib/parse.ts                   유튜브 제목 파서 · 붙여넣기 파서
  src/pages/index.astro              홈
  src/pages/squad/index.astro        스쿼드 표
  src/pages/squad/[num].astro        선수 (1~99)
  src/pages/match/index.astro        매치 목록 + ?d= 상세 + 관리자 흐름
  src/pages/record/index.astro       기록 — 시즌
  src/pages/record/fines.astro       기록 — 정산
  src/pages/record/duty.astro        기록 — 봉사
  src/pages/tactics.astro            전술보드
  src/pages/about.astro              소개·모집·규칙
  apps-script.gs                     백엔드 (갱신)
  tests/unit/*.test.mjs              lib 단위 테스트
  tests/build/dist.test.mjs          빌드 산출물 검사
  legacy/index.html                  옛 앱 (참고용, Task 15에서 삭제)
```

## 공통 인터페이스 (모든 태스크가 이 이름을 쓴다)

```ts
// src/lib/types.ts
export type Pos = 'GK' | 'DF' | 'MF' | 'FW';
export type Player = { num: number; name: string; pos: Pos | ''; detail: string; foot: string; vest: number | null; note: string;
  pace: number; dribble: number; pass: number; shoot: number; defend: number; stamina: number; rot: number | null; phone?: string };
export type Team = { name: string; players: string[]; points: number | null };
export type MatchType = '2파전' | '3파전' | '';
export type Match = { id: string; date: string; location: string; youtube: string; type: MatchType; attendees: string[]; teams: Team[]; winner: string };
export type FineType = '지각' | '노쇼';
export type Fine = { id: string; date: string; match_id: string; player: string; type: FineType; amount: number; paid: boolean };
export type RotationRow = { year: number; month: number; p1: string; p2: string; done: boolean };
export type Lineup = { id: string; match_id: string; name: string; formation: string; assignments: string };
export type Video = { id: string; title: string; published: string };
export type Data = { players: Player[]; matches: Match[]; rotation: RotationRow[]; fines: Fine[]; lineups: Lineup[] };
export const STAT_KEYS = ['pace', 'dribble', 'pass', 'shoot', 'defend', 'stamina'] as const;
export type StatKey = (typeof STAT_KEYS)[number];
```

```
api.ts      onData(render) · refresh() · cached() · loadVideos() · isAdmin() · login(pin) · logout() · write(action, payload) · fetchFull()
            serializeMatch(m) · serializeFine(f) · serializeRotation(r) · serializeLineup(l) · serializePlayer(p)
me.ts       getMe(): number|null · setMe(num|null) · 이벤트 'wfc:me'
stats.ts    ovr · grade · band · STAT_CUTS · RATE_CUTS · attendance · wins · seasonTable · fineSummary · yearOf
rotation.ts rotationOrder · computeMonth · rotationFor · yearRows · nextDuty
parse.ts    parseVideoTitle · proposeMatches · parseAttendance
table.ts    Column<T> · TableState · sortRows · renderTable · mountTable
html.ts     esc · fmtDate · fmtWon · ytThumb · ytEmbed · ytWatch · monthLabel
url.ts      href(path)
이벤트      'wfc:data'(detail: Data) · 'wfc:admin' · 'wfc:me'
```

시트 저장 형식: `attendees`는 `"이름, 이름"` 문자열, `teams`는 JSON 문자열, `paid`·`done`은 `'TRUE'|'FALSE'`, 날짜는 `YYYY-MM-DD` 문자열.

---

### Task 1: 프로젝트 골격 + 셸 + 배포 워크플로

**Files:**
- Move: `index.html` → `legacy/index.html`
- Create: `package.json`, `astro.config.mjs`, `tsconfig.json`, `.gitignore`, `src/styles/tokens.css`, `src/lib/url.ts`, `src/layouts/Shell.astro`, `src/pages/index.astro`, `public/robots.txt`, `public/favicon.svg`, `.github/workflows/deploy.yml`, `tests/build/dist.test.mjs`

**Interfaces:**
- Produces: `href(path)`, `Shell` props `{ title: string; index?: boolean; wide?: boolean; description?: string }`, 토큰 이름 전부.

- [ ] **Step 1: 옛 앱을 치우고 node_modules 자리를 만든다**

```bash
cd ~/Documents/프로젝트/개발/weekly-fc
git mv index.html legacy/index.html 2>/dev/null || (mkdir -p legacy && git mv index.html legacy/index.html)
mkdir -p node_modules.nosync && ln -s node_modules.nosync node_modules
```

- [ ] **Step 2: package.json**

```json
{
  "name": "weekly-fc",
  "type": "module",
  "private": true,
  "engines": { "node": ">=22.18.0" },
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview",
    "check": "astro check",
    "test:unit": "node --test \"tests/unit/*.test.mjs\"",
    "test:build": "node --test \"tests/build/*.test.mjs\"",
    "test": "npm run test:unit && npm run build && npm run test:build"
  },
  "dependencies": {
    "@astrojs/sitemap": "^3.7.4",
    "astro": "^7.3.1"
  },
  "devDependencies": {
    "@astrojs/check": "^0.9.10",
    "typescript": "^6.0.3"
  }
}
```

- [ ] **Step 3: astro.config.mjs · tsconfig.json · .gitignore**

```js
// astro.config.mjs
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://byjunyoung.github.io',
  base: '/weekly-fc',
  trailingSlash: 'always',
  integrations: [sitemap({ filter: (page) => /\/weekly-fc\/(tactics|about)\/$/.test(page) })],
});
```

```json
{
  "extends": "astro/tsconfigs/strict",
  "include": [".astro/types.d.ts", "src/**/*"],
  "exclude": ["dist", "legacy", "node_modules"]
}
```

```
# .gitignore
dist/
node_modules
node_modules.nosync/
.astro/
.DS_Store
```

- [ ] **Step 4: 설치 후 심링크가 살아 있는지 확인**

```bash
npm install
ls -ld node_modules   # "node_modules -> node_modules.nosync" 여야 한다
```
실폴더로 바뀌어 있으면(메모리의 함정): `mv node_modules nm_tmp && rm -rf node_modules.nosync && mv nm_tmp node_modules.nosync && ln -s node_modules.nosync node_modules`. 그다음 `npm ls --depth=0`이 missing/invalid 없이 나와야 한다.

- [ ] **Step 5: src/lib/url.ts**

```ts
// base 경로('/weekly-fc')를 붙인 내부 링크. 페이지·스크립트 어디서나 이것만 쓴다.
const base = ((import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/').replace(/\/$/, '');
export const href = (path: string): string => base + (path.startsWith('/') ? path : '/' + path);
```

- [ ] **Step 6: src/styles/tokens.css**

```css
/* src/styles/tokens.css — 색·치수·글자의 유일한 출처 */
:root {
  --bg: #ffffff; --surface: #f7f7f5; --tint: #efefec;
  --fg: #161616; --muted: #6b6b6b; --line: #d6d6d2;
  --pos-gk: #f59e0b; --pos-df: #3b82f6; --pos-mf: #10b981; --pos-fw: #ef4444;
  --val-a: #1a7f37; --val-b: #4d7c0f; --val-c: #b45309; --val-d: #b91c1c;
  --val-a-bg: #e6f4ea; --val-b-bg: #eef6df; --val-c-bg: #fdf1e0; --val-d-bg: #fdecec;
  --warn: #b91c1c; --warn-bg: #fdecec; --ok: #1a7f37;
  --gold: #c9a227; --silver: #8c8c8c; --bronze: #a05a2c;
  --sidebar: 220px; --sidebar-narrow: 56px; --header-h: 48px;
  --max: 1120px; --pad: 24px; --gap: 16px; --gap-lg: 32px;
  --fs-xs: 11px; --fs-sm: 13px; --fs-md: 15px; --fs-lg: 20px; --fs-xl: 32px;
  --font: "Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Roboto, "Helvetica Neue", "Segoe UI", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif;
}
* { box-sizing: border-box; }
html { background: var(--bg); color: var(--fg); font-family: var(--font); font-size: var(--fs-md); line-height: 1.55; -webkit-font-smoothing: antialiased; word-break: keep-all; }
body { margin: 0; min-height: 100vh; }
a { color: inherit; text-decoration: none; }
button, input, select, textarea { font: inherit; color: inherit; }
button { background: none; border: 1px solid var(--line); padding: 6px 12px; cursor: pointer; border-radius: 0; }
button.primary { background: var(--fg); color: var(--bg); border-color: var(--fg); }
button.danger { color: var(--warn); border-color: var(--warn); }
button:disabled { opacity: .4; cursor: default; }
input, select, textarea { border: 1px solid var(--line); background: var(--bg); padding: 6px 8px; border-radius: 0; }
img, video, canvas { display: block; max-width: 100%; height: auto; }
h1, h2, h3 { margin: 0; font-weight: 600; }
h1 { font-size: var(--fs-lg); }
h2 { font-size: var(--fs-md); }
.muted { color: var(--muted); }
.label { font-size: var(--fs-xs); letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }

/* 셸 */
.mhead { display: none; }
.side { position: fixed; top: 0; left: 0; bottom: 0; width: var(--sidebar); border-right: 1px solid var(--line); background: var(--bg); display: flex; flex-direction: column; padding: 20px 0; }
.side .mark { display: block; padding: 0 20px 20px; font-weight: 600; letter-spacing: .18em; text-transform: uppercase; font-size: var(--fs-md); }
.side nav { display: flex; flex-direction: column; }
.side nav a { display: flex; align-items: center; gap: 10px; padding: 10px 20px; color: var(--muted); border-left: 2px solid transparent; }
.side nav a:hover { color: var(--fg); }
.side nav a.active { color: var(--fg); border-left-color: var(--fg); background: var(--surface); }
.side .nav-short { display: none; width: 20px; text-align: center; font-weight: 600; }
.side-foot { margin-top: auto; padding: 12px 20px 0; display: flex; flex-direction: column; gap: 8px; border-top: 1px solid var(--line); }
.side-foot button { text-align: left; font-size: var(--fs-sm); }
.side-foot .admin-on { background: var(--fg); color: var(--bg); border-color: var(--fg); }
.main { margin-left: var(--sidebar); padding: var(--pad); max-width: calc(var(--max) + var(--pad) * 2); }
body.wide .main { max-width: none; }
.scrim { display: none; }
.page-head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: var(--gap); margin-bottom: var(--gap); }
.page-head .actions { display: flex; flex-wrap: wrap; gap: 8px; }

@media (max-width: 899px) {
  .side { width: var(--sidebar-narrow); padding-top: 12px; }
  .side .mark, .side .nav-label, .side-foot { display: none; }
  .side .nav-short { display: block; }
  .side nav a { justify-content: center; padding: 12px 0; }
  .main { margin-left: var(--sidebar-narrow); padding: var(--gap); }
}
@media (max-width: 699px) {
  .mhead { display: flex; align-items: center; gap: 12px; position: sticky; top: 0; z-index: 20; height: var(--header-h); padding: 0 var(--gap); background: var(--bg); border-bottom: 1px solid var(--line); }
  .mhead .mark { flex: 1; font-weight: 600; letter-spacing: .18em; text-transform: uppercase; font-size: var(--fs-sm); }
  .mhead button { padding: 4px 10px; font-size: var(--fs-sm); }
  .side { width: var(--sidebar); transform: translateX(-100%); z-index: 30; padding-top: 20px; }
  .side.open { transform: none; }
  .side .mark, .side .nav-label, .side-foot { display: block; }
  .side .nav-short { display: none; }
  .side nav a { justify-content: flex-start; padding: 10px 20px; }
  .scrim.show { display: block; position: fixed; inset: 0; background: rgba(0,0,0,.3); z-index: 25; }
  .main { margin-left: 0; padding: var(--gap); }
}

/* 탭 */
.tabs { display: flex; gap: 0; border-bottom: 1px solid var(--line); margin-bottom: var(--gap); overflow-x: auto; }
.tabs a, .tabs button { padding: 8px 14px; color: var(--muted); border: 0; border-bottom: 2px solid transparent; white-space: nowrap; margin-bottom: -1px; }
.tabs a.active, .tabs button.active { color: var(--fg); border-bottom-color: var(--fg); }

/* 표 */
.tbl-wrap { overflow-x: auto; border: 1px solid var(--line); }
.tbl { width: 100%; border-collapse: collapse; font-size: var(--fs-sm); }
.tbl th, .tbl td { padding: 8px 10px; border-bottom: 1px solid var(--line); text-align: left; white-space: nowrap; vertical-align: middle; }
.tbl th { position: sticky; top: 0; background: var(--surface); font-weight: 500; font-size: var(--fs-xs); letter-spacing: .06em; text-transform: uppercase; color: var(--muted); cursor: pointer; user-select: none; }
.tbl th.sorted { color: var(--fg); }
.tbl th.r, .tbl td.r { text-align: right; }
.tbl th.c, .tbl td.c { text-align: center; }
.tbl tbody tr:hover { background: var(--surface); }
.tbl tr:last-child td { border-bottom: 0; }
.tbl .empty { color: var(--muted); text-align: center; padding: 32px; }

/* 값 색코딩 · 포지션 · 등급 */
.val { display: inline-block; min-width: 2.2em; padding: 1px 6px; text-align: center; font-variant-numeric: tabular-nums; }
.val-a { color: var(--val-a); background: var(--val-a-bg); }
.val-b { color: var(--val-b); background: var(--val-b-bg); }
.val-c { color: var(--val-c); background: var(--val-c-bg); }
.val-d { color: var(--val-d); background: var(--val-d-bg); }
.pos { display: inline-block; min-width: 2.4em; padding: 1px 6px; text-align: center; color: #fff; font-size: var(--fs-xs); font-weight: 600; }
.pos-gk { background: var(--pos-gk); } .pos-df { background: var(--pos-df); } .pos-mf { background: var(--pos-mf); } .pos-fw { background: var(--pos-fw); }
.grade-gold { color: var(--gold); } .grade-silver { color: var(--silver); } .grade-bronze { color: var(--bronze); }
.warn { color: var(--warn); }

/* 카드·격자·칩 */
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: var(--gap); }
.card { border: 1px solid var(--line); padding: 14px 16px; background: var(--bg); }
.card h2 { margin-bottom: 8px; }
.card .big { font-size: var(--fs-xl); font-weight: 600; line-height: 1.1; font-variant-numeric: tabular-nums; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip { display: inline-flex; align-items: center; gap: 6px; padding: 2px 8px; border: 1px solid var(--line); font-size: var(--fs-sm); }
.chip.on { background: var(--fg); color: var(--bg); border-color: var(--fg); }
.thumbs { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: var(--gap); }
.thumb { border: 1px solid var(--line); }
.thumb img { width: 100%; aspect-ratio: 16 / 9; object-fit: cover; background: var(--tint); }
.thumb .body { padding: 8px 10px; font-size: var(--fs-sm); }
.embed { position: relative; aspect-ratio: 16 / 9; border: 1px solid var(--line); background: var(--tint); }
.embed iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
.form { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px; }
.form label { display: flex; flex-direction: column; gap: 4px; font-size: var(--fs-xs); color: var(--muted); }
.form .full { grid-column: 1 / -1; }
.row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.stack { display: flex; flex-direction: column; gap: var(--gap); }
.bars { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; }
.bar { display: grid; grid-template-columns: 3.2em 1fr 2.4em; align-items: center; gap: 8px; font-size: var(--fs-sm); }
.bar i { display: block; height: 6px; background: var(--tint); }
.bar i b { display: block; height: 100%; background: var(--fg); }
details.year > summary { cursor: pointer; padding: 8px 0; font-weight: 600; list-style: none; }
details.year > summary::before { content: "▸ "; color: var(--muted); }
details.year[open] > summary::before { content: "▾ "; }
.toast { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); background: var(--fg); color: var(--bg); padding: 8px 14px; font-size: var(--fs-sm); z-index: 50; }

/* 모달 */
.modal-bg { display: none; position: fixed; inset: 0; background: rgba(0,0,0,.35); z-index: 40; align-items: center; justify-content: center; padding: var(--gap); }
.modal-bg.show { display: flex; }
.modal { background: var(--bg); border: 1px solid var(--line); width: 100%; max-width: 420px; max-height: 90vh; overflow: auto; padding: 20px; }
.modal h2 { margin-bottom: 12px; }
.modal .foot { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
.pick-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 6px; }
.pick-list button { padding: 6px 4px; font-size: var(--fs-sm); }
```

- [ ] **Step 7: src/layouts/Shell.astro**

```astro
---
import '../styles/tokens.css';
import { href } from '../lib/url';
interface Props { title: string; index?: boolean; wide?: boolean; description?: string }
const { title, index = false, wide = false, description = 'WEEKLY FC — 매주 모이는 풋살 팀의 포탈' } = Astro.props;
const nav = [
  { href: href('/'), label: '홈' },
  { href: href('/squad/'), label: '스쿼드' },
  { href: href('/match/'), label: '매치' },
  { href: href('/record/'), label: '기록' },
  { href: href('/tactics/'), label: '전술' },
  { href: href('/about/'), label: '소개' },
];
const path = Astro.url.pathname;
const isActive = (h: string) => (h === href('/') ? path === href('/') : path.startsWith(h));
---
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{title} · WEEKLY FC</title>
  <meta name="description" content={description} />
  {!index && <meta name="robots" content="noindex" />}
  <link rel="icon" href={href('/favicon.svg')} type="image/svg+xml" />
  <link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin />
  <link rel="stylesheet" crossorigin href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
  <slot name="head" />
</head>
<body class:list={[{ wide }]}>
  <header class="mhead">
    <button id="menu-btn" aria-label="메뉴 열기">메뉴</button>
    <a class="mark" href={href('/')}>WEEKLY FC</a>
    <button id="me-btn-m" data-me-btn>이름</button>
  </header>
  <aside class="side" id="side">
    <a class="mark" href={href('/')}>WEEKLY FC</a>
    <nav>
      {nav.map((n) => (
        <a href={n.href} class:list={[{ active: isActive(n.href) }]}>
          <span class="nav-short">{n.label[0]}</span>
          <span class="nav-label">{n.label}</span>
        </a>
      ))}
    </nav>
    <div class="side-foot">
      <button id="me-btn" data-me-btn>이름 고르기</button>
      <button id="admin-btn">관리자</button>
    </div>
  </aside>
  <div class="scrim" id="scrim"></div>
  <main class="main"><slot /></main>

  <div class="modal-bg" id="pin-modal">
    <div class="modal">
      <h2>관리자 모드</h2>
      <p class="muted">시트 뒤 네 자리 PIN을 입력하세요.</p>
      <input id="pin-input" type="password" inputmode="numeric" maxlength="8" autocomplete="off" style="width:100%" />
      <p id="pin-err" class="warn" hidden>PIN이 올바르지 않습니다.</p>
      <div class="foot"><button data-close="pin-modal">취소</button><button class="primary" id="pin-ok">확인</button></div>
    </div>
  </div>
  <div class="modal-bg" id="me-modal">
    <div class="modal">
      <h2>내 이름 고르기</h2>
      <p class="muted">명단에서 본인을 고르면 이 기기에 기억됩니다.</p>
      <div class="pick-list" id="me-list"></div>
      <div class="foot"><button id="me-clear">지우기</button><button data-close="me-modal">닫기</button></div>
    </div>
  </div>
  <div class="toast" id="toast" hidden></div>

  <script>
    import { onData, isAdmin, login, logout } from '../lib/api';
    import { getMe, setMe } from '../lib/me';
    import type { Data } from '../lib/types';
    const $ = (id: string) => document.getElementById(id) as HTMLElement;
    const side = $('side'), scrim = $('scrim');
    const openSide = (on: boolean) => { side.classList.toggle('open', on); scrim.classList.toggle('show', on); };
    $('menu-btn').onclick = () => openSide(true);
    scrim.onclick = () => openSide(false);
    document.querySelectorAll<HTMLElement>('[data-close]').forEach((b) => (b.onclick = () => $(b.dataset.close!).classList.remove('show')));

    let players: Data['players'] = [];
    const meLabel = () => { const me = getMe(); const p = players.find((x) => x.num === me); const t = p ? p.name : '이름 고르기'; document.querySelectorAll<HTMLElement>('[data-me-btn]').forEach((b) => (b.textContent = b.id === 'me-btn-m' && !p ? '이름' : t)); };
    const adminLabel = () => { const b = $('admin-btn'); b.textContent = isAdmin() ? '관리자 모드 끄기' : '관리자'; b.classList.toggle('admin-on', isAdmin()); };
    document.querySelectorAll<HTMLElement>('[data-me-btn]').forEach((b) => (b.onclick = () => {
      const list = $('me-list'); list.innerHTML = '';
      for (const p of [...players].sort((a, b) => a.num - b.num)) { const btn = document.createElement('button'); btn.textContent = `${p.num} ${p.name}`; btn.className = p.num === getMe() ? 'primary' : ''; btn.onclick = () => { setMe(p.num); meLabel(); $('me-modal').classList.remove('show'); }; list.appendChild(btn); }
      $('me-modal').classList.add('show');
    }));
    $('me-clear').onclick = () => { setMe(null); meLabel(); $('me-modal').classList.remove('show'); };
    $('admin-btn').onclick = () => { if (isAdmin()) { logout(); adminLabel(); window.dispatchEvent(new Event('wfc:admin')); } else { $('pin-err').hidden = true; ($('pin-input') as HTMLInputElement).value = ''; $('pin-modal').classList.add('show'); ($('pin-input') as HTMLInputElement).focus(); } };
    const submitPin = async () => { const ok = await login(($('pin-input') as HTMLInputElement).value.trim()); if (ok) { $('pin-modal').classList.remove('show'); adminLabel(); window.dispatchEvent(new Event('wfc:admin')); } else $('pin-err').hidden = false; };
    $('pin-ok').onclick = submitPin;
    $('pin-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') submitPin(); });
    onData((d) => { players = d.players; meLabel(); });
    adminLabel();
    (window as unknown as { wfcToast: (m: string) => void }).wfcToast = (m: string) => { const t = $('toast'); t.textContent = m; t.hidden = false; setTimeout(() => (t.hidden = true), 2200); };
  </script>
</body>
</html>
```

`onData`·`login` 등은 Task 2에서 만든다. Task 1 시점에는 빌드가 깨지지 않도록 `src/lib/api.ts`와 `src/lib/me.ts`에 **같은 시그니처의 임시 구현**을 둔다:

```ts
// src/lib/api.ts (Task 2에서 통째로 교체)
import type { Data } from './types';
export const EMPTY: Data = { players: [], matches: [], rotation: [], fines: [], lineups: [] };
export function onData(render: (d: Data) => void): void { render(EMPTY); }
export function isAdmin(): boolean { return false; }
export async function login(_pin: string): Promise<boolean> { return false; }
export function logout(): void {}
```
```ts
// src/lib/me.ts (Task 2에서 통째로 교체)
export function getMe(): number | null { return null; }
export function setMe(_n: number | null): void {}
```
`src/lib/types.ts`는 위 "공통 인터페이스" 블록 그대로 지금 만든다.

- [ ] **Step 8: 홈 자리 · robots · favicon · 워크플로**

```astro
---
// src/pages/index.astro (Task 11에서 채운다)
import Shell from '../layouts/Shell.astro';
---
<Shell title="홈">
  <div class="page-head"><h1>홈</h1></div>
  <div id="app" class="stack"></div>
</Shell>
```

```
# public/robots.txt
User-agent: *
Allow: /
Sitemap: https://byjunyoung.github.io/weekly-fc/sitemap-index.xml
```

```svg
<!-- public/favicon.svg -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="#161616"/><text x="16" y="21" font-family="Pretendard, sans-serif" font-size="14" font-weight="700" fill="#fff" text-anchor="middle">FC</text></svg>
```

```yaml
# .github/workflows/deploy.yml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: withastro/action@v6
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v5
```

- [ ] **Step 9: 빌드 검사 테스트**

```js
// tests/build/dist.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

// 태스크가 페이지를 추가할 때마다 여기에 줄을 더한다.
export const PAGES = [
  'index.html',
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
```

- [ ] **Step 10: 테스트 실행**

Run: `npm test`
Expected: unit(없음)은 통과, 빌드 성공, dist 테스트 4개 PASS.

- [ ] **Step 11: 커밋**

```bash
git add -A
git commit -m "chore: Astro 골격 · 토큰 · 셸 · 배포 워크플로 (옛 앱은 legacy/)"
```

---

### Task 2: api.ts · me.ts · html.ts

**Files:**
- Replace: `src/lib/api.ts`, `src/lib/me.ts`
- Create: `src/lib/html.ts`, `tests/unit/api.test.mjs`, `tests/unit/html.test.mjs`

**Interfaces:**
- Produces: 아래 코드의 export 전부. `write()`는 성공 후 `refresh()`까지 하므로 호출한 쪽은 다시 fetch할 필요 없다(`wfc:data`가 온다).

- [ ] **Step 1: 실패하는 테스트**

```js
// tests/unit/api.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildUrl, normalizeMatch, normalizeFine, normalizePlayer, serializeMatch, serializeFine } from '../../src/lib/api.ts';

test('buildUrl은 action과 payload를 쿼리에 싣는다', () => {
  const u = new URL(buildUrl('writeMatch', { pin: '1234', payload: { id: 'x' } }, 'https://example.com/exec'));
  assert.equal(u.searchParams.get('action'), 'writeMatch');
  assert.equal(u.searchParams.get('pin'), '1234');
  assert.equal(JSON.parse(decodeURIComponent(u.searchParams.get('payload'))).id, 'x');
});
test('normalizeMatch: attendees 문자열·teams JSON·날짜를 정리한다', () => {
  const m = normalizeMatch({ id: '2026-09-05', date: '2026-09-05T00:00:00.000Z', type: '3파전', attendees: '김철수, 이영희 ,', teams: '[{"name":"A","players":["김철수"],"points":3}]', winner: 'A' });
  assert.equal(m.date, '2026-09-05');
  assert.deepEqual(m.attendees, ['김철수', '이영희']);
  assert.equal(m.teams[0].points, 3);
  assert.equal(m.type, '3파전');
});
test('normalizeMatch: 깨진 teams는 빈 배열', () => {
  assert.deepEqual(normalizeMatch({ id: '1', teams: '{oops' }).teams, []);
});
test('serializeMatch ↔ normalizeMatch 왕복', () => {
  const m = normalizeMatch({ id: '2026-09-05', date: '2026-09-05', location: '모란공원', youtube: 'abc', type: '2파전', attendees: '김철수, 이영희', teams: '[{"name":"A","players":["김철수"],"points":null}]', winner: '' });
  const s = serializeMatch(m);
  assert.equal(s.attendees, '김철수, 이영희');
  assert.deepEqual(normalizeMatch(s), m);
});
test('normalizeFine: paid 문자열 → boolean, amount 숫자', () => {
  const f = normalizeFine({ id: '1', date: '2026-09-05', player: '김철수', type: '지각', amount: '30000', paid: 'TRUE' });
  assert.equal(f.paid, true); assert.equal(f.amount, 30000);
  assert.equal(serializeFine(f).paid, 'TRUE');
});
test('normalizePlayer: pos 대문자화, 빈 rot는 null, phone은 있을 때만', () => {
  const p = normalizePlayer({ num: '9', name: '김철수', pos: 'mf', rot: '', pace: '80' });
  assert.equal(p.pos, 'MF'); assert.equal(p.rot, null); assert.equal(p.pace, 80); assert.equal('phone' in p, false);
});
```

```js
// tests/unit/html.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { esc, fmtDate, fmtWon, monthLabel } from '../../src/lib/html.ts';
test('esc', () => assert.equal(esc('<a href="x">&</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;'));
test('fmtDate는 요일을 붙인다', () => assert.equal(fmtDate('2026-09-05'), '2026.09.05 (토)'));
test('fmtDate는 이상한 값은 그대로', () => assert.equal(fmtDate(''), ''));
test('fmtWon', () => assert.equal(fmtWon(30000), '30,000원'));
test('monthLabel', () => assert.equal(monthLabel(2026, 9), '2026년 9월'));
```

- [ ] **Step 2: 실패 확인**

Run: `npm run test:unit`
Expected: FAIL — `buildUrl`이 export되지 않음.

- [ ] **Step 3: 구현**

```ts
// src/lib/html.ts
export const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
export function fmtDate(d: string): string {
  const [y, m, day] = d.split('-').map(Number);
  if (!y || !m || !day) return d;
  const w = DAYS[new Date(y, m - 1, day).getDay()];
  return `${y}.${String(m).padStart(2, '0')}.${String(day).padStart(2, '0')} (${w})`;
}
export const fmtWon = (n: number): string => `${n.toLocaleString('ko-KR')}원`;
export const monthLabel = (y: number, m: number): string => `${y}년 ${m}월`;
export const ytThumb = (id: string): string => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
export const ytEmbed = (id: string): string => `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1`;
export const ytWatch = (id: string): string => `https://www.youtube.com/watch?v=${id}`;
export const toast = (m: string): void => { const w = window as unknown as { wfcToast?: (m: string) => void }; w.wfcToast?.(m); };
```

```ts
// src/lib/me.ts — 내 이름(선수 번호)을 기기에 기억
const KEY = 'wfc_me';
export function getMe(): number | null {
  try { const v = localStorage.getItem(KEY); return v ? Number(v) : null; } catch { return null; }
}
export function setMe(num: number | null): void {
  try { if (num == null) localStorage.removeItem(KEY); else localStorage.setItem(KEY, String(num)); } catch {}
  window.dispatchEvent(new Event('wfc:me'));
}
```

```ts
// src/lib/api.ts — Apps Script 호출은 여기 한 곳
import type { Data, Fine, Lineup, Match, Player, RotationRow, Team, Video } from './types';

export const API_URL = 'https://script.google.com/macros/s/AKfycbyUDTkTHsKszkiOeJKmNDHDkVJobrVUjbRqufU251PNKmlyrvC0BZ3ir9x0vM_lCJkkmg/exec';
const CACHE_KEY = 'wfc_cache_v2';
const PIN_KEY = 'wfc_pin';
export const EMPTY: Data = { players: [], matches: [], rotation: [], fines: [], lineups: [] };

type Raw = Record<string, unknown>;
const num = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const numOrNull = (v: unknown): number | null => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v));
const bool = (v: unknown): boolean => v === true || String(v).toUpperCase() === 'TRUE';
const list = (v: unknown): string[] => String(v ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const day = (v: unknown): string => String(v ?? '').slice(0, 10);
const POS = ['GK', 'DF', 'MF', 'FW'] as const;

export function normalizePlayer(r: Raw): Player {
  const pos = String(r.pos ?? '').toUpperCase();
  const p: Player = {
    num: num(r.num), name: String(r.name ?? '').trim(), pos: POS.find((x) => x === pos) ?? '',
    detail: String(r.detail ?? ''), foot: String(r.foot ?? ''), vest: numOrNull(r.vest), note: String(r.note ?? ''),
    pace: num(r.pace), dribble: num(r.dribble), pass: num(r.pass), shoot: num(r.shoot), defend: num(r.defend), stamina: num(r.stamina),
    rot: numOrNull(r.rot),
  };
  if (r.phone !== undefined) p.phone = String(r.phone);
  return p;
}
export function normalizeMatch(r: Raw): Match {
  let teams: Team[] = [];
  if (r.teams) {
    try {
      const t = typeof r.teams === 'string' ? JSON.parse(r.teams) : r.teams;
      if (Array.isArray(t)) teams = t.map((x: Raw) => ({ name: String(x.name ?? ''), players: Array.isArray(x.players) ? x.players.map(String) : [], points: numOrNull(x.points) }));
    } catch { teams = []; }
  }
  const type = String(r.type ?? '');
  return { id: String(r.id ?? ''), date: day(r.date), location: String(r.location ?? ''), youtube: String(r.youtube ?? ''),
    type: type === '2파전' || type === '3파전' ? type : '', attendees: list(r.attendees), teams, winner: String(r.winner ?? '') };
}
export function normalizeFine(r: Raw): Fine {
  const type = String(r.type ?? '');
  return { id: String(r.id ?? ''), date: day(r.date), match_id: String(r.match_id ?? ''), player: String(r.player ?? ''),
    type: type === '노쇼' ? '노쇼' : '지각', amount: num(r.amount), paid: bool(r.paid) };
}
export function normalizeRotation(r: Raw): RotationRow {
  return { year: num(r.year), month: num(r.month), p1: String(r.p1 ?? ''), p2: String(r.p2 ?? ''), done: bool(r.done) };
}
export function normalizeLineup(r: Raw): Lineup {
  return { id: String(r.id ?? ''), match_id: String(r.match_id ?? ''), name: String(r.name ?? ''), formation: String(r.formation ?? ''), assignments: typeof r.assignments === 'string' ? r.assignments : JSON.stringify(r.assignments ?? '') };
}
export function normalizeData(d: Raw): Data {
  const arr = (v: unknown): Raw[] => (Array.isArray(v) ? (v as Raw[]) : []);
  return { players: arr(d.players).map(normalizePlayer).filter((p) => p.num > 0),
    matches: arr(d.matches).map(normalizeMatch).filter((m) => m.id).sort((a, b) => b.date.localeCompare(a.date)),
    rotation: arr(d.rotation).map(normalizeRotation), fines: arr(d.fines).map(normalizeFine).filter((f) => f.id), lineups: arr(d.lineups).map(normalizeLineup) };
}

export const serializePlayer = (p: Player): Raw => ({ ...p, vest: p.vest ?? '', rot: p.rot ?? '' });
export const serializeMatch = (m: Match): Record<string, string> => ({ id: m.id, date: m.date, location: m.location, youtube: m.youtube, type: m.type,
  attendees: m.attendees.join(', '), teams: m.teams.length ? JSON.stringify(m.teams) : '', winner: m.winner });
export const serializeFine = (f: Fine): Record<string, string | number> => ({ id: f.id, date: f.date, match_id: f.match_id, player: f.player, type: f.type, amount: f.amount, paid: f.paid ? 'TRUE' : 'FALSE' });
export const serializeRotation = (r: RotationRow): Record<string, string | number> => ({ year: r.year, month: r.month, p1: r.p1, p2: r.p2, done: r.done ? 'TRUE' : 'FALSE' });
export const serializeLineup = (l: Lineup): Record<string, string> => ({ id: l.id, match_id: l.match_id, name: l.name, formation: l.formation, assignments: l.assignments });

export function buildUrl(action: string, params: Record<string, unknown> = {}, base: string = API_URL): string {
  const u = new URL(base);
  u.searchParams.set('action', action);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, typeof v === 'object' && v !== null ? encodeURIComponent(JSON.stringify(v)) : String(v));
  return u.toString();
}
async function call(action: string, params: Record<string, unknown> = {}): Promise<Raw> {
  const res = await fetch(buildUrl(action, params));
  const json = (await res.json()) as Raw;
  if (json.error) throw new Error(String(json.error));
  return json;
}

export function cached(): Data | null { try { const s = localStorage.getItem(CACHE_KEY); return s ? (JSON.parse(s) as Data) : null; } catch { return null; } }
function saveCache(d: Data): void { try { localStorage.setItem(CACHE_KEY, JSON.stringify(d)); } catch {} }
export async function fetchData(): Promise<Data> { return normalizeData(await call('getAll')); }
export async function refresh(): Promise<Data> {
  const d = await fetchData(); saveCache(d);
  window.dispatchEvent(new CustomEvent<Data>('wfc:data', { detail: d }));
  return d;
}
/** 캐시가 있으면 즉시 한 번, 서버 응답이 오면 다시 한 번 render. 이후 wfc:data 마다. */
export function onData(render: (d: Data) => void): void {
  const c = cached(); if (c) render(c);
  window.addEventListener('wfc:data', (e) => render((e as CustomEvent<Data>).detail));
  refresh().catch(() => { if (!c) render(EMPTY); });
}
export async function loadVideos(): Promise<Video[]> {
  const j = await call('getChannelVideos');
  return (Array.isArray(j.videos) ? (j.videos as Raw[]) : []).map((v) => ({ id: String(v.id ?? ''), title: String(v.title ?? ''), published: String(v.published ?? '') })).filter((v) => v.id);
}
export function getPin(): string { try { return sessionStorage.getItem(PIN_KEY) ?? ''; } catch { return ''; } }
export function isAdmin(): boolean { return getPin() !== ''; }
export async function login(pin: string): Promise<boolean> {
  try { await call('verifyPin', { pin }); sessionStorage.setItem(PIN_KEY, pin); return true; } catch { return false; }
}
export function logout(): void { try { sessionStorage.removeItem(PIN_KEY); } catch {} }
/** 쓰기: PIN 동봉 → 성공하면 refresh()까지. 실패는 throw. */
export async function write(action: string, payload: unknown): Promise<Raw> {
  const pin = getPin(); if (!pin) throw new Error('관리자 PIN이 필요합니다');
  const r = await call(action, { pin, payload });
  await refresh();
  return r;
}
export async function fetchFull(): Promise<Data> { return normalizeData(await call('getAllFull', { pin: getPin() })); }
```

- [ ] **Step 4: 통과 확인**

Run: `npm run test:unit`
Expected: api 6개, html 5개 PASS.

- [ ] **Step 5: 빌드도 깨지지 않는지**

Run: `npm run build`
Expected: 성공 (Shell의 import가 실제 구현으로 붙는다).

- [ ] **Step 6: 커밋**

```bash
git add src/lib tests/unit
git commit -m "feat: api·me·html 라이브러리 + 단위 테스트"
```

---

### Task 3: rules.ts · stats.ts

**Files:**
- Create: `src/lib/rules.ts`, `src/lib/stats.ts`, `tests/unit/stats.test.mjs`

**Interfaces:**
- Produces: `FINE_AMOUNT`, `FINE_TYPES`, `DUTY_PER_MONTH`, `MATCH_TIME`, `MATCH_MIN`, `PLACES`, `BANK`, `LINKS`; `ovr`, `grade`, `band`, `STAT_CUTS`, `RATE_CUTS`, `yearOf`, `seasonMatches`, `attendance`, `wins`, `seasonTable`, `fineSummary`, `SeasonRow`.

- [ ] **Step 1: 실패하는 테스트**

```js
// tests/unit/stats.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { ovr, grade, band, STAT_CUTS, RATE_CUTS, attendance, wins, seasonTable, fineSummary } from '../../src/lib/stats.ts';

const P = (num, name, s = 70) => ({ num, name, pos: 'MF', detail: '', foot: '', vest: null, note: '', pace: s, dribble: s, pass: s, shoot: s, defend: s, stamina: s, rot: null });
const M = (date, attendees, teams = [], winner = '') => ({ id: date, date, location: '', youtube: '', type: '2파전', attendees, teams, winner });

test('ovr는 0을 빼고 평균, 반올림', () => {
  assert.equal(ovr(P(1, 'a', 80)), 80);
  assert.equal(ovr({ ...P(1, 'a', 0), pace: 90, pass: 81 }), 86);
  assert.equal(ovr(P(1, 'a', 0)), 0);
});
test('grade 경계 84/69', () => { assert.equal(grade(84), 'gold'); assert.equal(grade(83), 'silver'); assert.equal(grade(69), 'silver'); assert.equal(grade(68), 'bronze'); });
test('band 4단계', () => {
  assert.equal(band(84, STAT_CUTS), 'a'); assert.equal(band(70, STAT_CUTS), 'b'); assert.equal(band(55, STAT_CUTS), 'c'); assert.equal(band(54, STAT_CUTS), 'd');
  assert.equal(band(80, RATE_CUTS), 'a'); assert.equal(band(39, RATE_CUTS), 'd');
});
test('attendance는 참석 기록이 있는 매치만 분모', () => {
  const ms = [M('2026-09-05', ['a', 'b']), M('2026-08-22', ['b']), M('2026-08-08', [])];
  assert.deepEqual(attendance('a', ms), { attended: 1, total: 2, rate: 50 });
  assert.deepEqual(attendance('a', ms, 2025), { attended: 0, total: 0, rate: 0 });
});
test('wins는 winner가 적힌 매치에서 이긴 팀 소속 횟수', () => {
  const ms = [M('2026-09-05', ['a', 'b'], [{ name: 'A', players: ['a'], points: 3 }, { name: 'B', players: ['b'], points: 0 }], 'A'), M('2026-08-22', ['a', 'b'])];
  assert.deepEqual(wins('a', ms), { won: 1, played: 1, rate: 100 });
  assert.deepEqual(wins('b', ms), { won: 0, played: 1, rate: 0 });
});
test('seasonTable은 출석 많은 순, 같으면 번호순', () => {
  const ps = [P(9, 'a'), P(3, 'b'), P(5, 'c')];
  const ms = [M('2026-09-05', ['a', 'b']), M('2026-08-22', ['b'])];
  assert.deepEqual(seasonTable(ps, ms).map((r) => r.player.name), ['b', 'a', 'c']);
});
test('fineSummary', () => {
  const fs = [{ id: '1', date: '', match_id: '', player: 'a', type: '지각', amount: 30000, paid: false }, { id: '2', date: '', match_id: '', player: 'a', type: '노쇼', amount: 50000, paid: true }];
  const s = fineSummary(fs);
  assert.equal(s.total, 80000); assert.equal(s.unpaid, 30000); assert.equal(s.unpaidCount, 1);
  assert.equal(s.byType.노쇼.count, 1); assert.equal(s.byPlayer.get('a').unpaid, 30000);
});
```

- [ ] **Step 2: 실패 확인** — Run: `npm run test:unit` → FAIL (모듈 없음).

- [ ] **Step 3: 구현**

```ts
// src/lib/rules.ts — 규칙 상수. 소개 페이지 표와 정산 자동 금액이 같은 값을 쓴다.
export const FINE_TYPES = ['지각', '노쇼'] as const;
export const FINE_AMOUNT: Record<(typeof FINE_TYPES)[number], number> = { 지각: 30000, 노쇼: 50000 };
export const FINE_NOTE: Record<(typeof FINE_TYPES)[number], string> = { 지각: '시작 후 도착', 노쇼: '종료까지 미참' };
export const FINE_EXEMPT = '매치 시작 전 미리 공지하면 면제';
export const DUTY_PER_MONTH = 2;
export const MATCH_TIME = '토요일 오전 10–12시';
export const MATCH_MIN = 10;
export const PLACES = ['모란공원', '위례공원', '광주다이나믹'];
export const BANK = { name: '카카오뱅크 안심계좌', number: '7942-11-99103', holder: '위클리FC', since: '2025.01.18', contact: '김준영' };
export const LINKS = { kakao: 'https://open.kakao.com/o/gQLPdm5f', youtube: 'https://www.youtube.com/@WEEKLYFC2020' };
```

```ts
// src/lib/stats.ts — 계산만. DOM 없음.
import { STAT_KEYS, type Fine, type FineType, type Match, type Player } from './types';

export const STAT_CUTS: [number, number, number] = [84, 69, 55];
export const RATE_CUTS: [number, number, number] = [80, 60, 40];
export function ovr(p: Player): number {
  const v = STAT_KEYS.map((k) => p[k]).filter((x) => x > 0);
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : 0;
}
export const grade = (v: number): 'gold' | 'silver' | 'bronze' => (v >= 84 ? 'gold' : v >= 69 ? 'silver' : 'bronze');
export const band = (v: number, cuts: [number, number, number]): 'a' | 'b' | 'c' | 'd' => (v >= cuts[0] ? 'a' : v >= cuts[1] ? 'b' : v >= cuts[2] ? 'c' : 'd');
export const yearOf = (date: string): number => Number(date.slice(0, 4));
export const seasonMatches = (matches: Match[], year?: number): Match[] => matches.filter((m) => m.attendees.length > 0 && (year == null || yearOf(m.date) === year));
export function attendance(name: string, matches: Match[], year?: number): { attended: number; total: number; rate: number } {
  const ms = seasonMatches(matches, year);
  const attended = ms.filter((m) => m.attendees.includes(name)).length;
  return { attended, total: ms.length, rate: ms.length ? Math.round((attended / ms.length) * 100) : 0 };
}
export function wins(name: string, matches: Match[], year?: number): { won: number; played: number; rate: number } {
  const ms = seasonMatches(matches, year).filter((m) => m.winner && m.attendees.includes(name));
  const won = ms.filter((m) => m.teams.find((t) => t.name === m.winner)?.players.includes(name)).length;
  return { won, played: ms.length, rate: ms.length ? Math.round((won / ms.length) * 100) : 0 };
}
export type SeasonRow = { player: Player; attended: number; total: number; rate: number; won: number; played: number; winRate: number };
export function seasonTable(players: Player[], matches: Match[], year?: number): SeasonRow[] {
  return players.map((p) => { const a = attendance(p.name, matches, year); const w = wins(p.name, matches, year);
    return { player: p, attended: a.attended, total: a.total, rate: a.rate, won: w.won, played: w.played, winRate: w.rate }; })
    .sort((x, y) => y.attended - x.attended || y.rate - x.rate || x.player.num - y.player.num);
}
export function fineSummary(fines: Fine[]) {
  const byType: Record<FineType, { count: number; total: number }> = { 지각: { count: 0, total: 0 }, 노쇼: { count: 0, total: 0 } };
  const byPlayer = new Map<string, { count: number; total: number; unpaid: number }>();
  let total = 0, unpaid = 0, unpaidCount = 0;
  for (const f of fines) {
    total += f.amount; byType[f.type].count++; byType[f.type].total += f.amount;
    const e = byPlayer.get(f.player) ?? { count: 0, total: 0, unpaid: 0 };
    e.count++; e.total += f.amount;
    if (!f.paid) { e.unpaid += f.amount; unpaid += f.amount; unpaidCount++; }
    byPlayer.set(f.player, e);
  }
  return { total, unpaid, unpaidCount, byType, byPlayer };
}
```

- [ ] **Step 4: 통과 확인** — Run: `npm run test:unit` → stats 7개 PASS.
- [ ] **Step 5: 커밋** — `git add src/lib/rules.ts src/lib/stats.ts tests/unit/stats.test.mjs && git commit -m "feat: 규칙 상수 · 통계 계산"`


---

### Task 4: rotation.ts

**Files:**
- Create: `src/lib/rotation.ts`, `tests/unit/rotation.test.mjs`

**Interfaces:**
- Consumes: `DUTY_PER_MONTH`(rules), `Player`, `RotationRow`.
- Produces: `CYCLE_START`, `rotationOrder(players)`, `computeMonth(players, y, m, now?)`, `rotationFor(players, sheet, y, m, now?)`, `yearRows(players, sheet, y, now?)`, `nextDuty(players, sheet, name, now?)`.

옛 로직(legacy/index.html `computeRotationMonth`)을 그대로 옮긴다. 2026-01이 사이클 시작, 매월 2명 슬라이딩, `rot` 오름차순. 2024~2032 108개월이 옛 결과와 일치한다고 이미 검증된 식이므로 식을 바꾸지 않는다.

- [ ] **Step 1: 실패하는 테스트**

```js
// tests/unit/rotation.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { rotationOrder, computeMonth, rotationFor, yearRows, nextDuty } from '../../src/lib/rotation.ts';

const P = (num, name, rot) => ({ num, name, pos: 'MF', detail: '', foot: '', vest: null, note: '', pace: 0, dribble: 0, pass: 0, shoot: 0, defend: 0, stamina: 0, rot });
const ps = Array.from({ length: 29 }, (_, i) => P(i + 1, `p${i + 1}`, i + 1)).concat([P(99, 'admin', null)]);
const NOW = new Date(2026, 8, 10); // 2026-09-10

test('rotationOrder는 rot>0만, rot 오름차순 이름', () => {
  const o = rotationOrder([P(2, 'b', 2), P(1, 'a', 1), P(3, 'c', null)]);
  assert.deepEqual(o, ['a', 'b']);
});
test('2026-01은 rot 1·2, 02는 3·4', () => {
  assert.deepEqual([computeMonth(ps, 2026, 1, NOW).p1, computeMonth(ps, 2026, 1, NOW).p2], ['p1', 'p2']);
  assert.deepEqual([computeMonth(ps, 2026, 2, NOW).p1, computeMonth(ps, 2026, 2, NOW).p2], ['p3', 'p4']);
});
test('29명이면 2027-03(offset 14)은 p29·p1로 감싼다', () => {
  const r = computeMonth(ps, 2027, 3, NOW);
  assert.deepEqual([r.p1, r.p2], ['p29', 'p1']);
});
test('사이클 시작 이전 달도 음수 offset으로 계산된다', () => {
  const r = computeMonth(ps, 2025, 12, NOW); // offset -1 → i1 = 27
  assert.deepEqual([r.p1, r.p2], ['p28', 'p29']);
});
test('done은 지난 달만 true', () => {
  assert.equal(computeMonth(ps, 2026, 8, NOW).done, true);
  assert.equal(computeMonth(ps, 2026, 9, NOW).done, false);
});
test('명단이 비면 -', () => assert.deepEqual([computeMonth([], 2026, 1, NOW).p1, computeMonth([], 2026, 1, NOW).p2], ['-', '-']));
test('시트 행이 있으면 그 값이 이긴다', () => {
  const r = rotationFor(ps, [{ year: 2026, month: 9, p1: 'p7', p2: '', done: true }], 2026, 9, NOW);
  assert.deepEqual([r.p1, r.p2, r.done], ['p7', computeMonth(ps, 2026, 9, NOW).p2, true]);
});
test('yearRows는 12줄', () => assert.equal(yearRows(ps, [], 2026, NOW).length, 12));
test('nextDuty는 이번 달부터 앞으로 찾는다', () => {
  assert.deepEqual(nextDuty(ps, [], 'p1', NOW), { year: 2027, month: 3 });
  assert.equal(nextDuty(ps, [], 'admin', NOW), null);
});
```

- [ ] **Step 2: 실패 확인** — Run: `npm run test:unit` → FAIL (모듈 없음).

- [ ] **Step 3: 구현**

```ts
// src/lib/rotation.ts — 봉사 로테이션. 시트 rot 열 순서로 매월 DUTY_PER_MONTH명 슬라이딩.
import { DUTY_PER_MONTH } from './rules';
import type { Player, RotationRow } from './types';

export const CYCLE_START = { year: 2026, month: 1 };

export function rotationOrder(players: Player[]): string[] {
  return players.filter((p) => (p.rot ?? 0) > 0).sort((a, b) => (a.rot as number) - (b.rot as number)).map((p) => p.name);
}
export function computeMonth(players: Player[], year: number, month: number, now: Date = new Date()): RotationRow {
  const offset = (year - CYCLE_START.year) * 12 + (month - CYCLE_START.month);
  const order = rotationOrder(players);
  const n = order.length;
  const cy = now.getFullYear(), cm = now.getMonth() + 1;
  const done = year < cy || (year === cy && month < cm);
  if (!n) return { year, month, p1: '-', p2: '-', done };
  const i1 = (((offset * DUTY_PER_MONTH) % n) + n) % n;
  const i2 = (i1 + 1) % n;
  return { year, month, p1: order[i1], p2: order[i2] ?? order[0], done };
}
export function rotationFor(players: Player[], sheet: RotationRow[], year: number, month: number, now?: Date): RotationRow {
  const c = computeMonth(players, year, month, now);
  const s = sheet.find((r) => r.year === year && r.month === month);
  return s ? { ...c, p1: s.p1 || c.p1, p2: s.p2 || c.p2, done: s.done } : c;
}
export const yearRows = (players: Player[], sheet: RotationRow[], year: number, now?: Date): RotationRow[] =>
  Array.from({ length: 12 }, (_, i) => rotationFor(players, sheet, year, i + 1, now));
export function nextDuty(players: Player[], sheet: RotationRow[], name: string, now: Date = new Date()): { year: number; month: number } | null {
  let y = now.getFullYear(), m = now.getMonth() + 1;
  for (let i = 0; i < 36; i++) {
    const r = rotationFor(players, sheet, y, m, now);
    if (r.p1 === name || r.p2 === name) return { year: y, month: m };
    if (++m > 12) { m = 1; y++; }
  }
  return null;
}
```

- [ ] **Step 4: 통과 확인** — Run: `npm run test:unit` → rotation 9개 PASS.
- [ ] **Step 5: 커밋** — `git add src/lib/rotation.ts tests/unit/rotation.test.mjs && git commit -m "feat: 봉사 로테이션 계산 이식"`

---

### Task 5: parse.ts — 유튜브 제목 · 붙여넣기

**Files:**
- Create: `src/lib/parse.ts`, `tests/unit/parse.test.mjs`

**Interfaces:**
- Produces: `ParsedVideo`, `parseVideoTitle(video)`, `proposeMatches(videos, matches)`, `parseAttendance(text, players)`.

- [ ] **Step 1: 실패하는 테스트**

```js
// tests/unit/parse.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVideoTitle, proposeMatches, parseAttendance } from '../../src/lib/parse.ts';

const V = (id, title) => ({ id, title, published: '' });
const P = (num, name) => ({ num, name, pos: 'MF', detail: '', foot: '', vest: null, note: '', pace: 0, dribble: 0, pass: 0, shoot: 0, defend: 0, stamina: 0, rot: null });

test('날짜·유형만 있는 제목', () => {
  assert.deepEqual(parseVideoTitle(V('a', '260905 | 위클리FC 풋살 3파전')), { id: 'a', date: '2026-09-05', type: '3파전', location: '', title: '260905 | 위클리FC 풋살 3파전' });
});
test('메모와 장소가 붙은 제목', () => {
  const p = parseVideoTitle(V('b', '260614 | 위클리FC 풋살 2파전 | 쿠키있음 | 모란공원 풋살장'));
  assert.equal(p.type, '2파전'); assert.equal(p.location, '모란공원 풋살장');
});
test('풋살 단어 없이 장소만', () => {
  const p = parseVideoTitle(V('c', '260530 | 위클리FC 3파전 | 모란공원'));
  assert.equal(p.type, '3파전'); assert.equal(p.location, '모란공원');
});
test('날짜 접두사 없으면 null', () => assert.equal(parseVideoTitle(V('d', '아크로바틱 너프좀요')), null));
test('proposeMatches는 시트에 없는 날짜만, 날짜 오름차순, 같은 날 중복 제거', () => {
  const vids = [V('a', '260905 | 위클리FC 3파전'), V('b', '260822 | 위클리FC 2파전 | 위례공원'), V('c', '260822 | 위클리FC 2파전 2부'), V('d', '잡담')];
  const out = proposeMatches(vids, [{ id: '2026-09-05', date: '2026-09-05', location: '', youtube: 'a', type: '3파전', attendees: [], teams: [], winner: '' }]);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0], { id: '2026-08-22', date: '2026-08-22', location: '위례공원', youtube: 'b', type: '2파전', attendees: [], teams: [], winner: '' });
});
test('붙여넣기: 줄·쉼표·공백 구분, 정확 일치', () => {
  const ps = [P(1, '김철수'), P(2, '이영희'), P(3, '박민수')];
  assert.deepEqual(parseAttendance('김철수\n이영희, 박민수', ps), { matched: ['김철수', '이영희', '박민수'], unmatched: [] });
});
test('붙여넣기: 번호·이모지·머리말은 버리고, 못 찾은 이름은 unmatched', () => {
  const ps = [P(1, '김철수'), P(2, '이영희')];
  const r = parseAttendance('참석 (3명)\n1. 김철수 ✅\n2. 이영희님\n3. 홍길동', ps);
  assert.deepEqual(r, { matched: ['김철수', '이영희'], unmatched: ['홍길동'] });
});
test('붙여넣기: 부분 일치가 둘 이상이면 unmatched', () => {
  const ps = [P(1, '이진욱'), P(2, '이진수')];
  assert.deepEqual(parseAttendance('이진', ps), { matched: [], unmatched: ['이진'] });
});
test('붙여넣기: 중복은 한 번만', () => {
  assert.deepEqual(parseAttendance('김철수 김철수', [P(1, '김철수')]).matched, ['김철수']);
});
```

- [ ] **Step 2: 실패 확인** — Run: `npm run test:unit` → FAIL.

- [ ] **Step 3: 구현**

```ts
// src/lib/parse.ts — 유튜브 제목 → 매치 씨앗, 카톡 붙여넣기 → 참석자
import type { Match, MatchType, Player, Video } from './types';

export type ParsedVideo = { id: string; date: string; type: MatchType; location: string; title: string };

export function parseVideoTitle(v: Video): ParsedVideo | null {
  const m = v.title.match(/^\s*(\d{6})\s*\|/);
  if (!m) return null;
  const d = m[1];
  const date = `20${d.slice(0, 2)}-${d.slice(2, 4)}-${d.slice(4, 6)}`;
  const parts = v.title.split('|').map((s) => s.trim()).slice(1);
  const t = v.title.match(/(\d)파전/);
  const type: MatchType = t?.[1] === '2' ? '2파전' : t?.[1] === '3' ? '3파전' : '';
  const last = parts[parts.length - 1] ?? '';
  const location = parts.length >= 2 && /(공원|풋살장|구장)/.test(last) ? last : '';
  return { id: v.id, date, type, location, title: v.title };
}

export function proposeMatches(videos: Video[], matches: Match[]): Match[] {
  const have = new Set(matches.map((m) => m.date));
  const seen = new Set<string>();
  const out: Match[] = [];
  for (const v of videos) {
    const p = parseVideoTitle(v);
    if (!p || have.has(p.date) || seen.has(p.date)) continue;
    seen.add(p.date);
    out.push({ id: p.date, date: p.date, location: p.location, youtube: p.id, type: p.type, attendees: [], teams: [], winner: '' });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

const STOP = new Set(['참석', '불참', '미정', '투표', '결과', '명', '용병', '정회원', '합계', '총', '님']);

export function parseAttendance(text: string, players: Player[]): { matched: string[]; unmatched: string[] } {
  const names = players.map((p) => p.name).filter(Boolean);
  const matched: string[] = [], unmatched: string[] = [];
  const push = (arr: string[], n: string) => { if (!arr.includes(n)) arr.push(n); };
  for (const raw of text.split(/[\n,、·/]+|\s+/)) {
    const tok = raw.replace(/[^가-힣]/g, '');
    if (!tok || STOP.has(tok)) continue;
    const exact = names.find((n) => n === tok);
    if (exact) { push(matched, exact); continue; }
    const partial = tok.length >= 2 ? names.filter((n) => n.includes(tok) || tok.includes(n)) : [];
    if (partial.length === 1) push(matched, partial[0]); else push(unmatched, tok);
  }
  return { matched, unmatched };
}
```

- [ ] **Step 4: 통과 확인** — Run: `npm run test:unit` → parse 9개 PASS.
- [ ] **Step 5: 커밋** — `git add src/lib/parse.ts tests/unit/parse.test.mjs && git commit -m "feat: 유튜브 제목·붙여넣기 파서"`

---

### Task 6: Apps Script 갱신 (재배포는 사용자 go)

**Files:**
- Modify: `apps-script.gs` — `MATCH_COLS`(13행), `LINEUP_COLS`(17행), `doGet` 읽기 분기(28–36행)와 쓰기 switch(42–53행), `sheetToObjects`(285행), `getOrCreateSheet`(279행), `handleGetChannelVideos`(222행). `handleGetComments`·`handleAddComment`·`handleDeleteComment` 삭제.

**Interfaces:**
- Produces: `getAll`이 새 `MATCH_COLS`로 응답, 날짜 셀은 항상 `YYYY-MM-DD` 문자열, `getChannelVideos`가 실제 영상을 돌려줌, `nocache=1`로 캐시 우회.

- [ ] **Step 1: 컬럼 상수**

```js
const MATCH_COLS   = ['id','date','location','youtube','type','attendees','teams','winner'];
const LINEUP_COLS  = ['id','match_id','name','formation','assignments'];
```
`COMMENT_COLS`·`SHEET_COMMENTS`는 남겨도 되지만 쓰는 곳이 없어지므로 지운다.

- [ ] **Step 2: doGet 분기 정리**

읽기 분기에서 `getComments`·`addComment` 두 `else if`를 지운다. 쓰기 switch에서 `case 'deleteComment'` 줄을 지운다. 세 핸들러 함수(172–206행)를 삭제한다.

- [ ] **Step 3: 헤더 자동 정렬 + 날짜 문자열화**

`getOrCreateSheet`와 `sheetToObjects`를 아래로 교체한다. 시트가 헤더만 있고(데이터 0줄) 헤더가 `cols`와 다르면 헤더를 새로 쓴다 — 매치기록 시트가 옛 열(team_a…)로 남아 있는 상태를 자동으로 고치기 위함. 데이터가 있으면 건드리지 않는다.

```js
function getOrCreateSheet(ss, name, cols) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) { sheet = ss.insertSheet(name); sheet.appendRow(cols); return sheet; }
  if (sheet.getLastRow() <= 1) {
    const head = sheet.getLastRow() === 1 ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0] : [];
    if (head.join('|') !== cols.join('|')) { sheet.clear(); sheet.appendRow(cols); }
  }
  return sheet;
}

function cell(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Seoul', 'yyyy-MM-dd');
  return v === undefined ? '' : v;
}

function sheetToObjects(ss, name, cols) {
  const sheet = ss.getSheetByName(name);
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  return data.slice(1).map(row => {
    const obj = {};
    cols.forEach((k, i) => { obj[k] = cell(row[i]); });
    return obj;
  });
}
```

`handleGetAll`이 `sheetToObjects`를 쓰므로 매치기록은 `getOrCreateSheet`를 거치지 않는다. `handleGetAll` 첫 줄 뒤에 한 줄 추가해 헤더 정렬이 읽기 때도 일어나게 한다:

```js
function handleGetAll(includePhone) {
  const ss = getSpreadsheet();
  getOrCreateSheet(ss, SHEET_MATCHES, MATCH_COLS);
  getOrCreateSheet(ss, SHEET_LINEUPS, LINEUP_COLS);
  // 이하 그대로
```

주의: 라인업 시트에는 `default` 행 1개가 있다(옛 열: id,name,formation,assignments). 데이터가 있으므로 자동 정렬이 안 된다. **사용자에게 그 행을 지우거나 B열에 `match_id` 열을 끼워 넣어 달라고 요청한다**(미리보기에 포함). 지우는 쪽을 권한다 — 새 전술보드 저장 형식과 호환되지 않는다.

- [ ] **Step 4: 영상 API 수정**

빈 배열이 나오는 원인 후보는 (a) 응답 코드가 200이 아닌데 `muteHttpExceptions`로 삼켜짐, (b) 빈 결과가 10분 캐시됨. 둘 다 막는다.

```js
function handleGetChannelVideos(nocache) {
  var cache = CacheService.getScriptCache();
  if (!nocache) { var cached = cache.get('YT_VIDEOS'); if (cached) return { videos: JSON.parse(cached) }; }
  var res = UrlFetchApp.fetch('https://www.youtube.com/feeds/videos.xml?channel_id=UCfL5rqpEVpMPe-FNG2UvobA',
    { muteHttpExceptions: true, followRedirects: true, headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/atom+xml,application/xml' } });
  var code = res.getResponseCode();
  if (code !== 200) return { videos: [], error_detail: 'youtube ' + code };
  var feed = res.getContentText();
  var entries = feed.match(/<entry>([\s\S]*?)<\/entry>/g) || [];
  var videos = entries.map(function(e) {
    var id = (e.match(/<yt:videoId>([^<]+)/) || [])[1];
    var title = (e.match(/<title>([^<]+)/) || [])[1];
    var pub = (e.match(/<published>([^<]+)/) || [])[1];
    return id && title ? { id: id, title: title.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"'), published: pub ? pub.slice(0, 10) : '' } : null;
  }).filter(Boolean);
  if (videos.length) cache.put('YT_VIDEOS', JSON.stringify(videos), 600);
  return { videos: videos };
}
```
doGet의 읽기 분기는 `result = handleGetChannelVideos(e.parameter.nocache === '1');`로 바꾼다. `error_detail`은 `error` 키가 아니므로 프론트가 throw하지 않는다.

- [ ] **Step 5: 미리보기 → go → 사용자가 재배포**

사용자에게 보여줄 것: 바뀐 함수 목록, 시트에서 손볼 것(라인업 `default` 행 삭제), 재배포 절차. go가 오면 사용자가 직접 한다:
1. `script.google.com/u/1/home/my` → `weekly fc` 열기 (u/0은 회사 계정이라 목록이 빔. 시트의 "확장 프로그램 > Apps Script"로 들어가면 빈 프로젝트가 생기니 그 길로 가지 말 것)
2. `apps-script.gs` 전체 붙여넣기 → 저장
3. 배포 > 배포 관리 > 연필 > 버전: **새 버전** > 배포 (주소 유지 확인: `AKfycby…lCJkkmg`)
4. 스크립트 속성에 `SPREADSHEET_ID`·`ADMIN_PIN`이 그대로 있는지 확인

- [ ] **Step 6: 배포 뒤 검증**

```bash
U='https://script.google.com/macros/s/AKfycbyUDTkTHsKszkiOeJKmNDHDkVJobrVUjbRqufU251PNKmlyrvC0BZ3ir9x0vM_lCJkkmg/exec'
curl -sL "$U?action=getAll" | python3 -c "import json,sys; d=json.load(sys.stdin); print('players', len(d['players']), '| matches', len(d['matches']), '| phone leaked:', any('phone' in p for p in d['players']))"
curl -sL "$U?action=getChannelVideos&nocache=1" | python3 -c "import json,sys; d=json.load(sys.stdin); print('videos', len(d['videos']), d.get('error_detail',''))"
```
Expected: `players 30 | matches 0 | phone leaked: False`, `videos 15` 이상. 영상이 여전히 0이고 `error_detail`에 코드가 찍히면 → 대안: Apps Script 편집기 "서비스 +"에서 **YouTube Data API**를 추가하고 아래로 교체한다(스크립트 소유자 계정의 채널이라 키 없이 됨).

```js
function handleGetChannelVideos(nocache) {
  var cache = CacheService.getScriptCache();
  if (!nocache) { var cached = cache.get('YT_VIDEOS'); if (cached) return { videos: JSON.parse(cached) }; }
  var r = YouTube.Search.list('id,snippet', { channelId: 'UCfL5rqpEVpMPe-FNG2UvobA', order: 'date', maxResults: 50, type: 'video' });
  var videos = (r.items || []).map(function(it) { return { id: it.id.videoId, title: it.snippet.title, published: (it.snippet.publishedAt || '').slice(0, 10) }; });
  if (videos.length) cache.put('YT_VIDEOS', JSON.stringify(videos), 600);
  return { videos: videos };
}
```

- [ ] **Step 7: 커밋** — `git add apps-script.gs && git commit -m "feat(api): 매치 열 개편 · 날짜 문자열화 · 댓글 제거 · 영상 API 수정"`

---

### Task 7: table.ts · Tabs.astro · lineup-svg.ts

**Files:**
- Create: `src/components/table.ts`, `src/components/Tabs.astro`, `src/components/lineup-svg.ts`, `tests/unit/table.test.mjs`

**Interfaces:**
- Produces:
  ```ts
  type Column<T> = { key: string; label: string; get: (r: T) => string | number; cell?: (r: T) => string; align?: 'l' | 'r' | 'c'; sortable?: boolean };
  type TableState = { sortKey: string; sortDir: 'asc' | 'desc' };
  sortRows<T>(rows, cols, state): T[]
  renderTable<T>(cols, rows, state, opts?: { empty?: string; rowAttr?: (r: T) => string }): string   // <table class="tbl">…
  mountTable<T>(el, cols, rows, state, opts?): void   // 렌더 + th 클릭 정렬
  ```
  `Tabs.astro` props `{ items: { href: string; label: string }[] }` — `Astro.url.pathname`으로 active.
  `lineupSvg(state: PitchState): string` — 저장된 전술보드 상태를 정적 SVG로.
  ```ts
  // 전술보드 저장 형식 (Task 12의 pitch.ts가 같은 것을 쓴다)
  type PitchPlayer = { n: number; pos: string; x: number; y: number; name?: string };   // x,y는 0~1 (세로 기준)
  type PitchState = { mode: 'soccer' | 'futsal'; count: number; home: PitchPlayer[]; away: PitchPlayer[]; homeColor: string; awayColor: string; formation: { home: string; away: string } };
  ```

- [ ] **Step 1: 실패하는 테스트**

```js
// tests/unit/table.test.mjs
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
```

- [ ] **Step 2: 실패 확인** — Run: `npm run test:unit` → FAIL.

- [ ] **Step 3: 구현**

```ts
// src/components/table.ts — 정렬되는 표. DOM은 mountTable에서만.
import { esc } from '../lib/html';

export type Column<T> = { key: string; label: string; get: (r: T) => string | number; cell?: (r: T) => string; align?: 'l' | 'r' | 'c'; sortable?: boolean };
export type TableState = { sortKey: string; sortDir: 'asc' | 'desc' };
type Opts<T> = { empty?: string; rowAttr?: (r: T) => string };

export function sortRows<T>(rows: T[], cols: Column<T>[], state: TableState): T[] {
  const col = cols.find((c) => c.key === state.sortKey);
  if (!col) return [...rows];
  const dir = state.sortDir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = col.get(a), y = col.get(b);
    if (typeof x === 'number' && typeof y === 'number') return (x - y) * dir;
    return String(x).localeCompare(String(y), 'ko') * dir;
  });
}
export function renderTable<T>(cols: Column<T>[], rows: T[], state: TableState, opts: Opts<T> = {}): string {
  const sorted = sortRows(rows, cols, state);
  const th = cols.map((c) => {
    const on = c.key === state.sortKey;
    const cls = [c.align ?? 'l', on ? 'sorted' : ''].filter(Boolean).join(' ');
    return `<th class="${cls}" data-key="${esc(c.key)}">${esc(c.label)}${on ? (state.sortDir === 'asc' ? ' ▴' : ' ▾') : ''}</th>`;
  }).join('');
  const body = sorted.length
    ? sorted.map((r) => `<tr ${opts.rowAttr ? opts.rowAttr(r) : ''}>${cols.map((c) => `<td class="${c.align ?? 'l'}">${c.cell ? c.cell(r) : esc(c.get(r))}</td>`).join('')}</tr>`).join('')
    : `<tr><td class="empty" colspan="${cols.length}">${esc(opts.empty ?? '아직 없음')}</td></tr>`;
  return `<table class="tbl"><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table>`;
}
export function mountTable<T>(el: HTMLElement, cols: Column<T>[], rows: T[], state: TableState, opts: Opts<T> = {}): void {
  const draw = () => {
    el.innerHTML = renderTable(cols, rows, state, opts);
    el.querySelectorAll<HTMLElement>('th[data-key]').forEach((th) => {
      th.onclick = () => {
        const key = th.dataset.key!;
        const col = cols.find((c) => c.key === key);
        if (!col || col.sortable === false) return;
        if (state.sortKey === key) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
        else { state.sortKey = key; state.sortDir = typeof col.get(rows[0] ?? ({} as T)) === 'number' ? 'desc' : 'asc'; }
        draw();
      };
    });
  };
  draw();
}
```

```astro
---
// src/components/Tabs.astro — 화면 안 탭 줄 (정적 링크). 클라이언트 탭은 페이지가 직접 그린다.
interface Props { items: { href: string; label: string }[] }
const { items } = Astro.props;
const path = Astro.url.pathname;
---
<nav class="tabs">
  {items.map((t) => <a href={t.href} class:list={[{ active: path === t.href }]}>{t.label}</a>)}
</nav>
```

```ts
// src/components/lineup-svg.ts — 저장된 라인업을 읽기 전용 SVG로. 세로 피치, x·y는 0~1.
import { esc } from '../lib/html';
export type PitchPlayer = { n: number; pos: string; x: number; y: number; name?: string };
export type PitchState = { mode: 'soccer' | 'futsal'; count: number; home: PitchPlayer[]; away: PitchPlayer[]; homeColor: string; awayColor: string; formation: { home: string; away: string } };

export function lineupSvg(s: PitchState): string {
  const W = 400, H = s.mode === 'futsal' ? 600 : 640, r = 14;
  const dot = (p: PitchPlayer, fill: string, flip: boolean) => {
    const cx = (flip ? 1 - p.x : p.x) * W, cy = (flip ? 1 - p.y : p.y) * H;
    const label = p.name ? esc(p.name) : String(p.n);
    return `<g><circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r}" fill="${esc(fill)}" stroke="var(--fg)" stroke-width="1"/><text x="${cx.toFixed(1)}" y="${(cy + 4).toFixed(1)}" text-anchor="middle" font-size="11" font-weight="600" fill="var(--fg)">${String(p.n)}</text><text x="${cx.toFixed(1)}" y="${(cy + r + 12).toFixed(1)}" text-anchor="middle" font-size="10" fill="var(--muted)">${label}</text></g>`;
  };
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:${W}px;background:var(--surface);border:1px solid var(--line)">
<rect x="10" y="10" width="${W - 20}" height="${H - 20}" fill="none" stroke="var(--line)"/><line x1="10" y1="${H / 2}" x2="${W - 10}" y2="${H / 2}" stroke="var(--line)"/><circle cx="${W / 2}" cy="${H / 2}" r="40" fill="none" stroke="var(--line)"/>
${s.home.map((p) => dot(p, s.homeColor, false)).join('')}${s.away.map((p) => dot(p, s.awayColor, true)).join('')}</svg>`;
}
```

- [ ] **Step 4: 통과 확인** — Run: `npm run test:unit` → table 6개 PASS. `npm run build` 성공.
- [ ] **Step 5: 커밋** — `git add src/components tests/unit/table.test.mjs && git commit -m "feat: 정렬 표 · 탭 · 라인업 SVG 컴포넌트"`

---

### Task 8: 스쿼드 표 + 선수 페이지

**Files:**
- Create: `src/pages/squad/index.astro`, `src/pages/squad/[num].astro`, `src/components/player-card.ts`
- Modify: `tests/build/dist.test.mjs` — `PAGES`에 `'squad/index.html'`, `'squad/9/index.html'`, `'squad/99/index.html'` 추가

**Interfaces:**
- Consumes: `onData`, `isAdmin`, `write`, `fetchFull`, `serializePlayer`(api) · `ovr`, `grade`, `band`, `STAT_CUTS`, `RATE_CUTS`, `attendance`, `wins`(stats) · `nextDuty`(rotation) · `mountTable`, `Column`(table) · `esc`, `fmtDate`, `fmtWon`, `toast`(html) · `href`(url) · `getMe`(me).
- Produces: `playerCard(p: Player): string` (선수 페이지 상단 카드, 홈 "내 자리"에서도 쓴다).

- [ ] **Step 1: player-card.ts**

```ts
// src/components/player-card.ts
import { esc } from '../lib/html';
import { ovr, grade, band, STAT_CUTS } from '../lib/stats';
import { STAT_KEYS, type Player } from '../lib/types';
export const STAT_LABEL: Record<(typeof STAT_KEYS)[number], string> = { pace: 'PAC', dribble: 'DRI', pass: 'PAS', shoot: 'SHO', defend: 'DEF', stamina: 'PHY' };
export const STAT_KO: Record<(typeof STAT_KEYS)[number], string> = { pace: '페이스', dribble: '드리블', pass: '패스', shoot: '슈팅', defend: '수비', stamina: '체력' };
export function playerCard(p: Player): string {
  const o = ovr(p);
  const bars = STAT_KEYS.map((k) => `<div class="bar" title="${STAT_KO[k]}"><span>${STAT_LABEL[k]}</span><i><b style="width:${Math.max(0, Math.min(100, p[k]))}%"></b></i><span class="val val-${band(p[k], STAT_CUTS)}">${p[k] || '–'}</span></div>`).join('');
  return `<div class="card pcard">
    <div class="row" style="justify-content:space-between;align-items:flex-start">
      <div><div class="label">#${p.num}${p.vest ? ` · 조끼 ${p.vest}` : ''}</div><h2 style="font-size:var(--fs-lg)">${esc(p.name)}</h2>
        <div class="row" style="margin-top:6px"><span class="pos pos-${p.pos.toLowerCase()}">${p.pos || '–'}</span><span class="muted">${esc(p.detail)}${p.foot ? ` · ${esc(p.foot)}` : ''}</span></div></div>
      <div style="text-align:right"><div class="label">OVR</div><div class="big grade-${grade(o)}">${o || '–'}</div></div>
    </div>
    <div class="bars" style="margin-top:14px">${bars}</div>
    ${p.note ? `<p class="muted" style="margin:12px 0 0;font-size:var(--fs-sm)">${esc(p.note)}</p>` : ''}
  </div>`;
}
```

- [ ] **Step 2: squad/index.astro**

```astro
---
import Shell from '../../layouts/Shell.astro';
---
<Shell title="스쿼드">
  <div class="page-head">
    <h1>스쿼드 <span class="muted" id="count"></span></h1>
    <div class="actions">
      <div class="chips" id="pos-filter"><button class="chip on" data-pos="ALL">전체</button><button class="chip" data-pos="GK">GK</button><button class="chip" data-pos="DF">DF</button><button class="chip" data-pos="MF">MF</button><button class="chip" data-pos="FW">FW</button></div>
      <input id="q" type="search" placeholder="이름" style="width:120px" />
      <button id="add" hidden>선수 추가</button>
    </div>
  </div>
  <div id="app" class="tbl-wrap"></div>
</Shell>
<script>
  import { onData, isAdmin } from '../../lib/api';
  import { href } from '../../lib/url';
  import { esc } from '../../lib/html';
  import { ovr, band, STAT_CUTS, RATE_CUTS, attendance } from '../../lib/stats';
  import { mountTable, type Column, type TableState } from '../../components/table';
  import { STAT_LABEL } from '../../components/player-card';
  import { STAT_KEYS, type Data, type Player } from '../../lib/types';

  let data: Data | null = null, pos = 'ALL', q = '';
  const state: TableState = { sortKey: 'num', sortDir: 'asc' };
  const app = document.getElementById('app')!;

  function cols(d: Data): Column<Player>[] {
    return [
      { key: 'num', label: '#', get: (p) => p.num, align: 'r' },
      { key: 'name', label: '이름', get: (p) => p.name, cell: (p) => `<a href="${href(`/squad/${p.num}/`)}"><b>${esc(p.name)}</b></a>` },
      { key: 'pos', label: '포지션', get: (p) => p.pos, cell: (p) => `<span class="pos pos-${p.pos.toLowerCase()}">${p.pos || '–'}</span> <span class="muted">${esc(p.detail)}</span>` },
      { key: 'foot', label: '주발', get: (p) => p.foot },
      ...STAT_KEYS.map((k): Column<Player> => ({ key: k, label: STAT_LABEL[k], get: (p) => p[k], align: 'r', cell: (p) => `<span class="val val-${band(p[k], STAT_CUTS)}">${p[k] || '–'}</span>` })),
      { key: 'ovr', label: 'OVR', get: (p) => ovr(p), align: 'r', cell: (p) => `<b class="val val-${band(ovr(p), STAT_CUTS)}">${ovr(p) || '–'}</b>` },
      { key: 'att', label: '출석', get: (p) => attendance(p.name, d.matches).rate, align: 'r', cell: (p) => { const a = attendance(p.name, d.matches); return a.total ? `<span class="val val-${band(a.rate, RATE_CUTS)}">${a.rate}%</span>` : '<span class="muted">–</span>'; } },
    ];
  }
  function render() {
    if (!data) return;
    const rows = data.players.filter((p) => (pos === 'ALL' || p.pos === pos) && (!q || p.name.includes(q)));
    document.getElementById('count')!.textContent = `${rows.length}명`;
    document.getElementById('add')!.hidden = !isAdmin();
    mountTable(app, cols(data), rows, state, { empty: '명단이 비어 있습니다' });
  }
  document.querySelectorAll<HTMLElement>('#pos-filter .chip').forEach((b) => (b.onclick = () => { pos = b.dataset.pos!; document.querySelectorAll('#pos-filter .chip').forEach((x) => x.classList.toggle('on', x === b)); render(); }));
  (document.getElementById('q') as HTMLInputElement).oninput = (e) => { q = (e.target as HTMLInputElement).value.trim(); render(); };
  document.getElementById('add')!.onclick = () => { const used = new Set(data!.players.map((p) => p.num)); let n = 1; while (used.has(n)) n++; location.href = href(`/squad/${n}/?new=1`); };
  window.addEventListener('wfc:admin', render);
  onData((d) => { data = d; render(); });
</script>
```

- [ ] **Step 3: squad/[num].astro**

```astro
---
import Shell from '../../layouts/Shell.astro';
export function getStaticPaths() { return Array.from({ length: 99 }, (_, i) => ({ params: { num: String(i + 1) } })); }
const { num } = Astro.params;
---
<Shell title={`선수 #${num}`}>
  <div class="page-head"><h1 id="title">선수 #{num}</h1><div class="actions" id="actions"></div></div>
  <div id="app" class="stack" data-num={num}></div>
  <div class="modal-bg" id="edit-modal"><div class="modal" style="max-width:560px"><h2>선수 편집</h2><form class="form" id="edit-form"></form><div class="foot"><button class="danger" id="del">삭제</button><span style="flex:1"></span><button data-close="edit-modal">취소</button><button class="primary" id="save">저장</button></div></div></div>
</Shell>
<script>
  import { onData, isAdmin, write, fetchFull, serializePlayer } from '../../lib/api';
  import { href } from '../../lib/url';
  import { esc, fmtDate, fmtWon, monthLabel, toast } from '../../lib/html';
  import { attendance, wins, band, RATE_CUTS } from '../../lib/stats';
  import { nextDuty } from '../../lib/rotation';
  import { playerCard, STAT_KO } from '../../components/player-card';
  import { STAT_KEYS, type Data, type Player } from '../../lib/types';

  const app = document.getElementById('app')!;
  const num = Number(app.dataset.num);
  const isNew = new URLSearchParams(location.search).get('new') === '1';
  let data: Data | null = null;
  const $ = (id: string) => document.getElementById(id) as HTMLElement;
  document.querySelectorAll<HTMLElement>('[data-close]').forEach((b) => (b.onclick = () => $(b.dataset.close!).classList.remove('show')));

  function render() {
    if (!data) return;
    const p = data.players.find((x) => x.num === num);
    $('actions').innerHTML = isAdmin() ? `<button id="edit">편집</button>` : '';
    if (isAdmin()) $('edit').onclick = () => openEdit(p);
    if (!p) { $('title').textContent = `선수 #${num}`; app.innerHTML = `<p class="muted">이 번호의 선수가 없습니다.${isAdmin() ? ' 편집으로 추가할 수 있습니다.' : ''}</p>`; if (isNew && isAdmin()) openEdit(undefined); return; }
    $('title').textContent = p.name;
    const my = data.matches.filter((m) => m.attendees.includes(p.name));
    const a = attendance(p.name, data.matches), w = wins(p.name, data.matches);
    const fines = data.fines.filter((f) => f.player === p.name);
    const unpaid = fines.filter((f) => !f.paid).reduce((s, f) => s + f.amount, 0);
    const duty = nextDuty(data.players, data.rotation, p.name);
    app.innerHTML = `${playerCard(p)}
      <div class="cards">
        <div class="card"><h2>출석</h2><div class="big">${a.total ? `<span class="val val-${band(a.rate, RATE_CUTS)}">${a.rate}%</span>` : '–'}</div><p class="muted">${a.attended} / ${a.total} 매치</p></div>
        <div class="card"><h2>승률</h2><div class="big">${w.played ? `${w.rate}%` : '–'}</div><p class="muted">${w.won}승 / 결과 있는 ${w.played} 매치</p></div>
        <div class="card"><h2>벌금</h2><div class="big ${unpaid ? 'warn' : ''}">${fmtWon(unpaid)}</div><p class="muted">미납 · 누계 ${fmtWon(fines.reduce((s, f) => s + f.amount, 0))} (${fines.length}건)</p></div>
        <div class="card"><h2>봉사</h2><div class="big">${duty ? monthLabel(duty.year, duty.month) : '–'}</div><p class="muted">${p.rot ? `순번 ${p.rot} · 다음 차례` : '로테이션 제외'}</p></div>
      </div>
      <div class="card"><h2>참여 이력</h2>${my.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>날짜</th><th>장소</th><th>유형</th><th>결과</th></tr></thead><tbody>${my.map((m) => { const won = m.winner && m.teams.find((t) => t.name === m.winner)?.players.includes(p.name); return `<tr><td><a href="${href(`/match/?d=${encodeURIComponent(m.id)}`)}">${fmtDate(m.date)}</a></td><td>${esc(m.location) || '–'}</td><td>${esc(m.type) || '–'}</td><td>${m.winner ? (won ? '<span class="val val-a">승</span>' : '<span class="val val-d">패</span>') : '<span class="muted">–</span>'}</td></tr>`; }).join('')}</tbody></table></div>` : '<p class="muted">아직 참석 기록이 없습니다.</p>'}</div>
      ${fines.length ? `<div class="card"><h2>벌금 내역</h2><div class="tbl-wrap"><table class="tbl"><thead><tr><th>날짜</th><th>유형</th><th class="r">금액</th><th>납부</th></tr></thead><tbody>${fines.map((f) => `<tr><td>${fmtDate(f.date)}</td><td>${f.type}</td><td class="r">${fmtWon(f.amount)}</td><td>${f.paid ? '완료' : '<span class="warn">미납</span>'}</td></tr>`).join('')}</tbody></table></div></div>` : ''}`;
  }

  const F = (name: string, label: string, value: string | number, type = 'text', extra = '') => `<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
  async function openEdit(p: Player | undefined) {
    let full = p;
    if (p) { try { full = (await fetchFull()).players.find((x) => x.num === num) ?? p; } catch { toast('전화번호를 못 불러왔습니다'); } }
    const v = full ?? { num, name: '', pos: '' as const, detail: '', foot: '', vest: null, note: '', pace: 70, dribble: 70, pass: 70, shoot: 70, defend: 70, stamina: 70, rot: null, phone: '' };
    ($('edit-form') as HTMLFormElement).innerHTML = `
      ${F('num', '번호', v.num, 'number', 'min="1" max="99" required')}${F('name', '이름', v.name, 'text', 'required')}
      <label>포지션<select name="pos">${['', 'GK', 'DF', 'MF', 'FW'].map((x) => `<option ${x === v.pos ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
      ${F('detail', '세부 포지션', v.detail)}${F('foot', '주발', v.foot)}${F('vest', '조끼', v.vest ?? '', 'number')}${F('rot', '봉사 순번 (빈칸=제외)', v.rot ?? '', 'number')}${F('phone', '전화 (공개 안 됨)', v.phone ?? '', 'tel')}
      ${STAT_KEYS.map((k) => F(k, STAT_KO[k], v[k], 'number', 'min="1" max="99"')).join('')}
      <label class="full">메모<input name="note" value="${esc(v.note)}"></label>`;
    $('del').hidden = !p;
    $('edit-modal').classList.add('show');
  }
  $('save').onclick = async () => {
    const fd = new FormData($('edit-form') as HTMLFormElement);
    const g = (k: string) => String(fd.get(k) ?? '').trim();
    const n = (k: string) => (g(k) === '' ? null : Number(g(k)));
    const p: Player = { num: Number(g('num')), name: g('name'), pos: g('pos') as Player['pos'], detail: g('detail'), foot: g('foot'), vest: n('vest'), note: g('note'), rot: n('rot'),
      pace: n('pace') ?? 0, dribble: n('dribble') ?? 0, pass: n('pass') ?? 0, shoot: n('shoot') ?? 0, defend: n('defend') ?? 0, stamina: n('stamina') ?? 0, phone: g('phone') };
    if (!p.num || !p.name) { toast('번호와 이름은 필수'); return; }
    try { await write('writePlayer', serializePlayer(p)); $('edit-modal').classList.remove('show'); toast('저장됨'); if (p.num !== num) location.href = href(`/squad/${p.num}/`); } catch (e) { toast((e as Error).message); }
  };
  $('del').onclick = async () => { if (!confirm('이 선수를 명단에서 지울까요?')) return; try { await write('deletePlayer', { num }); location.href = href('/squad/'); } catch (e) { toast((e as Error).message); } };
  window.addEventListener('wfc:admin', render);
  onData((d) => { data = d; render(); });
</script>
```

`confirm()`은 브라우저 자동화 세션에서는 다이얼로그가 막히므로, 검증할 때는 관리자 삭제를 누르지 않는다.

- [ ] **Step 4: 빌드 테스트에 페이지 추가 → `npm test` 통과 확인**

`PAGES`에 `'squad/index.html', 'squad/9/index.html', 'squad/99/index.html'` 추가. Expected: 전부 PASS.

- [ ] **Step 5: 브라우저 확인**

`npm run dev` → `http://localhost:4321/weekly-fc/squad/` 에서 30명 표, 정렬·필터·검색 동작, 선수 클릭 → `/squad/{n}/` 카드·이력. 1280·390 폭 스크린샷.

- [ ] **Step 6: 커밋** — `git add -A && git commit -m "feat: 스쿼드 표 · 선수 페이지 · 편집"`

---

### Task 9: 매치 목록 · 상세 · 관리자 흐름

**Files:**
- Create: `src/pages/match/index.astro`
- Modify: `tests/build/dist.test.mjs` — `PAGES`에 `'match/index.html'`

**Interfaces:**
- Consumes: `onData`, `isAdmin`, `write`, `loadVideos`, `serializeMatch`(api) · `proposeMatches`, `parseAttendance`(parse) · `lineupSvg`(lineup-svg) · `esc`, `fmtDate`, `ytThumb`, `ytEmbed`, `toast`(html) · `href`.
- Produces: 주소 규약 `?d=<match.id>` (Task 8·10·11이 링크한다). 리캡 탭 자리 `#recap-slot`(Task 13이 채운다: `window.wfcRecap(match, lineupState|null)` 호출).

- [ ] **Step 1: match/index.astro**

```astro
---
import Shell from '../../layouts/Shell.astro';
---
<Shell title="매치">
  <div class="page-head"><h1 id="title">매치</h1><div class="actions" id="actions"></div></div>
  <div id="app" class="stack"></div>
  <div class="modal-bg" id="import-modal"><div class="modal" style="max-width:560px"><h2>영상에서 가져오기</h2><p class="muted">채널 영상 제목에서 날짜·유형·장소를 읽어 아직 없는 매치를 만듭니다.</p><div id="import-list" class="stack"></div><div class="foot"><button data-close="import-modal">닫기</button><button class="primary" id="import-ok">추가</button></div></div></div>
  <div class="modal-bg" id="att-modal"><div class="modal" style="max-width:560px"><h2>참석 채우기</h2><p class="muted">카톡 투표 결과를 복사해 붙여넣으세요. 명단과 대조합니다.</p><textarea id="att-text" rows="6" style="width:100%"></textarea><div id="att-preview" class="stack" style="margin-top:12px"></div><div class="foot"><button data-close="att-modal">취소</button><button class="primary" id="att-ok">저장</button></div></div></div>
  <div class="modal-bg" id="res-modal"><div class="modal" style="max-width:640px"><h2>결과 적기</h2><div id="res-form" class="stack"></div><div class="foot"><button data-close="res-modal">취소</button><button class="primary" id="res-ok">저장</button></div></div></div>
  <div class="modal-bg" id="meta-modal"><div class="modal"><h2>매치 정보</h2><form class="form" id="meta-form"></form><div class="foot"><button class="danger" id="meta-del">삭제</button><span style="flex:1"></span><button data-close="meta-modal">취소</button><button class="primary" id="meta-ok">저장</button></div></div></div>
</Shell>
<script>
  import { onData, isAdmin, write, loadVideos, serializeMatch } from '../../lib/api';
  import { proposeMatches, parseAttendance } from '../../lib/parse';
  import { lineupSvg, type PitchState } from '../../components/lineup-svg';
  import { esc, fmtDate, ytThumb, ytEmbed, toast } from '../../lib/html';
  import { href } from '../../lib/url';
  import type { Data, Match, Team } from '../../lib/types';

  const $ = (id: string) => document.getElementById(id) as HTMLElement;
  const app = $('app');
  const id = new URLSearchParams(location.search).get('d');
  let data: Data | null = null;
  let view: 'list' | 'thumbs' = (localStorage.getItem('wfc_match_view') as 'list' | 'thumbs') || 'list';
  let tab: 'info' | 'lineup' | 'recap' = 'info';
  document.querySelectorAll<HTMLElement>('[data-close]').forEach((b) => (b.onclick = () => $(b.dataset.close!).classList.remove('show')));
  const link = (m: Match) => href(`/match/?d=${encodeURIComponent(m.id)}`);
  const result = (m: Match) => (m.winner ? `${esc(m.winner)} 승` : m.teams.length ? '결과 없음' : '');

  // ── 목록 ──
  function renderList(d: Data) {
    $('title').textContent = '매치';
    $('actions').innerHTML = `<div class="chips"><button class="chip ${view === 'list' ? 'on' : ''}" data-view="list">줄</button><button class="chip ${view === 'thumbs' ? 'on' : ''}" data-view="thumbs">썸네일</button></div>${isAdmin() ? '<button id="import">영상에서 가져오기</button><button id="new">직접 추가</button>' : ''}`;
    document.querySelectorAll<HTMLElement>('[data-view]').forEach((b) => (b.onclick = () => { view = b.dataset.view as typeof view; localStorage.setItem('wfc_match_view', view); renderList(d); }));
    if (isAdmin()) { $('import').onclick = openImport; $('new').onclick = () => openMeta(null); }
    if (!d.matches.length) { app.innerHTML = `<p class="muted">아직 매치 기록이 없습니다.${isAdmin() ? ' "영상에서 가져오기"로 시작하세요.' : ''}</p>`; return; }
    if (view === 'thumbs') {
      const vids = d.matches.filter((m) => m.youtube);
      app.innerHTML = `<div class="thumbs">${vids.map((m) => `<a class="thumb" href="${link(m)}"><img src="${ytThumb(m.youtube)}" alt="" loading="lazy"><div class="body"><b>${fmtDate(m.date)}</b><div class="muted">${esc(m.type)}${m.location ? ` · ${esc(m.location)}` : ''} · ${m.attendees.length}명</div></div></a>`).join('')}</div>${vids.length ? '' : '<p class="muted">영상이 붙은 매치가 없습니다.</p>'}`;
      return;
    }
    const years = [...new Set(d.matches.map((m) => m.date.slice(0, 4)))].sort().reverse();
    app.innerHTML = years.map((y, i) => `<details class="year" ${i === 0 ? 'open' : ''}><summary>${y} <span class="muted">${d.matches.filter((m) => m.date.startsWith(y)).length}경기</span></summary><div class="tbl-wrap"><table class="tbl"><thead><tr><th>날짜</th><th>장소</th><th>유형</th><th>결과</th><th class="r">참석</th><th class="c">영상</th></tr></thead><tbody>
      ${d.matches.filter((m) => m.date.startsWith(y)).map((m) => `<tr><td><a href="${link(m)}"><b>${fmtDate(m.date)}</b></a></td><td>${esc(m.location) || '<span class="muted">–</span>'}</td><td>${esc(m.type) || '<span class="muted">–</span>'}</td><td>${result(m) || '<span class="muted">–</span>'}</td><td class="r">${m.attendees.length || '<span class="muted">–</span>'}</td><td class="c">${m.youtube ? '▶' : ''}</td></tr>`).join('')}</tbody></table></div></details>`).join('');
  }

  // ── 상세 ──
  function renderDetail(d: Data) {
    const m = d.matches.find((x) => x.id === id);
    if (!m) { $('title').textContent = '매치'; app.innerHTML = `<p class="muted">그 날짜의 매치가 없습니다.</p><p><a href="${href('/match/')}">← 목록</a></p>`; return; }
    $('title').textContent = fmtDate(m.date);
    $('actions').innerHTML = `<a href="${href('/match/')}">← 목록</a>${isAdmin() ? '<button id="att">참석 채우기</button><button id="res">결과 적기</button><button id="meta">정보</button>' : ''}`;
    if (isAdmin()) { $('att').onclick = () => openAtt(m); $('res').onclick = () => openRes(m); $('meta').onclick = () => openMeta(m); }
    const lineup = d.lineups.find((l) => l.match_id === m.id);
    let ps: PitchState | null = null; try { ps = lineup ? (JSON.parse(lineup.assignments) as PitchState) : null; } catch { ps = null; }
    const tabs = `<nav class="tabs">${[['info', '개요'], ['lineup', '라인업'], ['recap', '리캡']].map(([k, l]) => `<button data-tab="${k}" class="${tab === k ? 'active' : ''}">${l}</button>`).join('')}</nav>`;
    let body = '';
    if (tab === 'info') {
      const teams = m.teams.length ? `<div class="card"><h2>팀 편성${m.winner ? ` · <span class="val val-a">${esc(m.winner)} 승</span>` : ''}</h2><div class="cards">${m.teams.map((t) => `<div class="card"><h2>${esc(t.name)}${t.points != null ? ` <span class="muted">${t.points}점</span>` : ''}</h2><div class="chips">${t.players.map((p) => `<span class="chip">${esc(p)}</span>`).join('')}</div></div>`).join('')}</div></div>` : '';
      body = `<div class="cards"><div class="card"><h2>정보</h2><p>${esc(m.type) || '–'} · ${esc(m.location) || '장소 없음'}</p></div><div class="card"><h2>참석 ${m.attendees.length}명</h2><div class="chips">${m.attendees.map((p) => { const pl = d.players.find((x) => x.name === p); return pl ? `<a class="chip" href="${href(`/squad/${pl.num}/`)}">${esc(p)}</a>` : `<span class="chip">${esc(p)}</span>`; }).join('') || '<span class="muted">아직 없음</span>'}</div></div></div>${teams}${m.youtube ? `<div class="embed"><iframe src="${ytEmbed(m.youtube)}" title="매치 영상" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>` : ''}`;
    } else if (tab === 'lineup') {
      body = ps ? lineupSvg(ps) : `<p class="muted">저장된 라인업이 없습니다. <a href="${href(`/tactics/?match=${encodeURIComponent(m.id)}`)}">전술보드에서 만들기 →</a></p>`;
    } else {
      body = `<div id="recap-slot" class="stack"><p class="muted">리캡 카드를 준비 중…</p></div>`;
    }
    app.innerHTML = tabs + body;
    document.querySelectorAll<HTMLElement>('[data-tab]').forEach((b) => (b.onclick = () => { tab = b.dataset.tab as typeof tab; renderDetail(d); }));
    if (tab === 'recap') (window as unknown as { wfcRecap?: (m: Match, ps: PitchState | null) => void }).wfcRecap?.(m, ps);
  }

  // ── 관리자: 영상에서 가져오기 ──
  async function openImport() {
    $('import-list').innerHTML = '<p class="muted">채널을 읽는 중…</p>'; $('import-modal').classList.add('show');
    try {
      const vids = await loadVideos();
      const props = proposeMatches(vids, data!.matches);
      $('import-list').innerHTML = props.length ? props.map((m, i) => `<label class="row"><input type="checkbox" checked data-i="${i}"> <b>${fmtDate(m.date)}</b> <span class="muted">${esc(m.type) || '유형 모름'} · ${esc(m.location) || '장소 모름'}</span></label>`).join('') : `<p class="muted">새로 만들 매치가 없습니다. (영상 ${vids.length}개 읽음)</p>`;
      $('import-ok').onclick = async () => {
        const picked = [...document.querySelectorAll<HTMLInputElement>('#import-list input:checked')].map((c) => props[Number(c.dataset.i)]);
        if (!picked.length) return;
        ($('import-ok') as HTMLButtonElement).disabled = true;
        try { for (const m of picked) await write('writeMatch', serializeMatch(m)); toast(`${picked.length}개 추가됨`); $('import-modal').classList.remove('show'); }
        catch (e) { toast((e as Error).message); } finally { ($('import-ok') as HTMLButtonElement).disabled = false; }
      };
    } catch (e) { $('import-list').innerHTML = `<p class="warn">${esc((e as Error).message)}</p>`; }
  }

  // ── 관리자: 참석 채우기 ──
  function openAtt(m: Match) {
    let picked = [...m.attendees];
    const ta = $('att-text') as HTMLTextAreaElement; ta.value = '';
    const draw = (unmatched: string[] = []) => {
      $('att-preview').innerHTML = `<div class="label">참석 ${picked.length}명</div><div class="chips">${picked.map((p) => `<button class="chip on" data-rm="${esc(p)}">${esc(p)} ×</button>`).join('')}</div>${unmatched.length ? `<div class="label">못 찾음</div><div class="chips">${unmatched.map((u) => `<span class="chip warn">${esc(u)}</span>`).join('')}</div>` : ''}<div class="label">명단에서 추가</div><div class="chips">${data!.players.filter((p) => !picked.includes(p.name)).map((p) => `<button class="chip" data-add="${esc(p.name)}">${esc(p.name)}</button>`).join('')}</div>`;
      document.querySelectorAll<HTMLElement>('[data-rm]').forEach((b) => (b.onclick = () => { picked = picked.filter((x) => x !== b.dataset.rm); draw(unmatched); }));
      document.querySelectorAll<HTMLElement>('[data-add]').forEach((b) => (b.onclick = () => { picked.push(b.dataset.add!); draw(unmatched); }));
    };
    ta.oninput = () => { const r = parseAttendance(ta.value, data!.players); for (const n of r.matched) if (!picked.includes(n)) picked.push(n); draw(r.unmatched); };
    draw();
    $('att-ok').onclick = async () => { try { await write('writeMatch', serializeMatch({ ...m, attendees: picked })); $('att-modal').classList.remove('show'); toast('저장됨'); } catch (e) { toast((e as Error).message); } };
    $('att-modal').classList.add('show');
  }

  // ── 관리자: 결과 적기 ──
  function openRes(m: Match) {
    const n = m.type === '3파전' ? 3 : 2;
    const teams: Team[] = Array.from({ length: n }, (_, i) => m.teams[i] ?? { name: String.fromCharCode(65 + i), players: [], points: null });
    const draw = () => {
      $('res-form').innerHTML = teams.map((t, i) => `<div class="card"><div class="row"><label>팀 이름 <input data-t="${i}" data-f="name" value="${esc(t.name)}" style="width:80px"></label><label>승점 <input data-t="${i}" data-f="points" type="number" value="${t.points ?? ''}" style="width:70px"></label></div><div class="chips" style="margin-top:8px">${m.attendees.map((p) => `<button class="chip ${t.players.includes(p) ? 'on' : ''}" data-t="${i}" data-p="${esc(p)}">${esc(p)}</button>`).join('') || '<span class="muted">먼저 참석을 채우세요</span>'}</div></div>`).join('') + `<label class="row">우승 <select id="res-winner"><option value="">없음</option>${teams.map((t) => `<option ${m.winner === t.name ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>`;
      document.querySelectorAll<HTMLInputElement>('[data-f]').forEach((el) => (el.oninput = () => { const t = teams[Number(el.dataset.t)]; if (el.dataset.f === 'name') t.name = el.value; else t.points = el.value === '' ? null : Number(el.value); }));
      document.querySelectorAll<HTMLElement>('[data-p]').forEach((b) => (b.onclick = () => { const ti = Number(b.dataset.t), p = b.dataset.p!; teams.forEach((t, i) => { t.players = t.players.filter((x) => x !== p); if (i === ti && !b.classList.contains('on')) t.players.push(p); }); draw(); }));
    };
    draw();
    $('res-ok').onclick = async () => { const winner = ($('res-winner') as HTMLSelectElement).value; try { await write('writeMatch', serializeMatch({ ...m, teams, winner })); $('res-modal').classList.remove('show'); toast('저장됨'); } catch (e) { toast((e as Error).message); } };
    $('res-modal').classList.add('show');
  }

  // ── 관리자: 정보 편집 / 직접 추가 ──
  function openMeta(m: Match | null) {
    const v = m ?? { id: '', date: new Date().toISOString().slice(0, 10), location: '', youtube: '', type: '' as const, attendees: [], teams: [], winner: '' };
    ($('meta-form') as HTMLFormElement).innerHTML = `<label>날짜<input name="date" type="date" value="${v.date}" required></label><label>유형<select name="type">${['', '2파전', '3파전'].map((t) => `<option ${t === v.type ? 'selected' : ''}>${t}</option>`).join('')}</select></label><label>장소<input name="location" value="${esc(v.location)}"></label><label class="full">유튜브 ID 또는 주소<input name="youtube" value="${esc(v.youtube)}"></label>`;
    $('meta-del').hidden = !m;
    $('meta-ok').onclick = async () => {
      const fd = new FormData($('meta-form') as HTMLFormElement); const g = (k: string) => String(fd.get(k) ?? '').trim();
      const yt = g('youtube').match(/(?:v=|youtu\.be\/|\/embed\/)([\w-]{11})/)?.[1] ?? g('youtube');
      const date = g('date'); if (!date) return;
      const idNew = m ? m.id : data!.matches.some((x) => x.id === date) ? `${date}-2` : date;
      try { await write('writeMatch', serializeMatch({ ...v, id: idNew, date, type: g('type') as Match['type'], location: g('location'), youtube: yt })); $('meta-modal').classList.remove('show'); if (!m) location.href = href(`/match/?d=${encodeURIComponent(idNew)}`); } catch (e) { toast((e as Error).message); }
    };
    $('meta-del').onclick = async () => { if (!m || !confirm('이 매치를 지울까요?')) return; try { await write('deleteMatch', { id: m.id }); location.href = href('/match/'); } catch (e) { toast((e as Error).message); } };
    $('meta-modal').classList.add('show');
  }

  const render = () => { if (!data) return; id ? renderDetail(data) : renderList(data); };
  window.addEventListener('wfc:admin', render);
  onData((d) => { data = d; render(); });
</script>
```

- [ ] **Step 2: 빌드 테스트에 `'match/index.html'` 추가 → `npm test` 통과**

- [ ] **Step 3: 브라우저 확인 (관리자 흐름 포함)**

Task 6이 배포된 뒤라야 실데이터 흐름이 된다. `npm run dev` → `/weekly-fc/match/` → 관리자 PIN → "영상에서 가져오기" → 15개 제안 → 추가 → 목록에 뜸 → 하나 열어 "참석 채우기"에 이름 몇 개 붙여넣기 → 칩 확인 → 저장 → 개요에 참석자. 썸네일 보기 전환. `?d=없는값` → "그 날짜의 매치가 없습니다".

- [ ] **Step 4: 커밋** — `git add -A && git commit -m "feat: 매치 목록·상세 · 영상 가져오기 · 참석 붙여넣기 · 결과 적기"`

---

### Task 10: 기록 — 시즌 · 정산 · 봉사

**Files:**
- Create: `src/pages/record/index.astro`, `src/pages/record/fines.astro`, `src/pages/record/duty.astro`
- Modify: `tests/build/dist.test.mjs` — `PAGES`에 `'record/index.html'`, `'record/fines/index.html'`, `'record/duty/index.html'`

**Interfaces:**
- Consumes: `seasonTable`, `fineSummary`, `band`, `RATE_CUTS`, `yearOf`(stats) · `yearRows`(rotation) · `FINE_TYPES`, `FINE_AMOUNT`(rules) · `mountTable` · `serializeFine`, `serializeRotation`, `write` · `Tabs`.
- 세 페이지가 같은 탭 줄을 쓴다: `[{href:href('/record/'),label:'시즌'},{href:href('/record/fines/'),label:'정산'},{href:href('/record/duty/'),label:'봉사'}]`.

- [ ] **Step 1: record/index.astro (시즌)**

```astro
---
import Shell from '../../layouts/Shell.astro';
import Tabs from '../../components/Tabs.astro';
import { href } from '../../lib/url';
const tabs = [{ href: href('/record/'), label: '시즌' }, { href: href('/record/fines/'), label: '정산' }, { href: href('/record/duty/'), label: '봉사' }];
---
<Shell title="기록">
  <div class="page-head"><h1>기록</h1><div class="actions"><select id="year"></select></div></div>
  <Tabs items={tabs} />
  <div id="summary" class="cards" style="margin-bottom:var(--gap)"></div>
  <div id="app" class="tbl-wrap"></div>
</Shell>
<script>
  import { onData } from '../../lib/api';
  import { href } from '../../lib/url';
  import { esc } from '../../lib/html';
  import { seasonTable, band, RATE_CUTS, yearOf, seasonMatches, type SeasonRow } from '../../lib/stats';
  import { mountTable, type Column, type TableState } from '../../components/table';
  import type { Data } from '../../lib/types';
  const $ = (id: string) => document.getElementById(id) as HTMLElement;
  let data: Data | null = null, year: number | undefined = new Date().getFullYear();
  const state: TableState = { sortKey: 'attended', sortDir: 'desc' };
  const cols: Column<SeasonRow>[] = [
    { key: 'rank', label: '#', get: (r) => r.attended, align: 'r', sortable: false, cell: () => '' },
    { key: 'name', label: '이름', get: (r) => r.player.name, cell: (r) => `<a href="${href(`/squad/${r.player.num}/`)}"><b>${esc(r.player.name)}</b></a> <span class="pos pos-${r.player.pos.toLowerCase()}">${r.player.pos}</span>` },
    { key: 'attended', label: '출석', get: (r) => r.attended, align: 'r', cell: (r) => `${r.attended} <span class="muted">/ ${r.total}</span>` },
    { key: 'rate', label: '출석률', get: (r) => r.rate, align: 'r', cell: (r) => (r.total ? `<span class="val val-${band(r.rate, RATE_CUTS)}">${r.rate}%</span>` : '<span class="muted">–</span>') },
    { key: 'won', label: '승', get: (r) => r.won, align: 'r' },
    { key: 'winRate', label: '승률', get: (r) => r.winRate, align: 'r', cell: (r) => (r.played ? `${r.winRate}%` : '<span class="muted">–</span>') },
  ];
  function render() {
    if (!data) return;
    const years = [...new Set(data.matches.map((m) => yearOf(m.date)))].sort((a, b) => b - a);
    const sel = $('year') as HTMLSelectElement;
    if (!years.includes(year as number)) year = years[0];
    sel.innerHTML = years.map((y) => `<option value="${y}" ${y === year ? 'selected' : ''}>${y}</option>`).join('') + `<option value="" ${year === undefined ? 'selected' : ''}>전체</option>`;
    sel.onchange = () => { year = sel.value ? Number(sel.value) : undefined; render(); };
    const ms = seasonMatches(data.matches, year), all = data.matches.filter((m) => year == null || yearOf(m.date) === year);
    $('summary').innerHTML = `<div class="card"><h2>매치</h2><div class="big">${all.length}</div><p class="muted">참석 기록 있는 ${ms.length} · 2파전 ${all.filter((m) => m.type === '2파전').length} · 3파전 ${all.filter((m) => m.type === '3파전').length}</p></div><div class="card"><h2>평균 참석</h2><div class="big">${ms.length ? Math.round(ms.reduce((s, m) => s + m.attendees.length, 0) / ms.length) : '–'}</div><p class="muted">명 / 매치</p></div>`;
    const rows = seasonTable(data.players, data.matches, year);
    mountTable($('app'), cols, rows, state, { empty: '아직 참석 기록이 없습니다', rowAttr: () => '' });
    // 순위 열: 정렬 결과 순서대로 1..n
    $('app').querySelectorAll('tbody tr').forEach((tr, i) => { const td = tr.querySelector('td'); if (td) td.textContent = String(i + 1); });
  }
  onData((d) => { data = d; render(); });
</script>
```

- [ ] **Step 2: record/fines.astro (정산)**

```astro
---
import Shell from '../../layouts/Shell.astro';
import Tabs from '../../components/Tabs.astro';
import { href } from '../../lib/url';
const tabs = [{ href: href('/record/'), label: '시즌' }, { href: href('/record/fines/'), label: '정산' }, { href: href('/record/duty/'), label: '봉사' }];
---
<Shell title="정산">
  <div class="page-head"><h1>기록</h1><div class="actions" id="actions"></div></div>
  <Tabs items={tabs} />
  <div id="summary" class="cards" style="margin-bottom:var(--gap)"></div>
  <h2 style="margin-bottom:8px">미납자</h2><div id="unpaid" class="chips" style="margin-bottom:var(--gap)"></div>
  <h2 style="margin-bottom:8px">내역</h2><div id="app" class="tbl-wrap"></div>
  <div class="modal-bg" id="fine-modal"><div class="modal"><h2>벌금 기록</h2><form class="form" id="fine-form"></form><div class="foot"><button data-close="fine-modal">취소</button><button class="primary" id="fine-ok">저장</button></div></div></div>
</Shell>
<script>
  import { onData, isAdmin, write, serializeFine } from '../../lib/api';
  import { href } from '../../lib/url';
  import { esc, fmtDate, fmtWon, toast } from '../../lib/html';
  import { fineSummary } from '../../lib/stats';
  import { FINE_TYPES, FINE_AMOUNT } from '../../lib/rules';
  import { mountTable, type Column, type TableState } from '../../components/table';
  import type { Data, Fine } from '../../lib/types';
  const $ = (id: string) => document.getElementById(id) as HTMLElement;
  let data: Data | null = null;
  const state: TableState = { sortKey: 'date', sortDir: 'desc' };
  document.querySelectorAll<HTMLElement>('[data-close]').forEach((b) => (b.onclick = () => $(b.dataset.close!).classList.remove('show')));
  function render() {
    if (!data) return;
    const s = fineSummary(data.fines);
    $('actions').innerHTML = isAdmin() ? '<button id="add">벌금 추가</button>' : '';
    if (isAdmin()) $('add').onclick = openAdd;
    $('summary').innerHTML = `<div class="card"><h2>미납</h2><div class="big ${s.unpaid ? 'warn' : ''}">${fmtWon(s.unpaid)}</div><p class="muted">${s.unpaidCount}건</p></div><div class="card"><h2>누계</h2><div class="big">${fmtWon(s.total)}</div><p class="muted">${data.fines.length}건</p></div>${FINE_TYPES.map((t) => `<div class="card"><h2>${t}</h2><div class="big">${s.byType[t].count}</div><p class="muted">${fmtWon(s.byType[t].total)} · 건당 ${fmtWon(FINE_AMOUNT[t])}</p></div>`).join('')}`;
    const unpaid = [...s.byPlayer].filter(([, v]) => v.unpaid > 0).sort((a, b) => b[1].unpaid - a[1].unpaid);
    $('unpaid').innerHTML = unpaid.length ? unpaid.map(([name, v]) => { const p = data!.players.find((x) => x.name === name); return `<a class="chip" href="${p ? href(`/squad/${p.num}/`) : '#'}">${esc(name)} <b class="warn">${fmtWon(v.unpaid)}</b></a>`; }).join('') : '<span class="muted">미납 없음</span>';
    const cols: Column<Fine>[] = [
      { key: 'date', label: '날짜', get: (f) => f.date, cell: (f) => fmtDate(f.date) },
      { key: 'player', label: '이름', get: (f) => f.player },
      { key: 'type', label: '유형', get: (f) => f.type },
      { key: 'amount', label: '금액', get: (f) => f.amount, align: 'r', cell: (f) => fmtWon(f.amount) },
      { key: 'paid', label: '납부', get: (f) => (f.paid ? 1 : 0), cell: (f) => (isAdmin() ? `<button data-paid="${f.id}" class="${f.paid ? '' : 'primary'}">${f.paid ? '완료' : '납부 처리'}</button>` : f.paid ? '완료' : '<span class="warn">미납</span>') },
      ...(isAdmin() ? [{ key: 'del', label: '', get: () => '', sortable: false, cell: (f: Fine) => `<button data-del="${f.id}" class="danger">삭제</button>` } as Column<Fine>] : []),
    ];
    mountTable($('app'), cols, data.fines, state, { empty: '벌금 기록이 없습니다' });
    $('app').querySelectorAll<HTMLElement>('[data-paid]').forEach((b) => (b.onclick = async () => { const f = data!.fines.find((x) => x.id === b.dataset.paid)!; try { await write('writeFine', serializeFine({ ...f, paid: !f.paid })); } catch (e) { toast((e as Error).message); } }));
    $('app').querySelectorAll<HTMLElement>('[data-del]').forEach((b) => (b.onclick = async () => { try { await write('deleteFine', { id: b.dataset.del }); } catch (e) { toast((e as Error).message); } }));
  }
  function openAdd() {
    ($('fine-form') as HTMLFormElement).innerHTML = `<label>날짜<input name="date" type="date" value="${new Date().toISOString().slice(0, 10)}"></label><label>이름<select name="player">${data!.players.map((p) => `<option>${esc(p.name)}</option>`).join('')}</select></label><label>유형<select name="type" id="fine-type">${FINE_TYPES.map((t) => `<option>${t}</option>`).join('')}</select></label><label>금액<input name="amount" id="fine-amt" type="number" value="${FINE_AMOUNT.지각}"></label><label class="full">매치 (선택)<select name="match_id"><option value="">없음</option>${data!.matches.map((m) => `<option value="${esc(m.id)}">${fmtDate(m.date)}</option>`).join('')}</select></label>`;
    ($('fine-type') as HTMLSelectElement).onchange = (e) => { ($('fine-amt') as HTMLInputElement).value = String(FINE_AMOUNT[(e.target as HTMLSelectElement).value as keyof typeof FINE_AMOUNT]); };
    $('fine-ok').onclick = async () => { const fd = new FormData($('fine-form') as HTMLFormElement); const g = (k: string) => String(fd.get(k) ?? ''); try { await write('writeFine', serializeFine({ id: String(Date.now()), date: g('date'), match_id: g('match_id'), player: g('player'), type: g('type') as Fine['type'], amount: Number(g('amount')) || 0, paid: false })); $('fine-modal').classList.remove('show'); toast('저장됨'); } catch (e) { toast((e as Error).message); } };
    $('fine-modal').classList.add('show');
  }
  window.addEventListener('wfc:admin', render);
  onData((d) => { data = d; render(); });
</script>
```

- [ ] **Step 3: record/duty.astro (봉사)**

```astro
---
import Shell from '../../layouts/Shell.astro';
import Tabs from '../../components/Tabs.astro';
import { href } from '../../lib/url';
const tabs = [{ href: href('/record/'), label: '시즌' }, { href: href('/record/fines/'), label: '정산' }, { href: href('/record/duty/'), label: '봉사' }];
---
<Shell title="봉사">
  <div class="page-head"><h1>기록</h1><div class="actions"><select id="year"></select></div></div>
  <Tabs items={tabs} />
  <p class="muted" style="margin:0 0 var(--gap)">시트 <code>rot</code> 순번대로 매월 두 명. 이번 달이 강조됩니다. 관리자는 당번을 바꾸거나 완료를 표시할 수 있습니다.</p>
  <div id="app" class="tbl-wrap"></div>
</Shell>
<script>
  import { onData, isAdmin, write, serializeRotation } from '../../lib/api';
  import { esc, toast } from '../../lib/html';
  import { yearRows } from '../../lib/rotation';
  import type { Data, RotationRow } from '../../lib/types';
  const $ = (id: string) => document.getElementById(id) as HTMLElement;
  let data: Data | null = null;
  const now = new Date(); let year = now.getFullYear();
  function render() {
    if (!data) return;
    const sel = $('year') as HTMLSelectElement;
    sel.innerHTML = [year - 1, year, year + 1].map((y) => `<option ${y === year ? 'selected' : ''}>${y}</option>`).join('');
    sel.onchange = () => { year = Number(sel.value); render(); };
    const rows = yearRows(data.players, data.rotation, year);
    const names = data.players.map((p) => p.name);
    const pick = (r: RotationRow, k: 'p1' | 'p2') => `<select data-y="${r.year}" data-m="${r.month}" data-k="${k}">${names.map((n) => `<option ${n === r[k] ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>`;
    $('app').innerHTML = `<table class="tbl"><thead><tr><th>월</th><th>당번 1</th><th>당번 2</th><th class="c">완료</th></tr></thead><tbody>${rows.map((r) => { const cur = r.year === now.getFullYear() && r.month === now.getMonth() + 1; return `<tr style="${cur ? 'background:var(--surface);font-weight:600' : ''}"><td>${r.month}월${cur ? ' <span class="label">이번 달</span>' : ''}</td><td>${isAdmin() ? pick(r, 'p1') : esc(r.p1)}</td><td>${isAdmin() ? pick(r, 'p2') : esc(r.p2)}</td><td class="c">${isAdmin() ? `<input type="checkbox" data-y="${r.year}" data-m="${r.month}" data-k="done" ${r.done ? 'checked' : ''}>` : r.done ? '✓' : ''}</td></tr>`; }).join('')}</tbody></table>`;
    $('app').querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-k]').forEach((el) => (el.onchange = async () => {
      const y = Number(el.dataset.y), m = Number(el.dataset.m);
      const r = yearRows(data!.players, data!.rotation, y).find((x) => x.month === m)!;
      const next: RotationRow = { ...r, [el.dataset.k!]: el.dataset.k === 'done' ? (el as HTMLInputElement).checked : el.value } as RotationRow;
      try { await write('writeRotation', serializeRotation(next)); toast('저장됨'); } catch (e) { toast((e as Error).message); }
    }));
  }
  window.addEventListener('wfc:admin', render);
  onData((d) => { data = d; render(); });
</script>
```

`handleWriteRotation`(apps-script.gs 135행)이 year·month로 행을 찾아 덮어쓰는지 확인한다 — 아니면 `findRowByField`를 두 열로 확장한다:
```js
function handleWriteRotation(r) {
  const ss = getSpreadsheet(); const sheet = getOrCreateSheet(ss, SHEET_ROTATION, ROT_COLS);
  const data = sheet.getDataRange().getValues();
  let rowIdx = -1; for (let i = 1; i < data.length; i++) if (String(data[i][0]) === String(r.year) && String(data[i][1]) === String(r.month)) { rowIdx = i; break; }
  const row = ROT_COLS.map(k => r[k] !== undefined ? r[k] : '');
  if (rowIdx > 0) sheet.getRange(rowIdx + 1, 1, 1, row.length).setValues([row]); else sheet.appendRow(row);
  return { ok: true };
}
```

- [ ] **Step 4: 빌드 테스트에 세 페이지 추가 → `npm test` 통과**
- [ ] **Step 5: 브라우저 확인** — 세 탭 이동, 연도 선택, 관리자로 벌금 추가·납부 토글, 봉사 당번 변경.
- [ ] **Step 6: 커밋** — `git add -A && git commit -m "feat: 기록 — 시즌 · 정산 · 봉사"`

---

### Task 11: 홈

**Files:**
- Replace: `src/pages/index.astro`

**Interfaces:**
- Consumes: `onData` · `getMe` · `rotationFor`, `nextDuty` · `fineSummary` · `playerCard` · `fmtDate`, `fmtWon`, `monthLabel`, `ytThumb` · `href`.

- [ ] **Step 1: index.astro**

```astro
---
import Shell from '../layouts/Shell.astro';
---
<Shell title="홈">
  <div class="page-head"><h1>홈</h1><span class="muted" id="stamp"></span></div>
  <div id="app" class="stack"></div>
</Shell>
<script>
  import { onData } from '../lib/api';
  import { getMe } from '../lib/me';
  import { href } from '../lib/url';
  import { esc, fmtDate, fmtWon, monthLabel, ytThumb } from '../lib/html';
  import { rotationFor, nextDuty } from '../lib/rotation';
  import { fineSummary } from '../lib/stats';
  import { playerCard } from '../components/player-card';
  import type { Data } from '../lib/types';
  const app = document.getElementById('app')!;
  let data: Data | null = null;
  function render() {
    if (!data) return;
    const now = new Date(), y = now.getFullYear(), mo = now.getMonth() + 1;
    const last = data.matches[0];
    const duty = rotationFor(data.players, data.rotation, y, mo);
    const fs = fineSummary(data.fines);
    const me = data.players.find((p) => p.num === getMe());
    const mine = me ? { unpaid: fs.byPlayer.get(me.name)?.unpaid ?? 0, duty: nextDuty(data.players, data.rotation, me.name) } : null;
    app.innerHTML = `
      <div class="cards">
        <a class="card" href="${last ? href(`/match/?d=${encodeURIComponent(last.id)}`) : href('/match/')}"><h2>최근 매치</h2>${last ? `<div class="big">${last.winner ? `${esc(last.winner)} 승` : esc(last.type) || '기록'}</div><p class="muted">${fmtDate(last.date)}${last.location ? ` · ${esc(last.location)}` : ''} · ${last.attendees.length}명</p>${last.youtube ? `<img src="${ytThumb(last.youtube)}" alt="" style="margin-top:10px;aspect-ratio:16/9;object-fit:cover;width:100%">` : ''}` : '<p class="muted">아직 기록이 없습니다</p>'}</a>
        <a class="card" href="${href('/record/duty/')}"><h2>${monthLabel(y, mo)} 봉사</h2><div class="big" style="font-size:var(--fs-lg)">${esc(duty.p1)} · ${esc(duty.p2)}</div><p class="muted">${duty.done ? '완료' : '대관비·음료 선납, 조끼, 정산'}</p></a>
        <a class="card" href="${href('/record/fines/')}"><h2>미납 벌금</h2><div class="big ${fs.unpaid ? 'warn' : ''}">${fmtWon(fs.unpaid)}</div><p class="muted">${fs.unpaidCount}건</p></a>
      </div>
      ${me ? `<div><div class="label" style="margin-bottom:8px">내 자리</div>${playerCard(me)}<div class="cards" style="margin-top:var(--gap)"><a class="card" href="${href(`/squad/${me.num}/`)}"><h2>내 미납</h2><div class="big ${mine!.unpaid ? 'warn' : ''}">${fmtWon(mine!.unpaid)}</div></a><a class="card" href="${href('/record/duty/')}"><h2>내 봉사 차례</h2><div class="big" style="font-size:var(--fs-lg)">${mine!.duty ? monthLabel(mine!.duty.year, mine!.duty.month) : '–'}</div></a></div></div>` : `<p class="muted">사이드바에서 <b>이름 고르기</b>를 하면 내 미납·봉사 차례가 여기 뜹니다.</p>`}`;
    document.getElementById('stamp')!.textContent = `${data.players.length}명 · 매치 ${data.matches.length}`;
  }
  window.addEventListener('wfc:me', render);
  onData((d) => { data = d; render(); });
</script>
```

- [ ] **Step 2: `npm test` 통과, 브라우저에서 이름 고르기 전후 확인**
- [ ] **Step 3: 커밋** — `git add -A && git commit -m "feat: 홈 — 최근 매치 · 봉사 · 미납 · 내 자리"`

---

### Task 12: 전술보드 이식 + 명단 불러오기 + 저장

**Files:**
- Create: `src/components/pitch.ts`, `src/pages/tactics.astro`
- Modify: `tests/build/dist.test.mjs` — `PAGES`에 `'tactics/index.html'`
- 원본: `~/Documents/프로젝트/개발/tactics-board/index.html` (style 64–230행, script 328–1177행, 마크업 231–327행)

**Interfaces:**
- Consumes: `lineup-svg.ts`의 `PitchState`·`PitchPlayer` (저장 형식) · `onData`, `isAdmin`, `write`, `serializeLineup` · `href`.
- Produces: `initPitch(root: HTMLElement): PitchApi` —
  ```ts
  type PitchApi = { getState(): PitchState; setState(s: PitchState): void; loadSquad(team: 'home' | 'away', players: { n: number; name: string; pos: string }[]): void; setMode(m: 'soccer' | 'futsal'): void; setCount(n: number): void };
  ```

- [ ] **Step 1: pitch.ts — 스크립트를 함수로 감싼다**

원본 328–1177행의 `<script>` 내용을 `src/components/pitch.ts`로 복사하고 다음만 바꾼다. 로직·좌표·드로잉 코드는 손대지 않는다.

1. 파일 머리:
   ```ts
   // src/components/pitch.ts — tactics-board 엔진 이식. 원본: byjunyoung/tactics-board index.html
   import type { PitchState, PitchPlayer } from './lineup-svg';
   export type PitchApi = { getState(): PitchState; setState(s: PitchState): void; loadSquad(team: 'home' | 'away', players: { n: number; name: string; pos: string }[]): void; setMode(m: 'soccer' | 'futsal'): void; setCount(n: number): void };
   type P = { n: number; pos: string; name?: string; _norm: [number, number]; x: number; y: number };
   export function initPitch(root: HTMLElement): PitchApi {
   ```
   그리고 파일 맨 끝(원본 `resize();` 다음)에 `return api; }`.
2. `document.getElementById('x')` 전부 → `root.querySelector<HTMLElement>('#x')!` (canvas·container·form select·count-val·zoom-val·orient-btn·hint-text·tip·player-edit·player-num-input·player-pos-input·about-overlay 등). `document.querySelectorAll('.mode-btn')` 류는 `root.querySelectorAll`. `document.body`·`window` 리스너는 그대로.
3. HTML `onclick="setMode('soccer')"` 같은 인라인 핸들러는 전부 제거하고, 함수 끝 `return` 직전에 붙인다:
   ```ts
   const on = (sel: string, fn: (el: HTMLElement) => void) => root.querySelectorAll<HTMLElement>(sel).forEach(fn);
   on('#m-soccer', (b) => (b.onclick = () => setMode('soccer'))); on('#m-futsal', (b) => (b.onclick = () => setMode('futsal')));
   on('#home-form', (s) => ((s as HTMLSelectElement).onchange = () => applyFormation('home', (s as HTMLSelectElement).value)));
   on('#away-form', (s) => ((s as HTMLSelectElement).onchange = () => applyFormation('away', (s as HTMLSelectElement).value)));
   on('#home-color', (i) => ((i as HTMLInputElement).oninput = () => setTeamColor('home', (i as HTMLInputElement).value)));
   on('#away-color', (i) => ((i as HTMLInputElement).oninput = () => setTeamColor('away', (i as HTMLInputElement).value)));
   on('#cnt-minus', (b) => (b.onclick = () => changeCount(-1))); on('#cnt-plus', (b) => (b.onclick = () => changeCount(1)));
   on('#tool-arrow', (b) => (b.onclick = () => setTool('arrow'))); on('#tool-zone', (b) => (b.onclick = () => setTool('zone'))); on('#tool-pen', (b) => (b.onclick = () => setTool('pen')));
   on('#orient-btn', (b) => (b.onclick = toggleOrientation)); on('#zoom-minus', (b) => (b.onclick = () => changeZoom(-0.2))); on('#zoom-plus', (b) => (b.onclick = () => changeZoom(0.2))); on('#zoom-reset', (b) => (b.onclick = resetZoom)); on('#clear-btn', (b) => (b.onclick = clearAll));
   on('#edit-ok', (b) => (b.onclick = confirmPlayerEdit)); on('#edit-cancel', (b) => (b.onclick = closePlayerEdit));
   ```
4. `openAbout`·`closeAbout`와 about 오버레이 참조를 지운다(소개는 포탈에 있다).
5. `drawPlayer`에서 번호 아래 이름을 그린다 — `ctx.fillText(String(p.n), …)` 바로 뒤에:
   ```ts
   if (p.name) { ctx.font = `${Math.max(9, r * 0.8)}px ${getComputedStyle(root).fontFamily}`; ctx.fillStyle = 'rgba(0,0,0,.75)'; ctx.textAlign = 'center'; ctx.fillText(p.name, p.x, p.y + r + 11); }
   ```
   (`rgba` 두 곳은 캔버스 안이라 토큰을 못 쓴다. 이 파일에서만 허용.)
6. `drawPlayer`의 `ctx.shadowColor…shadowBlur…shadowOffsetY` 세 줄을 지운다(그림자 없음 규칙).
7. API 구현 — `return api` 직전:
   ```ts
   const toP = (n: [number, number]): [number, number] => (orientation === 'portrait' ? n : [1 - n[1], n[0]]);
   const fromP = (n: [number, number]): [number, number] => (orientation === 'portrait' ? n : [n[1], 1 - n[0]]);
   const pack = (ps: P[]): PitchPlayer[] => ps.map((p) => { const [x, y] = toP(p._norm); return { n: p.n, pos: p.pos, x, y, ...(p.name ? { name: p.name } : {}) }; });
   const unpack = (ps: PitchPlayer[]): P[] => ps.map((p) => { const norm = fromP([p.x, p.y]); const c = normToCanvas(norm); return { n: p.n, pos: p.pos, name: p.name, _norm: norm, x: c.x, y: c.y }; });
   const api: PitchApi = {
     getState: () => ({ mode, count: playerCount, home: pack(homePlayers), away: pack(awayPlayers), homeColor, awayColor,
       formation: { home: (root.querySelector('#home-form') as HTMLSelectElement).value, away: (root.querySelector('#away-form') as HTMLSelectElement).value } }),
     setState: (s) => { setMode(s.mode); if (s.count !== playerCount) { playerCount = s.count; buildFormSelects(); } homeColor = s.homeColor; awayColor = s.awayColor; (root.querySelector('#home-color') as HTMLInputElement).value = homeColor; (root.querySelector('#away-color') as HTMLInputElement).value = awayColor;
       (root.querySelector('#home-form') as HTMLSelectElement).value = s.formation.home; (root.querySelector('#away-form') as HTMLSelectElement).value = s.formation.away;
       homePlayers = unpack(s.home); awayPlayers = unpack(s.away); arrows = []; zones = []; paths = []; render(); },
     loadSquad: (team, players) => { const arr = team === 'home' ? homePlayers : awayPlayers; players.slice(0, arr.length).forEach((q, i) => { arr[i].n = q.n; arr[i].name = q.name; arr[i].pos = q.pos || arr[i].pos; }); render(); },
     setMode: (m) => setMode(m), setCount: (n) => { playerCount = n; buildFormSelects(); initBoard(); (root.querySelector('#count-val') as HTMLElement).textContent = String(n); },
   };
   ```
   `setMode`·`changeCount`가 내부에서 `document.getElementById('count-val')`을 쓰면 2번 규칙대로 `root.querySelector`로 바꿨는지 확인.
8. 원본이 `orientation = window.innerWidth > 640 ? 'landscape' : 'portrait'`로 시작하는 줄은 `root.clientWidth > 640`으로 바꾼다.

- [ ] **Step 2: tactics.astro — 마크업과 스타일**

원본 마크업 231–327행에서 about 오버레이를 빼고 옮긴다. 인라인 `onclick`·`oninput`·`onchange`는 전부 지우고 버튼에 id를 준다: `cnt-minus`·`cnt-plus`·`zoom-minus`·`zoom-plus`·`zoom-reset`·`clear-btn`·`edit-ok`·`edit-cancel` (나머지 id는 원본 그대로). 원본 스타일 64–230행은 `<style is:global>`로 옮기되 색은 토큰으로 치환한다: `--bg`→`var(--surface)`, `--panel`→`var(--bg)`, `--border`→`var(--line)`, `--text`→`var(--fg)`, `--muted`→`var(--muted)`, `--accent`→`var(--fg)`. `border-radius`는 전부 `0`, `box-shadow`는 삭제, `transition`은 삭제. 피치 초록·선 흰색은 캔버스 안 값이라 pitch.ts에 남는다.

```astro
---
import Shell from '../layouts/Shell.astro';
---
<Shell title="축구 전술판" index={true} wide={true} description="무료 온라인 축구·풋살 전술판. 포메이션, 선수 배치, 화살표·존 드로잉. 설치 없이 브라우저에서.">
  <Fragment slot="head">
    <link rel="canonical" href="https://byjunyoung.github.io/weekly-fc/tactics/" />
    <script type="application/ld+json" is:inline set:html={JSON.stringify({ '@context': 'https://schema.org', '@type': 'WebApplication', name: '축구 전술판 · Football Tactics Board', url: 'https://byjunyoung.github.io/weekly-fc/tactics/', applicationCategory: 'SportsApplication', operatingSystem: 'Any', offers: { '@type': 'Offer', price: '0' }, description: '포메이션 설정, 선수 배치, 화살표·존·펜 드로잉을 지원하는 무료 온라인 축구·풋살 전술판' })} />
  </Fragment>
  <div id="board" class="board">
    <div class="page-head"><h1>전술판</h1><div class="actions" id="squad-actions"></div></div>
    <!-- 원본 231–327행의 header / main / footer / #tip / #player-edit 를 여기에 (about 오버레이 제외, 인라인 핸들러 제거, id 부여) -->
  </div>
  <div class="modal-bg" id="squad-modal"><div class="modal"><h2>명단 불러오기</h2><p class="muted">고른 순서대로 홈 팀 자리에 들어갑니다. 인원 수만큼만.</p><div class="pick-list" id="squad-list"></div><div class="foot"><button data-close="squad-modal">취소</button><button class="primary" id="squad-ok">배치</button></div></div></div>
  <div class="modal-bg" id="save-modal"><div class="modal"><h2>라인업 저장</h2><label>매치<select id="save-match" style="width:100%"></select></label><div class="foot"><button data-close="save-modal">취소</button><button class="primary" id="save-ok">저장</button></div></div></div>
</Shell>
<style is:global>
  /* 원본 64–230행을 토큰으로 치환해 여기에. body 전역 규칙(margin, font)은 빼고 .board 하위로 한정한다. */
</style>
<script>
  import { initPitch } from '../components/pitch';
  import { onData, isAdmin, write, serializeLineup } from '../lib/api';
  import { esc, fmtDate, toast } from '../lib/html';
  import type { Data } from '../lib/types';
  import type { PitchState } from '../components/lineup-svg';
  const $ = (id: string) => document.getElementById(id) as HTMLElement;
  document.querySelectorAll<HTMLElement>('[data-close]').forEach((b) => (b.onclick = () => $(b.dataset.close!).classList.remove('show')));
  const api = initPitch($('board'));
  const wantMatch = new URLSearchParams(location.search).get('match');
  let data: Data | null = null, picked: number[] = [];
  const LOCAL = 'wfc_pitch_draft';
  try { const d = localStorage.getItem(LOCAL); if (d && !wantMatch) api.setState(JSON.parse(d) as PitchState); } catch {}
  window.addEventListener('beforeunload', () => { try { localStorage.setItem(LOCAL, JSON.stringify(api.getState())); } catch {} });
  function renderActions() {
    if (!data) return;
    $('squad-actions').innerHTML = `<button id="load-squad">명단 불러오기</button>${isAdmin() ? '<button id="save-lineup">매치에 저장</button>' : ''}`;
    $('load-squad').onclick = () => { picked = []; drawPick(); $('squad-modal').classList.add('show'); };
    if (isAdmin()) $('save-lineup').onclick = () => { ($('save-match') as HTMLSelectElement).innerHTML = data!.matches.map((m) => `<option value="${esc(m.id)}" ${m.id === wantMatch ? 'selected' : ''}>${fmtDate(m.date)}${m.location ? ` · ${esc(m.location)}` : ''}</option>`).join(''); $('save-modal').classList.add('show'); };
    if (wantMatch) { const l = data.lineups.find((x) => x.match_id === wantMatch); if (l) { try { api.setState(JSON.parse(l.assignments) as PitchState); } catch {} } }
  }
  function drawPick() {
    $('squad-list').innerHTML = [...data!.players].sort((a, b) => a.num - b.num).map((p) => { const i = picked.indexOf(p.num); return `<button data-n="${p.num}" class="${i >= 0 ? 'primary' : ''}">${i >= 0 ? `${i + 1}. ` : ''}${p.num} ${esc(p.name)}</button>`; }).join('');
    $('squad-list').querySelectorAll<HTMLElement>('[data-n]').forEach((b) => (b.onclick = () => { const n = Number(b.dataset.n); picked = picked.includes(n) ? picked.filter((x) => x !== n) : [...picked, n]; drawPick(); }));
  }
  $('squad-ok').onclick = () => { const ps = picked.map((n) => data!.players.find((p) => p.num === n)!).map((p) => ({ n: p.num, name: p.name, pos: p.pos })); api.loadSquad('home', ps); $('squad-modal').classList.remove('show'); };
  $('save-ok').onclick = async () => {
    const match_id = ($('save-match') as HTMLSelectElement).value; if (!match_id) return;
    const existing = data!.lineups.find((l) => l.match_id === match_id);
    try { await write('writeLineup', serializeLineup({ id: existing?.id ?? String(Date.now()), match_id, name: '', formation: api.getState().formation.home, assignments: JSON.stringify(api.getState()) })); $('save-modal').classList.remove('show'); toast('저장됨'); } catch (e) { toast((e as Error).message); }
  };
  window.addEventListener('wfc:admin', renderActions);
  onData((d) => { data = d; renderActions(); });
</script>
```

`handleWriteLineup`(apps-script.gs 208행)은 id로 행을 찾는다 — 그대로 쓴다.

- [ ] **Step 3: `npm test` (PAGES에 `'tactics/index.html'`) → index 허용 검사까지 PASS**
- [ ] **Step 4: 브라우저 확인** — 데스크톱 가로형, 모바일 세로형, 드래그·화살표·존·펜·핀치줌·번호 수정, 명단 불러오기 → 이름 표시, 관리자 저장 → 매치 라인업 탭에 SVG.
- [ ] **Step 5: 커밋** — `git add -A && git commit -m "feat: 전술판 흡수 · 명단 불러오기 · 매치에 저장"`

---

### Task 13: 리캡 카드

**Files:**
- Create: `src/components/recap.ts`
- Modify: `src/pages/match/index.astro` — 스크립트 맨 위에 `import { mountRecap } from '../../components/recap';` 추가하고, 맨 아래에 `(window as unknown as { wfcRecap: typeof mountRecap }).wfcRecap = mountRecap;`

**Interfaces:**
- Produces: `mountRecap(match: Match, ps: PitchState | null): void` — `#recap-slot`에 미리보기 `<img>`와 [이미지로 저장] 버튼을 그린다.
- 캔버스 1080×1080. 외부 이미지는 넣지 않는다(CORS).

- [ ] **Step 1: recap.ts**

```ts
// src/components/recap.ts — 스코어·참석자·라인업을 1080×1080 PNG로. 캔버스 안 색은 토큰을 못 읽으므로 getComputedStyle로 가져온다.
import type { Match } from '../lib/types';
import type { PitchState } from './lineup-svg';
import { fmtDate } from '../lib/html';

const tok = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export function drawRecap(c: HTMLCanvasElement, m: Match, ps: PitchState | null): void {
  const S = 1080; c.width = S; c.height = S;
  const ctx = c.getContext('2d')!; const font = tok('--font');
  const bg = tok('--bg'), fg = tok('--fg'), muted = tok('--muted'), line = tok('--line'), surface = tok('--surface');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = line; ctx.lineWidth = 2; ctx.strokeRect(40, 40, S - 80, S - 80);
  ctx.fillStyle = muted; ctx.font = `600 22px ${font}`; ctx.fillText('W E E K L Y   F C', 80, 110);
  ctx.fillStyle = fg; ctx.font = `600 54px ${font}`; ctx.fillText(fmtDate(m.date), 80, 190);
  ctx.fillStyle = muted; ctx.font = `28px ${font}`; ctx.fillText([m.type, m.location].filter(Boolean).join(' · ') || '매치', 80, 240);
  let y = 320;
  if (m.teams.length) {
    ctx.fillStyle = fg; ctx.font = `600 34px ${font}`;
    m.teams.forEach((t, i) => { const x = 80 + i * ((S - 160) / m.teams.length); const win = t.name === m.winner; ctx.fillStyle = win ? fg : muted; ctx.fillText(`${t.name}${win ? ' 승' : ''}${t.points != null ? `  ${t.points}점` : ''}`, x, y); ctx.font = `24px ${font}`; t.players.forEach((p, j) => ctx.fillText(p, x, y + 44 + j * 32)); ctx.font = `600 34px ${font}`; });
    y += 60 + 32 * Math.max(...m.teams.map((t) => t.players.length)) + 40;
  } else {
    ctx.fillStyle = fg; ctx.font = `600 34px ${font}`; ctx.fillText(`참석 ${m.attendees.length}명`, 80, y); y += 50;
    ctx.font = `26px ${font}`; ctx.fillStyle = fg;
    const cols = 4, w = (S - 160) / cols;
    m.attendees.forEach((p, i) => ctx.fillText(p, 80 + (i % cols) * w, y + Math.floor(i / cols) * 36));
    y += Math.ceil(m.attendees.length / cols) * 36 + 40;
  }
  if (ps && y < S - 340) {
    const px = 80, py = y, pw = S - 160, ph = S - 120 - y;
    ctx.fillStyle = surface; ctx.fillRect(px, py, pw, ph); ctx.strokeStyle = line; ctx.strokeRect(px, py, pw, ph);
    ctx.beginPath(); ctx.moveTo(px + pw / 2, py); ctx.lineTo(px + pw / 2, py + ph); ctx.stroke();
    const dot = (x: number, yy: number, fill: string, label: string) => { ctx.beginPath(); ctx.arc(x, yy, 16, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = fg; ctx.stroke(); ctx.fillStyle = fg; ctx.font = `600 14px ${font}`; ctx.textAlign = 'center'; ctx.fillText(label, x, yy + 5); ctx.textAlign = 'left'; };
    // 세로 저장 좌표를 가로 피치에: x' = 1-y, y' = x
    ps.home.forEach((p) => dot(px + (1 - p.y) * pw * 0.5, py + p.x * ph, ps.homeColor, String(p.n)));
    ps.away.forEach((p) => dot(px + pw * 0.5 + p.y * pw * 0.5, py + (1 - p.x) * ph, ps.awayColor, String(p.n)));
  }
  ctx.fillStyle = muted; ctx.font = `20px ${font}`; ctx.fillText('byjunyoung.github.io/weekly-fc', 80, S - 70);
}

export function mountRecap(m: Match, ps: PitchState | null): void {
  const slot = document.getElementById('recap-slot'); if (!slot) return;
  const c = document.createElement('canvas'); drawRecap(c, m, ps);
  const url = c.toDataURL('image/png');
  slot.innerHTML = `<img src="${url}" alt="리캡 카드" style="max-width:540px;border:1px solid var(--line)"><div class="row"><a class="primary" style="display:inline-block;padding:6px 12px;border:1px solid var(--fg)" href="${url}" download="weeklyfc-${m.date}.png">이미지로 저장</a><span class="muted">모바일은 이미지를 길게 눌러 저장</span></div>`;
}
```

- [ ] **Step 2: match/index.astro에 연결 (위 Modify)** → `npm test` 통과
- [ ] **Step 3: 브라우저 확인** — 매치 상세 리캡 탭에서 카드가 보이고 저장 링크가 PNG를 내린다.
- [ ] **Step 4: 커밋** — `git add -A && git commit -m "feat: 리캡 카드"`

---

### Task 14: 소개·모집·규칙 페이지

**Files:**
- Create: `src/pages/about.astro`
- Modify: `tests/build/dist.test.mjs` — `PAGES`에 `'about/index.html'`

**Interfaces:**
- Consumes: `rules.ts` 상수 전부 · `Shell index={true}`.
- 팀 소개 문장은 사용자가 준다(스펙 6절). 그전까지는 옛 규칙 페이지 "한눈에 요약"의 사실만 쓴다. 지어내지 않는다.

- [ ] **Step 1: about.astro**

```astro
---
import Shell from '../layouts/Shell.astro';
import { FINE_TYPES, FINE_AMOUNT, FINE_NOTE, FINE_EXEMPT, MATCH_TIME, MATCH_MIN, PLACES, BANK, LINKS, DUTY_PER_MONTH } from '../lib/rules';
import { href } from '../lib/url';
const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;
const toc = [['intro', '소개'], ['when', '언제 어디서'], ['join', '참여 방법'], ['money', '비용·벌금'], ['duty', '봉사'], ['bank', '모임 통장'], ['manner', '에티켓']];
---
<Shell title="소개" index={true} description="WEEKLY FC — 매주 토요일 모이는 풋살 팀. 용병·정회원 상시 모집.">
  <Fragment slot="head"><link rel="canonical" href="https://byjunyoung.github.io/weekly-fc/about/" /></Fragment>
  <div class="page-head"><h1>WEEKLY FC</h1><a class="chip" href={LINKS.kakao} target="_blank" rel="noopener">오픈카톡 →</a></div>
  <nav class="tabs">{toc.map(([id, l]) => <a href={`#${id}`}>{l}</a>)}</nav>
  <div class="cards" style="margin-bottom:var(--gap-lg)">
    <div class="card"><h2>정규 매치</h2><p>{MATCH_TIME} · {MATCH_MIN}인 이상</p></div>
    <div class="card"><h2>벌금</h2><p>{FINE_TYPES.map((t) => `${t} ${won(FINE_AMOUNT[t])}`).join(' · ')}</p></div>
    <div class="card"><h2>봉사</h2><p>매월 {DUTY_PER_MONTH}명 로테이션</p></div>
    <div class="card"><h2>모임 통장</h2><p>{BANK.name} {BANK.number}</p></div>
  </div>
  <article class="prose stack">
    <section id="intro"><h2>소개</h2><p>매주 토요일 오전에 모여 풋살을 하는 팀입니다. 용병으로 편하게 참여하다가 원하면 정회원으로 합류할 수 있습니다. 상시 모집 중.</p><p><a href={LINKS.youtube} target="_blank" rel="noopener">유튜브 채널 →</a> · <a href={href('/tactics/')}>전술판 →</a></p></section>
    <section id="when"><h2>언제 어디서</h2><ul><li>매주 카톡 투표, {MATCH_MIN}인 이상 모이면 진행</li><li>시간: {MATCH_TIME}</li><li>장소: {PLACES.join(' / ')}</li><li>대관 실패 시 일정·장소를 유연하게 조정</li><li>비가 오면 논의 후 진행 여부 결정</li></ul></section>
    <section id="join"><h2>참여 방법</h2><ol><li>오픈카톡에 자기소개를 남기고 모임 통장 초대 받기</li><li>매주 카톡 투표로 참석 여부 표시</li><li>매치 참석 후 당일 정산(대관비·음료비)</li></ol><p class="label">자기소개 양식 (채팅방에 붙여넣기)</p><pre class="card" style="white-space:pre-wrap;margin:0">이름 :
연락처 :
선호 포지션 (축구 기준) :
주발 :
나이 (OO년생) :</pre></section>
    <section id="money"><h2>비용 · 벌금</h2><div class="tbl-wrap"><table class="tbl"><thead><tr><th>유형</th><th>기준</th><th class="r">금액</th></tr></thead><tbody>{FINE_TYPES.map((t) => <tr><td>{t}</td><td>{FINE_NOTE[t]}</td><td class="r">{won(FINE_AMOUNT[t])}</td></tr>)}</tbody></table></div><p class="muted">{FINE_EXEMPT}</p><ul><li>대관비·음료비는 참석자(용병 포함) 정산</li><li>벌금은 당일 구장비·음료비 정산에 우선 사용</li><li>잔액은 모임 통장 공금 → 대관비 선납·공용 물품</li></ul></section>
    <section id="duty"><h2>봉사</h2><ul><li>대관비·음료비 선납</li><li>음료 구매, 조끼 대여·반납</li><li>매치 종료 후 채팅방에서 정산 진행</li><li>매월 {DUTY_PER_MONTH}명 로테이션 — <a href={href('/record/duty/')}>전체 일정</a></li></ul></section>
    <section id="bank"><h2>모임 통장</h2><p>{BANK.name} {BANK.number} ({BANK.holder})<br/>모임 시작일 {BANK.since} · 통장 초대 문의: {BANK.contact}</p></section>
    <section id="manner"><h2>에티켓</h2><ul><li>투표에 꼭 참여하기</li><li>불참 등 특이사항은 사전에 공유</li><li>서로 존중하는 채팅</li></ul></section>
  </article>
</Shell>
<style>
  .prose section { max-width: 640px; }
  .prose h2 { font-size: var(--fs-sm); letter-spacing: .06em; text-transform: uppercase; margin: 0 0 12px; }
  .prose h2::after { content: ""; display: block; width: 28px; height: 2px; background: var(--fg); margin-top: 8px; }
  .prose ul, .prose ol { padding-left: 1.2em; margin: 0; }
  .prose li { margin-bottom: 4px; }
  .prose p { margin: 0 0 12px; }
</style>
```

- [ ] **Step 2: `npm test`** — PAGES에 `'about/index.html'`; index 허용 검사·sitemap 검사가 PASS. dist 테스트에 한 개 더 추가:

```js
test('sitemap에는 tactics와 about만', () => {
  const sm = readFileSync('dist/sitemap-0.xml', 'utf8');
  const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).sort();
  assert.deepEqual(locs, ['https://byjunyoung.github.io/weekly-fc/about/', 'https://byjunyoung.github.io/weekly-fc/tactics/']);
});
```

- [ ] **Step 3: 커밋** — `git add -A && git commit -m "feat: 소개·모집·규칙 페이지"`

---

### Task 15: 정리 · README · 전체 검증

**Files:**
- Delete: `legacy/`
- Replace: `README.md`
- Modify: `tests/build/dist.test.mjs` — 최종 `PAGES` 확인

- [ ] **Step 1: legacy 삭제** — `git rm -r legacy` (옛 앱은 커밋 `a2bfffc` 이전 히스토리에 있다).

- [ ] **Step 2: README.md**

```markdown
# WEEKLY FC 포탈

매주 토요일 모이는 풋살 팀의 포탈. https://byjunyoung.github.io/weekly-fc/

- 스택: Astro 정적 사이트 + Google Apps Script(구글시트). 프레임워크·외부 라이브러리 없음.
- 설계: `docs/superpowers/specs/2026-09-10-weekly-fc-portal-design.md`. 결정을 바꾸면 그 문서부터.
- 배포: `main` push → GitHub Actions → Pages.

## 개발

```bash
npm install        # ~/Documents는 iCloud라 node_modules는 .nosync 심링크 구조 (memory 참고)
npm run dev        # http://localhost:4321/weekly-fc/
npm test           # 단위 테스트 + 빌드 + dist 검사
```

## 데이터

전부 구글시트에 있고 소스에는 없다. 시트: `선수명단`(rot 열이 봉사 순번) · `매치기록` · `봉사로테이션` · `벌금` · `라인업`.
Apps Script는 standalone 프로젝트 `weekly fc`(`script.google.com/u/1/home/my`). 재배포는 "배포 관리 > 새 버전"으로 주소를 유지한다. 스크립트 속성 `SPREADSHEET_ID`·`ADMIN_PIN` 필요.

## 규칙 상수

벌금·시간·장소·통장은 `src/lib/rules.ts` 한 곳. 소개 페이지와 정산 화면이 같은 값을 쓴다.
```

- [ ] **Step 3: 전체 검증**

```bash
npm test
npm run check   # astro check — 타입 오류 0
```
그리고 `npm run dev`로 1280·390 폭에서 홈·스쿼드·선수·매치 목록·매치 상세(3탭)·기록 3탭·전술·소개를 스크린샷 → **사용자에게 보여주고 승인**.

- [ ] **Step 4: 커밋** — `git add -A && git commit -m "chore: legacy 제거 · README"`

---

### Task 16: 배포 전환 · 전술보드 레포 정리 (외부 쓰기 — 단계마다 go)

- [ ] **Step 1: 미리보기** — 아래 세 가지를 한 번에 보여주고 go를 받는다.

```
1) byjunyoung/weekly-fc 에 push (커밋 n개)
2) Pages 소스를 "브랜치"에서 "GitHub Actions"로 전환
3) byjunyoung/tactics-board: Pages 끄기 → 레포 아카이브
```

- [ ] **Step 2: push + Pages 전환**

```bash
gh auth switch --user byjunyoung
git push origin main
gh api -X PUT repos/byjunyoung/weekly-fc/pages -f build_type=workflow
gh run watch --repo byjunyoung/weekly-fc   # Deploy 워크플로가 초록으로 끝나는지
```

- [ ] **Step 3: 실서비스 검증**

```bash
for p in "" squad/ squad/9/ match/ record/ record/fines/ record/duty/ tactics/ about/; do printf "%-16s " "/$p"; curl -s -o /dev/null -w "%{http_code}\n" "https://byjunyoung.github.io/weekly-fc/$p"; done
curl -s https://byjunyoung.github.io/weekly-fc/tactics/ | grep -c 'name="robots"'   # 0 이어야
curl -s https://byjunyoung.github.io/weekly-fc/squad/ | grep -c 'noindex'            # 1 이어야
```
브라우저(폰 포함)로 관리자 흐름 한 번: 영상에서 가져오기 → 참석 붙여넣기 → 리캡 저장.

- [ ] **Step 4: tactics-board 정리**

```bash
gh api -X DELETE repos/byjunyoung/tactics-board/pages
gh repo archive byjunyoung/tactics-board --yes
gh auth switch --user xyz-jun
```
`~/Documents/프로젝트/개발/tactics-board` 로컬 폴더는 남겨둔다(사용자가 지운다).

- [ ] **Step 5: 메모리 갱신** — `project_weekly_fc.md`에 이번 개편(스택·주소 구조·시트 변경·Apps Script 버전·tactics-board 아카이브)을 추가하고, `reference_repos_map.md`에 tactics-board 아카이브를 반영한다.
