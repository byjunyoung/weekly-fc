// src/react/game3d/Match3D.tsx — 3D 축구 **시제품**의 경기 화면(전체 화면 오버레이): 장면 → 경기 → 결과.
// 스펙 docs/superpowers/specs/2026-11-07-game3d-spike-design.md §3·§4. 2D 의 SoloMatch 와 같은 뼈대다 —
// 고정 60틱 계산 + 누적기, 그리기는 두 틱 사이를 섞어서, 프레임마다 리액트 상태를 건드리지 않는다
// (점수·골 문구·결과처럼 드물게 바뀌는 것만 리액트, 시계·슛 게이지·이름표는 DOM 을 직접 고친다).
// three.js 는 이 파일(과 scene.ts)만 불러온다 — 설정 화면은 가볍게 먼저 뜨고, 이 묶음은 따로 받는다.
import { App, Button } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { Vector3 } from 'three';
import { botInput } from '../../lib/game3d/bot';
import { createMatch, eventsBetween, RULES3D, step, TICK_HZ, type Input, type MatchConfig, type MatchState } from '../../lib/game3d/sim';
import type { Player } from '../../lib/types';
import { href } from '../../lib/url';
import { play as playSfx } from '../game/sfx';
import SoundToggle from '../game/SoundToggle';
import { detectSfx3d } from './sfx3d';
import { attachInput } from './input3d';
import { createScene, TEAM_COLOR, type SceneHandle } from './scene';

const TEAM_SHORT = ['주황', '흰'] as const;   // 2D 점수판과 같은 이름
import { clockText, edgeArrow, nextView, readView, saveView, stickToWorld, tankStep, VIEW_LABEL, type ViewMode } from './view3d';

const STEP_MS = 1000 / TICK_HZ;
const MAX_CATCHUP = 5;          // 한 프레임에 따라잡는 최대 틱 — 느린 기기가 계산에 먹혀 더 느려지지 않게(느리면 화면만 덜 그린다)
const MAX_DPR = 2;
const SLOW_MS = 24;             // 평균 프레임이 이보다 길면(≈ 42fps 아래) 해상도부터 낮춘다
const LABEL_MIN_PX = 28;        // 선수 키가 화면에서 이보다 작으면 이름표를 숨긴다

export type Setup3D = { key: number; config: MatchConfig; seed: number; humanId: number; roster: Player[] };
/** 디버그 훅(?debug=1)과 나눠 쓰는 살아 있는 값 — 리액트 상태가 아니다. override = 사람 입력을 덮어쓰기(경기 좌표). */
export type Live3D = {
  state: MatchState | null; config: MatchConfig | null; override: Input | null;
  /** 디버그 전용: 다음 틱 전에 상태를 한 번 바꾼다(예: 빈 골대 앞에 공 놓기). 경기 계산 밖, 화면 쪽에서만. */
  patch: ((s: MatchState) => MatchState) | null;
  info: { fps: number; drawCalls: number; triangles: number };
};

export default function Match3D({ setup, live, onRestart, onExit }: { setup: Setup3D; live: React.RefObject<Live3D>; onRestart: () => void; onExit: () => void }) {
  const { modal } = App.useApp();
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const baseRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const shootRef = useRef<HTMLButtonElement>(null);
  const passRef = useRef<HTMLButtonElement>(null);
  const throughRef = useRef<HTMLButtonElement>(null);
  const lobRef = useRef<HTMLButtonElement>(null);
  const sprintRef = useRef<HTMLButtonElement>(null);
  const clockRef = useRef<HTMLSpanElement>(null);
  const gaugeRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const paused = useRef(false);
  const [touch, setTouch] = useState(false);
  const [score, setScore] = useState<[number, number]>([0, 0]);
  const [goal, setGoal] = useState<{ side: 0 | 1; name: string | null; assist: string | null } | null>(null);
  const [result, setResult] = useState<{ score: [number, number]; winner: 0 | 1 | 'draw' } | null>(null);
  const [fail, setFail] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>(() => readView());
  const viewRef = useRef<ViewMode>(view);
  viewRef.current = view;
  const arrowRef = useRef<HTMLDivElement>(null);
  const { config, seed, humanId, roster } = setup;

  useEffect(() => {
    const root = rootRef.current, canvas = canvasRef.current;
    if (!root || !canvas || !baseRef.current || !knobRef.current || !shootRef.current || !passRef.current || !throughRef.current || !lobRef.current || !sprintRef.current || !labelsRef.current) return;
    document.documentElement.classList.add('g3-lock');
    if (window.matchMedia?.('(any-pointer: coarse)').matches) setTouch(true);

    let dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    let sc: SceneHandle;
    try {
      sc = createScene(canvas, config, roster, humanId, dpr);
    } catch {
      // WebGL 을 못 연다(오래된 기기·꺼 둔 설정·인앱 브라우저 일부) — 빈 화면 대신 글로 알린다
      setFail('이 기기·브라우저에서는 3D 화면을 열 수 없습니다.');
      document.documentElement.classList.remove('g3-lock');
      return;
    }
    const input = attachInput({ root, base: baseRef.current, knob: knobRef.current, shootBtn: shootRef.current, passBtn: passRef.current, throughBtn: throughRef.current, lobBtn: lobRef.current, sprintBtn: sprintRef.current, onTouch: () => setTouch(true) });

    let state = createMatch(config, seed);
    let prev = state;
    live.current.state = state; live.current.config = config; live.current.override = null;

    let portrait = false, snap = true;
    const layout = (): void => {
      const w = root.clientWidth, h = root.clientHeight;
      if (!w || !h) return;
      portrait = h > w;
      sc.resize(w, h);
    };
    layout();
    const ro = new ResizeObserver(layout);
    ro.observe(root);
    const onOrient = (): void => { layout(); };
    window.addEventListener('orientationchange', onOrient);

    // 이름표 — 선수마다 span 하나, 매 프레임 transform 만 고친다
    const labelBox = labelsRef.current;
    const labels = config.players.map((mp, i) => {
      const el = document.createElement('span');
      el.className = `g3-label${i === humanId ? ' is-me' : ''}`;
      el.textContent = mp.name;
      el.style.borderColor = TEAM_COLOR[mp.side];
      labelBox.appendChild(el);
      return { el, shown: false };
    });
    const vHead = new Vector3(), vFoot = new Vector3(), vCam = new Vector3();
    // 1인칭 시선 — 화면 쪽에서 각도로 들고(삼각함수는 여기서만), 경기 계산에는 단위 벡터로 넘긴다
    let heading = 0, prevHeading = 0, turnVel = 0, lastMode: ViewMode | null = null;
    const faceOf = (s: MatchState): number => { const p = s.players[humanId]; return p ? Math.atan2(p.fy, p.fx) : 0; };

    const collectInputs = (s: MatchState): Input[] => config.players.map((p) => {
      if (p.id !== humanId) return botInput(s, config, p.id);
      if (live.current.override) { heading = faceOf(s); turnVel = 0; return live.current.override; }
      const h = input.read();
      if (viewRef.current === 'first') {
        // 탱크식: 좌우 = 돌기, 위아래 = 앞뒤. 보는 쪽을 그대로 선수가 보게 fx·fy 로 넘긴다 — 패스·슛이 보는 쪽으로 간다
        const t = tankStep(h.x, h.y, heading, turnVel, 1 / TICK_HZ);
        heading = t.heading; turnVel = t.turnVel;
        return { x: t.move.x, y: t.move.y, shoot: h.shoot, pass: h.pass, through: h.through, lob: h.lob, sprint: h.sprint, fx: t.face.x, fy: t.face.y };
      }
      const f = sc.groundForward();
      const d = stickToWorld(h.x, h.y, f.x, f.y);   // 화면 기준 → 경기장 방향(카메라가 실제로 보는 방향으로)
      return { x: d.x, y: d.y, shoot: h.shoot, pass: h.pass, through: h.through, lob: h.lob, sprint: h.sprint };
    });

    let raf = 0, last = performance.now(), acc = 0, ended = false, lost = false;
    let endTimer: ReturnType<typeof setTimeout> | undefined;
    let avgMs = STEP_MS, slowFor = 0, lastClock = '', gaugeOn = false, arrowOn = false;
    const frame = (now: number): void => {
      raf = requestAnimationFrame(frame);
      const dtMs = Math.min(250, now - last); last = now;
      if (lost || document.hidden || paused.current) { acc = 0; return; }   // 숨겨진 동안은 시계가 안 간다
      if (!ended) {
        acc += Math.min(dtMs, MAX_CATCHUP * STEP_MS);
        let n = 0;
        while (acc >= STEP_MS && n < MAX_CATCHUP && state.phase !== 'end') {
          if (live.current.patch) { state = live.current.patch(state); prev = state; live.current.patch = null; heading = faceOf(state); turnVel = 0; }
          // 시점을 1인칭으로 바꿨거나 킥오프 자리로 돌아갔으면 시선을 선수가 보는 쪽(공격 방향)으로 맞춘다
          if (viewRef.current !== lastMode) { lastMode = viewRef.current; heading = faceOf(state); turnVel = 0; }
          prevHeading = heading;
          const next = step(state, config, collectInputs(state));
          if (next.phase === 'kickoff' && state.phase !== 'kickoff') { heading = faceOf(next); prevHeading = heading; turnVel = 0; }
          for (const fx of detectSfx3d(state, next, config)) playSfx(fx);   // 효과음 — 2D 와 같은 모듈·같은 끔 설정, 틱마다 상태 변화로 알아낸다
          for (const ev of eventsBetween(state, next)) {
            if (ev.type === 'goal') {
              setScore([next.score[0], next.score[1]]);
              setGoal({ side: ev.side, name: ev.scorer !== null ? config.players[ev.scorer]?.name ?? null : null, assist: ev.assist !== null ? config.players[ev.assist]?.name ?? null : null });
            } else if (ev.type === 'end') ended = true;
          }
          if (state.phase === 'goal' && next.phase !== 'goal') setGoal(null);
          prev = state; state = next; acc -= STEP_MS; n++;
        }
        if (n === MAX_CATCHUP) acc = 0;
        live.current.state = state;
        if (state.phase === 'end' && !ended) ended = true;
        if (ended) endTimer = setTimeout(() => setResult({ score: state.score, winner: (state.winner ?? 'draw') as 0 | 1 | 'draw' }), 900);
      }
      const alpha = ended ? 1 : acc / STEP_MS;
      let dh = heading - prevHeading;   // 두 틱 사이 시선도 섞는다(각이 ±π 를 넘을 때는 짧은 쪽으로)
      if (dh > Math.PI) dh -= Math.PI * 2; else if (dh < -Math.PI) dh += Math.PI * 2;
      sc.update(prev, state, alpha, dtMs / 1000, { mode: viewRef.current, portrait, heading: prevHeading + dh * alpha, snap });
      snap = false;
      sc.render();

      // 프레임 시간 — 느리면 해상도부터 낮춘다(계산은 그대로 60틱, 화면만 덜 곱게)
      avgMs += (dtMs - avgMs) * 0.05;
      const info = sc.info();
      live.current.info = { fps: Math.round(1000 / Math.max(1, avgMs)), drawCalls: info.drawCalls, triangles: info.triangles };
      if (avgMs > SLOW_MS && dpr > 1) {
        slowFor += dtMs;
        if (slowFor > 2000) { dpr = Math.max(1, dpr - 0.5); sc.setPixelRatio(dpr); layout(); slowFor = 0; }
      } else slowFor = 0;

      // 시계·게이지(DOM 직접)
      const ct = clockText(state.ticksLeft, TICK_HZ);
      if (ct !== lastClock && clockRef.current) { clockRef.current.textContent = ct; lastClock = ct; }
      const me = state.players[humanId];
      const charge = me && me.shootHeld ? me.charge / RULES3D.chargeTicks : 0;
      if (gaugeRef.current && fillRef.current) {
        if ((charge > 0) !== gaugeOn) { gaugeOn = charge > 0; gaugeRef.current.classList.toggle('is-on', gaugeOn); }
        if (gaugeOn) fillRef.current.style.transform = `scaleX(${charge.toFixed(3)})`;
      }

      // 이름표 — 머리 위를 화면에 비춘다. 뒤에 있거나 너무 작으면 숨긴다(폰에서 글자가 겹쳐 뭉개지지 않게)
      const w = root.clientWidth, h = root.clientHeight;
      const fp = viewRef.current === 'first';
      for (let i = 0; i < labels.length; i++) {
        // 카메라 뒤에 있는 점은 투영하면 엉뚱한 데 찍힌다 — 카메라 좌표로 앞(-z)인지 먼저 본다
        const ahead = sc.headPoint(i, vCam).applyMatrix4(sc.camera.matrixWorldInverse).z < -0.3;
        sc.headPoint(i, vHead).project(sc.camera);
        sc.footPoint(i, vFoot).project(sc.camera);
        const px = (vHead.y - vFoot.y) * 0.5 * h;
        const show = ahead && !(fp && i === humanId) && vHead.z < 1 && vHead.z > -1 && px > LABEL_MIN_PX;
        const L = labels[i];
        if (show !== L.shown) { L.el.classList.toggle('is-on', show); L.shown = show; }
        if (show) L.el.style.transform = `translate(${((vHead.x + 1) * 0.5 * w).toFixed(1)}px, ${((1 - vHead.y) * 0.5 * h).toFixed(1)}px) translate(-50%, -100%)`;
      }
      // 화면 밖·뒤의 공 — 가장자리 화살표(1인칭·뒤에서). 중계는 공을 따라가니 필요 없다
      const ar = arrowRef.current;
      if (ar) {
        let on = false;
        if (viewRef.current !== 'broadcast' && state.phase !== 'end') {
          sc.ballPoint(vCam).applyMatrix4(sc.camera.matrixWorldInverse);
          const e = edgeArrow(vCam.x, vCam.y, vCam.z, sc.camera.fov, sc.camera.aspect, w, h, 44);
          on = e.show;
          if (on) ar.style.transform = `translate(${e.x.toFixed(1)}px, ${e.y.toFixed(1)}px) translate(-50%, -50%) rotate(${e.angle.toFixed(3)}rad)`;
        }
        if (on !== arrowOn) { ar.classList.toggle('is-on', on); arrowOn = on; }
      }
    };

    // 장면이 다 만들어진 뒤에야 첫 프레임을 건다
    raf = requestAnimationFrame(frame);

    const onVis = (): void => { last = performance.now(); acc = 0; };
    document.addEventListener('visibilitychange', onVis);
    const onLost = (e: Event): void => { e.preventDefault(); lost = true; setFail('3D 화면이 끊겼습니다. 설정으로 돌아가 다시 시작해 주세요.'); };
    canvas.addEventListener('webglcontextlost', onLost);

    return () => {
      cancelAnimationFrame(raf);
      if (endTimer) clearTimeout(endTimer);
      document.removeEventListener('visibilitychange', onVis);
      canvas.removeEventListener('webglcontextlost', onLost);
      window.removeEventListener('orientationchange', onOrient);
      ro.disconnect();
      input.dispose();
      labels.forEach((l) => l.el.remove());
      sc.dispose();
      document.documentElement.classList.remove('g3-lock');
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

  // 결과·점수판 글은 2D 와 같게(2026-11-07 "두 모드 다 일관성 갖추게해") — 승! / 패! / 무승부, 편 이름은 팀 색 글자 「주황」「흰」
  const outcome = result ? (result.winner === 'draw' ? '무승부' : result.winner === 0 ? '승' : '패') : '';   // 사람은 늘 0 편
  const team = (side: 0 | 1): React.ReactNode => <span className="g3-team" style={{ color: TEAM_COLOR[side] }}>{TEAM_SHORT[side]}</span>;

  if (fail) {
    return (
      <div className="g3-overlay">
        <div className="g3-result" role="alert">
          <div className="g3-result-box">
            <p>{fail}</p>
            <p className="muted">2D 게임은 <a href={href('/game/')}>게임</a>에서 할 수 있습니다.</p>
            <Button size="large" onClick={onExit}>설정으로</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="g3-overlay" ref={rootRef}>
      <canvas ref={canvasRef} className="g3-canvas" />
      <div className="g3-labels" ref={labelsRef} aria-hidden="true" />
      <div className="g3-hud" aria-live="polite">
        <b className="g3-score">{team(0)} {score[0]} : {score[1]} {team(1)}</b>
        <span className="g3-clock" ref={clockRef}>{clockText(config.minutes * 60 * TICK_HZ, TICK_HZ)}</span>
      </div>
      {goal && !result && (
        <div className="g3-goal" role="status">
          <b>골!</b>
          <span>{goal.name ? (goal.assist ? `${goal.name} · 도움 ${goal.assist}` : goal.name) : TEAM_SHORT[goal.side]}</span>
        </div>
      )}
      <div className={`g3-gauge${touch ? ' is-touch' : ''}`} ref={gaugeRef} aria-hidden="true"><i ref={fillRef} /></div>
      {!result && <button type="button" className="g3-x" aria-label="경기 나가기" onClick={confirmExit}>✕</button>}
      {!result && <SoundToggle />}
      {!result && (
        <button type="button" className="g3-view" aria-label={`시점 바꾸기, 지금 ${VIEW_LABEL[view]}`}
          onClick={(e) => { const v = nextView(view); setView(v); saveView(v); e.currentTarget.blur(); }}>
          시점 <b>{VIEW_LABEL[view]}</b>
        </button>
      )}
      <div className="g3-arrow" ref={arrowRef} aria-hidden="true" />
      <div className="g3-stick" ref={baseRef} aria-hidden="true"><div className="g3-stick-knob" ref={knobRef} /></div>
      <button type="button" ref={passRef} className={`g3-btn g3-pass${touch && !result ? ' is-shown' : ''}`} aria-label="패스">패스</button>
      <button type="button" ref={shootRef} className={`g3-btn g3-shoot${touch && !result ? ' is-shown' : ''}`} aria-label="슛">슛</button>
      <button type="button" ref={throughRef} className={`g3-btn g3-small g3-through${touch && !result ? ' is-shown' : ''}`} aria-label="스루 패스">스루</button>
      <button type="button" ref={lobRef} className={`g3-btn g3-small g3-lob${touch && !result ? ' is-shown' : ''}`} aria-label="로빙 패스">로빙</button>
      <button type="button" ref={sprintRef} className={`g3-btn g3-small g3-sprint${touch && !result ? ' is-shown' : ''}`} aria-label="질주(누르는 동안)">질주</button>
      {result && (
        <div className="g3-result" role="dialog" aria-label="경기 결과">
          <div className="g3-result-box">
            <b className={`g3-outcome is-${outcome === '승' ? 'win' : outcome === '패' ? 'lose' : 'draw'}`}>{outcome === '무승부' ? outcome : `${outcome}!`}</b>
            <div className="g3-final">{team(0)} {result.score[0]} : {result.score[1]} {team(1)}</div>
            <p className="muted">{clockText(config.minutes * 60 * TICK_HZ, TICK_HZ)} 경기 · 5대5 · 시제품</p>
            <div className="g3-result-actions">
              <Button type="primary" size="large" onClick={onRestart}>다시 하기</Button>
              <Button size="large" onClick={onExit}>설정으로</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
