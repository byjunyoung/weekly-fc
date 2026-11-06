// src/react/game/views/match2d/stage.ts — 2D 경기 화면(혼자·온라인)이 함께 쓰는 캔버스 바탕: 안전 영역 읽기, 크기 맞추기.
// 1단계 GameApp 에 있던 것을 그대로 옮겼다(동작 같음).
import { buildField, fieldKey, HUD_H, type Field } from './render';
import type { Pitch } from '../../../../lib/game/sim';
import { makeView, type View } from './view';

/** 노치·홈바 안전 영역(px). CSS env() 는 JS 에서 바로 못 읽어서 보이지 않는 요소로 계산시킨다. */
export function readInsets(): { top: number; right: number; bottom: number; left: number } {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;'
    + 'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const n = (v: string): number => parseFloat(v) || 0;
  const out = { top: n(cs.paddingTop), right: n(cs.paddingRight), bottom: n(cs.paddingBottom), left: n(cs.paddingLeft) };
  probe.remove();
  return out;
}


export type Stage = { view: View; field: Field; dpr: number; topInset: number };

/** 캔버스를 뷰포트에 맞춘다. 크기가 바뀌면(ResizeObserver, orientationchange) 다시 계산하고 바닥 캐시를 다시 그린다.
 *  돌려주는 get() 이 지금 값을, dispose() 가 리스너를 뗀다. */
export function attachStage(root: HTMLElement, canvas: HTMLCanvasElement, pitch: Pitch): { get(): Stage | null; dispose(): void } {
  let cur: Stage | null = null;
  const layout = (): void => {
    const vw = root.clientWidth, vh = root.clientHeight;
    if (!vw || !vh) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(vw * dpr); canvas.height = Math.round(vh * dpr);
    const ins = readInsets();
    const view = makeView(vw, vh, { margin: Math.max(8, ins.left, ins.right), top: ins.top + HUD_H, bottom: ins.bottom, pitch });
    const field = cur && cur.field.key === fieldKey(view, dpr, pitch) ? cur.field : buildField(view, dpr, pitch);
    cur = { view, field, dpr, topInset: ins.top };
  };
  layout();
  const ro = new ResizeObserver(layout);
  ro.observe(root);
  window.addEventListener('orientationchange', layout);
  return { get: () => cur, dispose() { ro.disconnect(); window.removeEventListener('orientationchange', layout); } };
}
