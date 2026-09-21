# 도트 리프레시 2단계(홈 톤) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 홈 대시보드에 도트 톤을 입힌다 — 타일을 각진 2px 테두리 패널로 바꾸고, 타일 라벨·봉사 이름까지 갈무리로 옮기고, 「내 선수」 타일을 **전체 폭 히어로로 키워 1c에서 만든 전신 도트 선수를 세운다.**

**Architecture:** 두 갈래다. (1) `tokens.css`의 `.tile*` 규칙 — 틀·폰트·히어로 클래스. (2) `HomeApp.tsx`/`model.ts` — 히어로 마크업과 아바타 코드 전달. 홈 타일은 antd `Card`라 레이아웃에 쓰이는 값(`display`/`flex-direction`/`gap`)은 파일이 이미 쓰는 방식대로 **인라인 style**로 주고, 색·테두리·hover처럼 상태가 있는 것은 CSS가 갖는다.

**Tech Stack:** TypeScript(Astro + React 19 + antd), Node 내장 test runner, 헤드리스 Chrome(CDP)으로 실측. 새 의존성 없음.

**Spec:** `docs/superpowers/specs/2026-09-21-pixel-refresh-design.md` §4 홈 → "[2026-09-21 2단계 — 톤 적용 확정]"

## Global Constraints

- 갈무리를 새로 거는 **모든** 선택자에 `font-synthesis: none`과 `letter-spacing: 0`을 같이 건다 — 단일 굵기 웹폰트라 굵기를 요구하면 브라우저가 가짜 굵게를 합성해 흐려진다(1a에서 실측으로 당한 것).
- 갈무리 글자 크기는 `--fs-pixel-*`(20/30/40/60px)만 쓴다. 본문용 `--fs-*`를 갈무리 자리에 쓰지 않는다.
- 본문 긴 글(운영 규칙 등)은 이번에도 갈무리로 옮기지 않는다 — 폰트 무게 때문에 적용 범위를 좁게 유지한다는 §3 폰트 절의 원칙.
- 아바타 렌더 함수의 계약(동기·문자열·결정적)에 기대는 자리다. `dangerouslySetInnerHTML`에 넣는 문자열은 렌더마다 같아야 한다.
- 새 npm 의존성 금지. `npm test`(unit+build+dist) 통과.

---

### Task 1: 타일 틀·폰트·히어로 클래스 (CSS)

**Files:**
- Modify: `src/styles/tokens.css` (`.tile` 계열 규칙 블록, 276행 부근)

**Interfaces:**
- Produces: `.tile`(각진 테두리), `.tile-label`/`.tile-duo`(갈무리), 그리고 Task 2가 쓸 새 클래스 `.tile-hero` / `.tile-hero-sprite` / `.tile-hero-text`.
- Consumes: 기존 토큰(`--line`·`--fg`·`--font-pixel`·`--fs-pixel-sm`·`--fs-pixel-xl`·`--s-*`). 새 토큰은 만들지 않는다.

- [ ] **Step 1: `.tile` 계열 블록 교체**

`src/styles/tokens.css`에서 아래 블록을 찾는다(주석 줄부터 `.tile-duo` 줄까지 연속으로 붙어 있다):

```css
/* 정본 game-tile: 면 #121314, 반경 8. hover 는 밝기만. */
.tile { display: flex; flex-direction: column; text-align: left; padding: var(--s-md); border: 0; border-radius: var(--r-md);
  background: var(--elevated); color: inherit; font-weight: var(--fw-body); cursor: pointer;
  transition: background var(--dur-micro) var(--ease-std); }
.tile:hover { background: var(--charcoal); }
.tile-label { font-size: var(--fs-xs); font-weight: var(--fw-strong); color: var(--muted); }
```

이 다섯 줄(주석 포함)을 아래로 바꾼다. `.tile-big`·`.tile-sub` 줄은 그대로 둔다:

```css
/* game-tile: 면 #121314, 각진 2px 테두리. hover 는 테두리가 켜진다(2단계 도트 톤). */
.tile { display: flex; flex-direction: column; text-align: left; padding: var(--s-md); border: 2px solid var(--line); border-radius: 0;
  background: var(--elevated); color: inherit; font-weight: var(--fw-body); cursor: pointer;
  transition: background var(--dur-micro) var(--ease-std), border-color var(--dur-micro) var(--ease-std); }
.tile:hover { background: var(--charcoal); border-color: var(--fg); }
.tile-label { font-family: var(--font-pixel); font-size: var(--fs-pixel-sm); font-weight: var(--fw-body); font-synthesis: none; letter-spacing: 0; line-height: 1.2; color: var(--fg); }
```

- [ ] **Step 2: `.tile-duo`도 갈무리로**

같은 블록 아래의 이 줄을 찾는다:

```css
.tile-duo { display: flex; flex-wrap: wrap; gap: 0 var(--s-sm); margin-top: auto; font-size: var(--fs-h-lg); font-weight: var(--fw-num); line-height: 1.25; }
```

아래로 바꾼다:

```css
.tile-duo { display: flex; flex-wrap: wrap; gap: 0 var(--s-sm); margin-top: auto; font-family: var(--font-pixel); font-size: var(--fs-pixel-sm); font-weight: var(--fw-num); font-synthesis: none; letter-spacing: 0; line-height: 1.25; }
```

- [ ] **Step 3: 히어로 클래스 추가**

`.tile-duo` 줄 **바로 다음**에 아래를 새로 넣는다(Task 2가 쓸 클래스다. 이번 태스크에서는 아직 아무도 안 쓴다):

```css
/* 「내 선수」 히어로 — 전체 폭 한 칸을 차지하고 왼쪽에 전신 도트 선수를 세운다.
   flex 방향·gap 은 HomeApp 이 인라인으로 준다(antd Card 라 캐스케이드에 기대지 않는다). */
.tile-hero { grid-column: 1 / -1; min-height: 168px; }
.tile-hero-sprite { flex: 0 0 auto; display: flex; }
.tile-hero-text { display: flex; flex-direction: column; min-width: 0; }
.tile-hero .tile-big { margin-top: var(--s-xxs); font-size: var(--fs-pixel-xl); }
```

- [ ] **Step 4: 테두리가 antd 를 이기는지 실측**

홈 타일은 antd `Card`(`variant="borderless"`)라 antd 규칙이 테두리를 지울 수 있다. **코드만 보고 넘어가지 말고 실제로 계산된 값을 잰다.**

```bash
npm run build && npm run preview
```
(실제 포트는 preview 출력에서 읽는다. base 경로는 `/weekly-fc`.)

그 다음 헤드리스로 홈을 열어 재본다 — `cdp.mjs`는 다섯 번째 인자 뒤에 steps 파일(절대경로)을 받는다:

```js
// 스크래치 steps 파일 (레포 밖)
export default async function (c, check) {
  const got = await c.evaluate(`(() => {
    const t = document.querySelector('.tile');
    const cs = getComputedStyle(t);
    return JSON.stringify({ w: cs.borderTopWidth, style: cs.borderTopStyle, radius: cs.borderTopLeftRadius, label: getComputedStyle(document.querySelector('.tile-label')).fontFamily });
  })()`);
  check('타일 테두리·라벨 폰트', true, got);
}
```

기대: `w: "2px"`, `style: "solid"`, `radius: "0px"`, `label`에 `Galmuri9` 포함.

**`w`가 `0px`로 나오면** antd가 이긴 것이다. 그때는 인라인 style로 박지 말고(인라인이면 hover에서 테두리 색을 못 바꾼다) **선택자 특정도를 올린다** — Step 1에서 고친 두 규칙의 선택자를 `.rail .tile`·`.rail .tile:hover`로 바꾸고 다시 잰다.

- [ ] **Step 5: 눈으로 확인**

데스크톱·모바일 스크린샷을 찍는다:
```bash
node /private/tmp/claude-501/-Users-junyoungkim/707543c0-f7f4-4fed-b000-a90da8893c64/scratchpad/cdp.mjs "http://localhost:<포트>/weekly-fc/" /tmp/2-home-desktop.png 1280 900 0
node /private/tmp/claude-501/-Users-junyoungkim/707543c0-f7f4-4fed-b000-a90da8893c64/scratchpad/cdp.mjs "http://localhost:<포트>/weekly-fc/" /tmp/2-home-mobile.png 390 844 1
```

확인할 것:
- 타일마다 각진 2px 테두리가 보이고 모서리가 둥글지 않다.
- 라벨("내 선수"·"스쿼드"·"미납 벌금" 등)이 도트 폰트로 또렷하다 — **흐릿하면 가짜 굵게가 합성된 것이니 `font-weight`/`font-synthesis`를 다시 본다**(1a에서 실제로 겪은 증상).
- 봉사 타일의 두 이름도 도트 폰트다.
- 모바일(2열)에서 긴 라벨("2026년 9월 봉사")이 두 줄로 접히는 것은 괜찮다. **가로로 넘치면 안 된다** — `cdp.mjs`가 출력하는 `overflow` 목록이 비어 있어야 한다.
- 끝나면 띄운 서버를 종료한다.

- [ ] **Step 6: 테스트 + 커밋**

```bash
npm test
git add src/styles/tokens.css
git commit -m "$(cat <<'MSG'
style(home): 타일을 각진 2px 패널로, 라벨·봉사 이름도 갈무리로

hover 는 배경 밝기 대신 테두리가 켜지게 바꿨다. 히어로용 클래스도 같이
넣어 둔다(Task 2 에서 쓴다).

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DaDPzugZyKUdGnpyTH5KY4
MSG
)"
```

---

### Task 2: 「내 선수」 히어로 — 전신 도트 선수 세우기

**Files:**
- Modify: `src/react/home/model.ts` (`MeTile` 타입 + 한 줄)
- Modify: `src/react/home/HomeApp.tsx`
- Modify: `tests/unit/home-model.test.mjs`

**Interfaces:**
- Consumes: Task 1의 `.tile-hero`/`.tile-hero-sprite`/`.tile-hero-text`, 그리고 `src/components/avatar.ts`의 `avatarSvg(spec, size, fallbackLabel?, bare?)`(전신, `size`=세로) + `src/lib/avatar.ts`의 `avatarSpecFor(num, code)`.
- Produces: `MeTile`의 `picked` 갈래에 `avatar: string`(선수의 아바타 코드)이 추가된다.

- [ ] **Step 1: `src/react/home/model.ts` — `MeTile`에 아바타 코드 싣기**

바꾸기 전:
```ts
export type MeTile = { kind: 'picked'; ovr: number; name: string; pos: string; num: number } | { kind: 'empty' };
```
바꾼 뒤:
```ts
export type MeTile = { kind: 'picked'; ovr: number; name: string; pos: string; num: number; avatar: string } | { kind: 'empty' };
```

바꾸기 전:
```ts
  const meTile: MeTile = p ? { kind: 'picked', ovr: ovr(p), name: p.name, pos: p.pos || '–', num: p.num } : { kind: 'empty' };
```
바꾼 뒤:
```ts
  const meTile: MeTile = p ? { kind: 'picked', ovr: ovr(p), name: p.name, pos: p.pos || '–', num: p.num, avatar: p.avatar } : { kind: 'empty' };
```

- [ ] **Step 2: `tests/unit/home-model.test.mjs` — 단언 갱신 + 통과 검증 추가**

바꾸기 전:
```js
  assert.deepEqual(s.meTile, { kind: 'picked', ovr: 73, name: '박지훈', pos: 'FW', num: 9 }); // (85+80+88+70+40+75)/6 = 73
```
바꾼 뒤(픽스처 `P()`의 기본 `avatar`는 빈 문자열이다):
```js
  assert.deepEqual(s.meTile, { kind: 'picked', ovr: 73, name: '박지훈', pos: 'FW', num: 9, avatar: '' }); // (85+80+88+70+40+75)/6 = 73
```

그리고 같은 파일에서 이 테스트 **바로 다음**에 아래를 추가한다:
```js
test('computeHomeSummary: 저장된 아바타 코드가 meTile 로 그대로 넘어온다 (히어로가 실제 선수 그림을 그리려면 필요)', () => {
  const code = 'f2:h5:s3:e1:k#2980b9';
  const withAvatar = { ...data, players: players.map((p) => (p.num === 9 ? { ...p, avatar: code } : p)) };
  const s = computeHomeSummary(withAvatar, 9, now);
  assert.equal(s.meTile.kind, 'picked');
  assert.equal(s.meTile.avatar, code);
});
```

- [ ] **Step 3: `src/react/home/HomeApp.tsx` — import 추가**

파일 상단 import 묶음에 두 줄을 더한다(이 파일은 확장자 없이 import 한다 — 기존 줄들과 같은 형식을 지킨다):

```tsx
import { avatarSvg } from '../../components/avatar';
import { avatarSpecFor } from '../../lib/avatar';
```

- [ ] **Step 4: 히어로 style 상수와 자리지킴 스펙 추가**

`TILE_BODY` 상수 바로 아래에 넣는다:

```tsx
// 히어로는 가로 배치라 flex 방향·정렬·gap 을 인라인으로 준다 — TILE_STYLE 과 같은 이유로
// 캐스케이드 순서에 기대지 않는다(antd Card 가 자기 규칙을 얹는다).
const HERO_STYLE = { ...TILE_STYLE, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 'var(--s-lg)' };
// 이름을 고르기 전 자리지킴 — 회색 유니폼의 일반 선수. 상수라 렌더마다 같은 그림이 나온다.
const PLACEHOLDER_SPEC = { face: 0, hair: 1, skin: 2, eyes: 0, kit: '#565f6f' };
const HERO_SPRITE_H = 120;
```

- [ ] **Step 5: `LinkTile`이 히어로도 그릴 수 있게**

바꾸기 전:
```tsx
function LinkTile({ to, children }: { to: string; children: ReactNode }) {
  const isExternal = to.startsWith('http');
```
바꾼 뒤:
```tsx
function LinkTile({ to, hero, children }: { to: string; hero?: boolean; children: ReactNode }) {
  const isExternal = to.startsWith('http');
```

그리고 같은 함수 안의 `<Card ...>` 여는 태그에서 `className`과 `style`만 바꾼다 — 바꾸기 전:
```tsx
      <Card className="tile" variant="borderless" style={TILE_STYLE} styles={TILE_BODY}
```
바꾼 뒤:
```tsx
      <Card className={hero ? 'tile tile-hero' : 'tile'} variant="borderless" style={hero ? HERO_STYLE : TILE_STYLE} styles={TILE_BODY}
```

- [ ] **Step 6: `EmptyMeTile`을 히어로로**

함수 전체를 아래로 바꾼다:

```tsx
function EmptyMeTile({ onOpen }: { onOpen: () => void }) {
  return (
    <Card className="tile tile-hero" variant="borderless" style={HERO_STYLE} styles={TILE_BODY}
      role="button" tabIndex={0} onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}>
      <div className="tile-hero-sprite" dangerouslySetInnerHTML={{ __html: avatarSvg(PLACEHOLDER_SPEC, HERO_SPRITE_H, undefined, true) }} />
      <div className="tile-hero-text">
        <span className="tile-label">내 선수</span>
        <b className="tile-big">?</b>
        <span className="tile-sub">이름을 고르면 내 카드가 뜹니다</span>
      </div>
    </Card>
  );
}
```

- [ ] **Step 7: picked 갈래를 히어로 마크업으로**

바꾸기 전:
```tsx
        {s.meTile.kind === 'picked'
          ? <LinkTile to={href(`/squad/${s.meTile.num}/`)}><span className="tile-label">내 선수</span><b className="tile-big">{s.meTile.ovr || '–'}</b><span className="tile-sub">{s.meTile.name} · {s.meTile.pos}</span></LinkTile>
          : <EmptyMeTile onOpen={openMe} />}
```
바꾼 뒤:
```tsx
        {s.meTile.kind === 'picked'
          ? (
            <LinkTile to={href(`/squad/${s.meTile.num}/`)} hero>
              <div className="tile-hero-sprite" dangerouslySetInnerHTML={{ __html: avatarSvg(avatarSpecFor(s.meTile.num, s.meTile.avatar), HERO_SPRITE_H, s.meTile.num, true) }} />
              <div className="tile-hero-text">
                <span className="tile-label">내 선수</span>
                <b className="tile-big">{s.meTile.ovr || '–'}</b>
                <span className="tile-sub">{s.meTile.name} · {s.meTile.pos} · #{s.meTile.num}</span>
              </div>
            </LinkTile>
          )
          : <EmptyMeTile onOpen={openMe} />}
```

- [ ] **Step 8: 두 상태를 실제로 띄워서 확인**

```bash
npm test && npm run build && npm run preview
```

「내 선수」는 기기에 저장된 값(`localStorage.wfc_me`)으로 갈린다. 두 상태를 다 봐야 한다 — steps 파일에서 값을 넣고 `wfc:me` 이벤트를 쏘면 리로드 없이 바뀐다(`HomeApp`이 그 이벤트를 듣는다):

```js
// 스크래치 steps 파일 — 이름 고른 상태로 전환
export default async function (c, check) {
  await c.evaluate(`localStorage.setItem('wfc_me','2'); window.dispatchEvent(new Event('wfc:me')); 'ok'`);
  await c.sleep(600);
  const got = await c.evaluate(`(() => {
    const hero = document.querySelector('.tile-hero');
    const svg = hero && hero.querySelector('.tile-hero-sprite svg');
    const r = hero && hero.getBoundingClientRect();
    return JSON.stringify({ hero: !!hero, spriteSize: svg ? svg.getAttribute('width') + 'x' + svg.getAttribute('height') : 'none', heroW: r ? Math.round(r.width) : -1, railW: Math.round(document.querySelector('.rail').getBoundingClientRect().width) });
  })()`);
  check('히어로', true, got);
}
```
기대: `hero: true`, `spriteSize: "90x120"`, `heroW`가 `railW`와 같다(전체 폭).

스크린샷을 네 장 찍는다 — 데스크톱/모바일 × 이름 고르기 전/후. 확인할 것:
- 이름 고르기 **전**: 회색 유니폼의 자리지킴 선수가 서 있고, 문구가 읽힌다.
- 이름 고른 **후**: 그 선수의 실제 도트 그림(유니폼 색·헤어)이 뜬다.
- 히어로가 격자 전체 폭을 차지하고, 나머지 타일 6개가 3×2로 **빈칸 없이** 채워진다(모바일은 2열이라 3줄).
- 히어로 안에서 스프라이트와 텍스트가 세로 가운데로 정렬되고, OVR 숫자가 60px 도트로 또렷하다(흐리면 가짜 굵게 합성 — Task 1 Step 5와 같은 증상).
- 가로 스크롤 없음(`overflow` 목록이 비어 있어야 한다).
- 끝나면 서버를 종료한다.

- [ ] **Step 9: 커밋**

```bash
npm test
git add src/react/home/model.ts src/react/home/HomeApp.tsx tests/unit/home-model.test.mjs
git commit -m "$(cat <<'MSG'
feat(home): 「내 선수」를 전체 폭 히어로로 — 전신 도트 선수를 세운다

타일 7개가 3열 격자에서 만들던 빈칸(마지막 줄 1개)도 같이 없어진다.
이름을 고르기 전에는 회색 유니폼 자리지킴 선수가 선다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DaDPzugZyKUdGnpyTH5KY4
MSG
)"
```

---

## Controller 최종 검증 (SDD 최종 리뷰 전, 컨트롤러가 직접)

- `npm test` 전체 통과.
- 홈을 데스크톱·모바일에서, 이름 고르기 전/후로 직접 띄워 **확대 스크린샷**으로 본다 — 도트 글자가 흐린지는 계산된 스타일로 안 잡힌다(1a·1b에서 두 번 당함).
- 홈 페이지 JS 무게가 아바타 픽셀맵 때문에 얼마나 늘었는지 빌드 결과로 확인하고 보고에 적는다(이 프로젝트는 페이지 무게를 계속 추적해 왔다).
- 타일 hover에서 테두리가 실제로 `--fg`로 켜지는지 마우스 이동을 흉내 내 확인한다.
