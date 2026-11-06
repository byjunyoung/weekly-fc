// src/react/game/SoloMatch.tsx — 혼자 연습(1단계): 내 선수 + 봇. 설정 → 경기(전체 화면 오버레이) → 결과.
// 설계: docs/superpowers/specs/2026-11-06-game-design.md. 1단계 GameApp 에 있던 경기 화면을 그대로 옮겼다(동작 같음) —
// 2단계에서 GameApp 이 입장·방·온라인 경기까지 맡게 되면서 파일을 나눴다.
// 사용자 말: "헥스볼 같은 느낌", "PC 모바일 둘다 최적화", "팀원 없으면 봇 추가해서 가능해야지".
// 프레임마다 리액트 상태를 건드리지 않는다 — 그리기는 캔버스에 직접, 리액트 상태는 화면 전환·결과·터치 여부뿐.
import { App, Button } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { botInput } from '../../lib/game/bot';
import { fieldFor, type FieldChoice } from '../../lib/game/room';
import { createMatch, eventsBetween, pitchOf, sideCounts, step, TICK_HZ, type Input, type MatchConfig, type MatchPlayer, type MatchState } from '../../lib/game/sim';
import { perfOf } from '../../lib/game/stats';
import type { Player } from '../../lib/types';
import { attachInput } from './input';
import { blend, buildField, buildSprites, drawFrame, fieldKey, HUD_H, TEAM, type Field } from './render';
import { detectSfx } from './sfx-detect';
import { play as playSfx } from './sfx';
import SoundToggle from './SoundToggle';
import { readInsets } from './stage';
import { aimCamera, clockText, makeView, pickLineup, rngFrom, stickToSim, type View } from './view';

const STEP_MS = 1000 / TICK_HZ;
const MAX_CATCHUP = 5;                     // 한 프레임에 따라잡는 최대 틱 — 느린 기기가 계산에 먹혀 더 느려지는 걸 막는다

/** 혼자 연습 설정 — 인원 1대1~6대6, 경기장 자동/작게/보통/크게/아주 크게(2026-11-07). */
/** botPicks = 우리 편·상대 봇으로 고른 선수(차례대로, 비면 무작위) — "그리고 봇도 선수를 고를 수 있게 해줘". */
export type Req = { num: number; perSide: 1 | 2 | 3 | 4 | 5 | 6; minutes: number; scoreLimit: number; field: FieldChoice; botPicks?: [number[], number[]] };
export type MatchSetup = { key: number; req: Req; config: MatchConfig; seed: number; humanId: number; roster: Player[] };

/** 지금 화면의 카메라(디버그 훅 getView 용). */
export type Camera = { cx: number; cy: number; scale: number; follow: boolean };
/** 디버그 훅(?debug=1)과 경기 화면이 나눠 쓰는 살아 있는 값. 리액트 상태가 아니다. camera 는 혼자·온라인 경기 화면이 프레임마다 써 둔다. */
export type Live = { state: MatchState | null; config: MatchConfig | null; override: Input | null; camera: Camera | null };

/** 그린 view → 디버그용 카메라 값. */
export const cameraOf = (v: View): Camera => ({ cx: v.cx, cy: v.cy, scale: v.scale, follow: v.follow });

/** "3대3"·"4대2" — 두 편 인원이 달라도 된다. */
export function sidesText(config: MatchConfig): string {
  const [a, b] = sideCounts(config);
  return `${a}대${b}`;
}

/** 설정 → 경기. 씨앗은 여기(화면 쪽 시계)에서 만든다 — 계산 코드는 시계·난수를 모른다. */
export function buildSoloMatch(req: Req, roster: Player[], key: number): MatchSetup {
  const seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
  const lineup = pickLineup(roster.map((p) => p.num), req.num, req.perSide, rngFrom(seed ^ 0x9e3779b9), req.botPicks);
  const players: MatchPlayer[] = lineup.map((l, id) => {
    const p = roster.find((r) => r.num === l.num) as Player;
    return { id, num: l.num, name: p.name, side: l.side, bot: !l.human, perf: perfOf(p, roster) };
  });
  const field = req.field === 'auto' ? fieldFor(req.perSide * 2) : req.field;
  const config: MatchConfig = { field, minutes: req.minutes, scoreLimit: req.scoreLimit, players };
  return { key, req, config, seed, humanId: lineup.findIndex((l) => l.human), roster };
}

// ── 경기 화면 ──
export function SoloMatch({ setup, live, onRestart, onExit }: { setup: MatchSetup; live: React.MutableRefObject<Live>; onRestart: () => void; onExit: () => void }) {
  const { modal } = App.useApp();
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const baseRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const kickRef = useRef<HTMLButtonElement>(null);
  const paused = useRef(false);
  const [touch, setTouch] = useState(false);
  const [result, setResult] = useState<{ score: [number, number]; winner: 0 | 1 | 'draw' } | null>(null);
  const { config, seed, humanId, roster } = setup;

  useEffect(() => {
    const root = rootRef.current, canvas = canvasRef.current;
    if (!root || !canvas || !baseRef.current || !knobRef.current || !kickRef.current) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    // 페이지 스크롤 잠금(CSS 클래스) — 경기 중 배경이 밀리지 않게.
    document.documentElement.classList.add('game-lock');
    if (window.matchMedia?.('(any-pointer: coarse)').matches) setTouch(true);

    const input = attachInput({ root, base: baseRef.current, knob: knobRef.current, kickBtn: kickRef.current, onTouch: () => setTouch(true) });
    const sprites = buildSprites(config, roster);   // 동기 — 첫 프레임부터 얼굴이 있다

    let state = createMatch(config, seed);
    let prev = state;
    live.current.state = state; live.current.config = config; live.current.override = null; live.current.camera = null;

    const pitch = pitchOf(config.field);
    let view: View, field: Field, dpr = 1, topInset = 0;
    const layout = (): void => {
      const vw = root.clientWidth, vh = root.clientHeight;
      if (!vw || !vh) return;
      dpr = Math.min(window.devicePixelRatio || 1, 3);
      canvas.width = Math.round(vw * dpr); canvas.height = Math.round(vh * dpr);
      const ins = readInsets();
      topInset = ins.top;
      view = makeView(vw, vh, { margin: Math.max(8, ins.left, ins.right), top: ins.top + HUD_H, bottom: ins.bottom, pitch });
      if (!field || field.key !== fieldKey(view, dpr, pitch)) field = buildField(view, dpr, pitch);
    };
    layout();
    const ro = new ResizeObserver(layout);
    ro.observe(root);
    window.addEventListener('orientationchange', layout);

    /** 틱 하나의 입력을 모으는 유일한 자리. 지금은 사람=키보드/터치(또는 디버그), 나머지=봇.
     *  2단계에선 이 함수만 원격 입력을 받아 채우도록 바뀐다. */
    const collectInputs = (s: MatchState): Input[] => config.players.map((p) => {
      if (p.id !== humanId) return botInput(s, config, p.id);
      if (live.current.override) return live.current.override;
      const h = input.read();
      const d = stickToSim(view, h.x, h.y);   // 화면 기준 → 시뮬레이션 기준(세로 화면이면 돌린다)
      return { x: d.x, y: d.y, kick: h.kick };
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
        while (acc >= STEP_MS && n < MAX_CATCHUP && state.phase !== 'end') {
          const next = step(state, config, collectInputs(state));
          for (const ev of eventsBetween(state, next)) {
            if (ev.type === 'end') ended = true;
          }
          for (const fx of detectSfx(state, next)) playSfx(fx);   // 효과음(2026-11-07) — 틱마다 상태 변화로 알아낸다
          prev = state; state = next; acc -= STEP_MS; n++;
        }
        if (n === MAX_CATCHUP) acc = 0;
        live.current.state = state;
        if (state.phase === 'end' && !ended) ended = true;
        if (ended) endTimer = setTimeout(() => setResult({ score: state.score, winner: (state.winner ?? 'draw') as 0 | 1 | 'draw' }), 900);
      }
      const shown = ended ? state : blend(prev, state, acc / STEP_MS);
      // 큰 경기장이면 화면이 내 선수를 따라간다(스펙 2026-11-07 §2). 스틱은 그래도 "화면 방향"이다(stickToSim 은 돌리기만 한다).
      const me = shown.players[humanId];
      const cam = me ? aimCamera(view, me) : view;
      live.current.camera = cameraOf(cam);
      drawFrame(ctx, shown, config, cam, field, sprites, { dpr, topInset, humanId });
    };
    raf = requestAnimationFrame(frame);

    const onVis = (): void => { last = performance.now(); acc = 0; };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      cancelAnimationFrame(raf);
      if (endTimer) clearTimeout(endTimer);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('orientationchange', layout);
      ro.disconnect();
      input.dispose();
      document.documentElement.classList.remove('game-lock');
      live.current.state = null; live.current.config = null; live.current.override = null; live.current.camera = null;
    };
    // 경기마다 새로 마운트(key)되므로 setup 이 바뀌는 일은 없다.
  }, [config, seed, humanId, roster, live]);

  const confirmExit = (): void => {
    paused.current = true;
    modal.confirm({
      title: '경기를 그만할까요?', content: '지금까지 한 판은 저장되지 않습니다.', okText: '그만하기', cancelText: '계속',
      centered: true, onOk: onExit, afterClose: () => { paused.current = false; },
    });
  };

  const outcome = result ? (result.winner === 'draw' ? '무승부' : result.winner === 0 ? '승' : '패') : '';   // 사람은 늘 0 편

  return (
    <div className="game-overlay" ref={rootRef}>
      <canvas ref={canvasRef} className="game-canvas" />
      {!result && <button type="button" className="game-x" aria-label="경기 나가기" onClick={confirmExit}>✕</button>}
      {!result && <SoundToggle />}
      <div className="game-stick" ref={baseRef} aria-hidden="true"><div className="game-stick-knob" ref={knobRef} /></div>
      <button type="button" ref={kickRef} className={`game-kick${touch && !result ? ' is-shown' : ''}`} aria-label="킥">킥</button>
      {result && (
        <div className="game-result" role="dialog" aria-label="경기 결과">
          <div className="game-result-box">
            <b className={`game-outcome is-${outcome === '승' ? 'win' : outcome === '패' ? 'lose' : 'draw'}`}>{outcome === '무승부' ? outcome : `${outcome}!`}</b>
            <div className="game-final">
              <span style={{ color: TEAM[0].color }}>{TEAM[0].short}</span> {result.score[0]} : {result.score[1]} <span style={{ color: TEAM[1].color }}>{TEAM[1].short}</span>
            </div>
            <p className="muted">{clockText(config.minutes * 60)} 경기 · {sidesText(config)}</p>
            <div className="game-result-actions">
              <Button type="primary" size="large" onClick={onRestart}>다시 하기</Button>
              <Button size="large" onClick={onExit}>설정으로</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
