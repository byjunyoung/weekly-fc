// src/react/game/input.ts — 키보드·터치 → 화면 기준 입력(위가 -y). 시뮬레이션 방향으로 돌리는 건 부르는 쪽(view.stickToSim).
// 2단계(온라인)에선 이 모듈은 그대로 두고 "입력이 어디서 오나"만 GameApp 의 한 함수에서 바뀐다.
// 터치는 포인터 이벤트를 id 별로 따로 추적한다 — 왼손 조이스틱과 오른손 킥 버튼이 동시에 눌려야 해서.

export type ScreenInput = { x: number; y: number; kick: boolean };

/** 조이스틱 최대 반지름·데드존(CSS px). 손가락이 이보다 멀리 가도 손잡이는 반지름에 붙는다. */
export const STICK_MAX = 56;
export const STICK_DEAD = 8;

/** 끌린 거리(dx,dy) → 크기 0~1 의 방향 벡터. 데드존 안은 0, 그 밖은 0에서 1로 부드럽게 올라간다. */
export function stickVector(dx: number, dy: number, maxR = STICK_MAX, dead = STICK_DEAD): { x: number; y: number } {
  const len = Math.hypot(dx, dy);
  if (len <= dead) return { x: 0, y: 0 };
  const mag = Math.min(1, (len - dead) / (maxR - dead));
  return { x: (dx / len) * mag, y: (dy / len) * mag };
}

// 키 이름은 한 글자면 소문자로 통일한다 — Shift 를 먼저 떼면 keyup 이 다른 글자('A' → 'a')로 와서 눌림이 안 풀린다.
const LEFT = new Set(['ArrowLeft', 'a']);
const RIGHT = new Set(['ArrowRight', 'd']);
const UP = new Set(['ArrowUp', 'w']);
const DOWN = new Set(['ArrowDown', 's']);
const KICK = new Set([' ', 'x', 'Shift']);   // Shift 도 킥(2026-11-07 "슛키 스페이스바 말고도 쉬프트도")
const GAME_KEYS = new Set([...LEFT, ...RIGHT, ...UP, ...DOWN, ...KICK]);

/** 눌린 키 집합 → 방향(대각선은 길이 1로 맞춘다 — 안 하면 대각선이 41% 빠르다)과 킥. */
export function keysToInput(down: ReadonlySet<string>): ScreenInput {
  const any = (set: Set<string>): number => ([...set].some((k) => down.has(k)) ? 1 : 0);
  let x = any(RIGHT) - any(LEFT), y = any(DOWN) - any(UP);
  if (x && y) { x *= Math.SQRT1_2; y *= Math.SQRT1_2; }
  return { x, y, kick: any(KICK) === 1 };
}

export type InputParts = {
  /** 터치 이벤트를 받는 바깥 요소(전체 화면 오버레이). */
  root: HTMLElement;
  base: HTMLElement;   // 조이스틱 바닥
  knob: HTMLElement;   // 조이스틱 손잡이
  kickBtn: HTMLElement;
  /** 처음 터치가 들어오면 불린다 — 터치 컨트롤을 그제야 보이게(마우스 PC 에선 안 보임). */
  onTouch: () => void;
};

export type InputHandle = { read(): ScreenInput; dispose(): void };

/** 키보드·터치 리스너를 달고 읽기 함수를 돌려준다. dispose 가 전부 뗀다. */
export function attachInput(p: InputParts): InputHandle {
  const keys = new Set<string>();
  let stickId: number | null = null, ox = 0, oy = 0, sv = { x: 0, y: 0 };
  let kickId: number | null = null;
  const off: Array<() => void> = [];
  const on = <K extends keyof WindowEventMap>(t: Window, e: K, f: (ev: WindowEventMap[K]) => void, o?: AddEventListenerOptions): void => { t.addEventListener(e, f, o); off.push(() => t.removeEventListener(e, f, o)); };
  const onEl = (t: HTMLElement, e: string, f: (ev: any) => void, o?: AddEventListenerOptions): void => { t.addEventListener(e, f, o); off.push(() => t.removeEventListener(e, f, o)); };

  // 키보드 — 방향·스페이스가 페이지를 스크롤하지 않게 막는다. 창이 포커스를 잃으면 눌림을 비운다(키 뗌을 놓치면 계속 달린다).
  const norm = (e: KeyboardEvent): string => (e.code === 'Space' ? ' ' : e.key.length === 1 ? e.key.toLowerCase() : e.key);
  on(window, 'keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = norm(e);
    if (GAME_KEYS.has(k)) { e.preventDefault(); keys.add(k); }
  });
  on(window, 'keyup', (e) => { const k = norm(e); keys.delete(k); if (GAME_KEYS.has(k)) e.preventDefault(); });
  on(window, 'blur', () => keys.clear());

  // 터치 — 조이스틱(왼쪽 절반 아무 데나)
  const hideStick = (): void => { p.base.classList.remove('is-on'); sv = { x: 0, y: 0 }; };
  onEl(p.root, 'pointerdown', (e: PointerEvent) => {
    if (e.pointerType === 'mouse') return;
    p.onTouch();
    if (stickId !== null) return;
    if ((e.target as HTMLElement).closest('button')) return;
    if (e.clientX >= p.root.clientWidth / 2) return;
    stickId = e.pointerId; ox = e.clientX; oy = e.clientY;
    p.base.style.transform = `translate(${ox}px, ${oy}px)`;
    p.knob.style.transform = 'translate(0px, 0px)';
    p.base.classList.add('is-on');
    try { p.root.setPointerCapture(e.pointerId); } catch { /* 일부 웹뷰는 캡처를 못 한다 — 이벤트는 그래도 온다 */ }
  });
  onEl(p.root, 'pointermove', (e: PointerEvent) => {
    if (e.pointerId !== stickId) return;
    const dx = e.clientX - ox, dy = e.clientY - oy;
    sv = stickVector(dx, dy);
    const len = Math.hypot(dx, dy), k = len > STICK_MAX ? STICK_MAX / len : 1;
    p.knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
  });
  const endStick = (e: PointerEvent): void => { if (e.pointerId === stickId) { stickId = null; hideStick(); } };
  onEl(p.root, 'pointerup', endStick);
  onEl(p.root, 'pointercancel', endStick);

  // 킥 버튼 — 누르고 있는 동안 킥. 손가락이 밖으로 미끄러져도 캡처로 계속 잡는다.
  onEl(p.kickBtn, 'pointerdown', (e: PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    p.onTouch();
    kickId = e.pointerId; p.kickBtn.classList.add('is-down');
    try { p.kickBtn.setPointerCapture(e.pointerId); } catch { /* 위와 같음 */ }
  });
  const endKick = (e: PointerEvent): void => { if (e.pointerId === kickId) { kickId = null; p.kickBtn.classList.remove('is-down'); } };
  onEl(p.kickBtn, 'pointerup', endKick);
  onEl(p.kickBtn, 'pointercancel', endKick);
  onEl(p.kickBtn, 'lostpointercapture', endKick);

  // 스크롤·확대·길게 눌러 메뉴 막기. touchmove 는 passive:false 여야 preventDefault 가 먹는다(iOS).
  onEl(p.root, 'touchmove', (e: Event) => e.preventDefault(), { passive: false });
  onEl(p.root, 'touchstart', (e: Event) => { if (!(e.target as HTMLElement).closest('button')) e.preventDefault(); }, { passive: false });
  onEl(p.root, 'contextmenu', (e: Event) => e.preventDefault());
  onEl(p.root, 'gesturestart', (e: Event) => e.preventDefault());   // iOS 핀치
  onEl(p.root, 'dblclick', (e: Event) => e.preventDefault());

  return {
    read() {
      const k = keysToInput(keys);
      // 키보드와 터치가 같이 있으면 더 큰 쪽(보통 하나만 쓴다)
      const useStick = Math.hypot(sv.x, sv.y) > Math.hypot(k.x, k.y);
      return { x: useStick ? sv.x : k.x, y: useStick ? sv.y : k.y, kick: k.kick || kickId !== null };
    },
    dispose() { off.forEach((f) => f()); off.length = 0; keys.clear(); },
  };
}
