// src/react/squad/Pitch.tsx — 피치(자리 배치) + 그리기. pitchHtml()/drawingsSvg() 문자열은 그대로 쓰고
// 포인터 드래그·키보드·그리기 배선만 React 생명주기에 맞춘다.
// 자리(.bd-slot) 버튼은 컴포넌트로 쪼개지 않는다 — dangerouslySetInnerHTML 로 통째로 새로 태어나므로
// React 가 style.translate 를 소유하지 않는다. 드래그 중 DOM 을 직접 만져도 다음 렌더(문자열 전체 교체)가
// 늘 새 노드를 만들어 그 흔적을 지운다.
import { useEffect, useRef } from 'react';
import { attachDraw, drawingsSvg, type Tool } from '../../components/board-draw';
import { pitchHtml } from '../../components/pitch-view';
import type { Drawing, LineupState, Pt } from '../../lib/lineup';
import type { Player } from '../../lib/types';

const DRAG_PX = 6;

export default function Pitch({ st, players, selected, tool, onTapSlot, onSwap, onMoveSlot, onDraw, onDeselect }: {
  st: LineupState; players: Player[]; selected: number | null; tool: Tool;
  onTapSlot: (idx: number) => void;
  onSwap: (a: number, b: number) => void;
  onMoveSlot: (idx: number, pt: Pt) => void;
  onDraw: (d: Drawing) => void;
  onDeselect: () => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  // tapSlotKeepFocus 대신 — 키보드로 고른 자리 번호를 적어 두고, DOM 이 실제로 바뀐 뒤(useEffect)에 포커스한다.
  const pendingFocusRef = useRef<number | null>(null);

  const ink = drawingsSvg(st.drawings, st.pitch);
  const html = pitchHtml(st, players, selected, ink);

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
        if (inside) onMoveSlot(idx, [(ev.clientX - r.left) / r.width, (ev.clientY - r.top) / r.height]);
        else { el.classList.remove('is-dragging'); el.style.translate = ''; }
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', cancel);
    }

    // 원본과 같은 배타적 분기 — 이동 모드에서만 자리별 핸들러를, 그리기 모드에서만 피치 전체 드로잉
    // 핸들러를 건다(둘 다 걸면 그리는 동안 자리를 탭/드래그하게 된다).
    if (tool === 'move') {
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
    }
    attachDraw(pitch, st.pitch, tool, ink, onDraw);
  }, [st, players, selected, tool, onTapSlot, onSwap, onMoveSlot, onDraw, onDeselect]);

  return <div ref={wrapRef} dangerouslySetInnerHTML={{ __html: html }} />;
}
