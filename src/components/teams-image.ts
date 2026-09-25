// src/components/teams-image.ts — 팀 나누기를 1080×1350 PNG 로(2026-09-25). **매치 카드의 팀 목록 모양 그대로** —
// 조끼 줄 머리(색 점·이름·인원) 아래 칩(얼굴 아바타 + 이름)이 줄줄이("팀 목록 뷰 그대로 저장, 굳이 아바타로 따로 만들지 말고").
// 숫자(OVR·평균)는 안 그린다 — 단톡방에 도는 이미지라 라인업·티어 이미지와 같은 원칙. 용병은 얼굴 없이 이름 + "용병".
import { avatarSpecFor } from '../lib/avatar.ts';
import { vestOf } from '../lib/matches.ts';
import type { MatchTeam, Player } from '../lib/types.ts';
import { avatarPixels, FACE_SIZE, FACE_X, FACE_Y } from './avatar.ts';
import { IMG_H, IMG_W, fit, pixelFont, tok } from './share-image.ts';

const M = 64;
const TOP = 230;
const BOTTOM = IMG_H - 60;
const HEAD_H = 60;          // 조끼 줄 머리
const ROW_GAP = 32;
const CHIP_GAP = 12;
const BORDER = 3;

/** 칩 크기 세 단계 — 큰 것부터, 세로가 모자라면 한 단계 작게. [얼굴 배수, 칩 높이, 이름 글자 크기]
 *  폰에서 1080px 이미지를 보면 72px 칩도 작게 보여 96px 부터 시작한다. */
const SIZES: Array<[number, number, number]> = [[4, 96, 30], [3, 72, 30], [2, 56, 20]];

export type TeamsChip = { name: string; num: number | null; x: number; y: number; w: number; h: number; cell: number; font: number };
export type TeamsLayout = { rows: Array<{ vest: string; y: number; h: number; chips: TeamsChip[] }> };

/** 칩 폭 — 캔버스 글자 폭은 부르는 쪽이 재서 준다(순수 계산을 지키려고). */
export function teamsLayout(lineup: MatchTeam[], textW: (text: string, font: number) => number): TeamsLayout {
  const build = ([cell, chipH, font]: [number, number, number]): TeamsLayout => {
    const face = FACE_SIZE * cell;
    const rows: TeamsLayout['rows'] = [];
    let y = TOP;
    for (const t of lineup) {
      const chips: TeamsChip[] = [];
      let cx = M, cy = y + HEAD_H;
      for (const m of t.members) {
        const guest = m.num == null;
        const w = 16 + (guest ? 0 : face + 10) + textW(m.name, font) + (guest ? 8 + textW('용병', 20) : 0) + 16;
        if (cx > M && cx + w > IMG_W - M) { cx = M; cy += chipH + CHIP_GAP; }
        chips.push({ name: m.name, num: m.num, x: cx, y: cy, w, h: chipH, cell, font });
        cx += w + CHIP_GAP;
      }
      const h = HEAD_H + (chips.length ? chips[chips.length - 1].y + chipH - (y + HEAD_H) : 0);
      rows.push({ vest: t.vest, y, h, chips });
      y += h + ROW_GAP;
    }
    return { rows };
  };
  const bottom = (l: TeamsLayout) => (l.rows.length ? l.rows[l.rows.length - 1].y + l.rows[l.rows.length - 1].h : TOP);
  let lay = build(SIZES[0]);
  for (const sz of SIZES) { lay = build(sz); if (bottom(lay) <= BOTTOM) break; }
  // 남는 세로는 위아래로 나눠 가운데에.
  const shift = Math.max(0, Math.floor((BOTTOM - bottom(lay)) / 2));
  if (shift) for (const r of lay.rows) { r.y += shift; for (const c of r.chips) c.y += shift; }
  return lay;
}

/** 얼굴+어깨 정사각(화면 avatarFaceSvg 와 같은 영역)을 칸칸이 찍는다. 스펙이 없으면 회색 칸 + 번호. */
function drawFace(ctx: CanvasRenderingContext2D, spec: ReturnType<typeof avatarPixels>, x: number, y: number, cell: number, num: number, muted: string): void {
  if (!spec) {
    ctx.fillStyle = tok('--elevated', '#2a2d33'); ctx.fillRect(x, y, FACE_SIZE * cell, FACE_SIZE * cell);
    ctx.fillStyle = muted; ctx.font = pixelFont(20); ctx.textAlign = 'center';
    ctx.fillText(String(num), x + (FACE_SIZE * cell) / 2, y + (FACE_SIZE * cell) / 2 + 7);
    return;
  }
  for (let row = 0; row < FACE_SIZE; row++) {
    let col = 0;
    while (col < FACE_SIZE) {
      const ch = spec.map[FACE_Y + row][FACE_X + col];
      if (ch === '.') { col += 1; continue; }
      let len = 1;
      while (col + len < FACE_SIZE && spec.map[FACE_Y + row][FACE_X + col + len] === ch) len += 1;
      ctx.fillStyle = spec.palette[ch];
      ctx.fillRect(x + col * cell, y + row * cell, len * cell, cell);
      col += len;
    }
  }
}

export function drawTeamsImage(c: HTMLCanvasElement, lineup: MatchTeam[], players: Player[], title: string, sub: string): TeamsLayout {
  c.width = IMG_W; c.height = IMG_H;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('캔버스를 만들 수 없습니다');
  const fg = tok('--fg', '#ffffff');
  const muted = tok('--muted', 'rgba(229, 229, 229, .55)');
  const line = tok('--line', '#3a3d44');
  const card = tok('--card', '#1b1d22');
  ctx.fillStyle = tok('--canvas', '#000000'); ctx.fillRect(0, 0, IMG_W, IMG_H);
  ctx.textAlign = 'left';
  ctx.fillStyle = fg; ctx.font = pixelFont(60); ctx.fillText(fit(ctx, title, IMG_W - M * 2), M, 150);
  ctx.fillStyle = muted; ctx.font = pixelFont(30); ctx.fillText(fit(ctx, sub, IMG_W - M * 2), M, 200);

  const textW = (t: string, font: number): number => { ctx.font = pixelFont(font); return ctx.measureText(t).width; };
  const lay = teamsLayout(lineup, textW);
  for (const row of lay.rows) {
    const vest = vestOf(row.vest as MatchTeam['vest']);
    // 줄 머리 — 화면의 .mt-team-head 처럼 색 점 + 조끼 이름 + 인원, 아래 3px 선
    ctx.fillStyle = vest.color; ctx.fillRect(M, row.y + 8, 20, 20);
    ctx.fillStyle = fg; ctx.font = pixelFont(30); ctx.textAlign = 'left';
    ctx.fillText(vest.label, M + 32, row.y + 30);
    const labelW = ctx.measureText(vest.label).width;
    ctx.fillStyle = muted; ctx.font = pixelFont(20);
    ctx.fillText(`${row.chips.length}명`, M + 32 + labelW + 16, row.y + 30);
    ctx.fillStyle = line; ctx.fillRect(M, row.y + HEAD_H - 12, IMG_W - M * 2, 3);
    for (const ch of row.chips) {
      // 칩 — 2px 테두리 + 바탕(화면 .tm-chip)
      ctx.fillStyle = line; ctx.fillRect(ch.x, ch.y, ch.w, ch.h);
      ctx.fillStyle = card; ctx.fillRect(ch.x + BORDER, ch.y + BORDER, ch.w - BORDER * 2, ch.h - BORDER * 2);
      let tx = ch.x + 16;
      if (ch.num != null) {
        const face = FACE_SIZE * ch.cell;
        const p = players.find((x) => x.num === ch.num);
        drawFace(ctx, avatarPixels(avatarSpecFor(ch.num, p?.avatar)), tx, ch.y + (ch.h - face) / 2, ch.cell, ch.num, muted);
        tx += face + 10;
      }
      ctx.fillStyle = fg; ctx.font = pixelFont(ch.font); ctx.textAlign = 'left';
      ctx.fillText(ch.name, tx, ch.y + ch.h / 2 + ch.font * 0.35);
      if (ch.num == null) {
        tx += textW(ch.name, ch.font) + 8;
        ctx.fillStyle = muted; ctx.font = pixelFont(20);
        ctx.fillText('용병', tx, ch.y + ch.h / 2 + 7);
      }
    }
  }
  ctx.textAlign = 'left';
  return lay;
}
