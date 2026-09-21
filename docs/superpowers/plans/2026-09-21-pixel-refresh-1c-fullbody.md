# 도트 리프레시 1c단계(전신 픽셀 캐릭터) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `src/components/avatar.ts`를 DiceBear path 조합에서 **24×32 픽셀맵으로 그리는 전신 도트 축구 선수**로 전면 교체한다. 아바타 코드 계약(`f/h/s/e/k`)·`PARTS` 배열 길이·인덱스는 그대로 두고, 그림과 렌더 방식만 바꾼다.

**Architecture:** 부품을 "문자 격자 레이어"로 저작한다. 몸통(공통) → 얼굴형(5) → 헤어(8) → 눈(3) → 입 순으로 겹쳐 24×32 문자맵을 만들고, 가로로 이어진 같은 글자를 하나의 `<rect>`로 합쳐 SVG 문자열을 낸다. 색은 렌더 시점에 팔레트로 주입한다(`K`=저장된 kit hex, `D`=kit의 70% 밝기, `M`=피부의 45% 밝기). 렌더 모드는 둘 — 전신(3:4)과 얼굴 크롭(정사각, `viewBox="4 0 16 16"`).

**Tech Stack:** TypeScript(Astro + React 19), Node 내장 test runner, 헤드리스 Chrome(CDP)로 시각 검증. 새 의존성 없음.

**Spec:** `docs/superpowers/specs/2026-09-21-pixel-refresh-design.md` §3 "전신 픽셀 캐릭터 — [3차 갱신, 위 DiceBear 설계를 대체함]"

## Global Constraints

- `src/lib/avatar.ts`의 코드 형식(`f{n}:h{n}:s{n}:e{n}:k#{hex}`)·`PARTS` 각 배열의 **길이와 인덱스 순서**는 절대 바꾸지 않는다(시트에 저장된 코드가 그대로 유효해야 함). 바꿔도 되는 건 `label` 문자열뿐이다.
- 아바타 렌더 함수는 **동기 함수이고 문자열을 반환**하며, **같은 입력이면 항상 같은 문자열**이어야 한다(`dangerouslySetInnerHTML` 자리들이 이 계약에 기댄다). 난수·전역 카운터·`Date` 금지.
- 새 npm 의존성 추가 금지.
- 모든 좌표는 24×32 격자의 **정수**다. 소수 좌표·둥근 모서리 반지름 2 이상 금지(픽셀 격자가 깨진다).
- `npm test`(unit + build + dist) 통과.

---

### Task 1: 픽셀맵 렌더러로 `avatar.ts` 전면 교체

**Files:**
- Modify (전체 교체): `src/components/avatar.ts`
- Modify (라벨 1개): `src/lib/avatar.ts`
- Modify: `tests/unit/avatar.test.mjs`

**Interfaces:**
- Consumes: `src/lib/avatar.ts`의 `PARTS`, `AvatarSpec`, `isUnsetAvatar` (변경 없음).
- Produces:
  - `avatarSvg(spec: AvatarSpec, size: number, fallbackLabel?: string | number, bare?: boolean): string` — **전신**. `size`는 **세로 길이**이고 가로는 `round(size * 24 / 32)`가 된다. (지금과 같은 이름·인자 순서, 의미만 "정사각 한 변"에서 "세로 길이"로 바뀜.)
  - `avatarFaceSvg(spec: AvatarSpec, size: number, fallbackLabel?: string | number, bare?: boolean): string` — **얼굴+어깨 크롭, 정사각** `size × size`. Task 2의 스쿼드 표 칩이 이걸 쓴다.

- [ ] **Step 1: `src/components/avatar.ts` 전체를 아래 내용으로 교체**

```ts
// src/components/avatar.ts — 24×32 픽셀맵으로 그리는 전신 도트 축구 선수.
// 순수 함수, DOM 접근 없음. 같은 입력이면 항상 같은 문자열을 낸다(동기·결정적) —
// dangerouslySetInnerHTML 로 이 문자열을 쓰는 자리들이 그 계약에 기댄다.
//
// 그림은 "문자 격자"로 저작한다. 한 글자가 한 픽셀이고 '.'은 투명이다.
// 글자는 색 슬롯을 가리킨다:
//   H 머리 · S 피부 · W 흰자 · E 눈동자 · M 입(피부 어두운 톤)
//   K 유니폼 · D 유니폼 그늘 · P 반바지 · O 축구양말 · B 축구화
// 색은 렌더 시점에 팔레트로 주입한다(K 는 선수마다 다른 자유 hex).
import { esc } from '../lib/html.ts';
import { PARTS, isUnsetAvatar, type AvatarSpec } from '../lib/avatar.ts';

const GRID_W = 24;
const GRID_H = 32;
// 얼굴 크롭 창 — 머리(0~12행)와 어깨 윗부분까지 정사각으로 잘라낸다.
const FACE_X = 4;
const FACE_Y = 0;
const FACE_SIZE = 16;

const TINT = 'var(--tint, #333a45)';
const LINE = 'var(--line, #565f6f)';
const MUTED = 'var(--muted, #9da4af)';

/** 행번호 → 그 행의 GRID_W 글자. 빠진 행은 전부 투명. */
type Layer = Record<number, string>;

// ── 몸통: 전원 공통 ──────────────────────────────────────────
const BODY: Layer = {
  13: '.....KKKKKKKKKKKKKK.....',
  14: '.....KKKKKKDDKKKKKK.....',
  15: '.....KKKKKKKKKKKKKK.....',
  16: '.....SSKKKKKKKKKKSS.....',
  17: '.....SSKKKKKKKKKKSS.....',
  18: '.....SSKKKKKKKKKKSS.....',
  19: '......SKKKKKKKKKKS......',
  20: '.......PPPPPPPPPP.......',
  21: '.......PPPPPPPPPP.......',
  22: '.......PPPPPPPPPP.......',
  23: '.......PPPP..PPPP.......',
  24: '........SSS..SSS........',
  25: '........SSS..SSS........',
  26: '........OOO..OOO........',
  27: '........OOO..OOO........',
  28: '........OOO..OOO........',
  29: '.......BBBB..BBBB.......',
  30: '.......BBBB..BBBB.......',
};

// ── 얼굴형 5종 ───────────────────────────────────────────────
// 2~5행(헤어가 닿는 윗부분)은 5종 모두 같은 폭으로 고정한다 — 그래야 어떤
// 헤어를 얹어도 뜨거나 뚫고 나오지 않는다. 다른 건 6~11행의 턱·볼뿐이다.
const HEAD_TOP = {
  2: '.......SSSSSSSSSS.......',
  3: '.......SSSSSSSSSS.......',
  4: '.......SSSSSSSSSS.......',
  5: '.......SSSSSSSSSS.......',
} as const;
const NECK = { 12: '..........SSSS..........' } as const;

const FACE_LAYERS: Record<(typeof PARTS.face)[number]['shape'], Layer> = {
  circle: { ...HEAD_TOP, 6: '.......SSSSSSSSSS.......', 7: '.......SSSSSSSSSS.......', 8: '.......SSSSSSSSSS.......', 9: '.......SSSSSSSSSS.......', 10: '........SSSSSSSS........', 11: '.........SSSSSS.........', ...NECK },
  square: { ...HEAD_TOP, 6: '.......SSSSSSSSSS.......', 7: '.......SSSSSSSSSS.......', 8: '.......SSSSSSSSSS.......', 9: '.......SSSSSSSSSS.......', 10: '.......SSSSSSSSSS.......', 11: '.......SSSSSSSSSS.......', ...NECK },
  hex: { ...HEAD_TOP, 6: '.......SSSSSSSSSS.......', 7: '.......SSSSSSSSSS.......', 8: '.......SSSSSSSSSS.......', 9: '........SSSSSSSS........', 10: '........SSSSSSSS........', 11: '.........SSSSSS.........', ...NECK },
  // diamond(옛 이름) = 광대가 넓고 턱이 좁은 얼굴
  diamond: { ...HEAD_TOP, 6: '......SSSSSSSSSSSS......', 7: '......SSSSSSSSSSSS......', 8: '......SSSSSSSSSSSS......', 9: '.......SSSSSSSSSS.......', 10: '........SSSSSSSS........', 11: '.........SSSSSS.........', ...NECK },
  // pill(옛 이름) = 갸름한 얼굴
  pill: { ...HEAD_TOP, 6: '........SSSSSSSS........', 7: '........SSSSSSSS........', 8: '........SSSSSSSS........', 9: '........SSSSSSSS........', 10: '........SSSSSSSS........', 11: '........SSSSSSSS........', ...NECK },
};

// ── 헤어 8종 ─────────────────────────────────────────────────
const HAIR_LAYERS: Record<(typeof PARTS.hair)[number]['shape'], Layer> = {
  none: {},
  short: { 1: '.......HHHHHHHHHH.......', 2: '......HHHHHHHHHHHH......', 3: '......HHHHHHHHHHHH......', 4: '......HH........HH......', 5: '......HH........HH......' },
  buzz: { 2: '.......HHHHHHHHHH.......', 3: '.......HHHHHHHHHH.......', 4: '.......H........H.......' },
  long: { 1: '.......HHHHHHHHHH.......', 2: '......HHHHHHHHHHHH......', 3: '......HHHHHHHHHHHH......', 4: '......HH........HH......', 5: '......HH........HH......', 6: '......HH........HH......', 7: '......HH........HH......', 8: '......HH........HH......', 9: '......HH........HH......', 10: '......HH........HH......' },
  mohawk: { 0: '..........HHHH..........', 1: '..........HHHH..........', 2: '..........HHHH..........', 3: '..........HHHH..........', 4: '..........HHHH..........' },
  afro: { 0: '......HHHHHHHHHHHH......', 1: '.....HHHHHHHHHHHHHH.....', 2: '.....HHHHHHHHHHHHHH.....', 3: '.....HHHHHHHHHHHHHH.....', 4: '.....HH..........HH.....', 5: '.....HH..........HH.....', 6: '......H..........H......' },
  side: { 1: '.......HHHHHHHHHH.......', 2: '......HHHHHHHHHHHH......', 3: '......HHHHHHHH..HH......', 4: '......HHHHH......H......', 5: '......HH.........H......' },
  curly: { 0: '.......H.HH.HH.H........', 1: '......HHHHHHHHHHHH......', 2: '......HHHHHHHHHHHH......', 3: '......HHHHHHHHHHHH......', 4: '......HH........HH......', 5: '.......H........H.......' },
};

// ── 눈 3종 + 입(공통) ────────────────────────────────────────
const EYE_LAYERS: Record<(typeof PARTS.eyes)[number]['shape'], Layer> = {
  dot: { 7: '.........WE..WE.........' },
  line: { 7: '.........EE..EE.........' },
  wide: { 6: '.........WW..WW.........', 7: '.........WE..WE.........' },
};
const MOUTH: Layer = { 9: '...........MM...........' };

/** #rrggbb 를 f 배 밝기로. 유니폼 그늘·입 색을 코드로 만들어 팔레트를 늘리지 않는다. */
function shade(hex: string, f: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const part = (v: number) => Math.round(v * f).toString(16).padStart(2, '0');
  return `#${part((n >> 16) & 255)}${part((n >> 8) & 255)}${part(n & 255)}`;
}

/** 레이어를 순서대로 겹쳐 24×32 문자맵으로. 뒤 레이어가 앞 레이어를 덮는다. */
function compose(layers: Layer[]): string[] {
  const grid: string[][] = Array.from({ length: GRID_H }, () => Array.from({ length: GRID_W }, () => '.'));
  for (const layer of layers) {
    for (const key of Object.keys(layer)) {
      const y = Number(key);
      const row = layer[y];
      for (let x = 0; x < GRID_W; x++) if (row[x] !== '.') grid[y][x] = row[x];
    }
  }
  return grid.map((row) => row.join(''));
}

/** 잘라낸 창 안에서, 가로로 이어진 같은 글자를 rect 하나로 합쳐 낸다. */
function rectsOf(map: string[], palette: Record<string, string>, x0: number, y0: number, w: number, h: number): string {
  const out: string[] = [];
  for (let y = y0; y < y0 + h; y++) {
    let x = x0;
    while (x < x0 + w) {
      const ch = map[y][x];
      if (ch === '.') { x += 1; continue; }
      let len = 1;
      while (x + len < x0 + w && map[y][x + len] === ch) len += 1;
      out.push(`<rect x="${x}" y="${y}" width="${len}" height="1" fill="${palette[ch]}"/>`);
      x += len;
    }
  }
  return out.join('');
}

/** 테두리는 stroke 대신 사각형 두 장으로 — 격자에 딱 맞아 픽셀 톤이 유지된다. */
function svgFrame(x0: number, y0: number, w: number, h: number, width: number, height: number, inner: string, bare: boolean): string {
  const bg = bare ? '' : `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" rx="1" fill="${LINE}"/><rect x="${x0 + 1}" y="${y0 + 1}" width="${w - 2}" height="${h - 2}" rx="1" fill="${TINT}"/>`;
  return `<svg viewBox="${x0} ${y0} ${w} ${h}" width="${width}" height="${height}" class="avatar-svg" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg">${bg}${inner}</svg>`;
}

function paletteOf(spec: AvatarSpec): Record<string, string> {
  const hair = PARTS.hair[spec.hair] ?? PARTS.hair[0];
  const skin = PARTS.skin[spec.skin] ?? PARTS.skin[0];
  const eyes = PARTS.eyes[spec.eyes] ?? PARTS.eyes[0];
  const kit = /^#[0-9a-fA-F]{6}$/.test(spec.kit) ? spec.kit : '#333a45';
  return {
    H: hair.color || skin.color,
    S: skin.color,
    W: '#ffffff',
    E: eyes.color,
    M: shade(skin.color, 0.45),
    K: kit,
    D: shade(kit, 0.7),
    P: '#e8e8e8',
    O: kit,
    B: '#1a1a1a',
  };
}

function mapOf(spec: AvatarSpec): string[] {
  const face = PARTS.face[spec.face] ?? PARTS.face[0];
  const hair = PARTS.hair[spec.hair] ?? PARTS.hair[0];
  const eyes = PARTS.eyes[spec.eyes] ?? PARTS.eyes[0];
  return compose([BODY, FACE_LAYERS[face.shape], HAIR_LAYERS[hair.shape], EYE_LAYERS[eyes.shape], MOUTH]);
}

/** 파싱 실패·미설정 스펙일 때의 폴백: 번호만 든 칸. */
function fallback(x0: number, y0: number, w: number, h: number, width: number, height: number, label: string | number | undefined, bare: boolean): string {
  const text = label != null && label !== '' ? esc(String(label)) : '?';
  const inner = `<text x="${x0 + w / 2}" y="${y0 + h / 2 + 3}" text-anchor="middle" font-size="8" font-weight="600" fill="${MUTED}">${text}</text>`;
  return svgFrame(x0, y0, w, h, width, height, inner, bare);
}

/**
 * 전신 도트 선수. `size`는 **세로 길이**이고 가로는 3:4 비율로 따라온다
 * (카드 머리 영역이 높이 기준이라 세로만 맞추면 레이아웃이 안 흔들린다).
 */
export function avatarSvg(spec: AvatarSpec, size: number, fallbackLabel?: string | number, bare = false): string {
  const width = Math.round((size * GRID_W) / GRID_H);
  if (isUnsetAvatar(spec)) return fallback(0, 0, GRID_W, GRID_H, width, size, fallbackLabel, bare);
  return svgFrame(0, 0, GRID_W, GRID_H, width, size, rectsOf(mapOf(spec), paletteOf(spec), 0, 0, GRID_W, GRID_H), bare);
}

/**
 * 같은 그림에서 머리+어깨만 정사각으로 잘라낸 것. 스쿼드 표의 작은 칩처럼
 * 전신이 뭉개지는 자리에 쓴다.
 */
export function avatarFaceSvg(spec: AvatarSpec, size: number, fallbackLabel?: string | number, bare = false): string {
  if (isUnsetAvatar(spec)) return fallback(FACE_X, FACE_Y, FACE_SIZE, FACE_SIZE, size, size, fallbackLabel, bare);
  return svgFrame(FACE_X, FACE_Y, FACE_SIZE, FACE_SIZE, size, size, rectsOf(mapOf(spec), paletteOf(spec), FACE_X, FACE_Y, FACE_SIZE, FACE_SIZE), bare);
}
```

- [ ] **Step 2: `src/lib/avatar.ts`의 얼굴형 라벨 하나 수정**

그림이 "다이아몬드"에서 "광대가 넓은 얼굴"로 바뀌었으니 라벨만 맞춘다. **`id`·순서·배열 길이는 절대 건드리지 않는다.**

바꾸기 전:
```ts
    { id: 'f3', label: '다이아', shape: 'diamond' },
```
바꾼 뒤:
```ts
    { id: 'f3', label: '넓적', shape: 'diamond' },
```

- [ ] **Step 3: `tests/unit/avatar.test.mjs` 하단 테스트 교체**

DiceBear 전용 회귀 테스트 두 개(`translate(4 5)`, 입 막대 좌표)는 그 구현이 사라지므로 **지운다**. 정사각을 전제한 단언도 고친다.

지울 것 — 파일 맨 끝 두 테스트 전체:
```js
test('avatarSvg: 눈이 로컬 좌표(translate(4 5))에 배치된다 (회귀 — 이 transform이 빠지면 눈 위치가 틀어짐)', () => {
  const svg = avatarSvg(randomAvatar(1), 32);
  assert.match(svg, /translate\(4 5\)/);
});

test('avatarSvg: 입 막대가 로컬 16단위 좌표(턱 부근)에 그려진다 (회귀 — 바깥 0~100 좌표로 되돌아가면 얼굴형과 안 맞음)', () => {
  const svg = avatarSvg(randomAvatar(1), 32);
  assert.match(svg, /<rect x="6\.5" y="10\.4" width="3" height="0\.6" rx="0\.3"/);
});
```

고칠 것 — 기존 "요청한 크기로 낸다" 테스트(정사각 전제):
```js
test('avatarSvg: 정상 스펙은 SVG 문자열을 요청한 크기로 낸다', () => {
  const svg = avatarSvg(randomAvatar(9), 28);
  assert.match(svg, /^<svg /);
  assert.match(svg, /width="28" height="28"/);
});
```
를 아래로:
```js
test('avatarSvg: size는 세로 길이이고 가로는 3:4로 따라온다', () => {
  const svg = avatarSvg(randomAvatar(9), 32);
  assert.match(svg, /^<svg /);
  assert.match(svg, /width="24" height="32"/);
});
```

맨 위 import 줄도 고친다 — 바꾸기 전:
```js
import { avatarSvg } from '../../src/components/avatar.ts';
```
바꾼 뒤:
```js
import { avatarSvg, avatarFaceSvg } from '../../src/components/avatar.ts';
```

그리고 파일 맨 끝에 아래 테스트들을 **추가**한다:
```js
test('avatarFaceSvg: 얼굴 크롭은 정사각이고 머리 창만 본다', () => {
  const svg = avatarFaceSvg(randomAvatar(9), 32);
  assert.match(svg, /width="32" height="32"/);
  assert.match(svg, /viewBox="4 0 16 16"/);
});

test('avatarSvg: 같은 입력이면 항상 같은 문자열 (결정적 — dangerouslySetInnerHTML 계약)', () => {
  const spec = randomAvatar(7);
  assert.equal(avatarSvg(spec, 112), avatarSvg(spec, 112));
  assert.equal(avatarFaceSvg(spec, 32), avatarFaceSvg(spec, 32));
});

test('avatarSvg: 좌표가 전부 정수다 (픽셀 격자가 깨지지 않는다)', () => {
  const svg = avatarSvg(randomAvatar(3), 112);
  for (const m of svg.matchAll(/(?:x|y|width|height)="([\d.]+)"/g)) {
    assert.ok(!m[1].includes('.'), `소수 좌표가 있다: ${m[0]}`);
  }
});

test('avatarSvg: 유니폼 색이 저장된 kit hex 그대로 칠해진다', () => {
  const svg = avatarSvg({ face: 0, hair: 1, skin: 0, eyes: 0, kit: '#2980b9' }, 112);
  assert.ok(svg.includes('fill="#2980b9"'), '유니폼 색이 안 들어갔다');
});

test('avatarSvg: 부품 조합 전수 — 5×8×3 전부 유효한 SVG를 낸다', () => {
  for (let face = 0; face < PARTS.face.length; face++) {
    for (let hair = 0; hair < PARTS.hair.length; hair++) {
      for (let eyes = 0; eyes < PARTS.eyes.length; eyes++) {
        const svg = avatarSvg({ face, hair, skin: 2, eyes, kit: '#2980b9' }, 112);
        assert.match(svg, /^<svg /);
        assert.match(svg, /<\/svg>$/);
      }
    }
  }
});
```

기존 테스트 중 **그대로 두는 것**: 코드 왕복·클램프·`randomAvatar` 결정성·서버 정규식 계약·미설정 폴백(`/>9</`)·30명 유일성·`shape-rendering=crispEdges`·얼굴형 5종/헤어 8종 유효성.

- [ ] **Step 4: 테스트 실행**

```bash
npm test
```
Expected: 전부 PASS.

- [ ] **Step 5: 헤드리스 브라우저로 실제 그림 확인**

스크래치 디렉토리(레포 밖, 커밋하지 않음)에 아래 스크립트를 만들어 실행한다. Node 25라 `.ts`를 플래그 없이 바로 import할 수 있다(기존 테스트와 같은 방식).

```js
// 예: /tmp/verify-1c.mjs
import { avatarSvg, avatarFaceSvg } from '<repo>/src/components/avatar.ts';
import { PARTS } from '<repo>/src/lib/avatar.ts';
import { writeFileSync } from 'node:fs';
let html = '<body style="background:#111;display:flex;flex-wrap:wrap;gap:8px;padding:16px">';
for (let hair = 0; hair < PARTS.hair.length; hair++) html += avatarSvg({ face: 0, hair, skin: 0, eyes: 0, kit: '#2980b9' }, 150);
for (let face = 0; face < PARTS.face.length; face++) html += avatarSvg({ face, hair: 1, skin: 0, eyes: 0, kit: '#c0392b' }, 150);
for (let eyes = 0; eyes < PARTS.eyes.length; eyes++) html += avatarSvg({ face: 0, hair: 1, skin: 3, eyes, kit: '#27ae60' }, 150);
html += avatarSvg({ face: 0, hair: 5, skin: 4, eyes: 2, kit: '#f1c40f' }, 112);
html += avatarFaceSvg({ face: 0, hair: 5, skin: 4, eyes: 2, kit: '#f1c40f' }, 32);
html += '</body>';
writeFileSync('/tmp/verify-1c.html', html);
```

띄워서 스크린샷을 찍는다(레포 밖 헬퍼 재사용):
```bash
cd /tmp && python3 -m http.server 8801 &
node /private/tmp/claude-501/-Users-junyoungkim/707543c0-f7f4-4fed-b000-a90da8893c64/scratchpad/cdp.mjs \
  "http://127.0.0.1:8801/verify-1c.html" /tmp/verify-1c.png 1400 700 0
```

확인할 것 — 하나라도 틀리면 픽셀맵 좌표를 고치고 다시 찍는다:
- 헤어 8종이 서로 구분되고, **머리 위에 떠 있거나 두개골을 뚫고 나오는 것이 없다**.
- 얼굴형 5종이 구분되고, 어떤 얼굴형에서도 헤어가 어색하게 잘리지 않는다.
- 눈 3종이 구분되고 얼굴 안에 있다. 입이 턱 위가 아니라 얼굴 안에 있다.
- 유니폼·반바지·양말·축구화가 순서대로 이어져 다리가 끊겨 보이지 않는다.
- 얼굴 크롭(32px)에 머리가 잘리지 않고 다 들어온다.
- 끝나면 띄운 서버를 종료한다.

- [ ] **Step 6: 커밋**

```bash
npm test
git add src/components/avatar.ts src/lib/avatar.ts tests/unit/avatar.test.mjs
git commit -m "$(cat <<'MSG'
feat(avatar): 24x32 픽셀맵 전신 도트 선수로 교체 — DiceBear 걷어냄

머리만 있는 아이콘 대신 유니폼·반바지·축구양말·축구화를 갖춘 전신 캐릭터를
문자 격자로 저작해 그린다. 얼굴형 5종의 윗부분을 같은 폭으로 고정해 어떤
헤어도 맞게 했고, clipPath 가 없어져 nextUid() 비결정성도 같이 사라졌다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DaDPzugZyKUdGnpyTH5KY4
MSG
)"
```

---

### Task 2: 호출부 — 표 칩은 얼굴만, 나머지는 전신

**Files:**
- Modify: `src/react/squad/RosterList.tsx` (import 한 줄 + 표 칩 호출 한 줄)
- Modify: `src/styles/tokens.css:333`

**Interfaces:**
- Consumes: Task 1이 낸 `avatarSvg`(전신, `size`=세로)와 `avatarFaceSvg`(얼굴, 정사각).
- Produces: 없음(호출부 말단).

- [ ] **Step 1: `src/react/squad/RosterList.tsx:7` — import에 `avatarFaceSvg` 추가**

바꾸기 전:
```tsx
import { avatarSvg } from '../../components/avatar';
```
바꾼 뒤:
```tsx
import { avatarSvg, avatarFaceSvg } from '../../components/avatar';
```

- [ ] **Step 2: 표 칩(32px)을 얼굴 크롭으로**

`RosterList.tsx`의 표 컬럼 정의 안, `title: '', key: 'avatar'` 컬럼의 `render`를 찾는다(지금은 `avatarSvg(avatarSpecFor(p.num, p.avatar), 32, p.num)`). 함수 이름만 바꾼다:

```tsx
      render: (_, p) => <span dangerouslySetInnerHTML={{ __html: avatarFaceSvg(avatarSpecFor(p.num, p.avatar), 32, p.num) }} /> },
```

카드형 초상(같은 파일, `playerCard(p, avatarSvg(..., 112, p.num, true))`)과 `PlayerDetail.tsx`의 두 자리(112·128)는 **그대로 둔다** — 전신이 맞고, `size`가 세로라서 높이가 지금과 같다.

- [ ] **Step 3: `src/styles/tokens.css:333` — 모바일 카드벽 초상 가로를 3:4로**

바꾸기 전:
```css
  .pcard-wall .pcard-portrait svg { width: 64px; height: 64px; }
```
바꾼 뒤:
```css
  .pcard-wall .pcard-portrait svg { width: 48px; height: 64px; }
```

- [ ] **Step 4: 실제 화면에서 레이아웃 확인**

```bash
npm run build && npm run preview
```
`astro preview`가 띄운 포트를 실제 출력에서 확인한 뒤(기본 4321, base 경로는 `/weekly-fc`), 헤드리스로 찍는다:
```bash
node /private/tmp/claude-501/-Users-junyoungkim/707543c0-f7f4-4fed-b000-a90da8893c64/scratchpad/cdp.mjs \
  "http://localhost:4321/weekly-fc/squad/" /tmp/1c-desktop.png 1280 900 0
node /private/tmp/claude-501/-Users-junyoungkim/707543c0-f7f4-4fed-b000-a90da8893c64/scratchpad/cdp.mjs \
  "http://localhost:4321/weekly-fc/squad/" /tmp/1c-mobile.png 390 844 1
```

확인할 것:
- 표 뷰(「표」 세그먼트): 32px 칩에 얼굴이 잘리지 않고 들어가고, 44px 폭 열을 넘지 않는다.
- 카드 뷰(「카드」 세그먼트): 84×112 초상이 카드 머리 영역(`min-height:104px`) 안에서 OVR 블록과 겹치지 않는다.
- 선수 상세(`/weekly-fc/squad/<번호>/`): 카드 초상이 같은 높이로 나온다.
- 아바타 편집 모달(초상 클릭): 128 높이 미리보기가 부품 목록과 안 겹친다.
- 모바일 카드벽: 48×64 초상이 카드 안에 들어간다(모바일 명단은 기본적으로 닫힌 Drawer 안이라, 「전체」 버튼을 눌러 연 뒤에 찍어야 보인다).
- 가로 스크롤이 생기지 않는다(`cdp.mjs`가 출력하는 `overflow` 목록이 비어 있어야 한다).
- 끝나면 띄운 preview 서버를 종료한다.

- [ ] **Step 5: 테스트 + 커밋**

```bash
npm test
git add src/react/squad/RosterList.tsx src/styles/tokens.css
git commit -m "$(cat <<'MSG'
style(avatar): 표 칩은 얼굴 크롭, 카드·상세는 전신 3:4

32px 칩에서 전신은 다리·부츠가 뭉개져 색 덩어리로 보인다(목업 실측).
세로 길이는 그대로라 카드 머리 영역 레이아웃은 안 흔들린다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DaDPzugZyKUdGnpyTH5KY4
MSG
)"
```

---

## Controller 최종 검증 (SDD 최종 리뷰 전, 컨트롤러가 직접)

- `npm test` 전체 통과.
- 라이브가 아니라 로컬 빌드 기준으로 스쿼드 표·카드·상세·편집 모달·모바일 카드벽을 **확대 스크린샷**으로 확인 — 계산된 스타일만으로는 픽셀이 뭉개지는지 안 보인다(1a·1b에서 두 번 겪음).
- `PARTS` 배열 길이·인덱스가 그대로인지, 시트에 저장된 기존 코드(`f2:h5:s3:e1:k#...`)가 그대로 파싱돼 렌더되는지 확인.
- 아바타 편집 모달에서 부품을 바꿀 때 미리보기가 실제로 따라 바뀌는지(눌러서) 확인.
