// src/react/game/GameApp.tsx — 축구 게임 1단계(혼자 + 봇). 설정 화면 → 경기(전체 화면 오버레이) → 결과.
// 설계: docs/superpowers/specs/2026-11-06-game-design.md. 계산은 src/lib/game/*(순수)가 하고, 여기는 화면·시계·입력을 맡는다.
// 사용자 말: "헥스볼 같은 느낌", "PC 모바일 둘다 최적화", "팀원 없으면 봇 추가해서 가능해야지".
// 프레임마다 리액트 상태를 건드리지 않는다 — 그리기는 캔버스에 직접, 리액트 상태는 화면 전환·결과·터치 여부뿐.
import { App, Button, Segmented } from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';
import { avatarFaceSvg } from '../../components/avatar';
import { avatarSpecFor } from '../../lib/avatar';
import { botInput } from '../../lib/game/bot';
import { createMatch, eventsBetween, NO_INPUT, step, TICK_HZ, type Input, type MatchConfig, type MatchPlayer, type MatchState } from '../../lib/game/sim';
import { perfOf } from '../../lib/game/stats';
import type { Player } from '../../lib/types';
import Loading from '../Loading';
import ThemeRoot from '../ThemeRoot';
import { useData } from '../useData';
import { useMeInfo } from '../useMe';
import { attachInput } from './input';
import { blend, buildField, buildSprites, drawFrame, fieldKey, HUD_H, TEAM, type Field } from './render';
import { clockText, makeView, maxPerSide, pickLineup, rngFrom, stickToSim, type View } from './view';

const LAST_KEY = 'wfc:game:last';          // 마지막으로 고른 내 선수(번호)
const SCORE_LIMITS = [0, 1, 3, 5] as const;
const STEP_MS = 1000 / TICK_HZ;
const MAX_CATCHUP = 5;                     // 한 프레임에 따라잡는 최대 틱 — 느린 기기가 계산에 먹혀 더 느려지는 걸 막는다

type Req = { num: number; perSide: 1 | 2 | 3 | 4; minutes: number; scoreLimit: number };
type MatchSetup = { key: number; req: Req; config: MatchConfig; seed: number; humanId: number; roster: Player[] };

/** 디버그 훅(?debug=1)과 경기 화면이 나눠 쓰는 살아 있는 값. 리액트 상태가 아니다. */
type Live = { state: MatchState | null; config: MatchConfig | null; override: Input | null };

/** 설정 → 경기. 씨앗은 여기(화면 쪽 시계)에서 만든다 — 계산 코드는 시계·난수를 모른다. */
function buildMatch(req: Req, roster: Player[], key: number): MatchSetup {
  const seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
  const lineup = pickLineup(roster.map((p) => p.num), req.num, req.perSide, rngFrom(seed ^ 0x9e3779b9));
  const players: MatchPlayer[] = lineup.map((l, id) => {
    const p = roster.find((r) => r.num === l.num) as Player;
    return { id, num: l.num, name: p.name, side: l.side, bot: !l.human, perf: perfOf(p, roster) };
  });
  const config: MatchConfig = { perSide: req.perSide, minutes: req.minutes, scoreLimit: req.scoreLimit, players };
  return { key, req, config, seed, humanId: lineup.findIndex((l) => l.human), roster };
}

export default function GameApp() {
  return <ThemeRoot><GameRoot /></ThemeRoot>;
}

function GameRoot() {
  const { data } = useData();
  const live = useRef<Live>({ state: null, config: null, override: null });
  const [match, setMatch] = useState<MatchSetup | null>(null);
  const keyN = useRef(0);

  // 검증용 훅 — ?debug=1 일 때만. 헤드리스 브라우저가 상태를 읽고 입력을 덮어쓴다. 아니면 아무것도 노출하지 않는다.
  useEffect(() => {
    if (new URLSearchParams(location.search).get('debug') !== '1') return;
    const l = live.current;
    (window as unknown as { __wfcGame?: unknown }).__wfcGame = {
      getState: () => l.state, getConfig: () => l.config, setInput: (i: Input | null) => { l.override = i; },
    };
    return () => { delete (window as unknown as { __wfcGame?: unknown }).__wfcGame; };
  }, []);

  const start = useCallback((req: Req, roster: Player[]) => { keyN.current += 1; setMatch(buildMatch(req, roster, keyN.current)); }, []);

  if (!data) return <Loading title="게임" />;
  return (
    <>
      <Setup players={data.players} onStart={start} />
      {match && (
        <MatchScreen key={match.key} setup={match} live={live}
          onRestart={() => start(match.req, match.roster)} onExit={() => setMatch(null)} />
      )}
    </>
  );
}

// ── 설정 화면 ──
function readLast(): number | null {
  try { const v = Number(localStorage.getItem(LAST_KEY)); return Number.isInteger(v) && v > 0 ? v : null; } catch { return null; }
}

function Setup({ players, onStart }: { players: Player[]; onStart: (req: Req, roster: Player[]) => void }) {
  const me = useMeInfo();
  const [picked, setPicked] = useState<number | null>(null);
  const [last, setLast] = useState<number | null>(null);
  useEffect(() => { setLast(readLast()); }, []);
  const max = maxPerSide(players.length);
  const [perSide, setPerSide] = useState<1 | 2 | 3 | 4>(3);
  const [minutes, setMinutes] = useState(3);
  const [scoreLimit, setScoreLimit] = useState<number>(0);

  const has = (n: number | null | undefined): n is number => n != null && players.some((p) => p.num === n);
  // 고른 사람 > 지난번 > 로그인해 차지한 내 선수. 로그인은 없어도 된다.
  const num = has(picked) ? picked : has(last) ? last : has(me.num) ? me.num : null;
  const per = Math.min(perSide, Math.max(1, max)) as 1 | 2 | 3 | 4;
  const ok = num !== null && max >= 1;

  return (
    <>
      <div className="page-head"><h1>게임 <span className="muted">혼자서 봇과</span></h1></div>
      <div className="stack">
        <div className="card">
          <div className="card-head"><h2>내 선수</h2></div>
          <div className="game-picker" role="radiogroup" aria-label="내 선수">
            {players.map((p) => (
              <button type="button" key={p.num} role="radio" aria-checked={p.num === num} className={`game-pick${p.num === num ? ' is-on' : ''}`}
                onClick={() => { setPicked(p.num); try { localStorage.setItem(LAST_KEY, String(p.num)); } catch { /* 저장 못 해도 판은 할 수 있다 */ } }}>
                <span className="game-pick-face" aria-hidden="true" dangerouslySetInnerHTML={{ __html: avatarFaceSvg(avatarSpecFor(p.num, p.avatar), 48, p.jersey, true) }} />
                <span className="game-pick-name">{p.name}</span>
                <span className="game-pick-num">#{p.jersey}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h2>판 설정</h2></div>
          <div className="game-opts">
            <label className="game-opt"><span className="muted">인원</span>
              <Segmented<number> value={per} onChange={(v) => setPerSide(v as 1 | 2 | 3 | 4)}
                options={[1, 2, 3, 4].map((n) => ({ value: n, label: `${n}대${n}`, disabled: n > max }))} /></label>
            <label className="game-opt"><span className="muted">시간</span>
              <Segmented<number> value={minutes} onChange={setMinutes} options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: `${n}분` }))} /></label>
            <label className="game-opt"><span className="muted">점수 제한</span>
              <Segmented<number> value={scoreLimit} onChange={setScoreLimit} options={SCORE_LIMITS.map((n) => ({ value: n, label: n ? `${n}점` : '없음' }))} /></label>
          </div>
          <p className="muted game-hint">PC: 방향키·WASD로 이동, 스페이스로 킥 · 폰: 왼쪽을 끌어 이동, 오른쪽 버튼으로 킥</p>
          {max < 1 && <p className="muted">명단이 두 명은 있어야 판을 만들 수 있습니다.</p>}
          <div className="game-start">
            <Button type="primary" size="large" disabled={!ok} onClick={() => ok && onStart({ num, perSide: per, minutes, scoreLimit }, players)}>
              {ok ? '시작' : '내 선수를 골라 주세요'}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── 경기 화면 ──
/** 노치·홈바 안전 영역(px). CSS env() 는 JS 에서 바로 못 읽어서 보이지 않는 요소로 계산시킨다. */
function readInsets(): { top: number; right: number; bottom: number; left: number } {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;'
    + 'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const n = (v: string): number => parseFloat(v) || 0;
  const out = { top: n(cs.paddingTop), right: n(cs.paddingRight), bottom: n(cs.paddingBottom), left: n(cs.paddingLeft) };
  probe.remove();
  return out;
}

function MatchScreen({ setup, live, onRestart, onExit }: { setup: MatchSetup; live: React.MutableRefObject<Live>; onRestart: () => void; onExit: () => void }) {
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
    live.current.state = state; live.current.config = config; live.current.override = null;

    let view: View, field: Field, dpr = 1, topInset = 0;
    const layout = (): void => {
      const vw = root.clientWidth, vh = root.clientHeight;
      if (!vw || !vh) return;
      dpr = Math.min(window.devicePixelRatio || 1, 3);
      canvas.width = Math.round(vw * dpr); canvas.height = Math.round(vh * dpr);
      const ins = readInsets();
      topInset = ins.top;
      view = makeView(vw, vh, { margin: Math.max(8, ins.left, ins.right), top: ins.top + HUD_H, bottom: ins.bottom });
      if (!field || field.key !== fieldKey(view, dpr)) field = buildField(view, dpr);
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
            if (ev.type === 'end') ended = true;   // 골·킥 소리 등은 아직 없다(이 자리에서 이벤트를 쓰면 된다)
          }
          prev = state; state = next; acc -= STEP_MS; n++;
        }
        if (n === MAX_CATCHUP) acc = 0;
        live.current.state = state;
        if (state.phase === 'end' && !ended) ended = true;
        if (ended) endTimer = setTimeout(() => setResult({ score: state.score, winner: (state.winner ?? 'draw') as 0 | 1 | 'draw' }), 900);
      }
      const shown = ended ? state : blend(prev, state, acc / STEP_MS);
      drawFrame(ctx, shown, config, view, field, sprites, { dpr, topInset, humanId });
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
      live.current.state = null; live.current.config = null; live.current.override = null;
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
      <div className="game-stick" ref={baseRef} aria-hidden="true"><div className="game-stick-knob" ref={knobRef} /></div>
      <button type="button" ref={kickRef} className={`game-kick${touch && !result ? ' is-shown' : ''}`} aria-label="킥">킥</button>
      {result && (
        <div className="game-result" role="dialog" aria-label="경기 결과">
          <div className="game-result-box">
            <b className={`game-outcome is-${outcome === '승' ? 'win' : outcome === '패' ? 'lose' : 'draw'}`}>{outcome === '무승부' ? outcome : `${outcome}!`}</b>
            <div className="game-final">
              <span style={{ color: TEAM[0].color }}>{TEAM[0].short}</span> {result.score[0]} : {result.score[1]} <span style={{ color: TEAM[1].color }}>{TEAM[1].short}</span>
            </div>
            <p className="muted">{clockText(config.minutes * 60)} 경기 · {config.perSide}대{config.perSide}</p>
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
