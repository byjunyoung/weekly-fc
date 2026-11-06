// src/react/game/views/match3d/voxel.ts — 포털 도트 아바타(avatarPixels 의 24×32 문자맵)를 블록 입체로(3D 경기, 2026-11-07).
// 스펙 §4 "포털 도트 아바타를 픽셀마다 블록으로 세운 입체. 멤버마다 얼굴·머리·유니폼이 그대로 보인다."
// 순수 — three.js 를 모르고 숫자 배열만 만든다(node 테스트가 그대로 가져온다). 화면 쪽이 이걸 BufferGeometry 하나로 감싼다.
//
// 결정:
//  · 픽셀 하나 = 정육면체 하나지만, 선수마다 **겹친 면을 뺀 겉면만** 한 덩어리로 만든다(픽셀마다 메시를 만들면 그리기 호출이 수백 번).
//  · 깊이는 몇 칸만 — 머리 6, 몸·다리 4. 앞면은 그림 그대로, 뒤로 갈수록 눈·입 대신 피부, 머리 뒤쪽은 머리카락 색.
//  · 다리(23행부터)는 가운데 빈 줄로 좌우가 갈리면 따로 떼어 달리기 때 번갈아 흔든다. 안 갈리면 몸에 붙인다(그땐 통통 튀기·기울기만).
//  · 아래(30행 바닥)가 발바닥 = 높이 0. 키는 FIGURE_H.

export const FIGURE_H = 1.75;          // 아바타 32행 중 31행(0~30)이 이 높이가 된다
const ROWS_USED = 31;
export const VOX = FIGURE_H / ROWS_USED;
const LEG_ROW = 23;                    // 이 행부터 다리(avatar.ts BODY 의 반바지 끝 줄)
const DEPTH_HEAD = 6, DEPTH_BODY = 4, DEPTH_LEG = 4;   // 짝수끼리 — 가운데 맞춤이 칸에 딱 떨어지게
const HEAD_LAST_ROW = 12;

export type Part = { positions: number[]; normals: number[]; colors: number[]; indices: number[] };
export type Figure = { body: Part; legL: Part | null; legR: Part | null; hipY: number; legX: [number, number] };
export type Pixels = { map: string[]; palette: Record<string, string>; w: number; h: number };
export type Rgb = (hex: string) => [number, number, number];

const FACE_FEATURE = new Set(['W', 'E', 'M']);
const depthOf = (row: number): number => (row <= HEAD_LAST_ROW ? DEPTH_HEAD : row < LEG_ROW ? DEPTH_BODY : DEPTH_LEG);

/** 칸 (col, row, L) 의 색 글자. L = 앞(0)에서 뒤(DEPTH_HEAD-1)까지의 전체 깊이 칸 — 행마다 깊이가 달라 가운데에 맞춰 놓는다. 없으면 ''. */
function cellChar(pix: Pixels, col: number, row: number, L: number, hairy: boolean): string {
  const ch = pix.map[row]?.[col];
  if (!ch || ch === '.' || !pix.palette[ch]) return '';
  const d = depthOf(row), o = (DEPTH_HEAD - d) / 2;
  if (L < o || L >= o + d) return '';
  const layer = L - o;   // 그 행 안에서 0 = 앞면
  if (layer === 0) return ch;
  const flat = FACE_FEATURE.has(ch) ? 'S' : ch;
  // 머리 뒤쪽 절반은 머리카락(머리카락이 있는 사람만) — 뒤에서 봐도 얼굴이 아니라 뒤통수가 보이게
  if (hairy && row <= HEAD_LAST_ROW - 2 && layer >= d - 3 && flat === 'S' && pix.palette.H) return 'H';
  return flat;
}

/** 다리 좌우를 가르는 빈 열(LEG_ROW~30행 전부 비어 있는 열). 없으면 -1. */
export function legGap(pix: Pixels): number {
  for (const c of [11, 12, 10, 13]) {
    let empty = true;
    for (let r = LEG_ROW; r < ROWS_USED; r++) { const ch = pix.map[r]?.[c]; if (ch && ch !== '.') { empty = false; break; } }
    if (empty) return c;
  }
  return -1;
}

const DIRS:{ n: [number, number, number]; d: [number, number, number]; quad: [number, number, number][] }[] = [
  { n: [1, 0, 0], d: [1, 0, 0], quad: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
  { n: [-1, 0, 0], d: [-1, 0, 0], quad: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]] },
  { n: [0, 1, 0], d: [0, 1, 0], quad: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { n: [0, -1, 0], d: [0, -1, 0], quad: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { n: [0, 0, 1], d: [0, 0, 1], quad: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { n: [0, 0, -1], d: [0, 0, -1], quad: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
];

/** 아바타 → 몸·왼다리·오른다리 덩어리. 좌표: 앞(+z)을 보고 선 모습, 발바닥 y=0, 가운데 x=0. 다리는 엉덩이(hipY)가 원점이 되게 옮겨 둔다. */
export function buildFigure(pix: Pixels, rgb: Rgb): Figure {
  const W = pix.w, maxD = DEPTH_HEAD;
  const hairy = pix.map.slice(0, 4).some((row) => row.includes('H'));
  const gap = legGap(pix);
  const hipY = (ROWS_USED - LEG_ROW) * VOX;
  const partOf = (col: number, row: number): 0 | 1 | 2 => (gap < 0 || row < LEG_ROW ? 0 : col < gap ? 1 : 2);
  const grid = (col: number, row: number, layer: number): string =>
    col < 0 || col >= W || row < 0 || row >= ROWS_USED || layer < 0 || layer >= maxD ? '' : cellChar(pix, col, row, layer, hairy);
  const parts: Part[] = [0, 1, 2].map(() => ({ positions: [], normals: [], colors: [], indices: [] }));
  const cache = new Map<string, [number, number, number]>();
  const color = (ch: string): [number, number, number] => {
    const hex = pix.palette[ch];
    let c = cache.get(hex);
    if (!c) { c = rgb(hex); cache.set(hex, c); }
    return c;
  };
  for (let row = 0; row < ROWS_USED; row++) {
    for (let col = 0; col < W; col++) for (let L = 0; L < maxD; L++) {
      const ch = grid(col, row, L);
      if (!ch) continue;
      const part = partOf(col, row);
      const P = parts[part];
      const [cr, cg, cb] = color(ch);
      // 칸의 모서리: x 는 col, y 는 위로(row 가 커지면 아래), z 는 앞(L=0)이 +z
      const x0 = (col - W / 2) * VOX, y0 = (ROWS_USED - 1 - row) * VOX - (part ? hipY : 0);
      const z0 = (maxD / 2 - L - 1) * VOX;
      for (const f of DIRS) {
        // 같은 덩어리 안에 이웃 칸이 있으면 그 면은 안 보인다(y 는 row 와 반대, z 는 L 과 반대)
        const nc = col + f.d[0], nr = row - f.d[1], nL = L - f.d[2];
        if (grid(nc, nr, nL) && partOf(nc, nr) === part) continue;
        const base = P.positions.length / 3;
        for (const q of f.quad) {
          P.positions.push(x0 + q[0] * VOX, y0 + q[1] * VOX, z0 + q[2] * VOX);
          P.normals.push(f.n[0], f.n[1], f.n[2]);
          P.colors.push(cr, cg, cb);
        }
        P.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }
  }
  const legX = (pick: 1 | 2): number => {
    const ps = parts[pick].positions;
    if (!ps.length) return 0;
    let s = 0;
    for (let i = 0; i < ps.length; i += 3) s += ps[i];
    return s / (ps.length / 3);
  };
  const legL = gap >= 0 && parts[1].indices.length ? parts[1] : null;
  const legR = gap >= 0 && parts[2].indices.length ? parts[2] : null;
  return { body: parts[0], legL, legR, hipY, legX: [legX(1), legX(2)] };
}
