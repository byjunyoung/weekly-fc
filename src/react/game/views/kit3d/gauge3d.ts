// src/react/game/views/kit3d/gauge3d.ts — 3D 게임의 세기 막대 하나(2026-11-07 "게이지 시스템 피파랑 비슷하게 가자"). three.js 는 부르지 않는다.
// 3D 경기·자유 훈련장은 내 선수 발밑(화면 좌표)에, 1인칭이면 화면 아래 가운데에. 3D 승부차기·프리킥도 같은 막대(자리는 아래 가운데).
// 모으는 동안 차오르고, 뗀 뒤 HOLD_MS 동안 그 세기로 남았다 사라진다. 색: 슛 = 금색, 패스 계열 = 링크 파랑(토큰). 슛은 잘 들어가는 띠를 표시.
import type { PerspectiveCamera, Vector3 } from 'three';
import { el, type TagScene } from './dom3d';

export type GaugeKind = 'shot' | 'pass';
/** feet = 발밑 화면 좌표(at)에, bottom = 화면 아래 가운데(1인칭·승부차기·프리킥). */
export type GaugeAt = { x: number; y: number } | null;
const HOLD_MS = 300;

export function createGauge(layer: HTMLElement, extraCls = '') {
  const root = el('div', `k3-gauge${extraCls ? ` ${extraCls}` : ''}`, layer);
  root.setAttribute('aria-hidden', 'true');
  const sweet = el('span', 'k3-gauge-sweet', root);
  const fill = el('i', 'k3-gauge-fill', root);
  let on = false, last = 0, until = 0, kindNow: GaugeKind | null = null, sweetKey = '', posKey = '';
  const show = (v: boolean): void => { if (v !== on) { on = v; root.classList.toggle('is-on', v); } };
  return {
    /** value = 지금 모은 세기(0~1, 안 모으면 null — 뗀 뒤 잠깐은 마지막 세기·종류로 남는다). sweet = 잘 들어가는 띠(슛만). at = 발밑 화면 좌표(없으면 아래 가운데).
     *  touch = 아래 가운데일 때 터치 버튼 위로 옮길까(승부차기·프리킥 — 예전 자리). */
    update(value: number | null, kind: GaugeKind, at: GaugeAt, sweetBand: readonly [number, number] | null, touch: boolean, now = performance.now()): void {
      if (value !== null && value > 0) { last = Math.min(1, value); until = now + HOLD_MS; root.classList.remove('is-done'); }
      else if (now < until) root.classList.add('is-done');
      else { show(false); return; }
      show(true);
      if (value !== null && value > 0 && kind !== kindNow) { kindNow = kind; root.classList.toggle('is-shot', kind === 'shot'); root.classList.toggle('is-pass', kind === 'pass'); }
      const sk = sweetBand && kind === 'shot' ? `${sweetBand[0]}-${sweetBand[1]}` : '';
      if (sk !== sweetKey) {
        sweetKey = sk;
        sweet.style.display = sk ? '' : 'none';
        if (sweetBand && sk) { sweet.style.left = `${sweetBand[0] * 100}%`; sweet.style.width = `${(sweetBand[1] - sweetBand[0]) * 100}%`; }
      }
      fill.style.transform = `scaleX(${last.toFixed(3)})`;
      const pk = at ? 'feet' : touch ? 'bottom-touch' : 'bottom';
      if (pk !== posKey) { posKey = pk; root.classList.toggle('is-feet', !!at); root.classList.toggle('is-bottom', !at); root.classList.toggle('is-touch', !at && touch); }
      if (at) root.style.transform = `translate(${at.x.toFixed(1)}px, ${at.y.toFixed(1)}px) translate(-50%, 0)`;
      else root.style.transform = '';
    },
    dispose(): void { root.remove(); },
  };
}

/** 몸 i 의 발밑 화면 좌표(막대 윗변이 발 아래 8px) — 카메라 뒤면 null. a·b = 재사용할 벡터 둘. */
export function footAt(sc: TagScene, i: number, w: number, h: number, a: Vector3, b: Vector3): GaugeAt {
  if (sc.footPoint(i, a).applyMatrix4(sc.camera.matrixWorldInverse).z >= -0.3) return null;
  sc.footPoint(i, b).project(sc.camera as unknown as PerspectiveCamera);
  return { x: (b.x + 1) * 0.5 * w, y: (1 - b.y) * 0.5 * h + 8 };
}
