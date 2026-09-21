# 5단계(명단/라인업 분리 + 공유 이미지) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/squad/`가 명단과 피치를 한 화면에 욱여넣어 표가 380px 칸에 갇혀 있던 것을 푼다 — 명단(`/squad/`)과 라인업(`/lineup/`)을 상단 내비로 분리하고, 각자 전체 폭을 쓴다. 공유 이미지(캔버스)도 도트로 바꾸고 폰트 로드를 기다리게 한다.

**Architecture:** `SquadApp`이 들고 있던 두 가지 관심사를 쪼갠다. 라인업 상태(복원·저장)는 `useLineup` 훅으로 빼 두 화면이 공유하고, 화면은 `RosterApp`(명단)과 `LineupApp`(라인업)으로 나뉜다. 상태는 이미 `localStorage`에 저장되므로 페이지를 옮겨도 유지된다. 선수 고르기는 모바일이 이미 쓰던 `BenchStrip`+Drawer 를 데스크톱에도 켜서 해결한다.

**Tech Stack:** Astro(정적) + React 19 섬 + antd. 헤드리스 Chrome(CDP)으로 실측.

**Spec:** `docs/superpowers/specs/2026-09-21-pixel-refresh-design.md` §10

## Global Constraints

- **기능 손실 금지.** 지금 되는 것(선수 고르기·자리 맞바꾸기·드래그 이동·자동 배치·인원/포메이션/경기장 변경·이미지 공유·선수 추가·명단 필터/검색/3뷰)이 분리 뒤에도 전부 된다.
- 라인업 초안 저장 규칙을 바꾸지 않는다 — `L.DRAFT_KEY`, `L.restore`, `L.serialize`, 그리고 "캐시 명단이 처음 온 뒤 한 번만 복원하고 그 뒤엔 새 데이터가 와도 덮지 않는다(`touched`)"는 규칙 그대로.
- 이 사이트는 완전 정적 빌드다 — 프론트매터에서 `Astro.url`·쿼리스트링을 읽지 않는다.
- 갈무리를 새로 거는 자리는 `font-synthesis: none`·`letter-spacing: 0`·10의 배수 크기(`--fs-pixel-*`). 캔버스도 크기는 10의 배수로.
- 새 npm 의존성 금지. `npm test`(unit+build+dist) 통과.

---

### Task 1: 두 화면으로 쪼개기

**Files:**
- Create: `src/react/squad/useLineup.ts`, `src/react/squad/LineupApp.tsx`, `src/pages/lineup/index.astro`
- Modify: `src/react/squad/SquadApp.tsx` → 명단 전용으로 축소(파일명은 그대로 둔다 — `/squad/` 라우트가 이걸 마운트한다)
- Modify: `src/layouts/Shell.astro` (내비 4항목), `src/pages/squad/index.astro` (제목), `src/react/home/HomeApp.tsx` (타일 라벨·링크)
- Modify: `tests/build/dist.test.mjs`

**Interfaces:**
- Produces: `useLineup(players: Player[] | undefined)` → `{ st, commit }`. `st`는 `L.LineupState`, `commit(next)`는 상태 갱신 + `touched` 표시 + `localStorage` 저장까지 한다(지금 `SquadApp.commit`이 하는 일 그대로).

- [ ] **Step 1: `useLineup` 훅 추출**

지금 `SquadApp.tsx` 안에 있는 세 조각을 그대로 옮긴다 — `st`/`touched` state, 복원 `useEffect`(주석 포함), `commit` 함수. 동작을 바꾸지 말고 **잘라내 붙이기**만 한다. 훅은 `players`(없을 수 있음)를 받아 복원 조건(`!touched && players && players.length > 0`)에 쓴다.

- [ ] **Step 2: `LineupApp.tsx` 신설 — 라인업 쪽을 가져간다**

`SquadApp`에서 **라인업에 속하는 것 전부**를 옮긴다:
- state: `selected`, `sheetOpen`, `shareOpen`
- Esc 키로 선택 해제하는 `useEffect`
- `onPick`·`onTapSlot`·`onSwap`·`hint`
- 라인업 컨트롤 묶음(`.bd-controls`: 인원 Segmented, 포메이션 Select, 풋살/축구 Segmented, 자동 배치 버튼)
- `<Pitch>`, `.bd-share-row`의 「이미지 공유」 버튼, `.bd-hint`
- `<BenchStrip>`, 명단 Drawer, `<ShareModal>`
- 페이지 머리: `<h1>라인업 <span className="muted">선발 {filled}/{st.count}</span></h1>`

Drawer 는 **모든 폭에서** 쓴다(데스크톱에도 명단이 같은 화면에 없으므로). 즉 지금 `isMobile ? <Drawer>…</Drawer> : <section className="bd-list">` 로 갈리던 분기를 없애고 Drawer 하나만 남긴다. Drawer 안에는 지금처럼 `rosterList`(RosterList)를 넣어 거기서도 선수를 고를 수 있게 한다.

`data`가 아직 없을 때의 조기 반환은 지금 `SquadApp`이 하는 모양을 따르되 제목만 `라인업`으로.

- [ ] **Step 3: `SquadApp.tsx`를 명단 전용으로 축소**

남기는 것: `useData`·`useAdmin`·`useLineup`, `pos`/`q`/`view` state, `rows` 필터, `onViewChange`, `onAdd`, `onPick`, 페이지 머리, `<RosterList>`.

- `onPick`은 그대로 둔다 — 명단에서도 「넣기/선발」로 이번 주 나올 사람을 찍을 수 있어야 한다. 다만 이 화면엔 자리 선택 개념이 없으므로 `L.tapPlayer(st, num, null)`로 부른다(지금도 `selected`가 null 이면 같은 동작이다). 자리가 다 찼을 때의 안내 메시지는 그대로 유지한다.
- 페이지 머리 제목을 `명단`으로 바꾼다(지금 `스쿼드`).
- 지우는 것: 피치·벤치 줄·Drawer·공유 모달·라인업 컨트롤·`selected`·`sheetOpen`·`shareOpen`·Esc 핸들러·`hint`·`onTapSlot`·`onSwap`·`useIsMobile`. **쓰지 않게 된 import 도 같이 지운다.**

- [ ] **Step 4: 라우트와 내비**

`src/pages/lineup/index.astro` 를 새로 만든다 — `src/pages/squad/index.astro` 와 같은 모양으로, 제목 `라인업`, `LineupApp` 을 `client:load` 로 마운트.

`src/pages/squad/index.astro` 의 Shell 제목을 `명단`으로.

`src/layouts/Shell.astro` 의 nav 배열 — 바꾸기 전:
```astro
const nav = [
  { href: href('/'), label: '홈' },
  { href: href('/squad/'), label: '스쿼드' },
  { href: href('/rules/'), label: '운영' },
```
바꾼 뒤:
```astro
const nav = [
  { href: href('/'), label: '홈' },
  { href: href('/squad/'), label: '명단' },
  { href: href('/lineup/'), label: '라인업' },
  { href: href('/rules/'), label: '운영' },
```
(`isActive` 는 `path.startsWith(h)` 라 `/squad/2/` 도 명단이 활성으로 잡힌다 — 그대로 둔다.)

- [ ] **Step 5: 홈 타일 따라가기**

`src/react/home/HomeApp.tsx` 에서 두 타일을 고친다:
- 「스쿼드」 타일 → 라벨 `명단`(링크 `/squad/` 그대로)
- 「라인업」 타일 → 링크를 `href('/lineup/')` 로(지금 `/squad/`), 설명 문구도 새 구조에 맞게 자연스럽게 다듬는다

- [ ] **Step 6: dist 테스트 갱신**

`tests/build/dist.test.mjs` 의 `PAGES` 배열에 `'lineup/index.html'` 을 더하고, "상단 탭은 홈·스쿼드·운영 세 갈래" 테스트를 **네 갈래(홈·명단·라인업·운영)** 로 고친다. 테스트 이름도 같이 고친다.

- [ ] **Step 7: 기능이 살아 있는지 실측**

```bash
npm test && npm run build && npm run preview
```
(포트는 preview 출력에서 읽는다. base 경로는 `/weekly-fc`.)

`/weekly-fc/lineup/` 에서 확인할 것 — **보는 걸로 끝내지 말고 실제로 눌러서** 확인한다:
- 벤치 줄에서 선수를 누르면 피치에 들어간다.
- 피치의 자리를 누르고 다른 자리를 누르면 맞바꿔진다.
- 「전체」로 Drawer 가 열리고, 거기 명단에서도 선수를 고를 수 있다.
- 인원·포메이션·풋살/축구·자동 배치가 동작한다.
- 「이미지 공유」 모달이 열리고 미리보기가 그려진다.
- **새로고침해도 배치가 남아 있다**(localStorage 복원).
- `/weekly-fc/squad/` 로 갔다가 다시 돌아와도 배치가 남아 있다 — 이게 B안의 전제다.

`/weekly-fc/squad/` 에서:
- 목록·카드·표 3뷰 전환, 필터·검색이 동작한다.
- 「넣기」를 누르면 그 선수가 선발로 잡히고, `/lineup/` 으로 가면 실제로 들어가 있다.
- 관리자일 때 「선수 추가」가 보인다(관리자 아니면 안 보이는 것도 확인).

- [ ] **Step 8: 커밋**

```bash
npm test
git add -A
git commit -m "$(cat <<'MSG'
feat(squad): 명단과 라인업을 분리 — /squad/ 와 /lineup/

한 화면에 둘을 욱여넣어 표가 380px 칸에 갇혀 있었다. 라인업 상태는 이미
localStorage 에 있어 페이지를 나눠도 유지되고, 선수 고르기는 모바일이 쓰던
벤치 줄 + Drawer 를 모든 폭에서 쓴다. 내비 이름도 스쿼드→명단 으로 —
스쿼드가 명단과 라인업 둘 다를 가리켜 모호했던 게 문제의 뿌리였다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DaDPzugZyKUdGnpyTH5KY4
MSG
)"
```

---

### Task 2: 각자 제 폭 쓰기

**Files:**
- Modify: `src/styles/tokens.css` (`.bd` 그리드, `.bd-strip` 노출 조건, 관련 미디어쿼리)

**Interfaces:** 없음(표현 말단).

- [ ] **Step 1: `.bd` 2열 그리드를 푼다**

`.bd { display: grid; grid-template-columns: minmax(280px, 380px) minmax(0, 1fr); … }` 는 명단+피치를 나란히 두기 위한 것이었다. 이제 각 화면이 하나씩만 담으므로 **한 칸짜리**가 된다. 두 화면 모두에서 내용이 전체 폭을 쓰도록 고친다(피치는 자기 `--pitch-max` 로 가운데 정렬되는 성질을 유지한다 — 실측으로 확인).

- [ ] **Step 2: 벤치 줄을 모든 폭에서 보이게**

`.bd-strip { display: none; }` 과 `@media (max-width: 899px)` 안의 `.bd-strip { display: flex; … }` 를 정리해, **모든 폭에서 보이게** 한다. 화면 아래 고정이라 본문이 가리지 않도록 아래 여백을 주는 규칙이 모바일에만 걸려 있으면 그것도 모든 폭으로 옮긴다(`grep` 으로 `padding-bottom` 계열을 먼저 찾아 확인할 것).

벤치 줄은 `/lineup/` 에만 있으면 된다 — `/squad/` 에는 렌더되지 않으므로 CSS 만 풀면 된다.

- [ ] **Step 3: 실측 — 이 단계의 목적이 달성됐는지**

```bash
npm run build && npm run preview
```

`/weekly-fc/squad/` 표 뷰에서(세그먼트의 「표」를 **텍스트로** 찾아 클릭 — 이 페이지엔 `.chips` 그룹이 여럿이다):
```js
export default async function (c, check) {
  const co = JSON.parse(await c.evaluate(`(() => { const el = [...document.querySelectorAll('.ant-segmented-item')].find(e => e.textContent.trim() === '표'); el.scrollIntoView({block:'center'}); const r = el.getBoundingClientRect(); return JSON.stringify([r.left+r.width/2, r.top+r.height/2]); })()`));
  await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: co[0], y: co[1], button: 'left', buttons: 1, clickCount: 1 });
  await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: co[0], y: co[1], button: 'left', buttons: 0, clickCount: 1 });
  await c.sleep(800);
  const got = await c.evaluate(`JSON.stringify({
    pageScrollW: document.documentElement.scrollWidth, innerW: innerWidth,
    tblScrollW: document.querySelector('.ant-table-content').scrollWidth,
    tblClientW: document.querySelector('.ant-table-content').clientWidth,
    lastColRight: Math.round([...document.querySelectorAll('.ant-table-thead th')].pop().getBoundingClientRect().right),
    panelRight: Math.round(document.querySelector('.ant-table-content').getBoundingClientRect().right)
  })`);
  check('표 폭', true, got);
}
```
**기대: `tblScrollW <= tblClientW`** — 즉 표가 더 이상 자기 안에서 가로로 스크롤하지 않고 열이 전부 보인다. `lastColRight <= panelRight` 도 같이 확인한다. 이게 이번 단계의 존재 이유이므로, 여전히 스크롤한다면 무엇이 폭을 먹고 있는지 열별 폭을 재서 보고한다.

`/weekly-fc/lineup/` 에서:
- 피치가 커졌는지(전보다 넓은지) 재고, 벤치 줄이 데스크톱에서도 보이는지 확인한다.
- 벤치 줄이 피치 아래 내용을 가리지 않는지(아래 여백) 확인한다.
- 모바일(390)에서도 예전과 똑같이 동작하는지 확인한다 — 여기서 회귀가 나기 쉽다.

데스크톱·모바일 스크린샷을 두 화면 다 찍어 본다. 끝나면 서버를 종료한다.

- [ ] **Step 4: 테스트 + 커밋**

```bash
npm test
git add src/styles/tokens.css
git commit -m "$(cat <<'MSG'
style(squad): 명단·라인업이 각자 전체 폭을 쓰도록, 벤치 줄은 모든 폭에서

2열 그리드는 둘을 나란히 두려던 것이라 분리 뒤엔 필요 없다. 표가 자기 안에서
가로 스크롤하지 않고 열이 전부 보이는 것이 이 변경의 목적이다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DaDPzugZyKUdGnpyTH5KY4
MSG
)"
```

---

### Task 3: 공유 이미지를 도트로 + 폰트 로드 대기

**Files:**
- Modify: `src/components/share-image.ts`
- Modify: `src/react/squad/ShareModal.tsx`

**Interfaces:** `drawLineupImage` 의 시그니처는 바꾸지 않는다(동기 유지) — 폰트 대기는 호출부가 한다.

- [ ] **Step 1: 캔버스 글꼴을 갈무리로**

`src/components/share-image.ts` 는 `const font = tok('--font', 'sans-serif')` 를 읽어 일곱 군데에서 `ctx.font` 에 쓴다. 갈무리를 쓸 상수를 하나 더 만들고(`tok('--font-pixel', …)` 은 `"Galmuri9", var(--font)` 같은 합성 값이라 캔버스에 그대로 넣으면 안 된다 — **캔버스용으로는 `Galmuri9` 를 직접 쓰고 대체 글꼴을 뒤에 붙인 문자열을 만든다**), 아래처럼 나눈다:

- 도트로: `WEEKLY FC` 머리말, 제목, 포메이션 표기(`s.shape`), 자리 라벨, 선수 이름, 맨 아래 주소
- 크기는 전부 **10의 배수**로 올림/내림한다(지금 26/56/34/22/26/18/20 → 예: 30/60/30/20/30/20/20). 정확한 값은 실제로 그려 보고 넘치지 않는 선에서 정한다.
- 굵기는 `400` 으로 — 갈무리에 없는 굵기를 요구하면 브라우저가 가짜 굵게를 합성해 흐려진다. 캔버스엔 `font-synthesis` 가 없으므로 **요청하지 않는 것이 유일한 방어다.**
- `fit()` 이 글자 폭을 재서 말줄임하는 로직은 그대로 둔다(폰트가 바뀌면 측정값도 따라 바뀐다).

- [ ] **Step 2: 폰트 로드를 명시적으로 기다린다**

`src/react/squad/ShareModal.tsx` 는 첫 그리기 전에 `await document.fonts.ready` 를 한다. **이것만으로는 부족하다** — `fonts.ready` 는 *이미 로드 중인* 폰트만 기다리고, 캔버스에서 `ctx.font` 로 글꼴을 지정하는 것은 로드를 유발하지 않는다. 페이지에 갈무리로 그려진 글자가 하나도 없는 상태였다면 대체 글꼴로 굳는다.

`document.fonts.ready` 앞이나 뒤에 **실제로 쓸 크기들에 대해** `document.fonts.load('<크기>px Galmuri9')` 를 호출하고 `await` 한다(여러 크기면 `Promise.all`). 실패해도 화면은 돌아야 하므로 `try`/`catch` 안에서 하되, 실패 시 기본 글꼴로 그려지는 것은 받아들인다.

- [ ] **Step 3: 실제로 이미지를 뽑아서 눈으로 확인**

`/weekly-fc/lineup/` 에서 자동 배치로 자리를 채우고 「이미지 공유」를 연 뒤, 미리보기 `<img>` 의 `src`(data URL)를 꺼내 파일로 저장해 **직접 본다**. steps 파일에서 `document.querySelector('.share-preview img')?.src` 같은 식으로 꺼내 `writeFileSync` 로 떨어뜨리거나, 모달 영역을 스크린샷으로 찍는다.

확인할 것:
- 제목·머리말·자리 라벨·선수 이름이 **도트로, 또렷하게** 그려졌다(흐리면 크기가 10의 배수가 아니거나 굵기를 요구한 것이다).
- 글자가 칸을 넘치거나 잘리지 않는다 — 특히 긴 제목과 긴 선수 이름(`fit()` 말줄임이 여전히 동작하는지).
- **모달을 닫고 새로고침한 뒤 곧바로 다시 열어도** 도트로 나온다(폰트 캐시가 없는 첫 진입에서 대체 글꼴로 굳지 않는지 — Step 2 가 실제로 필요한 이유다). 확실히 하려면 CDP 로 캐시를 끈 상태(`Network.setCacheDisabled`)에서 한 번 더 본다.

- [ ] **Step 4: 테스트 + 커밋**

```bash
npm test
git add src/components/share-image.ts src/react/squad/ShareModal.tsx
git commit -m "$(cat <<'MSG'
feat(share): 공유 이미지도 도트로 — 폰트 로드를 명시적으로 기다린다

캔버스는 CSS 가 안 닿고, ctx.font 지정만으로는 폰트 로드가 시작되지 않는다.
document.fonts.ready 는 이미 로드 중인 것만 기다리므로 실제 쓸 크기로
document.fonts.load 를 걸어야 첫 진입에서 대체 글꼴로 굳지 않는다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DaDPzugZyKUdGnpyTH5KY4
MSG
)"
```

---

## Controller 최종 검증 (SDD 최종 리뷰 전, 컨트롤러가 직접)

- `npm test` 전체 통과.
- **표가 실제로 다 보이는지** — 이번 단계의 존재 이유다. 가로 스크롤 없이 마지막 열(OVR)까지 보이는지 직접 확인.
- 라인업에서 선수를 넣고 → 명단으로 갔다가 → 라인업으로 돌아와도 배치가 남아 있는지(분리의 전제).
- 모바일에서 예전과 똑같이 동작하는지 — 원래 이 구조였던 쪽이라 회귀가 나면 여기서 난다.
- 공유 이미지를 실제로 한 장 뽑아 도트로 또렷한지 눈으로 본다.
