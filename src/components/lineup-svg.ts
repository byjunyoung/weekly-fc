// src/components/lineup-svg.ts — 저장된 라인업을 읽기 전용 SVG로. 세로 피치, x·y는 0~1.
import { esc } from '../lib/html.ts';
export type PitchPlayer = { n: number; pos: string; x: number; y: number; name?: string };
export type PitchState = { mode: 'soccer' | 'futsal'; count: number; home: PitchPlayer[]; away: PitchPlayer[]; homeColor: string; awayColor: string; formation: { home: string; away: string } };

// 등번호 색은 유니폼 색 밝기로 결정한다(pitch.ts의 colorLuminance/numColor와 같은 로직).
// 짙은 바탕 이전엔 --fg가 거의 검정이라 흰 유니폼 기본값(#ffffff)에서만 우연히 맞았고,
// 뒤집은 뒤엔 반대로 어두운 유니폼(#1a1a1a 등)에서만 맞는 셈이라 — 유니폼 밝기로 직접 계산한다.
function numFillFor(hex: string): string {
  const h = hex.replace('#', '');
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const r = parseInt(n.slice(0, 2), 16) || 0, g = parseInt(n.slice(2, 4), 16) || 0, b = parseInt(n.slice(4, 6), 16) || 0;
  return 0.299 * r + 0.587 * g + 0.114 * b > 140 ? '#111' : '#fff';
}

export function lineupSvg(s: PitchState): string {
  const W = 400, H = s.mode === 'futsal' ? 600 : 640, r = 14;
  const dot = (p: PitchPlayer, fill: string, flip: boolean) => {
    const cx = (flip ? 1 - p.x : p.x) * W, cy = (flip ? 1 - p.y : p.y) * H;
    const label = p.name ? esc(p.name) : String(p.n);
    const numFill = numFillFor(fill);
    return `<g><circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r}" fill="${esc(fill)}" stroke="var(--fg)" stroke-width="1"/><text x="${cx.toFixed(1)}" y="${(cy + 4).toFixed(1)}" text-anchor="middle" font-size="11" font-weight="600" fill="${numFill}">${String(p.n)}</text><text x="${cx.toFixed(1)}" y="${(cy + r + 12).toFixed(1)}" text-anchor="middle" font-size="10" fill="var(--muted)">${label}</text></g>`;
  };
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" class="pitch-svg">
<rect x="10" y="10" width="${W - 20}" height="${H - 20}" fill="none" stroke="var(--line)"/><line x1="10" y1="${H / 2}" x2="${W - 10}" y2="${H / 2}" stroke="var(--line)"/><circle cx="${W / 2}" cy="${H / 2}" r="40" fill="none" stroke="var(--line)"/>
${s.home.map((p) => dot(p, s.homeColor, false)).join('')}${s.away.map((p) => dot(p, s.awayColor, true)).join('')}</svg>`;
}
