// src/components/recap.ts — 스코어·참석자·라인업을 1080×1080 PNG로. 캔버스 안 색은 토큰을 못 읽으므로 getComputedStyle로 가져온다.
import type { Match } from '../lib/types.ts';
import type { PitchState, PitchPlayer } from './lineup-svg.ts';
import { fmtDate, esc } from '../lib/html.ts';
import { toLandscape } from '../lib/pitch-coords.ts';

const tok = (name: string): string => {
  const val = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  // Fallbacks for tokens if CSS hasn't loaded yet
  const fallbacks: Record<string, string> = {
    '--bg': '#ffffff',
    '--fg': '#000000',
    '--muted': '#808080',
    '--line': '#e0e0e0',
    '--surface': '#fafafa',
    '--font': 'sans-serif',
  };
  return val || fallbacks[name] || '#000000';
};

const fit = (ctx: CanvasRenderingContext2D, text: string, maxW: number): string => {
  if (ctx.measureText(text).width <= maxW) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
  return s + '…';
};

export function drawRecap(c: HTMLCanvasElement, m: Match, ps: PitchState | null): void {
  const S = 1080;
  c.width = S;
  c.height = S;
  const ctx = c.getContext('2d')!;
  const font = tok('--font');
  const bg = tok('--bg');
  const fg = tok('--fg');
  const muted = tok('--muted');
  const line = tok('--line');
  const surface = tok('--surface');

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = line;
  ctx.lineWidth = 2;
  ctx.strokeRect(40, 40, S - 80, S - 80);

  ctx.fillStyle = muted;
  ctx.font = `600 22px ${font}`;
  ctx.fillText('W E E K L Y   F C', 80, 110);

  ctx.fillStyle = fg;
  ctx.font = `600 54px ${font}`;
  ctx.fillText(fmtDate(m.date), 80, 190);

  ctx.fillStyle = muted;
  ctx.font = `28px ${font}`;
  ctx.fillText([m.type, m.location].filter(Boolean).join(' · ') || '매치', 80, 240);

  let y = 320;

  if (m.teams.length) {
    ctx.fillStyle = fg;
    ctx.font = `600 34px ${font}`;
    const colW = (S - 160) / m.teams.length;
    const colMaxW = colW - 32; // 16px gutter on each side
    m.teams.forEach((t, i) => {
      const x = 80 + (i * colW) + 16;
      const win = t.name === m.winner;
      ctx.fillStyle = win ? fg : muted;
      ctx.font = `600 34px ${font}`;
      const teamNameLine = fit(ctx, `${t.name}${win ? ' 승' : ''}${t.points != null ? `  ${t.points}점` : ''}`, colMaxW);
      ctx.fillText(teamNameLine, x, y);
      ctx.font = `24px ${font}`;
      t.players.forEach((p, j) => {
        const playerName = fit(ctx, p, colMaxW);
        ctx.fillText(playerName, x, y + 44 + j * 32);
      });
    });
    y += 60 + 32 * Math.max(...m.teams.map((t) => t.players.length)) + 40;
  } else {
    ctx.fillStyle = fg;
    ctx.font = `600 34px ${font}`;
    ctx.fillText(`참석 ${m.attendees.length}명`, 80, y);
    y += 50;
    ctx.font = `26px ${font}`;
    ctx.fillStyle = fg;
    const cols = 4;
    const w = (S - 160) / cols;
    const colMaxW = w - 32; // 16px gutter on each side
    m.attendees.forEach((p, i) => {
      const name = fit(ctx, p, colMaxW);
      ctx.fillText(name, 80 + 16 + ((i % cols) * w), y + Math.floor(i / cols) * 36);
    });
    y += Math.ceil(m.attendees.length / cols) * 36 + 40;
  }

  if (ps && y < S - 340) {
    const px = 80;
    const py = y;
    const pw = S - 160;
    const ph = S - 120 - y;
    ctx.fillStyle = surface;
    ctx.fillRect(px, py, pw, ph);
    ctx.strokeStyle = line;
    ctx.strokeRect(px, py, pw, ph);
    ctx.beginPath();
    ctx.moveTo(px + pw / 2, py);
    ctx.lineTo(px + pw / 2, py + ph);
    ctx.stroke();

    const dot = (x: number, yy: number, fill: string, label: string) => {
      ctx.beginPath();
      ctx.arc(x, yy, 16, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = fg;
      ctx.stroke();
      ctx.fillStyle = fg;
      ctx.font = `600 14px ${font}`;
      ctx.textAlign = 'center';
      ctx.fillText(label, x, yy + 5);
      ctx.textAlign = 'left';
    };

    // 저장된 세로 정규좌표를 가로로 변환하여 배치. 두 팀이 전체 피치를 공유하며 toLandscape로 통일.
    const place = (p: PitchPlayer, fill: string) => {
      const [lx, ly] = toLandscape([p.x, p.y]);
      dot(px + lx * pw, py + ly * ph, fill, String(p.n));
    };
    ps.home.forEach((p) => place(p, ps.homeColor));
    ps.away.forEach((p) => place(p, ps.awayColor));
  }

  ctx.fillStyle = muted;
  ctx.font = `20px ${font}`;
  ctx.fillText('byjunyoung.github.io/weekly-fc', 80, S - 70);
}

export function mountRecap(m: Match, ps: PitchState | null): void {
  const slot = document.getElementById('recap-slot');
  if (!slot) return;
  const c = document.createElement('canvas');
  drawRecap(c, m, ps);
  const url = c.toDataURL('image/png');
  slot.innerHTML = `<img src="${url}" alt="리캡 카드" style="max-width:540px;border:1px solid var(--line)"><div class="row"><a class="primary" style="display:inline-block;padding:6px 12px;border:1px solid var(--fg)" href="${url}" download="${esc(`weeklyfc-${m.date}.png`)}">이미지로 저장</a><span class="muted">모바일은 이미지를 길게 눌러 저장</span></div>`;
}
