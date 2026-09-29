// src/components/squad-image.ts — 팀 단체 사진(2026-09-30 "도트 아바타로 모여서 찍은 단체 사진, SNS 용").
// 밤 경기장(하늘·조명탑·관중석·광고판·잔디) 앞에 전원이 줄지어 서고, 발밑에 [번호 이름] 이름표.
// 지금 데이터로 그때그때 그린다 — 누가 아바타를 꾸미거나 명단이 바뀌면 사진도 같이 바뀐다.
// 그림은 전부 u(px) 칸 격자 위의 도트다. 아바타는 화면과 같은 데이터(avatarPixels)에서 가져온다.
// 무작위(관중·잔디 얼룩)는 고정 시드라 몇 번을 그려도 같은 그림이 나온다(공유 직전에 다시 그리므로).
// 글꼴은 갈무리, 크기는 PIXEL_SIZES(20·30·60) 안에서만.
import { avatarSpecFor } from '../lib/avatar.ts';
import type { Player } from '../lib/types.ts';
import { avatarPixels } from './avatar.ts';
import { pixelFont, tok } from './share-image.ts';

export type SquadFormat = 'feed' | 'square' | 'story' | 'wide' | 'banner';
type Spec = { w: number; h: number; u: number; perRow: number; step: number; title: number; sub: number; label: string };
/** 규격 — perRow 는 한 줄 최대 인원, step 은 옆 사람과의 간격(칸). title 0 이면 제목 없이(라커룸 띠). */
export const SQUAD_FORMATS: Record<SquadFormat, Spec> = {
  feed: { w: 1080, h: 1350, u: 4, perRow: 8, step: 28, title: 60, sub: 30, label: '피드 4:5' },
  square: { w: 1080, h: 1080, u: 3, perRow: 8, step: 36, title: 60, sub: 20, label: '정사각 1:1' },
  story: { w: 1080, h: 1920, u: 5, perRow: 7, step: 26, title: 60, sub: 30, label: '스토리 9:16' },
  wide: { w: 1600, h: 900, u: 4, perRow: 11, step: 28, title: 60, sub: 20, label: '가로 16:9' },
  banner: { w: 1920, h: 600, u: 4, perRow: 16, step: 28, title: 0, sub: 0, label: '띠' },
};

/** n 명을 한 줄 perRow 이하로 나눈 줄별 인원 — 뒷줄부터, 남는 사람은 뒷줄이 하나씩 더 받는다(31명·8 → 8·8·8·7). */
export function squadRows(n: number, perRow: number): number[] {
  if (n <= 0) return [];
  const r = Math.ceil(n / perRow), base = Math.floor(n / r), extra = n % r;
  return Array.from({ length: r }, (_, i) => base + (i < extra ? 1 : 0));
}

// 광고판 글자 5×7
const F57: Record<string, string[]> = {
  W: ['X...X', 'X...X', 'X...X', 'X.X.X', 'X.X.X', 'XX.XX', 'X...X'],
  E: ['XXXXX', 'X....', 'X....', 'XXXX.', 'X....', 'X....', 'XXXXX'],
  K: ['X...X', 'X..X.', 'X.X..', 'XX...', 'X.X..', 'X..X.', 'X...X'],
  L: ['X....', 'X....', 'X....', 'X....', 'X....', 'X....', 'XXXXX'],
  Y: ['X...X', 'X...X', '.X.X.', '..X..', '..X..', '..X..', '..X..'],
  F: ['XXXXX', 'X....', 'X....', 'XXXX.', 'X....', 'X....', 'X....'],
  C: ['.XXX.', 'X...X', 'X....', 'X....', 'X....', 'X...X', '.XXX.'],
};
const glyphW = (t: string) => [...t].reduce((s, ch) => s + (F57[ch] ? 6 : 4), 0) - 1;
// 축구공 15×15 — X 외곽선 · w 흰 · s 흰 그늘 · B 검은 패치
const BALL = ['.....XXXXX.....', '...XXwwwwwXX...', '..XwwwwwwwwwX..', '.XwwwwBBBwwwwX.', '.XBwwBBBBBwwBX.', 'XBBwwwBBBwwwBBX',
  'XBwwwwwwwwwwwBX', 'XwwwwwwwwwwwwsX', 'XwwBBwwwwwBBssX', 'XwBBBwwwwsBBBsX', '.XwBwwwBwwsBsX.', '.XwwwwBBBwssX..', '..XwwwBBBsssX..', '...XXwssssXX...', '.....XXXXX.....'];
const BALL_C: Record<string, string> = { X: '#111111', w: '#ffffff', s: '#c9ced6', B: '#1b1b1b' };
const SKY = ['#05060f', '#080b1c', '#0b1028', '#0f1533', '#131b3e', '#18224a'];
const SHIRT = ['#c0392b', '#0070d1', '#ffce21', '#ecf0f1', '#27ae60', '#8e44ad', '#e67e22', '#2c3e50', '#16a085', '#d35400'];
const SKIN = ['#f2c9a0', '#e0ac7e', '#c68642', '#8d5524', '#f5d5b8'];
const AV_W = 24, AV_H = 32, LAB = 9, PITCH = AV_H + LAB + 1;

export function drawSquadImage(canvas: HTMLCanvasElement, players: Player[], fmt: SquadFormat, year: number): void {
  const F = SQUAD_FORMATS[fmt];
  canvas.width = F.w; canvas.height = F.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const U = F.u, GW = Math.ceil(F.w / U), GH = Math.ceil(F.h / U);
  const px = (x: number, y: number, c: string, w = 1, h = 1) => { ctx.fillStyle = c; ctx.fillRect(x * U, y * U, w * U, h * U); };
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const GOLD = tok('--gold', '#ffce21'), BLUE = tok('--accent', '#0070d1'), MUT = tok('--muted', '#9da4af');

  const list = [...players].sort((a, b) => a.num - b.num);
  const counts = squadRows(list.length, F.perRow);
  const BOTTOM = Math.round(40 / U);
  const T = GH - BOTTOM - counts.length * PITCH;   // 뒷줄 머리
  const adY = T - 20, adH = 11;
  const titleRoom = F.title ? 170 : 0;
  const tiers = Math.max(3, Math.min(8, Math.floor((adY * U - titleRoom) / (6 * U))));
  const standTop = adY - tiers * 6;

  // 하늘·별
  for (let y = 0; y < standTop; y++) px(0, y, SKY[Math.min(5, Math.floor((y / Math.max(1, standTop)) * 6))], GW, 1);
  for (let i = 0; i < GW / 5; i++) px(Math.floor(rnd() * GW), Math.floor(rnd() * standTop * 0.7), rnd() < 0.3 ? '#ffffff' : '#6d7aa8');
  // 조명탑
  const tower = (x: number) => {
    const top = Math.max(2, standTop - 60);
    for (let y = top + 10; y < standTop + 2; y++) { px(x + 6, y, '#3a4150', 2, 1); if (y % 4 === 0) px(x + 5, y, '#2a303c', 4, 1); }
    px(x - 1, top - 1, '#4a5264', 17, 1); px(x - 1, top + 9, '#4a5264', 17, 1);
    for (let j = 0; j < 3; j++) for (let i = 0; i < 4; i++) px(x + i * 4, top + j * 3, '#fffbe0', 3, 2);
    for (let r = 0; r < 22; r++) { const a = rnd() * Math.PI * 2, d = 8 + rnd() * 14; px(Math.round(x + 7 + Math.cos(a) * d), Math.round(top + 4 + Math.sin(a) * d * 0.6), 'rgba(255,250,210,.35)'); }
  };
  if (standTop > 12) { tower(8); tower(GW - 24); }
  // 관중석
  for (let row = 0; row < tiers; row++) {
    const y = standTop + row * 6;
    px(0, y, row % 2 ? '#1d2230' : '#232938', GW, 6); px(0, y + 5, '#11141c', GW, 1);
    for (let x = 1 + (row % 2) * 2; x < GW - 2; x += 4) {
      if (rnd() < 0.12) continue;
      px(x, y + 1, SKIN[Math.floor(rnd() * SKIN.length)], 2, 2); px(x, y + 3, SHIRT[Math.floor(rnd() * SHIRT.length)], 2, 2);
    }
  }
  const mid = Math.round(GW / 2) - 4;
  px(mid, standTop, '#3a4150', 8, adY - standTop);
  for (let y = standTop; y < adY; y += 3) px(mid, y, '#2a303c', 8, 1);
  // 광고판 — WEEKLY FC 를 검정·금색·파랑 판에 번갈아
  px(0, adY, '#0b0b0b', GW, adH); px(0, adY, '#2a2a2a', GW, 1); px(0, adY + adH - 1, '#2a2a2a', GW, 1);
  const segs: Array<[string, string]> = [['#ffffff', '#0b0b0b'], ['#0b0b0b', GOLD], ['#ffffff', BLUE]];
  const t = 'WEEKLY FC', tw = glyphW(t) + 10;
  for (let ax = -6, si = 0; ax < GW; ax += tw, si++) {
    const [fg, bg] = segs[si % 3];
    px(ax, adY + 1, bg, tw, 9);
    let cx = ax + 5;
    for (const ch of t) { const g = F57[ch]; if (g) g.forEach((row, j) => [...row].forEach((v, i) => { if (v === 'X') px(cx + i, adY + 2 + j, fg); })); cx += g ? 6 : 4; }
    px(ax + tw - 1, adY + 1, '#000000', 1, 9);
  }
  // 잔디 — 가로 줄무늬 + 얼룩 + 터치라인
  const gy = adY + adH;
  for (let y = gy; y < GH; y++) px(0, y, Math.floor((y - gy) / 12) % 2 ? '#2e7d32' : '#34893a', GW, 1);
  for (let i = 0; i < (GW * GH) / 60; i++) px(Math.floor(rnd() * GW), gy + Math.floor(rnd() * (GH - gy)), rnd() < 0.5 ? '#2a7030' : '#3e9a44');
  px(0, gy + 4, '#e8efe8', GW, 1);

  // 선수 자리 — 줄마다 가운데 맞춤, 좌우로 반의반 칸씩 엇갈려 모여 선 느낌
  const rows: Array<Array<{ p: Player; x: number; y: number }>> = [];
  let k = 0;
  counts.forEach((n, ri) => {
    const w = (n - 1) * F.step + AV_W;
    const x0 = Math.round(GW / 2 - w / 2) + (ri % 2 ? 1 : -1) * Math.round(F.step / 4);
    rows.push(list.slice(k, k + n).map((p, i) => ({ p, x: x0 + i * F.step, y: T + ri * PITCH })));
    k += n;
  });
  // 소품 — 양옆 콘·물병(자리가 있을 때만)
  const minX = Math.min(...rows.flat().map((q) => q.x));
  if (minX > 18) {
    const cone = (x: number, y: number) => { px(x + 2, y, '#ff8a1f'); px(x + 1, y + 1, '#ff8a1f', 3, 1); px(x + 1, y + 2, '#ffffff', 3, 1); px(x, y + 3, '#ff8a1f', 5, 1); px(x - 1, y + 4, '#c85e00', 7, 1); };
    const bottle = (x: number, y: number) => { px(x + 1, y, '#ffffff'); px(x, y + 1, '#9fd3ff', 3, 6); px(x, y + 3, BLUE, 3, 2); };
    const fy = GH - BOTTOM - 14;
    cone(6, fy); cone(GW - 12, fy + 2); bottle(14, fy - 2); bottle(GW - 18, fy - 1);
  }

  ctx.textBaseline = 'middle';
  for (const row of rows) {
    for (const q of row) {
      px(q.x + 5, q.y + AV_H - 1, 'rgba(0,0,0,.3)', 14, 1);
      const pix = avatarPixels(avatarSpecFor(q.p.num, q.p.avatar || undefined));
      if (pix) pix.map.forEach((line, j) => [...line].forEach((ch, i) => { if (ch !== '.') px(q.x + i, q.y + j, pix.palette[ch]); }));
    }
    // 이름표 — 발밑 가운데, 반투명 검정 판에 금색 번호 + 흰 이름
    ctx.font = pixelFont(20);
    for (const q of row) {
      const n = String(q.p.num), nm = q.p.name;
      const nw = ctx.measureText(n).width, mw = ctx.measureText(nm).width, pad = 6, gap = 6;
      const w = Math.round(nw + mw + pad * 2 + gap), h = LAB * U - 6;
      const x = Math.round((q.x + AV_W / 2) * U - w / 2), y = (q.y + AV_H) * U + 2;
      ctx.fillStyle = 'rgba(0,0,0,.72)'; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = GOLD; ctx.fillText(n, x + pad, y + h / 2 + 1);
      ctx.fillStyle = '#ffffff'; ctx.fillText(nm, x + pad + nw + gap, y + h / 2 + 1);
    }
  }
  // 공 — 앞줄 왼쪽 발밑
  const front = rows[rows.length - 1];
  if (front?.length) {
    const bx = front[0].x - 20, by = front[0].y + 16;
    BALL.forEach((line, j) => [...line].forEach((v, i) => { if (BALL_C[v]) px(bx + i, by + j, BALL_C[v]); }));
  }
  // 제목 — 사이트 헤더 워드마크 그대로(WEEKLY 흰 + FC 회색), 아래 금색 "YYYY SQUAD"
  if (F.title) {
    ctx.textBaseline = 'alphabetic';
    ctx.font = pixelFont(F.title);
    const a = ctx.measureText('WEEKLY').width, b = ctx.measureText('FC').width;
    const ty = Math.round((standTop * U) / 2 + F.title * 0.25 - F.sub * 0.6);
    const tx = Math.round((F.w - a - b) / 2);
    ctx.fillStyle = '#ffffff'; ctx.fillText('WEEKLY', tx, ty);
    ctx.fillStyle = MUT; ctx.fillText('FC', tx + a, ty);
    const sub = `${year} SQUAD`;
    ctx.font = pixelFont(F.sub);
    ctx.fillStyle = GOLD; ctx.fillText(sub, Math.round((F.w - ctx.measureText(sub).width) / 2), ty + F.sub + 18);
  }
}
