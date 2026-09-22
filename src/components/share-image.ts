// src/components/share-image.ts — 라인업을 1080×1350(4:5, 카톡·인스타 피드 비율) PNG 로.
// 화면 캡처가 아니라 공유용으로 따로 그린다. 캔버스는 CSS 변수를 못 읽어 그리는 시점에 토큰을 읽는다.
// OVR 은 그리지 않는다 — 단톡방에 능력치 숫자가 도는 건 민감할 수 있다(2026-09-13 스펙 §5.1).
//
// 2026-09-22: 화면과 같은 도트 그림으로 맞췄다. 피치 도형(`pitchRects`)과 아바타 픽셀맵
// (`avatarPixels`)을 화면 렌더러와 **같은 데이터**에서 가져온다 — 캔버스가 자기 몫을 따로
// 그리면 둘이 갈린다. 글꼴도 갈무리를 쓰는데, 캔버스엔 `font-synthesis` 가 없어 굵기는 400 만
// 쓰고 크기는 10의 배수로만 둔다(그래야 도트가 안 뭉갠다).
import { slotsOf, positionOf, type LineupState } from '../lib/lineup.ts';
import { avatarSpecFor } from '../lib/avatar.ts';
import { grade, ovr } from '../lib/stats.ts';
import type { PitchKind } from '../lib/formation.ts';
import type { Player } from '../lib/types.ts';
import { avatarPixels } from './avatar.ts';
import { PITCH_DIM, markRects, turfGrain, turfRects } from './pitch-view.ts';

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
function fillRects(ctx: CanvasRenderingContext2D, rects: { x: number; y: number; w: number; h: number; fill: string }[], sx: number, sy: number): void {
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
function drawAvatar(ctx: CanvasRenderingContext2D, spec: ReturnType<typeof avatarPixels>, x: number, y: number, cell: number): void {
  if (!spec) return;
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

export function drawLineupImage(c: HTMLCanvasElement, s: LineupState, players: Player[], title: string): void {
  c.width = IMG_W;
  c.height = IMG_H;
  const ctx = c.getContext('2d')!;
  const fg = tok('--fg', '#ffffff');
  const muted = tok('--muted', 'rgba(229, 229, 229, .55)');
  const line = tok('--line', 'rgba(229, 229, 229, .2)');
  const ink = tok('--ink', '#1a1a1a');
  const metal: Record<string, string> = {
    gold: tok('--metal-gold', '#d4af37'), silver: tok('--metal-silver', '#b8b8c0'), bronze: tok('--metal-bronze', '#b08050'),
  };

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

  // 선수 카드 — 화면과 같은 구성에서 OVR 만 뺀다(아바타 · 이름 · 자리 라벨).
  const byNum = new Map(players.map((p) => [p.num, p]));
  const cw = Math.round(pw * (s.pitch === 'soccer' ? 0.17 : 0.23));
  const cell = Math.max(2, Math.round((cw * 0.5) / 24));  // 아바타 한 칸 크기 — 카드 폭의 절반쯤
  const spriteH = cell * 32, spriteW = cell * 24;
  const ch = spriteH + 70;
  ctx.textAlign = 'center';
  slotsOf(s).forEach((slot, i) => {
    const [nx, ny] = positionOf(s, i);
    const cx = nx * pw, cy = ny * ph;
    const left = cx - cw / 2, top = cy - ch / 2;
    const num = s.slots[i];
    const p = num != null ? byNum.get(num) : undefined;
    if (!p) {
      ctx.setLineDash([8, 6]); ctx.strokeStyle = line; ctx.lineWidth = 2;
      ctx.strokeRect(left, top, cw, ch); ctx.setLineDash([]);
      ctx.fillStyle = muted; ctx.font = pixelFont(20); ctx.fillText(slot.label, cx, cy + 8);
      return;
    }
    // 카드 바탕은 화면과 같은 등급 금속색 — 다만 등급 계산(OVR)은 안 보여 주고 색으로만 남긴다.
    ctx.fillStyle = metal[grade(ovr(p))] ?? metal.silver;
    ctx.fillRect(left, top, cw, ch);
    drawAvatar(ctx, avatarPixels(avatarSpecFor(p.num, p.avatar)), cx - spriteW / 2, top + 8, cell);
    ctx.fillStyle = ink; ctx.font = pixelFont(30);
    ctx.fillText(fit(ctx, p.name, cw - 12), cx, top + spriteH + 40);
    // 자리 라벨과 선수 포지션이 같으면(GK 등) 한 번만 — "GK · GK" 는 읽을 게 없다.
    const pos = p.pos || '–';
    ctx.fillStyle = ink; ctx.font = pixelFont(20);
    ctx.fillText(slot.label === pos ? pos : `${slot.label} · ${pos}`, cx, top + spriteH + 62);
  });
  ctx.restore();

  // 주소. 벤치 줄은 넣지 않는다 — 참석 기록이 없어 선발이 아닌 전체 명단이 찍힌다(2026-09-13 사용자 결정).
  ctx.textAlign = 'left';
  ctx.fillStyle = muted; ctx.font = pixelFont(20); ctx.fillText('byjunyoung.github.io/weekly-fc', M, 1310);
}
