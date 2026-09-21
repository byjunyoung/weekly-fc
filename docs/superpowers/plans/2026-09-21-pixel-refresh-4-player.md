# 도트 리프레시 4단계(선수상세 톤) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 선수 상세 화면의 글자를 도트로 마저 끌고 간다 — FC 아이템 카드의 포지션·능력치 숫자, 능력치 목록의 값 뱃지, antd 모달 제목과 요약 줄 라벨.

**Architecture:** 전부 표현 계층이다. 대부분 `tokens.css` 규칙에 갈무리 선언을 얹는 일이고, 모달 제목만 `theme.ts`의 크기 토큰을 같이 만져야 한다(antd는 별도 체계). 마크업·동작은 건드리지 않는다.

**Tech Stack:** Astro + React 19 + antd, CSS 토큰. 헤드리스 Chrome(CDP)으로 실측. 새 의존성 없음.

**Spec:** `docs/superpowers/specs/2026-09-21-pixel-refresh-design.md` §4 선수상세 "[2026-09-21 4단계 — 톤 적용 확정]"

## Global Constraints

- 갈무리를 새로 거는 **모든** 선택자에 `font-synthesis: none`과 `letter-spacing: 0`을 같이 건다. 실측으로 당한 버그의 방지책이다 — 이 폰트는 굵기가 400 하나뿐이라 600/700을 요구하면 브라우저가 가짜 굵게를 합성해 흐려지는데, `getComputedStyle`·`document.fonts.check()`는 전부 정상이라고 보고한다. 굵기도 폰트에 실제로 있는 값(`--fw-body`)으로 내린다.
- 갈무리 크기는 `--fs-pixel-*`(20/30/40/60px)만 쓴다. **갈무리를 건 선택자에 10의 배수가 아닌 크기를 덮어쓰는 오버라이드가 남아 있으면 안 된다** — 그게 이번 단계의 주요 함정이다(모바일 카드벽).
- `.val`을 전역으로 건드리지 않는다. 스쿼드 표(5단계)가 같은 클래스를 촘촘한 행에서 쓴다.
- 마크업·동작 변경 금지. 기능은 그대로.
- 새 npm 의존성 금지. `npm test`(unit+build+dist) 통과.

---

### Task 1: FC 카드와 능력치 목록

**Files:**
- Modify: `src/styles/tokens.css` (`.pcard-pos`·`.pcard-stat-val`·`.attr-list .val`, 그리고 모바일 카드벽 오버라이드 두 줄 삭제)

**Interfaces:**
- Produces: 없음(표현 말단). Task 2와 파일은 같지만 블록이 다르고 순서 의존도 없다.

- [ ] **Step 1: `.pcard-pos` — 포지션을 갈무리로**

바꾸기 전:
```css
.pcard-pos { display: block; font-size: var(--fs-h-lg); font-weight: var(--fw-heavy); line-height: 1.1; }
```
바꾼 뒤:
```css
.pcard-pos { display: block; font-family: var(--font-pixel); font-size: var(--fs-pixel-sm); font-weight: var(--fw-body); font-synthesis: none; letter-spacing: 0; line-height: 1.1; }
```

- [ ] **Step 2: `.pcard-stat-val` — 카드 안 능력치 숫자를 갈무리로**

바꾸기 전:
```css
.pcard-stat-val { font-size: var(--fs-h-md); font-weight: var(--fw-heavy); line-height: 1; font-variant-numeric: tabular-nums; min-width: 1.7em; }
```
바꾼 뒤:
```css
.pcard-stat-val { font-family: var(--font-pixel); font-size: var(--fs-pixel-sm); font-weight: var(--fw-body); font-synthesis: none; letter-spacing: 0; line-height: 1; font-variant-numeric: tabular-nums; min-width: 1.7em; }
```

- [ ] **Step 3: 모바일 카드벽 오버라이드 두 줄 삭제 — 이게 이번 단계의 핵심 함정이다**

`@media (max-width: 639px)` 블록 안에 아래 두 줄이 있다. **둘 다 지운다.** 남겨두면 갈무리가 18px·16px로 렌더돼 10px 격자에서 벗어나 흐려진다. 지우면 Step 1·2가 정한 20px를 그대로 물려받는다.

지울 것:
```css
  .pcard-wall .pcard-pos { font-size: var(--fs-h-md); }
```
```css
  .pcard-wall .pcard-stat-val { font-size: var(--fs-body); }
```

같은 블록의 다른 줄(`.pcard-wall .pcard-head`·`.pcard-ovr`·`.pcard-name`·`.pcard-portrait svg`)은 **그대로 둔다**. 특히 `.pcard-wall .pcard-name`은 건드리지 않는다 — 이름은 이번 범위가 아니다.

- [ ] **Step 4: `.attr-list .val` — 능력치 목록의 값 뱃지만 갈무리로**

`.val` 규칙 자체는 **건드리지 않는다.** 능력치 목록 안에서만 덮어쓰는 새 규칙을 `.attr-*` 규칙들 근처(`.attr-bar` 줄들 다음)에 추가한다:

```css
/* 능력치 목록의 값 뱃지만 갈무리로 — .val 은 스쿼드 표도 쓰므로 전역으로 키우지 않는다. */
.attr-list .val { font-family: var(--font-pixel); font-size: var(--fs-pixel-sm); font-weight: var(--fw-body); font-synthesis: none; letter-spacing: 0; }
```

- [ ] **Step 5: 빌드하고 세 폭에서 확인**

```bash
npm run build && npm run preview
```
(포트는 preview 출력에서 읽는다. base 경로는 `/weekly-fc`.)

찍을 것:
```bash
CDP=/private/tmp/claude-501/-Users-junyoungkim/707543c0-f7f4-4fed-b000-a90da8893c64/scratchpad/cdp.mjs
node "$CDP" "http://localhost:<포트>/weekly-fc/squad/2/" /tmp/4-pd-desktop.png 1280 1000 0
node "$CDP" "http://localhost:<포트>/weekly-fc/squad/2/" /tmp/4-pd-mobile.png 390 1100 1
```

그리고 스쿼드 카드 뷰도 본다(같은 `.pcard-*`를 쓰므로 여기서 회귀가 난다). `/weekly-fc/squad/`를 열고 세그먼트에서 「카드」를 텍스트로 찾아 클릭한 뒤 데스크톱·모바일로 찍는다.

확인할 것:
- 카드의 포지션(DF)과 능력치 숫자 여섯 개가 도트로 **또렷하다**. 흐리면 가짜 굵게이거나 크기가 10의 배수를 벗어난 것이다.
- 카드 폭(268px) 안에서 2열 능력치가 줄바꿈되거나 잘리지 않는다.
- **모바일 카드벽에서도 또렷하다** — Step 3의 오버라이드 삭제가 실제로 먹었는지가 여기서 드러난다. `getComputedStyle`로 `.pcard-wall .pcard-stat-val`의 `font-size`가 `20px`인지도 같이 재서 보고에 적는다.
- 능력치 목록(오른쪽)의 값 뱃지가 도트이고, 뱃지 폭 안에서 안 잘린다.
- **스쿼드 표 뷰의 `.val` 숫자는 안 바뀌었다**(표에서 「표」 세그먼트로 전환해 확인) — 바뀌었으면 선택자가 너무 넓게 걸린 것이다.
- 어느 폭에서도 가로 스크롤이 없다.
- 끝나면 서버를 종료한다.

- [ ] **Step 6: 테스트 + 커밋**

```bash
npm test
git add src/styles/tokens.css
git commit -m "$(cat <<'MSG'
style(player): FC 카드 포지션·능력치 숫자와 능력치 목록 값을 갈무리로

모바일 카드벽의 크기 오버라이드 두 줄은 지운다 — 18/16px 로 되돌리면
갈무리 10px 격자를 벗어나 흐려진다. .val 은 전역 대신 .attr-list 안에서만
덮어쓴다(스쿼드 표가 같은 클래스를 쓴다).

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DaDPzugZyKUdGnpyTH5KY4
MSG
)"
```

---

### Task 2: 모달 제목과 요약 줄 라벨

**Files:**
- Modify: `src/react/theme.ts` (Modal `titleFontSize`)
- Modify: `src/styles/tokens.css` (antd 선택자 두 개를 위한 새 규칙)

**Interfaces:**
- Consumes: 없음. Task 1과 독립이다.
- Produces: 없음.

- [ ] **Step 1: `theme.ts` — 모달 제목 크기를 갈무리 격자에 맞춘다**

바꾸기 전:
```ts
    Modal: { contentBg: '#181818', headerBg: '#181818', titleFontSize: 22, fontWeightStrong: 400, borderRadiusLG: 0 },
```
바꾼 뒤:
```ts
    Modal: { contentBg: '#181818', headerBg: '#181818', titleFontSize: 20, fontWeightStrong: 400, borderRadiusLG: 0 },
```

- [ ] **Step 2: `tokens.css` — 모달 제목과 Descriptions 라벨에 갈무리**

antd 부품이라 `tokens.css`에 새 규칙을 추가한다. 파일 맨 아래 **antd 관련 규칙이 모여 있는 곳이 있으면 거기에**, 없으면 파일 끝에 새 주석 블록으로 넣는다:

```css
/* ══ antd 부품 위에 얹는 도트 톤(4단계) ═══════════════════════
   antd 는 자기 토큰 체계라 글꼴까지는 안 정해 준다 — 짧은 라벨만 갈무리로 옮긴다.
   크기는 10px 격자 배수(--fs-pixel-sm), 굵기는 폰트에 실제로 있는 값으로. */
.ant-modal-title { font-family: var(--font-pixel); font-weight: var(--fw-body); font-synthesis: none; letter-spacing: 0; }
.ant-descriptions-item-label { font-family: var(--font-pixel); font-size: var(--fs-pixel-sm); font-weight: var(--fw-body); font-synthesis: none; letter-spacing: 0; }
```

`.ant-modal-title`에는 `font-size`를 주지 않는다 — Step 1의 `titleFontSize: 20`이 이미 20px를 만든다. 두 군데서 크기를 정하면 나중에 한쪽만 고쳐 어긋난다.

- [ ] **Step 3: antd 캐스케이드를 이기는지 실측**

3단계에서 `.tile` 테두리가 antd를 이긴 전례가 있지만 **부품마다 다르므로 반드시 잰다.** `prebuild`가 `theme.ts`를 읽어 antd CSS를 다시 뽑으니 재빌드가 선행돼야 한다.

```bash
npm run build && npm run preview
```

steps 파일로 아바타 편집 모달을 열고 잰다:
```js
export default async function (c, check) {
  for (let i = 0; i < 20 && (await c.evaluate(`document.getElementById('avatar-edit-btn') ? 1 : 0`)) !== 1; i++) await c.sleep(800);
  const desc = await c.evaluate(`(() => { const el = document.querySelector('.ant-descriptions-item-label'); const cs = el && getComputedStyle(el); return cs ? cs.fontFamily + ' | ' + cs.fontSize : 'no-el'; })()`);
  await c.evaluate(`document.getElementById('avatar-edit-btn').click(); 'ok'`);
  await c.sleep(900);
  const title = await c.evaluate(`(() => { const el = document.querySelector('.ant-modal-title'); const cs = el && getComputedStyle(el); return cs ? cs.fontFamily + ' | ' + cs.fontSize : 'no-el'; })()`);
  check('모달 제목 / 요약 라벨', true, JSON.stringify({ title, desc }));
}
```
`/weekly-fc/squad/2/`에서 돌린다. 기대: 둘 다 `Galmuri9`로 시작하고, 제목은 `20px`, 라벨도 `20px`.

**`Galmuri9`가 안 나오면** antd가 이긴 것이다. 인라인으로 박지 말고 **선택자 특정도를 올린다** — `.wfc .ant-modal-title` 같은 형태로 바꾸고 다시 잰다. 그래도 안 되면 무엇이 이기는지(어느 파일의 어느 규칙인지) 보고에 적고 BLOCKED 로 올린다.

- [ ] **Step 4: 눈으로 확인**

아바타 편집 모달을 연 스크린샷과 선수 상세 상단(요약 줄)을 데스크톱·모바일로 찍는다.

확인할 것:
- 모달 제목("아바타 편집")이 도트로 또렷하다.
- 요약 줄 라벨("미납 벌금"·"봉사")이 도트이고, **값 쪽(0원·2027년 8월…)은 기존 폰트 그대로**다.
- 20px 라벨이 커지면서 요약 줄이 두 줄로 접히거나 넘치지 않는지 — 특히 모바일. 접히는 정도는 괜찮고 **가로로 넘치면 안 된다**.
- 선수 편집 모달(카드 아래 「편집」 버튼이 있으면)도 제목이 도트인지 같이 본다.
- 끝나면 서버를 종료한다.

- [ ] **Step 5: 테스트 + 커밋**

```bash
npm test
git add src/react/theme.ts src/styles/tokens.css
git commit -m "$(cat <<'MSG'
style(player): 모달 제목·요약 줄 라벨을 갈무리로

제목 크기는 theme.ts 한 곳에서만 정한다(22→20, 갈무리 10px 격자). antd 는
글꼴까지는 안 정해 주므로 tokens.css 에서 짧은 라벨에만 얹는다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DaDPzugZyKUdGnpyTH5KY4
MSG
)"
```

---

## Controller 최종 검증 (SDD 최종 리뷰 전, 컨트롤러가 직접)

- `npm test` 전체 통과.
- 선수 상세·스쿼드 카드 뷰를 데스크톱·모바일로 띄워 **확대 스크린샷**으로 본다 — 도트 글자가 흐린지는 계산된 스타일로 안 잡힌다(1a·1b에서 두 번 당함).
- 스쿼드 **표** 뷰의 숫자가 안 바뀌었는지 확인한다(`.val` 전역 오염 여부).
- 모바일 카드벽에서 `.pcard-stat-val`의 계산된 `font-size`가 20px인지 직접 잰다(오버라이드 삭제가 먹었는지).
