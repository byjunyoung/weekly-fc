# 도트 리프레시 4b단계(전역 마감) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 모든 화면에 걸쳐 있는 공통 부품(탑바·버튼·칩·뱃지·표 머리·모달·폼 라벨)을 갈무리 20px로 통일해, 화면마다 도트와 보통 글꼴이 섞이던 것을 끝낸다.

**Architecture:** 크기는 `theme.ts`(antd)와 `tokens.css`(직접 만든 부품)에서 각각 정하고, **글꼴은 항상 `tokens.css`에서** 건다 — antd는 컴포넌트 토큰으로 글꼴을 안 정해 준다. 마크업·동작은 건드리지 않는다.

**Tech Stack:** Astro + React 19 + antd, CSS 토큰. 헤드리스 Chrome(CDP)으로 실측. 새 의존성 없음.

**Spec:** `docs/superpowers/specs/2026-09-21-pixel-refresh-design.md` §9 "4b단계 — 전역 마감"

## Global Constraints

- 갈무리를 새로 거는 **모든** 선택자에 `font-synthesis: none`과 `letter-spacing: 0`을 같이 걸고, 굵기는 폰트에 실제로 있는 값(`--fw-body`)으로 내린다. 600/700을 요구하면 브라우저가 가짜 굵게를 합성해 흐려지는데 `getComputedStyle`은 정상이라고 보고한다.
- 갈무리 크기는 `--fs-pixel-*`(20/30/40/60px)만. **갈무리를 건 선택자에 10의 배수가 아닌 크기를 덮어쓰는 미디어쿼리 오버라이드가 남아 있으면 안 된다.**
- 크기를 두 군데서 정하지 않는다 — antd 부품은 `theme.ts`가 크기, `tokens.css`가 글꼴.
- 계속 Pretendard로 두는 것: 긴 한글 본문, 선수 이름(`.pcard-name`), 표 본문의 이름·날짜 같은 내용, 아바타 편집 모달의 부품 버튼.
- 마크업·동작 변경 금지. 새 npm 의존성 금지. `npm test` 통과.

---

### Task 1: 탑바와 컨트롤(버튼·칩)

**Files:**
- Modify: `src/styles/tokens.css` (`.mark`·`.topnav a`·전역 `button` 규칙·`.chip`, 그리고 antd 글꼴 규칙 블록 신규)
- Modify: `src/react/theme.ts` (Button·Segmented 크기)

**Interfaces:**
- Produces: `tokens.css` 파일 끝에 "antd 부품 위에 얹는 도트 톤" 주석 블록을 새로 만든다. Task 2가 같은 블록에 규칙을 더한다.

- [ ] **Step 1: 워드마크와 내비 링크**

바꾸기 전:
```css
.mark { font-size: var(--fs-h-lg); font-weight: var(--fw-heavy); letter-spacing: .01em; white-space: nowrap; }
```
바꾼 뒤:
```css
.mark { font-family: var(--font-pixel); font-size: var(--fs-pixel-md); font-weight: var(--fw-body); font-synthesis: none; letter-spacing: 0; white-space: nowrap; }
```

바꾸기 전:
```css
.topnav a { padding: var(--s-xs) var(--s-md); border-radius: var(--r-full); color: var(--muted);
  font-size: var(--fs-sm); font-weight: var(--fw-strong); white-space: nowrap;
```
바꾼 뒤:
```css
.topnav a { padding: var(--s-xs) var(--s-md); border-radius: var(--r-full); color: var(--muted);
  font-family: var(--font-pixel); font-size: var(--fs-pixel-sm); font-weight: var(--fw-body); font-synthesis: none; letter-spacing: 0; white-space: nowrap;
```
(이 규칙은 여러 줄이다. 위 두 줄만 갈아 끼우고 이어지는 `transition` 줄과 닫는 중괄호는 그대로 둔다.)

- [ ] **Step 2: 전역 버튼과 칩**

바꾸기 전:
```css
  min-height: 40px; padding: 10px 22px; border: 1px solid var(--hairline-strong); border-radius: var(--r-full);
  background: transparent; color: var(--fg); font-size: var(--fs-sm); font-weight: var(--fw-strong);
```
바꾼 뒤:
```css
  min-height: 40px; padding: 10px 22px; border: 1px solid var(--hairline-strong); border-radius: var(--r-full);
  background: transparent; color: var(--fg); font-family: var(--font-pixel); font-size: var(--fs-pixel-sm); font-weight: var(--fw-body); font-synthesis: none; letter-spacing: 0;
```

`.chip` 규칙은 두 줄이다 — 바꾸기 전:
```css
.chip { display: inline-flex; align-items: center; gap: var(--s-xs); min-height: 34px; padding: var(--s-xs) var(--s-md);
  border: 1px solid var(--hairline); border-radius: var(--r-full); background: var(--elevated);
```
바꾼 뒤(폰트 선언을 둘째 줄 끝에 더한다):
```css
.chip { display: inline-flex; align-items: center; gap: var(--s-xs); min-height: 34px; padding: var(--s-xs) var(--s-md);
  border: 1px solid var(--hairline); border-radius: var(--r-full); background: var(--elevated);
  font-family: var(--font-pixel); font-size: var(--fs-pixel-sm); font-weight: var(--fw-body); font-synthesis: none; letter-spacing: 0;
```
(원래 규칙의 나머지 줄에 `font-size`나 `font-weight`가 이미 있으면 **중복되지 않게 그쪽을 지운다.** 규칙 전체를 먼저 읽고 판단한다.)

- [ ] **Step 3: antd Button·Segmented 크기**

`src/react/theme.ts`에서 — 바꾸기 전:
```ts
      controlHeight: 40, paddingInline: 22, contentFontSize: 14,
      controlHeightSM: 34, paddingInlineSM: 16, contentFontSizeSM: 12,
```
바꾼 뒤:
```ts
      controlHeight: 40, paddingInline: 22, contentFontSize: 20,
      controlHeightSM: 36, paddingInlineSM: 16, contentFontSizeSM: 20,
```
(작은 버튼 높이를 34→36으로 올린다 — 20px 글자가 34px 안에서 잘릴 여지를 없앤다. Step 5에서 실측해 더 필요하면 40까지 올려도 된다.)

Segmented — 바꾸기 전:
```ts
      borderRadius: 0, borderRadiusSM: 0, borderRadiusXS: 0, fontSize: 12,
```
바꾼 뒤:
```ts
      borderRadius: 0, borderRadiusSM: 0, borderRadiusXS: 0, fontSize: 20,
```

- [ ] **Step 4: antd 글꼴 규칙 블록 신설**

`tokens.css` 맨 아래에 새 블록을 만든다:

```css
/* ══ antd 부품 위에 얹는 도트 톤(4b단계) ═══════════════════════
   antd 는 글꼴을 컴포넌트 토큰으로 안 정해 준다 — 크기는 theme.ts 가,
   글꼴은 여기가 정한다. 두 군데서 크기를 정하지 않는다. */
.ant-btn, .ant-segmented-item-label {
  font-family: var(--font-pixel); font-weight: var(--fw-body); font-synthesis: none; letter-spacing: 0;
}
```

- [ ] **Step 5: 빌드하고 실측 + 눈으로**

```bash
npm run build && npm run preview
```
(포트는 preview 출력에서 읽는다. base 경로는 `/weekly-fc`.)

steps 파일로 잰다:
```js
export default async function (c, check) {
  const got = await c.evaluate(`(() => {
    const m = (sel) => { const el = document.querySelector(sel); if (!el) return 'no-el';
      const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
      return cs.fontFamily.split(',')[0] + ' ' + cs.fontSize + ' h' + Math.round(r.height) + ' sh' + el.scrollHeight; };
    return JSON.stringify({ mark: m('.mark'), nav: m('.topnav a'), actBtn: m('.topbar-act button'), chip: m('.chip') });
  })()`);
  check('탑바·컨트롤', true, got);
}
```
기대: 전부 `Galmuri9`, 크기는 워드마크 30px·나머지 20px. **`h`(실제 높이)가 `sh`(내용 높이)보다 작으면 글자가 잘린 것**이니 `controlHeightSM`을 올린다.

스크린샷: 홈·스쿼드·운영을 데스크톱(1280)과 모바일(390)로 찍는다. 확인할 것:
- 탑바의 워드마크·내비·이름/관리자 버튼이 도트로 또렷하고 **세로로 안 잘린다**.
- 모바일에서 탑바가 두 줄로 접히더라도 **가로로 넘치지 않는다**(`cdp.mjs`의 `overflow` 목록이 비어 있어야 한다).
- 스쿼드의 인원수 칩(5~11)·포메이션·「자동 배치」 버튼이 커진 글자에도 한 줄에 들어간다. 넘치면 보고에 적는다.
- 운영 페이지의 「오픈카톡 →」 칩도 확인.
- 끝나면 서버를 종료한다.

- [ ] **Step 6: 테스트 + 커밋**

```bash
npm test
git add src/styles/tokens.css src/react/theme.ts
git commit -m "$(cat <<'MSG'
style: 탑바·버튼·칩을 갈무리 20px 로 (워드마크 30px)

antd 는 글꼴을 토큰으로 안 정해 주므로 크기는 theme.ts, 글꼴은 tokens.css
에서 건다. 작은 버튼 높이는 34→36 으로 올려 20px 글자가 안 잘리게 했다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DaDPzugZyKUdGnpyTH5KY4
MSG
)"
```

---

### Task 2: 뱃지·표 머리·모달·폼 라벨

**Files:**
- Modify: `src/styles/tokens.css` (`.pos`·`.val`·`.label`, `.attr-list .val` 삭제, antd 블록에 규칙 추가)
- Modify: `src/react/theme.ts` (Modal `titleFontSize`)

**Interfaces:**
- Consumes: Task 1이 만든 `tokens.css` 맨 아래 antd 블록. 거기에 선택자를 **더한다**(새 블록을 또 만들지 않는다).

- [ ] **Step 1: 포지션·값 뱃지**

바꾸기 전:
```css
.val { display: inline-block; min-width: 2.4em; padding: 2px var(--s-xs); border-radius: var(--r-sm);
  text-align: center; font-variant-numeric: tabular-nums; font-weight: var(--fw-heavy); }
```
바꾼 뒤:
```css
.val { display: inline-block; min-width: 2.4em; padding: 2px var(--s-xs); border-radius: var(--r-sm);
  text-align: center; font-variant-numeric: tabular-nums; font-family: var(--font-pixel); font-size: var(--fs-pixel-sm); font-weight: var(--fw-body); font-synthesis: none; letter-spacing: 0; }
```

`.pos` 규칙도 같은 방식으로 갈무리 20px를 건다. 규칙 전체를 먼저 읽고, 기존 `font-size`/`font-weight`가 있으면 **중복 없이 교체**한다.

- [ ] **Step 2: 4단계에서 좁혀 뒀던 중복 규칙 삭제**

`.val`이 이제 전역으로 갈무리가 됐으므로 아래 규칙은 중복이다. 주석 줄까지 **통째로 지운다**:
```css
/* 능력치 목록의 값 뱃지만 갈무리로 — .val 은 스쿼드 표도 쓰므로 전역으로 키우지 않는다. */
.attr-list .val { font-family: var(--font-pixel); font-size: var(--fs-pixel-sm); font-weight: var(--fw-body); font-synthesis: none; letter-spacing: 0; }
```

- [ ] **Step 3: 폼 그룹 라벨**

바꾸기 전:
```css
.label { display: block; font-size: var(--fs-xs); font-weight: var(--fw-strong); color: var(--muted); letter-spacing: .02em; }
```
바꾼 뒤:
```css
.label { display: block; font-family: var(--font-pixel); font-size: var(--fs-pixel-sm); font-weight: var(--fw-body); font-synthesis: none; letter-spacing: 0; color: var(--muted); }
```

- [ ] **Step 4: 모달 제목 크기**

`src/react/theme.ts` — 바꾸기 전:
```ts
    Modal: { contentBg: '#181818', headerBg: '#181818', titleFontSize: 22, fontWeightStrong: 400, borderRadiusLG: 0 },
```
바꾼 뒤:
```ts
    Modal: { contentBg: '#181818', headerBg: '#181818', titleFontSize: 20, fontWeightStrong: 400, borderRadiusLG: 0 },
```

- [ ] **Step 5: antd 블록에 선택자 추가**

Task 1이 만든 `tokens.css` 맨 아래 antd 블록의 선택자 목록에 세 개를 **더한다**(따로 블록을 만들지 않는다). 결과는 이런 모양이 된다:

```css
.ant-btn, .ant-segmented-item-label, .ant-modal-title, .ant-descriptions-item-label, .ant-table-thead th {
  font-family: var(--font-pixel); font-weight: var(--fw-body); font-synthesis: none; letter-spacing: 0;
}
/* 표 머리·요약 라벨은 antd 가 크기를 안 내려 주는 자리라 여기서 같이 정한다. */
.ant-descriptions-item-label, .ant-table-thead th { font-size: var(--fs-pixel-sm); }
```

`.ant-modal-title`에는 크기를 주지 않는다 — Step 4의 `titleFontSize: 20`이 이미 정한다.

- [ ] **Step 6: 빌드하고 실측 + 눈으로 — 스쿼드 표가 이번 단계의 최대 위험이다**

```bash
npm run build && npm run preview
```

스쿼드 표 뷰(세그먼트에서 「표」를 **텍스트로 찾아** 클릭 — 이 페이지엔 `.chips` 세그먼트 그룹이 둘이라 인덱스로 고르면 안 된다)에서:
```js
export default async function (c, check) {
  const co = JSON.parse(await c.evaluate(`(() => { const el = [...document.querySelectorAll('.ant-segmented-item')].find(e => e.textContent.trim() === '표'); el.scrollIntoView({block:'center'}); const r = el.getBoundingClientRect(); return JSON.stringify([r.left+r.width/2, r.top+r.height/2]); })()`));
  await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: co[0], y: co[1], button: 'left', buttons: 1, clickCount: 1 });
  await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: co[0], y: co[1], button: 'left', buttons: 0, clickCount: 1 });
  await c.sleep(700);
  const got = await c.evaluate(`JSON.stringify({
    scrollW: document.documentElement.scrollWidth, innerW: innerWidth,
    tblScrollW: document.querySelector('.tbl-wrap, .ant-table-content')?.scrollWidth ?? -1,
    tblClientW: document.querySelector('.tbl-wrap, .ant-table-content')?.clientWidth ?? -1,
    rowH: Math.round(document.querySelector('.ant-table-tbody tr')?.getBoundingClientRect().height ?? -1),
    th: getComputedStyle(document.querySelector('.ant-table-thead th')).fontFamily.split(',')[0]
  })`);
  check('스쿼드 표', true, got);
}
```

판단 기준:
- `scrollW === innerW`여야 한다(페이지 가로 스크롤 없음). 표 자체가 안에서 가로 스크롤되는 것(`tblScrollW > tblClientW`)은 원래 `.tbl-wrap`에 `overflow-x: auto`가 있으므로 **허용**이다.
- `rowH`가 눈에 띄게 커졌다면 보고에 적는다.
- **페이지가 가로로 넘치면** 표 본문 뱃지만 물러선다 — 그때는 `.val`·`.pos`의 갈무리 선언을 지우는 대신 `.tbl .val, .tbl .pos { font-family: var(--font); font-size: var(--fs-sm); font-weight: var(--fw-heavy); }` 같은 되돌림 규칙을 antd 블록 아래에 추가하고 다시 잰다. 어느 쪽을 택했는지 보고에 명시한다.

스크린샷: 스쿼드(표·카드 뷰), 선수 상세(+아바타 편집 모달 열어서), 운영을 데스크톱·모바일로. 확인할 것:
- 표 머리·포지션 뱃지·값 뱃지가 도트로 또렷하고, 표 본문의 **이름·날짜는 기존 폰트 그대로**다.
- 모달 제목과 요약 줄 라벨(미납 벌금·봉사)이 도트이고, 값 쪽은 기존 폰트다.
- 아바타 편집 모달의 그룹 라벨(얼굴형·헤어·피부·눈·유니폼 색)이 도트이고, **부품 버튼 30여 개는 그대로**다.
- 끝나면 서버를 종료한다.

- [ ] **Step 7: 테스트 + 커밋**

```bash
npm test
git add src/styles/tokens.css src/react/theme.ts
git commit -m "$(cat <<'MSG'
style: 뱃지·표 머리·모달 제목·폼 라벨까지 갈무리 20px

.val 이 전역 도트가 되면서 4단계의 .attr-list .val 좁힘 규칙은 중복이라
지운다. 모달 제목 크기는 theme.ts 한 곳에서만 정한다(22→20).

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DaDPzugZyKUdGnpyTH5KY4
MSG
)"
```

---

## Controller 최종 검증 (SDD 최종 리뷰 전, 컨트롤러가 직접)

- `npm test` 전체 통과.
- 네 화면(홈·운영·스쿼드 3뷰·선수 상세 + 모달)을 데스크톱·모바일로 띄워 **확대 스크린샷**으로 본다 — 도트 글자가 흐린지는 계산된 스타일로 안 잡힌다.
- 탑바가 모바일에서 두 줄로 접힐 때 버튼이 잘리지 않는지 확인한다.
- 스쿼드 표에서 페이지 가로 스크롤이 생기지 않았는지 확인한다.
