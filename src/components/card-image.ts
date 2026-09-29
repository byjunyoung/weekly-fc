// src/components/card-image.ts — 선수 카드 한 장을 1080×1350 PNG 로(2026-09-25 "내 카드 이미지 저장").
// 라인업·티어 이미지와 같은 틀: 화면 캡처가 아니라 따로 그리고, 아바타 픽셀맵·태극기·축구화 격자·갈무리 글꼴을
// 화면 쪽 데이터 그대로 쓴다(그림이 두 벌이면 갈린다). 글꼴 크기는 share-image.PIXEL_SIZES(20·30·60)만 —
// 다른 크기는 첫 열기에서 대체 글꼴로 굳는다.
import { avatarSpecFor } from '../lib/avatar.ts';
import { cardModel, type CardModel } from '../lib/card.ts';
import { shortDate } from '../lib/matches.ts';
import type { Tier } from '../lib/tier.ts';
import type { Player, StatKey } from '../lib/types.ts';
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
  badge?: string;                       // 칭호(이름 줄 아래 뱃지, 2026-09-29) — 없으면 그 줄은 비워 둔다
  bests?: StatKey[];                    // 팀 1위 항목 — 라벨 금색
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

  // 왼쪽 기둥 — 피파 본가 순서(2026-09-29): 종합 · 포지션 · 태극기 · 주발 발자국 · 티어(클럽 엠블럼 자리)
  const colX = CARD_X + FRAME + PAD;
  let y = CARD_Y + FRAME + PAD;
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
  const feet = feetPixels(m.foot); drawAvatar(ctx, feet, colX, y, 5, 0);   // 신발 밑창 한 쌍(2026-09-29)
  y += feet.h * 5 + 16;
  ctx.fillStyle = m.tier ? frame : tok('--elevated', '#2a2d33'); ctx.fillRect(colX, y, 60, 60);
  ctx.fillStyle = m.tier ? '#111111' : muted; ctx.font = pixelFont(30); ctx.textAlign = 'center';
  ctx.fillText(m.tier ?? '–', colX + 30, y + 40);
  // 아바타(오른쪽, 이름 띠 위에 발이 닿게)
  const nameY = CARD_Y + FRAME + PAD + 448 + 8;
  const avX = CARD_X + CARD_W - FRAME - PAD - 24 * AVATAR_CELL;
  drawAvatar(ctx, avatarPixels(avatarSpecFor(player.num, player.avatar)), avX, nameY - 32 * AVATAR_CELL + AVATAR_CELL, AVATAR_CELL, player.num);

  // 이름 띠 — 이름 · 번호 · 칭호 알약을 한 덩어리로 가운데(화면 카드와 같게, 2026-09-29)
  ctx.fillStyle = frame; ctx.fillRect(CARD_X + FRAME, nameY, CARD_W - FRAME * 2, 4);
  ctx.font = pixelFont(60); const nm = fit(ctx, m.name, CARD_W - PAD * 2 - 300); const nw = ctx.measureText(nm).width;
  ctx.font = pixelFont(30); const numT = `#${m.num}`; const numW = ctx.measureText(numT).width;
  const bt = opts.badge ? fit(ctx, opts.badge, 240) : ''; const bw = bt ? ctx.measureText(bt).width + 24 : 0;
  const total = nw + 12 + numW + (bt ? 20 + bw : 0);
  let nx = CARD_X + CARD_W / 2 - total / 2;
  ctx.textAlign = 'left';
  ctx.fillStyle = fg; ctx.font = pixelFont(60); ctx.fillText(nm, nx, nameY + 72); nx += nw + 12;
  ctx.fillStyle = muted; ctx.font = pixelFont(30); ctx.fillText(numT, nx, nameY + 72); nx += numW + 20;
  if (bt) {
    ctx.strokeStyle = POTM_GOLD; ctx.lineWidth = 4; ctx.strokeRect(nx, nameY + 26, bw, 44);
    ctx.fillStyle = POTM_GOLD; ctx.fillText(bt, nx + 12, nameY + 60);
  }
  ctx.fillStyle = frame; ctx.fillRect(CARD_X + FRAME, nameY + 96, CARD_W - FRAME * 2, 4);

  // 여섯 칸 2열×3행 — 피파처럼 숫자 먼저, 라벨 뒤
  const statsY = nameY + 100 + 28;
  const colW = (CARD_W - FRAME * 2 - PAD * 2) / 2;
  m.stats.forEach((s, i) => {
    const cx = CARD_X + FRAME + PAD + (i % 2) * colW;
    const cy = statsY + Math.floor(i / 2) * 64 + 40;
    const best = (opts.bests ?? []).includes(s.key);
    ctx.fillStyle = tok(`--val-${s.band}`, '#f4f4f4'); ctx.font = pixelFont(60); ctx.textAlign = 'left';
    ctx.fillText(s.value ? String(s.value) : '–', cx, cy + 8);
    ctx.fillStyle = best ? POTM_GOLD : muted; ctx.font = pixelFont(30);
    ctx.fillText(s.label, cx + 96, cy);   // 팀 1위는 금색만(★ 없음 — 모든 카드 같게, 2026-09-29)
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
