# Ant Design 2단계(선수 상세) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 선수 상세(`/squad/[num]/`)를 React 섬 하나로 옮긴다. 벌금·봉사 요약은 `Descriptions`, 벌금 내역은 정렬되는 `Table`, 선수 편집은 `Modal`+`Form`, 삭제는 `Popconfirm`. FC 아이템 카드(`playerCard`)와 능력치 막대, 아바타 에디터 안쪽은 직접 만든 채로 옮긴다.

**Architecture:** 페이지는 살아 있는 영역이 사이에 정적 본문 없이 하나로 붙어 있으므로(스펙 §1 원칙대로) 섬 하나 `PlayerDetail`이 제목·편집 버튼·카드·요약·내역·편집 모달·아바타 에디터를 전부 맡는다. 계산은 `src/react/player/model.ts` 순수 함수로 떼어 단위 테스트한다. `playerCard`·`avatarSvg`는 지금처럼 HTML 문자열을 만드는 공유 유틸(스쿼드 명단 카드 보기도 같이 쓴다)이라 바꾸지 않고 `dangerouslySetInnerHTML`로 심는다.

**Tech Stack:** Astro 7.3, React 19.3, antd 6.6.4, Node `node --test`

**Spec:** `docs/superpowers/specs/2026-09-15-antd-migration-design.md` — §5 2단계 행, §4 상태, §6 오류, §7 검증. 0·1단계 계획(`plans/2026-09-15-antd-0-foundation.md`, `plans/2026-09-15-antd-1-rules.md`, main `78865c1`)의 산출물 위에서 한다.

## 설계 판단 하나 — "정보는 Descriptions"

스펙 §5는 이 화면의 "정보"를 `Descriptions`로 옮기라고만 적었다. 지금 화면에서 "정보"에 해당하는 것은 두 갈래다: (a) FC 아이템 카드(`playerCard`) — 번호·포지션·이름·주발·조끼·메모를 게임 문법의 카드 면으로 보여준다, (b) 벌금·봉사 요약 — `<div class="card">` 두 칸(`.player-tiles`)에 제목+큰 숫자+보조문구로 얹혀 있다.

**(b)만 `Descriptions`로 옮긴다. (a)는 스쿼드 명단 카드 보기와 공유하는 시각 정체성(2026-09-11 지적으로 만든 게임 카드 문법)이라 건드리지 않는다** — 0~1단계에서 피치·그리기·벌금 기준표처럼 도메인 시각 요소를 그대로 지킨 것과 같은 원칙이다. `Descriptions`는 정확히 "라벨:값" 목록을 위한 부품이라 (b)에 더 맞는다. 이 판단은 사용자 승인 없이 진행하고(위임됨), 배포 뒤 겉모습을 알려 어긋나면 되돌릴 수 있게 한다.

## Global Constraints

- 버전: `antd@^6.6.4`, `react@^19.3.0`(이미 설치돼 있다 — 이 단계는 새 패키지가 없다).
- 테마 값은 `src/react/theme.ts` 한 곳. 이 단계에서 `components.Descriptions`를 더하고 `tests/unit/theme.test.mjs`로 `tokens.css`와 대조한다.
- 겉모습은 지금 짙은 톤 유지 — 벌금 내역 표는 1단계 `Table` 토큰(이미 있음)을 그대로 쓴다. 편집 모달 너비는 `640px`(`tokens.css`의 안 쓰이던 `--modal-xwide: 640px` 토큰이 이 용도로 이미 있었다 — 지금 `.modal-wide` 클래스는 대응 CSS가 없어 아무 효과가 없었다).
- 바꾸지 않는 것: `server/`, 시트 열, `src/lib/api.ts` 계약, 주소 구조, noindex, `src/lib` 순수 로직, `src/components/player-card.ts`·`src/components/avatar.ts`·`src/lib/avatar.ts`(스쿼드 명단이 같이 쓴다). 쓰기 호출은 지금과 같다 — `write('writePlayer', serializePlayer(p))`, `write('deletePlayer', { num })`, `writeAvatar(num, serializeAvatar(spec))`.
- **번호 변경 흐름을 그대로 옮긴다:** 새 번호로 먼저 쓴 뒤에만 옛 번호 행을 지운다(실패해도 선수 정보를 잃지 않게). 옛 번호 삭제가 실패해도 저장은 성공으로 본다(`message.error`로 그 사실만 알린다). 성공하면 `location.href`로 새 번호 주소로 이동한다.
- **편집 모달을 다시 열면 지난 선수 값이 아니라 그 선수(또는 새 선수)의 값으로 시작해야 한다** — `Form`에 `clearOnDestroy`를 준다(1단계 최종 리뷰에서 배운 결함, 여기선 더 위험하다: 한 선수를 편집하고 닫은 뒤 다른 선수 편집을 열면 첫 선수 번호·이름이 남아 있다가 그대로 저장될 수 있다).
- **편집을 열 때 `fetchFull()`로 전화번호를 받아온다**(관리자 전용, PIN 동봉). 실패하면 `message.error('전화번호를 못 불러와 편집을 열 수 없습니다. 다시 시도해주세요')`를 띄우고 모달을 열지 않는다 — 모달이 열린 뒤 실패하는 게 아니라 여는 시도 자체가 막힌다.
- 아바타 에디터는 잠금이 없다(2026-09-11 사용자 결정) — PIN 확인 없이 누구나 열고 저장한다. 모달 틀만 antd로 바꾸고 안쪽 부품 고르기는 그대로 둔다. `.pick-list` 버튼은 antd 부품이 아니라 지금처럼 직접 만든 버튼이므로, `.wfc` 안에 들어가면 전역 버튼 규칙이 안 걸린다(0단계에서 `:where(:not(.wfc, .wfc *))`로 한정했다) — 전용 클래스로 스타일을 되살린다.
- 저장 실패는 `message.error(오류 문구)`, 모달과 입력값은 그대로 둔다. 성공은 `message.success('저장됨')`. 삭제 확인은 `Popconfirm`(1단계와 같은 문구 형식).
- 빌드 때는 브라우저 저장소가 없다 — `data === null`일 땐 제목만 `선수 #{num}`으로 그리고 카드·표·모달은 그리지 않는다.
- Web Awesome은 스쿼드(`/squad/`)가 아직 쓰므로 패키지·`tokens.css`의 `wa-*` 규칙은 건드리지 않는다. 이 단계가 끝나면 `wa-dialog`를 쓰는 페이지는 스쿼드뿐이다 — `Shell.astro` 스크립트의 주석을 그렇게 고친다.
- 관리자 PIN은 에이전트가 입력하지 않는다.
- 레포가 iCloud 안이다: `git status` 금지. `git add <경로>`로만 스테이징하고 확인은 `git diff --cached --stat`. `src/data/videos.ts`·`public/antd.css`·`* 2.*`는 커밋하지 않는다.
- `npm install`·`npm ci` 모두 `node_modules` iCloud 제외 링크를 지운다. 이 단계는 새 패키지가 없으니 구현 에이전트는 설치를 아예 하지 않는다.
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
| `src/react/player/model.ts` | 벌금 요약, 편집 폼 기본값·직렬화, 번호 겹침 확인, 정렬 비교 | 1 |
| `tests/unit/player-model.test.mjs` | model.ts | 1 |
| `src/react/theme.ts` | `components.Descriptions` 추가 | 2 |
| `tests/unit/theme.test.mjs` | 추가 토큰 대조 | 2 |
| `src/react/player/PlayerDetail.tsx` | 섬 전체 — 제목·편집 버튼, 요약(2), 카드·능력치·내역(2), 편집 모달(2), 아바타 에디터(3) | 2, 3 |
| `src/pages/squad/[num].astro` | 섬 하나로 교체, 옛 모달·페이지 스크립트 제거 | 2 |
| `src/styles/tokens.css` | `.pick-list` 안 직접 만든 버튼 스타일 되살림 | 3 |
| `src/layouts/Shell.astro` | 주석 정정(운영·선수 상세 아님, 스쿼드만) | 3 |
| `tests/build/dist.test.mjs` | 선수 상세 빌드 결과 검사 | 2, 3 |

## 컨트롤러 준비(태스크 전)

- [ ] 브랜치 `antd-2-player`를 `main`(`78865c1`)에서 만든다. 새 패키지 설치는 없다.

---

### Task 1: 선수 상세 계산 — `model.ts`

**Files:**
- Create: `src/react/player/model.ts`
- Test: `tests/unit/player-model.test.mjs`

**Interfaces:**
- Consumes (기존): `Fine`, `Player` from `src/lib/types.ts`
- Produces (Task 2가 쓴다), `src/react/player/model.ts`:
  - `export type PlayerFineSummary = { fines: Fine[]; unpaid: number; total: number }`
  - `export function playerFineSummary(fines: Fine[], playerName: string): PlayerFineSummary`
  - `export type PlayerFormValues = { num: number; name: string; pos: Player['pos']; detail: string; foot: string; vest: number | null; rot: number | null; phone: string; pace: number; dribble: number; pass: number; shoot: number; defend: number; stamina: number; note: string }`
  - `export function playerFormDefaults(num: number, existing: Player | undefined): PlayerFormValues`
  - `export function playerFromForm(v: PlayerFormValues, prevAvatar: string): Player`
  - `export function numClash(players: Player[], newNum: number, currentNum: number): Player | undefined`
  - `export const byDate, byType, byAmount, byPaid: (a: Fine, b: Fine) => number`

- [ ] **Step 1: 실패하는 단위 테스트 작성** — `tests/unit/player-model.test.mjs`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { byAmount, byDate, byPaid, byType, numClash, playerFineSummary, playerFormDefaults, playerFromForm } from '../../src/react/player/model.ts';

const P = (num, name, over = {}) => ({ num, name, pos: 'MF', detail: '', foot: '', vest: null, note: '', pace: 70, dribble: 70, pass: 70, shoot: 70, defend: 70, stamina: 70, rot: null, avatar: '', phone: '', ...over });
const F = (id, player, amount, paid, date = '2026-09-05', type = '지각') => ({ id, date, match_id: '', player, type, amount, paid });

test('playerFineSummary: 이 선수 것만, 미납·전체 합계', () => {
  const fines = [F('1', '김', 30000, false), F('2', '박', 50000, false), F('3', '김', 30000, true)];
  assert.deepEqual(playerFineSummary(fines, '김'), { fines: [F('1', '김', 30000, false), F('3', '김', 30000, true)], unpaid: 30000, total: 60000 });
});
test('playerFineSummary: 벌금 없으면 0', () => {
  assert.deepEqual(playerFineSummary([], '김'), { fines: [], unpaid: 0, total: 0 });
});

test('playerFormDefaults: 있는 선수는 그 값(전화 없으면 빈칸)', () => {
  const p = P(7, '김민수', { phone: undefined });
  assert.deepEqual(playerFormDefaults(7, p), { num: 7, name: '김민수', pos: 'MF', detail: '', foot: '', vest: null, rot: null, phone: '', pace: 70, dribble: 70, pass: 70, shoot: 70, defend: 70, stamina: 70, note: '' });
});
test('playerFormDefaults: 새 선수는 번호만 있고 능력치 70', () => {
  assert.deepEqual(playerFormDefaults(15, undefined), { num: 15, name: '', pos: '', detail: '', foot: '', vest: null, rot: null, phone: '', pace: 70, dribble: 70, pass: 70, shoot: 70, defend: 70, stamina: 70, note: '' });
});

test('playerFromForm: 앞뒤 공백을 지우고 avatar 는 지금 값을 그대로 옮긴다', () => {
  const v = { num: 7, name: ' 김민수 ', pos: 'MF', detail: ' 공격형 ', foot: '오른발', vest: 3, rot: 1, phone: '010', pace: 80, dribble: 80, pass: 80, shoot: 80, defend: 80, stamina: 80, note: ' 메모 ' };
  assert.deepEqual(playerFromForm(v, 'f1:h2:s0:e1:k#333a45'), { num: 7, name: '김민수', pos: 'MF', detail: '공격형', foot: '오른발', vest: 3, note: '메모', rot: 1, pace: 80, dribble: 80, pass: 80, shoot: 80, defend: 80, stamina: 80, phone: '010', avatar: 'f1:h2:s0:e1:k#333a45' });
});

test('numClash: 번호를 안 바꾸면 겹침 없음', () => {
  assert.equal(numClash([P(7, '김'), P(9, '박')], 7, 7), undefined);
});
test('numClash: 안 쓰는 번호면 겹침 없음', () => {
  assert.equal(numClash([P(7, '김'), P(9, '박')], 15, 7), undefined);
});
test('numClash: 다른 선수가 쓰는 번호면 그 선수를 돌려준다', () => {
  assert.deepEqual(numClash([P(7, '김'), P(9, '박')], 9, 7), P(9, '박'));
});

test('정렬 비교: 날짜·유형(한국어)·금액·납부', () => {
  const a = F('1', '김', 50000, true, '2026-09-12', '지각');
  const b = F('2', '김', 30000, false, '2026-09-05', '노쇼');
  assert.ok(byDate(a, b) > 0);
  assert.ok(byType(a, b) > 0);
  assert.ok(byAmount(a, b) > 0);
  assert.ok(byPaid(a, b) > 0);
  for (const cmp of [byDate, byType, byAmount, byPaid]) assert.equal(cmp(a, a), 0);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/unit/player-model.test.mjs`
Expected: FAIL — `Cannot find module .../src/react/player/model.ts`

- [ ] **Step 3: 구현** — `src/react/player/model.ts`

```ts
// src/react/player/model.ts — 선수 상세 계산. 화면(PlayerDetail)과 떨어뜨려 단위 테스트한다.
import type { Fine, Player } from '../../lib/types.ts';

export type PlayerFineSummary = { fines: Fine[]; unpaid: number; total: number };
/** 이 선수의 벌금 내역 — 미납 합계·전체 합계. 표의 정렬은 antd Table 의 sorter 가 맡으므로 원본 순서를 그대로 돌려준다. */
export function playerFineSummary(fines: Fine[], playerName: string): PlayerFineSummary {
  const mine = fines.filter((f) => f.player === playerName);
  const unpaid = mine.filter((f) => !f.paid).reduce((s, f) => s + f.amount, 0);
  const total = mine.reduce((s, f) => s + f.amount, 0);
  return { fines: mine, unpaid, total };
}

export type PlayerFormValues = {
  num: number; name: string; pos: Player['pos']; detail: string; foot: string; vest: number | null; rot: number | null; phone: string;
  pace: number; dribble: number; pass: number; shoot: number; defend: number; stamina: number; note: string;
};
/** 편집 폼 기본값 — 있으면 그 선수 값, 없으면(새 선수) 번호만 넣고 능력치는 70(지금 폼과 같다). */
export function playerFormDefaults(num: number, existing: Player | undefined): PlayerFormValues {
  if (existing) return {
    num: existing.num, name: existing.name, pos: existing.pos, detail: existing.detail, foot: existing.foot,
    vest: existing.vest, rot: existing.rot, phone: existing.phone ?? '',
    pace: existing.pace, dribble: existing.dribble, pass: existing.pass, shoot: existing.shoot, defend: existing.defend, stamina: existing.stamina,
    note: existing.note,
  };
  return { num, name: '', pos: '', detail: '', foot: '', vest: null, rot: null, phone: '', pace: 70, dribble: 70, pass: 70, shoot: 70, defend: 70, stamina: 70, note: '' };
}

/** 폼 값 → 저장할 Player. avatar 는 이 폼에 없는 필드다(잠금 없는 별도 에디터가 전담) — writePlayer 가 열을 통째로
 *  덮어쓰므로, 여기서 지금 저장된 값을 그대로 옮기지 않으면 빈 문자열로 지워진다. */
export const playerFromForm = (v: PlayerFormValues, prevAvatar: string): Player => ({
  num: v.num, name: v.name.trim(), pos: v.pos, detail: v.detail.trim(), foot: v.foot.trim(), vest: v.vest, note: v.note.trim(), rot: v.rot,
  pace: v.pace, dribble: v.dribble, pass: v.pass, shoot: v.shoot, defend: v.defend, stamina: v.stamina, phone: v.phone.trim(), avatar: prevAvatar,
});

/** 번호를 바꾸려는 값이 이미 다른 선수 번호와 겹치는지. 번호를 안 바꾸면(newNum === currentNum) 겹침이 아니다. */
export const numClash = (players: Player[], newNum: number, currentNum: number): Player | undefined =>
  newNum !== currentNum ? players.find((p) => p.num === newNum) : undefined;

// 벌금 내역 표 정렬(스펙 §5 "정렬 포함"). 문자열은 한국어 순.
export const byDate = (a: Fine, b: Fine): number => a.date.localeCompare(b.date);
export const byType = (a: Fine, b: Fine): number => a.type.localeCompare(b.type, 'ko');
export const byAmount = (a: Fine, b: Fine): number => a.amount - b.amount;
export const byPaid = (a: Fine, b: Fine): number => Number(a.paid) - Number(b.paid);
```

- [ ] **Step 4: 통과 확인**

Run: `node --test tests/unit/player-model.test.mjs`
Expected: PASS 9/9

- [ ] **Step 5: 커밋**

```bash
git add src/react/player/model.ts tests/unit/player-model.test.mjs
git diff --cached --stat
git commit -m "feat(antd): 선수 상세 계산을 순수 함수로 — 벌금 요약·편집 폼·번호 겹침·정렬

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DaDPzugZyKUdGnpyTH5KY4"
```

<!-- NEXT -->

### Task 2: 정보·내역·편집 — `PlayerDetail` 섬(아바타 제외)

**Files:**
- Modify: `src/react/theme.ts` (`components.Descriptions` 추가)
- Create: `src/react/player/PlayerDetail.tsx`
- Modify: `src/pages/squad/[num].astro` (섬으로 교체)
- Test: `tests/unit/theme.test.mjs`
- Test: `tests/build/dist.test.mjs`

**Interfaces:**
- Consumes (Task 1): `playerFineSummary`, `PlayerFineSummary`, `playerFormDefaults`, `PlayerFormValues`, `playerFromForm`, `numClash`, `byDate`, `byType`, `byAmount`, `byPaid` from `src/react/player/model.ts`
- Consumes (0단계): `ThemeRoot`(default export), `useData(): { data: Data | null; error; retry }`, `useAdmin(): boolean`, `themeConfig`
- Consumes (기존): `write`, `fetchFull`, `serializePlayer` from `src/lib/api.ts`; `esc`, `fmtDate`, `fmtWon`, `monthLabel`, `toast`(안 쓴다 — antd `message`로 대체) from `src/lib/html.ts`; `band`, `STAT_CUTS` from `src/lib/stats.ts`; `nextDuty` from `src/lib/rotation.ts`; `playerCard`, `STAT_KO`, `STAT_LABEL`, `CARD_STAT_ORDER` from `src/components/player-card.ts`; `href` from `src/lib/url.ts`; `STAT_KEYS` from `src/lib/types.ts`
- Produces (Task 3이 이어서 쓴다): `src/react/player/PlayerDetail.tsx` default export(섬). DOM: `h1#title`, `div#actions`(관리자일 때 편집 버튼), 카드·요약·내역이 있는 영역. Task 3이 이 파일에 아바타 에디터를 더한다 — 이 태스크는 `playerCard(p)`를 아바타 없이 부른다(아바타 그림·버튼은 Task 3에서 더한다).

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/unit/theme.test.mjs` 끝에 추가:

```js
test('선수 요약(Descriptions)은 지금 .card 모습 — 라벨 바탕 --elevated·글자 --muted, 값 글자 --fg', () => {
  const d = themeConfig.components.Descriptions;
  assert.equal(d.labelBg, tok('elevated'));
  assert.equal(d.labelColor, tok('muted'));
  assert.equal(d.contentColor, tok('fg'));
  assert.equal(d.titleColor, tok('fg'));
});
```

`tests/build/dist.test.mjs` 끝에 추가:

```js
test('선수 상세는 PlayerDetail 섬 하나, 옛 페이지 스크립트·편집 모달 없음', () => {
  for (const p of ['squad/9/index.html', 'squad/99/index.html']) {
    const html = read(p);
    const island = html.match(/<astro-island[^>]*component-url="\/weekly-fc\/_astro\/PlayerDetail\.[^"]+\.js"[^>]*>/);
    assert.ok(island, `${p}: PlayerDetail 섬 없음`);
    assert.ok(island[0].includes('client="load"'), `${p}: client:load 아님`);
    assert.ok(html.includes('id="title"') && html.includes('id="actions"'), `${p}: 제목·버튼 자리 없음`);
    assert.ok(!html.includes('id="edit-modal"'), `${p}: 옛 편집 모달이 남음`);
    assert.ok(!/\[num\]\.astro_astro_type_script/.test(html), `${p}: 옛 페이지 스크립트가 남음`);
  }
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/unit/theme.test.mjs; npm run build && node --test tests/build/dist.test.mjs`
Expected: theme 새 테스트 FAIL(`components.Descriptions` 없음), dist 새 테스트 FAIL(`PlayerDetail 섬 없음`), 나머지 PASS

- [ ] **Step 3: 테마** — `src/react/theme.ts`의 `components` 안, `Segmented: {...},` 아래에 추가

```ts
    // 벌금·봉사 요약 — 지금 .card 모습(면 --card 는 Descriptions 바탕과 상관없이 antd 배경 기본값 그대로 두고,
    // 라벨·값 글자만 맞춘다). labelBg 는 bordered 모드의 라벨 칸 바탕.
    Descriptions: { labelBg: '#121314', labelColor: 'rgba(229, 229, 229, .55)', contentColor: '#ffffff', titleColor: '#ffffff' },
```

- [ ] **Step 4: 섬 구현(아바타 제외)** — `src/react/player/PlayerDetail.tsx`

```tsx
// 선수 상세 — 카드(FC 아이템)·요약(벌금·봉사)·능력치·벌금 내역·편집. 아바타 에디터는 Task 3 이 이 파일에 더한다.
import { App, Button, Descriptions, Form, Input, InputNumber, Modal, Popconfirm, Select, Table } from 'antd';
import type { TableColumnsType } from 'antd';
import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { fetchFull, write } from '../../lib/api';
import { esc, fmtDate, fmtWon, monthLabel } from '../../lib/html';
import { href } from '../../lib/url';
import { nextDuty } from '../../lib/rotation';
import { band, STAT_CUTS } from '../../lib/stats';
import { CARD_STAT_ORDER, playerCard, STAT_KO, STAT_LABEL } from '../../components/player-card';
import { STAT_KEYS } from '../../lib/types';
import type { Fine, Player } from '../../lib/types';
import ThemeRoot from '../ThemeRoot';
import { useAdmin } from '../useAdmin';
import { useData } from '../useData';
import { byAmount, byDate, byPaid, byType, numClash, playerFineSummary, playerFormDefaults, playerFromForm } from './model';
import type { PlayerFormValues } from './model';

function Detail({ num, isNew }: { num: number; isNew: boolean }) {
  const { message } = App.useApp();
  const { data } = useData();
  const admin = useAdmin();
  const [form] = Form.useForm<PlayerFormValues>();
  const [editing, setEditing] = useState<{ isNewPlayer: boolean; prevAvatar: string } | null>(null); // null 이면 모달 닫힘
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [opening, setOpening] = useState(false); // fetchFull 이 도는 동안(모달이 뜨기 전)
  const [deleting, setDeleting] = useState(false);

  const player = data?.players.find((p) => p.num === num);

  const openEdit = async (p: Player | undefined) => {
    setOpening(true);
    let full = p;
    if (p) {
      try { full = (await fetchFull()).players.find((x) => x.num === num) ?? p; }
      catch { message.error('전화번호를 못 불러와 편집을 열 수 없습니다. 다시 시도해주세요'); setOpening(false); return; }
    }
    setOpening(false);
    form.setFieldsValue(playerFormDefaults(num, full));
    setEditing({ isNewPlayer: !p, prevAvatar: full?.avatar ?? '' });
    setOpen(true);
  };
  const save = async (v: PlayerFormValues) => {
    if (!editing) return;
    const p = playerFromForm(v, editing.prevAvatar);
    if (!p.num || !p.name) { message.error('번호와 이름은 필수'); return; }
    const clash = numClash(data?.players ?? [], p.num, num);
    if (clash) { message.error(`${p.num}번은 이미 ${clash.name}의 번호입니다`); return; }
    setSaving(true);
    try {
      await write('writePlayer', p);
      const numChanged = p.num !== num;
      if (numChanged && data?.players.some((x) => x.num === num)) {
        try { await write('deletePlayer', { num }); } catch (e) { message.error(`저장은 됐지만 이전 번호(${num}) 삭제 실패: ${(e as Error).message}`); }
      }
      setOpen(false);
      message.success('저장됨');
      if (numChanged) location.href = href(`/squad/${p.num}/`);
    } catch (e) {
      message.error((e as Error).message); // 모달·입력값은 그대로 둔다(스펙 §6)
    } finally {
      setSaving(false);
    }
  };
  const delPlayer = async () => {
    setDeleting(true);
    try { await write('deletePlayer', { num }); location.href = href('/squad/'); }
    catch (e) { message.error((e as Error).message); setDeleting(false); }
  };

  // isNew=1 로 들어온 새 번호 페이지 — 관리자면 편집을 자동으로 연다(옛 페이지와 같은 동작:
  // 데이터가 새로 올 때마다(admin·data 가 바뀔 때마다) 다시 확인한다 — 그 선수가 여전히 없을 때만이라 실제로는 드물다).
  // 렌더 도중이 아니라 useEffect 안에서 불러야 한다 — openEdit 은 상태를 바꾸는 부수효과다.
  useEffect(() => {
    if (isNew && admin && data && !player && editing === null && !open && !opening) openEdit(undefined);
  }, [isNew, admin, data, player, opening]);

  // 제목·편집 버튼 — Astro 쪽엔 자리가 없다(id 가 둘로 갈리지 않게 이 섬 하나가 다 그린다).
  // 데이터가 아직 없으면(SSR·빌드) admin·player 모두 falsy 라 제목만 "선수 #{num}", 버튼은 비어 있다 — 옛 화면의 초기 상태와 같다.
  const pageHead = (
    <div className="page-head">
      <h1 id="title">{player ? player.name : `선수 #${num}`}</h1>
      <span className="actions" id="actions">{admin && data && <Button onClick={() => openEdit(player)} loading={opening}>편집</Button>}</span>
    </div>
  );

  if (data && !player) {
    return (
      <>
        {pageHead}
        <p className="muted">이 번호의 선수가 없습니다.{admin ? ' 편집으로 추가할 수 있습니다.' : ''}</p>
        {editModal()}
      </>
    );
  }

  const fineSummary = player ? playerFineSummary(data?.fines ?? [], player.name) : null;
  const duty = player && data ? nextDuty(data.players, data.rotation, player.name) : null;
  const attrRows = player ? STAT_KEYS.map((k) => {
    const v = player[k], b = band(v, STAT_CUTS);
    return (
      <div className="attr-row" key={k}>
        <span className="attr-key">{STAT_LABEL[k]}</span>
        <b className={`val val-${b}`}>{v || '–'}</b>
        <i className="attr-bar"><b className={`val-${b}`} style={{ '--fill': `${Math.max(0, Math.min(100, v))}%` } as CSSProperties} /></i>
      </div>
    );
  }) : null;

  const fineCols: TableColumnsType<Fine> = [
    { title: '날짜', dataIndex: 'date', sorter: byDate, defaultSortOrder: 'descend', render: (d: string) => fmtDate(d) },
    { title: '유형', dataIndex: 'type', sorter: byType },
    { title: '금액', dataIndex: 'amount', align: 'right', sorter: byAmount, render: (a: number) => fmtWon(a) },
    { title: '납부', dataIndex: 'paid', sorter: byPaid, render: (p: boolean) => (p ? '완료' : <span className="warn">미납</span>) },
  ];

  function editModal() {
    return (
      <Modal title="선수 편집" open={open} width={640} destroyOnHidden afterClose={() => setEditing(null)} onCancel={() => setOpen(false)}
        cancelButtonProps={{ disabled: saving }} maskClosable={!saving} closable={!saving} keyboard={!saving}
        footer={[
          editing && !editing.isNewPlayer && (
            <Popconfirm key="del" title="이 선수를 명단에서 지울까요?" okText="삭제" cancelText="취소" okButtonProps={{ danger: true, loading: deleting }} onConfirm={delPlayer}>
              <Button danger loading={deleting} disabled={saving}>삭제</Button>
            </Popconfirm>
          ),
          <span key="spacer" style={{ flex: 1, display: 'inline-block' }} />,
          <Button key="cancel" disabled={saving} onClick={() => setOpen(false)}>취소</Button>,
          <Button key="save" type="primary" loading={saving} onClick={() => form.submit()}>저장</Button>,
        ]}>
        {editing && (
          <Form<PlayerFormValues> form={form} className="form" layout="vertical" clearOnDestroy onFinish={save}>
            <Form.Item name="num" label="번호" rules={[{ required: true, message: '번호를 넣으세요' }]}><InputNumber min={1} max={99} style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="name" label="이름" rules={[{ required: true, message: '이름을 넣으세요' }]}><Input /></Form.Item>
            <Form.Item name="pos" label="포지션"><Select options={['', 'GK', 'DF', 'MF', 'FW'].map((x) => ({ value: x, label: x || '—' }))} /></Form.Item>
            <Form.Item name="detail" label="세부 포지션"><Input /></Form.Item>
            <Form.Item name="foot" label="주발"><Input /></Form.Item>
            <Form.Item name="vest" label="조끼"><InputNumber style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="rot" label="봉사 순번 (빈칸=제외)"><InputNumber style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="phone" label="전화 (공개 안 됨)"><Input /></Form.Item>
            {STAT_KEYS.map((k) => (
              <Form.Item key={k} name={k} label={STAT_KO[k]} rules={[{ required: true, message: '1~99' }]}><InputNumber min={1} max={99} style={{ width: '100%' }} /></Form.Item>
            ))}
            <Form.Item name="note" label="메모" className="full"><Input /></Form.Item>
          </Form>
        )}
      </Modal>
    );
  }

  return (
    <>
      {pageHead}
      {player && (
        <>
          <div className="player-hero">
            <div dangerouslySetInnerHTML={{ __html: playerCard(player) }} />
            <div className="player-side">
              <Descriptions bordered size="small" column={2}>
                <Descriptions.Item label="미납 벌금"><b className={fineSummary!.unpaid ? 'warn' : ''}>{fmtWon(fineSummary!.unpaid)}</b> <span className="muted">누계 {fmtWon(fineSummary!.total)} ({fineSummary!.fines.length}건)</span></Descriptions.Item>
                <Descriptions.Item label="봉사">{duty ? monthLabel(duty.year, duty.month) : '–'} <span className="muted">{player.rot ? `순번 ${player.rot} · 다음 차례` : '로테이션 제외'}</span></Descriptions.Item>
              </Descriptions>
              <div className="card"><h2>능력치</h2><div className="attr-list">{attrRows}</div></div>
            </div>
          </div>
          {fineSummary!.fines.length > 0 && (
            <div className="card"><h2>벌금 내역</h2>
              <Table<Fine> size="small" rowKey="id" pagination={false} showSorterTooltip={false} columns={fineCols} dataSource={fineSummary!.fines} />
            </div>
          )}
        </>
      )}
      {editModal()}
    </>
  );
}

export default function PlayerDetail({ num, isNew }: { num: number; isNew: boolean }) {
  return <ThemeRoot><Detail num={num} isNew={isNew} /></ThemeRoot>;
}
```

- [ ] **Step 5: 페이지 교체** — `src/pages/squad/[num].astro` 전체

```astro
---
import Shell from '../../layouts/Shell.astro';
import PlayerDetail from '../../react/player/PlayerDetail.tsx';
export function getStaticPaths() { return Array.from({ length: 99 }, (_, i) => ({ params: { num: String(i + 1) } })); }
const { num } = Astro.params;
---
<Shell title={`선수 #${num}`}>
  <div class="stack" id="app">
    <PlayerDetail num={Number(num)} isNew={Astro.url.searchParams.get('new') === '1'} client:load />
  </div>
</Shell>
```

`page-head`(제목 `h1#title` + 편집 버튼 `span#actions`)는 Astro 쪽에 두지 않는다 — 제목·버튼이 선수를 찾았는지·관리자인지에 따라 같이 바뀌어야 하는데, 그 상태가 섬 하나(`Detail`)의 state 안에만 있기 때문이다. 두 곳에 나눠 두면 `id="actions"`가 두 번 나오거나, 상태가 갈라져 버튼을 눌러도 같은 곳에 열리지 않는다. 그래서 위 Step 4 코드의 `pageHead`처럼 이 섬이 `page-head`까지 통째로 그린다.

- [ ] **Step 6: 전체 테스트 통과 확인**

Run: `npm test`
Expected: 단위 전부 PASS(theme·player-model 포함), 빌드 성공, dist 전부 PASS(선수 상세 테스트 포함)

- [ ] **Step 7: 커밋**

```bash
git add src/react/theme.ts src/react/player/PlayerDetail.tsx src/pages/squad/\[num\].astro tests/unit/theme.test.mjs tests/build/dist.test.mjs
git diff --cached --stat
git commit -m "feat(antd): 선수 상세 — 요약 Descriptions, 벌금 내역 Table, 편집 Modal+Form, 삭제 Popconfirm

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DaDPzugZyKUdGnpyTH5KY4"
```

<!-- NEXT -->

### Task 3: 아바타 에디터 — antd 모달 틀, 페이지 스타일 정리

**Files:**
- Modify: `src/react/player/PlayerDetail.tsx` (아바타 에디터 추가)
- Modify: `src/styles/tokens.css` (`.pick-list` 안 직접 만든 버튼 스타일)
- Modify: `src/layouts/Shell.astro` (주석 정정)
- Test: `tests/build/dist.test.mjs`

**Interfaces:**
- Consumes (기존): `writeAvatar` from `src/lib/api.ts`; `avatarSvg` from `src/components/avatar.ts`; `PARTS`, `avatarSpecFor`, `serializeAvatar`, `AvatarSpec` from `src/lib/avatar.ts`
- Consumes (Task 2): `PlayerDetail.tsx`의 `Detail` 컴포넌트, `player` 변수, `Modal`·`Button`·`App` import
- Produces: 없음(이 단계의 마지막 태스크)

- [ ] **Step 1: 실패하는 테스트 작성** — `tests/build/dist.test.mjs` 끝에

```js
test('선수 상세 — 아바타 에디터는 antd 모달 틀 안에 있고, wa-dialog 는 스쿼드에만 남는다', () => {
  const html = read('squad/9/index.html');
  assert.ok(!html.includes('<wa-dialog'), 'squad/9/ 에 wa-dialog 가 남음');
  const squad = read('squad/index.html');
  assert.ok(squad.includes('<wa-dialog'), '스쿼드 목록의 wa-dialog 는 아직 있어야 한다(Shell 의 import 도 그래서 남는다)');
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm run build && node --test tests/build/dist.test.mjs`
Expected: FAIL(`squad/9/ 에 wa-dialog 가 남음`)

- [ ] **Step 3: `.pick-list` 직접 만든 버튼 스타일** — `src/styles/tokens.css:505-506`(1단계 기준 줄 번호, 내용으로 찾는다)

```css
/* 이름 고르기 격자(antd 버튼)와 아바타 부품 고르기(직접 만든 버튼)가 같이 쓴다.
   후자는 antd 부품이 아니라서 .wfc 안에서 전역 button 규칙이 안 걸린다(0단계 :where(:not(.wfc, .wfc *))) — 여기서 되살린다. */
.pick-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: var(--s-xs); }
.pick-list .ant-btn { padding-inline: var(--s-xxs); }
.pick-list button:not(.ant-btn) {
  display: inline-flex; align-items: center; justify-content: center; gap: var(--s-xs);
  min-height: 36px; padding: var(--s-xs) var(--s-xxs); border: 1px solid var(--hairline-strong); border-radius: var(--r-full);
  background: transparent; color: var(--fg); font-size: var(--fs-sm); font-weight: var(--fw-strong); cursor: pointer;
}
.pick-list button:not(.ant-btn):hover { background: rgba(255, 255, 255, .1); }
.pick-list button:not(.ant-btn).primary { background: var(--primary); border-color: var(--primary); color: var(--on-primary); }
```

- [ ] **Step 4: `PlayerDetail.tsx`에 아바타 에디터 추가**

import 줄에 추가:

```tsx
import { avatarSvg } from '../../components/avatar';
import { PARTS, avatarSpecFor, serializeAvatar } from '../../lib/avatar';
import type { AvatarSpec } from '../../lib/avatar';
import { writeAvatar } from '../../lib/api'; // write, fetchFull 옆에 이미 있는 줄에 합쳐도 된다
```

`Detail` 함수 안, `const [deleting, setDeleting] = useState(false);` 아래에 추가:

```tsx
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [avatarSpec, setAvatarSpec] = useState<AvatarSpec | null>(null);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const openAvatar = (p: Player) => { setAvatarSpec(avatarSpecFor(p.num, p.avatar)); setAvatarOpen(true); };
  const saveAvatar = async () => {
    if (!player || !avatarSpec) return;
    setAvatarSaving(true);
    try { await writeAvatar(player.num, serializeAvatar(avatarSpec)); setAvatarOpen(false); message.success('아바타 저장됨'); }
    catch (e) { message.error((e as Error).message); }
    finally { setAvatarSaving(false); }
  };
  const pickGroup = (key: 'face' | 'hair' | 'skin' | 'eyes', title: string) => (
    <div key={key}>
      <div className="label label-gap">{title}</div>
      <div className="pick-list">
        {PARTS[key].map((opt, i) => (
          <button type="button" key={opt.id} className={avatarSpec![key] === i ? 'primary' : ''} onClick={() => setAvatarSpec({ ...avatarSpec!, [key]: i })}>{opt.label}</button>
        ))}
      </div>
    </div>
  );
```

`return` 블록에서 `<div dangerouslySetInnerHTML={{ __html: playerCard(player) }} />` 줄을, 아바타 그림·버튼을 이벤트 위임으로 여는 버전으로 바꾼다:

```tsx
            <div
              dangerouslySetInnerHTML={{ __html: playerCard(player, `<button type="button" id="avatar-edit-btn" class="avatar-btn" title="아바타 편집">${avatarSvg(avatarSpecFor(player.num, player.avatar), 112, player.num, true)}</button>`) }}
              onClick={(e) => { if ((e.target as HTMLElement).closest('#avatar-edit-btn')) openAvatar(player); }}
            />
```

`editModal()` 함수 정의 바로 아래에 새 함수를 추가하고, `return`의 `{editModal()}` 옆에 `{avatarModal()}`을 더한다:

```tsx
  function avatarModal() {
    return (
      <Modal title="아바타 편집" open={avatarOpen} destroyOnHidden onCancel={() => setAvatarOpen(false)}
        cancelButtonProps={{ disabled: avatarSaving }} maskClosable={!avatarSaving} closable={!avatarSaving} keyboard={!avatarSaving}
        footer={[
          <Button key="cancel" disabled={avatarSaving} onClick={() => setAvatarOpen(false)}>취소</Button>,
          <Button key="save" type="primary" loading={avatarSaving} onClick={saveAvatar}>저장</Button>,
        ]}>
        {avatarSpec && (
          <div className="stack">
            <div className="row" style={{ justifyContent: 'center', marginBottom: 'var(--s-md)' }} dangerouslySetInnerHTML={{ __html: avatarSvg(avatarSpec, 120) }} />
            {pickGroup('face', '얼굴형')}
            {pickGroup('hair', '헤어')}
            {pickGroup('skin', '피부')}
            {pickGroup('eyes', '눈')}
            <div>
              <div className="label label-gap">유니폼 색</div>
              <div className="pick-list">
                {PARTS.kit.map((hex) => (
                  <button type="button" key={hex} className={avatarSpec.kit === hex ? 'primary' : ''} style={{ background: hex }} aria-label={hex} onClick={() => setAvatarSpec({ ...avatarSpec, kit: hex })}>&nbsp;</button>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>
    );
  }
```

`return`의 `{editModal()}` 다음 줄에 `{avatarModal()}`을 추가한다.

- [ ] **Step 5: `Shell.astro` 주석 정정**

`src/layouts/Shell.astro`의 스크립트 주석(1단계에서 "선수 상세·스쿼드의 wa-dialog 가 아직 쓴다"로 고쳤던 줄)을 "스쿼드의 wa-dialog 가 아직 쓴다"로 고친다.

- [ ] **Step 6: 전체 테스트 통과 확인**

Run: `npm test`
Expected: 단위 전부 PASS, 빌드 성공, dist 전부 PASS(아바타·wa-dialog 테스트 포함)

- [ ] **Step 7: 커밋**

```bash
git add src/react/player/PlayerDetail.tsx src/styles/tokens.css src/layouts/Shell.astro tests/build/dist.test.mjs
git diff --cached --stat
git commit -m "feat(antd): 선수 상세 아바타 에디터를 antd 모달 틀로, 직접 만든 버튼 스타일 되살림

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DaDPzugZyKUdGnpyTH5KY4"
```

---

### Task 4: 눌러서 확인 · 크기 · 배포 (컨트롤러가 직접)

`S=/private/tmp/claude-501/-Users-junyoungkim/707543c0-f7f4-4fed-b000-a90da8893c64/scratchpad`

- [ ] **Step 1: 로컬 미리보기** — `npm run build && npx astro preview --port 4399`

- [ ] **Step 2: 2단계 시나리오** — `$S/steps-antd2.mjs`(이 태스크에서 만든다). 시트에 안 쓴다: Apps Script 주소를 `Network.setBlockedURLs`로 막고, 캐시에 가짜 데이터(번호 9·99 선수 포함, 미납·완납 벌금 섞기, 번호 없는 페이지 하나)를 넣고, 관리자는 가짜 PIN. 대기 목록에 있는 대로 CDP 클릭은 `tap()`(scrollIntoView 없이) 사용.

확인 항목(`/squad/9/`, 있는 선수):
1. JS 끈 첫 페인트 — `#title`·`#actions` 자리 있음(빈 채로), 가로 넘침 0
2. 카드(pcard)·능력치 막대·요약(Descriptions 라벨 바탕 `rgb(18, 19, 20)`)이 보인다
3. 벌금 내역 표 — 기본 날짜 내림차순, 「금액」 눌러 정렬 바뀜, 미납만 `.warn`
4. 관리자(가짜 PIN): 「편집」 → `fetchFull`이 막혀 있어 곧바로 "전화번호를 못 불러와…" 오류, 모달이 열리지 않는다
5. 아바타: 카드의 초상 버튼 → 「아바타 편집」 모달, 부품 하나 고르면 미리보기 svg가 바뀐다. 저장 → 요청 실패 → 오류, 모달 유지. 취소로 닫힘
6. 편집 모달을 어떻게든 열 수 있는 경로가 없으므로(요청이 막혀 있어 `fetchFull` 실패), `clearOnDestroy` 확인은 요청을 지연만 시키고 성공으로 가짜 응답하는 방식으로 별도 확인(스텝 참고 — steps-fix.mjs의 fetch 오버라이드 패턴처럼 `window.fetch`를 감싸 `getAllFull` 요청에만 즉시 성공 JSON을 돌려주고 나머지는 차단 유지)
   - 번호 9로 편집 열기 → 이름 필드 바꿈("임시이름") → 취소 → 번호 99로 이동해 편집 열기 → 이름 필드가 "임시이름"이 아니라 99번 선수(또는 빈칸)인지 확인
7. 새는 antd 컨트롤 없음(`.wfc` 안), `.pick-list` 안 직접 만든 버튼이 알약 모양(전역 규칙 되살아남)

없는 선수(`/squad/98/`, 캐시에 없는 번호):
8. "이 번호의 선수가 없습니다" 문구, 관리자면 "편집으로 추가할 수 있습니다" 덧붙음
9. `?new=1`+관리자 → `fetchFull`이 없어(신규라 `p` 자체가 없음 → `fetchFull` 안 부름) 편집 모달이 곧장 열리고 기본값(번호만 채움, 능력치 70)

```bash
node $S/cdp.mjs "http://localhost:4399/weekly-fc/squad/9/" "$S/shots/antd2-d.png" 1280 800 0 "$S/steps-antd2.mjs"
node $S/cdp.mjs "http://localhost:4399/weekly-fc/squad/9/" "$S/shots/antd2-m.png" 390 844 1 "$S/steps-antd2.mjs"
```

Expected: 두 폭 모두 FAIL 0

- [ ] **Step 3: 회귀** — 하나씩: `steps-antd1`(운영), `steps-antd0`, `steps-t10`, `steps-t11`, `steps-fix`, `steps-strip`. 기대: 1단계 배포 때와 같은 수.

- [ ] **Step 4: 크기** — `node $S/page-js.mjs <repo>`로 `squad/9/` JS·CSS gzip을 1단계 기준값과 나란히 적는다. 멈춤 기준은 없다(스펙 §1 무게).

- [ ] **Step 5: 최종 리뷰 → main 병합 → 병합본 `npm test` → push → 배포 확인 → 실사이트에서 Step 2(요청 차단이라 시트에 안 씀)·`steps-t10` 재확인 → 메모리 갱신**