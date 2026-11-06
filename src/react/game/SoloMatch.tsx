// src/react/game/SoloMatch.tsx — 혼자 하기(1단계): 내 자리 하나 + 봇. 경기(전체 화면 오버레이) → 결과.
// 설계: docs/superpowers/specs/2026-11-06-game-design.md. 사용자 말: "헥스볼 같은 느낌", "PC 모바일 둘다 최적화", "팀원 없으면 봇 추가해서 가능해야지".
// 2026-11-07 게임 묶음 토대: 계산은 그 게임의 어댑터, 그리기·조작은 그 게임의 화면(GameView), 틀은 MatchFrame — 이 파일은 고정 틱 루프만 맡는다.
// 루프 규칙은 예전 그대로다: 숨겨진 동안·확인창 동안은 시계가 가지 않고, 한 프레임에 5틱까지 따라잡고, 소리는 틱마다, 끝나면 0.9초 뒤 결과.
// 혼자 하기의 입력은 양자화하지 않는다(사람·봇 모두 그대로) — 1단계부터 그랬다. 프레임마다 리액트 상태를 건드리지 않는다.
import { App, Button } from 'antd';
import { useRef, useState } from 'react';
import type { AnyAdapter } from '../../lib/games/adapter';
import type { Player } from '../../lib/types';
import { MatchOverlay, usePlaySurface, type Live, type ResultBox } from './MatchFrame';
import { MAX_CATCHUP, STEP_MS } from './net/common';
import { smootherFor } from './net/smooth';
import { play as playSfx } from './sfx';
import type { AnyView, SoloSetup } from './views/types';

/** 화면에 걸린 한 판 — make 를 다시 부르면 새 씨앗으로 같은 설정의 판(다시 하기). */
export type SoloRun = SoloSetup<unknown> & { key: number; game: string; make: () => SoloSetup<unknown>; roster: Player[] };

export function SoloMatch({ run, adapter, view, live, onRestart, onExit }: {
  run: SoloRun; adapter: AnyAdapter; view: AnyView;
  live: React.RefObject<Live>; onRestart: () => void; onExit: () => void;
}) {
  const { modal } = App.useApp();
  const paused = useRef(false);
  const [final, setFinal] = useState<unknown>(null);
  const { config, seed, myId, roster } = run;

  const { refs, touch } = usePlaySurface({
    view, config, roster, playing: true, live,
    run: ({ scene, readHuman }) => {
      const g = adapter, smooth = smootherFor(g.bodies);
      let state = g.create(config, seed);
      let prev = state;
      live.current.state = state; live.current.config = config; live.current.override = null; live.current.camera = null;

      /** 틱 하나의 입력을 모으는 유일한 자리 — 내 자리 = 키보드/터치(또는 디버그), 나머지 = 봇. */
      const collectInputs = (s: unknown): unknown[] => Array.from({ length: g.slots(config) }, (_, i) => {
        if (i !== myId) return g.botInput ? g.botInput(s, config, i) : g.idle;
        return readHuman ? readHuman() : g.idle;
      });

      let raf = 0, last = performance.now(), acc = 0, ended = false;
      let endTimer: ReturnType<typeof setTimeout> | undefined;
      const frame = (now: number): void => {
        raf = requestAnimationFrame(frame);
        const dt = now - last; last = now;
        if (document.hidden || paused.current) { acc = 0; return; }   // 숨겨진 동안은 시계가 가지 않는다
        if (!ended) {
          acc += Math.min(dt, MAX_CATCHUP * STEP_MS);
          let n = 0;
          while (acc >= STEP_MS && n < MAX_CATCHUP && !g.ended(state)) {
            const next = g.step(state, config, collectInputs(state));
            if (g.ended(next)) ended = true;
            for (const fx of view.sfx(state, next)) playSfx(fx);   // 효과음(2026-11-07) — 틱마다 상태 변화로 알아낸다
            prev = state; state = next; acc -= STEP_MS; n++;
          }
          if (n === MAX_CATCHUP) acc = 0;
          live.current.state = state;
          if (g.ended(state) && !ended) ended = true;
          if (ended) { const s = state; endTimer = setTimeout(() => setFinal(s), 900); }
        }
        const shown = ended ? state : smooth.lerp(prev, state, acc / STEP_MS);
        scene.draw({ state: shown, config, myId, bubbles: [] });
        live.current.camera = scene.camera();
      };
      raf = requestAnimationFrame(frame);

      const onVis = (): void => { last = performance.now(); acc = 0; };
      document.addEventListener('visibilitychange', onVis);
      return () => {
        cancelAnimationFrame(raf);
        if (endTimer) clearTimeout(endTimer);
        document.removeEventListener('visibilitychange', onVis);
        live.current.state = null; live.current.config = null; live.current.override = null; live.current.camera = null;
      };
    },
  });

  const confirmExit = (): void => {
    paused.current = true;
    modal.confirm({
      title: '경기를 그만할까요?', content: '지금까지 한 판은 저장되지 않습니다.', okText: '그만하기', cancelText: '계속',
      centered: true, onOk: onExit, afterClose: () => { paused.current = false; },
    });
  };

  const result: ResultBox | null = final === null ? null : {
    ...view.result(final, config, { myId, solo: true }),
    actions: (
      <div className="game-result-actions">
        <Button type="primary" size="large" onClick={onRestart}>다시 하기</Button>
        <Button size="large" onClick={onExit}>설정으로</Button>
      </div>
    ),
  };

  return <MatchOverlay refs={refs} xLabel="경기 나가기" onX={confirmExit} kickShown={touch && !result} result={result} />;
}
