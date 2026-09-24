// src/components/card-image.ts — 선수 카드 한 장을 1080×1350 PNG 로(2026-09-25 "내 카드 이미지 저장").
// 라인업·티어 이미지와 같은 틀: 화면 캡처가 아니라 따로 그리고, 아바타 픽셀맵·태극기·축구화 격자·갈무리 글꼴을
// 화면 쪽 데이터 그대로 쓴다(그림이 두 벌이면 갈린다). 글꼴 크기는 share-image.PIXEL_SIZES(20·30·60)만 —
// 다른 크기는 첫 열기에서 대체 글꼴로 굳는다.
import { avatarSpecFor } from '../lib/avatar.ts';
import { cardModel, type CardModel } from '../lib/card.ts';
import { shortDate } from '../lib/matches.ts';
import type { Tier } from '../lib/tier.ts';
import type { Player } from '../lib/types.ts';
import { avatarPixels } from './avatar.ts';
import { feetPixels, flagKrPixels } from './pixel-icons.ts';
import { IMG_H, IMG_W, drawAvatar, fit, pixelFont, tok } from './share-image.ts';
import { TIER_COLOR } from './tier-image.ts';

export const CARD_W = 720;
export const CARD_H = 900;   // 여섯 칸 아래 빈 자리가 남지 않는 높이(실측)
const CARD_X = (IMG_W - CARD_W) / 2;   // 180
const CARD_Y = 240;                    // 위 제목 두 줄(120·165) + POTM 띠(184~240) 자리
const FRAME = 8;
const PAD = 32;
const AVATAR_CELL = 14;                // 24×32 → 336×448
const POS_COLOR: Record<string, string> = { GK: '#ffce21', DF: '#2f6fed', MF: '#1e9e6a', FW: '#e34d4d' };
export const POTM_GOLD = '#ffce21';

export type CardImageOpts = {
  title?: string;                       // 위 큰 글씨(기본 'WEEKLY FC')
  sub?: string;                         // 그 아래 작은 글씨
  potmDate?: string | null;             // 있으면 카드 위에 금색 띠 "★ POTM 9/27"
  caption?: string;                     // 카드 아래 한 줄
};

function frameColor(tier: Tier | null): string {
  return tier ? tok(TIER_COLOR[tier][0], TIER_COLOR[tier][1]) : tok('--line', '#3a3d44');
}

/** 카드를 그린다. 캔버스 크기는 1080×1350 으로 맞춘다(공유 미리보기 4:5 와 같다). */
export function drawCardImage(c: HTMLCanvasElement, player: Player, tier: Tier | null, opts: CardImageOpts = {}): CardModel {
  c.width = IMG_W; c.height = IMG_H;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('캔버스를 만들 수 없습니다');
  const m = cardModel(player, tier);
  const fg = tok('--fg', '#f4f4f4'), muted = tok('--muted', '#9da4af'), card = tok('--card', '#1b1d22'), canvas = tok('--canvas', '#000000');
  const frame = frameColor(m.tier);

  ctx.fillStyle = canvas; ctx.fillRect(0, 0, IMG_W, IMG_H);
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = fg; ctx.font = pixelFont(60); ctx.textAlign = 'left';
  ctx.fillText(fit(ctx, opts.title ?? 'WEEKLY FC', IMG_W - CARD_X * 2), CARD_X, 120);
  if (opts.sub) { ctx.fillStyle = muted; ctx.font = pixelFont(30); ctx.fillText(fit(ctx, opts.sub, IMG_W - CARD_X * 2), CARD_X, 165); }

  // 테두리 + 바탕
  ctx.fillStyle = frame; ctx.fillRect(CARD_X, CARD_Y, CARD_W, CARD_H);
  ctx.fillStyle = card; ctx.fillRect(CARD_X + FRAME, CARD_Y + FRAME, CARD_W - FRAME * 2, CARD_H - FRAME * 2);

  // 왼쪽 기둥: 티어 · OVR · 포지션 · 태극기 · 축구화
  const colX = CARD_X + FRAME + PAD;
  let y = CARD_Y + FRAME + PAD;
  ctx.fillStyle = m.tier ? frame : tok('--elevated', '#2a2d33'); ctx.fillRect(colX, y, 60, 60);
  ctx.fillStyle = m.tier ? '#111111' : muted; ctx.font = pixelFont(30); ctx.textAlign = 'center';
  ctx.fillText(m.tier ?? '–', colX + 30, y + 40);
  y += 76;
  ctx.fillStyle = fg; ctx.font = pixelFont(60); ctx.textAlign = 'left';
  ctx.fillText(m.ovr ? String(m.ovr) : '–', colX, y + 52);
  y += 76;
  const pos = m.pos || '–';
  ctx.fillStyle = POS_COLOR[pos] ?? tok('--elevated', '#2a2d33'); ctx.fillRect(colX, y, 90, 40);
  ctx.fillStyle = pos === 'GK' ? '#111111' : '#f4f4f4'; ctx.font = pixelFont(30); ctx.textAlign = 'center';
  ctx.fillText(pos, colX + 45, y + 30);
  y += 60;
  const flag = flagKrPixels(); drawAvatar(ctx, flag, colX, y, 4, 0);
  y += flag.h * 4 + 16;
  const feet = feetPixels(m.foot); drawAvatar(ctx, feet, colX, y, 4, 0);

  // 아바타(오른쪽, 이름 띠 위에 발이 닿게)
  const nameY = CARD_Y + FRAME + PAD + 448 + 8;
  const avX = CARD_X + CARD_W - FRAME - PAD - 24 * AVATAR_CELL;
  drawAvatar(ctx, avatarPixels(avatarSpecFor(player.num, player.avatar)), avX, nameY - 32 * AVATAR_CELL + AVATAR_CELL, AVATAR_CELL, player.num);

  // 이름 띠
  ctx.fillStyle = frame; ctx.fillRect(CARD_X + FRAME, nameY, CARD_W - FRAME * 2, 4);
  ctx.fillStyle = fg; ctx.font = pixelFont(60); ctx.textAlign = 'center';
  ctx.fillText(fit(ctx, m.name, CARD_W - PAD * 2 - 120), CARD_X + CARD_W / 2, nameY + 72);
  ctx.fillStyle = muted; ctx.font = pixelFont(30); ctx.textAlign = 'right';
  ctx.fillText(`#${m.num}`, CARD_X + CARD_W - FRAME - PAD, nameY + 72);
  ctx.fillStyle = frame; ctx.fillRect(CARD_X + FRAME, nameY + 96, CARD_W - FRAME * 2, 4);

  // 여섯 칸 2열×3행
  const statsY = nameY + 100 + 28;
  const colW = (CARD_W - FRAME * 2 - PAD * 2) / 2;
  m.stats.forEach((s, i) => {
    const cx = CARD_X + FRAME + PAD + (i % 2) * colW;
    const cy = statsY + Math.floor(i / 2) * 64 + 40;
    ctx.fillStyle = muted; ctx.font = pixelFont(30); ctx.textAlign = 'left';
    ctx.fillText(s.label, cx, cy);
    ctx.fillStyle = tok(`--val-${s.band}`, '#f4f4f4'); ctx.font = pixelFont(60); ctx.textAlign = 'right';
    ctx.fillText(s.value ? String(s.value) : '–', cx + colW - 24, cy + 8);
  });

  // POTM 띠 — 카드 위 가장자리에 수평으로(도트 글자는 기울이면 뭉개진다)
  if (opts.potmDate) {
    const bandH = 56;   // 제목·부제(165 까지) 아래, 카드 위 가장자리에 붙여서
    ctx.fillStyle = POTM_GOLD; ctx.fillRect(CARD_X, CARD_Y - bandH, CARD_W, bandH + FRAME);
    ctx.fillStyle = '#111111'; ctx.font = pixelFont(30); ctx.textAlign = 'center';
    ctx.fillText(`★ POTM ${shortDate(opts.potmDate)}`, CARD_X + CARD_W / 2, CARD_Y - bandH + 40);
  }

  if (opts.caption) {
    ctx.fillStyle = muted; ctx.font = pixelFont(30); ctx.textAlign = 'center';
    ctx.fillText(fit(ctx, opts.caption, IMG_W - CARD_X * 2), IMG_W / 2, CARD_Y + CARD_H + 60);
  }
  ctx.textAlign = 'left';
  return m;
}
