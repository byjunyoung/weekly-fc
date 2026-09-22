// src/react/squad/Pitch.tsx — 피치(자리 배치). pitchHtml() 문자열은 그대로 쓰고
// 포인터 드래그·키보드 배선만 React 생명주기에 맞춘다.
// 자리(.bd-slot) 버튼은 컴포넌트로 쪼개지 않는다 — dangerouslySetInnerHTML 로 통째로 새로 태어나므로
// React 가 style.translate 를 소유하지 않는다. 드래그 중 DOM 을 직접 만져도 다음 렌더(문자열 전체 교체)가
// 늘 새 노드를 만들어 그 흔적을 지운다.
import { useEffect, useRef } from 'react';
import { fromLandscape, pitchHtml } from '../../components/pitch-view';
import type { LineupState, Pt } from '../../lib/lineup';
import type { Player } from '../../lib/types';

const DRAG_PX = 6;

export default function Pitch({ st, players, selected, land, onTapSlot, onSwap, onMoveSlot, onDeselect }: {
  st: LineupState; players: Player[]; selected: number | null; land: boolean;
  onTapSlot: (idx: number) => void;
  onSwap: (a: number, b: number) => void;
  onMoveSlot: (idx: number, pt: Pt) => void;
  onDeselect: () => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  // tapSlotKeepFocus 대신 — 키보드로 고른 자리 번호를 적어 두고, DOM 이 실제로 바뀐 뒤(useEffect)에 포커스한다.
  const pendingFocusRef = useRef<number | null>(null);

  const html = pitchHtml(st, players, selected, land);

  useEffect(() => {
    const pitch = wrapRef.current?.querySelector<HTMLElement>('[data-pitch]');
    if (!pitch) return;

    if (pendingFocusRef.current != null) {
      pitch.querySelector<HTMLElement>(`[data-slot="${pendingFocusRef.current}"]`)?.focus();
      pendingFocusRef.current = null;
    }

    function startDrag(e: PointerEvent, el: HTMLElement): void {
      if (e.button !== 0) return;
      const idx = Number(el.dataset.slot);
      const x0 = e.clientX, y0 = e.clientY;
      let dragging = false;
      el.setPointerCapture(e.pointerId);
      const off = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', cancel); };
      const move = (ev: PointerEvent) => {
        const dx = ev.clientX - x0, dy = ev.clientY - y0;
        if (!dragging && Math.hypot(dx, dy) < DRAG_PX) return;
        dragging = true;
        el.classList.add('is-dragging');
        el.style.translate = `${dx}px ${dy}px`;
      };
      const cancel = () => { off(); el.classList.remove('is-dragging'); el.style.translate = ''; };
      const up = (ev: PointerEvent) => {
        off();
        if (!dragging) { onTapSlot(idx); return; }
        el.style.visibility = 'hidden';
        const under = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>('[data-slot]');
        el.style.visibility = '';
        if (under && under !== el) { onSwap(idx, Number(under.dataset.slot)); return; }
        const r = pitch!.getBoundingClientRect();
        const inside = ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
        // 끌어다 놓은 자리는 화면 좌표라, 가로 피치면 세로 규격 좌표로 되돌려 저장한다.
        if (inside) {
          const nx = (ev.clientX - r.left) / r.width, ny = (ev.clientY - r.top) / r.height;
          onMoveSlot(idx, land ? fromLandscape(nx, ny) : [nx, ny]);
        }
        else { el.classList.remove('is-dragging'); el.style.translate = ''; }
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', cancel);
    }

    pitch.querySelectorAll<HTMLElement>('[data-slot]').forEach((el) => {
      el.onpointerdown = (e) => startDrag(e, el);
      // 키보드(Enter·Space)는 pointer 이벤트가 없다 — detail 0 인 click 으로만 들어온다.
      el.onclick = (e) => {
        if (e.detail === 0) { pendingFocusRef.current = Number(el.dataset.slot); onTapSlot(Number(el.dataset.slot)); }
      };
    });
    const onBg = (e: MouseEvent) => { if (!(e.target as Element).closest('[data-slot]') && selected !== null) onDeselect(); };
    pitch.addEventListener('click', onBg);
    return () => pitch.removeEventListener('click', onBg);
  }, [st, players, selected, land, onTapSlot, onSwap, onMoveSlot, onDeselect]);

  return <div id="pitch-slot" ref={wrapRef} dangerouslySetInnerHTML={{ __html: html }} />;
}
