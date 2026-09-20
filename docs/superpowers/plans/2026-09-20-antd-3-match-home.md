# Ant Design 3단계(매치·홈) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 매치 탭(`/match/`)의 영상 목록과 홈(`/`)의 대시보드 타일을 antd `Card`로 옮긴다. 영상 상세 임베드는 직접 만든 채로 둔다. 「내 선수」 타일을 누르면 상단바 섬이 이름 고르기 모달을 여는 연결을 DOM 참조 대신 이벤트로 바꾼다.

**Architecture:** 두 페이지 모두 사이에 끼는 정적 본문이 없어 섬 하나씩(`MatchApp`, `HomeApp`). 계산은 각각 `src/react/match/model.ts`·`src/react/home/model.ts` 순수 함수로 떼어 단위 테스트한다. 홈·매치 둘 다 페이지 머리(제목+보조 버튼)를 섬 안에서 그린다(2단계에서 확정한 원칙 — Astro와 섬으로 나누면 `id` 중복·상태 분리가 생긴다).

**Tech Stack:** Astro 7.3, React 19.3, antd 6.6.4, Node `node --test`

**Spec:** `docs/superpowers/specs/2026-09-15-antd-migration-design.md` — §5 3단계 행, §4 상태, §6 오류, §7 검증. 0~2단계 계획(main `de03b00`)의 산출물 위에서 한다.

## 설계 판단 둘 — antd Card를 문자 그대로 쓰는 법

스펙 §5는 "영상 목록은 Card 격자, 홈 타일은 Card"라고 분명히 적었다(2단계의 "정보는 Descriptions"처럼 모호하지 않다). 사용자에게 확인한 결과 **홈 타일도 문자 그대로 antd Card로 바꾸기로 했다**(2026-09-20 결정) — 도메인 시각 요소로 남기는 대안도 제시했지만 이쪽을 골랐다.

이번엔 2단계에서 배운 방식(래퍼가 기존 CSS 자식 결합자를 깨는 문제)을 미리 막는다:

1. **매치 영상 카드**(`.thumb`)는 이미지+두 줄 글자뿐이라 그대로 옮긴다. 배경은 antd 기본값(`colorBgContainer` = `--card`)이 이미 `.thumb`의 배경과 같아 손댈 게 없고, `variant="borderless"`로 테두리만 없앤다.
2. **홈 타일**(`.tile`)은 `tile-big { margin-top: auto }`로 아래로 밀어 붙이는 flex 배치가 핵심이라, antd Card의 몸통 div(`.ant-card-body`)가 그 사이에 끼면 flex 부모-자식 관계가 끊긴다. `styles={{ body: { padding: 0, display: 'contents' } }}`로 몸통을 레이아웃에서 투명하게 만든다 — Astro의 `astro-island { display: contents }`와 같은 기법이고, 2단계 최종 리뷰에서 확인한 바로 그 성질(그 요소의 박스가 사라지고 자식이 부모의 직계 자식이 된다)을 그대로 쓴다. 배경(`--elevated`, `.thumb`과 다른 값)·정렬·여백은 클래스 캐스케이드 순서에 기대지 않고 `style` prop(인라인, 항상 이긴다)으로 준다. `:hover`만 인라인이 안 되므로 `.tile:hover` CSS는 그대로 둔다.
3. **네비게이션 타일**은 `<a style={{ display: 'contents' }} href={...}>` 로 Card를 감싼다 — 앵커도 레이아웃에서 투명해지므로 그리드 자리(`.tile-wide { grid-column: span 2 }`)는 그 안의 Card가 그대로 차지하고, 클릭은 버블링으로 앵커까지 올라간다.
4. **「내 선수」 빈 자리**(이름을 안 고른 상태)는 내비게이션이 아니라 눌러서 모달을 여는 컨트롤이다. 지금은 진짜 `<button>`이지만 Card는 항상 `<div>`를 그린다 — `role="button" tabIndex={0}` + Enter/Space `onKeyDown`으로 키보드 조작을 최대한 보존한다(사용자가 이 트레이드오프를 알고 선택했다).

세 경우 다 이번 단계에서만 쓰는 방식이라 `theme.ts`에 공용 `components.Card` 토큰을 추가하지 않는다 — 매치·홈이 필요로 하는 배경이 서로 달라(각각 `--card`·`--elevated`) 전역 토큰 하나로 둘 다 못 맞춘다.

## Global Constraints

- 버전: 새 패키지 없음(antd·React 이미 설치돼 있다).
- 테마 값은 `src/react/theme.ts` 한 곳. 이 단계는 `components.Card`를 추가하지 않는다(위 판단 참고) — 인스턴스별 `style`·`styles` prop으로만 맞춘다.
- 겉모습은 지금 유지. 매치 카드는 `.thumb`, 홈 타일은 `.tile`/`.tile-wide`/`.tile-duo`/`.tile-thumbs` 클래스명을 그대로 얹어 기존 CSS 값을 그대로 쓴다(새 CSS 값을 만들지 않는다). `.thumb .body` 셀렉터만 `.thumb .ant-card-body`로 바꾼다(antd가 실제로 그리는 몸통 클래스가 다르다).
- **이 사이트는 완전 정적 빌드다.** `?v=` 쿼리스트링은 `Astro.url`이 아니라 브라우저의 `window.location.search`를 컴포넌트 안에서 읽는다(2단계 `?new=1` 버그와 같은 함정 — `Astro.url.searchParams`는 빌드 시점에 항상 비어 있다).
- 바꾸지 않는 것: `server/`, 시트 열, `src/lib/api.ts` 계약, 주소 구조, noindex, `src/lib` 순수 로직(`match-videos.ts`·`rotation.ts`·`stats.ts` 등), 영상 임베드(iframe)는 직접 만든 채로.
- 홈 「내 선수」 연결을 이벤트로 바꾼다: 상단바 섬(`TopbarActions.tsx`)이 `wfc:open-me` 이벤트를 받으면 이름 고르기 모달을 연다. 지금처럼 `document.getElementById('me-btn')`을 DOM으로 찾아 대신 누르는 방식은 걷어낸다.
- 데이터가 오기 전(`data === null`)엔 제목 자리만 그리고 본문은 그리지 않는다(홈은 `useData`, 매치는 `loadVideos()`만 쓰고 `useData`는 필요 없다 — 관리자 데이터를 안 쓴다).
- 관리자 PIN은 에이전트가 입력하지 않는다(이 단계는 관리자 동작이 없다 — 매치·홈 둘 다 읽기 전용).
- 레포가 iCloud 안이다: `git status` 금지. `git add <경로>`로만 스테이징하고 확인은 `git diff --cached --stat`. `src/data/videos.ts`·`public/antd.css`·`* 2.*`는 커밋하지 않는다.
- `npm install`·`npm ci` 금지(새 패키지 없음 — 안 써도 된다).
- 주석·문구는 한국어, 주변 코드의 밀도·말투를 따른다. React 파일 import는 확장자 없이, Node 단위 테스트가 직접 불러오는 `model.ts`만 값 import에 `.ts`를 붙인다.
- 커밋 메시지 끝:
  ```
  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01DaDPzugZyKUdGnpyTH5KY4
  ```
- 완료 판정은 `npm test` 통과. `astro check`/`tsc`는 돌리지 않는다.

## 파일 구조

| 파일 | 책임 | 태스크 |
|---|---|---|
| `src/react/match/model.ts` | 쿼리스트링 파싱, 영상 찾기·메타 문구, 유효한 유튜브 id 확인 | 1 |
| `tests/unit/match-model.test.mjs` | model.ts | 1 |
| `src/react/match/MatchApp.tsx` | 섬 — 목록(Card 격자)·상세(iframe 유지) | 1 |
| `src/pages/match/index.astro` | 섬 하나로 교체 | 1 |
| `src/react/home/model.ts` | 요약 계산(내 선수·스쿼드·매치·봉사·미납·최신 영상) | 2 |
| `tests/unit/home-model.test.mjs` | model.ts | 2 |
| `src/react/home/HomeApp.tsx` | 섬 — 히어로(직접 만든 채로)+타일 8개(Card) | 3 |
| `src/pages/index.astro` | 섬 하나로 교체 | 3 |
| `src/react/shell/TopbarActions.tsx` | `wfc:open-me` 이벤트 수신 | 3 |
| `src/styles/tokens.css` | `.thumb .ant-card-body` 규칙 추가 | 1 |
| `tests/build/dist.test.mjs` | 매치·홈 빌드 결과 검사 | 1, 3 |

## 컨트롤러 준비(태스크 전)

- [ ] 브랜치 `antd-3-match-home`을 `main`(`de03b00`)에서 만든다. 새 패키지 설치는 없다.

---

### Task 1: 매치 탭 — `model.ts` · `MatchApp` 섬

**Files:**
- Create: `src/react/match/model.ts`
- Test: `tests/unit/match-model.test.mjs`
- Create: `src/react/match/MatchApp.tsx`
- Modify: `src/pages/match/index.astro`
- Modify: `src/styles/tokens.css:242`(1단계 기준 줄 번호, 내용으로 찾는다 — `.thumb .body { ... }`)
- Test: `tests/build/dist.test.mjs`

**Interfaces:**
- Consumes (기존): `matchVideos(videos): MatchVideo[]` from `src/lib/match-videos.ts`; `loadVideos(): Promise<Video[]>` from `src/lib/api.ts`; `esc`, `fmtDate`, `ytThumb`, `ytEmbed`, `ytWatch` from `src/lib/html.ts`; `href` from `src/lib/url.ts`; `MatchVideo`, `Video` types
- Produces (Task 4가 확인만 한다 — 다른 태스크가 이 파일을 더 쓰지 않는다), `src/react/match/model.ts`:
  - `export const isValidVideoId: (id: string) => boolean`
  - `export const findVideo: (list: MatchVideo[], id: string) => MatchVideo | undefined`
  - `export const videoMeta: (m: Pick<MatchVideo, 'type' | 'location'>) => string`
  - `export const currentVideoId: (search: string) => string`

- [ ] **Step 1: 실패하는 단위 테스트 작성** — `tests/unit/match-model.test.mjs`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { currentVideoId, findVideo, isValidVideoId, videoMeta } from '../../src/react/match/model.ts';

const M = (id, over = {}) => ({ id, date: '2026-09-12', type: '2파전', location: '모란공원', title: '제목', ...over });

test('isValidVideoId: 유튜브 id 모양(글자·숫자·-·_ 11자)만 참', () => {
  assert.equal(isValidVideoId('Om_WSY8poZc'), true);
  assert.equal(isValidVideoId(''), false);
  assert.equal(isValidVideoId('too-short'), false);
  assert.equal(isValidVideoId('열한글자도넘음됨됨됨'), false);
});
test('findVideo: id 로 찾고 없으면 undefined', () => {
  const list = [M('a'), M('b')];
  assert.equal(findVideo(list, 'b'), list[1]);
  assert.equal(findVideo(list, 'z'), undefined);
});
test('videoMeta: 유형·장소를 가운뎃점으로, 둘 다 없으면 빈 문자열', () => {
  assert.equal(videoMeta(M('a')), '2파전 · 모란공원');
  assert.equal(videoMeta(M('a', { type: '' })), '모란공원');
  assert.equal(videoMeta(M('a', { type: '', location: '' })), '');
});
test('currentVideoId: ?v= 값을 읽고 없으면 빈 문자열', () => {
  assert.equal(currentVideoId('?v=abc'), 'abc');
  assert.equal(currentVideoId(''), '');
  assert.equal(currentVideoId('?other=1'), '');
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/unit/match-model.test.mjs`
Expected: FAIL — `Cannot find module .../src/react/match/model.ts`

- [ ] **Step 3: 구현** — `src/react/match/model.ts`

```ts
// src/react/match/model.ts — 매치 탭 계산. 화면(MatchApp)과 떨어뜨려 단위 테스트한다.
import type { MatchVideo } from '../../lib/match-videos.ts';

/** 유튜브 영상 id 모양 확인 — 시트 없이 ?v= 값만으로 상세를 그릴 때 엉뚱한 값을 막는다(옛 페이지와 같은 정규식). */
export const isValidVideoId = (id: string): boolean => /^[\w-]{11}$/.test(id);
export const findVideo = (list: MatchVideo[], id: string): MatchVideo | undefined => list.find((x) => x.id === id);
/** 카드 보조 줄 — 유형·장소를 가운뎃점으로. 옛 페이지의 meta() 그대로. */
export const videoMeta = (m: Pick<MatchVideo, 'type' | 'location'>): string => [m.type, m.location].filter(Boolean).join(' · ');
/** ?v= 값 읽기 — 브라우저에서만 부른다(빌드 시점엔 진짜 쿼리스트링이 없다). */
export const currentVideoId = (search: string): string => new URLSearchParams(search).get('v') ?? '';
```

- [ ] **Step 4: 통과 확인**

Run: `node --test tests/unit/match-model.test.mjs`
Expected: PASS 4/4(assert 안 세부 항목 포함 총 10개 이상의 assert, 4 test)

- [ ] **Step 5: CSS** — `src/styles/tokens.css`의 `.thumb .body { padding: var(--s-sm) var(--s-md); font-size: var(--fs-sm); }` 줄을 찾아 그 아래에 추가(줄은 지우지 않는다 — 다른 곳에서 `.body` 클래스를 쓸 경우를 대비해 남긴다):

```css
.thumb .body { padding: var(--s-sm) var(--s-md); font-size: var(--fs-sm); }
/* antd Card 가 실제로 그리는 몸통 클래스는 .body 가 아니라 .ant-card-body 다. */
.thumb .ant-card-body { padding: var(--s-sm) var(--s-md); font-size: var(--fs-sm); }
```

- [ ] **Step 6: 실패하는 dist 테스트 작성** — `tests/build/dist.test.mjs` 끝에

```js
test('매치 탭 — 영상 목록은 antd Card 격자, 상세는 iframe 유지, MatchApp 섬 하나', () => {
  const html = read('match/index.html');
  const island = html.match(/<astro-island[^>]*component-url="\/weekly-fc\/_astro\/MatchApp\.[^"]+\.js"[^>]*>/);
  assert.ok(island, 'MatchApp 섬 없음');
  assert.ok(island[0].includes('client="load"'), 'client:load 아님');
  assert.ok(html.includes('id="title"') && html.includes('id="actions"'), '제목·버튼 자리 없음');
  assert.ok(!/match\/index\.astro_astro_type_script/.test(html), '옛 페이지 스크립트가 남음');
});
```

- [ ] **Step 7: 실패 확인**

Run: `npm run build && node --test tests/build/dist.test.mjs`
Expected: FAIL(`MatchApp 섬 없음`)

- [ ] **Step 8: 섬 구현** — `src/react/match/MatchApp.tsx`

```tsx
// 매치 탭 = 채널 영상 목록(시트 매치 기록·관리자 가져오기는 쓰지 않는다, 스펙 §3.4).
// ?v= 로 상세(임베드), 없으면 목록(antd Card 격자). 완전 정적 빌드라 ?v= 는 브라우저에서만 읽는다.
import { Card } from 'antd';
import { useEffect, useState } from 'react';
import { loadVideos } from '../../lib/api';
import { esc, fmtDate, ytEmbed, ytThumb, ytWatch } from '../../lib/html';
import { matchVideos } from '../../lib/match-videos';
import type { MatchVideo } from '../../lib/match-videos';
import { href } from '../../lib/url';
import ThemeRoot from '../ThemeRoot';
import { currentVideoId, findVideo, isValidVideoId, videoMeta } from './model';

function App() {
  const [list, setList] = useState<MatchVideo[] | null>(null);
  const [vid] = useState(() => (typeof window !== 'undefined' ? currentVideoId(window.location.search) : ''));

  useEffect(() => {
    loadVideos().then((v) => setList(matchVideos(v))).catch(() => setList([]));
  }, []);

  if (vid) {
    const m = list ? findVideo(list, vid) : undefined;
    const id = m?.id ?? (isValidVideoId(vid) ? vid : '');
    return (
      <>
        <div className="page-head">
          <h1 id="title">{m?.date ? fmtDate(m.date) : '매치'}</h1>
          <div className="actions" id="actions">
            <a className="chip" href={href('/match/')}>← 목록</a>
            {id && <a className="chip" href={ytWatch(id)} target="_blank" rel="noopener">유튜브에서 보기 →</a>}
          </div>
        </div>
        {list === null ? null : id ? (
          <div className="stack" id="app">
            {m && videoMeta(m) && <p className="muted">{videoMeta(m)}</p>}
            <div className="embed"><iframe src={ytEmbed(id)} title={m?.title || '매치 영상'} loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen /></div>
          </div>
        ) : (
          <div className="stack" id="app"><p className="muted">영상을 찾을 수 없습니다.</p></div>
        )}
      </>
    );
  }

  return (
    <>
      <div className="page-head">
        <h1 id="title">매치 {list && <span className="muted" id="count">{list.length}편</span>}</h1>
        <div className="actions" id="actions" />
      </div>
      <div className="stack" id="app">
        {list && (
          list.length ? (
            <div className="thumbs">
              {list.map((m) => (
                <a key={m.id} href={href(`/match/?v=${encodeURIComponent(m.id)}`)} style={{ display: 'contents' }}>
                  <Card className="thumb" variant="borderless" cover={<img src={ytThumb(m.id)} alt="" loading="lazy" />}>
                    <b>{m.date ? esc(fmtDate(m.date)) : esc(m.title)}</b>
                    <div className="muted">{videoMeta(m) || esc(m.title)}</div>
                  </Card>
                </a>
              ))}
            </div>
          ) : <p className="muted">채널 영상을 불러오지 못했습니다.</p>
        )}
      </div>
    </>
  );
}

export default function MatchApp() {
  return <ThemeRoot><App /></ThemeRoot>;
}
```

`esc()`는 antd Card 자식이 JSX라 실제로는 필요 없지만(React가 자동으로 이스케이프한다), 날짜·제목 문자열에 그대로 남겨 옛 코드와 같은 자리에서 같은 함수를 거치게 한다 — 동작은 같고 다음에 지워도 안전하다.

- [ ] **Step 9: 페이지 교체** — `src/pages/match/index.astro` 전체

```astro
---
import Shell from '../../layouts/Shell.astro';
import MatchApp from '../../react/match/MatchApp.tsx';
---
<Shell title="매치">
  <MatchApp client:load />
</Shell>
```

- [ ] **Step 10: 전체 테스트 통과 확인**

Run: `npm test`
Expected: 단위 전부 PASS(match-model 포함), 빌드 성공, dist 전부 PASS(매치 탭 테스트 포함)

- [ ] **Step 11: 커밋**

```bash
git add src/react/match/model.ts src/react/match/MatchApp.tsx src/pages/match/index.astro src/styles/tokens.css tests/unit/match-model.test.mjs tests/build/dist.test.mjs
git diff --cached --stat
git commit -m "feat(antd): 매치 탭 — 영상 목록은 antd Card 격자, 상세 임베드는 그대로

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DaDPzugZyKUdGnpyTH5KY4"
```

<!-- NEXT -->

### Task 2: 홈 계산 — `model.ts`

**Files:**
- Create: `src/react/home/model.ts`
- Test: `tests/unit/home-model.test.mjs`

**Interfaces:**
- Consumes (기존): `rotationFor(players, sheet, year, month, now?): RotationRow` from `src/lib/rotation.ts`; `fineSummary(fines)`, `ovr(player)` from `src/lib/stats.ts`; `matchVideos(videos)` from `src/lib/match-videos.ts`; `Data`, `Player`, `Video` types
- Produces (Task 3이 쓴다), `src/react/home/model.ts`:
  - `export type MeTile = { kind: 'picked'; ovr: number; name: string; pos: string; num: number } | { kind: 'empty' }`
  - `export type DutyTile = { p1: string; p2: string; monthLabel: string; sub: string }`
  - `export type RecentMatch = { id: string; typeLabel: string; date: string } | null`
  - `export type HomeSummary = { meTile: MeTile; squadCount: number; posSummary: string; matchCount: number; duty: DutyTile; dutyNext: DutyTile; unpaidAmount: number; unpaidCount: number; videoCount: number; thumbIds: string[]; recentMatch: RecentMatch; stamp: string }`
  - `export function nextMonthOf(y: number, mo: number): { y: number; mo: number }`
  - `export function computeHomeSummary(data: Data, videos: Video[], me: number | null, now: Date): HomeSummary`

- [ ] **Step 1: 실패하는 단위 테스트 작성** — `tests/unit/home-model.test.mjs`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeHomeSummary, nextMonthOf } from '../../src/react/home/model.ts';

const P = (num, name, pos, over = {}) => ({ num, name, pos, detail: '', foot: '', vest: null, note: '', pace: 70, dribble: 70, pass: 70, shoot: 70, defend: 70, stamina: 70, rot: null, avatar: '', phone: '', ...over });
const players = [P(7, '김민수', 'MF', { rot: 1 }), P(9, '박지훈', 'FW', { pace: 85, dribble: 80, shoot: 88, pass: 70, defend: 40, stamina: 75 }), P(3, '이서준', 'DF')];
const fines = [
  { id: 'f1', date: '2026-09-12', match_id: '', player: '박지훈', type: '지각', amount: 30000, paid: false },
  { id: 'f2', date: '2026-09-05', match_id: '', player: '김민수', type: '노쇼', amount: 50000, paid: true },
];
const rotation = [{ year: 2026, month: 9, p1: '김민수', p2: '이서준', done: false }];
const data = { players, matches: [], rotation, fines, lineups: [] };
// 제목 형식은 src/lib/parse.ts 의 parseVideoTitle 규칙("YYMMDD | 유형 | 장소")을 따른다.
const videos = [
  { id: 'v1', title: '260913 | 2파전 | 모란공원', published: '2026-09-13T00:00:00Z' },
  { id: 'v2', title: '260906 | 3파전 | 위례공원', published: '2026-09-06T00:00:00Z' },
];
const now = new Date(2026, 8, 15); // 2026-09-15, rotation 시트와 같은 달

test('nextMonthOf: 12월 다음은 다음 해 1월', () => {
  assert.deepEqual(nextMonthOf(2026, 9), { y: 2026, mo: 10 });
  assert.deepEqual(nextMonthOf(2026, 12), { y: 2027, mo: 1 });
});

test('computeHomeSummary: 이름을 골랐으면 meTile 이 picked, OVR·포지션 포함', () => {
  const s = computeHomeSummary(data, videos, 9, now);
  assert.deepEqual(s.meTile, { kind: 'picked', ovr: 73, name: '박지훈', pos: 'FW', num: 9 }); // (85+80+88+70+40+75)/6 = 73
});
test('computeHomeSummary: 이름 안 골랐으면 meTile 이 empty', () => {
  assert.deepEqual(computeHomeSummary(data, videos, null, now).meTile, { kind: 'empty' });
});
test('computeHomeSummary: 스쿼드 인원·포지션 요약', () => {
  const s = computeHomeSummary(data, videos, null, now);
  assert.equal(s.squadCount, 3);
  assert.equal(s.posSummary, 'GK 0 · DF 1 · MF 1 · FW 1');
});
test('computeHomeSummary: 매치 = 채널 영상 수(파싱 실패해도 전부 센다)', () => {
  assert.equal(computeHomeSummary(data, videos, null, now).matchCount, 2);
});
test('computeHomeSummary: 이번 달·다음 달 봉사 — 시트 값 우선', () => {
  const s = computeHomeSummary(data, videos, null, now);
  assert.deepEqual(s.duty, { p1: '김민수', p2: '이서준', monthLabel: '2026년 9월', sub: '대관비·조끼·정산' });
  assert.equal(s.dutyNext.monthLabel, '2026년 10월');
});
test('computeHomeSummary: 미납 벌금 합계·건수', () => {
  const s = computeHomeSummary(data, videos, null, now);
  assert.equal(s.unpaidAmount, 30000);
  assert.equal(s.unpaidCount, 1);
});
test('computeHomeSummary: 최신 영상 4개 썸네일, 최근 매치 = 가장 최근 영상', () => {
  const s = computeHomeSummary(data, videos, null, now);
  assert.equal(s.videoCount, 2);
  assert.deepEqual(s.thumbIds, ['v1', 'v2']);
  assert.equal(s.recentMatch.id, 'v1');
});
test('computeHomeSummary: 영상이 없으면 최근 매치 null, 도장 문구', () => {
  const s = computeHomeSummary(data, [], null, now);
  assert.equal(s.recentMatch, null);
  assert.equal(s.stamp, '3명 · 영상 0');
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/unit/home-model.test.mjs`
Expected: FAIL — `Cannot find module .../src/react/home/model.ts`

- [ ] **Step 3: 구현** — `src/react/home/model.ts`

```ts
// src/react/home/model.ts — 홈 대시보드 계산. 화면(HomeApp)과 떨어뜨려 단위 테스트한다.
import { matchVideos } from '../../lib/match-videos.ts';
import { rotationFor } from '../../lib/rotation.ts';
import { fineSummary, ovr } from '../../lib/stats.ts';
import { monthLabel } from '../../lib/html.ts';
import type { Data, Video } from '../../lib/types.ts';

export type MeTile = { kind: 'picked'; ovr: number; name: string; pos: string; num: number } | { kind: 'empty' };
export type DutyTile = { p1: string; p2: string; monthLabel: string; sub: string };
export type RecentMatch = { id: string; typeLabel: string; date: string } | null; // typeLabel: 매치 유형(예 "2파전") — 영상 제목이 아니다
export type HomeSummary = {
  meTile: MeTile; squadCount: number; posSummary: string; matchCount: number;
  duty: DutyTile; dutyNext: DutyTile; unpaidAmount: number; unpaidCount: number;
  videoCount: number; thumbIds: string[]; recentMatch: RecentMatch; stamp: string;
};

/** 다음 달 — 12월 다음은 다음 해 1월. */
export const nextMonthOf = (y: number, mo: number): { y: number; mo: number } => (mo >= 12 ? { y: y + 1, mo: 1 } : { y, mo: mo + 1 });

export function computeHomeSummary(data: Data, videos: Video[], me: number | null, now: Date): HomeSummary {
  const y = now.getFullYear(), mo = now.getMonth() + 1;
  const dutyRow = rotationFor(data.players, data.rotation, y, mo, now);
  const nm = nextMonthOf(y, mo);
  const dutyNextRow = rotationFor(data.players, data.rotation, nm.y, nm.mo, now);
  const fs = fineSummary(data.fines);
  const p = data.players.find((x) => x.num === me);
  const meTile: MeTile = p ? { kind: 'picked', ovr: ovr(p), name: p.name, pos: p.pos || '–', num: p.num } : { kind: 'empty' };
  const posSummary = (['GK', 'DF', 'MF', 'FW'] as const).map((k) => `${k} ${data.players.filter((x) => x.pos === k).length}`).join(' · ');
  const mv = matchVideos(videos);
  const first = mv[0];
  return {
    meTile, squadCount: data.players.length, posSummary, matchCount: mv.length,
    duty: { p1: dutyRow.p1, p2: dutyRow.p2, monthLabel: monthLabel(y, mo), sub: dutyRow.done ? '완료' : '대관비·조끼·정산' },
    dutyNext: { p1: dutyNextRow.p1, p2: dutyNextRow.p2, monthLabel: monthLabel(nm.y, nm.mo), sub: monthLabel(nm.y, nm.mo) },
    unpaidAmount: fs.unpaid, unpaidCount: fs.unpaidCount,
    videoCount: videos.length, thumbIds: videos.slice(0, 4).map((v) => v.id),
    recentMatch: first ? { id: first.id, typeLabel: first.type || '매치', date: first.date } : null,
    stamp: `${data.players.length}명 · 영상 ${videos.length}`,
  };
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test tests/unit/home-model.test.mjs`
Expected: PASS 8/8

- [ ] **Step 5: 커밋**

```bash
git add src/react/home/model.ts tests/unit/home-model.test.mjs
git diff --cached --stat
git commit -m "feat(antd): 홈 대시보드 계산을 순수 함수로 — 내 선수·스쿼드·봉사·미납·최신 영상

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DaDPzugZyKUdGnpyTH5KY4"
```

<!-- NEXT -->

### Task 3: 홈 — `HomeApp` 섬(Card 타일), 「내 선수」 이벤트 연결

**Files:**
- Create: `src/react/home/HomeApp.tsx`
- Modify: `src/pages/index.astro`
- Modify: `src/react/shell/TopbarActions.tsx`
- Test: `tests/build/dist.test.mjs`

**Interfaces:**
- Consumes (Task 2): `computeHomeSummary`, `HomeSummary`, `MeTile` from `src/react/home/model.ts`
- Consumes (0단계): `ThemeRoot`, `useData(): { data: Data | null }`
- Consumes (기존): `getMe()` from `src/lib/me.ts`; `href` from `src/lib/url.ts`; `fmtWon`, `ytThumb`, `ytThumbBig` from `src/lib/html.ts`; `loadVideos()` from `src/lib/api.ts`; `LINKS` from `src/lib/rules.ts`
- Produces: `src/react/home/HomeApp.tsx` default export(섬); `TopbarActions.tsx`가 `window` `wfc:open-me` 이벤트를 받아 이름 모달을 연다

- [ ] **Step 1: 실패하는 dist 테스트 작성** — `tests/build/dist.test.mjs` 끝에

```js
test('홈 — 타일은 antd Card, HomeApp 섬 하나, 내 선수는 버튼 역할(키보드 가능)', () => {
  const html = read('index.html');
  const island = html.match(/<astro-island[^>]*component-url="\/weekly-fc\/_astro\/HomeApp\.[^"]+\.js"[^>]*>/);
  assert.ok(island, 'HomeApp 섬 없음');
  assert.ok(island[0].includes('client="load"'), 'client:load 아님');
  assert.ok(!/index\.astro_astro_type_script/.test(html), '옛 페이지 스크립트가 남음');
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm run build && node --test tests/build/dist.test.mjs`
Expected: FAIL(`HomeApp 섬 없음`)

- [ ] **Step 3: `TopbarActions.tsx`에 이벤트 리스너 추가**

`import { useEffect, useRef, useState } from 'react';` 아래 훅 선언부, `const pinOpenRef = useRef(false);` 줄 다음에 추가:

```tsx
  // 홈 「내 선수」 빈 자리가 이 이벤트로 이름 고르기 모달을 연다(DOM 으로 #me-btn 을 대신 누르던 방식 대신).
  useEffect(() => {
    const open = () => setMeOpen(true);
    window.addEventListener('wfc:open-me', open);
    return () => window.removeEventListener('wfc:open-me', open);
  }, []);
```

파일 맨 위 주석의 "홈 「내 선수」 타일은 `#me-btn` 을 대신 누른다." 문장을 "홈 「내 선수」 타일은 `wfc:open-me` 이벤트로 이 모달을 연다."로 고친다.

- [ ] **Step 4: 섬 구현** — `src/react/home/HomeApp.tsx`

```tsx
// 홈 대시보드 — 왼쪽 히어로(최근 매치, 직접 만든 채로)+오른쪽 타일 8개(antd Card).
import { Card } from 'antd';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { loadVideos } from '../../lib/api';
import { esc, fmtDate, fmtWon, ytThumb, ytThumbBig } from '../../lib/html';
import { getMe } from '../../lib/me';
import { LINKS } from '../../lib/rules';
import type { Video } from '../../lib/types';
import { href } from '../../lib/url';
import ThemeRoot from '../ThemeRoot';
import { useData } from '../useData';
import { computeHomeSummary } from './model';
import type { DutyTile } from './model';

// 링크 타일 — antd Card 로 그리되, 앵커를 display:contents 로 감싸 그리드 자리·클릭을
// Card 가 그대로 물려받게 한다(astro-island 와 같은 기법). 배경(--elevated)·정렬은 인라인
// style 로 줘서 캐스케이드 순서에 기대지 않는다(2단계에서 자식 결합자가 깨졌던 교훈).
const TILE_STYLE = { background: 'var(--elevated)', display: 'flex', flexDirection: 'column' as const, textAlign: 'left' as const, padding: 'var(--s-md)', cursor: 'pointer' };
const TILE_BODY = { body: { padding: 0, display: 'contents' as const } };

function LinkTile({ to, wide, children }: { to: string; wide?: boolean; children: ReactNode }) {
  return (
    <a href={to} target={to.startsWith('http') ? '_blank' : undefined} rel={to.startsWith('http') ? 'noopener' : undefined} style={{ display: 'contents' }}>
      <Card className={`tile${wide ? ' tile-wide' : ''}`} variant="borderless" style={TILE_STYLE} styles={TILE_BODY}>{children}</Card>
    </a>
  );
}
function EmptyMeTile({ onOpen }: { onOpen: () => void }) {
  return (
    <Card className="tile" variant="borderless" style={TILE_STYLE} styles={TILE_BODY}
      role="button" tabIndex={0} onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}>
      <span className="tile-label">내 선수</span><b className="tile-big">?</b><span className="tile-sub">이름을 고르면 내 카드가 뜹니다</span>
    </Card>
  );
}
const dutyBody = (d: DutyTile) => <><span className="tile-duo"><b>{esc(d.p1)}</b><b>{esc(d.p2)}</b></span><span className="tile-sub">{d.sub}</span></>;

function App() {
  const { data } = useData();
  const [videos, setVideos] = useState<Video[] | null>(null);
  const [me, setMe] = useState<number | null>(null);

  useEffect(() => {
    loadVideos().then(setVideos).catch(() => setVideos([]));
    const read = () => setMe(getMe());
    read();
    window.addEventListener('wfc:me', read);
    return () => window.removeEventListener('wfc:me', read);
  }, []);
  const openMe = () => window.dispatchEvent(new Event('wfc:open-me'));

  if (!data || !videos) return <div className="page-head"><h1>홈</h1><div className="actions" /></div>;

  const s = computeHomeSummary(data, videos, me, new Date());
  const thumbs = videos.slice(0, 4).map((v) => <img key={v.id} src={ytThumb(v.id)} alt="" loading="lazy" />);

  return (
    <>
      <div className="page-head"><h1>홈</h1><div className="actions"><span className="muted" id="stamp">{s.stamp}</span></div></div>
      <div className="menu">
        <section className="art">
          {s.recentMatch && <img src={ytThumbBig(s.recentMatch.id)} alt="" onError={(e) => { const img = e.currentTarget; img.onerror = null; img.src = ytThumb(s.recentMatch!.id); }} />}
          <span className="art-kicker">최근 매치</span>
          <h2 className="art-title">{esc(s.recentMatch?.typeLabel ?? '') || '매치'}</h2>
          <p className="art-sub">{s.recentMatch?.date ? esc(fmtDate(s.recentMatch.date)) : '날짜 미정'}</p>
          <div className="art-foot">
            <a className="chip" href={href('/match/')}>매치 전체 →</a>
            {s.recentMatch && <a className="chip" href={href(`/match/?v=${encodeURIComponent(s.recentMatch.id)}`)}>영상 보기 →</a>}
          </div>
        </section>
        <div className="rail">
          {s.meTile.kind === 'picked'
            ? <LinkTile to={href(`/squad/${s.meTile.num}/`)}><span className="tile-label">내 선수</span><b className="tile-big">{s.meTile.ovr || '–'}</b><span className="tile-sub">{esc(s.meTile.name)} · {esc(s.meTile.pos)}</span></LinkTile>
            : <EmptyMeTile onOpen={openMe} />}
          <LinkTile to={href('/squad/')}><span className="tile-label">스쿼드</span><b className="tile-big">{s.squadCount}</b><span className="tile-sub">{s.posSummary}</span></LinkTile>
          <LinkTile to={href('/match/')}><span className="tile-label">매치</span><b className="tile-big">{s.matchCount}</b><span className="tile-sub">채널 영상</span></LinkTile>
          <LinkTile to={href('/squad/')}><span className="tile-label">라인업</span><b className="tile-big">짜서 공유</b><span className="tile-sub">명단에서 골라 이미지로</span></LinkTile>
          <LinkTile to={href('/rules/#duty')}><span className="tile-label">{s.duty.monthLabel} 봉사</span>{dutyBody(s.duty)}</LinkTile>
          <LinkTile to={href('/rules/#duty')}><span className="tile-label">다음 봉사</span>{dutyBody(s.dutyNext)}</LinkTile>
          <LinkTile to={href('/rules/#fees')}><span className="tile-label">미납 벌금</span><b className="tile-big">{fmtWon(s.unpaidAmount)}</b><span className="tile-sub">{s.unpaidCount}건 · 내역 보기</span></LinkTile>
          <LinkTile to={LINKS.youtube} wide><span className="tile-label">최신 영상</span><b className="tile-big">{s.videoCount}</b><span className="tile-sub">채널에서 보기 · 매주 토요일 기록</span><div className="tile-thumbs">{thumbs}</div></LinkTile>
        </div>
      </div>
    </>
  );
}

export default function HomeApp() {
  return <ThemeRoot><App /></ThemeRoot>;
}
```

- [ ] **Step 5: 페이지 교체** — `src/pages/index.astro` 전체

```astro
---
import Shell from '../layouts/Shell.astro';
import HomeApp from '../react/home/HomeApp.tsx';
---
<Shell title="홈">
  <HomeApp client:load />
</Shell>
```

- [ ] **Step 6: 전체 테스트 통과 확인**

Run: `npm test`
Expected: 단위 전부 PASS, 빌드 성공, dist 전부 PASS(홈 테스트 포함)

- [ ] **Step 7: 커밋**

```bash
git add src/react/home/HomeApp.tsx src/pages/index.astro src/react/shell/TopbarActions.tsx tests/build/dist.test.mjs
git diff --cached --stat
git commit -m "feat(antd): 홈 대시보드 타일을 antd Card로, 내 선수 연결을 wfc:open-me 이벤트로

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DaDPzugZyKUdGnpyTH5KY4"
```

---

### Task 4: 눌러서 확인 · 크기 · 배포 (컨트롤러가 직접)

`S=/private/tmp/claude-501/-Users-junyoungkim/707543c0-f7f4-4fed-b000-a90da8893c64/scratchpad`

- [ ] **Step 1: 로컬 미리보기** — `npm run build && npx astro preview --port 4399`

- [ ] **Step 2: 3단계 시나리오** — `$S/steps-antd3.mjs`(이 태스크에서 만든다). 시트에 안 쓴다: 매치·홈 둘 다 관리자 동작이 없어 Apps Script를 막을 필요는 없지만, 실제 요청이 나가지 않게 캐시에 가짜 데이터를 채운다(선수 여럿, 이름 하나는 골라서 「내 선수」 채워진 상태 확인, 봉사 시트 값, 미납 벌금). 영상은 `loadVideos()`가 빌드 때 구운 `src/data/videos.ts`를 먼저 쓰므로 실제 채널 데이터가 그대로 나온다 — 개수·정렬을 하드코딩해 단정하지 말고 "1개 이상, 최신이 먼저"처럼 상대적으로 확인한다.

홈(`/`):
1. 데이터 오기 전 — 제목 "홈"만, 타일 없음, 가로 넘침 0
2. 타일 8개(또는 「내 선수」 포함 상태에 따라), `.tile-wide`(최신 영상)가 2칸 차지, `.tile-big`이 칸 아래쪽에 붙어 있음(옛 모습과 같은 flex 배치)
3. 이름 안 고른 상태 — 「내 선수」 칸에 물음표, 클릭 → 상단바 이름 모달 열림(`wfc:open-me`), **Tab으로 포커스 이동 후 Enter로도 열림**(키보드 확인)
4. `localStorage.wfc_me`를 채운 뒤 새로고침 — 「내 선수」가 링크 타일로 바뀌고 OVR 표시
5. 새는 antd 컨트롤 없음, 가로 넘침 0(모바일 포함)

매치(`/match/`):
6. 목록 — antd Card 격자, 카드 하나 눌러 상세로 이동
7. 상세(`?v=`) — 제목이 날짜로, 「← 목록」·「유튜브에서 보기」 링크, iframe embed 있음, 「← 목록」 누르면 목록으로 복귀
8. 없는 id(`?v=aaaaaaaaaaa`) — "영상을 찾을 수 없습니다"
9. 새는 antd 컨트롤 없음, 가로 넘침 0(모바일 포함)

```bash
node $S/cdp.mjs "http://localhost:4399/weekly-fc/" "$S/shots/antd3-home-d.png" 1280 800 0 "$S/steps-antd3.mjs"
node $S/cdp.mjs "http://localhost:4399/weekly-fc/" "$S/shots/antd3-home-m.png" 390 844 1 "$S/steps-antd3.mjs"
```

Expected: 두 폭 모두 FAIL 0

- [ ] **Step 3: 회귀** — 하나씩: `steps-antd2`, `steps-antd2-new`, `steps-antd1`, `steps-antd0`, `steps-strip`. 기대: 2단계 배포 때와 같은 수.

- [ ] **Step 4: 크기** — `node $S/page-js.mjs <repo>`로 `index.html`·`match/index.html` JS·CSS gzip을 2단계 값과 나란히 적는다.

- [ ] **Step 5: 최종 리뷰 → main 병합 → 병합본 `npm test` → push → 배포 확인 → 실사이트 재확인 → 메모리 갱신**
