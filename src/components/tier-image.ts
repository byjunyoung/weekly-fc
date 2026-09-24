// src/components/tier-image.ts — 티어표를 1080×1350 PNG 로(2026-09-24 티어 게임).
// 라인업 이미지(share-image.ts)와 같은 틀: 화면 캡처가 아니라 따로 그리고, 아바타 픽셀맵·갈무리 글꼴을 같이 쓴다.
// **숫자는 그리지 않는다** — 칸(S~D)이 곧 구간이다. 단톡방에 능력치 숫자가 도는 게 민감할 수 있다는
// 라인업 이미지의 원칙을 그대로 지키고, 칸 자체를 올리는 건 사용자가 고른 것(설계 §5).
import { avatarSpecFor } from '../lib/avatar.ts';
import { type Tier, tierRows, type TierKey } from '../lib/tier.ts';
import type { Player } from '../lib/types.ts';
import { avatarPixels } from './avatar.ts';
import { IMG_H, IMG_W, drawAvatar, fit, pixelFont, tok } from './share-image.ts';

const M = 64;
const TOP = 250;           // 제목 두 줄 아래
const BOTTOM = IMG_H - 60;
const BADGE_W = 120;
const NAME_H = 30;         // 이름(20px) + 여백
const ROW_GAP = 16;

/** 칸 색 — 화면 .tier-badge 와 같은 토큰. */
export const TIER_COLOR: Record<Tier, [string, string]> = {
  S: ['--gold', '#ffce21'], A: ['--val-a', '#59cf84'], B: ['--val-b', '#a0cf59'], C: ['--val-c', '#e79940'], D: ['--val-d', '#e97267'],
};

export type TierSlot = { num: number; x: number; y: number; cell: number; w: number };
export type TierLayout = { cell: number; rows: Array<{ tier: Tier; y: number; h: number; slots: TierSlot[] }> };

/** 칸마다 한 줄 이상, 사람이 많으면 줄을 더 쓴다. 전부 들어가는 가장 큰 아바타 크기를 고른다. */
export function tierLayout(groups: Array<{ tier: Tier; players: Player[] }>): TierLayout {
  const availW = IMG_W - M * 2 - BADGE_W;
  for (let cell = 5; cell >= 2; cell--) {
    const spriteH = 32 * cell;
    const slotW = Math.max(24 * cell, 88) + 12;
    const perLine = Math.max(1, Math.floor(availW / slotW));
    const lineH = spriteH + NAME_H;
    const heights = groups.map((g) => Math.max(1, Math.ceil(g.players.length / perLine)) * lineH);
    const total = heights.reduce((a, b) => a + b, 0) + ROW_GAP * (groups.length - 1);
    if (total > BOTTOM - TOP && cell > 2) continue;
    let y = TOP;
    const rows = groups.map((g, i) => {
      const slots = g.players.map((p, k) => ({
        num: p.num, cell, w: slotW,
        x: M + BADGE_W + (k % perLine) * slotW,
        y: y + Math.floor(k / perLine) * lineH,
      }));
      const row = { tier: g.tier, y, h: heights[i], slots };
      y += heights[i] + ROW_GAP;
      return row;
    });
    return { cell, rows };
  }
  throw new Error('티어표가 이미지에 들어가지 않습니다');
}

export function drawTierImage(c: HTMLCanvasElement, players: Player[], key: TierKey, title: string, sub: string): void {
  c.width = IMG_W; c.height = IMG_H;
  const ctx = c.getContext('2d')!;
  const fg = tok('--fg', '#ffffff');
  const muted = tok('--muted', 'rgba(229, 229, 229, .55)');
  const hairline = tok('--hairline', 'rgba(229, 229, 229, .16)');
  ctx.fillStyle = tok('--canvas', '#000000');
  ctx.fillRect(0, 0, IMG_W, IMG_H);

  ctx.textAlign = 'left';
  ctx.fillStyle = fg; ctx.font = pixelFont(60); ctx.fillText(fit(ctx, title, IMG_W - M * 2), M, 150);
  ctx.fillStyle = muted; ctx.font = pixelFont(30); ctx.fillText(fit(ctx, sub, IMG_W - M * 2), M, 200);

  const groups = tierRows(players, key);
  const byNum = new Map(players.map((p) => [p.num, p]));
  const lay = tierLayout(groups);
  for (const row of lay.rows) {
    const [name, fb] = TIER_COLOR[row.tier];
    ctx.fillStyle = tok(name, fb);
    ctx.fillRect(M, row.y, BADGE_W - 24, row.h);
    ctx.fillStyle = '#000000'; ctx.font = pixelFont(60); ctx.textAlign = 'center';
    ctx.fillText(row.tier, M + (BADGE_W - 24) / 2, row.y + row.h / 2 + 20);
    ctx.fillStyle = hairline;
    ctx.fillRect(M + BADGE_W, row.y + row.h + ROW_GAP / 2, IMG_W - M * 2 - BADGE_W, 2);
    for (const s of row.slots) {
      const p = byNum.get(s.num)!;
      const spriteW = 24 * s.cell;
      drawAvatar(ctx, avatarPixels(avatarSpecFor(p.num, p.avatar)), s.x + (s.w - spriteW) / 2, s.y, s.cell, p.num);
      ctx.fillStyle = fg; ctx.font = pixelFont(20); ctx.textAlign = 'center';
      ctx.fillText(fit(ctx, p.name, s.w - 8), s.x + s.w / 2, s.y + 32 * s.cell + 22);
    }
    if (!row.slots.length) {
      ctx.fillStyle = muted; ctx.font = pixelFont(20); ctx.textAlign = 'left';
      ctx.fillText('—', M + BADGE_W, row.y + row.h / 2 + 7);
    }
  }
  ctx.textAlign = 'left';
}

