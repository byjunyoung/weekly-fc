# 도트 리프레시 3단계(운영 톤 + 전역 모서리) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (1) 사이트 전역의 모서리를 0으로 내려 알약 버튼·둥근 패널을 없앤다. (2) 운영 페이지(`/rules/`)의 짧은 라벨(소제목·앵커 내비)만 갈무리로 옮긴다 — 긴 한글 본문은 그대로 둔다.

**Architecture:** 모서리는 **토큰 값만** 바꾼다(`tokens.css`의 `--r-*` 네 개). 이 토큰을 읽는 수십 개 규칙은 손대지 않는다. antd는 별도 체계라 `src/react/theme.ts`의 반경도 같은 값으로 맞춘다. 운영 페이지 톤은 그 페이지의 scoped `<style>`(`src/pages/rules.astro`)과 `.tabs` 규칙 한 줄이 전부다.

**Tech Stack:** Astro + React 19 + antd, CSS 토큰. 헤드리스 Chrome(CDP)으로 실측. 새 의존성 없음.

**Spec:** `docs/superpowers/specs/2026-09-21-pixel-refresh-design.md` — §3 "모서리 — [2026-09-21 3단계] 전역 0", §4 운영 "[2026-09-21 3단계 — 톤 적용 확정]"

## Global Constraints

- 갈무리를 새로 거는 **모든** 선택자에 `font-synthesis: none`과 `letter-spacing: 0`을 같이 건다. 장식이 아니라 실측으로 당한 버그의 방지책이다 — 이 폰트는 굵기가 400 하나뿐이라 600/700을 요구하면 브라우저가 가짜 굵게를 합성해 흐려지는데, `getComputedStyle`·`document.fonts.check()`는 전부 정상이라고 보고한다.
- 갈무리 크기는 `--fs-pixel-*`(20/30/40/60px)만 쓴다.
- `--r-*` **토큰 이름은 바꾸지 않는다.** 값만 0으로 — 되돌리기를 한 줄로 남기기 위해서다.
- 기능 변경 금지. 운영 페이지의 벌금·봉사 동작은 건드리지 않는다.
- 새 npm 의존성 금지. `npm test`(unit+build+dist) 통과.

---

### Task 1: 전역 모서리 0

**Files:**
- Modify: `src/styles/tokens.css` (60행 부근, `--r-*` 한 줄)
- Modify: `src/react/theme.ts` (반경 여섯 자리 + 낡은 주석 셋)

**Interfaces:**
- Produces: 사이트 전역에서 `border-radius`가 0이 된다. Task 2는 이 결과에 기대지 않는다(독립).
- Consumes: 없음.

- [ ] **Step 1: `src/styles/tokens.css` — 반경 토큰 값만 0으로**

바꾸기 전:
```css
  --r-sm: 4px; --r-md: 8px; --r-lg: 16px; --r-full: 9999px;
```
바꾼 뒤:
```css
  /* 도트 톤 — 모서리는 전부 0(2026-09-21 3단계). 토큰 이름은 유지해 되돌리기를 한 줄로 남긴다. */
  --r-sm: 0; --r-md: 0; --r-lg: 0; --r-full: 0;
```

이 토큰을 읽는 다른 규칙들은 **하나도 건드리지 않는다.**

- [ ] **Step 2: `src/react/theme.ts` — antd 반경도 같은 값으로**

antd는 자기 토큰 체계라 위 CSS 토큰을 안 읽는다. 안 맞추면 antd 부품(버튼·모달·표 머리·Segmented)만 둥글게 남는다.

(2-1) 전역 반경 — 바꾸기 전:
```ts
    borderRadiusSM: 4,
    borderRadius: 8,
    borderRadiusLG: 16,
```
바꾼 뒤:
```ts
    borderRadiusSM: 0,
    borderRadius: 0,
    borderRadiusLG: 0,
```

(2-2) Button — 바꾸기 전:
```ts
      borderRadius: 9999, borderRadiusSM: 9999, borderRadiusLG: 9999,
```
바꾼 뒤:
```ts
      borderRadius: 0, borderRadiusSM: 0, borderRadiusLG: 0,
```

(2-3) Modal — 바꾸기 전:
```ts
    Modal: { contentBg: '#181818', headerBg: '#181818', titleFontSize: 22, fontWeightStrong: 400, borderRadiusLG: 16 },
```
바꾼 뒤:
```ts
    Modal: { contentBg: '#181818', headerBg: '#181818', titleFontSize: 22, fontWeightStrong: 400, borderRadiusLG: 0 },
```

(2-4) Table — 바꾸기 전:
```ts
      headerBorderRadius: 8, cellPaddingInlineSM: 16, cellPaddingBlockSM: 13, fontWeightStrong: 600,
```
바꾼 뒤:
```ts
      headerBorderRadius: 0, cellPaddingInlineSM: 16, cellPaddingBlockSM: 13, fontWeightStrong: 600,
```

(2-5) Segmented — 바꾸기 전:
```ts
      borderRadius: 9999, borderRadiusSM: 9999, borderRadiusXS: 9999, fontSize: 12,
```
바꾼 뒤:
```ts
      borderRadius: 0, borderRadiusSM: 0, borderRadiusXS: 0, fontSize: 12,
```

- [ ] **Step 3: 낡아진 주석 셋 고치기**

`theme.ts`의 주석이 이제 사실과 다르다. 각각 "알약"·"모서리 16"·"모서리 --r-md"를 실제 값에 맞게 고친다. 주석의 나머지 내용(높이·여백·글자 크기 설명)은 그대로 둔다.

- Button 위 주석의 `(알약, 높이 40, 좌우 22, 14px·500)` → `(각진 모서리, 높이 40, 좌우 22, 14px·500)`
- Modal 위 주석의 `모서리 16` → `모서리 0`
- Table 위 주석의 `모서리 --r-md` → `모서리 0`
- Segmented 위 주석의 `지금 .chip / .chip.on(알약, 12px, ...)` → `지금 .chip / .chip.on(각진 모서리, 12px, ...)`

- [ ] **Step 4: 빌드하고 네 화면에서 실측**

`prebuild`가 `theme.ts`를 읽어 antd CSS를 다시 뽑는다. 반드시 다시 빌드해야 반영된다.

```bash
npm run build && npm run preview
```
(포트는 preview 출력에서 읽는다. base 경로는 `/weekly-fc`.)

아래를 재서 **전부 `0px`인지** 확인한다 — steps 파일로:

```js
export default async function (c, check) {
  const got = await c.evaluate(`(() => {
    const pick = (sel) => { const el = document.querySelector(sel); return el ? getComputedStyle(el).borderTopLeftRadius : 'no-el'; };
    return JSON.stringify({
      topbarBtn: pick('.topbar-act button'),
      chip: pick('.chip'),
      tblWrap: pick('.tbl-wrap'),
      antdBtn: pick('.ant-btn'),
      antdTableHeaderCell: pick('.ant-table-thead th'),
      segmented: pick('.ant-segmented'),
    });
  })()`);
  check('반경', true, got);
}
```

운영 페이지(`/weekly-fc/rules/`)에서 한 번, 스쿼드(`/weekly-fc/squad/`)에서 한 번 잰다(스쿼드에 Segmented·Table이 있다). `no-el`이 나오는 항목은 그 페이지에 없는 것이니 다른 페이지에서 확인한다.

- [ ] **Step 5: 눈으로 확인 — 전역 변경이라 다른 화면 회귀가 진짜 위험이다**

네 화면을 데스크톱으로 찍어 본다: `/weekly-fc/`(홈), `/weekly-fc/rules/`(운영), `/weekly-fc/squad/`(스쿼드), `/weekly-fc/squad/2/`(선수 상세).

```bash
node /private/tmp/claude-501/-Users-junyoungkim/707543c0-f7f4-4fed-b000-a90da8893c64/scratchpad/cdp.mjs "<url>" /tmp/3-<이름>.png 1280 1000 0
```

확인할 것:
- 버튼·칩·배지·표·패널 모서리가 전부 각졌다.
- **선수 상세의 능력치 막대(`.attr-bar`)가 각져도 깨져 보이지 않는다** — 둥근 끝이 의도였던 자리라 여기가 제일 위험하다. 이상하면 보고에 적는다(고치는 건 이번 범위 밖).
- 아바타 편집 모달(선수 상세에서 초상 클릭)도 각졌고 레이아웃이 안 깨졌다.
- 어느 화면에서도 가로 스크롤이 안 생긴다(`cdp.mjs`가 찍는 `overflow` 목록이 비어 있어야 한다).
- 끝나면 서버를 종료한다.

- [ ] **Step 6: 테스트 + 커밋**

```bash
npm test
git add src/styles/tokens.css src/react/theme.ts
git commit -m "$(cat <<'MSG'
style: 모서리를 전역 0으로 — 알약 버튼·둥근 패널 제거

토큰 값만 내리고 이름은 유지해 되돌리기를 한 줄로 남긴다. antd 는 별도
토큰 체계라 theme.ts 의 반경(버튼·모달·표 머리·Segmented)도 같이 맞춘다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DaDPzugZyKUdGnpyTH5KY4
MSG
)"
```

---

### Task 2: 운영 페이지 — 소제목·앵커 내비만 도트로

**Files:**
- Modify: `src/pages/rules.astro` (하단 scoped `<style>` 블록)
- Modify: `src/styles/tokens.css` (`.tabs a, .tabs button` 규칙)

**Interfaces:**
- Consumes: 기존 토큰(`--font-pixel`·`--fs-pixel-sm`). Task 1과 독립이다(모서리와 무관).
- Produces: 없음(페이지 말단 표현).

- [ ] **Step 1: `src/pages/rules.astro` — 소제목을 갈무리로, 강조 막대를 두껍게**

바꾸기 전:
```css
  .prose h2 { font-size: var(--fs-sm); letter-spacing: .06em; text-transform: uppercase; margin: 0 0 var(--m-md); }
  .prose h2::after { content: ""; display: block; width: var(--w-accent); height: var(--h-accent); background: var(--accent); margin-top: var(--m-sm); }
```
바꾼 뒤:
```css
  /* 소제목만 갈무리 — 본문(p·li)은 긴 한글이라 그대로 둔다(스펙 §3 폰트 절).
     letter-spacing 은 반드시 0: 비트맵 폰트는 자간이 붙으면 픽셀 격자에서 밀려 흐려진다. */
  .prose h2 { font-family: var(--font-pixel); font-size: var(--fs-pixel-sm); font-weight: var(--fw-body); font-synthesis: none; letter-spacing: 0; line-height: 1.2; margin: 0 0 var(--m-md); }
  .prose h2::after { content: ""; display: block; width: var(--w-accent); height: 4px; background: var(--accent); margin-top: var(--m-sm); }
```

- [ ] **Step 2: `src/styles/tokens.css` — 앵커 내비도 갈무리로**

`.tabs` 규칙은 지금 운영 페이지에서만 쓰인다(`grep -rn 'class="tabs"' src/`로 확인 가능).

이 규칙은 세 줄에 걸쳐 있고 **가운데 줄에 이미 `font-size`가 있다** — 새로 더하지 말고 그 줄을 통째로 갈아 끼운다.

바꾸기 전:
```css
.tabs a, .tabs button { min-height: 0; padding: var(--s-sm) var(--s-md); border: 0; border-radius: 0; background: none;
  color: var(--muted); font-size: var(--fs-sm); font-weight: var(--fw-strong); white-space: nowrap; margin-bottom: -1px;
  border-bottom: 2px solid transparent; }
```
바꾼 뒤:
```css
.tabs a, .tabs button { min-height: 0; padding: var(--s-sm) var(--s-md); border: 0; border-radius: 0; background: none;
  color: var(--muted); font-family: var(--font-pixel); font-size: var(--fs-pixel-sm); font-weight: var(--fw-body); font-synthesis: none; letter-spacing: 0; white-space: nowrap; margin-bottom: -1px;
  border-bottom: 2px solid transparent; }
```

굵기를 `--fw-strong`(600)에서 `--fw-body`로 내리는 것도 같은 이유다 — 갈무리에 없는 굵기를 요구하지 않는다.

- [ ] **Step 3: 빌드하고 눈으로 확인**

```bash
npm run build && npm run preview
```

운영 페이지를 데스크톱·모바일로 찍는다:
```bash
node /private/tmp/claude-501/-Users-junyoungkim/707543c0-f7f4-4fed-b000-a90da8893c64/scratchpad/cdp.mjs "http://localhost:<포트>/weekly-fc/rules/" /tmp/3-ops-desktop.png 1280 1600 0
node /private/tmp/claude-501/-Users-junyoungkim/707543c0-f7f4-4fed-b000-a90da8893c64/scratchpad/cdp.mjs "http://localhost:<포트>/weekly-fc/rules/" /tmp/3-ops-mobile.png 390 1400 1
```

확인할 것:
- 소제목 여섯 개(언제 어디서·참여 방법·비용·벌금·봉사·모임 통장·에티켓)가 도트 폰트로 **또렷하다**. 흐리면 가짜 굵게가 합성된 것이니 `font-weight`/`font-synthesis`를 다시 본다.
- 앵커 내비 여섯 항목도 도트 폰트다. 모바일에서 한 줄에 안 들어가면 가로 스크롤이 되는 것이 정상이다(`.tabs`에 `overflow-x: auto`가 원래 있다) — **단 페이지 전체가 가로로 넘치면 안 된다**(`cdp.mjs`의 `overflow` 목록이 비어 있어야 한다).
- 본문(불릿·번호 목록·문단)은 **여전히 기존 폰트**다. 여기까지 도트로 바뀌었으면 선택자가 너무 넓게 걸린 것이다.
- 강조 막대가 4px로 두꺼워졌다.
- 끝나면 서버를 종료한다.

- [ ] **Step 4: 테스트 + 커밋**

```bash
npm test
git add src/pages/rules.astro src/styles/tokens.css
git commit -m "$(cat <<'MSG'
style(rules): 운영 소제목·앵커 내비를 갈무리로, 강조 막대 4px

본문(긴 한글 규칙 문단)은 그대로 둔다 — 폰트 무게 때문에 적용 범위를 짧은
라벨로 좁게 유지한다는 원칙.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DaDPzugZyKUdGnpyTH5KY4
MSG
)"
```

---

## Controller 최종 검증 (SDD 최종 리뷰 전, 컨트롤러가 직접)

- `npm test` 전체 통과.
- 네 화면(홈·운영·스쿼드·선수 상세)을 직접 띄워 **확대 스크린샷**으로 본다 — 전역 변경이라 아직 차례가 안 온 화면의 회귀가 이번 단계의 진짜 위험이다.
- 도트 글자가 흐린지는 계산된 스타일로 안 잡힌다. 소제목을 확대해 글리프 경계를 본다(1a·1b에서 두 번 당함).
- 관리자 기능(벌금 추가·납부·봉사 수정)은 PIN이 필요해 사람만 확인할 수 있다 — 톤 작업이라 동작에는 영향이 없어야 하지만, 모달이 각진 뒤 레이아웃이 안 깨졌는지는 아바타 편집 모달로 대신 확인한다.
