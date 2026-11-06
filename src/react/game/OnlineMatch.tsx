// src/react/game/OnlineMatch.tsx — 온라인 경기 화면. 1단계 경기 화면(캔버스·점수판·조작)을 그대로 쓰고, 계산은 세션이 한다.
// 설계: docs/superpowers/specs/2026-11-06-game-online-design.md §3
// 사용자: "PC 모바일 둘다 최적화". 한마디 버튼은 왼쪽 위 — 조이스틱(왼쪽 절반 아래)과 킥(오른쪽 아래)을 피한 자리, PC 는 숫자 1~6.
// 프레임마다 리액트 상태를 건드리지 않는다: rAF 가 세션의 advance/frame 을 부르고 캔버스에 직접 그린다.
// 리액트 상태는 세션 view(바뀔 때만 새 객체), 한마디 메뉴 열림, 터치 여부뿐.
import { App, Button } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { PHRASES } from '../../lib/game/net';
import type { Input } from '../../lib/game/sim';
import type { Player } from '../../lib/types';
import { attachInput } from './input';
import type { GuestSession, HostSession, SessionView } from './net/session';
import { connText } from './Lobby';
import { buildSprites, drawBubbles, drawFrame, TEAM } from './render';
import { attachStage } from './stage';
import { clockText, stickToSim } from './view';

export function OnlineMatch({ session, view, roster, readOverride, onLeaveRoom }: {
  session: HostSession | GuestSession; view: SessionView; roster: Player[];
  /** 디버그 훅(?debug=1)의 입력 덮어쓰기 — 있으면 키보드·터치 대신 이걸 쓴다. */
  readOverride: () => Input | null;
  onLeaveRoom: () => void;
}) {
  const { modal } = App.useApp();
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const baseRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const kickRef = useRef<HTMLButtonElement>(null);
  const [touch, setTouch] = useState(false);
  const [sayOpen, setSayOpen] = useState(false);
  const config = view.config;
  const playing = view.myId !== null;
  const isHost = session.role === 'host';

  useEffect(() => {
    const root = rootRef.current, canvas = canvasRef.current;
    if (!config || !root || !canvas || !baseRef.current || !knobRef.current || !kickRef.current) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;
    document.documentElement.classList.add('game-lock');
    if (playing && window.matchMedia?.('(any-pointer: coarse)').matches) setTouch(true);

    const stage = attachStage(root, canvas);
    // 구경하는 사람은 조작을 달지 않는다(키·터치를 먹지 않게).
    const input = playing ? attachInput({ root, base: baseRef.current, knob: knobRef.current, kickBtn: kickRef.current, onTouch: () => setTouch(true) }) : null;
    session.setInputReader(playing ? (): Input => {
      const o = readOverride();
      if (o) return o;
      const st = stage.get();
      const h = input ? input.read() : { x: 0, y: 0, kick: false };
      const d = st ? stickToSim(st.view, h.x, h.y) : { x: 0, y: 0 };   // 화면 기준 → 시뮬레이션 기준(세로면 돌린다)
      return { x: d.x, y: d.y, kick: h.kick };
    } : null);
    const sprites = buildSprites(config, roster);

    // PC 한마디: 숫자 1~6. 글자 입력 칸에서는 안 먹는다(경기 화면엔 없지만 확인창이 뜰 수 있다).
    const onKey = (e: KeyboardEvent): void => {
      if (!playing || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const k = Number(e.key);
      if (!Number.isInteger(k) || k < 1 || k > PHRASES.length) return;
      if ((e.target as HTMLElement | null)?.closest?.('input, textarea')) return;
      session.say(k - 1);
    };
    window.addEventListener('keydown', onKey);

    let raf = 0;
    const frame = (now: number): void => {
      raf = requestAnimationFrame(frame);
      session.advance(now);
      const f = session.frame(now), st = stage.get();
      if (!f || !st) return;
      drawFrame(ctx, f.state, f.config, st.view, st.field, sprites, { dpr: st.dpr, topInset: st.topInset, humanId: f.myId });
      drawBubbles(ctx, f.state, st.view, f.bubbles);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      session.setInputReader(null);
      input?.dispose();
      stage.dispose();
      document.documentElement.classList.remove('game-lock');
    };
    // 경기마다 새로 마운트(key = matchKey)되므로 config·playing 은 한 경기 동안 그대로다.
  }, [session, config, playing, roster, readOverride]);

  if (!config) return null;
  const result = view.result;
  const mySide = view.myId !== null ? config.players[view.myId]?.side ?? null : null;
  const outcome = !result ? '' : result.winner === 'draw' ? '무승부'
    : mySide === null ? `${TEAM[result.winner].short} 승` : result.winner === mySide ? '승!' : '패';
  const tone = !result || result.winner === 'draw' ? 'draw' : mySide === null || result.winner === mySide ? 'win' : 'lose';
  const conn = connText(view.conn);

  const confirmExit = (): void => {
    if (isHost) {
      modal.confirm({ title: '경기를 멈출까요?', content: '모두 방으로 돌아갑니다.', okText: '멈추기', cancelText: '계속', centered: true,
        onOk: () => { (session as HostSession).stop(); } });
    } else {
      modal.confirm({ title: '방에서 나갈까요?', content: playing ? '이번 경기는 봇이 대신 뜁니다.' : '구경을 그만하고 나갑니다.', okText: '나가기', cancelText: '계속', centered: true,
        onOk: onLeaveRoom });
    }
  };
  const say = (k: number): void => { session.say(k); setSayOpen(false); };

  return (
    <div className="game-overlay" ref={rootRef}>
      <canvas ref={canvasRef} className="game-canvas" />
      {!result && <button type="button" className="game-x" aria-label={isHost ? '경기 멈추기' : '방에서 나가기'} onClick={confirmExit}>✕</button>}
      {!result && playing && (
        <div className="game-say">
          <button type="button" className="game-say-btn" aria-expanded={sayOpen} aria-label="한마디" onClick={() => setSayOpen((v) => !v)}>한마디</button>
          {sayOpen && (
            <div className="game-say-menu" role="menu">
              {PHRASES.map((p, k) => (
                <button type="button" role="menuitem" key={p} onClick={() => say(k)}><span className="muted">{k + 1}</span> {p}</button>
              ))}
            </div>
          )}
        </div>
      )}
      {!result && !playing && <div className="game-watch" role="status">구경 중</div>}
      {!result && (view.paused || conn) && (
        <div className="game-banner" role="status">{conn ?? '방장이 잠깐 자리를 비웠습니다'}</div>
      )}
      <div className="game-stick" ref={baseRef} aria-hidden="true"><div className="game-stick-knob" ref={knobRef} /></div>
      <button type="button" ref={kickRef} className={`game-kick${touch && playing && !result ? ' is-shown' : ''}`} aria-label="킥">킥</button>
      {result && (
        <div className="game-result" role="dialog" aria-label="경기 결과">
          <div className="game-result-box">
            <b className={`game-outcome is-${tone}`}>{outcome}</b>
            <div className="game-final">
              <span style={{ color: TEAM[0].color }}>{TEAM[0].short}</span> {result.score[0]} : {result.score[1]} <span style={{ color: TEAM[1].color }}>{TEAM[1].short}</span>
            </div>
            <p className="muted">{clockText(config.minutes * 60)} 경기 · {config.perSide}대{config.perSide}</p>
            {isHost
              ? <div className="game-result-actions"><Button type="primary" size="large" onClick={() => (session as HostSession).toLobby()}>바로 방으로</Button></div>
              : <p className="muted">잠시 뒤 방으로 돌아갑니다</p>}
          </div>
        </div>
      )}
    </div>
  );
}
