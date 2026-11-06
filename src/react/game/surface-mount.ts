// src/react/game/surface-mount.ts — 그림판을 스스로 여닫는 화면(3D)을 여는 순서(2026-11-07 게임 묶음 4단계). 리액트를 모른다 — node 테스트가 가짜 화면으로 돌린다.
// MatchFrame.usePlaySurface 에 있던 것을 꺼냈다: 묶음 받기(load, 늦게 끝날 수 있다) → 만들기(create) → 크기 → 루프 시작(run) → 닫기.
// 지키는 선: 루프(run)는 한 번만 시작한다. 받기가 끝나기 전에 닫히면 만들지도 시작하지도 않는다. 닫으면 루프를 먼저 멈추고 그림판을 닫는다.
import type { Scene, Surface, SurfaceIn, SurfaceKit } from './views/types';

/** 스스로 여닫는 화면(Surface)을 루프가 쓰는 Scene 모양으로 — 루프(혼자·온라인)는 그대로 scene.draw 만 부른다. dt 는 여기서 잰다. */
export function sceneOf(sf: Surface<unknown, unknown, unknown>, now: () => number = () => performance.now()): Scene<unknown, unknown, unknown> {
  let last = -1;
  return {
    draw(f) {
      const t = now();
      const dt = last < 0 ? 0 : Math.min(0.25, (t - last) / 1000);
      last = t;
      sf.render({ ...f, dt });
    },
    toInput: () => (sf.readInput ? sf.readInput() : null),
    camera: () => sf.camera(),
    act: (id) => sf.act?.(id),
    dispose: () => sf.dispose(),
  };
}

export type MountHooks = {
  /** 받는 중(true) / 끝(false). */
  onWait(w: boolean): void;
  /** 못 열었다 — 사람에게 보일 이유. */
  onFail(why: string): void;
  /** 루프 시작 — 멈추는 함수를 돌려준다. readHuman = 이 화면의 조작(구경이면 null). */
  run(c: { scene: Scene<unknown, unknown, unknown>; readHuman: (() => unknown) | null; surface: Surface<unknown, unknown, unknown> }): () => void;
  /** 크기 바뀜 구독(브라우저: ResizeObserver + orientationchange). 떼는 함수를 돌려준다. */
  watchSize(root: HTMLElement, cb: () => void): () => void;
};

/** 연다. 돌려주는 함수가 닫는다(받는 중이면 받은 뒤 아무것도 안 한다). */
export function mountSurface(kit: SurfaceKit<unknown, unknown, unknown>, o: SurfaceIn<unknown>, h: MountHooks): () => void {
  let alive = true, stop: (() => void) | null = null;
  h.onWait(true);
  kit.load().then(() => {
    if (!alive) return;
    h.onWait(false);
    const sf = kit.create(o);
    if (typeof sf === 'string') { h.onFail(sf); return; }
    const scene = sceneOf(sf);
    const resize = (): void => { if (o.root.clientWidth && o.root.clientHeight) sf.resize(o.root.clientWidth, o.root.clientHeight); };
    resize();
    const unwatch = h.watchSize(o.root, resize);
    const reader = sf.readInput;
    const end = h.run({ scene, readHuman: o.playing && reader ? reader : null, surface: sf });
    stop = () => { end(); unwatch(); scene.dispose(); };
  }).catch(() => { if (alive) { h.onWait(false); h.onFail('화면을 불러오지 못했습니다 — 연결을 확인하고 다시 열어 주세요.'); } });
  return () => { alive = false; const s = stop; stop = null; s?.(); };
}
