// src/components/share-image.ts — 라인업을 1080×1350(4:5, 카톡·인스타 피드 비율) PNG 로.
// 화면 캡처가 아니라 공유용으로 따로 그린다. 캔버스는 CSS 변수를 못 읽어 그리는 시점에 토큰을 읽는다.
// OVR 은 그리지 않는다 — 단톡방에 능력치 숫자가 도는 건 민감할 수 있다(2026-09-13 스펙 §5.1).
import { slotsOf, positionOf, type LineupState } from '../lib/lineup.ts';
import type { PitchKind } from '../lib/formation.ts';
import type { Player } from '../lib/types.ts';
import { PITCH_DIM } from './pitch-view.ts';

export const IMG_W = 1080;
export const IMG_H = 1350;
const M = 64;
const PITCH_TOP = 224;
const PITCH_BOTTOM = 1196;

const tok = (name: string, fallback: string): string => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

function fit(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > maxW) s = s.slice(0, -1);
  return `${s}…`;
}

function box(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
}

/** 피치 선 — pitch-view.ts 의 SVG 와 같은 도형을 같은 단위(m)로 그린다. */
function pitchLines(ctx: CanvasRenderingContext2D, kind: PitchKind, sx: number, sy: number): void {
  const R = (x: number, y: number, w: number, h: number) => ctx.strokeRect(x * sx, y * sy, w * sx, h * sy);
  const Lx = (x1: number, y1: number, x2: number, y2: number) => { ctx.beginPath(); ctx.moveTo(x1 * sx, y1 * sy); ctx.lineTo(x2 * sx, y2 * sy); ctx.stroke(); };
  const C = (x: number, y: number, r: number) => { ctx.beginPath(); ctx.arc(x * sx, y * sy, r * sx, 0, Math.PI * 2); ctx.stroke(); };
  if (kind === 'soccer') {
    R(2, 2, 64, 101); Lx(2, 52.5, 66, 52.5); C(34, 52.5, 9.15);
    R(13.2, 2, 41.6, 16.5); R(24.8, 2, 18.4, 5.5); R(13.2, 86.5, 41.6, 16.5); R(24.8, 97.5, 18.4, 5.5);
    return;
  }
  R(1, 1, 18, 38); Lx(1, 20, 19, 20); C(10, 20, 3);
  for (const [y0, y1] of [[1, 8], [39, 32]]) {
    ctx.beginPath(); ctx.moveTo(4 * sx, y0 * sy); ctx.bezierCurveTo(4 * sx, y1 * sy, 16 * sx, y1 * sy, 16 * sx, y0 * sy); ctx.stroke();
  }
}

export function drawLineupImage(c: HTMLCanvasElement, s: LineupState, players: Player[], title: string): void {
  c.width = IMG_W;
  c.height = IMG_H;
  const ctx = c.getContext('2d')!;
  const font = tok('--font', 'sans-serif');
  const fg = tok('--fg', '#ffffff');
  const muted = tok('--muted', 'rgba(229, 229, 229, .55)');
  const posColor: Record<string, string> = { GK: tok('--pos-gk', '#d58b0b'), DF: tok('--pos-df', '#2a52be'), MF: tok('--pos-mf', '#208174'), FW: tok('--pos-fw', '#e3251e') };

  ctx.fillStyle = tok('--canvas', '#000000');
  ctx.fillRect(0, 0, IMG_W, IMG_H);

  // 머리 — 팀 표시, 제목, 포메이션
  ctx.textAlign = 'left';
  ctx.fillStyle = muted; ctx.font = `600 26px ${font}`; ctx.fillText('WEEKLY FC', M, 104);
  ctx.fillStyle = fg; ctx.font = `600 56px ${font}`; ctx.fillText(fit(ctx, title, IMG_W - M * 2 - 220), M, 178);
  ctx.textAlign = 'right'; ctx.fillStyle = muted; ctx.font = `500 34px ${font}`; ctx.fillText(s.shape, IMG_W - M, 178);

  // 피치 — 경기장 비율을 지키며 가운데
  const { w, h } = PITCH_DIM[s.pitch];
  const ph = PITCH_BOTTOM - PITCH_TOP;
  const pw = Math.min(IMG_W - M * 2, ph * (w / h));
  const px = (IMG_W - pw) / 2;
  const sx = pw / w, sy = ph / h;
  ctx.fillStyle = '#0b1a13'; box(ctx, px, PITCH_TOP, pw, ph, 16); ctx.fill();
  ctx.save();
  ctx.translate(px, PITCH_TOP);
  ctx.strokeStyle = 'rgba(255, 255, 255, .22)'; ctx.lineWidth = 3;
  pitchLines(ctx, s.pitch, sx, sy);

  // 선수 — 이름과 자리 라벨만. 포지션 색 띠로 무리를 구분한다.
  const byNum = new Map(players.map((p) => [p.num, p]));
  const cw = Math.round(pw * (s.pitch === 'soccer' ? 0.17 : 0.23)), ch = 70;
  ctx.textAlign = 'center';
  slotsOf(s).forEach((slot, i) => {
    const [nx, ny] = positionOf(s, i);
    const cx = nx * pw, cy = ny * ph;
    const num = s.slots[i];
    const p = num != null ? byNum.get(num) : undefined;
    if (!p) {
      ctx.setLineDash([8, 6]); ctx.strokeStyle = 'rgba(255, 255, 255, .38)'; ctx.lineWidth = 2;
      box(ctx, cx - cw / 2, cy - ch / 2, cw, ch, 8); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = muted; ctx.font = `500 22px ${font}`; ctx.fillText(slot.label, cx, cy + 8);
      return;
    }
    ctx.fillStyle = 'rgba(18, 19, 20, .9)'; box(ctx, cx - cw / 2, cy - ch / 2, cw, ch, 8); ctx.fill();
    ctx.fillStyle = posColor[slot.group] ?? muted; ctx.fillRect(cx - cw / 2, cy - ch / 2, cw, 6);
    ctx.fillStyle = fg; ctx.font = `600 26px ${font}`; ctx.fillText(fit(ctx, p.name, cw - 12), cx, cy + 6);
    ctx.fillStyle = muted; ctx.font = `500 18px ${font}`; ctx.fillText(slot.label, cx, cy + 28);
  });
  ctx.restore();

  // 주소. 벤치 줄은 넣지 않는다 — 참석 기록이 없어 선발이 아닌 전체 명단이 찍힌다(2026-09-13 사용자 결정).
  ctx.textAlign = 'left';
  ctx.fillStyle = muted; ctx.font = `400 20px ${font}`; ctx.fillText('byjunyoung.github.io/weekly-fc', M, 1310);
}
