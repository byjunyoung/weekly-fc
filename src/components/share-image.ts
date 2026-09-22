// src/components/share-image.ts — 라인업을 1080×1350(4:5, 카톡·인스타 피드 비율) PNG 로.
// 화면 캡처가 아니라 공유용으로 따로 그린다. 캔버스는 CSS 변수를 못 읽어 그리는 시점에 토큰을 읽는다.
// OVR 은 그리지 않는다 — 단톡방에 능력치 숫자가 도는 건 민감할 수 있다(2026-09-13 스펙 §5.1).
//
// 2026-09-22: 화면과 같은 도트 그림으로 맞췄다. 피치 도형(`turfRects`·`markRects`)과 아바타 픽셀맵
// (`avatarPixels`)을 화면 렌더러와 **같은 데이터**에서 가져온다 — 캔버스가 자기 몫을 따로
// 그리면 둘이 갈린다. 글꼴도 갈무리를 쓰는데, 캔버스엔 `font-synthesis` 가 없어 굵기는 400 만
// 쓰고 크기는 10의 배수로만 둔다(그래야 도트가 안 뭉갠다).
import { slotsOf, positionOf, type LineupState } from '../lib/lineup.ts';
import { avatarSpecFor } from '../lib/avatar.ts';
import type { PitchKind } from '../lib/formation.ts';
import type { Player } from '../lib/types.ts';
import { avatarPixels } from './avatar.ts';
import { PITCH_DIM, markRects, turfGrain, turfRects, type PitchRect } from './pitch-view.ts';

export const IMG_W = 1080;
export const IMG_H = 1350;
const M = 64;
const PITCH_TOP = 224;
const PITCH_BOTTOM = 1196;

/** 캔버스에서 쓰는 갈무리 크기(전부 10의 배수). ShareModal 이 그리기 전에 이 목록을 불러 둔다. */
export const PIXEL_SIZES = [20, 30, 60] as const;
const PIXEL_FAMILY = 'Galmuri9';

/** 갈무리를 **실제로 쓸 크기마다** 불러온다. `document.fonts.ready` 만으로는 부족하다 —
 *  그건 이미 불러오는 중인 글꼴만 기다리고, 캔버스의 `ctx.font` 지정은 로드를 유발하지 않는다.
 *  안 기다리면 첫 진입에서 대체 글꼴로 굳은 이미지가 나온다. */
export async function ensureShareFonts(): Promise<void> {
  try {
    await Promise.all(PIXEL_SIZES.map((px) => document.fonts.load(`400 ${px}px ${PIXEL_FAMILY}`)));
    await document.fonts.ready;
  } catch { /* 글꼴을 못 불러도 대체 글꼴로 그리는 편이 낫다 */ }
}

const tok = (name: string, fallback: string): string => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
const pixelFont = (px: number): string => `400 ${px}px ${PIXEL_FAMILY}, sans-serif`;

function fit(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > maxW) s = s.slice(0, -1);
  return `${s}…`;
}

/** 미터 좌표의 사각형 목록을 캔버스에 찍는다 — 화면 SVG 와 같은 데이터다. */
function fillRects(ctx: CanvasRenderingContext2D, rects: PitchRect[], sx: number, sy: number): void {
  for (const t of rects) {
    ctx.fillStyle = t.fill;
    ctx.fillRect(t.x * sx, t.y * sy, t.w * sx, t.h * sy);
  }
}

/** 잔디 알갱이 — SVG 는 <pattern> 이지만 캔버스엔 패턴 타일이 없어 직접 돈다. */
function drawGrain(ctx: CanvasRenderingContext2D, kind: PitchKind, w: number, h: number, sx: number, sy: number): void {
  const g = turfGrain(kind);
  ctx.fillStyle = g.fill;
  for (let ty = 0; ty < h; ty += g.tile) {
    for (let tx = 0; tx < w; tx += g.tile) {
      for (const [dx, dy] of g.dots) ctx.fillRect((tx + dx) * sx, (ty + dy) * sy, g.size * sx, g.size * sy);
    }
  }
}

/** 아바타 한 장 — 24×32 픽셀맵을 그대로 칸칸이 찍는다. 가로로 이어진 같은 칸은 한 번에 묶는다. */
function drawAvatar(ctx: CanvasRenderingContext2D, spec: ReturnType<typeof avatarPixels>, x: number, y: number, cell: number, fallbackLabel: number): void {
  if (!spec) {
    // 코드가 깨진 선수 — 화면(avatarSvg)이 번호로 폴백하듯 여기서도 번호를 적는다.
    ctx.save();
    ctx.fillStyle = '#9da4af'; ctx.font = pixelFont(20); ctx.textAlign = 'center';
    ctx.fillText(String(fallbackLabel), x + (24 * cell) / 2, y + (32 * cell) / 2 + 7);
    ctx.restore();
    return;
  }
  for (let row = 0; row < spec.h; row++) {
    let col = 0;
    while (col < spec.w) {
      const ch = spec.map[row][col];
      if (ch === '.') { col += 1; continue; }
      let len = 1;
      while (col + len < spec.w && spec.map[row][col + len] === ch) len += 1;
      ctx.fillStyle = spec.palette[ch];
      ctx.fillRect(x + col * cell, y + row * cell, len * cell, cell);
      col += len;
    }
  }
}

/** 이름표 바탕색 — 테스트가 "선수 몇 명을 그렸나"를 이 색으로 센다. 화면의 .bd-name 과 같은 값. */
export const NAME_PILL = 'rgba(0, 0, 0, .62)';

/** 자리 하나가 차지하는 네모. 그리는 쪽과 검사하는 쪽이 같은 계산을 보게 밖으로 뺀다 —
 *  캔버스엔 CSS 가 안 닿아 화면 쪽 formation-fit 계약이 여기까지 오지 못한다.
 *  폭 계수는 **자리 간격**이 정한다: 프리셋의 가장 좁은 가로 간격이 0.20 이라 그보다 작아야
 *  겹치지 않고, 끝 자리(x=0.10)가 안 잘리려면 폭의 절반이 0.10×pw 안에 들어와야 한다. */
export function lineupLayout(s: LineupState): { pw: number; ph: number; boxes: Array<{ x: number; y: number; w: number; h: number; cell: number }> } {
  const { w, h } = PITCH_DIM[s.pitch];
  const ph = PITCH_BOTTOM - PITCH_TOP;
  const pw = Math.min(IMG_W - M * 2, ph * (w / h));
  const cw = Math.round(pw * (s.pitch === 'soccer' ? 0.17 : 0.19));
  const cell = Math.round((cw * 0.78) / 24);   // 아바타는 가로 24칸 — 자리 폭의 78% 를 쓴다
  // 이름표 띠는 40 — 44 로 두면 GK 자리(y 0.93)의 네모가 골라인 밖으로 2px 나간다.
  const ch = cell * 32 + 40;
  const boxes = slotsOf(s).map((_slot, i) => {
    const [nx, ny] = positionOf(s, i);
    return { x: nx * pw - cw / 2, y: ny * ph - ch / 2, w: cw, h: ch, cell };
  });
  return { pw, ph, boxes };
}

export function drawLineupImage(c: HTMLCanvasElement, s: LineupState, players: Player[], title: string): void {
  c.width = IMG_W;
  c.height = IMG_H;
  const ctx = c.getContext('2d')!;
  const fg = tok('--fg', '#ffffff');
  const muted = tok('--muted', 'rgba(229, 229, 229, .55)');
  const hairline = tok('--hairline-strong', 'rgba(229, 229, 229, .38)');

  ctx.fillStyle = tok('--canvas', '#000000');
  ctx.fillRect(0, 0, IMG_W, IMG_H);

  // 머리 — 팀 표시, 제목, 포메이션
  ctx.textAlign = 'left';
  ctx.fillStyle = muted; ctx.font = pixelFont(30); ctx.fillText('WEEKLY FC', M, 104);
  ctx.fillStyle = fg; ctx.font = pixelFont(60); ctx.fillText(fit(ctx, title, IMG_W - M * 2 - 220), M, 182);
  ctx.textAlign = 'right'; ctx.fillStyle = muted; ctx.font = pixelFont(30); ctx.fillText(s.shape, IMG_W - M, 182);

  // 피치 — 경기장 비율을 지키며 가운데
  const { w, h } = PITCH_DIM[s.pitch];
  const ph = PITCH_BOTTOM - PITCH_TOP;
  const pw = Math.min(IMG_W - M * 2, ph * (w / h));
  const px = (IMG_W - pw) / 2;
  const sx = pw / w, sy = ph / h;
  ctx.save();
  ctx.translate(px, PITCH_TOP);
  ctx.beginPath(); ctx.rect(0, 0, pw, ph); ctx.clip();   // 화면의 overflow:hidden 과 같은 역할
  fillRects(ctx, turfRects(s.pitch), sx, sy);
  drawGrain(ctx, s.pitch, w, h, sx, sy);
  fillRects(ctx, markRects(s.pitch), sx, sy);

  // 자리 하나 = 아바타 + 이름표. 화면(pitch-view)과 같은 구성이다 — 금속 카드·OVR·포지션은
  // 2026-09-22 에 화면에서 뺐고, 카톡에 나가는 그림만 옛 모습으로 남겨 두면 둘이 갈린다.
  const byNum = new Map(players.map((p) => [p.num, p]));
  const { boxes } = lineupLayout(s);
  ctx.textAlign = 'center';
  slotsOf(s).forEach((slot, i) => {
    const b = boxes[i];
    const cx = b.x + b.w / 2;
    const spriteW = b.cell * 24, spriteH = b.cell * 32;
    const num = s.slots[i];
    const p = num != null ? byNum.get(num) : undefined;
    if (!p) {
      // 화면 `.bd-empty` 와 같게 — 어두운 바탕 + 또렷한 점선(--line 은 너무 흐리다).
      ctx.fillStyle = 'rgba(0, 0, 0, .25)'; ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.setLineDash([8, 6]); ctx.strokeStyle = hairline; ctx.lineWidth = 2;
      ctx.strokeRect(b.x, b.y, b.w, b.h); ctx.setLineDash([]);
      ctx.fillStyle = muted; ctx.font = pixelFont(20); ctx.fillText(slot.label, cx, b.y + b.h / 2 + 8);
      return;
    }
    drawAvatar(ctx, avatarPixels(avatarSpecFor(p.num, p.avatar)), cx - spriteW / 2, b.y, b.cell, p.num);
    // 이름은 잔디 위에 바로 놓이므로 어두운 이름표를 깔아 밝은 줄무늬에서도 읽히게 한다.
    // 30px 가 기본이고 안 들어가면 20px 로 한 단계 줄인다 — 둘 다 PIXEL_SIZES 안이라 미리 불러온다.
    ctx.font = pixelFont(30);
    if (ctx.measureText(p.name).width > b.w - 8) ctx.font = pixelFont(20);
    const text = fit(ctx, p.name, b.w - 8);
    const tw = ctx.measureText(text).width;
    ctx.fillStyle = NAME_PILL;
    ctx.fillRect(cx - tw / 2 - 8, b.y + spriteH + 2, tw + 16, 38);
    ctx.fillStyle = fg;
    ctx.fillText(text, cx, b.y + spriteH + 30);
  });
  ctx.restore();

  // 주소. 벤치 줄은 넣지 않는다 — 참석 기록이 없어 선발이 아닌 전체 명단이 찍힌다(2026-09-13 사용자 결정).
  ctx.textAlign = 'left';
  ctx.fillStyle = muted; ctx.font = pixelFont(20); ctx.fillText('byjunyoung.github.io/weekly-fc', M, 1310);
}
