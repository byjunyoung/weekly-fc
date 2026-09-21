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
    { d: 'M2 3h2v3H2zm10 0h2v3h-2z' },
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
const AFRO = (fill: string): string => `<circle cx="8" cy="7" r="9" fill="${fill}"/>`;

// 아프로만 얼굴형보다 먼저(뒤에) 그려 얼굴이 중앙을 덮게 한다 — 나머지는 DiceBear
// 원본처럼 얼굴 위(앞)에 그린다(빌려온 path 자체가 그 순서로 디자인돼 있음).
const HAIR_BEHIND = new Set<(typeof PARTS.hair)[number]['shape']>(['afro']);

function hairShape(shape: (typeof PARTS.hair)[number]['shape'], fill: string): string {
  if (shape === 'none') return '';
  if (shape === 'afro') return AFRO(fill);
  return dbPath(DB_HAIR[shape], fill);
}
function eyesShape(shape: (typeof PARTS.eyes)[number]['shape'], fill: string): string {
  return `<g transform="translate(4 5)">${dbPath(DB_EYES[shape], fill)}</g>`;
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
 * 편집 모달 미리보기 128 / 모바일 카드벽 64). [2026-09-21 정정] "16의 배수라 안
 * 흐려짐"은 스펙 §3/§8 원안의 잘못된 근거였다 — `shape-rendering="crispEdges"`가
 * 앤티앨리어싱 자체를 막아 주므로 16이든 25든 정확한 배수일 필요가 없다(로컬 좌표는
 * `scale(4)`라 정수배가 되려면 사실 25의 배수여야 하고, 32/64/112/128은 그것도 아니다
 * — 다만 crispEdges 덕에 실무상 무관). 렌더 크기 값 자체는 바꾸지 않았다.
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
    // 입 막대 — 로컬 16단위 좌표(얼굴형 5종의 턱 부근에 동시에 맞도록 계산됨).
    // 예전엔 이 자리가 바깥(0~100) 좌표계에 있어서 로컬 좌표 얼굴형과 안 맞았다(최종 리뷰 지적).
    `<rect x="6.5" y="10.4" width="3" height="0.6" rx="0.3" fill="${MUTED}"/>`,
  ].join('');
  const inner = [
    bare ? '' : `<rect x="2" y="2" width="96" height="96" rx="16" fill="${TINT}"/>`,
    `<path d="M10 100 L28 62 Q50 50 72 62 L90 100 Z" fill="${kit}"/>`,
    `<g transform="translate(18 8) scale(4)">${head}</g>`,
  ].join('');
  return chip(nextUid(), size, inner, bare);
}
