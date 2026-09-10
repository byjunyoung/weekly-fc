// src/components/recap.ts — 스코어·참석자·라인업을 1080×1080 PNG로. 캔버스 안 색은 토큰을 못 읽으므로 getComputedStyle로 가져온다.
import type { Match } from '../lib/types.ts';
import type { PitchState } from './lineup-svg.ts';
import { fmtDate } from '../lib/html.ts';

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
    m.teams.forEach((t, i) => {
      const x = 80 + (i * (S - 160)) / m.teams.length;
      const win = t.name === m.winner;
      ctx.fillStyle = win ? fg : muted;
      ctx.fillText(
        `${t.name}${win ? ' 승' : ''}${t.points != null ? `  ${t.points}점` : ''}`,
        x,
        y
      );
      ctx.font = `24px ${font}`;
      t.players.forEach((p, j) => ctx.fillText(p, x, y + 44 + j * 32));
      ctx.font = `600 34px ${font}`;
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
    m.attendees.forEach((p, i) => ctx.fillText(p, 80 + ((i % cols) * w), y + Math.floor(i / cols) * 36));
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

    // 세로 저장 좌표를 가로 피치에: x' = 1-y, y' = x
    ps.home.forEach((p) => dot(px + (1 - p.y) * pw * 0.5, py + p.x * ph, ps.homeColor, String(p.n)));
    ps.away.forEach((p) => dot(px + pw * 0.5 + p.y * pw * 0.5, py + (1 - p.x) * ph, ps.awayColor, String(p.n)));
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
  slot.innerHTML = `<img src="${url}" alt="리캡 카드" style="max-width:540px;border:1px solid var(--line)"><div class="row"><a class="primary" style="display:inline-block;padding:6px 12px;border:1px solid var(--fg)" href="${url}" download="weeklyfc-${m.date}.png">이미지로 저장</a><span class="muted">모바일은 이미지를 길게 눌러 저장</span></div>`;
}
