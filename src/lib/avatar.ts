// src/lib/avatar.ts — 아바타 코드의 형식·부품표·시드 기반 기본값.
// 코드 형식: f{face}:h{hair}:s{skin}:e{eyes}:k#{hex} — 얼굴형:헤어:피부:눈:유니폼색.
// (스펙 4절 · docs/superpowers/specs/2026-09-11-game-ui-redesign.md)
//
// 아래 정규식은 서버 검증(server/weeklyfc-apps-script.js의 isValidAvatarCode)과
// 반드시 같은 모양이어야 한다 — 클라이언트가 만드는 코드가 서버에서 거부되면
// 안 되기 때문이다. tests/unit/avatar.test.mjs 에도 이 정규식을 그대로 복사해
// serializeAvatar 출력이 실제로 통과하는지 검증한다(그게 계약이다).
const CODE_SHAPE = /^([a-z]\d{1,2}:){1,8}k#[0-9a-fA-F]{3,6}$/;

export type AvatarSpec = { face: number; hair: number; skin: number; eyes: number; kit: string };

// face(등 인덱스)가 음수면 "미설정" 상태 — 코드가 비어 있거나 파싱에 실패했을 때만 나온다.
// avatarSvg()는 이 상태를 번호-원 폴백으로 그린다. randomAvatar()는 이 상태를 절대 반환하지 않는다.
export const UNSET_AVATAR: AvatarSpec = { face: -1, hair: -1, skin: -1, eyes: -1, kit: '' };
export const isUnsetAvatar = (s: AvatarSpec): boolean => s.face < 0;

type Shaped<T extends string> = { id: string; label: string; shape: T };
type ShapedColored<T extends string> = { id: string; label: string; color: string; shape: T };
type Colored = { id: string; label: string; color: string };

// PARTS — 에디터가 그대로 순회하는 옵션 목록. "허접해도 좋다"는 지시라 정교한
// 일러스트 대신, 실루엣(얼굴형·헤어 모양)과 색(피부·눈·유니폼)의 조합 가짓수로
// 구별시킨다. 각 배열의 길이가 곧 인덱스 범위이므로 늘리면 자동으로 더 다양해진다.
export const PARTS = {
  face: [
    { id: 'f0', label: '동글', shape: 'circle' },
    { id: 'f1', label: '각짐', shape: 'square' },
    { id: 'f2', label: '육각', shape: 'hex' },
    { id: 'f3', label: '넓적', shape: 'diamond' },
    { id: 'f4', label: '갸름', shape: 'pill' },
  ] as Shaped<'circle' | 'square' | 'hex' | 'diamond' | 'pill'>[],
  hair: [
    { id: 'h0', label: '민머리', color: '', shape: 'none' },
    { id: 'h1', label: '짧은머리', color: '#2a1c14', shape: 'short' },
    { id: 'h2', label: '스포츠', color: '#171717', shape: 'buzz' },
    { id: 'h3', label: '장발', color: '#4a2f1a', shape: 'long' },
    { id: 'h4', label: '모히칸', color: '#7a2e2e', shape: 'mohawk' },
    { id: 'h5', label: '아프로', color: '#1f1f1f', shape: 'afro' },
    { id: 'h6', label: '가르마', color: '#b8935a', shape: 'side' },
    { id: 'h7', label: '곱슬', color: '#8a8a8a', shape: 'curly' },
  ] as ShapedColored<'none' | 'short' | 'buzz' | 'long' | 'mohawk' | 'afro' | 'side' | 'curly'>[],
  skin: [
    { id: 's0', label: '밝은', color: '#f2c9a0' },
    { id: 's1', label: '연한', color: '#e0a878' },
    { id: 's2', label: '보통', color: '#c68642' },
    { id: 's3', label: '갈색', color: '#9a6432' },
    { id: 's4', label: '짙은', color: '#6b4423' },
    { id: 's5', label: '검은', color: '#402a1a' },
  ] as Colored[],
  eyes: [
    { id: 'e0', label: '기본', color: '#171717', shape: 'dot' },
    { id: 'e1', label: '졸린', color: '#171717', shape: 'line' },
    { id: 'e2', label: '놀란', color: '#171717', shape: 'wide' },
    { id: 'e3', label: '파랑', color: '#2a4f8f', shape: 'dot' },
    { id: 'e4', label: '초록', color: '#3a6b4a', shape: 'dot' },
    { id: 'e5', label: '갈색', color: '#6b3a1a', shape: 'wide' },
  ] as ShapedColored<'dot' | 'line' | 'wide'>[],
  // 유니폼색은 자유 hex지만(코드 계약상 kit만 임의값), 에디터에서 바로 고를 수 있게
  // 채도·명도를 짙은 바탕에서 읽히도록 고른 스와치 10개를 제공한다.
  kit: ['#c0392b', '#e67e22', '#f1c40f', '#27ae60', '#16a085', '#2980b9', '#8e44ad', '#2c3e50', '#ecf0f1', '#7f8c8d'],
};

const clampIdx = (i: number, len: number): number => ((Math.trunc(i) % len) + len) % len;

// 3~6자리 hex를 6자리 "#rrggbb"로 정규화한다. 서버 정규식은 3~6자리를 다 허용하므로
// (CSS 표준은 3·6자리만 유효) 4·5자리처럼 어중간한 값도 그리다가 죽지 않게 방어한다.
function normalizeHex(digits: string): string {
  const d = digits.toLowerCase().replace(/[^0-9a-f]/g, '') || '333a45';
  if (d.length === 3) return '#' + d.split('').map((c) => c + c).join('');
  if (d.length >= 6) return '#' + d.slice(0, 6);
  // 4~5자리: 남는 자리를 앞자리 반복으로 채운다 — 결정적이고 항상 유효한 6자리가 된다.
  let out = d;
  while (out.length < 6) out += d[out.length % d.length];
  return '#' + out;
}

const FIELD_BY_LETTER: Record<string, keyof Omit<AvatarSpec, 'kit'>> = { f: 'face', h: 'hair', s: 'skin', e: 'eyes' };

/** 코드 문자열 → AvatarSpec. 관용적으로 파싱한다: 형식이 아예 안 맞거나 빈 값이면
 * UNSET_AVATAR. 형식은 맞지만 범위를 벗어난 인덱스·미지의 글자는 조용히 보정한다
 * (모듈러 클램프 / 무시) — 미래에 부품이 늘거나 손상된 값이 와도 죽지 않는다. */
export function parseAvatar(code: string): AvatarSpec {
  const trimmed = String(code ?? '').trim();
  if (!trimmed || !CODE_SHAPE.test(trimmed)) return { ...UNSET_AVATAR };
  const tokens = trimmed.split(':');
  const kitToken = tokens[tokens.length - 1]; // 'k#xxxxxx' — 정규식이 이미 형태를 보장
  const spec: AvatarSpec = { face: 0, hair: 0, skin: 0, eyes: 0, kit: normalizeHex(kitToken.slice(2)) };
  for (let i = 0; i < tokens.length - 1; i++) {
    const m = /^([a-z])(\d{1,2})$/.exec(tokens[i]);
    if (!m) continue;
    const field = FIELD_BY_LETTER[m[1]];
    if (!field) continue; // f/h/s/e 밖의 글자는 우리 어휘에 없는 부품 — 무시
    spec[field] = clampIdx(Number(m[2]), PARTS[field].length);
  }
  return spec;
}

/** AvatarSpec → 코드 문자열. UNSET_AVATAR는 빈 문자열로(서버 계약: "빈 값 = 기본
 * 아바타로 되돌리기"). 그 외엔 항상 서버 정규식을 통과하는 6자리 hex 코드를 낸다. */
export function serializeAvatar(spec: AvatarSpec): string {
  if (isUnsetAvatar(spec)) return '';
  const f = clampIdx(spec.face, PARTS.face.length);
  const h = clampIdx(spec.hair, PARTS.hair.length);
  const s = clampIdx(spec.skin, PARTS.skin.length);
  const e = clampIdx(spec.eyes, PARTS.eyes.length);
  const kit = /^#[0-9a-fA-F]{6}$/.test(spec.kit) ? spec.kit.toLowerCase() : '#333a45';
  return `f${f}:h${h}:s${s}:e${e}:k${kit}`;
}

// mulberry32 — 시드 하나로 재현 가능한 의사난수. 암호화 용도가 아니라 "같은 시드는
// 항상 같은 아바타"만 필요하므로 이 정도 품질로 충분하다.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const to255 = (v: number) => Math.round((v + m) * 255);
  const hex = (v: number) => v.toString(16).padStart(2, '0');
  return `#${hex(to255(r))}${hex(to255(g))}${hex(to255(b))}`;
}

/** 등번호(seed)에서 결정적으로 뽑은 아바타. 같은 번호는 항상 같은 결과, 다른 번호는
 * 서로 다른 결과 — 아바타를 저장한 적 없는 30명도 첫날부터 서로 다르게 보이게 한다. */
export function randomAvatar(seed: number): AvatarSpec {
  const rnd = mulberry32(Math.floor(Math.abs(seed)) || 1);
  const pick = (len: number) => Math.floor(rnd() * len) % len;
  const face = pick(PARTS.face.length);
  const hair = pick(PARTS.hair.length);
  const skin = pick(PARTS.skin.length);
  const eyes = pick(PARTS.eyes.length);
  const hue = Math.floor(rnd() * 360);
  const kit = hslToHex(hue, 0.55, 0.42);
  return { face, hair, skin, eyes, kit };
}

/** 화면에 실제로 쓸 스펙을 고르는 규칙 한 곳: 저장된 코드가 있으면 그걸 파싱하고
 * (손상됐으면 avatarSvg가 번호-원으로 폴백), 저장한 적이 없으면(빈 문자열)
 * randomAvatar로 — "아무도 손대지 않은 30명도 첫날부터 다르게 보인다"는 요구사항은
 * 이 한 줄이 스쿼드 표·선수 카드·에디터 초기값 어디서나 같은 규칙을 쓰게 만든다. */
export function avatarSpecFor(num: number, code: string | undefined): AvatarSpec {
  return code ? parseAvatar(code) : randomAvatar(num);
}
