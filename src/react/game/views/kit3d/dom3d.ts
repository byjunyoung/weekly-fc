// src/react/game/views/kit3d/dom3d.ts — 3D 게임 그림판 위 DOM 조각(2026-11-07 게임 묶음 5단계). three.js 는 부르지 않는다(장면 손잡이만 받는다).
// 3D 승부차기·자유 훈련장이 같이 쓰고, 3D 프리킥·드리블 훈련장이 이어 쓸 자리다. 클래스는 3D 경기(.g3-*)와 같다 — 모양을 두 번 짓지 않게.
//   el            — 층(layer)에 요소 하나 달기
//   createTags    — 이름표·말풍선(머리 위를 화면에 비춘다 — 3D 경기 surface3d 와 같은 계산)
//   createTouch   — 터치 버튼(그 게임에 뜻이 있는 것만) + 조이스틱, 처음 터치에 보인다
import type { Vector3 } from 'three';
import { TEAM } from '../../teams';

export const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: HTMLElement): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  e.className = cls;
  parent.appendChild(e);
  return e;
};

/** 장면 손잡이에서 이름표가 쓰는 것만(scene.ts SceneHandle 의 일부). */
export type TagScene = {
  camera: { matrixWorldInverse: import('three').Matrix4; fov: number; aspect: number };
  headPoint(i: number, out: Vector3): Vector3;
  footPoint(i: number, out: Vector3): Vector3;
};

const LABEL_MIN_PX = 28, BUBBLE_UP_PX = 22;

/** 이름표·말풍선. names[i] = 몸 i 의 이름, sides[i] = 테두리 편 색(없으면 회색). update 의 show(i) 가 거짓인 몸은 둘 다 숨긴다. */
export function createTags(layer: HTMLElement, names: string[], sides: (0 | 1 | null)[], myId: number | null, V: () => Vector3) {
  const box = el('div', 'g3-labels', layer);
  box.setAttribute('aria-hidden', 'true');
  const labels = names.map((n, i) => {
    const e = el('span', `g3-label${i === myId ? ' is-me' : ''}`, box);
    e.textContent = n;
    const s = sides[i];
    e.style.borderColor = s === null ? 'var(--hairline-strong)' : TEAM[s].color;
    return { el: e, shown: false };
  });
  const bubbles = new Map<number, { el: HTMLSpanElement; shown: boolean }>();
  const vHead = V(), vFoot = V(), vCam = V();
  return {
    /** show(i) = 이름표를 보일 몸, bubble(i) = 말풍선을 띄울 몸(없으면 show 와 같다). */
    update(sc: TagScene, w: number, h: number, show: (i: number) => boolean, said: { id: number; text: string }[], bigOnly = true, bubble: (i: number) => boolean = show): void {
      const cam = sc.camera as unknown as import('three').PerspectiveCamera;
      const head = (i: number): { x: number; y: number; ok: boolean; big: boolean } => {
        const ahead = sc.headPoint(i, vCam).applyMatrix4(sc.camera.matrixWorldInverse).z < -0.3;
        sc.headPoint(i, vHead).project(cam);
        sc.footPoint(i, vFoot).project(cam);
        return { x: (vHead.x + 1) * 0.5 * w, y: (1 - vHead.y) * 0.5 * h, ok: ahead && vHead.z < 1 && vHead.z > -1, big: (vHead.y - vFoot.y) * 0.5 * h > LABEL_MIN_PX };
      };
      const heads = labels.map((_, i) => head(i));
      labels.forEach((L, i) => {
        const H = heads[i];
        const on = show(i) && H.ok && (!bigOnly || H.big);
        if (on !== L.shown) { L.el.classList.toggle('is-on', on); L.shown = on; }
        if (on) L.el.style.transform = `translate(${H.x.toFixed(1)}px, ${H.y.toFixed(1)}px) translate(-50%, -100%)`;
      });
      const live = new Set<number>();
      for (const b of said) {
        if (!(b.id >= 0 && b.id < labels.length)) continue;
        live.add(b.id);
        let B = bubbles.get(b.id);
        if (!B) { B = { el: el('span', 'g3-bubble', box), shown: false }; bubbles.set(b.id, B); }
        if (B.el.textContent !== b.text) B.el.textContent = b.text;
        const H = heads[b.id], on = bubble(b.id) && H.ok;
        if (on !== B.shown) { B.el.classList.toggle('is-on', on); B.shown = on; }
        if (on) B.el.style.transform = `translate(${H.x.toFixed(1)}px, ${(H.y - BUBBLE_UP_PX).toFixed(1)}px) translate(-50%, -100%)`;
      }
      for (const [id, B] of bubbles) if (!live.has(id) && B.shown) { B.el.classList.remove('is-on'); B.shown = false; }
    },
    dispose(): void { box.remove(); },
  };
}

export type TouchKey = 'shoot' | 'pass' | 'through' | 'lob' | 'sprint';
const TOUCH_CLS: Record<TouchKey, string> = { shoot: 'g3-shoot', pass: 'g3-pass', through: 'g3-small g3-through', lob: 'g3-small g3-lob', sprint: 'g3-small g3-sprint' };

/** 3D 터치 배치(조이스틱 + 버튼). keys = 이 게임에서 뜻이 있는 버튼만 보인다(나머지도 input3d 에 넘기려고 만들되 늘 숨긴다).
 *  처음 터치가 들어오거나 터치 기기면 보인다. setShown(false) 로 판정·끝에 숨긴다. setLabel 로 역할마다 글자를 바꾼다(승부차기: 슛 / 던지기). */
export function createTouch(layer: HTMLElement, keys: readonly TouchKey[], labels: Partial<Record<TouchKey, string>> = {}) {
  const base = el('div', 'g3-stick', layer);
  base.setAttribute('aria-hidden', 'true');
  const knob = el('div', 'g3-stick-knob', base);
  const all: TouchKey[] = ['pass', 'shoot', 'through', 'lob', 'sprint'];
  const DEF: Record<TouchKey, string> = { shoot: '슛', pass: '패스', through: '스루', lob: '로빙', sprint: '질주' };
  const btn = Object.fromEntries(all.map((k) => {
    const b = el('button', `g3-btn ${TOUCH_CLS[k]}`, layer);
    b.type = 'button'; b.textContent = labels[k] ?? DEF[k]; b.setAttribute('aria-label', labels[k] ?? DEF[k]);
    return [k, b];
  })) as Record<TouchKey, HTMLButtonElement>;
  let touch = !!window.matchMedia?.('(any-pointer: coarse)').matches, want = true, on = false;
  const paint = (): void => {
    const v = touch && want;
    if (v === on) return;
    on = v;
    for (const k of all) btn[k].classList.toggle('is-shown', v && keys.includes(k));
  };
  paint();   // 터치 기기면 처음부터 보인다
  return {
    base, knob, btn,
    onTouch: (): void => { touch = true; paint(); },
    get touch(): boolean { return touch; },
    setShown(v: boolean): void { want = v; paint(); },
    setLabel(k: TouchKey, text: string): void { if (btn[k].textContent !== text) { btn[k].textContent = text; btn[k].setAttribute('aria-label', text); } },
    dispose(): void { base.remove(); for (const k of all) btn[k].remove(); },
  };
}
