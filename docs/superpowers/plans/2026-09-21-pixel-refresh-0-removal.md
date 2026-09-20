# 도트 리프레시 0단계(제거) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 도트 게임 비주얼 리프레시(1~5단계) 전에, 이번 리프레시에서 삭제하기로 한 세 가지 — 매치 탭 전체, 실사 선수 사진(D단계), 스쿼드 그리기 도구 — 를 깨끗이 걷어내 뒤 단계가 지울 것 위에 또 톤을 입히는 헛수고를 막는다.

**Architecture:** 전부 순수 삭제/축소다. 새 기능·새 화면은 없다. 각 태스크가 끝나면 `npm test`가 통과해야 하고, 화면에는 아무 시각적 변화가 없어야 한다(매치 탭이 사라지는 것과 사진이 다시 SVG 아바타로 돌아가는 것 자체는 사용자에게 보이는 변화지만, 그 외의 톤·레이아웃은 이번 단계에서 손대지 않는다 — 톤은 1~5단계 몫이다).

**Tech Stack:** Astro 7.3 정적 빌드, React 19 아일랜드, node:test.

**Spec:** `docs/superpowers/specs/2026-09-21-pixel-refresh-design.md` §2·§4·§5(0단계)

## Global Constraints

- 이 단계는 순수 제거만 한다 — 톤·색·폰트·레이아웃 재설계는 절대 하지 않는다(1~5단계 몫).
- `src/lib/parse.ts`의 `proposeMatches`·`parseVideoTitle`, `src/lib/types.ts`의 `Match`/`MatchType` 타입, `src/lib/api.ts`의 `data.matches`/`normalizeMatch`는 **건드리지 않는다** — 매치 탭(채널 영상 목록)과는 별개로, 이미 이번 세션 전부터 화면 어디에서도 안 쓰이던 시트 기반 기능이다. 이번 작업 범위가 아니다.
- `src/lib/lineup.ts`의 `Pt`/`isPt`는 **지우지 않는다** — 드래그 위치(`moved`)가 여전히 쓴다. 지우는 건 `Drawing` 타입과 그 것만 쓰는 함수들뿐이다.
- 작업 순서가 중요하다: 매치 삭제는 반드시 **홈이 먼저 매치 의존성을 벗어난 뒤**(Task 1) 파일을 지운다(Task 2) — 거꾸로 하면 중간에 빌드가 깨진 상태가 생긴다.
- iCloud 레포 주의: `git status` 쓰지 않기. `npm install`/`npm uninstall` 실행하지 않기(이 단계는 의존성 변경이 없다). `npm test`가 `src/data/videos.ts`를 건드리는 건 Task 2에서 그 파일 자체를 지우므로 Task 2 완료 뒤엔 이 문제가 아예 없어진다 — Task 1 시점까지는 기존 관행대로 `npm test` 뒤 `git checkout -- src/data/videos.ts`로 되돌린다.
- 커밋은 각 태스크 끝, `npm test` 통과 후에만.

---

### Task 1: 홈 — 매치 의존성 제거

**Files:**
- Modify: `src/react/home/model.ts` (전체 재작성)
- Modify: `src/react/home/HomeApp.tsx` (전체 재작성)
- Modify: `tests/unit/home-model.test.mjs` (전체 재작성)
- Modify: `src/styles/tokens.css:260-291`

**Interfaces:**
- Consumes: 없음(이 태스크가 매치 관련 소비자를 없애는 쪽).
- Produces: `computeHomeSummary(data: Data, me: number | null, now: Date): HomeSummary` — `videos` 인자가 빠진 새 시그니처. Task 2는 이 시그니처가 이미 바뀌었다는 전제로 진행한다.

- [ ] **Step 1: `home-model.test.mjs` 실패하는 테스트부터 — 새 시그니처로 전체 재작성**

`tests/unit/home-model.test.mjs` 전체를 아래로 바꾼다(비디오 픽스처·매치 관련 테스트 제거, `computeHomeSummary` 호출에서 `videos` 인자 제거):

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
const now = new Date(2026, 8, 15); // 2026-09-15, rotation 시트와 같은 달

test('nextMonthOf: 12월 다음은 다음 해 1월', () => {
  assert.deepEqual(nextMonthOf(2026, 9), { y: 2026, mo: 10 });
  assert.deepEqual(nextMonthOf(2026, 12), { y: 2027, mo: 1 });
});

test('computeHomeSummary: 이름을 골랐으면 meTile 이 picked, OVR·포지션 포함', () => {
  const s = computeHomeSummary(data, 9, now);
  assert.deepEqual(s.meTile, { kind: 'picked', ovr: 73, name: '박지훈', pos: 'FW', num: 9 }); // (85+80+88+70+40+75)/6 = 73
});
test('computeHomeSummary: 이름 안 골랐으면 meTile 이 empty', () => {
  assert.deepEqual(computeHomeSummary(data, null, now).meTile, { kind: 'empty' });
});
test('computeHomeSummary: 스쿼드 인원·포지션 요약', () => {
  const s = computeHomeSummary(data, null, now);
  assert.equal(s.squadCount, 3);
  assert.equal(s.posSummary, 'GK 0 · DF 1 · MF 1 · FW 1');
});
test('computeHomeSummary: 이번 달·다음 달 봉사 — 시트 값 우선', () => {
  const s = computeHomeSummary(data, null, now);
  assert.deepEqual(s.duty, { p1: '김민수', p2: '이서준', monthLabel: '2026년 9월', sub: '대관비·조끼·정산' });
  assert.equal(s.dutyNext.monthLabel, '2026년 10월');
});
test('computeHomeSummary: 미납 벌금 합계·건수', () => {
  const s = computeHomeSummary(data, null, now);
  assert.equal(s.unpaidAmount, 30000);
  assert.equal(s.unpaidCount, 1);
});
test('computeHomeSummary: 도장 문구는 인원수만(영상 카운트 없음)', () => {
  assert.equal(computeHomeSummary(data, null, now).stamp, '3명');
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm run test:unit`
Expected: FAIL — `computeHomeSummary`가 아직 옛 시그니처(`data, videos, me, now`)라 인자 개수가 안 맞고, `matchCount`/`videoCount` 등 없는 필드를 기대하지 않으므로 타입/런타임 불일치로 실패(구체적으로는 `s.stamp`가 `"3명 · 영상 0"`을 내 마지막 테스트가 실패한다).

- [ ] **Step 3: `home/model.ts` 재작성**

`src/react/home/model.ts` 전체를 아래로 바꾼다:

```ts
// src/react/home/model.ts — 홈 대시보드 계산. 화면(HomeApp)과 떨어뜨려 단위 테스트한다.
import { rotationFor } from '../../lib/rotation.ts';
import { fineSummary, ovr } from '../../lib/stats.ts';
import { monthLabel } from '../../lib/html.ts';
import type { Data } from '../../lib/types.ts';

export type MeTile = { kind: 'picked'; ovr: number; name: string; pos: string; num: number } | { kind: 'empty' };
export type DutyTile = { p1: string; p2: string; monthLabel: string; sub: string };
export type HomeSummary = {
  meTile: MeTile; squadCount: number; posSummary: string;
  duty: DutyTile; dutyNext: DutyTile; unpaidAmount: number; unpaidCount: number;
  stamp: string;
};

/** 다음 달 — 12월 다음은 다음 해 1월. */
export const nextMonthOf = (y: number, mo: number): { y: number; mo: number } => (mo >= 12 ? { y: y + 1, mo: 1 } : { y, mo: mo + 1 });

export function computeHomeSummary(data: Data, me: number | null, now: Date): HomeSummary {
  const y = now.getFullYear(), mo = now.getMonth() + 1;
  const dutyRow = rotationFor(data.players, data.rotation, y, mo, now);
  const nm = nextMonthOf(y, mo);
  const dutyNextRow = rotationFor(data.players, data.rotation, nm.y, nm.mo, now);
  const fs = fineSummary(data.fines);
  const p = data.players.find((x) => x.num === me);
  const meTile: MeTile = p ? { kind: 'picked', ovr: ovr(p), name: p.name, pos: p.pos || '–', num: p.num } : { kind: 'empty' };
  const posSummary = (['GK', 'DF', 'MF', 'FW'] as const).map((k) => `${k} ${data.players.filter((x) => x.pos === k).length}`).join(' · ');
  return {
    meTile, squadCount: data.players.length, posSummary,
    duty: { p1: dutyRow.p1, p2: dutyRow.p2, monthLabel: monthLabel(y, mo), sub: dutyRow.done ? '완료' : '대관비·조끼·정산' },
    dutyNext: { p1: dutyNextRow.p1, p2: dutyNextRow.p2, monthLabel: monthLabel(nm.y, nm.mo), sub: monthLabel(nm.y, nm.mo) },
    unpaidAmount: fs.unpaid, unpaidCount: fs.unpaidCount,
    stamp: `${data.players.length}명`,
  };
}
```

- [ ] **Step 4: `HomeApp.tsx` 재작성 — 히어로 섹션·매치 타일 삭제, 유튜브 타일 단순화**

`src/react/home/HomeApp.tsx` 전체를 아래로 바꾼다:

```tsx
// 홈 대시보드 — 타일 그리드(antd Card).
import { Card } from 'antd';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { fmtWon } from '../../lib/html';
import { getMe } from '../../lib/me';
import { LINKS } from '../../lib/rules';
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

function LinkTile({ to, children }: { to: string; children: ReactNode }) {
  const isExternal = to.startsWith('http');
  // 부모 <a> 는 display:contents 라 포커스를 받을 수 없다(CSS 스펙 — 박스 없는 요소는 포커스 대상이 될 수 없다).
  // 마우스 클릭은 그대로 <a> 가 처리하고(그대로 둔다), 키보드는 Card 자신에 얹는다 — 빈 「내 선수」 타일과 같은 패턴.
  const go = () => { if (isExternal) window.open(to, '_blank', 'noopener'); else location.assign(to); };
  return (
    <a href={to} target={isExternal ? '_blank' : undefined} rel={isExternal ? 'noopener' : undefined} style={{ display: 'contents' }}>
      <Card className="tile" variant="borderless" style={TILE_STYLE} styles={TILE_BODY}
        role="link" tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } }}>
        {children}
      </Card>
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
const dutyBody = (d: DutyTile) => <><span className="tile-duo"><b>{d.p1}</b><b>{d.p2}</b></span><span className="tile-sub">{d.sub}</span></>;

function App() {
  const { data } = useData();
  const [me, setMe] = useState<number | null>(null);

  useEffect(() => {
    const read = () => setMe(getMe());
    read();
    window.addEventListener('wfc:me', read);
    return () => window.removeEventListener('wfc:me', read);
  }, []);
  const openMe = () => window.dispatchEvent(new Event('wfc:open-me'));

  if (!data) return <div className="page-head"><h1>홈</h1><div className="actions" /></div>;

  const s = computeHomeSummary(data, me, new Date());

  return (
    <>
      <div className="page-head"><h1>홈</h1><div className="actions"><span className="muted" id="stamp">{s.stamp}</span></div></div>
      <div className="rail">
        {s.meTile.kind === 'picked'
          ? <LinkTile to={href(`/squad/${s.meTile.num}/`)}><span className="tile-label">내 선수</span><b className="tile-big">{s.meTile.ovr || '–'}</b><span className="tile-sub">{s.meTile.name} · {s.meTile.pos}</span></LinkTile>
          : <EmptyMeTile onOpen={openMe} />}
        <LinkTile to={href('/squad/')}><span className="tile-label">스쿼드</span><b className="tile-big">{s.squadCount}</b><span className="tile-sub">{s.posSummary}</span></LinkTile>
        <LinkTile to={href('/squad/')}><span className="tile-label">라인업</span><b className="tile-big">짜서 공유</b><span className="tile-sub">명단에서 골라 이미지로</span></LinkTile>
        <LinkTile to={href('/rules/#duty')}><span className="tile-label">{s.duty.monthLabel} 봉사</span>{dutyBody(s.duty)}</LinkTile>
        <LinkTile to={href('/rules/#duty')}><span className="tile-label">다음 봉사</span>{dutyBody(s.dutyNext)}</LinkTile>
        <LinkTile to={href('/rules/#fees')}><span className="tile-label">미납 벌금</span><b className="tile-big">{fmtWon(s.unpaidAmount)}</b><span className="tile-sub">{s.unpaidCount}건 · 내역 보기</span></LinkTile>
        <LinkTile to={LINKS.youtube}><span className="tile-label">매치 영상</span><b className="tile-big">유튜브</b><span className="tile-sub">채널에서 보기 · 매주 토요일 기록</span></LinkTile>
      </div>
    </>
  );
}

export default function HomeApp() {
  return <ThemeRoot><App /></ThemeRoot>;
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npm run test:unit`
Expected: PASS — `tests/unit/home-model.test.mjs` 전부 통과.

- [ ] **Step 6: 죽은 CSS 제거 — `.menu`·`.art*`·`.tile-wide`·`.tile-thumbs`**

`src/styles/tokens.css` 260번째 줄부터 291번째 줄까지, 현재:

```css
/* ══ 메인 메뉴(홈) ══════════════════════════════════════════ */
/* 정본: "사진이 모든 무게를 진다 … 섹션의 60~90%". 아트 패널을 크게 두고 타일은 조용하게. */
/* 화면 아래에 빈 공간을 남기지 않는다 — 헤더와 화면 머리를 뺀 높이를 메뉴가 다 쓴다. */
.menu { display: grid; grid-template-columns: minmax(0, 5fr) minmax(0, 5fr); gap: var(--s-lg);
  align-items: stretch; min-height: calc(100dvh - var(--header-h) - 148px); }
@media (max-width: 899px) { .menu { grid-template-columns: minmax(0, 1fr); } }
.art { position: relative; isolation: isolate; display: flex; flex-direction: column; justify-content: flex-end;
  min-height: 420px; padding: var(--s-xl); border-radius: var(--r-lg); overflow: hidden; }
.art > img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: 0; }
.art::before { content: ""; position: absolute; inset: 0; z-index: 1;
  background: linear-gradient(180deg, rgba(0,0,0,.05) 0%, rgba(0,0,0,.3) 42%, rgba(0,0,0,.82) 74%, rgba(0,0,0,.94) 100%); }
.art > :not(img) { position: relative; z-index: 2; }
.art-kicker { font-size: var(--fs-xs); font-weight: var(--fw-strong); color: rgba(255, 255, 255, .8); }
.art-title { margin: var(--s-xs) 0 var(--s-xxs); font-size: var(--fs-display-lg); font-weight: var(--fw-display); line-height: 1.1; letter-spacing: 0; }
.art-sub { color: rgba(255, 255, 255, .78); font-size: var(--fs-sm); }
.art-foot { margin-top: var(--s-md); display: flex; flex-wrap: wrap; gap: var(--s-xs); }
.rail { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); grid-auto-rows: minmax(128px, 1fr); gap: var(--s-sm); }
@media (max-width: 639px) { .rail { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
/* 정본 game-tile: 면 #121314, 반경 8. hover 는 밝기만. */
.tile { display: flex; flex-direction: column; text-align: left; padding: var(--s-md); border: 0; border-radius: var(--r-md);
  background: var(--elevated); color: inherit; font-weight: var(--fw-body); cursor: pointer;
  transition: background var(--dur-micro) var(--ease-std); }
.tile:hover { background: var(--charcoal); }
.tile-label { font-size: var(--fs-xs); font-weight: var(--fw-strong); color: var(--muted); }
.tile-big { margin-top: auto; font-size: var(--fs-h-xl); font-weight: var(--fw-num); line-height: 1.1; letter-spacing: -.01em; font-variant-numeric: tabular-nums; }
.tile-sub { margin-top: var(--s-xxs); font-size: var(--fs-xs); color: var(--muted); }
/* 봉사 두 명 — 같은 크기로 나란히. 좁은 타일에서는 줄바꿈해도 크기는 같다. */
.tile-duo { display: flex; flex-wrap: wrap; gap: 0 var(--s-sm); margin-top: auto; font-size: var(--fs-h-lg); font-weight: var(--fw-num); line-height: 1.25; }
.tile-wide { grid-column: span 2; }
.tile-thumbs { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--s-xxs); margin-top: var(--s-xs); }
.tile-thumbs img { width: 100%; aspect-ratio: 16 / 9; object-fit: cover; border-radius: var(--r-sm); }
```

아래로 바꾼다(`.menu`·`.art*`·`.tile-wide`·`.tile-thumbs`만 제거, `.rail`·`.tile*` 나머지는 그대로 — HomeApp.tsx가 여전히 `.rail`을 최상위 컨테이너로 직접 쓴다):

```css
/* ══ 메인 메뉴(홈) ══════════════════════════════════════════ */
.rail { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); grid-auto-rows: minmax(128px, 1fr); gap: var(--s-sm); }
@media (max-width: 639px) { .rail { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
/* 정본 game-tile: 면 #121314, 반경 8. hover 는 밝기만. */
.tile { display: flex; flex-direction: column; text-align: left; padding: var(--s-md); border: 0; border-radius: var(--r-md);
  background: var(--elevated); color: inherit; font-weight: var(--fw-body); cursor: pointer;
  transition: background var(--dur-micro) var(--ease-std); }
.tile:hover { background: var(--charcoal); }
.tile-label { font-size: var(--fs-xs); font-weight: var(--fw-strong); color: var(--muted); }
.tile-big { margin-top: auto; font-size: var(--fs-h-xl); font-weight: var(--fw-num); line-height: 1.1; letter-spacing: -.01em; font-variant-numeric: tabular-nums; }
.tile-sub { margin-top: var(--s-xxs); font-size: var(--fs-xs); color: var(--muted); }
/* 봉사 두 명 — 같은 크기로 나란히. 좁은 타일에서는 줄바꿈해도 크기는 같다. */
.tile-duo { display: flex; flex-wrap: wrap; gap: 0 var(--s-sm); margin-top: auto; font-size: var(--fs-h-lg); font-weight: var(--fw-num); line-height: 1.25; }
```

- [ ] **Step 7: 빌드 확인 (아직 매치 파일들은 살아있다 — Task 2에서 지운다)**

Run: `npm run build`
Expected: 빌드 성공(HomeApp이 더 이상 `loadVideos`/`match-videos`/`ytThumb` 등을 안 쓰지만, 그 함수·파일 자체는 Task 2까지 그대로 남아 있으므로 아무것도 안 깨진다).

- [ ] **Step 8: `git checkout`으로 videos.ts 되돌리고 커밋**

```bash
git checkout -- src/data/videos.ts
git add src/react/home/model.ts src/react/home/HomeApp.tsx tests/unit/home-model.test.mjs src/styles/tokens.css
git commit -m "refactor(home): 매치 의존성 제거 — 히어로 섹션 삭제, 유튜브 타일은 정적 링크로"
```

---

### Task 2: 매치 기능·데이터 파이프라인 완전 삭제

**Files:**
- Delete: `src/pages/match/index.astro`
- Delete: `src/react/match/MatchApp.tsx`
- Delete: `src/react/match/model.ts`
- Delete: `src/lib/match-videos.ts`
- Delete: `scripts/fetch-videos.mjs`
- Delete: `src/data/videos.ts`
- Delete: `tests/unit/match-videos.test.mjs`
- Modify: `src/layouts/Shell.astro:9` (nav 배열)
- Modify: `package.json` (`prebuild` 스크립트)
- Modify: `src/lib/api.ts:2,4,114-121` (`loadVideos`·`VIDEOS` 임포트)
- Modify: `src/lib/html.ts:12-17` (`ytThumb`/`ytThumbBig`/`ytEmbed`/`ytWatch`)
- Modify: `tests/build/dist.test.mjs`

**Interfaces:**
- Consumes: Task 1이 이미 `computeHomeSummary`에서 `videos`/매치 의존성을 뺐다는 전제(그래서 이 태스크가 파일을 지워도 홈이 안 깨진다).
- Produces: 없음(끝 지점 — 이후 태스크가 매치 관련 아무것도 참조하지 않는다).

- [ ] **Step 1: 매치 전용 파일 삭제**

```bash
git rm src/pages/match/index.astro
git rm -r src/react/match
git rm src/lib/match-videos.ts
git rm scripts/fetch-videos.mjs
git rm src/data/videos.ts
git rm tests/unit/match-videos.test.mjs
```

- [ ] **Step 2: `Shell.astro` — 상단 네비에서 매치 탭 제거**

`src/layouts/Shell.astro` 9번째 줄, 현재:

```astro
const nav = [
  { href: href('/'), label: '홈' },
  { href: href('/squad/'), label: '스쿼드' },
  { href: href('/match/'), label: '매치' },
  { href: href('/rules/'), label: '운영' },
];
```

아래로 바꾼다:

```astro
const nav = [
  { href: href('/'), label: '홈' },
  { href: href('/squad/'), label: '스쿼드' },
  { href: href('/rules/'), label: '운영' },
];
```

- [ ] **Step 3: `package.json` — `prebuild`에서 `fetch-videos.mjs` 제거**

현재:

```json
    "prebuild": "node scripts/fetch-videos.mjs && node scripts/extract-antd-css.mjs",
```

아래로 바꾼다:

```json
    "prebuild": "node scripts/extract-antd-css.mjs",
```

- [ ] **Step 4: `api.ts` — `loadVideos`·`VIDEOS` 임포트 제거**

`src/lib/api.ts` 2번째 줄, 현재:

```ts
import type { Data, Fine, Lineup, Match, Player, RotationRow, Team, Video } from './types';

import { VIDEOS as baked } from '../data/videos.ts';
```

아래로 바꾼다(`Video` 타입·`VIDEOS` 임포트 둘 다 제거 — 이 파일에서 더는 안 쓴다):

```ts
import type { Data, Fine, Lineup, Match, Player, RotationRow, Team } from './types';
```

같은 파일에서 `loadVideos` 함수 전체(현재 114~121번째 줄 근방, 아래 블록)를 통째로 삭제한다:

```ts
/** 영상 목록 — 빌드 때 scripts/fetch-videos.mjs 가 채널 페이지에서 긁어 박아둔 것을 먼저 쓴다.
 *  백엔드(getChannelVideos)는 고급 서비스·RSS 가 둘 다 막혀 빈 배열만 돌려주므로 폴백으로만 남긴다:
 *  나중에 그쪽이 되살아나면 더 최신인 목록을 받게 된다. */
export async function loadVideos(): Promise<Video[]> {
  if (baked.length) return baked as Video[];
  try {
    const j = await call('getChannelVideos');
    return (Array.isArray(j.videos) ? (j.videos as Raw[]) : []).map((v) => ({ id: String(v.id ?? ''), title: String(v.title ?? ''), published: String(v.published ?? '') })).filter((v) => v.id);
  } catch { return []; }
}
```

- [ ] **Step 5: `html.ts` — 유튜브 헬퍼 4개 제거**

`src/lib/html.ts` 12~17번째 줄, 현재:

```ts
export const ytThumb = (id: string): string => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
/** 큰 키 아트용 — hqdefault(480x360)는 16:9 영상에 위아래 검은 띠가 남는다. maxres 는 1280x720
 *  로 띠가 없지만 없는 영상이 있어, 쓰는 쪽에서 onerror 로 hqdefault 로 되돌린다. */
export const ytThumbBig = (id: string): string => `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`;
export const ytEmbed = (id: string): string => `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1`;
export const ytWatch = (id: string): string => `https://www.youtube.com/watch?v=${id}`;
```

이 다섯 줄을 통째로 삭제한다(주석 포함, 앞뒤 `fmtWon`/`toast` 줄은 그대로 둔다).

- [ ] **Step 6: `dist.test.mjs` — PAGES에서 매치 제거, 매치 탭 테스트 삭제, 상단 탭 테스트 갱신**

`PAGES` 배열(파일 앞부분)에서 `'match/index.html',` 줄을 삭제한다.

`상단 탭` 테스트, 현재:

```js
test('상단 탭은 홈·스쿼드·매치·운영 네 갈래', () => {
  const html = read('index.html');
  for (const l of ['홈', '스쿼드', '매치', '운영']) assert.ok(html.includes(`<span>${l}</span>`), l);
  for (const l of ['기록', '전술', '소개']) assert.ok(!html.includes(`<span>${l}</span>`), `남은 탭: ${l}`);
});
```

아래로 바꾼다:

```js
test('상단 탭은 홈·스쿼드·운영 세 갈래', () => {
  const html = read('index.html');
  for (const l of ['홈', '스쿼드', '운영']) assert.ok(html.includes(`<span>${l}</span>`), l);
  for (const l of ['기록', '전술', '소개', '매치']) assert.ok(!html.includes(`<span>${l}</span>`), `남은 탭: ${l}`);
});
```

`매치 탭` 테스트 블록(아래 전체)을 통째로 삭제한다:

```js
test('매치 탭 — MatchApp 섬 하나, client:load, 제목·버튼 자리, 옛 페이지 스크립트 없음', () => {
  const html = read('match/index.html');
  const island = html.match(/<astro-island[^>]*component-url="\/weekly-fc\/_astro\/MatchApp\.[^"]+\.js"[^>]*>/);
  assert.ok(island, 'MatchApp 섬 없음');
  assert.ok(island[0].includes('client="load"'), 'client:load 아님');
  assert.ok(html.includes('id="title"') && html.includes('id="actions"'), '제목·버튼 자리 없음');
  assert.ok(!/match\/index\.astro_astro_type_script/.test(html), '옛 페이지 스크립트가 남음');
});
```

파일 맨 끝에 새 테스트를 추가한다(스펙 §7 — 매치 흔적이 dist에 안 남는지):

```js
test('매치 탭이 완전히 삭제됐다(스펙 §7 · 2026-09-21 리프레시)', () => {
  assert.ok(!existsSync('dist/match'), 'dist/match 디렉터리가 남음');
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]);
  const files = walk('dist').filter((f) => /\.(html|js|css)$/.test(f));
  const hit = files.find((f) => readFileSync(f, 'utf8').includes('MatchApp'));
  assert.ok(!hit, `MatchApp 흔적이 남음: ${hit}`);
});
```

- [ ] **Step 7: 테스트 통과 확인**

Run: `npm test`
Expected: PASS — unit·build·dist 전부 통과. `src/data/videos.ts`가 이제 없으므로 이번엔 `npm test` 뒤 되돌릴 파일도 없다(Global Constraints 참고).

- [ ] **Step 8: 커밋**

```bash
git add src/layouts/Shell.astro package.json src/lib/api.ts src/lib/html.ts tests/build/dist.test.mjs
git commit -m "feat(match): 매치 탭·채널 영상 파이프라인 전체 삭제(홈에 유튜브 정적 링크만 남김)"
```

---

### Task 3: 실사 선수 사진(D단계) 되돌리기

**Files:**
- Modify: `src/components/avatar.ts` (import·`photoHtml` 제거)
- Modify: `src/react/player/PlayerDetail.tsx:12,237`
- Modify: `src/react/squad/RosterList.tsx:7,39,74`
- Modify: `src/styles/tokens.css:315-317,341`
- Delete: `public/players/` (디렉터리 전체)
- Modify: `tests/unit/avatar.test.mjs`
- Modify: `tests/build/dist.test.mjs`

**Interfaces:**
- Consumes: 없음.
- Produces: 없음.

- [ ] **Step 1: `avatar.ts` — `photoHtml`·`href` 임포트 제거**

`src/components/avatar.ts` 6~7번째 줄, 현재:

```ts
import { esc } from '../lib/html.ts';
import { href } from '../lib/url.ts';
import { PARTS, isUnsetAvatar, type AvatarSpec } from '../lib/avatar.ts';
```

아래로 바꾼다:

```ts
import { esc } from '../lib/html.ts';
import { PARTS, isUnsetAvatar, type AvatarSpec } from '../lib/avatar.ts';
```

파일 끝의 `photoHtml` 함수 전체(아래 블록)를 삭제한다:

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

- [ ] **Step 2: `PlayerDetail.tsx` — 사진 오버레이 되돌리기**

12번째 줄, 현재:

```tsx
import { avatarSvg, photoHtml } from '../../components/avatar';
```

아래로 바꾼다:

```tsx
import { avatarSvg } from '../../components/avatar';
```

237번째 줄, 현재:

```tsx
              dangerouslySetInnerHTML={{ __html: playerCard(player, `<button type="button" id="avatar-edit-btn" class="avatar-btn" title="아바타 편집">${photoHtml(player.num, 112)}${avatarSvg(avatarSpecFor(player.num, player.avatar), 112, player.num, true)}</button>`) }}
```

아래로 바꾼다:

```tsx
              dangerouslySetInnerHTML={{ __html: playerCard(player, `<button type="button" id="avatar-edit-btn" class="avatar-btn" title="아바타 편집">${avatarSvg(avatarSpecFor(player.num, player.avatar), 112, player.num, true)}</button>`) }}
```

- [ ] **Step 3: `RosterList.tsx` — 사진 오버레이 되돌리기**

7번째 줄, 현재:

```tsx
import { avatarSvg, photoHtml } from '../../components/avatar';
```

아래로 바꾼다:

```tsx
import { avatarSvg } from '../../components/avatar';
```

39번째 줄, 현재:

```tsx
      render: (_, p) => <span className="avatar-chip" dangerouslySetInnerHTML={{ __html: photoHtml(p.num, 28) + avatarSvg(avatarSpecFor(p.num, p.avatar), 28, p.num) }} /> },
```

아래로 바꾼다:

```tsx
      render: (_, p) => <span dangerouslySetInnerHTML={{ __html: avatarSvg(avatarSpecFor(p.num, p.avatar), 28, p.num) }} /> },
```

74번째 줄, 현재:

```tsx
                  dangerouslySetInnerHTML={{ __html: playerCard(p, photoHtml(p.num, 116) + avatarSvg(avatarSpecFor(p.num, p.avatar), 116, p.num, true)) }} />
```

아래로 바꾼다:

```tsx
                  dangerouslySetInnerHTML={{ __html: playerCard(p, avatarSvg(avatarSpecFor(p.num, p.avatar), 116, p.num, true)) }} />
```

- [ ] **Step 4: `tokens.css` — `.pcard-photo`·`.avatar-chip` 제거, `.pcard-portrait` 원복**

315~317번째 줄, 현재:

```css
.pcard-portrait { position: relative; align-self: flex-end; margin: 0 -4px -6px 0; }
.pcard-photo { position: absolute; top: 0; left: 0; object-fit: cover; border-radius: 16%; aspect-ratio: 1 / 1; }
.avatar-chip { position: relative; display: inline-block; line-height: 0; }
```

아래로 바꾼다:

```css
.pcard-portrait { align-self: flex-end; margin: 0 -4px -6px 0; }
```

341번째 줄(모바일 카드벽 오버라이드), 현재:

```css
  .pcard-wall .pcard-portrait svg, .pcard-wall .pcard-portrait img.pcard-photo { width: 68px; height: 68px; }
```

아래로 바꾼다:

```css
  .pcard-wall .pcard-portrait svg { width: 68px; height: 68px; }
```

- [ ] **Step 5: `public/players/` 디렉터리 삭제**

```bash
git rm -r public/players
```

- [ ] **Step 6: `avatar.test.mjs` — `photoHtml` 테스트 제거**

`tests/unit/avatar.test.mjs`의 import 줄(4번째 줄), 현재:

```js
import { avatarSvg, photoHtml } from '../../src/components/avatar.ts';
```

아래로 바꾼다:

```js
import { avatarSvg } from '../../src/components/avatar.ts';
```

파일 맨 끝의 `photoHtml` 테스트 2개(아래 블록)를 통째로 삭제한다:

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

- [ ] **Step 7: `dist.test.mjs` — 선수 사진 폴더 통과 테스트 제거**

아래 테스트 블록을 통째로 삭제한다:

```js
test('선수 사진 폴더가 정적 자산으로 그대로 배포된다(수동 배치 규약, 스펙 3·6절)', () => {
  assert.ok(existsSync('dist/players/README.md'), 'dist/players/README.md 없음 — public/players/ 가 빌드에 안 실렸다');
});
```

- [ ] **Step 8: 테스트 통과 확인**

Run: `npm test`
Expected: PASS.

- [ ] **Step 9: 커밋**

```bash
git add src/components/avatar.ts src/react/player/PlayerDetail.tsx src/react/squad/RosterList.tsx src/styles/tokens.css tests/unit/avatar.test.mjs tests/build/dist.test.mjs
git commit -m "revert(avatar): 실사 선수 사진(D단계) 되돌리기 — 전부 SVG 아바타로(1단계에서 픽셀 스프라이트로 교체 예정)"
```

---

### Task 4: 스쿼드 그리기 도구 삭제

**Files:**
- Modify: `src/lib/lineup.ts`
- Delete: `src/components/board-draw.ts`
- Modify: `src/components/pitch-view.ts`
- Modify: `src/react/squad/Pitch.tsx`
- Modify: `src/react/squad/SquadApp.tsx`
- Modify: `src/components/share-image.ts`
- Modify: `tests/unit/lineup.test.mjs`
- Delete: `tests/unit/board-draw.test.mjs`
- Modify: `tests/unit/pitch-view.test.mjs`

**Interfaces:**
- Consumes: 없음.
- Produces: `pitchHtml(s, players, selected)` — `drawInner` 4번째 인자가 빠진 새 시그니처. `Pitch` 컴포넌트는 `tool`/`onDraw` prop이 없어진다.

- [ ] **Step 1: `lineup.ts` — `Drawing` 타입·그리기 함수 제거(`Pt`/`isPt`는 그대로 둔다)**

`src/lib/lineup.ts` 7~8번째 줄, 현재:

```ts
export type Pt = [number, number];
export type Drawing = { kind: 'arrow'; from: Pt; to: Pt } | { kind: 'pen'; points: Pt[] };
```

아래로 바꾼다(`Drawing` 타입만 제거):

```ts
export type Pt = [number, number];
```

`LineupState` 타입 정의(9~18번째 줄), 현재:

```ts
export type LineupState = {
  v: 1; count: number; shape: string; pitch: PitchKind;
  /** 슬롯 순서대로 선수 번호. slotsFor(count, shape)와 길이가 같다. */
  slots: (number | null)[];
  /** 끌어서 옮긴 슬롯의 위치. 키는 슬롯 번호. 모양·인원을 바꾸면 비운다. */
  moved: Record<string, Pt>;
  drawings: Drawing[];
  /** 빈 문자열이면 defaultTitle 을 쓴다. */
  title: string;
};
```

아래로 바꾼다(`drawings` 필드 제거):

```ts
export type LineupState = {
  v: 1; count: number; shape: string; pitch: PitchKind;
  /** 슬롯 순서대로 선수 번호. slotsFor(count, shape)와 길이가 같다. */
  slots: (number | null)[];
  /** 끌어서 옮긴 슬롯의 위치. 키는 슬롯 번호. 모양·인원을 바꾸면 비운다. */
  moved: Record<string, Pt>;
  /** 빈 문자열이면 defaultTitle 을 쓴다. */
  title: string;
};
```

`initial()` 함수(28~31번째 줄), 현재:

```ts
export function initial(count = 11): LineupState {
  const n = clampCount(count);
  return { v: 1, count: n, shape: SHAPES[n][0], pitch: defaultPitch(n), slots: Array(n).fill(null), moved: {}, drawings: [], title: '' };
}
```

아래로 바꾼다(`drawings: []` 제거):

```ts
export function initial(count = 11): LineupState {
  const n = clampCount(count);
  return { v: 1, count: n, shape: SHAPES[n][0], pitch: defaultPitch(n), slots: Array(n).fill(null), moved: {}, title: '' };
}
```

`addDrawing`/`undoDrawing`/`clearDrawings` 세 줄(115~117번째 줄, 아래 블록)을 통째로 삭제한다:

```ts
export const addDrawing = (s: LineupState, d: Drawing): LineupState => ({ ...s, drawings: [...s.drawings, d] });
export const undoDrawing = (s: LineupState): LineupState => ({ ...s, drawings: s.drawings.slice(0, -1) });
export const clearDrawings = (s: LineupState): LineupState => ({ ...s, drawings: [] });
```

`isDrawing` 검증 함수(121~128번째 줄 근방), 현재:

```ts
const isPt = (p: unknown): p is Pt => Array.isArray(p) && p.length === 2 && p.every((v) => typeof v === 'number' && Number.isFinite(v));
function isDrawing(d: unknown): d is Drawing {
  if (!d || typeof d !== 'object') return false;
  const o = d as Record<string, unknown>;
  if (o.kind === 'arrow') return isPt(o.from) && isPt(o.to);
  if (o.kind === 'pen') return Array.isArray(o.points) && o.points.length >= 2 && o.points.every(isPt);
  return false;
}
```

아래로 바꾼다(`isPt`는 `moved` 복원에 계속 쓰이므로 남기고, `isDrawing`만 제거):

```ts
const isPt = (p: unknown): p is Pt => Array.isArray(p) && p.length === 2 && p.every((v) => typeof v === 'number' && Number.isFinite(v));
```

`restore()` 함수 안, 현재:

```ts
  const drawings = (Array.isArray(o.drawings) ? o.drawings : []).filter(isDrawing);
  const pitch: PitchKind = o.pitch === 'futsal' || o.pitch === 'soccer' ? o.pitch : base.pitch;
  const title = typeof o.title === 'string' ? o.title.slice(0, TITLE_MAX) : '';
  return { ...base, pitch, slots, moved, drawings, title };
```

아래로 바꾼다(`drawings` 줄 삭제, 반환 객체에서도 제거):

```ts
  const pitch: PitchKind = o.pitch === 'futsal' || o.pitch === 'soccer' ? o.pitch : base.pitch;
  const title = typeof o.title === 'string' ? o.title.slice(0, TITLE_MAX) : '';
  return { ...base, pitch, slots, moved, title };
```

- [ ] **Step 2: `board-draw.ts` 파일 전체 삭제**

```bash
git rm src/components/board-draw.ts
```

- [ ] **Step 3: `pitch-view.ts` — `drawInner` 파라미터·`data-draw` SVG 제거**

`src/components/pitch-view.ts`의 `pitchHtml` 함수, 현재:

```ts
export function pitchHtml(s: LineupState, players: Player[], selected: number | null, drawInner = ''): string {
  const byNum = new Map(players.map((p) => [p.num, p]));
  const cards = slotsOf(s).map((slot, i) => {
    const [x, y] = positionOf(s, i);
    const at = `left:${(x * 100).toFixed(1)}%;top:${(y * 100).toFixed(1)}%`;
    const num = s.slots[i];
    const p = num != null ? byNum.get(num) : undefined;
    const sel = selected === i ? ' is-selected' : '';
    const label = esc(slot.label);
    if (!p) return `<button type="button" class="bd-slot bd-empty${sel}" style="${at}" data-slot="${i}" aria-label="${label} 빈 자리">${label}</button>`;
    const o = ovr(p);
    const oop = p.pos && p.pos !== slot.group ? ' is-oop' : '';
    return `<button type="button" class="bd-slot bd-card pcard-${grade(o)}${sel}${oop}" style="${at}" data-slot="${i}" aria-label="${label} ${esc(p.name)}">`
      + `<b class="bd-ovr">${o || '–'}</b><span class="bd-name">${esc(p.name)}</span><span class="bd-pos">${label}</span></button>`;
  }).join('');
  const { w, h } = PITCH_DIM[s.pitch];
  return `<div class="bd-pitch bd-${s.pitch}" style="aspect-ratio:${w} / ${h}" data-pitch>${pitchLines(s.pitch)}`
    + `<svg class="bd-draw" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true" data-draw>${drawInner}</svg>${cards}</div>`;
}
```

아래로 바꾼다(`drawInner` 파라미터와 `<svg class="bd-draw" ... data-draw>` 요소를 통째로 제거 — 그리기가 없으니 그 위에 그릴 SVG 레이어 자체가 필요 없다):

```ts
export function pitchHtml(s: LineupState, players: Player[], selected: number | null): string {
  const byNum = new Map(players.map((p) => [p.num, p]));
  const cards = slotsOf(s).map((slot, i) => {
    const [x, y] = positionOf(s, i);
    const at = `left:${(x * 100).toFixed(1)}%;top:${(y * 100).toFixed(1)}%`;
    const num = s.slots[i];
    const p = num != null ? byNum.get(num) : undefined;
    const sel = selected === i ? ' is-selected' : '';
    const label = esc(slot.label);
    if (!p) return `<button type="button" class="bd-slot bd-empty${sel}" style="${at}" data-slot="${i}" aria-label="${label} 빈 자리">${label}</button>`;
    const o = ovr(p);
    const oop = p.pos && p.pos !== slot.group ? ' is-oop' : '';
    return `<button type="button" class="bd-slot bd-card pcard-${grade(o)}${sel}${oop}" style="${at}" data-slot="${i}" aria-label="${label} ${esc(p.name)}">`
      + `<b class="bd-ovr">${o || '–'}</b><span class="bd-name">${esc(p.name)}</span><span class="bd-pos">${label}</span></button>`;
  }).join('');
  const { w, h } = PITCH_DIM[s.pitch];
  return `<div class="bd-pitch bd-${s.pitch}" style="aspect-ratio:${w} / ${h}" data-pitch>${pitchLines(s.pitch)}${cards}</div>`;
}
```

- [ ] **Step 4: `Pitch.tsx` — `tool`/`onDraw` 제거, 항상 이동 모드로**

`src/react/squad/Pitch.tsx` 전체를 아래로 바꾼다(그리기 분기·`ink`·`key={tool}`을 없애고 이동 배선만 남긴다 — `key={tool}`이 지키던 것은 "그리기 모드로 바뀌면서 핸들러 배선 방식 자체가 바뀔 때 옛 핸들러가 새 핸들러와 함께 남는 것"이었는데, 분기 자체가 사라지므로 그 위험도 없어진다. 자리 핸들러는 `el.onpointerdown = ...`처럼 속성 대입이라 매 렌더 덮어써도 중복되지 않는다):

```tsx
// src/react/squad/Pitch.tsx — 피치(자리 배치). pitchHtml() 문자열은 그대로 쓰고
// 포인터 드래그·키보드 배선만 React 생명주기에 맞춘다.
// 자리(.bd-slot) 버튼은 컴포넌트로 쪼개지 않는다 — dangerouslySetInnerHTML 로 통째로 새로 태어나므로
// React 가 style.translate 를 소유하지 않는다. 드래그 중 DOM 을 직접 만져도 다음 렌더(문자열 전체 교체)가
// 늘 새 노드를 만들어 그 흔적을 지운다.
import { useEffect, useRef } from 'react';
import { pitchHtml } from '../../components/pitch-view';
import type { LineupState, Pt } from '../../lib/lineup';
import type { Player } from '../../lib/types';

const DRAG_PX = 6;

export default function Pitch({ st, players, selected, onTapSlot, onSwap, onMoveSlot, onDeselect }: {
  st: LineupState; players: Player[]; selected: number | null;
  onTapSlot: (idx: number) => void;
  onSwap: (a: number, b: number) => void;
  onMoveSlot: (idx: number, pt: Pt) => void;
  onDeselect: () => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  // tapSlotKeepFocus 대신 — 키보드로 고른 자리 번호를 적어 두고, DOM 이 실제로 바뀐 뒤(useEffect)에 포커스한다.
  const pendingFocusRef = useRef<number | null>(null);

  const html = pitchHtml(st, players, selected);

  useEffect(() => {
    const pitch = wrapRef.current?.querySelector<HTMLElement>('[data-pitch]');
    if (!pitch) return;

    if (pendingFocusRef.current != null) {
      pitch.querySelector<HTMLElement>(`[data-slot="${pendingFocusRef.current}"]`)?.focus();
      pendingFocusRef.current = null;
    }

    function startDrag(e: PointerEvent, el: HTMLElement): void {
      if (e.button !== 0) return;
      const idx = Number(el.dataset.slot);
      const x0 = e.clientX, y0 = e.clientY;
      let dragging = false;
      el.setPointerCapture(e.pointerId);
      const off = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', cancel); };
      const move = (ev: PointerEvent) => {
        const dx = ev.clientX - x0, dy = ev.clientY - y0;
        if (!dragging && Math.hypot(dx, dy) < DRAG_PX) return;
        dragging = true;
        el.classList.add('is-dragging');
        el.style.translate = `${dx}px ${dy}px`;
      };
      const cancel = () => { off(); el.classList.remove('is-dragging'); el.style.translate = ''; };
      const up = (ev: PointerEvent) => {
        off();
        if (!dragging) { onTapSlot(idx); return; }
        el.style.visibility = 'hidden';
        const under = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>('[data-slot]');
        el.style.visibility = '';
        if (under && under !== el) { onSwap(idx, Number(under.dataset.slot)); return; }
        const r = pitch!.getBoundingClientRect();
        const inside = ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
        if (inside) onMoveSlot(idx, [(ev.clientX - r.left) / r.width, (ev.clientY - r.top) / r.height]);
        else { el.classList.remove('is-dragging'); el.style.translate = ''; }
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', cancel);
    }

    pitch.querySelectorAll<HTMLElement>('[data-slot]').forEach((el) => {
      el.onpointerdown = (e) => startDrag(e, el);
      // 키보드(Enter·Space)는 pointer 이벤트가 없다 — detail 0 인 click 으로만 들어온다.
      el.onclick = (e) => {
        if (e.detail === 0) { pendingFocusRef.current = Number(el.dataset.slot); onTapSlot(Number(el.dataset.slot)); }
      };
    });
    const onBg = (e: MouseEvent) => { if (!(e.target as Element).closest('[data-slot]') && selected !== null) onDeselect(); };
    pitch.addEventListener('click', onBg);
    return () => pitch.removeEventListener('click', onBg);
  }, [st, players, selected, onTapSlot, onSwap, onMoveSlot, onDeselect]);

  return <div id="pitch-slot" ref={wrapRef} dangerouslySetInnerHTML={{ __html: html }} />;
}
```

- [ ] **Step 5: `SquadApp.tsx` — 도구 상태·툴바 제거**

`src/react/squad/SquadApp.tsx` 4~7번째 줄, 현재:

```tsx
import { App, Button, Drawer, Segmented, Select, Tooltip } from 'antd';
import { ClearOutlined, UndoOutlined } from '@ant-design/icons';
import { useEffect, useState } from 'react';
import type { Tool } from '../../components/board-draw';
```

아래로 바꾼다:

```tsx
import { App, Button, Drawer, Segmented, Select } from 'antd';
import { useEffect, useState } from 'react';
```

42번째 줄, 현재:

```tsx
  const [tool, setTool] = useState<Tool>('move');
```

이 줄을 삭제한다.

`onToolChange` 함수(87번째 줄), 현재:

```tsx
  function onToolChange(t: Tool): void { setSelected(null); setTool(t); } // 도구를 바꾸면 selected 도 반드시 되돌린다(Global Constraints 참고)
```

이 줄을 삭제한다.

`hint` 계산(91~94번째 줄), 현재:

```tsx
  const hint = tool === 'arrow' ? '피치 위를 끌어 화살표를 그립니다'
    : tool === 'pen' ? '피치 위를 끌어 자유롭게 그립니다'
    : selected !== null ? `${L.slotsOf(st)[selected].label} 자리 — 명단에서 선수를 누르거나, 다른 자리를 누르면 맞바꿉니다`
    : '자리를 누르고 선수를 고르세요 · 카드를 끌면 옮기거나 맞바꿉니다';
```

아래로 바꾼다(도구 분기 제거):

```tsx
  const hint = selected !== null ? `${L.slotsOf(st)[selected].label} 자리 — 명단에서 선수를 누르거나, 다른 자리를 누르면 맞바꿉니다`
    : '자리를 누르고 선수를 고르세요 · 카드를 끌면 옮기거나 맞바꿉니다';
```

`<Pitch>` 렌더 부분(132~135번째 줄), 현재:

```tsx
          <Pitch st={st} players={data.players} selected={selected} tool={tool}
            onTapSlot={onTapSlot} onSwap={onSwap} onMoveSlot={(idx, pt) => commit(L.moveSlot(st, idx, pt))}
            onDraw={(d) => commit(L.addDrawing(st, d))} onDeselect={() => setSelected(null)} />
          <div className="bd-tools" role="toolbar" aria-label="도구">
            <Segmented className="chips" value={tool} onChange={(v) => onToolChange(v as Tool)}
              options={[{ label: '이동', value: 'move' }, { label: '화살표', value: 'arrow' }, { label: '펜', value: 'pen' }]} />
            <Tooltip title="되돌리기"><Button icon={<UndoOutlined />} disabled={st.drawings.length === 0} onClick={() => commit(L.undoDrawing(st))} aria-label="되돌리기" /></Tooltip>
            <Tooltip title="지우기"><Button icon={<ClearOutlined />} disabled={st.drawings.length === 0} onClick={() => commit(L.clearDrawings(st))} aria-label="지우기" /></Tooltip>
          </div>
```

아래로 바꾼다(`.bd-tools` 툴바 전체 삭제, `Pitch`에서 `tool`/`onDraw` prop 제거):

```tsx
          <Pitch st={st} players={data.players} selected={selected}
            onTapSlot={onTapSlot} onSwap={onSwap} onMoveSlot={(idx, pt) => commit(L.moveSlot(st, idx, pt))}
            onDeselect={() => setSelected(null)} />
```

- [ ] **Step 6: `share-image.ts` — 그림 렌더 블록·`ARROW_HEAD` 임포트 제거**

`src/components/share-image.ts` 8번째 줄, 현재:

```ts
import { ARROW_HEAD } from './board-draw.ts';
```

이 줄을 삭제한다.

"그림 — 화살표·펜" 블록(76~90번째 줄), 현재:

```ts
  // 그림 — 화살표·펜
  ctx.strokeStyle = fg; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const d of s.drawings) {
    ctx.beginPath();
    if (d.kind === 'pen') {
      d.points.forEach(([x, y], i) => (i ? ctx.lineTo(x * pw, y * ph) : ctx.moveTo(x * pw, y * ph)));
    } else {
      const x1 = d.from[0] * pw, y1 = d.from[1] * ph, x2 = d.to[0] * pw, y2 = d.to[1] * ph;
      const a = Math.atan2(y2 - y1, x2 - x1), head = ARROW_HEAD[s.pitch] * sx;
      ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
      ctx.moveTo(x2 - head * Math.cos(a + 0.45), y2 - head * Math.sin(a + 0.45)); ctx.lineTo(x2, y2);
      ctx.lineTo(x2 - head * Math.cos(a - 0.45), y2 - head * Math.sin(a - 0.45));
    }
    ctx.stroke();
  }

```

이 블록을 통째로 삭제한다(바로 앞의 `pitchLines(ctx, s.pitch, sx, sy);` 줄과 바로 뒤의 "선수 — 이름과 자리 라벨만" 주석 사이 — 둘은 그대로 둔다).

- [ ] **Step 7: `lineup.test.mjs` — 그리기 테스트·임포트 정리**

import 줄(3번째 줄), 현재:

```js
import { initial, setCount, setShape, place, tapPlayer, swap, moveSlot, autoFill, benchOf, stripOrder, positionOf, addDrawing, undoDrawing, clearDrawings, restore, serialize, defaultTitle } from '../../src/lib/lineup.ts';
```

아래로 바꾼다:

```js
import { initial, setCount, setShape, place, tapPlayer, swap, moveSlot, autoFill, benchOf, stripOrder, positionOf, restore, serialize, defaultTitle } from '../../src/lib/lineup.ts';
```

`'그림: 더하기·되돌리기·지우기'` 테스트(아래 블록)를 통째로 삭제한다:

```js
test('그림: 더하기·되돌리기·지우기', () => {
  const a = { kind: 'arrow', from: [0, 0], to: [1, 1] };
  const b = { kind: 'pen', points: [[0, 0], [0.5, 0.5]] };
  const s = addDrawing(addDrawing(initial(5), a), b);
  assert.deepEqual(undoDrawing(s).drawings, [a]);
  assert.deepEqual(clearDrawings(s).drawings, []);
  assert.deepEqual(undoDrawing(initial(5)).drawings, []);
});
```

`'restore: serialize 왕복은 같은 상태'` 테스트, 현재:

```js
test('restore: serialize 왕복은 같은 상태', () => {
  let s = place(initial(6), 0, 1);
  s = addDrawing(s, { kind: 'arrow', from: [0.1, 0.2], to: [0.3, 0.4] });
  s = { ...s, title: '9/19 (토) 라인업' };
  assert.deepEqual(restore(serialize(s), [P(1, 'GK')]), s);
});
```

아래로 바꾼다(`addDrawing` 호출 제거 — `drawings` 필드 자체가 없으므로):

```js
test('restore: serialize 왕복은 같은 상태', () => {
  let s = place(initial(6), 0, 1);
  s = { ...s, title: '9/19 (토) 라인업' };
  assert.deepEqual(restore(serialize(s), [P(1, 'GK')]), s);
});
```

`'restore: 명단에 없는 번호·중복 번호는 비우고...'` 테스트, 현재:

```js
test('restore: 명단에 없는 번호·중복 번호는 비우고, 범위 밖 이동·잘못된 그림·문자열 아닌 제목은 버린다', () => {
  const raw = JSON.stringify({ v: 1, count: 5, shape: '2-2', pitch: 'soccer', slots: [1, 99, 1, 2, null],
    moved: { 9: [0.5, 0.5], 1: [0.2, 0.3] }, drawings: [{ kind: 'pen', points: [[0, 0]] }, { kind: 'arrow', from: [0, 0], to: [1, 1] }], title: 3 });
  const s = restore(raw, [P(1, 'GK'), P(2, 'DF')]);
  assert.deepEqual(s.slots, [1, null, null, 2, null]);
  assert.equal(s.shape, '2-2');
  assert.equal(s.pitch, 'soccer');
  assert.deepEqual(s.moved, { 1: [0.2, 0.3] });
  assert.equal(s.drawings.length, 1);
  assert.equal(s.title, '');
});
```

아래로 바꾼다(제목은 "범위 밖 이동·문자열 아닌 제목", `drawings` 관련 입력·단언 제거):

```js
test('restore: 명단에 없는 번호·중복 번호는 비우고, 범위 밖 이동·문자열 아닌 제목은 버린다', () => {
  const raw = JSON.stringify({ v: 1, count: 5, shape: '2-2', pitch: 'soccer', slots: [1, 99, 1, 2, null],
    moved: { 9: [0.5, 0.5], 1: [0.2, 0.3] }, title: 3 });
  const s = restore(raw, [P(1, 'GK'), P(2, 'DF')]);
  assert.deepEqual(s.slots, [1, null, null, 2, null]);
  assert.equal(s.shape, '2-2');
  assert.equal(s.pitch, 'soccer');
  assert.deepEqual(s.moved, { 1: [0.2, 0.3] });
  assert.equal(s.title, '');
});
```

- [ ] **Step 8: `board-draw.test.mjs` 삭제**

```bash
git rm tests/unit/board-draw.test.mjs
```

- [ ] **Step 9: `pitch-view.test.mjs` — `drawInner` 테스트 제거**

파일 끝의 아래 테스트 블록(이 단언 하나만 있는 별도 블록이다)을 통째로 삭제한다:

```js
test('그림 겹 내용은 받은 문자열을 그대로 넣는다', () => {
  assert.ok(pitchHtml(initial(5), [], null, '<path d="M0 0"/>').includes('data-draw><path d="M0 0"/></svg>'));
});
```

- [ ] **Step 10: 테스트 통과 확인**

Run: `npm test`
Expected: PASS.

- [ ] **Step 11: 커밋**

```bash
git add src/lib/lineup.ts src/components/pitch-view.ts src/react/squad/Pitch.tsx src/react/squad/SquadApp.tsx src/components/share-image.ts tests/unit/lineup.test.mjs tests/unit/pitch-view.test.mjs
git commit -m "feat(squad): 피치 그리기 도구(화살표·펜) 삭제"
```
