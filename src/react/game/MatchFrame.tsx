// src/react/game/MatchFrame.tsx — 경기 화면 틀(2026-11-07 게임 묶음 토대). 혼자·온라인, 어느 게임이든 같은 틀에 그 게임의 화면(GameView)을 끼운다.
// 설계: docs/superpowers/specs/2026-11-07-games-program-design.md §2 — "경기 화면 틀(전체 화면 오버레이·✕·소리·한마디·끊김 안내·결과)은 공용."
// SoloMatch·OnlineMatch 에 겹쳐 있던 마크업과 준비(스크롤 잠금·터치 감지·조이스틱/킥 달기·장면 열고 닫기)를 그대로 모았다 — 모양·클래스·순서 같음.
// 사용자: "PC 모바일 둘다 최적화". 한마디 버튼은 왼쪽 위 — 조이스틱(왼쪽 절반 아래)과 킥(오른쪽 아래)을 피한 자리.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { PHRASES } from '../../lib/games/net';
import { attachInput } from './input';
import SoundToggle from './SoundToggle';
import { mountSurface } from './surface-mount';
import type { AnyView, Camera, ResultView, Scene } from './views/types';

/** 디버그 훅(?debug=1)과 경기 화면이 나눠 쓰는 살아 있는 값. 리액트 상태가 아니다. camera 는 경기 화면이 프레임마다 써 둔다.
 *  state·config 는 혼자 하기에서만(온라인은 세션이 들고 있다), override = 내 입력 덮어쓰기(그 게임의 입력 모양).
 *  extra = 스스로 여닫는 화면(Surface.debug)이 내놓은 디버그 도구, patch = 혼자 하기에서 다음 틱 전에 상태를 한 번 바꾸기(디버그 전용 — 2026-11-07 4단계). */
export type Live = {
  state: unknown; config: unknown; override: unknown; camera: Camera | null;
  extra?: Record<string, unknown> | null; patch?: ((s: unknown) => unknown) | null;
};

type Refs = {
  root: React.RefObject<HTMLDivElement | null>; canvas: React.RefObject<HTMLCanvasElement | null>;
  base: React.RefObject<HTMLDivElement | null>; knob: React.RefObject<HTMLDivElement | null>; kick: React.RefObject<HTMLButtonElement | null>;
  layer: React.RefObject<HTMLDivElement | null>;
};

/** 장면을 열고 조작을 단 뒤 run(루프)을 돌린다. 한 판 동안 한 번(부르는 쪽이 경기마다 key 로 새로 마운트한다).
 *  playing 이 거짓(구경)이면 조작을 달지 않는다 — 키·터치를 먹지 않게. readHuman = 디버그 덮어쓰기 > 화면 조작을 그 게임 입력으로. */
export function usePlaySurface(o: {
  view: AnyView; config: unknown; roster: Parameters<AnyView['mount']>[0]['roster']; playing: boolean;
  live: React.RefObject<Live>;
  run: (c: { scene: Scene<unknown, unknown, unknown>; readHuman: (() => unknown) | null }) => () => void;
  /** 내 자리(구경이면 null) — 스스로 여닫는 화면이 내 선수 표시·1인칭에 쓴다. 2D 는 프레임마다 받는다. */
  myId?: number | null;
}): { refs: Refs; touch: boolean; wait: boolean; fail: string | null } {
  const refs: Refs = { root: useRef(null), canvas: useRef(null), base: useRef(null), knob: useRef(null), kick: useRef(null), layer: useRef(null) };
  const [touch, setTouch] = useState(false);
  const [wait, setWait] = useState(false);
  const [fail, setFail] = useState<string | null>(null);
  const { view, playing, live, run } = o;
  // 한 판의 설정·명단·내 자리는 처음 받은 것으로 고정한다(2026-11-07 4단계 리뷰). 명단(useData)은 캐시 다음 네트워크 것으로,
  // 또 다른 화면이 새로 불러올 때마다 새 배열이 된다 — 그걸 효과의 의존으로 두면 경기 중에 장면을 닫았다 다시 열어
  // 혼자 하기는 새 판(틱 0)으로 돌아가고, 3D 는 이미 문맥을 잃은 캔버스에 WebGL 을 다시 열려 한다. 판이 바뀌면 부르는 쪽이 key 로 새로 마운트한다.
  const fixed = useRef<{ config: unknown; roster: typeof o.roster; myId: number | null } | null>(null);
  if (fixed.current === null && o.config != null) fixed.current = { config: o.config, roster: o.roster, myId: o.myId ?? null };
  const ready = fixed.current !== null;
  const runRef = useRef(run);
  runRef.current = run;
  useEffect(() => {
    const root = refs.root.current, canvas = refs.canvas.current, layer = refs.layer.current;
    const f = fixed.current;
    if (!f || !root || !canvas || !layer || !refs.base.current || !refs.knob.current || !refs.kick.current) return;
    const { config, roster, myId } = f;
    // 스스로 여닫는 화면(3D) — 묶음을 받고(그동안 "불러오는 중"), 만들고, 크기를 대 주고, 조작은 화면 것을 쓴다(2D 조이스틱·킥은 달지 않는다).
    const kit = view.surface;
    if (kit) {
      document.documentElement.classList.add('game-lock');
      const close = mountSurface(kit, { root, canvas, layer, config, roster, myId, playing }, {
        onWait: setWait,
        onFail: setFail,
        watchSize(el, cb) {
          const ro = new ResizeObserver(cb);
          ro.observe(el);
          window.addEventListener('orientationchange', cb);
          return () => { ro.disconnect(); window.removeEventListener('orientationchange', cb); };
        },
        run({ scene, readHuman, surface }) {
          live.current.extra = surface.debug ? surface.debug() : null;
          const human = readHuman ? (): unknown => live.current.override ?? readHuman() : null;
          const end = runRef.current({ scene, readHuman: human });
          return () => { end(); live.current.extra = null; };
        },
      });
      return () => {
        close();
        document.documentElement.classList.remove('game-lock');
        live.current.camera = null;
      };
    }
    const scene = view.mount({ root, canvas, config, roster });
    if (!scene) return;
    // 페이지 스크롤 잠금(CSS 클래스) — 경기 중 배경이 밀리지 않게.
    document.documentElement.classList.add('game-lock');
    if (playing && window.matchMedia?.('(any-pointer: coarse)').matches) setTouch(true);
    const input = playing ? attachInput({ root, base: refs.base.current, knob: refs.knob.current, kickBtn: refs.kick.current, onTouch: () => setTouch(true) }) : null;
    const readHuman = input ? (): unknown => live.current.override ?? scene.toInput(input.read()) : null;
    const stop = runRef.current({ scene, readHuman });
    return () => {
      stop();
      input?.dispose();
      scene.dispose();
      document.documentElement.classList.remove('game-lock');
      live.current.camera = null;
    };
    // 경기마다 새로 마운트(key)되므로 한 판 동안 view·config·playing 은 그대로다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, ready, playing, live]);
  return { refs, touch, wait, fail };
}

/** 결과 상자 아래 버튼·안내(혼자: 다시 하기/설정으로, 방장: 바로 방으로, 손님: 잠시 뒤 안내). */
export type ResultBox = ResultView & { actions: ReactNode };

export function MatchOverlay({ refs, xLabel, onX, say, watching, banner, kickShown, result, wait, fail, actions }: {
  refs: Refs;
  xLabel: string; onX: () => void;
  /** 한마디(온라인에서 뛰는 사람만). 없으면 버튼이 없다. */
  say?: (k: number) => void;
  /** 구경 중 표시. */
  watching?: boolean;
  /** 끊김·방장 자리 비움 같은 띠 글. */
  banner?: string | null;
  kickShown: boolean;
  result: ResultBox | null;
  /** 화면 묶음을 받는 중(스스로 여닫는 화면 — 3D). */
  wait?: boolean;
  /** 화면을 못 열었다(WebGL 없음 등) — 이유 글. ✕ 로 나간다. */
  fail?: string | null;
  /** 게임 버튼(GameView.actions 중 이 사람에게 보일 것). 없으면 안 그린다. */
  actions?: { id: string; label: string; onClick: () => void }[];
}) {
  const [sayOpen, setSayOpen] = useState(false);
  const pick = (k: number): void => { say?.(k); setSayOpen(false); };
  return (
    <div className="game-overlay" ref={refs.root}>
      <canvas ref={refs.canvas} className="game-canvas" />
      {/* 화면이 직접 다는 DOM 층(3D 의 점수판·이름표·말풍선·버튼) — ✕·한마디·결과보다 아래 */}
      <div className="game-layer" ref={refs.layer} />
      {!result && <button type="button" className="game-x" aria-label={xLabel} onClick={onX}>✕</button>}
      {!result && <SoundToggle />}
      {!result && say && (
        <div className="game-say">
          <button type="button" className="game-say-btn" aria-expanded={sayOpen} aria-label="한마디" onClick={() => setSayOpen((v) => !v)}>한마디</button>
          {sayOpen && (
            <div className="game-say-menu" role="menu">
              {PHRASES.map((p, k) => (
                <button type="button" role="menuitem" key={p} onClick={() => pick(k)}><span className="muted">{k + 1}</span> {p}</button>
              ))}
            </div>
          )}
        </div>
      )}
      {!result && watching && <div className="game-watch" role="status">구경 중</div>}
      {!result && banner && <div className="game-banner" role="status">{banner}</div>}
      {!result && !banner && wait && <div className="game-banner" role="status">화면을 불러오는 중…</div>}
      {!result && fail && <div className="game-banner" role="alert">{fail} 2D 게임은 그대로 할 수 있습니다.</div>}
      {!result && actions && actions.length > 0 && (
        <div className="game-acts">
          {/* 마우스로 눌러도 포커스를 가져가지 않는다 — 스페이스(킥)가 이 버튼을 다시 누르지 않게. */}
          {actions.map((a) => <button type="button" key={a.id} className="game-act" onMouseDown={(e) => e.preventDefault()} onClick={a.onClick}>{a.label}</button>)}
        </div>
      )}
      <div className="game-stick" ref={refs.base} aria-hidden="true"><div className="game-stick-knob" ref={refs.knob} /></div>
      <button type="button" ref={refs.kick} className={`game-kick${kickShown ? ' is-shown' : ''}`} aria-label="킥">킥</button>
      {result && (
        <div className="game-result" role="dialog" aria-label="경기 결과">
          <div className="game-result-box">
            <b className={`game-outcome is-${result.tone}`}>{result.outcome}</b>
            <div className="game-final">{result.score}</div>
            {result.detail}
            <p className="muted">{result.sub}</p>
            {result.actions}
          </div>
        </div>
      )}
    </div>
  );
}
