// src/components/board-draw.ts — 피치 위 화살표·펜. 렌더(drawingsSvg·toDrawing)는 순수하고,
// 입력 배선은 attachDraw 하나에 모았다. 좌표는 정규 좌표로 저장하고 그릴 때 경기장 단위로 편다.
import type { Drawing, Pt } from '../lib/lineup.ts';
import type { PitchKind } from '../lib/formation.ts';
import { PITCH_DIM } from './pitch-view.ts';

export type Tool = 'move' | 'arrow' | 'pen';

const f = (v: number) => v.toFixed(2);
const r3 = (v: number) => Math.round(v * 1000) / 1000;
/** 화살촉 길이(m) — 축구장은 풋살장보다 세 배 넘게 커서 따로 둔다. 공유 이미지(share-image.ts)도 쓴다. */
export const ARROW_HEAD: Record<PitchKind, number> = { futsal: 1.2, soccer: 3 };
const ARROW_MIN = 0.03;
const PEN_STEP = 0.008;

export function drawingsSvg(drawings: Drawing[], kind: PitchKind): string {
  const { w, h } = PITCH_DIM[kind];
  return drawings.map((d) => {
    if (d.kind === 'pen') return `<polyline class="bd-ink" points="${d.points.map((p) => `${f(p[0] * w)},${f(p[1] * h)}`).join(' ')}"/>`;
    const x1 = d.from[0] * w, y1 = d.from[1] * h, x2 = d.to[0] * w, y2 = d.to[1] * h;
    const a = Math.atan2(y2 - y1, x2 - x1);
    const tip = (s: number) => `${f(x2 - ARROW_HEAD[kind] * Math.cos(a + s))},${f(y2 - ARROW_HEAD[kind] * Math.sin(a + s))}`;
    return `<g class="bd-ink"><line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}"/><polyline points="${tip(0.45)} ${f(x2)},${f(y2)} ${tip(-0.45)}"/></g>`;
  }).join('');
}

export function toDrawing(tool: 'arrow' | 'pen', pts: Pt[]): Drawing | null {
  if (pts.length < 2) return null;
  const a = pts[0], b = pts[pts.length - 1];
  if (tool === 'arrow') return Math.hypot(b[0] - a[0], b[1] - a[1]) < ARROW_MIN ? null : { kind: 'arrow', from: a, to: b };
  const out: Pt[] = [pts[0]];
  for (const p of pts.slice(1)) {
    const q = out[out.length - 1];
    if (Math.hypot(p[0] - q[0], p[1] - q[1]) >= PEN_STEP) out.push(p);
  }
  return out.length < 2 ? null : { kind: 'pen', points: out.map((p) => [r3(p[0]), r3(p[1])] as Pt) };
}

/** 그리기 도구일 때 피치 위 포인터로 선 하나를 만든다. 그리는 동안은 base(이미 있는 그림) 위에 미리보기를 덧그린다. */
export function attachDraw(pitch: HTMLElement, kind: PitchKind, tool: 'arrow' | 'pen', base: string, onDone: (d: Drawing) => void): void {
  const svg = pitch.querySelector<SVGSVGElement>('[data-draw]');
  if (!svg) return;
  pitch.classList.add('is-drawing');
  let pts: Pt[] = [];
  const at = (e: PointerEvent): Pt => {
    const r = pitch.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
  };
  const preview = () => {
    const d: Drawing | null = pts.length < 2 ? null : tool === 'arrow' ? { kind: 'arrow', from: pts[0], to: pts[pts.length - 1] } : { kind: 'pen', points: pts };
    svg.innerHTML = base + (d ? drawingsSvg([d], kind) : '');
  };
  pitch.onpointerdown = (e) => { if (e.button !== 0) return; pitch.setPointerCapture(e.pointerId); pts = [at(e)]; };
  pitch.onpointermove = (e) => { if (!pts.length) return; pts = tool === 'arrow' ? [pts[0], at(e)] : [...pts, at(e)]; preview(); };
  pitch.onpointerup = () => { if (!pts.length) return; const d = toDrawing(tool, pts); pts = []; if (d) onDone(d); else svg.innerHTML = base; };
  pitch.onpointercancel = () => { pts = []; svg.innerHTML = base; };
}
