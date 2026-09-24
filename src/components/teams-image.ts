// src/components/teams-image.ts — 팀 나누기를 1080×1350 PNG 로(2026-09-25 "텍스트 복사 말고 이미지 저장으로").
// 티어표 이미지와 같은 틀: 조끼 줄마다 색 띠 + 아바타 + 이름. 숫자(OVR·평균)는 안 그린다 — 단톡방에 도는
// 이미지라 라인업·티어 이미지와 같은 원칙. 용병은 아바타 없이 이름만.
import { avatarSpecFor } from '../lib/avatar.ts';
import { vestOf } from '../lib/matches.ts';
import { nameMapOf } from '../lib/teams.ts';
import type { MatchTeam, Player } from '../lib/types.ts';
import { avatarPixels } from './avatar.ts';
import { IMG_H, IMG_W, drawAvatar, fit, pixelFont, tok } from './share-image.ts';

const M = 64;
const TOP = 230;
const BOTTOM = IMG_H - 60;
const HEAD_H = 56;          // 조끼 줄 머리(색 띠 + 이름)
const ROW_GAP = 28;
const NAME_H = 34;

export type TeamsSlot = { name: string; num: number | null; x: number; y: number; cell: number; w: number };
export type TeamsLayout = { rows: Array<{ vest: string; y: number; h: number; slots: TeamsSlot[] }> };

/** 줄마다 사람 수에 맞춰 칸을 잡는다 — 한 줄 6명·아바타 4배부터, 세로가 모자라면 아바타를 줄이고 한 줄 인원을 늘린다. */
const FITS: Array<[number, number]> = [[6, 4], [6, 3], [8, 3], [8, 2], [10, 2], [12, 2]];   // [한 줄 인원, 아바타 배수]
export function teamsLayout(lineup: MatchTeam[]): TeamsLayout {
  const build = (perLine: number, c: number): TeamsLayout => {
    const colW = (IMG_W - M * 2) / perLine;
    const rows: TeamsLayout['rows'] = [];
    let y = TOP;
    for (const t of lineup) {
      const lines = Math.max(1, Math.ceil(t.members.length / perLine));
      const lineH = 32 * c + NAME_H;
      const h = HEAD_H + lines * lineH;
      const slots: TeamsSlot[] = t.members.map((m, i) => ({
        name: m.name, num: m.num, cell: c, w: colW,
        x: M + (i % perLine) * colW, y: y + HEAD_H + Math.floor(i / perLine) * lineH,
      }));
      rows.push({ vest: t.vest, y, h, slots });
      y += h + ROW_GAP;
    }
    return { rows };
  };
  const bottom = (l: TeamsLayout) => (l.rows.length ? l.rows[l.rows.length - 1].y + l.rows[l.rows.length - 1].h : TOP);
  let lay = build(FITS[0][0], FITS[0][1]);
  for (const [perLine, c] of FITS) { lay = build(perLine, c); if (bottom(lay) <= BOTTOM) break; }
  return lay;
}

export function drawTeamsImage(c: HTMLCanvasElement, lineup: MatchTeam[], players: Player[], title: string, sub: string): TeamsLayout {
  c.width = IMG_W; c.height = IMG_H;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('캔버스를 만들 수 없습니다');
  const fg = tok('--fg', '#ffffff');
  const muted = tok('--muted', 'rgba(229, 229, 229, .55)');
  ctx.fillStyle = tok('--canvas', '#000000'); ctx.fillRect(0, 0, IMG_W, IMG_H);
  ctx.textAlign = 'left';
  ctx.fillStyle = fg; ctx.font = pixelFont(60); ctx.fillText(fit(ctx, title, IMG_W - M * 2), M, 150);
  ctx.fillStyle = muted; ctx.font = pixelFont(30); ctx.fillText(fit(ctx, sub, IMG_W - M * 2), M, 200);

  // 같은 날 나온 사람들 안에서 짧은 이름이 겹치면 그 사람만 성을 붙인다(카톡 텍스트와 같은 규칙).
  const names = nameMapOf(lineup.flatMap((t) => t.members));
  const lay = teamsLayout(lineup);
  lay.rows.forEach((row) => {
    const vest = vestOf(row.vest as MatchTeam['vest']);
    ctx.fillStyle = vest.color; ctx.fillRect(M, row.y, 16, HEAD_H - 16);
    ctx.fillStyle = fg; ctx.font = pixelFont(30); ctx.textAlign = 'left';
    ctx.fillText(vest.label, M + 32, row.y + 30);
    ctx.fillStyle = muted; ctx.font = pixelFont(20);
    ctx.fillText(`${row.slots.length}명`, M + 32 + ctx.measureText(vest.label).width * 1.5 + 16, row.y + 30);
    for (const s of row.slots) {
      const spriteW = 24 * s.cell;
      if (s.num != null) {
        const p = players.find((x) => x.num === s.num);
        drawAvatar(ctx, avatarPixels(avatarSpecFor(s.num, p?.avatar)), s.x + (s.w - spriteW) / 2, s.y, s.cell, s.num);
      } else {
        // 용병 — 아바타 자리에 회색 칸과 "용병"
        ctx.fillStyle = tok('--elevated', '#2a2d33'); ctx.fillRect(s.x + (s.w - spriteW) / 2, s.y, spriteW, 32 * s.cell);
        ctx.fillStyle = muted; ctx.font = pixelFont(20); ctx.textAlign = 'center';
        ctx.fillText('용병', s.x + s.w / 2, s.y + 16 * s.cell + 7);
      }
      ctx.fillStyle = fg; ctx.font = pixelFont(20); ctx.textAlign = 'center';
      ctx.fillText(fit(ctx, names.get(s.num != null ? `p${s.num}` : s.name) ?? s.name, s.w - 8), s.x + s.w / 2, s.y + 32 * s.cell + 24);
    }
  });
  ctx.textAlign = 'left';
  return lay;
}
