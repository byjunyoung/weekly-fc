# 도트 리프레시 1b단계(픽셀 아바타 엔진) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `src/components/avatar.ts`의 헤어·눈 부품을 손그림 SVG 도형에서 DiceBear pixel-art(CC0 1.0) 픽셀 path로 교체하고, 얼굴형 5종 중 다이아몬드만 빌려온 헤어와 맞도록 재설계하며, 렌더 크기를 16px 배수로 스냅해 픽셀 경계가 흐려지지 않게 한다. `avatarSvg()`의 계약(동기·문자열 반환, 코드 f/h/s/e/k)은 완전히 유지한다.

**Architecture:** 새 로컬 16단위 좌표계를 `avatarSvg()` 안에 도입한다 — `<g transform="translate(18 8) scale(4)">` 하나로 얼굴형·헤어·눈을 감싸, DiceBear 원본 path(16×16 그리드 기준)를 좌표 변환 없이 그대로 쓴다. 유니폼 삼각형·배경·테두리는 기존 100×100 좌표계 그대로 둔다. `image-rendering:pixelated` 대신 SVG 최상위에 `shape-rendering="crispEdges"`를 건다.

**Tech Stack:** TypeScript(Astro+React 19), Node 내장 test runner, 헤드리스 Chrome(CDP)로 렌더링 검증. 새 npm 의존성 없음 — `@dicebear/pixel-art`의 path 데이터만 정적으로 복사해 코드에 넣는다(CC0 1.0, 출처 표기 의무 없음).

**Spec:** `docs/superpowers/specs/2026-09-21-pixel-refresh-design.md` §3 "픽셀 아바타" (2026-09-21 재갱신판) — 이 플랜은 그 절이 서술한 설계를 그대로 구현한다.

## Global Constraints

- `avatarSvg(spec, size, fallbackLabel?, bare?)` 시그니처·반환 타입(string, 동기)은 바꾸지 않는다.
- 아바타 코드 계약(`f{n}:h{n}:s{n}:e{n}:k#{hex}`, `src/lib/avatar.ts`의 `PARTS`/`parseAvatar`/`serializeAvatar`)은 건드리지 않는다 — 이 플랜은 `src/components/avatar.ts`(렌더링)만 바꾼다.
- `PARTS.face`/`PARTS.hair`/`PARTS.eyes`의 배열 길이·`id`·`label` 순서는 그대로 둔다(저장된 코드의 인덱스가 그대로 유효해야 함) — 각 `shape` 케이스가 만드는 SVG 내용만 바꾼다.
- 새 npm 런타임 의존성(`@dicebear/core` 등)을 추가하지 않는다 — path 데이터는 아래 코드에 이미 정적으로 포함돼 있다.
- 빌려온 path에는 출처·라이선스 주석을 남긴다(CC0라 의무는 아니지만 프로젝트 관례상 남김).
- 각 태스크 끝에 `npm test`(unit+build+dist) 통과.

---

### Task 1: 아바타 렌더링 엔진 — DiceBear 헤어·눈 path + 얼굴형 재설계

**Files:**
- Modify: `src/components/avatar.ts`
- Test: `tests/unit/avatar.test.mjs` (기존 테스트는 좌표·도형에 의존하지 않아 대부분 그대로 통과함 — 새 테스트만 추가)

**Interfaces:**
- Consumes: `src/lib/avatar.ts`의 `PARTS`, `AvatarSpec`, `isUnsetAvatar` (변경 없음, 기존 그대로).
- Produces: `avatarSvg(spec, size, fallbackLabel?, bare?): string` — 시그니처·동작 계약 동일. 내부 `faceShape`/`hairShape`/`eyesShape`/`chip`는 파일 내부 함수라 외부에서 안 씀.

- [ ] **Step 1: `src/components/avatar.ts` 전체를 아래 내용으로 교체**

```ts
// src/components/avatar.ts — 부품 조합 SVG 아바타. 순수 함수, DOM 접근 없음
// (3~5단계에서 캔버스 컨텍스트로도 그대로 쓸 수 있어야 하므로).
// 색은 var(--토큰, 폴백hex) 형태로 써서 두 상황 모두 맞춘다: 페이지에 인라인으로
// 붙으면 실제 CSS 변수를, canvas용 Image src(data:image/svg+xml)처럼 문서 밖
// 단독 SVG로 쓰이면 폴백 hex 값을 쓴다(짙은 바탕 기준, tokens.css 다크 값과 맞춰 둠).
//
// 헤어·눈 부품의 실루엣(아래 DB_HAIR/DB_EYES)은 손그림이 아니라 오픈소스에서 가져왔다:
// "Pixel Art" (https://www.figma.com/community/file/1198754108850888330) by "DiceBear"
// (@dicebear/pixel-art@10.6.0), licensed under CC0 1.0
// (https://creativecommons.org/publicdomain/zero/1.0/) — 출처 표기 의무는 없지만 남겨 둔다.
// 원본은 16×16 픽셀 그리드 기준 좌표라, 아래 avatarSvg()의 로컬 16단위 좌표계
// (`translate(18 8) scale(4)`)에서 변환 없이 그대로 쓴다. 얼굴형·유니폼은 이 세트에
// 대응 부품이 없어(DiceBear는 두상을 고정하고 색만 바꾼다) 계속 직접 그린다 —
// 다만 다이아몬드는 빌려온 헤어와 맞도록 정수리를 평평하게 재설계했다(스펙 §3 근거).
import { esc } from '../lib/html.ts';
import { PARTS, isUnsetAvatar, type AvatarSpec } from '../lib/avatar.ts';

let uidSeq = 0;
const nextUid = (): string => { uidSeq += 1; return `av${uidSeq}`; };

const TINT = 'var(--tint, #333a45)';
const LINE = 'var(--line, #565f6f)';
const MUTED = 'var(--muted, #9da4af)';
const FG = 'var(--fg, #edf0f3)';

// ── 얼굴형: 로컬 16단위 좌표계(§ avatarSvg의 head 그룹) 기준 ──────────────
// DiceBear 두상(고정)의 실제 바운딩박스(x2~14, y2~14 부근)에 맞춰 5종을 새로 그렸다.
// 다이아몬드만 정수리(y1행)를 평평하게 잘라 헤어 실루엣이 뚫고 나오지 않게 했다
// (기존엔 rotate(45) 정점형이라 헤어 위로 뾰족하게 튀어나왔음 — 직접 렌더링해 확인).
function faceShape(shape: (typeof PARTS.face)[number]['shape'], fill: string): string {
  switch (shape) {
    case 'circle': return `<circle cx="8" cy="6" r="6" fill="${fill}"/>`;
    case 'square': return `<rect x="2" y="1" width="12" height="11" rx="1" fill="${fill}"/>`;
    case 'hex': return `<polygon points="8,0 14,3 14,9 8,12 2,9 2,3" fill="${fill}"/>`;
    case 'diamond': return `<polygon points="6,1 10,1 14,6 8,15 2,6" fill="${fill}"/>`;
    case 'pill': return `<rect x="4" y="0" width="8" height="14" rx="4" fill="${fill}"/>`;
  }
}

// ── 헤어·눈 path 데이터 (DiceBear pixel-art, CC0 — 파일 상단 주석 참고) ──────
// 각 항목: d(SVG path data), t(있으면 개별 transform), white(true면 이 조각은
// 부품색이 아니라 항상 FG색 — 눈의 흰자위처럼 "칠하는 색"과 무관한 고정 조각).
type DBPart = { d: string; t?: string; white?: true; o?: string };

// PARTS.hair의 shape 값 중 'none'(안 그림)·'afro'(아래서 예외 처리)를 뺀 나머지.
type HairKey = Exclude<(typeof PARTS.hair)[number]['shape'], 'none' | 'afro'>;

const DB_HAIR: Record<HairKey, DBPart[]> = {
  // short01 — 짧은머리: 정수리 가장자리를 얇게 두른 크롭.
  short: [
    { d: 'M0 0h8v1H0z', t: 'matrix(-1 0 0 1 12 2)' },
    { d: 'M0 0h6v1H0z', t: 'matrix(-1 0 0 1 13 3)' },
    { d: 'M0 0h2v1H0z', t: 'matrix(-1 0 0 1 13 4)' },
    { d: 'M0 0h1v1H0z', t: 'matrix(-1 0 0 1 13 5)' },
    { d: 'M0 0h3v1H0z', t: 'matrix(-1 0 0 1 6 4)' },
    { d: 'M0 0h4v1H0z', t: 'matrix(-1 0 0 1 7 3)' },
    { d: 'M0 0h2v1H0z', t: 'matrix(-1 0 0 1 5 5)' },
    { d: 'M0 0h1v1H0z', t: 'matrix(-1 0 0 1 4 6)' },
  ],
  // short18 — 스포츠: 각진 플랫탑(높은 각).
  buzz: [
    { d: 'M2 3h2v3H2zm10 3h2v3h-2z' },
    { d: 'M12 3h2v3h-2z' },
  ],
  // long01 — 장발: 옆으로 어깨까지 내려오는 단발.
  long: [
    { d: 'M12 1H5v1H4v1H3v1H2v2h2V5h1V4h1V3h5v1h1v1h1v1h1V3h-1V2h-1zm1 7h1v6h-1v-1H9v-1h3v-1h1zM2 8h1v3h1v1h3v1H3v1H2z' },
  ],
  // short12 — 모히칸: 정수리 세로 스파이크 4개.
  mohawk: [
    { d: 'M4 2h1v3H4zm2 0h1v2H6zm2 0h1v2H8zm2 0h1v2h-1z' },
  ],
  // long02 — 가르마: 장발과 결이 비슷하되 옆머리 폭이 달라 구분됨(색도 별도 축이라 실제로는 더 구분됨).
  side: [
    { d: 'M4 2h8v1h1v2h1v7h-1v-1h-1V5h-1V4H5v1H4v6H3v1H2V5h1V3h1zM2 12v1H1v-1zm12 0h1v1h-1z' },
  ],
  // short06 — 곱슬: 가장자리가 울퉁불퉁한 두꺼운 밴드(텍스처 느낌).
  curly: [
    { d: 'M0 0h1v3H0z', t: 'matrix(-1 0 0 1 4 2)' },
    { d: 'M0 0h1v3H0z', t: 'matrix(-1 0 0 1 13 2)' },
    { d: 'M0 0h9v2H0z', t: 'matrix(-1 0 0 1 12 1)' },
    { d: 'M0 0h2v2H0z', t: 'matrix(-1 0 0 1 4 2)' },
    { d: 'M0 0h2v2H0z', t: 'matrix(-1 0 0 1 14 2)' },
  ],
};

const DB_EYES: Record<(typeof PARTS.eyes)[number]['shape'], DBPart[]> = {
  // variant04 — 기본: 작은 사각 눈, 흰자 위 중앙 점.
  dot: [
    { d: 'M2 0H1v2h2V1H2zm5 0H6v2h2V1H7z', white: true },
    { d: 'M1 1h1v1H1zm5 0h1v1H6z' },
  ],
  // variant07 — 졸린: 가늘고 넓은 흰자, 눈동자는 작은 점.
  line: [
    { d: 'M0 0h3v2H0zm5 0h3v2H5z', white: true },
    { d: 'M7 1h1v1H7zM2 1h1v1H2z' },
  ],
  // variant01 — 놀란: 크고 둥근 두 색(흰자+눈동자) — mask 분리 없이도 요소 배열이라 바로 지원됨.
  wide: [
    { d: 'M8 0H5v3h3zM3 0H0v3h3z', white: true },
    { d: 'M0 0h2v1H0z', t: 'matrix(-1 0 0 1 8 1)' },
    { d: 'M0 0h2v1H0z', t: 'matrix(-1 0 0 1 3 1)' },
    { d: 'M8 1H7v1h1zM3 1H2v1h1z', white: true, o: '.7' },
  ],
};

function dbPath(parts: DBPart[], fill: string): string {
  return parts.map(({ d, t, white, o }) =>
    `<path d="${d}" fill="${white ? FG : fill}"${t ? ` transform="${t}"` : ''}${o ? ` fill-opacity="${o}"` : ''}/>`
  ).join('');
}

// 아프로만 예외 — DiceBear 세트엔 두상 자체를 덮는 둥근 볼륨(afro) 실루엣이 없어
// (해당 세트는 플랫탑·모히칸·단발 계열뿐) 손그림을 그대로 유지한다(로컬 16단위 좌표로 이식).
const AFRO = (fill: string): string => `<circle cx="8" cy="5" r="7" fill="${fill}"/>`;

// 아프로만 얼굴형보다 먼저(뒤에) 그려 얼굴이 중앙을 덮게 한다 — 나머지는 DiceBear
// 원본처럼 얼굴 위(앞)에 그린다(빌려온 path 자체가 그 순서로 디자인돼 있음).
const HAIR_BEHIND = new Set<(typeof PARTS.hair)[number]['shape']>(['afro']);

function hairShape(shape: (typeof PARTS.hair)[number]['shape'], fill: string): string {
  if (shape === 'none') return '';
  if (shape === 'afro') return AFRO(fill);
  return dbPath(DB_HAIR[shape], fill);
}
function eyesShape(shape: (typeof PARTS.eyes)[number]['shape'], fill: string): string {
  return dbPath(DB_EYES[shape], fill);
}

const chip = (uid: string, size: number, inner: string, bare = false): string =>
  `<svg viewBox="0 0 100 100" width="${size}" height="${size}" class="avatar-svg" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg">` +
  `<clipPath id="${uid}c"><rect x="2" y="2" width="96" height="96" rx="16"/></clipPath>` +
  `<g clip-path="url(#${uid}c)">${inner}</g>` +
  (bare ? '' : `<rect x="2" y="2" width="96" height="96" rx="16" fill="none" stroke="${LINE}" stroke-width="2"/>`) +
  `</svg>`;

/** 파싱 실패·미설정 스펙일 때의 폴백: 번호만 든 원(스펙 4절 "번호만 든 원").
 * avatarSvg가 스펙 없이도 항상 뭔가 그릴 수 있게 하는 최소 표시다. */
function fallbackCircle(size: number, label: string | number | undefined, bare = false): string {
  const text = label != null && label !== '' ? esc(String(label)) : '?';
  return chip(nextUid(), size, `${bare ? '' : `<rect x="2" y="2" width="96" height="96" rx="16" fill="${TINT}"/>`}<text x="50" y="61" text-anchor="middle" font-size="34" font-weight="600" fill="${MUTED}">${text}</text>`, bare);
}

/**
 * spec을 인라인 SVG 문자열로. size는 렌더 크기(px 단위, 표 칩 32 / 카드 초상 112 /
 * 편집 모달 미리보기 128 / 모바일 카드벽 64 — 전부 16의 배수, 스펙 §3 근거).
 * fallbackLabel은 spec이 미설정일 때만 쓰는 번호(선택) — randomAvatar로 시드를
 * 채우는 정상 경로에서는 이 분기를 타지 않는다.
 */
export function avatarSvg(spec: AvatarSpec, size: number, fallbackLabel?: string | number, bare = false): string {
  if (isUnsetAvatar(spec)) return fallbackCircle(size, fallbackLabel, bare);
  const face = PARTS.face[spec.face] ?? PARTS.face[0];
  const hair = PARTS.hair[spec.hair] ?? PARTS.hair[0];
  const skin = PARTS.skin[spec.skin] ?? PARTS.skin[0];
  const eyes = PARTS.eyes[spec.eyes] ?? PARTS.eyes[0];
  const kit = /^#[0-9a-fA-F]{6}$/.test(spec.kit) ? spec.kit : '#333a45';
  const hairSvg = hairShape(hair.shape, hair.color || skin.color);
  const behind = HAIR_BEHIND.has(hair.shape);
  // 로컬 16단위 좌표계 — DiceBear path(16×16 그리드) 그대로 쓰기 위한 변환 없는 자리.
  // translate(18 8) scale(4): 16*4=64가 100폭 뷰박스 안에서 좌우 18씩 남기고 중앙 정렬.
  const head = [
    behind ? hairSvg : '',
    faceShape(face.shape, skin.color),
    behind ? '' : hairSvg,
    eyesShape(eyes.shape, eyes.color),
  ].join('');
  const inner = [
    bare ? '' : `<rect x="2" y="2" width="96" height="96" rx="16" fill="${TINT}"/>`,
    `<path d="M10 100 L28 62 Q50 50 72 62 L90 100 Z" fill="${kit}"/>`,
    `<g transform="translate(18 8) scale(4)">${head}</g>`,
    `<rect x="40" y="60" width="20" height="3" rx="1.5" fill="${MUTED}"/>`,
  ].join('');
  return chip(nextUid(), size, inner, bare);
}
```

- [ ] **Step 2: 렌더링 검증 스크립트 실행 — 얼굴형 5종 × 헤어 8종 조합이 안 깨지는지 확인**

스크래치 디렉토리(레포 밖, 커밋 안 함)에 다음처럼 임시 HTML 하나를 만들어 `avatarSvg()`를 직접 호출해 SVG 문자열을 뽑아 파일로 저장한 뒤, 그 HTML을 헤드리스 브라우저로 스크린샷해서 눈으로 확인한다:

```js
// /tmp 스크래치 파일 (레포에 커밋하지 않음), 예: check-1b.mjs
import { avatarSvg } from '<repo>/src/components/avatar.ts';
import { PARTS } from '<repo>/src/lib/avatar.ts';
import { writeFileSync } from 'node:fs';
let html = '<body style="background:#111;display:flex;flex-wrap:wrap">';
for (let f = 0; f < PARTS.face.length; f++) {
  for (let h = 0; h < PARTS.hair.length; h++) {
    html += avatarSvg({ face: f, hair: h, skin: 0, eyes: 0, kit: '#2980b9' }, 128);
  }
}
html += '</body>';
writeFileSync('/tmp/1b-check.html', html);
```

`node check-1b.mjs`로 실행한다 — 이 프로젝트는 Node 25(타입 스트리핑 기본 지원)라 `tests/unit/*.test.mjs`처럼 `.ts` 파일을 플래그 없이 바로 import할 수 있다(기존 테스트와 같은 방식). 그 뒤 `node cdp.mjs file:///tmp/1b-check.html /tmp/1b-check.png 1400 1400 0`로 스크린샷을 찍어 확인한다(레포 밖 `cdp.mjs` 재사용 — 헤드리스 크롬으로 렌더링·스크린샷, 이번 세션에서 이미 쓴 방식과 동일).

확인할 것:
- 다이아몬드 얼굴형 위에서 8종 헤어 전부가 자연스럽게 덮이는지(정수리가 뚫고 나오지 않는지).
- 아프로(hair index 5)가 얼굴형 5종 모두에서 얼굴이 중앙을 덮는 모양으로 나오는지(behind 처리 확인).
- 헤어·눈이 얼굴 밖으로 심하게 삐져나오거나 잘리지 않는지 — 삐져나오면 `translate(18 8) scale(4)` 상수나 개별 얼굴형 좌표를 눈으로 보며 미세 조정한다(값은 근사치로 시작한 것이라 조정 여지가 있음을 전제로 함).
- 문제가 있으면 Step 1의 좌표를 조정하고 재확인 — 완전히 자연스러울 필요는 없다(허접해도 좋다는 원래 방침, `src/lib/avatar.ts` 주석 참고), 다만 부품이 서로 겹쳐 알아볼 수 없거나 캔버스 밖으로 잘리는 수준의 결함만 없으면 된다.

- [ ] **Step 3: 기존 유닛 테스트 실행 — 회귀 없는지 확인**

```bash
npm test
```

Expected: 전부 PASS. `tests/unit/avatar.test.mjs`의 기존 테스트는 좌표·도형 문자열을 하드코딩해 검사하지 않으므로(§svg 시작 태그, width/height 속성, 미설정 폴백, 30명 조합이 서로 다름만 확인) 그대로 통과해야 한다.

- [ ] **Step 4: 새 테스트 추가 — `tests/unit/avatar.test.mjs` 끝에 추가**

```js
test('avatarSvg: shape-rendering=crispEdges가 걸려 있다 (벡터 픽셀아트 앤티앨리어싱 방지)', () => {
  const svg = avatarSvg(randomAvatar(1), 32);
  assert.match(svg, /shape-rendering="crispEdges"/);
});

test('avatarSvg: 얼굴형 5종 전부 유효한 SVG를 낸다 (다이아몬드 포함, 깨지지 않음)', () => {
  for (let face = 0; face < PARTS.face.length; face++) {
    const svg = avatarSvg({ face, hair: 0, skin: 0, eyes: 0, kit: '#2980b9' }, 32);
    assert.match(svg, /^<svg /);
    assert.match(svg, /<\/svg>$/);
  }
});

test('avatarSvg: 헤어 8종 전부(아프로 포함) 유효한 SVG를 낸다', () => {
  for (let hair = 0; hair < PARTS.hair.length; hair++) {
    const svg = avatarSvg({ face: 0, hair, skin: 0, eyes: 0, kit: '#2980b9' }, 32);
    assert.match(svg, /^<svg /);
  }
});
```

- [ ] **Step 5: 테스트 재실행 + 커밋**

```bash
npm test
git add src/components/avatar.ts tests/unit/avatar.test.mjs
git commit -m "feat(avatar): 헤어·눈을 DiceBear pixel-art(CC0) path로, 다이아몬드 얼굴형 재설계

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DaDPzugZyKUdGnpyTH5KY4"
```

---

### Task 2: 렌더 크기를 16px 배수로 스냅

**Files:**
- Modify: `src/react/squad/RosterList.tsx:39` (28→32), `:74` (116→112)
- Modify: `src/react/player/PlayerDetail.tsx:208` (120→128) — `:237`(112)은 이미 배수라 안 바꿈
- Modify: `src/styles/tokens.css:333` (68px→64px)

**Interfaces:**
- Consumes: Task 1이 바꾼 `avatarSvg()` — 시그니처 동일이라 호출부는 숫자 인자만 바뀐다.
- Produces: 없음(호출부 말단 변경).

- [ ] **Step 1: `src/react/squad/RosterList.tsx` 두 곳 수정**

`:39`(표 칩, 스텝 위 컨텍스트 그대로 유지, `28` → `32`만 변경):
```tsx
      render: (_, p) => <span dangerouslySetInnerHTML={{ __html: avatarSvg(avatarSpecFor(p.num, p.avatar), 32, p.num) }} /> },
```

`:74`(카드형 초상, `116` → `112`만 변경):
```tsx
                  dangerouslySetInnerHTML={{ __html: playerCard(p, avatarSvg(avatarSpecFor(p.num, p.avatar), 112, p.num, true)) }} />
```

- [ ] **Step 2: `src/react/player/PlayerDetail.tsx:208` 수정 (편집 모달 미리보기, `120` → `128`)**

```tsx
            <div className="row" style={{ justifyContent: 'center', marginBottom: 'var(--s-md)' }} dangerouslySetInnerHTML={{ __html: avatarSvg(avatarSpec, 128) }} />
```

(`:237`의 `112`는 이미 16의 배수라 손대지 않는다.)

- [ ] **Step 3: `src/styles/tokens.css:333` 수정 (모바일 카드벽, `68px` → `64px`)**

```css
  .pcard-wall .pcard-portrait svg { width: 64px; height: 64px; }
```

- [ ] **Step 4: 데스크톱·모바일 두 폭에서 레이아웃이 안 깨지는지 헤드리스 브라우저로 확인**

`npm run build && npm run preview`(astro preview, 기본 포트 4321, `base: '/weekly-fc'`) 후 `node cdp.mjs http://localhost:4321/weekly-fc/squad/ /tmp/1b-roster.png 1280 900 0`(데스크톱, 표/카드 두 뷰 다), 그리고 `node cdp.mjs http://localhost:4321/weekly-fc/squad/ /tmp/1b-roster-m.png 390 844 1`(모바일 카드벽)로 스크린샷을 찍어, 아바타 칩이 셀 안에서 잘리거나 다른 열과 겹치지 않는지 확인한다. 표 칩(32px)은 열 폭(`width: 44`, RosterList.tsx 컬럼 정의) 안에 들어가므로 문제 없을 것으로 예상되나, 실측으로 확정한다.

- [ ] **Step 5: 테스트 + 커밋**

```bash
npm test
git add src/react/squad/RosterList.tsx src/react/player/PlayerDetail.tsx src/styles/tokens.css
git commit -m "style(avatar): 렌더 크기를 16px 배수로 스냅(28→32, 68→64, 116→112, 120→128)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DaDPzugZyKUdGnpyTH5KY4"
```

---

## Controller 최종 검증 (SDD 최종 리뷰 전, 컨트롤러가 직접)

- `npm test`(unit+build+dist) 전체 통과.
- 헤드리스 브라우저로 `/squad/` 표·카드 뷰, `/squad/{번호}/` 상세 카드, 아바타 편집 모달(모두 열어서) 스크린샷 확대 검증 — 1a에서 겪은 "계산된 스타일은 정상인데 실제 렌더는 흐림" 문제가 재현되지 않는지(픽셀 경계가 또렷한지) 확인. `getComputedStyle`만으로는 이 문제가 안 잡히므로 반드시 확대 스크린샷으로 본다.
- 다이아몬드 얼굴형 선수 하나를 실제로 만들어(또는 위 Step 2 검증 스크립트 재사용) 헤어와 자연스럽게 어울리는지 최종 확인.
- 기존 저장된 아바타 코드(있다면 실제 시트 값, 없으면 `randomAvatar`로 30명 생성)가 전부 깨지지 않고 렌더되는지 확인 — 코드 계약은 안 바꿨으므로 회귀가 없어야 한다.
