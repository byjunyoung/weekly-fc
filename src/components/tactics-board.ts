// src/components/tactics-board.ts — 전술 보드 SVG(2026-09-26). 카드뉴스와 같은 그림: 진녹색 보드, 흰 분필 라인,
// 자석 토큰(나=노랑·우리=흰·상대=빨강·키퍼=파랑), 노란 실선=패스, 점선=드리블, 흰 점선=뛰는 길.
// 좌표 0..100 × 0..61. 순수 문자열이라 Astro 빌드 때 그린다.
import type { Board } from '../lib/tactics.ts';
import { esc } from '../lib/html.ts';

const COL = { me: '#ffd23f', us: '#f4f4f4', op: '#e8543f', gk: '#5aa9ff' } as const;
const CHALK = 'rgba(255,255,255,.55)';

export function tacticsBoardSvg(spec: Board, label = ''): string {
  const W = 100, H = 61;
  let s = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(label)}">`;
  s += `<rect x="0" y="0" width="${W}" height="${H}" fill="#17402a"/>`;
  s += `<rect x="4" y="4" width="92" height="53" fill="none" stroke="${CHALK}" stroke-width=".5"/>`;
  s += `<line x1="50" y1="4" x2="50" y2="57" stroke="${CHALK}" stroke-width=".5"/><circle cx="50" cy="30.5" r="7" fill="none" stroke="${CHALK}" stroke-width=".5"/>`;
  s += `<rect x="4" y="18" width="11" height="25" fill="none" stroke="${CHALK}" stroke-width=".5"/><rect x="85" y="18" width="11" height="25" fill="none" stroke="${CHALK}" stroke-width=".5"/>`;
  for (const z of spec.zones ?? []) s += `<rect x="${z.x}" y="${z.y}" width="${z.w}" height="${z.h}" rx="1" fill="${z.c ?? COL.me}" opacity="${z.o ?? .18}"/>`;
  for (const a of spec.arrows ?? []) {
    const c = a.c ?? (a.k === 'run' ? COL.us : COL.me);
    const dash = a.k === 'run' ? ' stroke-dasharray="2.2 1.6"' : a.k === 'drib' ? ' stroke-dasharray=".9 1.3"' : '';
    const [x1, y1] = a.a, [x2, y2] = a.b;
    const ang = Math.atan2(y2 - y1, x2 - x1);
    const f = (n: number): string => n.toFixed(2);
    s += `<line x1="${x1}" y1="${y1}" x2="${f(x2 - Math.cos(ang) * 2.4)}" y2="${f(y2 - Math.sin(ang) * 2.4)}" stroke="${c}" stroke-width="${a.w ?? 1.3}" stroke-linecap="round"${dash} opacity="${a.o ?? 1}"/>`;
    s += `<polygon points="${x2},${y2} ${f(x2 - Math.cos(ang - .5) * 3.4)},${f(y2 - Math.sin(ang - .5) * 3.4)} ${f(x2 - Math.cos(ang + .5) * 3.4)},${f(y2 - Math.sin(ang + .5) * 3.4)}" fill="${c}" opacity="${a.o ?? 1}"/>`;
  }
  for (const p of spec.players ?? []) {
    const c = COL[p.t], r = p.t === 'me' ? 4 : 3.5;
    s += `<circle cx="${p.x}" cy="${p.y + .6}" r="${r}" fill="rgba(0,0,0,.35)"/><circle cx="${p.x}" cy="${p.y}" r="${r}" fill="${c}" opacity="${p.o ?? 1}"/>`;
    if (p.t === 'me') s += `<circle cx="${p.x}" cy="${p.y}" r="${r - 1.3}" fill="none" stroke="rgba(0,0,0,.35)" stroke-width=".6"/>`;
  }
  if (spec.ball) s += `<circle cx="${spec.ball.x}" cy="${spec.ball.y}" r="1.7" fill="#fff" stroke="#111" stroke-width=".5"/>`;
  for (const m of spec.marks ?? []) s += `<text x="${m.x}" y="${m.y}" font-size="${m.s ?? 6}" fill="${m.c ?? COL.op}" font-weight="800" text-anchor="middle" font-family="Pretendard, sans-serif">${esc(m.t)}</text>`;
  return `${s}</svg>`;
}
