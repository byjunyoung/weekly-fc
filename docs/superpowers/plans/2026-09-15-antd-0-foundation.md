# Ant Design 0단계(기반) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** React 19 + antd 6을 들여와 짙은 톤 테마·빌드 때 CSS 추출을 깔고, 상단바의 이름·관리자 버튼과 두 모달·토스트를 첫 React 섬으로 옮긴다.

**Architecture:** Astro 페이지·레이아웃은 그대로 두고 `Shell.astro`의 `.topbar-act` 안에 `<TopbarActions client:load />` 섬 하나를 둔다. 테마는 `src/react/theme.ts` 한 곳, 화면은 `zeroRuntime`(런타임에 스타일을 만들지 않음)이고 부품 CSS는 `prebuild`에서 `public/antd.css`로 뽑는다. 옛 화면은 계속 `wfc:data`·`wfc:error`·`wfc:admin`·`wfc:me` 이벤트로 듣고, 섬의 훅도 같은 이벤트를 구독한다.

**Tech Stack:** Astro 7.3, @astrojs/react 6.0.5, React 19.3, antd 6.6.4, @ant-design/static-style-extract 2.1.0, Node `node --test`(Node 22.18+가 `.ts`를 바로 불러옴)

**Spec:** `docs/superpowers/specs/2026-09-15-antd-migration-design.md` (§2 구조, §3 테마·스타일, §4 상태, §5 0단계 행, §6 오류, §7 검증). 1~4단계는 이 계획 범위 밖이고 단계마다 계획을 따로 쓴다.

## Global Constraints

- 버전: `antd@^6.6.4`, `react@^19.3.0`, `react-dom@^19.3.0`, `@astrojs/react@^6.0.5`(dependencies) / `@ant-design/static-style-extract@^2.1.0`, `@types/react@^19.3.0`, `@types/react-dom@^19.3.0`(devDependencies).
- 테마 값은 `src/react/theme.ts` 한 곳에만 쓴다. CSS 변수 클래스 키는 `wfc`, `hashed: false`, 화면은 `zeroRuntime: true`, 뽑을 때만 `zeroRuntime: false`.
- 겉모습은 지금 짙은 톤(PlayStation DESIGN.md) 유지 — 주색 `#0070d1`, 바탕 `#000000`, 카드 `#181818`, Pretendard, 알약 버튼.
- 바꾸지 않는 것: `server/`, 시트 열, `src/lib/api.ts` 계약, 주소 구조, noindex, `src/lib` 순수 로직.
- Web Awesome은 이 단계에서 지우지 않는다. 운영·선수 상세·스쿼드의 `wa-dialog`와 `Shell.astro`의 `[data-close]` 처리기가 계속 쓴다.
- 관리자 PIN은 에이전트가 입력하지 않는다.
- 레포가 iCloud 안이다: `git status` 금지(2분 넘게 멈춤). `git add <경로>`로만 스테이징하고 확인은 `git diff --cached --stat`. `src/data/videos.ts`(빌드마다 바뀜)와 `* 2.*` 충돌 사본은 커밋하지 않는다.
- `npm ci` 금지 — `node_modules` iCloud 제외 링크를 지운다. 설치는 `npm install`.
- 주석·문구는 한국어, 주변 코드의 밀도·말투를 따른다.
- 커밋 메시지 끝:
  ```
  Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01DaDPzugZyKUdGnpyTH5KY4
  ```
- 완료 판정은 `npm test`(단위 → `astro build`(prebuild 포함) → dist 검사) 통과. `astro check`/`tsc`는 이 맥에서 끝나지 않으므로 돌리지 않는다.

## 파일 구조

| 파일 | 책임 | 태스크 |
|---|---|---|
| `package.json` | 의존성, `prebuild`에 CSS 추출 추가 | 1 |
| `astro.config.mjs` | React 통합 | 1 |
| `tsconfig.json` | JSX 설정 | 1 |
| `.gitignore` | 뽑은 `public/antd.css` 제외 | 1 |
| `src/react/theme.ts` | antd 테마 객체 하나 | 1 |
| `scripts/extract-antd-css.mjs` | `public/antd.css` 생성 | 1 |
| `src/layouts/Shell.astro` | head에 antd CSS 링크(1), 상단바 섬·옛 모달 제거(2) | 1, 2 |
| `tests/unit/theme.test.mjs` | 테마 값 = `tokens.css` 값 | 1 |
| `tests/build/dist.test.mjs` | antd CSS 링크·내용(1), 섬 렌더(2) | 1, 2 |
| `src/react/ThemeRoot.tsx` | ConfigProvider(테마·ko_KR) + App | 2 |
| `src/react/useData.ts` · `useAdmin.ts` · `useMe.ts` | api.ts 캐시·이벤트를 React 상태로 | 2 |
| `src/react/shell/labels.ts` | 상단바 글자·정렬(순수) | 2 |
| `src/react/shell/TopbarActions.tsx` | 이름·관리자 버튼, PIN·이름 모달, `window.wfcToast` | 2 |
| `src/styles/tokens.css` | 전역 `button`·`input` 규칙을 antd 밖으로 한정, 옛 상단바 버튼·토스트 규칙 제거 | 2 |
| `tests/unit/shell-labels.test.mjs` | labels.ts | 2 |

## 컨트롤러 준비(태스크 전)

- [ ] `bash ~/Documents/Claude/claude-settings/scripts/nosync-setup.sh "/Users/junyoungkim/Documents/프로젝트/개발/weekly-fc"` — `node_modules`를 `node_modules.nosync` + 링크로 바꾼다(dry-run 결과 "이동 + 링크 1곳"). 확인: `ls -ld node_modules`가 `-> node_modules.nosync`.
- [ ] 브랜치 `antd-0-foundation`을 `main`에서 만든다.

---

### Task 1: 기반 — 의존성·React 통합·테마·CSS 추출

**Files:**
- Modify: `package.json`
- Modify: `astro.config.mjs`
- Modify: `tsconfig.json`
- Modify: `.gitignore`
- Create: `src/react/theme.ts`
- Create: `scripts/extract-antd-css.mjs`
- Modify: `src/layouts/Shell.astro:25-28` (head)
- Test: `tests/unit/theme.test.mjs`
- Test: `tests/build/dist.test.mjs`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `src/react/theme.ts`: `export const CSS_VAR_KEY = 'wfc'`, `export const EXACT_COLORS: { colorPrimary; colorPrimaryHover; colorPrimaryActive; colorLink; colorLinkHover; colorError; colorSuccess }`(문자열), `export const themeConfig: ThemeConfig`
  - `tests/build/dist.test.mjs`: `export const SHELL_PAGES: string[]`(넘김 페이지를 뺀 `PAGES`)
  - 빌드 산출물 `dist/antd.css`, 모든 셸 페이지 head의 `<link rel="stylesheet" href="/weekly-fc/antd.css">`

- [ ] **Step 1: 의존성 설치**

```bash
cd "/Users/junyoungkim/Documents/프로젝트/개발/weekly-fc"
npm install antd@^6.6.4 react@^19.3.0 react-dom@^19.3.0 @astrojs/react@^6.0.5
npm install -D @ant-design/static-style-extract@^2.1.0 @types/react@^19.3.0 @types/react-dom@^19.3.0
ls -ld node_modules
```

Expected: 설치 성공, `node_modules -> node_modules.nosync` 링크가 그대로 있다. 링크가 실제 폴더로 바뀌었으면 멈추고 보고한다(BLOCKED).

- [ ] **Step 2: 실패하는 단위 테스트 작성** — `tests/unit/theme.test.mjs`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { theme as antdTheme } from 'antd';
import { CSS_VAR_KEY, EXACT_COLORS, themeConfig } from '../../src/react/theme.ts';

// tokens.css 첫 :root 블록에서 값을 읽는다 — 테마가 정본과 어긋나면 여기서 잡힌다.
const css = readFileSync('src/styles/tokens.css', 'utf8');
const start = css.indexOf(':root {');
const root = css.slice(start, css.indexOf('\n}', start));
const tok = (name) => { const m = root.match(new RegExp(`--${name}:\\s*([^;]+);`)); assert.ok(m, `--${name} 없음`); return m[1].trim(); };
const px = (name) => Number(tok(name).replace('px', ''));

test('antd 토큰은 tokens.css 값과 같다', () => {
  const t = themeConfig.token;
  assert.equal(t.colorPrimary, tok('primary'));
  assert.equal(t.colorBgBase, tok('bg'));
  assert.equal(t.colorBgLayout, tok('bg'));
  assert.equal(t.colorBgContainer, tok('card'));
  assert.equal(t.colorBgElevated, tok('charcoal'));
  assert.equal(t.colorText, tok('fg'));
  assert.equal(t.colorTextSecondary, tok('body'));
  assert.equal(t.colorTextTertiary, tok('muted'));
  assert.equal(t.colorBorder, tok('hairline-strong'));
  assert.equal(t.colorBorderSecondary, tok('hairline'));
  assert.equal(t.colorLink, tok('link'));
  assert.equal(t.colorError, tok('warn'));
  assert.equal(t.colorSuccess, tok('ok'));
  assert.equal(t.borderRadiusSM, px('r-sm'));
  assert.equal(t.borderRadius, px('r-md'));
  assert.equal(t.borderRadiusLG, px('r-lg'));
  assert.equal(t.fontFamily, tok('font'));
  assert.equal(t.fontSize, px('fs-body'));
});

test('CSS 변수 클래스는 wfc 로 고정, 해시 끔, 화면은 zeroRuntime', () => {
  assert.equal(CSS_VAR_KEY, 'wfc');
  assert.deepEqual(themeConfig.cssVar, { key: 'wfc' });
  assert.equal(themeConfig.hashed, false);
  assert.equal(themeConfig.zeroRuntime, true);
});

test('darkAlgorithm 뒤에도 주색·링크·경고·완료 색은 우리 값', () => {
  const [dark, keep] = themeConfig.algorithm;
  assert.equal(dark, antdTheme.darkAlgorithm);
  const seed = { ...antdTheme.defaultSeed, ...themeConfig.token };
  const darkOnly = dark(seed);
  assert.notEqual(darkOnly.colorPrimary, '#0070d1', 'darkAlgorithm 이 주색을 안 바꾼다면 keep 함수가 필요 없다');
  const map = keep(seed, darkOnly);
  for (const [k, v] of Object.entries(EXACT_COLORS)) assert.equal(map[k], v, k);
  assert.equal(EXACT_COLORS.colorPrimaryHover, tok('primary-pressed'));
});

test('버튼은 지금 button 규칙과 같은 알약 모양', () => {
  const b = themeConfig.components.Button;
  assert.equal(b.borderRadius, 9999);
  assert.equal(b.controlHeight, 40);
  assert.equal(b.paddingInline, 22);
  assert.equal(b.contentFontSize, 14);
  assert.equal(b.fontWeight, 500);
  assert.equal(b.primaryShadow, 'none');
  assert.equal(b.controlHeightSM, 34);
  assert.equal(b.paddingInlineSM, 16);
  assert.equal(b.contentFontSizeSM, 12);
});
```

- [ ] **Step 3: 실패 확인**

Run: `node --test tests/unit/theme.test.mjs`
Expected: FAIL — `Cannot find module .../src/react/theme.ts`

- [ ] **Step 4: 테마 구현** — `src/react/theme.ts`

```ts
// src/react/theme.ts — antd 테마 한 곳. 값은 src/styles/tokens.css 를 그대로 옮긴다(tests/unit/theme.test.mjs 가 대조).
// 이 파일은 브라우저 번들과 scripts/extract-antd-css.mjs(Node) 양쪽에서 불린다 — Node 에서 바로 돌도록 타입 외 문법만 쓴다.
import { theme as antdTheme } from 'antd';
import type { MappingAlgorithm, ThemeConfig } from 'antd';

/** CSS 변수를 거는 클래스. 기본값이면 빌드 때 뽑은 CSS(.css-var-_R_0_)와 화면(React useId 로 만든 이름)이 달라 변수가 안 걸린다. */
export const CSS_VAR_KEY = 'wfc';

/** darkAlgorithm 은 주색 #0070d1 을 #0362b5 로, 링크 #53b1ff 를 #4a99dc 로 바꾼다. token 에 적어도 안 돌아와서 알고리즘 뒤에 다시 얹는다. */
export const EXACT_COLORS = {
  colorPrimary: '#0070d1',
  colorPrimaryHover: '#0064b7',
  colorPrimaryActive: '#0064b7',
  colorLink: '#53b1ff',
  colorLinkHover: '#53b1ff',
  colorError: '#ff5c74',
  colorSuccess: '#59cf84',
};
const keepExactColors: MappingAlgorithm = (_seed, map) => ({ ...map!, ...EXACT_COLORS });

export const themeConfig: ThemeConfig = {
  zeroRuntime: true,
  cssVar: { key: CSS_VAR_KEY },
  hashed: false,
  algorithm: [antdTheme.darkAlgorithm, keepExactColors],
  token: {
    colorPrimary: '#0070d1',
    colorBgBase: '#000000',
    colorBgLayout: '#000000',
    colorBgContainer: '#181818',
    colorBgElevated: '#1f2024',
    colorText: '#ffffff',
    colorTextSecondary: 'rgba(255, 255, 255, .7)',
    colorTextTertiary: 'rgba(229, 229, 229, .55)',
    colorBorder: 'rgba(229, 229, 229, .38)',
    colorBorderSecondary: 'rgba(229, 229, 229, .2)',
    colorLink: '#53b1ff',
    colorError: '#ff5c74',
    colorSuccess: '#59cf84',
    borderRadiusSM: 4,
    borderRadius: 8,
    borderRadiusLG: 16,
    fontFamily: '"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, system-ui, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif',
    fontSize: 16,
  },
  components: {
    // 지금 tokens.css 의 button 규칙(알약, 높이 40, 좌우 22, 14px·500)과 .topbar-act button(34, 좌우 16, 12px)을 옮긴다.
    Button: {
      borderRadius: 9999, borderRadiusSM: 9999, borderRadiusLG: 9999,
      controlHeight: 40, paddingInline: 22, contentFontSize: 14,
      controlHeightSM: 34, paddingInlineSM: 16, contentFontSizeSM: 12,
      fontWeight: 500,
      defaultBg: 'transparent', defaultColor: '#ffffff', defaultBorderColor: 'rgba(229, 229, 229, .38)',
      defaultHoverBg: 'rgba(255, 255, 255, .1)', defaultHoverColor: '#ffffff', defaultHoverBorderColor: 'rgba(229, 229, 229, .38)',
      defaultShadow: 'none', primaryShadow: 'none', dangerShadow: 'none',
    },
    // 지금 wa-dialog::part(...) 규칙 — 카드 면, 모서리 16, 제목 22·굵기 400.
    Modal: { contentBg: '#181818', headerBg: '#181818', titleFontSize: 22, fontWeightStrong: 400, borderRadiusLG: 16 },
  },
};
```

- [ ] **Step 5: 단위 테스트 통과 확인**

Run: `node --test tests/unit/theme.test.mjs`
Expected: PASS 4/4

- [ ] **Step 6: 빌드 검사에 실패하는 테스트 추가** — `tests/build/dist.test.mjs`

`export const INDEXABLE = [];` 바로 아래에 추가:

```js
// 넘김 페이지(Redirect.astro)는 셸을 안 쓴다.
const REDIRECTS = ['record/index.html', 'record/fines/index.html', 'record/duty/index.html', 'tactics/index.html', 'about/index.html'];
export const SHELL_PAGES = PAGES.filter((p) => !REDIRECTS.includes(p));
```

파일 끝에 추가:

```js
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
```

- [ ] **Step 7: 실패 확인**

Run: `npm run build && node --test tests/build/dist.test.mjs`
Expected: 새 테스트 2개 FAIL(`dist/antd.css 없음`), 기존 테스트 PASS

- [ ] **Step 8: CSS 추출 스크립트** — `scripts/extract-antd-css.mjs`

```js
// scripts/extract-antd-css.mjs — antd 부품 CSS 를 빌드 전에 public/antd.css 로 뽑는다(prebuild).
// 화면은 zeroRuntime(런타임에 스타일을 만들지 않음)이라 이 파일이 없으면 antd 부품이 맨 모습으로 나온다.
// 뽑을 때만 zeroRuntime 을 끈다 — 켠 채로 뽑으면 CSS 변수만 나오고 부품 규칙이 비어 있다(2026-09-15 실험).
import { mkdirSync, writeFileSync } from 'node:fs';
import { createElement } from 'react';
import { extractStyle } from '@ant-design/static-style-extract';
import { ConfigProvider } from 'antd';
import { themeConfig } from '../src/react/theme.ts';

// 스펙에서 쓰지 않는 부품군. 전부 뽑으면 gzip 110KB, 빼면 약 64KB.
// 쓰는 것만 고르는 includes 는 Table 이 안에서 쓰는 Pagination·Checkbox·Dropdown 을 빠뜨리기 쉬워 쓰지 않는다.
// 새 부품을 쓰게 되면 여기서 뺀다(tests/build/dist.test.mjs 가 쓰는 부품 규칙이 있는지 본다).
const UNUSED = ['Affix', 'Alert', 'Anchor', 'AutoComplete', 'Avatar', 'BackTop', 'Badge', 'Breadcrumb', 'Calendar', 'Carousel',
  'Cascader', 'Collapse', 'ColorPicker', 'Divider', 'Flex', 'FloatButton', 'Image', 'Layout', 'List', 'Listy', 'Masonry',
  'Mentions', 'Progress', 'QRCode', 'Rate', 'Result', 'Skeleton', 'Slider', 'Splitter', 'Statistic', 'Steps', 'Switch',
  'Tabs', 'Tag', 'Timeline', 'Tour', 'Transfer', 'Tree', 'TreeSelect', 'Typography', 'Upload', 'Watermark', 'notification'];

const css = extractStyle({
  excludes: UNUSED,
  customTheme: (node) => createElement(ConfigProvider, { theme: { ...themeConfig, zeroRuntime: false } }, node),
});
mkdirSync('public', { recursive: true });
writeFileSync('public/antd.css', css);
console.log(`public/antd.css ${css.length}B`);
```

- [ ] **Step 9: 설정 파일 수정**

`package.json` `scripts.prebuild`:

```json
"prebuild": "node scripts/fetch-videos.mjs && node scripts/extract-antd-css.mjs",
```

`astro.config.mjs` 전체:

```js
// astro.config.mjs
// 검색 허용 페이지가 없어(2026-09-14 운영 규칙까지 noindex) sitemap 통합을 뺐다.
// React 는 페이지마다 섬 하나로만 쓴다(2026-09-15 Ant Design 도입 스펙).
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

export default defineConfig({
  site: 'https://byjunyoung.github.io',
  base: '/weekly-fc',
  trailingSlash: 'always',
  integrations: [react()],
});
```

`tsconfig.json` `compilerOptions`:

```json
"compilerOptions": {
  "allowImportingTsExtensions": true,
  "jsx": "react-jsx",
  "jsxImportSource": "react"
},
```

`.gitignore`, `.astro/` 줄 아래:

```
# prebuild 가 뽑는 antd 부품 CSS(scripts/extract-antd-css.mjs)
public/antd.css
```

`src/layouts/Shell.astro` head — Pretendard `<link rel="stylesheet" ...>` 줄 바로 아래, `<slot name="head" />` 위:

```astro
  <!-- antd 부품 CSS — prebuild 가 테마를 넣어 뽑는다. 화면은 zeroRuntime 이라 이게 첫 페인트의 antd 스타일 전부다. -->
  <link rel="stylesheet" href={href('/antd.css')} />
```

- [ ] **Step 10: 전체 테스트 통과 확인**

Run: `npm test`
Expected: 단위 전부 PASS(theme 4개 포함), 빌드 성공(`public/antd.css ...B` 출력), dist 검사 전부 PASS. 화면은 아직 antd 부품이 없어 이전과 같다.

- [ ] **Step 11: 커밋**

```bash
git add package.json package-lock.json astro.config.mjs tsconfig.json .gitignore src/react/theme.ts scripts/extract-antd-css.mjs src/layouts/Shell.astro tests/unit/theme.test.mjs tests/build/dist.test.mjs
git diff --cached --stat
git commit -m "feat(antd): React·antd 기반 — 짙은 톤 테마, 빌드 때 부품 CSS 추출

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DaDPzugZyKUdGnpyTH5KY4"
```

Expected: 스테이징 목록에 `src/data/videos.ts`·`public/antd.css`·`* 2.*`가 없다.

### Task 2: 상단바 섬 — 이름·관리자 버튼, PIN·이름 모달, 토스트

**Files:**
- Create: `src/react/ThemeRoot.tsx`
- Create: `src/react/useData.ts`
- Create: `src/react/useAdmin.ts`
- Create: `src/react/useMe.ts`
- Create: `src/react/shell/labels.ts`
- Create: `src/react/shell/TopbarActions.tsx`
- Modify: `src/layouts/Shell.astro` (전체 교체 — 아래)
- Modify: `src/styles/tokens.css:107,121-135,153-155,462-464,508-510`
- Test: `tests/unit/shell-labels.test.mjs`
- Test: `tests/unit/tokens-scope.test.mjs`
- Test: `tests/build/dist.test.mjs`

**Interfaces:**
- Consumes (Task 1): `themeConfig`, `CSS_VAR_KEY` from `src/react/theme.ts`; `SHELL_PAGES` from `tests/build/dist.test.mjs`
- Consumes (기존): `cached(): Data | null`, `refresh(): Promise<Data>`, `EMPTY: Data`, `isAdmin(): boolean`, `login(pin): Promise<'ok' | 'bad-pin' | 'error'>`, `logout(): void` from `src/lib/api.ts`; `getMe(): number | null`, `setMe(num: number | null): void`(→ `wfc:me` 발생) from `src/lib/me.ts`; `Player`, `Data` from `src/lib/types.ts`
- Produces (2단계 이후가 쓴다):
  - `src/react/ThemeRoot.tsx`: `export default function ThemeRoot({ children }: { children: ReactNode })`
  - `src/react/useData.ts`: `export function useData(): { data: Data | null; error: string | null; retry: () => void }`
  - `src/react/useAdmin.ts`: `export function useAdmin(): boolean`
  - `src/react/useMe.ts`: `export function useMe(): number | null`
  - DOM 계약(홈 `#pick-me`가 `#me-btn`을 누른다): `button#me-btn`, `button#admin-btn`, PIN 입력 `input#pin-input`, 오류 `p#pin-err`, 이름 격자 `div#me-list`
  - `window.wfcToast(m: string)` → antd `message`

- [ ] **Step 1: 실패하는 단위 테스트 2개 작성**

`tests/unit/shell-labels.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { adminLabel, meLabel, pickOrder, pinError } from '../../src/react/shell/labels.ts';

const P = (num, name) => ({ num, name });
test('meLabel: 고른 번호의 이름, 없거나 명단에 없으면 "이름"', () => {
  assert.equal(meLabel([P(7, '김'), P(9, '박')], 9), '박');
  assert.equal(meLabel([P(7, '김')], 3), '이름');
  assert.equal(meLabel([], null), '이름');
});
test('adminLabel', () => {
  assert.equal(adminLabel(true), '관리자 모드 끄기');
  assert.equal(adminLabel(false), '관리자');
});
test('pickOrder 는 번호순이고 원본을 바꾸지 않는다', () => {
  const src = [P(9, '박'), P(2, '이'), P(7, '김')];
  assert.deepEqual(pickOrder(src).map((p) => p.num), [2, 7, 9]);
  assert.deepEqual(src.map((p) => p.num), [9, 2, 7]);
});
test('pinError: 틀린 PIN 과 연결 실패를 다른 문구로', () => {
  assert.equal(pinError('bad-pin'), 'PIN이 올바르지 않습니다.');
  assert.equal(pinError('error'), '연결에 실패했습니다 · 다시 시도');
});
```

`tests/unit/tokens-scope.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// antd 부품은 CSS 변수 클래스 .wfc 를 달고 나온다(src/react/theme.ts CSS_VAR_KEY). 맨 요소 규칙이 거기 새면
// antd 가 안 정하는 속성(min-height·gap·outline 등)이 끼어 모달 닫기 버튼 같은 게 깨진다.
test('맨 button·input·select·textarea 규칙은 .wfc 밖으로 한정돼 있다', () => {
  const css = readFileSync('src/styles/tokens.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const selectors = [...css.matchAll(/([^{}]+)\{/g)]
    .map((m) => m[1].trim())
    .filter((s) => !s.startsWith('@'))
    .flatMap((s) => s.split(/,(?![^(]*\))/).map((x) => x.trim())); // 괄호 안 쉼표(:not(a, b))는 자르지 않는다
  const bare = selectors.filter((s) => /^(button|input|select|textarea)\b/.test(s) && !s.includes(':where(:not(.wfc, .wfc *))'));
  assert.deepEqual(bare, []);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/unit/shell-labels.test.mjs tests/unit/tokens-scope.test.mjs`
Expected: shell-labels FAIL(`Cannot find module .../labels.ts`), tokens-scope FAIL(`button`, `input`, `button:hover`, `button.primary` 등이 담긴 배열)

- [ ] **Step 3: 순수 글자 함수** — `src/react/shell/labels.ts`

```ts
// 상단바 버튼·모달 글자 — 화면과 떨어뜨려 단위 테스트한다(tests/unit/shell-labels.test.mjs).
import type { LoginResult } from '../../lib/api';
import type { Player } from '../../lib/types';

export const meLabel = (players: Pick<Player, 'num' | 'name'>[], me: number | null): string =>
  players.find((p) => p.num === me)?.name ?? '이름';
export const adminLabel = (admin: boolean): string => (admin ? '관리자 모드 끄기' : '관리자');
export const pickOrder = <T extends Pick<Player, 'num'>>(players: T[]): T[] => [...players].sort((a, b) => a.num - b.num);
export const pinError = (r: Exclude<LoginResult, 'ok'>): string =>
  r === 'bad-pin' ? 'PIN이 올바르지 않습니다.' : '연결에 실패했습니다 · 다시 시도';
```

- [ ] **Step 4: 전역 요소 규칙 한정** — `src/styles/tokens.css`

107행:

```css
button:where(:not(.wfc, .wfc *)), input:where(:not(.wfc, .wfc *)), select:where(:not(.wfc, .wfc *)), textarea:where(:not(.wfc, .wfc *)) { font: inherit; color: inherit; }
```

120~135행(주석 줄 포함)을 통째로:

```css
/* 정본: 알약(rounded.full), 높이 48, padding 12/28. 대문자·자간 확장은 쓰지 않는다.
   antd 부품(.wfc 안)에는 걸지 않는다 — antd 가 안 정하는 속성이 새어 들어간다. :where() 로 감싸 원래 우선순위를 그대로 둔다. */
button:where(:not(.wfc, .wfc *)), .btn {
  display: inline-flex; align-items: center; justify-content: center; gap: var(--s-xs);
  min-height: 40px; padding: 10px 22px; border: 1px solid var(--hairline-strong); border-radius: var(--r-full);
  background: transparent; color: var(--fg); font-size: var(--fs-sm); font-weight: var(--fw-strong);
  cursor: pointer; transition: background var(--dur-micro) var(--ease-std), border-color var(--dur-micro) var(--ease-std), color var(--dur-micro) var(--ease-std);
}
button:where(:not(.wfc, .wfc *)):hover { background: rgba(255, 255, 255, .1); }
button:where(:not(.wfc, .wfc *)).primary { background: var(--primary); border-color: var(--primary); color: var(--on-primary); }
button:where(:not(.wfc, .wfc *)).primary:hover { background: var(--primary-pressed); border-color: var(--primary-pressed); }
button:where(:not(.wfc, .wfc *)).danger { color: var(--warn); border-color: var(--warn); }
button:where(:not(.wfc, .wfc *)).danger:hover { background: var(--warn-bg); }
button:where(:not(.wfc, .wfc *)):disabled { opacity: .38; cursor: default; }
input:where(:not(.wfc, .wfc *)), select:where(:not(.wfc, .wfc *)), textarea:where(:not(.wfc, .wfc *)) { min-height: 40px; padding: 10px var(--s-md); border: 1px solid var(--hairline-strong);
  border-radius: var(--r-sm); background: var(--elevated); color: var(--fg); font-size: var(--fs-sm); }
input:where(:not(.wfc, .wfc *)):focus, select:where(:not(.wfc, .wfc *)):focus, textarea:where(:not(.wfc, .wfc *)):focus { outline: 2px solid var(--link); outline-offset: 1px; border-color: var(--link); }
```

153~155행을:

```css
.topbar-act { display: flex; align-items: center; gap: var(--s-xs); }
```

(`.topbar-act button`, `.topbar-act .admin-on` 두 줄 삭제 — 크기는 antd `size="small"` 토큰, 켜진 모습은 `type="primary"`가 맡는다.)

462~464행 `.toast { ... }` 규칙 삭제(토스트는 antd `message`).

508~510행을:

```css
/* 이름 고르기 격자 — 상단바 섬의 antd Modal 안에 든다. 칸이 좁아(104px) antd 버튼 좌우 여백만 줄인다. */
.pick-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: var(--s-xs); }
.pick-list .ant-btn { padding-inline: var(--s-xxs); }
```

- [ ] **Step 5: 단위 테스트 통과 확인**

Run: `node --test tests/unit/shell-labels.test.mjs tests/unit/tokens-scope.test.mjs`
Expected: PASS 5/5

- [ ] **Step 6: 빌드 검사에 실패하는 테스트 추가** — `tests/build/dist.test.mjs` 끝에

```js
test('상단바 이름·관리자 버튼은 React 섬으로 그려지고 옛 모달·토스트는 없다', () => {
  for (const p of SHELL_PAGES) {
    const html = read(p);
    const island = html.match(/<astro-island[^>]*component-url="\/weekly-fc\/_astro\/TopbarActions\.[^"]+\.js"[^>]*>/);
    assert.ok(island, `${p}: TopbarActions 섬 없음`);
    assert.ok(island[0].includes('client="load"'), `${p}: client:load 아님`);
    assert.ok(html.includes('id="me-btn"') && html.includes('id="admin-btn"'), `${p}: 버튼이 빌드 때 안 그려짐`);
    for (const old of ['id="pin-modal"', 'id="me-modal"', 'id="toast"']) assert.ok(!html.includes(old), `${p}: ${old} 가 남음`);
  }
});
```

Run: `npm run build && node --test tests/build/dist.test.mjs`
Expected: 새 테스트 FAIL(`TopbarActions 섬 없음`), 나머지 PASS

- [ ] **Step 7: 훅 3개와 ThemeRoot**

`src/react/ThemeRoot.tsx`:

```tsx
// 모든 React 섬의 바깥 — 테마(짙은 톤)·한국어 기본 문구·message 를 한 번에 건다.
// App 은 감싸는 div 를 만들지 않는다(component={false}): 상단바처럼 flex 줄 안에 드는 섬이 있어서.
import { App, ConfigProvider } from 'antd';
import koKR from 'antd/locale/ko_KR';
import type { ReactNode } from 'react';
import { themeConfig } from './theme';

export default function ThemeRoot({ children }: { children: ReactNode }) {
  return (
    <ConfigProvider theme={themeConfig} locale={koKR}>
      <App component={false}>{children}</App>
    </ConfigProvider>
  );
}
```

`src/react/useData.ts`:

```ts
// api.ts 의 캐시·refresh·이벤트를 React 상태로. 옛 화면과 같은 wfc:data / wfc:error 를 듣는다(스펙 §4).
// 빌드 때는 브라우저 저장소가 없어 null 로 그리고, 캐시는 화면이 뜬 뒤에 읽는다.
import { useCallback, useEffect, useState } from 'react';
import { cached, EMPTY, refresh } from '../lib/api';
import type { Data } from '../lib/types';

export function useData(): { data: Data | null; error: string | null; retry: () => void } {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const c = cached();
    if (c) setData(c);
    const onOk = (e: Event) => { setData((e as CustomEvent<Data>).detail); setError(null); };
    const onErr = (e: Event) => setError((e as CustomEvent<string>).detail);
    window.addEventListener('wfc:data', onOk);
    window.addEventListener('wfc:error', onErr);
    // 페이지 스크립트도 onData 로 refresh 를 부르지만 api.ts 가 동시 요청을 한 번으로 묶는다.
    refresh().catch(() => { if (!c) setData(EMPTY); });
    return () => { window.removeEventListener('wfc:data', onOk); window.removeEventListener('wfc:error', onErr); };
  }, []);
  const retry = useCallback(() => { refresh().catch(() => {}); }, []);
  return { data, error, retry };
}
```

`src/react/useAdmin.ts`:

```ts
// 관리자 여부 — PIN 은 sessionStorage 라 빌드 때는 false 로 그리고 화면이 뜬 뒤에 읽는다. wfc:admin 마다 다시 읽는다.
import { useEffect, useState } from 'react';
import { isAdmin } from '../lib/api';

export function useAdmin(): boolean {
  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    const read = () => setAdmin(isAdmin());
    read();
    window.addEventListener('wfc:admin', read);
    return () => window.removeEventListener('wfc:admin', read);
  }, []);
  return admin;
}
```

`src/react/useMe.ts`:

```ts
// 이 기기에 기억한 내 번호 — localStorage 라 화면이 뜬 뒤에 읽고, setMe 가 보내는 wfc:me 마다 다시 읽는다.
import { useEffect, useState } from 'react';
import { getMe } from '../lib/me';

export function useMe(): number | null {
  const [me, setMeState] = useState<number | null>(null);
  useEffect(() => {
    const read = () => setMeState(getMe());
    read();
    window.addEventListener('wfc:me', read);
    return () => window.removeEventListener('wfc:me', read);
  }, []);
  return me;
}
```

- [ ] **Step 8: 상단바 섬** — `src/react/shell/TopbarActions.tsx`

```tsx
// 상단바 오른쪽 — 이름·관리자 버튼과 두 모달, 토스트(window.wfcToast).
// 옛 화면(운영·선수 상세·스쿼드)이 듣는 wfc:admin 은 계속 보낸다. 홈 「내 선수」 타일은 #me-btn 을 대신 누른다.
// Modal 이 맡는 것: 포커스 트랩, Esc 닫기, role="dialog"·aria-modal, 스크롤 잠금, 닫을 때 포커스 복귀.
import { App, Button, Input, Modal } from 'antd';
import type { InputRef } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { login, logout } from '../../lib/api';
import { setMe } from '../../lib/me';
import ThemeRoot from '../ThemeRoot';
import { useAdmin } from '../useAdmin';
import { useData } from '../useData';
import { useMe } from '../useMe';
import { adminLabel, meLabel, pickOrder, pinError } from './labels';

function Actions() {
  const { message } = App.useApp();
  const { data } = useData();
  const players = data?.players ?? [];
  const me = useMe();
  const admin = useAdmin();
  const [meOpen, setMeOpen] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [pinErr, setPinErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pinRef = useRef<InputRef>(null);

  // 옛 화면의 toast()(src/lib/html.ts)가 부르는 다리. 섬이 뜨기 전 알림은 없다 — 알림은 모두 사용자 조작 뒤에 난다.
  useEffect(() => {
    const w = window as unknown as { wfcToast?: (m: string) => void };
    w.wfcToast = (m: string) => { message.open({ content: m, duration: 2.2 }); };
    return () => { delete w.wfcToast; };
  }, [message]);

  const onAdmin = () => {
    if (admin) { logout(); window.dispatchEvent(new Event('wfc:admin')); return; }
    setPin(''); setPinErr(null); setPinOpen(true);
  };
  const submitPin = async () => {
    if (busy) return;
    setBusy(true);
    const r = await login(pin.trim());
    setBusy(false);
    if (r === 'ok') { setPinOpen(false); window.dispatchEvent(new Event('wfc:admin')); }
    else setPinErr(pinError(r));
  };
  const pick = (num: number | null) => { setMe(num); setMeOpen(false); };

  return (
    <>
      <Button size="small" id="me-btn" onClick={() => setMeOpen(true)}>{meLabel(players, me)}</Button>
      <Button size="small" id="admin-btn" type={admin ? 'primary' : 'default'} onClick={onAdmin}>{adminLabel(admin)}</Button>

      <Modal title="관리자 모드" open={pinOpen} width={460} onCancel={() => setPinOpen(false)}
        afterOpenChange={(open) => { if (open) pinRef.current?.focus(); }}
        footer={[
          <Button key="cancel" onClick={() => setPinOpen(false)}>취소</Button>,
          <Button key="ok" type="primary" loading={busy} onClick={submitPin}>확인</Button>,
        ]}>
        <p className="muted">관리자 PIN을 입력하세요.</p>
        <Input.Password ref={pinRef} id="pin-input" inputMode="numeric" maxLength={8} autoComplete="off" visibilityToggle={false}
          value={pin} onChange={(e) => setPin(e.target.value)} onPressEnter={submitPin} />
        {pinErr && <p className="warn" id="pin-err">{pinErr}</p>}
      </Modal>

      <Modal title="내 이름 고르기" open={meOpen} width={460} onCancel={() => setMeOpen(false)}
        footer={[
          <Button key="clear" onClick={() => pick(null)}>지우기</Button>,
          <Button key="close" onClick={() => setMeOpen(false)}>닫기</Button>,
        ]}>
        <p className="muted">명단에서 본인을 고르면 이 기기에 기억됩니다.</p>
        <div className="pick-list" id="me-list">
          {pickOrder(players).map((p) => (
            <Button key={p.num} type={p.num === me ? 'primary' : 'default'} onClick={() => pick(p.num)}>{p.num} {p.name}</Button>
          ))}
        </div>
      </Modal>
    </>
  );
}

export default function TopbarActions() {
  return <ThemeRoot><Actions /></ThemeRoot>;
}
```

- [ ] **Step 9: 셸 교체** — `src/layouts/Shell.astro` 전체

```astro
---
// Web Awesome 테마를 먼저 불러 우리 토큰이 덮어쓰게 한다(순서가 바뀌면 라이브러리 기본색이 이긴다).
import '@awesome.me/webawesome/dist/styles/themes/default.css';
import '../styles/tokens.css';
import { href } from '../lib/url';
import TopbarActions from '../react/shell/TopbarActions.tsx';
interface Props { title: string; index?: boolean; wide?: boolean; description?: string }
const { title, index = false, wide = false, description = 'WEEKLY FC — 매주 모이는 풋살 팀의 포탈' } = Astro.props;
const nav = [
  { href: href('/'), label: '홈' },
  { href: href('/squad/'), label: '스쿼드' },
  { href: href('/match/'), label: '매치' },
  { href: href('/rules/'), label: '운영' },
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
  <!-- antd 부품 CSS — prebuild 가 테마를 넣어 뽑는다. 화면은 zeroRuntime 이라 이게 첫 페인트의 antd 스타일 전부다. -->
  <link rel="stylesheet" href={href('/antd.css')} />
  <slot name="head" />
</head>
<body class:list={["wa-dark", { wide }]}>
  <header class="topbar">
    <a class="mark" href={href('/')}>WEEKLY<b>FC</b></a>
    <nav class="topnav">
      {nav.map((n) => (
        <a href={n.href} class:list={[{ active: isActive(n.href) }]}><span>{n.label}</span></a>
      ))}
    </nav>
    <div class="topbar-act">
      <TopbarActions client:load />
    </div>
  </header>
  <main class="main">
    <p class="warn load-err" id="load-err" hidden>데이터를 불러오지 못했습니다 · <button id="load-err-retry">다시 시도</button></p>
    <slot />
  </main>

  <script>
    // 운영·선수 상세·스쿼드의 wa-dialog 가 아직 쓴다 — Web Awesome 은 4단계(스쿼드)에서 걷는다.
    // wa-dialog 가 맡는 것: 포커스 트랩, Esc 닫기, role="dialog"·aria-modal, 스크롤 잠금, 닫을 때 포커스 복귀.
    // 상단바 이름·관리자 버튼과 두 모달, 토스트는 React 섬(src/react/shell/TopbarActions.tsx)으로 옮겼다.
    import '@awesome.me/webawesome/dist/components/dialog/dialog.js';
    import { refresh } from '../lib/api';
    const $ = (id: string) => document.getElementById(id) as HTMLElement;
    type Dlg = HTMLElement & { open: boolean };
    document.querySelectorAll<HTMLElement>('[data-close]').forEach((b) => (b.onclick = () => (($(b.dataset.close!) as Dlg).open = false)));
    const loadErr = $('load-err');
    $('load-err-retry').onclick = () => { refresh().catch(() => {}); };
    window.addEventListener('wfc:error', () => { loadErr.hidden = false; });
    window.addEventListener('wfc:data', () => { loadErr.hidden = true; });
  </script>
</body>
</html>
```

- [ ] **Step 10: 전체 테스트 통과 확인**

Run: `npm test`
Expected: 단위 전부 PASS(shell-labels 4, tokens-scope 1 포함), 빌드 성공, dist 검사 전부 PASS(섬 테스트 포함)

- [ ] **Step 11: 커밋**

```bash
git add src/react/ThemeRoot.tsx src/react/useData.ts src/react/useAdmin.ts src/react/useMe.ts src/react/shell/labels.ts src/react/shell/TopbarActions.tsx src/layouts/Shell.astro src/styles/tokens.css tests/unit/shell-labels.test.mjs tests/unit/tokens-scope.test.mjs tests/build/dist.test.mjs
git diff --cached --stat
git commit -m "feat(antd): 상단바 이름·관리자 버튼과 두 모달·토스트를 React 섬으로

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DaDPzugZyKUdGnpyTH5KY4"
```

### Task 3: 눌러서 확인 · 크기 · 배포 (컨트롤러가 직접)

구현 서브에이전트에 맡기지 않는다. 브라우저 확인 도구(`scratchpad/cdp.mjs`)와 시나리오가 레포 밖 scratchpad에 있다.
`S=/private/tmp/claude-501/-Users-junyoungkim/707543c0-f7f4-4fed-b000-a90da8893c64/scratchpad`

- [ ] **Step 1: 로컬 미리보기**

```bash
cd "/Users/junyoungkim/Documents/프로젝트/개발/weekly-fc" && npm run build && npx astro preview --port 4399
```

- [ ] **Step 2: 0단계 시나리오** — `$S/steps-antd0.mjs`(이 태스크에서 만든 파일)

확인 항목:
1. JS를 끈 첫 페인트에서 `#admin-btn`이 알약(9999px)·34px — 스타일 없는 순간이 없다(스펙 §7.1-2)
2. 홈 「내 선수」 타일 → 이름 모달이 열린다(`#pick-me` → `#me-btn` 연결)
3. Esc로 닫힌다
4. 이름 모달: 카드 면 `rgb(24, 24, 24)`·모서리 16px, 닫기 버튼 32×32(전역 `button` 규칙이 안 샘)
5. 이름을 고르면 버튼 글자 = 이름, `localStorage.wfc_me` 저장, 모달 닫힘. 「지우기」 → 「이름」
6. 관리자 → PIN 모달, 포커스가 `#pin-input`, Esc로 닫히고 포커스가 `#admin-btn`으로 돌아온다(PIN은 넣지 않는다)
7. `window.wfcToast('…')` → `.ant-message-notice`에 글자, `.wfc` 안
8. 화면의 모든 `.ant-btn`·`.ant-input`이 `.wfc` 안
9. 상단바 버튼 높이 34, 오른쪽 끝이 화면 안, 가로 넘침 0

```bash
node $S/cdp.mjs "http://localhost:4399/weekly-fc/" "$S/shots/antd0-d.png" 1280 800 0 "$S/steps-antd0.mjs"
node $S/cdp.mjs "http://localhost:4399/weekly-fc/" "$S/shots/antd0-m.png" 390 844 1 "$S/steps-antd0.mjs"
```

Expected: 두 폭 모두 FAIL 0

- [ ] **Step 3: 기존 시나리오 회귀**

`steps-strip.mjs`의 토스트 확인은 `#toast` 대신 `.ant-message-notice`를 읽게 바꾼다(이 태스크에서 수정).

```bash
node $S/cdp.mjs "http://localhost:4399/weekly-fc/" "" 1280 800 0 "$S/steps-t10.mjs"
node $S/cdp.mjs "http://localhost:4399/weekly-fc/" "" 390 844 1 "$S/steps-t10.mjs"
node $S/cdp.mjs "http://localhost:4399/weekly-fc/match/" "" 390 844 1 "$S/steps-t11.mjs"
node $S/cdp.mjs "http://localhost:4399/weekly-fc/squad/" "" 390 844 1 "$S/steps-fix.mjs"
node $S/cdp.mjs "http://localhost:4399/weekly-fc/squad/" "" 390 844 1 "$S/steps-strip.mjs"
```

Expected: 배포 전 기준(t10 23/23, t11 15/15, fix 13/13, strip 20/20)과 같다

- [ ] **Step 4: 크기**

```bash
node $S/page-js.mjs "/Users/junyoungkim/Documents/프로젝트/개발/weekly-fc"
```

스펙 §7.1 기준선(홈 JS gzip 42,667B·CSS 13,037B …)과 나란히 표로 남긴다. 멈춤 기준은 없다(스펙 §1 무게). 빌드 시간도 적는다.

- [ ] **Step 5: 최종 리뷰 → main 병합 → push → 배포 확인**

```bash
git checkout main && git merge --no-ff antd-0-foundation -m "merge: Ant Design 0단계 — 테마·CSS 추출·상단바 섬

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DaDPzugZyKUdGnpyTH5KY4"
npm test
git push origin main
gh run watch "$(gh run list --workflow deploy.yml --limit 1 --json databaseId -q '.[0].databaseId')" --exit-status
```

- [ ] **Step 6: 실사이트 재확인**

```bash
CDP_BASE=https://byjunyoung.github.io/weekly-fc node $S/cdp.mjs "https://byjunyoung.github.io/weekly-fc/" "" 390 844 1 "$S/steps-antd0.mjs"
CDP_BASE=https://byjunyoung.github.io/weekly-fc node $S/cdp.mjs "https://byjunyoung.github.io/weekly-fc/" "" 1280 800 0 "$S/steps-t10.mjs"
node $S/cdp.mjs "https://byjunyoung.github.io/weekly-fc/squad/" "" 390 844 1 "$S/steps-strip.mjs"
```

Expected: Step 2·3과 같은 결과

- [ ] **Step 7: 메모리 갱신** — `weekly-fc-portal.md`에 0단계 배포 커밋·크기·남은 확인(관리자 PIN 로그인은 사용자가)을 적는다.
