# 실사 선수 카드 (D단계) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자가 `public/players/{선수번호}.jpg`에 사진을 수동으로 넣으면, 앱의 모든 아바타 자리에서 SVG 아바타 대신(아바타 편집 모달만 예외) 그 사진이 뜨고, 파일이 없으면 자동으로 기존 SVG로 폴백한다.

**Architecture:** 사진 `<img>` 태그를 기존 `avatarSvg()` 출력 문자열 앞에 겹쳐 넣는 순수 문자열 조립 함수 하나(`photoHtml`)를 추가한다. 파일이 없으면(404) `onerror="this.remove()"`가 `<img>`만 지워 밑에 이미 그려진 SVG가 드러난다 — 새 데이터·매니페스트·존재 여부 체크 코드가 없다. 백엔드·시트 스키마·SVG 에디터는 전혀 안 바뀐다.

**Tech Stack:** Astro 7.3 정적 빌드, React 19 아일랜드(`client:load`), 순수 TS 문자열 조립 함수, CSS(`position:absolute` 오버레이 + `object-fit:cover`).

**Spec:** `docs/superpowers/specs/2026-09-20-player-photo-cards-design.md`

## Global Constraints

- 파일명 규약: `public/players/{선수번호}.jpg` — 확장자는 `.jpg` 하나로 고정(스펙 3절).
- 경로 조립은 반드시 기존 `src/lib/url.ts`의 `href()` 헬퍼를 재사용한다 — base 경로(`/weekly-fc`)를 새로 조립하지 않는다(스펙 4절).
- 사진 오버레이는 **아바타 편집 모달 미리보기(`PlayerDetail.tsx`의 120px 자리, 현재 줄 208)에는 적용하지 않는다** — SVG 부품 코드를 편집하는 화면이라 사진이 끼면 헷갈린다(스펙 5절). 나머지 3자리(선수 상세 카드 112px, 스쿼드 표 28px, 스쿼드 카드 116px)엔 전부 적용한다.
- 선수 번호는 탈퇴 시 재사용되므로, 선수 삭제 시 사진 파일도 같이 지우는 걸 운영 문서(`public/players/README.md`)에 명시한다(스펙 3절) — 이번 단계엔 삭제를 코드로 자동화하지 않는다(수동 배치 프로세스의 일부).
- 앱 안 업로드·크롭 UI, 얼굴 자동 블러, 선수별 동의 추적, 사진 유무 매니페스트 — 전부 범위 밖(스펙 7절). 어떤 태스크에서도 이런 것들을 추가하지 않는다.
- non-React `.ts` 파일(`src/lib/*.ts`, `src/components/*.ts`)의 상대 임포트는 확장자를 명시한다(`'../lib/url.ts'`) — 기존 코드 전체가 이 관례를 쓴다. React 파일(`.tsx`)의 컴포넌트 임포트는 확장자 없이 쓴다(기존 관례).
- `num`(선수 번호)은 숫자 타입이라 문자열 삽입 시 `esc()` 이스케이프가 필요 없다 — 기존 `data-slot="${i}"` 같은 패턴과 동일하게 취급한다.
- iCloud 레포 주의: `node_modules`가 `node_modules.nosync`로 심볼릭 링크돼 있다 — 이 계획의 어떤 태스크도 `npm install`/`npm uninstall`을 실행하지 않는다(새 의존성이 없다). `git status`는 iCloud에서 멈추는 경우가 있으니 쓰지 않는다.
- 커밋은 `npm test`(unit → build → dist 테스트)가 통과한 뒤에만 한다.

---

### Task 1: `photoHtml()` 헬퍼 + 단위 테스트

**Files:**
- Modify: `src/components/avatar.ts`
- Modify: `tests/unit/avatar.test.mjs`

**Interfaces:**
- Consumes: `href()` — `src/lib/url.ts`, 시그니처 `href(path: string): string` (base 경로를 붙인 절대 경로 문자열을 돌려준다. 이미 파일에 있음, 새로 안 만든다).
- Produces: `photoHtml(num: number, size: number): string` — Task 3이 이 이름·시그니처로 가져다 쓴다.

- [ ] **Step 1: 실패하는 테스트부터 쓴다**

`tests/unit/avatar.test.mjs`의 import 줄(4번째 줄)을 아래로 바꾼다:

```js
import { avatarSvg, photoHtml } from '../../src/components/avatar.ts';
```

파일 맨 끝에 아래 두 테스트를 추가한다:

```js
test('photoHtml: 선수 번호·크기로 img 태그를 만들고, 파일이 없으면 지워지는 onerror가 붙는다', () => {
  const html = photoHtml(9, 112);
  assert.match(html, /<img[^>]*class="pcard-photo"/);
  assert.match(html, /src="[^"]*\/players\/9\.jpg"/);
  assert.match(html, /width="112"/);
  assert.match(html, /height="112"/);
  assert.match(html, /onerror="this\.remove\(\)"/);
  assert.match(html, /alt=""/);
});

test('photoHtml: 선수 번호가 다르면 경로도 다르다(선수별로 서로 다른 파일을 가리킨다)', () => {
  assert.notEqual(photoHtml(9, 112), photoHtml(99, 112));
  assert.match(photoHtml(99, 28), /\/players\/99\.jpg/);
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm run test:unit`
Expected: FAIL — `photoHtml` is not exported / not a function (아직 안 만들었으므로 import 자체가 깨짐)

- [ ] **Step 3: `photoHtml()` 구현**

`src/components/avatar.ts` 6~7번째 줄(기존 import 두 줄) 사이에 새 import를 추가한다 — 최종 import 블록:

```ts
import { esc } from '../lib/html.ts';
import { href } from '../lib/url.ts';
import { PARTS, isUnsetAvatar, type AvatarSpec } from '../lib/avatar.ts';
```

파일 맨 끝(현재 `avatarSvg` 함수가 끝나는 자리, 86번째 줄) 뒤에 새 함수를 추가한다:

```ts

/** 실사 사진 오버레이 — avatarSvg() 출력 앞에 겹쳐 쓴다. 파일이 있으면 사진이
 * SVG를 가리고, 없으면(404) onerror가 이 <img>만 지워 밑에 이미 그려진 SVG가
 * 그대로 드러난다 — 매니페스트 없이 파일 존재 자체가 "사진 있음" 신호다
 * (스펙 4절 · docs/superpowers/specs/2026-09-20-player-photo-cards-design.md).
 * size는 avatarSvg()에 준 것과 같은 값을 넘겨 같은 박스에 겹치게 한다. */
export function photoHtml(num: number, size: number): string {
  return `<img class="pcard-photo" src="${href(`/players/${num}.jpg`)}" alt="" width="${size}" height="${size}" onerror="this.remove()" />`;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm run test:unit`
Expected: PASS — `tests/unit/avatar.test.mjs`의 모든 테스트(기존 것 포함) 통과

- [ ] **Step 5: 커밋**

```bash
git add src/components/avatar.ts tests/unit/avatar.test.mjs
git commit -m "feat(avatar): photoHtml — 실사 사진을 SVG 위에 겹치고 없으면 onerror로 폴백"
```

---

### Task 2: CSS — 사진을 SVG 위에 겹치는 틀

**Files:**
- Modify: `src/styles/tokens.css`

**Interfaces:**
- Consumes: 없음(순수 CSS, Task 1의 `photoHtml()`이 내는 `<img class="pcard-photo">` 마크업을 전제로 스타일만 정의한다).
- Produces: `.pcard-photo` 클래스(카드 초상 자리용), `.avatar-chip` 클래스(스쿼드 표 28px 칸용) — Task 3이 JSX에서 이 클래스명을 그대로 쓴다.

- [ ] **Step 1: `.pcard-portrait`를 포지셔닝 컨테이너로 만든다**

`src/styles/tokens.css` 315번째 줄, 현재:

```css
.pcard-portrait { align-self: flex-end; margin: 0 -4px -6px 0; }
```

아래로 바꾼다:

```css
.pcard-portrait { position: relative; align-self: flex-end; margin: 0 -4px -6px 0; }
```

- [ ] **Step 2: `.pcard-photo` 규칙 추가**

바로 다음 줄(옛 316번째 줄, `.avatar-btn` 규칙) 앞에 새 규칙을 끼워 넣는다 — 최종 모습:

```css
.pcard-portrait { position: relative; align-self: flex-end; margin: 0 -4px -6px 0; }
.pcard-photo { position: absolute; top: 0; left: 0; object-fit: cover; border-radius: 16%; }
.avatar-btn { display: block; min-height: 0; padding: 0; margin: 0; border: 0; border-radius: 0; background: none; cursor: pointer; }
```

(`.pcard-photo`는 `width`/`height` HTML 속성에 그려진 크기를 그대로 쓴다 — SVG 쪽과 같은 방식이라 아래 모바일 오버라이드도 SVG와 나란히 걸 수 있다.)

- [ ] **Step 3: 모바일 카드벽에서 SVG와 나란히 줄어들게 한다**

현재 339번째 줄:

```css
  .pcard-wall .pcard-portrait svg { width: 68px; height: 68px; }
```

아래로 바꾼다(사진도 같은 크기로 줄어들게 셀렉터를 하나 더 붙인다):

```css
  .pcard-wall .pcard-portrait svg, .pcard-wall .pcard-portrait img.pcard-photo { width: 68px; height: 68px; }
```

- [ ] **Step 4: 스쿼드 표 28px 칸용 래퍼 클래스 추가**

`.pcard-photo` 규칙 바로 뒤(위 Step 2에서 넣은 자리 다음 줄)에 추가:

```css
.avatar-chip { position: relative; display: inline-block; line-height: 0; }
```

(표 칸은 `.pcard-portrait` 같은 기존 컨테이너가 없어 새 래퍼가 필요하다 — Task 3에서 이 클래스를 표 칸 `<span>`에 붙인다.)

- [ ] **Step 5: 빌드로 CSS 문법 확인**

Run: `npm run build`
Expected: 빌드 성공(CSS 문법 오류가 있으면 Astro/Vite가 빌드 단계에서 실패한다). 아직 아무 JSX도 이 클래스를 안 쓰므로 시각적 확인은 Task 3 이후에 한다.

- [ ] **Step 6: 커밋**

```bash
git add src/styles/tokens.css
git commit -m "style: 선수 사진을 SVG 아바타 위에 겹치는 오버레이 틀(.pcard-photo, .avatar-chip)"
```

---

### Task 3: 세 자리에 실사 사진 오버레이 연결

**Files:**
- Modify: `src/react/player/PlayerDetail.tsx:12` (import), `:237` (선수 상세 카드 초상)
- Modify: `src/react/squad/RosterList.tsx:7` (import), `:38-39` (표 28px 칸), `:74` (카드 116px 초상)

**Interfaces:**
- Consumes: `photoHtml(num: number, size: number): string`(Task 1, `src/components/avatar.ts`가 export), `.pcard-photo`/`.avatar-chip` CSS 클래스(Task 2, `src/styles/tokens.css`).
- Produces: 없음(이 태스크가 최종 UI 지점 — 이후 태스크가 여기 결과물을 더 가져다 쓰지 않는다).

- [ ] **Step 1: `PlayerDetail.tsx` — import에 `photoHtml` 추가**

12번째 줄, 현재:

```tsx
import { avatarSvg } from '../../components/avatar';
```

아래로 바꾼다:

```tsx
import { avatarSvg, photoHtml } from '../../components/avatar';
```

- [ ] **Step 2: `PlayerDetail.tsx` — 선수 상세 카드 초상(112px)에 사진을 SVG 앞에 겹친다**

237번째 줄, 현재:

```tsx
              dangerouslySetInnerHTML={{ __html: playerCard(player, `<button type="button" id="avatar-edit-btn" class="avatar-btn" title="아바타 편집">${avatarSvg(avatarSpecFor(player.num, player.avatar), 112, player.num, true)}</button>`) }}
```

아래로 바꾼다:

```tsx
              dangerouslySetInnerHTML={{ __html: playerCard(player, `<button type="button" id="avatar-edit-btn" class="avatar-btn" title="아바타 편집">${photoHtml(player.num, 112)}${avatarSvg(avatarSpecFor(player.num, player.avatar), 112, player.num, true)}</button>`) }}
```

208번째 줄(아바타 편집 모달 미리보기, 120px)은 **그대로 둔다** — Global Constraints에 적힌 대로 그 자리엔 사진을 얹지 않는다.

- [ ] **Step 3: `PlayerDetail.tsx` 확인 — 208번째 줄이 안 바뀌었는지**

Run: `grep -n "avatarSvg(avatarSpec, 120)" src/react/player/PlayerDetail.tsx`
Expected: 한 줄 매치(아바타 편집 모달 미리보기 줄) — `photoHtml`이 안 섞여 있어야 한다.

- [ ] **Step 4: `RosterList.tsx` — import에 `photoHtml` 추가**

7번째 줄, 현재:

```tsx
import { avatarSvg } from '../../components/avatar';
```

아래로 바꾼다:

```tsx
import { avatarSvg, photoHtml } from '../../components/avatar';
```

- [ ] **Step 5: `RosterList.tsx` — 표 28px 칸에 사진 겹치기**

38~39번째 줄, 현재:

```tsx
    { title: '', key: 'avatar', align: 'center', width: 44,
      render: (_, p) => <span dangerouslySetInnerHTML={{ __html: avatarSvg(avatarSpecFor(p.num, p.avatar), 28, p.num) }} /> },
```

아래로 바꾼다:

```tsx
    { title: '', key: 'avatar', align: 'center', width: 44,
      render: (_, p) => <span className="avatar-chip" dangerouslySetInnerHTML={{ __html: photoHtml(p.num, 28) + avatarSvg(avatarSpecFor(p.num, p.avatar), 28, p.num) }} /> },
```

- [ ] **Step 6: `RosterList.tsx` — 카드 116px 초상에 사진 겹치기**

74번째 줄, 현재:

```tsx
                  dangerouslySetInnerHTML={{ __html: playerCard(p, avatarSvg(avatarSpecFor(p.num, p.avatar), 116, p.num, true)) }} />
```

아래로 바꾼다:

```tsx
                  dangerouslySetInnerHTML={{ __html: playerCard(p, photoHtml(p.num, 116) + avatarSvg(avatarSpecFor(p.num, p.avatar), 116, p.num, true)) }} />
```

- [ ] **Step 7: 단위 테스트 + 빌드 확인**

Run: `npm test`
Expected: PASS — unit 테스트(Task 1에서 이미 통과 확인함), `astro build`, `tests/build/dist.test.mjs` 전부 통과(이 태스크는 dist 테스트를 아직 안 건드렸으므로 기존 것만 돈다).

- [ ] **Step 8: 커밋**

```bash
git add src/react/player/PlayerDetail.tsx src/react/squad/RosterList.tsx
git commit -m "feat(squad,player): 선수 상세·스쿼드 표·카드 초상에 실사 사진 오버레이 연결"
```

---

### Task 4: `public/players/` 운영 문서 + dist 통과 확인

**Files:**
- Create: `public/players/README.md`
- Modify: `tests/build/dist.test.mjs`

**Interfaces:**
- Consumes: 없음.
- Produces: 없음(레포 안에서 관리자가 읽는 운영 문서 — 코드가 이 파일 내용을 파싱하지 않는다).

- [ ] **Step 1: 운영 문서 작성**

`public/players/README.md`를 새로 만든다:

```markdown
# 선수 사진 (실사 카드)

이 폴더에 `{선수번호}.jpg`를 넣으면 앱 전체(선수 상세·스쿼드 표·스쿼드 카드)에서
자동으로 그 사진이 뜬다. 파일이 없는 선수는 지금처럼 SVG 아바타가 그대로 뜬다 —
전원이 사진을 가질 필요는 없다.

## 규약

- 파일명: `{선수번호}.jpg` (예: 9번 선수 → `9.jpg`). 확장자는 `.jpg`로 고정.
- 크기: 커밋 전에 가로 400~600px 정도로 줄여서 넣는다. 표시 크기는 최대 116px이라
  영상 원본(최대 1080p) 그대로 넣으면 불필요하게 무거워진다.
- 자르기: 미리 정사각으로 자를 필요 없다 — 앱이 중앙 기준으로 잘라 보여준다
  (`object-fit: cover`).

## 선수 삭제 시 반드시 같이 지운다

선수 번호는 탈퇴한 선수의 번호를 새 선수가 재사용한다. 사진 파일을 안 지우면
새로 들어온 선수한테 옛 선수 사진이 그대로 넘어간다 — 선수를 앱에서 삭제할 때는
이 폴더의 해당 번호 파일도 같이 지운다.

## 사진 고르는 기준

- 뒷모습·측면·원거리 샷을 우선한다. 정면 클로즈업은 피한다.
- 여러 명이 잡힌 사진도 괜찮다 — 본인이 중앙 근처에 있는 프레임이면 된다.
- 편치 않은 선수는 안 넣어도 된다. 안 넣으면 그냥 기존 SVG 아바타로 남는다.

(설계 배경: `docs/superpowers/specs/2026-09-20-player-photo-cards-design.md`)
```

- [ ] **Step 2: dist에 그대로 배포되는지 실패하는 테스트부터 쓴다**

`tests/build/dist.test.mjs` 맨 끝에 추가:

```js
test('선수 사진 폴더가 정적 자산으로 그대로 배포된다(수동 배치 규약, 스펙 3·6절)', () => {
  assert.ok(existsSync('dist/players/README.md'), 'dist/players/README.md 없음 — public/players/ 가 빌드에 안 실렸다');
});
```

- [ ] **Step 3: 빌드 전이면 실패 확인**

Run: `rm -rf dist && npm run test:build`
Expected: FAIL — `dist/` 자체가 없어 모든 dist 테스트가 실패(README.md 유무 이전에 dist 폴더가 없음). 이건 "아직 안 만들어서 실패"가 아니라 "아직 안 빌드해서 실패"인 정상 상태 — 다음 스텝에서 빌드한다.

- [ ] **Step 4: 빌드 후 통과 확인**

Run: `npm test`
Expected: PASS — `npm run build`가 `public/players/README.md`를 `dist/players/README.md`로 그대로 복사하고, 새 테스트를 포함한 `tests/build/dist.test.mjs` 전체가 통과한다.

- [ ] **Step 5: 커밋**

```bash
git add public/players/README.md tests/build/dist.test.mjs
git commit -m "docs(players): 실사 사진 수동 배치 운영 문서 + dist 통과 테스트"
```

---

### Task 5 (컨트롤러 전용 — 서브에이전트에 위임하지 않는다): 브라우저 검증

**목적:** Task 1~4는 문자열·CSS·정적 파일 조립이 맞는지까지만 검증한다. 실제로 사진이
SVG 위에 뜨는지, 파일이 없을 때 정말 SVG로 되돌아가는지는 헤드리스 브라우저로 직접 봐야
안다 — 이전 3개 단계(2·3·4단계)에서도 이 성격의 확인은 항상 컨트롤러가 CDP로 직접
했다(서브에이전트가 대신할 수 없는 단계).

- [ ] **Step 1: 임시 테스트 사진 하나를 로컬에만 놓는다(커밋 안 함)**

스쿼드 명단에서 실제로 존재하는 선수 번호 하나를 골라(예: 현재 시트의 아무 선수 번호),
그 번호로 아무 JPG 파일이나 `public/players/{번호}.jpg`에 임시로 둔다. 이 파일은
검증 전용이라 **Task 완료 후 삭제하고 커밋하지 않는다**(수동 배치는 관리자의 몫 — 이번
단계에서 실제 선수 사진을 레포에 넣는 게 목적이 아니다).

- [ ] **Step 2: `npm run build && npm run preview`로 로컬 서버를 띄우고 CDP로 확인**

스크래치패드에 검증 스크립트를 하나 짠다(기존 `cdp.mjs` 드라이버 재사용, 3·4단계의
`steps-antdN.mjs` 패턴을 따른다). 아래를 전부 확인한다:

- 사진을 넣은 선수: 선수 상세 페이지(112px), 스쿼드 표(28px), 스쿼드 카드(116px) 세
  자리 전부에서 `<img class="pcard-photo">`가 로드돼 보이는지(`naturalWidth > 0`).
- 같은 선수의 아바타 편집 모달(120px)엔 사진이 **안 뜨고** SVG만 있는지(Global
  Constraints의 예외가 실제로 지켜지는지).
- 사진을 안 넣은 다른 선수: 네 자리 전부 기존 SVG 아바타가 그대로 뜨는지(회귀 없음) —
  `<img class="pcard-photo">`가 DOM에 남아있지 않은지(onerror가 지웠는지) 확인한다.
- 모바일 폭(390px)에서 스쿼드 카드벽의 사진이 SVG와 같이 68px로 줄어드는지
  (`getBoundingClientRect()`로 실측).

- [ ] **Step 3: 임시 사진 제거**

Run: `rm public/players/{번호}.jpg`
Expected: `git status`(iCloud라 대신 `git diff --stat`로 변경 없음 확인) — 이 파일이 애초에
untracked였으므로 커밋 이력에 안 남는다.

- [ ] **Step 4: 최종 `npm test` 재확인**

Run: `npm test`
Expected: PASS(임시 파일 제거 후에도 전부 통과 — 사진 없는 상태가 기본이라는 걸 재확인).

이 태스크는 커밋을 만들지 않는다(검증만).
