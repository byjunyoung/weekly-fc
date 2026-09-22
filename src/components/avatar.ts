// src/components/avatar.ts — 24×32 픽셀맵으로 그리는 전신 도트 축구 선수.
// 순수 함수, DOM 접근 없음. 같은 입력이면 항상 같은 문자열을 낸다(동기·결정적) —
// dangerouslySetInnerHTML 로 이 문자열을 쓰는 자리들이 그 계약에 기댄다.
//
// 그림은 "문자 격자"로 저작한다. 한 글자가 한 픽셀이고 '.'은 투명이다.
// 글자는 색 슬롯을 가리킨다:
//   H 머리 · S 피부 · W 흰자 · E 눈동자 · M 입(피부 어두운 톤)
//   K 유니폼 · D 유니폼 그늘(무늬에도 재사용) · P 반바지 · O 축구양말 · B 축구화
//   T 손목테이프 · G 장갑                                   (2026-09-22 축구 테마 확장)
// 색은 렌더 시점에 팔레트로 주입한다(K 는 선수마다 다른 자유 hex).
//
// 팔 부위 3행은 각자 독립된 커스텀 자리다 — BODY 가 그리는 기본 모양(반팔+맨손)
// 위에 겹쳐 칠하는 순서로만 바뀐다: 16~17행 소매(유니폼 무늬 '긴팔'만), 18행 손목
// (테이프), 19행 손(장갑). 서로 다른 행이라 세 커스텀이 동시에 켜져도 안 부딪힌다.
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
  hex: { ...HEAD_TOP, 6: '.......SSSSSSSSSS.......', 7: '.......SSSSSSSSSS.......', 8: '.......SSSSSSSSSS.......', 9: '........SSSSSSSS........', 10: '.........SSSSSS.........', 11: '..........SSSS..........', ...NECK },
  // diamond(옛 이름) = 광대가 넓고 턱이 좁은 얼굴
  diamond: { ...HEAD_TOP, 6: '......SSSSSSSSSSSS......', 7: '......SSSSSSSSSSSS......', 8: '......SSSSSSSSSSSS......', 9: '.......SSSSSSSSSS.......', 10: '........SSSSSSSS........', 11: '.........SSSSSS.........', ...NECK },
  // pill(옛 이름) = 갸름한 얼굴
  pill: { ...HEAD_TOP, 6: '.......SSSSSSSSSS.......', 7: '........SSSSSSSS........', 8: '........SSSSSSSS........', 9: '........SSSSSSSS........', 10: '........SSSSSSSS........', 11: '........SSSSSSSS........', ...NECK },
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
  curly: { 0: '.......H.HH..HH.H.......', 1: '......HHHHHHHHHHHH......', 2: '......HHHHHHHHHHHH......', 3: '......HHHHHHHHHHHH......', 4: '......HH........HH......', 5: '.......H........H.......' },
};

// ── 눈 3종 + 입(공통) ────────────────────────────────────────
const EYE_LAYERS: Record<(typeof PARTS.eyes)[number]['shape'], Layer> = {
  dot: { 7: '.........WE..WE.........' },
  line: { 7: '.........EE..EE.........' },
  wide: { 6: '.........WW..WW.........', 7: '.........WE..WE.........' },
};
const MOUTH: Layer = { 9: '...........MM...........' };

// ── 유니폼 무늬 4종 ──────────────────────────────────────────
// 색은 새 팔레트 슬롯 없이 D(유니폼 그늘)를 재사용한다 — BODY 가 이미 14행 칼라
// 트림에 D를 쓰고 있어(collar), 같은 색으로 무늬를 더하는 게 자연스럽다.
// 몸통 폭(5~18행 · 13~15행)·팔 폭(5~6·17~18행 · 16~17행)은 BODY 와 정확히 맞춘다.
const JERSEY_LAYERS: Record<(typeof PARTS.jersey)[number]['shape'], Layer> = {
  solid: {},
  // 세로 스트라이프 — 몸통 폭(5~18행) 안에서 3줄.
  stripes: { 13: '........D...D...D.......', 14: '........D...D...D.......', 15: '........D...D...D.......' },
  // 가슴 아래 가로 밴드(후프) — 몸통 폭 그대로 한 줄만 D로.
  hoops: { 15: '.....DDDDDDDDDDDDDD.....' },
  // 긴팔 — 위팔(16~17행)의 맨살(S)을 유니폼 색으로 덮는다(소매가 손목까지 내려온 모양).
  sleeves: { 16: '.....DD..........DD.....', 17: '.....DD..........DD.....' },
};

// ── 손목테이프·장갑 ──────────────────────────────────────────
// 각각 18행(손목)·19행(손)만 건드린다 — BODY 의 그 위치(S)를 그대로 덮어쓴다.
const TAPE_LAYERS: Record<'off' | 'on', Layer> = {
  off: {},
  on: { 18: '.....TT..........TT.....' },
};
const GLOVE_LAYERS: Record<'off' | 'on', Layer> = {
  off: {},
  on: { 19: '......G..........G......' },
};

/** #rrggbb 를 f 배 밝기로. 유니폼 그늘·입 색을 코드로 만들어 팔레트를 늘리지 않는다. */
function shade(hex: string, f: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const part = (v: number) => Math.min(255, Math.round(v * f)).toString(16).padStart(2, '0');
  return `#${part((n >> 16) & 255)}${part((n >> 8) & 255)}${part(n & 255)}`;
}

/** 0~1 근사 밝기 — 부품끼리 구분되는지만 보면 되므로 정확한 WCAG 공식은 쓰지 않는다. */
function brightness(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
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
  // 2026-09-22 에 늘린 네 부품 — spec 에 없으면(옛 스펙) ?? 0 으로 "없음"/기본값.
  const socks = PARTS.socks[spec.socks ?? 0] ?? PARTS.socks[0];
  const gloves = PARTS.gloves[spec.gloves ?? 0] ?? PARTS.gloves[0];
  const tape = PARTS.tape[spec.tape ?? 0] ?? PARTS.tape[0];
  return {
    H: hair.color || skin.color,
    S: skin.color,
    W: '#ffffff',
    E: eyes.color,
    // 아주 어두운 피부에서는 입을 어둡게가 아니라 밝게 해야 보인다.
    M: brightness(skin.color) < 0.3 ? shade(skin.color, 1.7) : shade(skin.color, 0.45),
    K: kit,
    D: shade(kit, 0.7),
    // 거의 흰 유니폼을 고르면 흰 반바지와 한 덩어리가 되므로 반바지를 내린다.
    P: brightness(kit) > 0.85 ? '#9aa0a8' : '#e8e8e8',
    // 양말은 "유니폼과 같음"(color:'')이면 kit 를 그대로 따라간다 — 옛 동작과 동일.
    O: socks.color || kit,
    B: '#1a1a1a',
    // 장갑·테이프가 "없음"이어도 팔레트엔 안전한 색을 채워 둔다 — 해당 글자는
    // GLOVE_LAYERS.off/TAPE_LAYERS.off 가 비어 있어 어차피 안 쓰인다.
    G: gloves.color || skin.color,
    T: tape.color || skin.color,
  };
}

function mapOf(spec: AvatarSpec): string[] {
  const face = PARTS.face[spec.face] ?? PARTS.face[0];
  const hair = PARTS.hair[spec.hair] ?? PARTS.hair[0];
  const eyes = PARTS.eyes[spec.eyes] ?? PARTS.eyes[0];
  const jersey = PARTS.jersey[spec.jersey ?? 0] ?? PARTS.jersey[0];
  const glove = (spec.gloves ?? 0) > 0 ? 'on' : 'off';
  const tape = (spec.tape ?? 0) > 0 ? 'on' : 'off';
  return compose([
    BODY, JERSEY_LAYERS[jersey.shape], TAPE_LAYERS[tape], GLOVE_LAYERS[glove],
    FACE_LAYERS[face.shape], HAIR_LAYERS[hair.shape], EYE_LAYERS[eyes.shape], MOUTH,
  ]);
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
