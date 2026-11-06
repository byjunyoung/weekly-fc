// src/react/game3d/input3d.ts — 3D 시제품의 키보드·터치 → 화면 기준 입력(오른쪽 +x, 아래 +y). 경기장 방향으로 돌리는 건 부르는 쪽(view3d.stickToWorld).
// 2D 게임 input.ts 와 같은 방식이다(그 파일은 킥 버튼 하나라 가져다 쓰지 않고 버튼 둘로 다시 짰다):
//   PC — 2026-11-07 "3d 게임은 키를 FC온라인이랑 동일하게 해주면 좋을듯" — 키 자리만 그 관례를 따르고 이름·동작은 우리 것:
//        방향키 = 이동(WASD 는 이제 동작 키라 이동에서 뺐다), S = 패스, D = 슛(공 없을 땐 태클), W = 스루 패스, A = 로빙 패스, E = 질주.
//        전에 익힌 키도 남긴다 — 스페이스 = 슛, X = 패스, Shift = 질주(전엔 패스였다).
//   폰 — 왼쪽 절반 아무 데나 누르면 그 자리에 조이스틱, 오른쪽 아래 큰 버튼 둘(패스, 슛)과 작은 버튼 셋(스루, 로빙, 질주).
// 터치는 포인터 id 별로 따로 잡는다 — 왼손 조이스틱과 오른손 버튼이 동시에 눌려야 한다.

export type ScreenInput = { x: number; y: number; shoot: boolean; pass: boolean; through: boolean; lob: boolean; sprint: boolean };

export const STICK_MAX = 56;   // 조이스틱 최대 반지름(CSS px)
export const STICK_DEAD = 8;   // 데드존

/** 끌린 거리 → 크기 0~1 방향 벡터. 데드존 안은 0. */
export function stickVector(dx: number, dy: number, maxR = STICK_MAX, dead = STICK_DEAD): { x: number; y: number } {
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len <= dead) return { x: 0, y: 0 };
  const mag = Math.min(1, (len - dead) / (maxR - dead));
  return { x: (dx / len) * mag, y: (dy / len) * mag };
}

// 한 글자 키는 소문자로 — Shift 를 먼저 떼면 keyup 이 'A' 가 아니라 'a' 로 와서 눌림이 안 풀린다(2D 에서 겪은 것).
const LEFT = new Set(['ArrowLeft']);
const RIGHT = new Set(['ArrowRight']);
const UP = new Set(['ArrowUp']);
const DOWN = new Set(['ArrowDown']);
const SHOOT = new Set(['d', ' ']);
const PASS = new Set(['s', 'x']);
const THROUGH = new Set(['w']);
const LOB = new Set(['a']);
const SPRINT = new Set(['e', 'Shift']);
const GAME_KEYS = new Set([...LEFT, ...RIGHT, ...UP, ...DOWN, ...SHOOT, ...PASS, ...THROUGH, ...LOB, ...SPRINT]);

export function keysToInput(down: ReadonlySet<string>): ScreenInput {
  const any = (set: Set<string>): number => ([...set].some((k) => down.has(k)) ? 1 : 0);
  let x = any(RIGHT) - any(LEFT), y = any(DOWN) - any(UP);
  if (x && y) { x *= Math.SQRT1_2; y *= Math.SQRT1_2; }
  return { x, y, shoot: any(SHOOT) === 1, pass: any(PASS) === 1, through: any(THROUGH) === 1, lob: any(LOB) === 1, sprint: any(SPRINT) === 1 };
}

export type InputParts = {
  root: HTMLElement; base: HTMLElement; knob: HTMLElement;
  shootBtn: HTMLElement; passBtn: HTMLElement; throughBtn: HTMLElement; lobBtn: HTMLElement; sprintBtn: HTMLElement;
  /** 처음 터치가 들어오면 — 터치 버튼을 그제야 보이게(마우스 PC 에선 안 보임). */
  onTouch: () => void;
};
export type InputHandle = { read(): ScreenInput; dispose(): void };

export function attachInput(p: InputParts): InputHandle {
  const keys = new Set<string>();
  let stickId: number | null = null, ox = 0, oy = 0, sv = { x: 0, y: 0 };
  let shootId: number | null = null, passId: number | null = null, throughId: number | null = null, lobId: number | null = null, sprintId: number | null = null;
  const off: Array<() => void> = [];
  const onWin = <K extends keyof WindowEventMap>(e: K, f: (ev: WindowEventMap[K]) => void): void => { window.addEventListener(e, f); off.push(() => window.removeEventListener(e, f)); };
  const onEl = (t: HTMLElement, e: string, f: (ev: any) => void, o?: AddEventListenerOptions): void => { t.addEventListener(e, f, o); off.push(() => t.removeEventListener(e, f, o)); };

  const norm = (e: KeyboardEvent): string => (e.code === 'Space' ? ' ' : e.key.length === 1 ? e.key.toLowerCase() : e.key);
  onWin('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = norm(e);
    if (GAME_KEYS.has(k)) { e.preventDefault(); keys.add(k); }
  });
  onWin('keyup', (e) => { const k = norm(e); keys.delete(k); if (GAME_KEYS.has(k)) e.preventDefault(); });
  onWin('blur', () => keys.clear());   // 창이 포커스를 잃으면 뗀 걸 놓친다 — 계속 달리지 않게 비운다

  // 조이스틱(왼쪽 절반)
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
    const len = Math.sqrt(dx * dx + dy * dy), k = len > STICK_MAX ? STICK_MAX / len : 1;
    p.knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
  });
  const endStick = (e: PointerEvent): void => { if (e.pointerId === stickId) { stickId = null; sv = { x: 0, y: 0 }; p.base.classList.remove('is-on'); } };
  onEl(p.root, 'pointerup', endStick);
  onEl(p.root, 'pointercancel', endStick);

  // 버튼 둘 — 누르고 있는 동안 눌림. 손가락이 밖으로 미끄러져도 캡처로 계속 잡는다.
  const button = (el: HTMLElement, set: (id: number | null) => void, get: () => number | null): void => {
    onEl(el, 'pointerdown', (e: PointerEvent) => {
      e.preventDefault(); e.stopPropagation();
      p.onTouch();
      set(e.pointerId); el.classList.add('is-down');
      try { el.setPointerCapture(e.pointerId); } catch { /* 위와 같음 */ }
    });
    const end = (e: PointerEvent): void => { if (e.pointerId === get()) { set(null); el.classList.remove('is-down'); } };
    onEl(el, 'pointerup', end);
    onEl(el, 'pointercancel', end);
    onEl(el, 'lostpointercapture', end);
  };
  button(p.shootBtn, (id) => { shootId = id; }, () => shootId);
  button(p.passBtn, (id) => { passId = id; }, () => passId);
  button(p.throughBtn, (id) => { throughId = id; }, () => throughId);
  button(p.lobBtn, (id) => { lobId = id; }, () => lobId);
  button(p.sprintBtn, (id) => { sprintId = id; }, () => sprintId);

  // 스크롤·확대·길게 눌러 메뉴 막기. touchmove 는 passive:false 여야 preventDefault 가 먹는다(iOS).
  onEl(p.root, 'touchmove', (e: Event) => e.preventDefault(), { passive: false });
  onEl(p.root, 'touchstart', (e: Event) => { if (!(e.target as HTMLElement).closest('button')) e.preventDefault(); }, { passive: false });
  onEl(p.root, 'contextmenu', (e: Event) => e.preventDefault());
  onEl(p.root, 'gesturestart', (e: Event) => e.preventDefault());
  onEl(p.root, 'dblclick', (e: Event) => e.preventDefault());

  return {
    read() {
      const k = keysToInput(keys);
      const useStick = sv.x * sv.x + sv.y * sv.y > k.x * k.x + k.y * k.y;
      return {
        x: useStick ? sv.x : k.x, y: useStick ? sv.y : k.y, shoot: k.shoot || shootId !== null, pass: k.pass || passId !== null,
        through: k.through || throughId !== null, lob: k.lob || lobId !== null, sprint: k.sprint || sprintId !== null,
      };
    },
    dispose() { off.forEach((f) => f()); off.length = 0; keys.clear(); },
  };
}
