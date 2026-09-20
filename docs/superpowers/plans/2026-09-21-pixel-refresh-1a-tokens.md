# 도트 리프레시 1a단계(토큰: 폰트+등급 단색화) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 갈무리(Galmuri) 도트 폰트를 제목·OVR·능력치 숫자에 적용하고, 선수 카드 등급(금/은/동) 배경을 그라디언트에서 단색으로 바꿔, 화면에서 실제로 눈에 보이는 도트 게임 톤의 첫 조각을 배포한다.

**Architecture:** 전부 `src/styles/tokens.css` 한 파일 안의 토큰·규칙 변경이다. 새 CSS 커스텀 프로퍼티(`--font-pixel`, `--fs-pixel-*`)를 추가하고, 정해진 소수의 선택자(`.page-head h1`, `.tile-big`, `.pcard-ovr`, `.bd-ovr`)에만 적용한다. 등급 배경은 기존 solid 토큰(`--gold`/`--silver`/`--bronze`)에 `--metal-*`을 다시 연결하는 것뿐이다. JS/TS 로직 변경은 없다.

**Tech Stack:** 순수 CSS, `@font-face`(jsDelivr CDN, 버전 고정), node:test(dist 통과 확인).

**Spec:** `docs/superpowers/specs/2026-09-21-pixel-refresh-design.md` §3(색 팔레트·폰트, 2026-09-21 갱신분), §5(1a단계)

## Global Constraints

- 색상(hue)은 하나도 새로 고르지 않는다 — `--pos-*`/`--val-*`/`--cond-*`는 완전히 그대로 둔다. 이 단계가 만지는 색은 등급 3개(`--metal-gold/silver/bronze`)뿐이고, 그마저 새 값이 아니라 이미 있는 `--gold`/`--silver`/`--bronze` solid 토큰에 연결하는 것이다.
- 갈무리는 `Galmuri9` 한 굵기만 쓴다(429KB, jsDelivr 버전 `2.40.3`에 고정 — `@latest`를 쓰지 않는다, 패키지가 나중에 깨지는 배포를 막기 위해서다).
- 갈무리를 적용하는 자리는 정확히 4곳(`.page-head h1`, `.tile-big`, `.pcard-ovr`, `.bd-ovr`, 각각의 모바일 오버라이드 포함)뿐이다 — 버튼·나비게이션 라벨·포지션 배지는 이번 단계 범위 밖이다(화면별 단계 몫).
- 기존 `--fs-*` 사다리(본문용)는 값·이름 둘 다 손대지 않는다 — 새 `--fs-pixel-*` 세트를 따로 둔다. 값은 갈무리9의 권장 렌더 크기(10px)의 배수여야 한다(20/30/40/60).
- `--font`(Pretendard, 캔버스 공유 이미지가 `getComputedStyle`로 읽는 토큰)는 값을 바꾸지 않는다 — 새 `--font-pixel` 토큰을 별도로 추가한다.
- `avatar.ts`/`share-image.ts`는 이 단계에서 전혀 손대지 않는다(이 둘이 `getComputedStyle`로 읽는 토큰 이름·값 어느 것도 이 단계에서 안 바뀐다 — `--tint`/`--line`/`--muted`/`--fg`/`--font`/`--canvas`/`--pos-*` 전부 그대로).
- iCloud 레포 주의: `git status`(전체 워킹트리 대상) 쓰지 않기. `npm install`/`npm uninstall` 실행하지 않기(새 의존성 없음, `@font-face`는 순수 CSS라 npm 패키지가 필요 없다).
- 커밋은 각 태스크 끝, `npm test` 통과 후에만.

---

### Task 1: 갈무리 폰트 토큰 + 제목·OVR·능력치 숫자 적용

**Files:**
- Modify: `src/styles/tokens.css` (토큰 추가 + 4개 선택자 + 모바일 오버라이드 2곳)
- Modify: `tests/build/dist.test.mjs` (새 통과 테스트)

**Interfaces:**
- Consumes: 없음.
- Produces: `--font-pixel`, `--fs-pixel-sm`(20px)/`--fs-pixel-md`(30px)/`--fs-pixel-lg`(40px)/`--fs-pixel-xl`(60px) — 2단계 이후 화면별 단계가 같은 이름으로 이어 쓴다.

- [ ] **Step 1: `:root` 블록에 갈무리 폰트 토큰·크기 세트 추가**

`src/styles/tokens.css`의 `:root` 블록 안, 현재 폰트 섹션(아래 내용이 있는 자리 — `--font:` 줄부터 `--fs-hero` 줄까지) 바로 뒤에 새 줄을 추가한다. 현재:

```css
  --fs-md: var(--fs-body); --fs-lg: var(--fs-h-lg); --fs-xl: var(--fs-h-xl);
  --fs-xxl: var(--fs-display-md); --fs-hero: var(--fs-display-md); --fs-ovr: 56px;
```

아래로 바꾼다(이 두 줄 뒤에 새 블록 추가):

```css
  --fs-md: var(--fs-body); --fs-lg: var(--fs-h-lg); --fs-xl: var(--fs-h-xl);
  --fs-xxl: var(--fs-display-md); --fs-hero: var(--fs-display-md); --fs-ovr: 56px;

  /* ── 도트 폰트(갈무리) — 제목·OVR·능력치 숫자 전용, 본문(--font)은 그대로 ─────
     갈무리9 권장 렌더 크기는 10px다. 그 배수가 아닌 크기로 쓰면 비트맵이 흐려져
     도트를 쓰는 의미가 없어진다 — 그래서 본문용 --fs-* 사다리와 별도로 10의
     배수만 담은 세트를 둔다(2026-09-21 리프레시 스펙 §3). */
  --font-pixel: "Galmuri9", var(--font);
  --fs-pixel-sm: 20px; --fs-pixel-md: 30px; --fs-pixel-lg: 40px; --fs-pixel-xl: 60px;
```

- [ ] **Step 2: `@font-face` 추가**

파일 맨 위, 첫 줄(`/* src/styles/tokens.css — 색·치수·글자의 유일한 출처 */`) 바로 뒤에 추가한다:

```css
@font-face {
  font-family: "Galmuri9";
  src: url("https://cdn.jsdelivr.net/npm/galmuri@2.40.3/dist/Galmuri9.woff2") format("woff2");
  font-display: swap;
}
```

- [ ] **Step 3: `.page-head h1` — 제목에 적용**

현재:

```css
.page-head h1 { font-size: var(--fs-display-lg); font-weight: var(--fw-display); line-height: 1.2; letter-spacing: 0; }
.page-head h1 .muted { font-size: var(--fs-h-md); font-weight: var(--fw-body); }
```

아래로 바꾼다(`.page-head h1 .muted`는 안 바꾼다 — 부제 숫자는 이 단계 범위 밖):

```css
.page-head h1 { font-family: var(--font-pixel); font-size: var(--fs-pixel-lg); font-weight: var(--fw-display); line-height: 1.2; letter-spacing: 0; }
.page-head h1 .muted { font-size: var(--fs-h-md); font-weight: var(--fw-body); }
```

`body.wide .page-head h1 { font-size: var(--fs-h-lg); }` 줄은 그대로 둔다(좁은 화면 축약 규칙 — 이 단계 범위 밖).

- [ ] **Step 4: `.tile-big` — 홈 대시보드 큰 숫자에 적용**

현재:

```css
.tile-big { margin-top: auto; font-size: var(--fs-h-xl); font-weight: var(--fw-num); line-height: 1.1; letter-spacing: -.01em; font-variant-numeric: tabular-nums; }
```

아래로 바꾼다:

```css
.tile-big { margin-top: auto; font-family: var(--font-pixel); font-size: var(--fs-pixel-md); font-weight: var(--fw-num); line-height: 1.1; letter-spacing: -.01em; font-variant-numeric: tabular-nums; }
```

- [ ] **Step 5: `.pcard-ovr` — 선수 카드 OVR 숫자에 적용(데스크톱+모바일 카드벽)**

현재:

```css
.pcard-ovr { display: block; font-size: var(--fs-ovr); font-weight: var(--fw-num); line-height: .9; letter-spacing: -.03em; font-variant-numeric: tabular-nums; }
```

아래로 바꾼다:

```css
.pcard-ovr { display: block; font-family: var(--font-pixel); font-size: var(--fs-pixel-xl); font-weight: var(--fw-num); line-height: .9; letter-spacing: -.03em; font-variant-numeric: tabular-nums; }
```

모바일 카드벽 오버라이드, 현재:

```css
  .pcard-wall .pcard-ovr { font-size: 34px; }
```

아래로 바꾼다:

```css
  .pcard-wall .pcard-ovr { font-size: var(--fs-pixel-md); }
```

- [ ] **Step 6: `.bd-ovr` — 피치 슬롯 OVR 숫자에 적용(데스크톱+모바일)**

현재:

```css
.bd-ovr { font-size: var(--fs-h-md); font-weight: var(--fw-heavy); line-height: 1; font-variant-numeric: tabular-nums; }
```

아래로 바꾼다:

```css
.bd-ovr { font-family: var(--font-pixel); font-size: var(--fs-pixel-sm); font-weight: var(--fw-heavy); line-height: 1; font-variant-numeric: tabular-nums; }
```

모바일 오버라이드, 현재:

```css
  .bd-ovr { font-size: var(--fs-body); }
```

아래로 바꾼다:

```css
  .bd-ovr { font-size: var(--fs-pixel-sm); }
```

- [ ] **Step 7: 빌드 확인**

Run: `npm run build`
Expected: 빌드 성공(CSS 문법 오류 없음).

- [ ] **Step 8: dist 테스트 — 갈무리 폰트가 실제로 빌드에 실렸는지 확인**

Astro는 `tokens.css`(전역 스타일시트, `Shell.astro`가 import)를 `dist/_astro/`
아래 해시 붙은 파일명(예: `stats.DYR8bdlL.css` — 빌드마다 이름이 바뀐다)으로 번들한다.
`dist/antd.css`는 별도 파일(antd 부품 전용 추출본)이라 여기 안 든다 — 파일명이 아니라
`dist/_astro/*.css` 전체를 뒤져야 한다. `tests/build/dist.test.mjs` 맨 끝에 추가한다:

```js
test('갈무리 도트 폰트가 제목·OVR·능력치 숫자에 적용된다(1a단계, 2026-09-21 리프레시 스펙 §3)', () => {
  const files = readdirSync('dist/_astro', { withFileTypes: true }).filter((e) => e.name.endsWith('.css')).map((e) => `dist/_astro/${e.name}`);
  const hit = files.find((f) => readFileSync(f, 'utf8').includes('Galmuri9'));
  assert.ok(hit, 'Galmuri9 @font-face 를 담은 CSS 청크를 dist/_astro 에서 못 찾음');
  const css = readFileSync(hit, 'utf8');
  assert.ok(css.includes('--font-pixel'), '--font-pixel 토큰이 빌드된 CSS에 없음');
});
```

`tests/build/dist.test.mjs` 맨 위 import 줄에 `readdirSync`가 없으면 추가한다:

```js
import { existsSync, readdirSync, readFileSync } from 'node:fs';
```

(이미 `existsSync`/`readFileSync`는 있을 것이다 — `readdirSync`만 새로 필요하면 더한다.)

- [ ] **Step 9: 테스트 통과 확인**

Run: `npm test`
Expected: PASS.

- [ ] **Step 10: 컨트롤러용 셀프 체크 — 커밋 전에 직접 눈으로 한 번**

Run: `npm run preview` (또는 이미 떠 있는 프리뷰 서버 사용) 후 홈·선수상세·스쿼드 페이지를 열어 제목·OVR 숫자가 각진 도트 폰트로 바뀌었는지, 로드 실패로 기본 폰트에 조용히 떨어지진 않았는지 확인한다. 이건 자동화 테스트가 아니라 구현자 본인의 육안 확인이다 — 브라우저 도구가 없으면 `curl`로 CSS 안에 `Galmuri9` 폰트 패밀리가 실제 규칙에 걸려 있는지 다시 한번 확인하는 것으로 대신한다.

- [ ] **Step 11: 커밋**

```bash
git add src/styles/tokens.css tests/build/dist.test.mjs
git commit -m "feat(tokens): 갈무리 도트 폰트 — 제목·OVR·능력치 숫자에 적용"
```

---

### Task 2: 등급(금/은/동) 카드 배경 — 그라디언트를 단색으로

**Files:**
- Modify: `src/styles/tokens.css`
- Modify: `tests/build/dist.test.mjs`

**Interfaces:**
- Consumes: 없음.
- Produces: 없음(끝 지점).

- [ ] **Step 1: `--metal-*` 토큰을 solid 토큰에 연결**

현재:

```css
  --gold: #ffce21; --silver: #cfd6de; --bronze: #d69256;
  --metal-gold: linear-gradient(160deg, #ffe27a 0%, #ffce21 38%, #f5a623 68%, #ee8e00 100%);
  --metal-silver: linear-gradient(160deg, #ffffff 0%, #dfe5ec 38%, #b9c2cc 68%, #97a1ac 100%);
  --metal-bronze: linear-gradient(160deg, #ffd9ad 0%, #e4a76a 38%, #cc9460 68%, #c78247 100%);
  /* 브론즈 어두운 끝은 실측으로 올렸다 — #a96a34 에서는 먹글자 4.25, 보조 글자 3.51 로 미달이었다. */
```

아래로 바꾼다(등급 이름·주석은 남기되 값은 단색으로 — 대비는 이미 직접 계산해 확인됨: `--ink`(#121314) 대비 gold 12.49 · silver 12.69 · bronze 7.18, 전부 WCAG AA(4.5) 여유 통과):

```css
  --gold: #ffce21; --silver: #cfd6de; --bronze: #d69256;
  /* 도트 톤에선 매끈한 그라디언트 대신 단색 블록을 쓴다(2026-09-21 리프레시 스펙 §3) —
     위 solid 토큰에 그대로 연결한다. --ink(#121314) 대비 gold 12.49 · silver 12.69 ·
     bronze 7.18로 옛 그라디언트의 가장 어두운 끝(브론즈 4.25/3.51)보다 오히려 낫다. */
  --metal-gold: var(--gold);
  --metal-silver: var(--silver);
  --metal-bronze: var(--bronze);
```

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: 빌드 성공.

- [ ] **Step 3: dist 테스트 — 옛 그라디언트 문자열이 사라졌는지 확인**

`tests/build/dist.test.mjs` 맨 끝에 추가한다:

```js
test('등급 카드 배경이 그라디언트에서 단색으로 바뀐다(1a단계, 2026-09-21 리프레시 스펙 §3)', () => {
  const files = readdirSync('dist/_astro', { withFileTypes: true }).filter((e) => e.name.endsWith('.css')).map((e) => `dist/_astro/${e.name}`);
  const hit = files.find((f) => readFileSync(f, 'utf8').includes('--metal-gold'));
  assert.ok(hit, '--metal-gold 를 담은 CSS 청크를 dist/_astro 에서 못 찾음');
  const css = readFileSync(hit, 'utf8');
  assert.ok(!css.includes('linear-gradient(160deg'), '옛 등급 그라디언트가 아직 남아 있음');
});
```

(Task 1의 Step 8에서 이미 `dist/_astro` 안의 실제 CSS 청크 찾는 법을 확인했을 것이다 — 같은 방식을 쓴다. 파일 경로 패턴이 다르면 맞춰 고친다.)

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add src/styles/tokens.css tests/build/dist.test.mjs
git commit -m "style(pcard): 등급(금/은/동) 카드 배경 — 그라디언트를 단색 블록으로"
```

---

### Task 3 (컨트롤러 전용 — 서브에이전트에 위임하지 않는다): 브라우저 검증

**목적:** Task 1~2는 CSS가 빌드에 실제로 들어갔는지까지만 확인한다. 폰트가 정말 로드돼 렌더에
쓰이는지(실패 시 조용히 기본 폰트로 떨어지는 게 CSS `font-family` 폴백의 정상 동작이라
텍스트로는 구분이 안 된다), 등급 카드가 실제로 단색으로 보이는지는 헤드리스 브라우저로
직접 봐야 안다.

- [ ] **Step 1: `npm run build && npm run preview`로 로컬 서버**

- [ ] **Step 2: CDP로 확인**

기존 `cdp.mjs` 드라이버를 재사용해 아래를 전부 확인한다:

- 홈·선수상세·스쿼드 페이지의 `.page-head h1`, `.tile-big`, `.pcard-ovr`, `.bd-ovr` 요소의
  `getComputedStyle(...).fontFamily`가 실제로 `"Galmuri9"`를 포함하는지(폴백 Pretendard로
  안 떨어졌는지).
- 같은 요소들에서 `document.fonts.check('16px "Galmuri9"')` 같은 방식으로 폰트가 실제
  로드됐는지(네트워크 차단 등으로 로드 실패 시 폴백되는지도 별도로 한 번 확인 — 예:
  `Network.setBlockedURLs`로 jsDelivr 도메인을 막고 재로드해 폰트가 실패해도 레이아웃이
  안 깨지고 Pretendard로 자연스럽게 떨어지는지).
- 선수 카드(`.pcard-gold`/`.pcard-silver`/`.pcard-bronze`) 요소의
  `getComputedStyle(...).backgroundImage`가 `none`이고 `backgroundColor`가 각각
  `--gold`/`--silver`/`--bronze` 값인지(그라디언트가 실제로 안 남았는지).

- [ ] **Step 3: 최종 `npm test` 재확인**

이 태스크는 커밋을 만들지 않는다(검증만).
