// src/components/avatar.ts — 부품 조합 SVG 아바타. 순수 함수, DOM 접근 없음
// (3~5단계에서 캔버스 컨텍스트로도 그대로 쓸 수 있어야 하므로).
// 색은 var(--토큰, 폴백hex) 형태로 써서 두 상황 모두 맞춘다: 페이지에 인라인으로
// 붙으면 실제 CSS 변수를, canvas용 Image src(data:image/svg+xml)처럼 문서 밖
// 단독 SVG로 쓰이면 폴백 hex 값을 쓴다(짙은 바탕 기준, tokens.css 다크 값과 맞춰 둠).
import { esc } from '../lib/html.ts';
import { href } from '../lib/url.ts';
import { PARTS, isUnsetAvatar, type AvatarSpec } from '../lib/avatar.ts';

let uidSeq = 0;
const nextUid = (): string => { uidSeq += 1; return `av${uidSeq}`; };

const TINT = 'var(--tint, #333a45)';
const LINE = 'var(--line, #565f6f)';
const MUTED = 'var(--muted, #9da4af)';
const FG = 'var(--fg, #edf0f3)';

function faceShape(shape: (typeof PARTS.face)[number]['shape'], fill: string): string {
  switch (shape) {
    case 'circle': return `<circle cx="50" cy="44" r="22" fill="${fill}"/>`;
    case 'square': return `<rect x="29" y="23" width="42" height="42" rx="6" fill="${fill}"/>`;
    case 'hex': return `<polygon points="50,20 72,32 72,56 50,68 28,56 28,32" fill="${fill}"/>`;
    case 'diamond': return `<rect x="30" y="24" width="40" height="40" rx="4" fill="${fill}" transform="rotate(45 50 44)"/>`;
    case 'pill': return `<rect x="33" y="14" width="34" height="60" rx="17" fill="${fill}"/>`;
  }
}
// 앞머리형(위에 얹힘) vs 뒷머리형(얼굴보다 먼저 그려 옆으로 삐져나옴)만 구분한다.
const HAIR_BEHIND = new Set(['long', 'afro']);
function hairShape(shape: (typeof PARTS.hair)[number]['shape'], fill: string): string {
  switch (shape) {
    case 'none': return '';
    case 'short': return `<rect x="27" y="14" width="46" height="16" rx="8" fill="${fill}"/>`;
    case 'buzz': return `<rect x="29" y="16" width="42" height="10" rx="5" fill="${fill}"/>`;
    case 'long': return `<rect x="27" y="14" width="46" height="14" rx="7" fill="${fill}"/><rect x="21" y="24" width="10" height="48" rx="5" fill="${fill}"/><rect x="69" y="24" width="10" height="48" rx="5" fill="${fill}"/>`;
    case 'mohawk': return `<rect x="46" y="4" width="8" height="24" rx="4" fill="${fill}"/>`;
    case 'afro': return `<circle cx="50" cy="38" r="32" fill="${fill}"/>`;
    case 'side': return `<rect x="24" y="14" width="38" height="16" rx="8" fill="${fill}"/>`;
    case 'curly': return `<circle cx="34" cy="20" r="10" fill="${fill}"/><circle cx="50" cy="13" r="11" fill="${fill}"/><circle cx="66" cy="20" r="10" fill="${fill}"/>`;
  }
}
function eyesShape(shape: (typeof PARTS.eyes)[number]['shape'], fill: string): string {
  switch (shape) {
    case 'dot': return `<circle cx="40" cy="44" r="4" fill="${fill}"/><circle cx="60" cy="44" r="4" fill="${fill}"/>`;
    case 'line': return `<rect x="35" y="42" width="10" height="3" rx="1.5" fill="${fill}"/><rect x="55" y="42" width="10" height="3" rx="1.5" fill="${fill}"/>`;
    case 'wide': return `<circle cx="40" cy="44" r="6" fill="${fill}"/><circle cx="60" cy="44" r="6" fill="${fill}"/><circle cx="40" cy="44" r="2" fill="${FG}"/><circle cx="60" cy="44" r="2" fill="${FG}"/>`;
  }
}

const chip = (uid: string, size: number, inner: string, bare = false): string =>
  `<svg viewBox="0 0 100 100" width="${size}" height="${size}" class="avatar-svg" xmlns="http://www.w3.org/2000/svg">` +
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
 * spec을 인라인 SVG 문자열로. size는 렌더 크기(px 단위, 표 셀 24~32 / 카드 120+
 * 양쪽에서 다 읽혀야 함). fallbackLabel은 spec이 미설정일 때만 쓰는 번호(선택) —
 * randomAvatar로 시드를 채우는 정상 경로에서는 이 분기를 타지 않는다.
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
  const inner = [
    bare ? '' : `<rect x="2" y="2" width="96" height="96" rx="16" fill="${TINT}"/>`,
    `<path d="M10 100 L28 62 Q50 50 72 62 L90 100 Z" fill="${kit}"/>`,
    behind ? hairSvg : '',
    faceShape(face.shape, skin.color),
    behind ? '' : hairSvg,
    eyesShape(eyes.shape, eyes.color),
    `<rect x="40" y="60" width="20" height="3" rx="1.5" fill="${MUTED}"/>`,
  ].join('');
  return chip(nextUid(), size, inner, bare);
}

/** 실사 사진 오버레이 — avatarSvg() 출력 앞에 겹쳐 쓴다. 파일이 있으면 사진이
 * SVG를 가리고, 없으면(404) onerror가 이 <img>만 지워 밑에 이미 그려진 SVG가
 * 그대로 드러난다 — 매니페스트 없이 파일 존재 자체가 "사진 있음" 신호다
 * (스펙 4절 · docs/superpowers/specs/2026-09-20-player-photo-cards-design.md).
 * size는 avatarSvg()에 준 것과 같은 값을 넘겨 같은 박스에 겹치게 한다. */
export function photoHtml(num: number, size: number): string {
  return `<img class="pcard-photo" src="${href(`/players/${num}.jpg`)}" alt="" width="${size}" height="${size}" onerror="this.remove()" />`;
}
