// src/react/game3d/Game3DApp.tsx — 3D 축구 **시제품**(/game3d/, 2026-11-07): 설정(내 선수·시간) → 경기 → 결과.
// 스펙 docs/superpowers/specs/2026-11-07-game3d-spike-design.md. 사용자: "3차원 피파 같은 게임으로 만들긴 좀 그런가?" →
// "b 쪽도 시도해보고 싶은데" — 단순한 3D 아케이드 축구, 내 선수 하나만 조종, 우리 도트 아바타를 입체로, 달리기·패스·슛.
// 손맛을 보려는 실험이라 상단 메뉴에 넣지 않고(nav.ts 그대로) 주소로만 들어온다. 2D 게임(/game/)은 그대로 있다.
//
// three.js 는 경기 화면(Match3D)에서만 쓴다 — 그 묶음은 lazy 로 따로 받고, 설정 화면이 뜨자마자 미리 받아 둔다.
import { Button, Segmented } from 'antd';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { BASE_PERF } from '../../lib/game3d/stats';
import type { Input, MatchConfig, MatchPlayer, MatchState } from '../../lib/game3d/sim';
import { perfOf } from '../../lib/game3d/stats';
import type { Player } from '../../lib/types';
import { href } from '../../lib/url';
import { PlayerPicker } from '../game/PlayerPicker';
import Loading from '../Loading';
import ThemeRoot from '../ThemeRoot';
import { useMeInfo } from '../useMe';
import { useData } from '../useData';
import type { Live3D, Setup3D } from './Match3D';
import { pickLineup5, readView, rngFrom, saveView, VIEW_LABEL, VIEW_MODES, type ViewMode } from './view3d';

const loadMatch = () => import('./Match3D');
const Match3D = lazy(loadMatch);

const LAST_KEY = 'wfc:game:last';   // 2D 게임과 같은 칸 — 거기서 고른 내 선수를 여기서도 먼저 보여 준다
const TITLE = '3D 축구';

function readLast(): number | null {
  try { const v = Number(localStorage.getItem(LAST_KEY)); return Number.isInteger(v) && v > 0 ? v : null; } catch { return null; }
}
function saveLast(n: number): void {
  try { localStorage.setItem(LAST_KEY, String(n)); } catch { /* 저장 못 해도 판은 할 수 있다 */ }
}

/** 설정 → 경기. 씨앗은 화면 쪽 시계에서 만든다(경기 계산은 시계·난수를 모른다). */
function buildMatch(roster: Player[], humanNum: number, minutes: number, key: number): Setup3D {
  const seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
  const lineup = pickLineup5(roster.map((p) => p.num), humanNum, rngFrom(seed ^ 0x9e3779b9));
  const players: MatchPlayer[] = lineup.map((l, id) => {
    const p = roster.find((r) => r.num === l.num);
    return { id, num: l.num, name: p?.name ?? `#${l.num}`, side: l.side, bot: !l.human, gk: l.gk, perf: p ? perfOf(p, roster) : { ...BASE_PERF } };
  });
  const config: MatchConfig = { minutes, players };
  return { key, config, seed, humanId: lineup.findIndex((l) => l.human), roster };
}

export default function Game3DApp() {
  return <ThemeRoot><Root /></ThemeRoot>;
}

function Root() {
  const { data } = useData();
  const live = useRef<Live3D>({ state: null, config: null, override: null, patch: null, info: { fps: 0, drawCalls: 0, triangles: 0 } });
  const [match, setMatch] = useState<Setup3D | null>(null);
  const keyN = useRef(0);

  // 경기 화면 묶음(three.js)을 미리 받아 둔다 — [시작]을 누른 뒤 기다리지 않게
  useEffect(() => { void loadMatch().catch(() => { /* 받기 실패는 [시작] 때 Suspense 가 다시 시도한다 */ }); }, []);

  // 검증용 훅 — ?debug=1 일 때만. 헤드리스 브라우저가 상태를 읽고 사람 입력을 덮어쓴다(setInput 은 경기 좌표 Input, null 이면 원래대로).
  useEffect(() => {
    if (new URLSearchParams(location.search).get('debug') !== '1') return;
    const l = live.current;
    (window as unknown as { __wfc3d?: unknown }).__wfc3d = {
      getState: () => l.state,
      getConfig: () => l.config,
      setInput: (i: Input | null) => { l.override = i; },
      getInfo: () => ({ ...l.info }),
      // 골 장면 점검용 — 내 선수를 상대 골대 앞(골키퍼는 옆으로 비킴)에, 공을 발밑에, 동료가 방금 넘겨준 것으로. 다음 틱에 들어간다.
      goalChance: () => {
        l.patch = (s) => {
          const c = l.config;
          if (!c) return s;
          const n = JSON.parse(JSON.stringify(s)) as MatchState;
          const me = c.players.findIndex((p) => !p.bot);
          const gk = c.players.findIndex((p) => p.gk && p.side === 1);
          n.phase = 'play'; n.phaseTicks = 0;
          Object.assign(n.players[me], { x: 14, y: 0, vx: 0, vy: 0, fx: 1, fy: 0, noTouch: 0 });
          if (gk >= 0) Object.assign(n.players[gk], { x: 6, y: -9, vx: 0, vy: 0 });
          for (const p of c.players) if (p.side === 1 && !p.gk) Object.assign(n.players[p.id], { x: -5, y: -8 + p.id, vx: 0, vy: 0 });
          n.owner = me; n.ball = { x: 14.7, y: 0, z: 0.18, vx: 0, vy: 0, vz: 0 };
          // 같은 편 동료가 방금 넘겨준 것으로 — 골 문구의 「도움」까지 보이게
          const mate = c.players.findIndex((p) => p.side === 0 && p.bot && !p.gk);
          if (mate >= 0) { n.prevTouch = mate; n.prevTouchTick = n.tick; n.lastTouch = me; n.lastTouchTick = n.tick; }
          return n;
        };
      },
    };
    return () => { delete (window as unknown as { __wfc3d?: unknown }).__wfc3d; };
  }, []);

  const start = useCallback((roster: Player[], num: number, minutes: number) => {
    keyN.current += 1;
    setMatch(buildMatch(roster, num, minutes, keyN.current));
  }, []);
  const restart = useCallback(() => {
    setMatch((m) => (m ? buildMatch(m.roster, m.config.players[m.humanId].num, m.config.minutes, ++keyN.current) : m));
  }, []);

  if (!data) return <Loading title={TITLE} />;
  return (
    <>
      <Setup players={data.players} onStart={start} />
      {match && (
        <Suspense fallback={<div className="g3-overlay g3-wait" role="status">3D 화면을 불러오는 중…</div>}>
          <Match3D key={match.key} setup={match} live={live} onRestart={restart} onExit={() => setMatch(null)} />
        </Suspense>
      )}
    </>
  );
}

function Setup({ players, onStart }: { players: Player[]; onStart: (roster: Player[], num: number, minutes: number) => void }) {
  const me = useMeInfo();
  const [picked, setPicked] = useState<number | null>(null);
  const [last, setLast] = useState<number | null>(null);
  const [minutes, setMinutes] = useState(3);
  const [view, setView] = useState<ViewMode>('broadcast');
  useEffect(() => { setLast(readLast()); setView(readView()); }, []);
  const has = (n: number | null | undefined): n is number => n != null && players.some((p) => p.num === n);
  // 고른 사람 > 지난번(2D 와 같은 칸) > 로그인해 차지한 내 선수
  const num = has(picked) ? picked : has(last) ? last : has(me.num) ? me.num : null;

  return (
    <>
      <div className="page-head"><h1>{TITLE} <span className="muted">시제품</span></h1></div>
      <div className="stack">
        <p className="g3-note" role="note">
          실험 중인 시제품입니다. 손맛을 보려고 만든 것이라 바뀌거나 없어질 수 있습니다. 2D 게임은 <a href={href('/game/')}>게임</a>에 있습니다.
        </p>
        <div className="card">
          <div className="card-head"><h2>내 선수</h2></div>
          {players.length ? (
            <PlayerPicker players={players} value={num} onPick={(p) => { setPicked(p.num); saveLast(p.num); }} />
          ) : <p className="muted">명단을 불러오지 못했습니다.</p>}
        </div>
        <div className="card">
          <div className="card-head"><h2>경기 <span className="muted">5대5 · 봇과</span></h2></div>
          <label className="g3-opt"><span className="muted">시간</span>
            <Segmented<number> value={minutes} onChange={setMinutes} options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: `${n}분` }))} /></label>
          <label className="g3-opt"><span className="muted">시점</span>
            <Segmented<ViewMode> value={view} onChange={(v) => { setView(v); saveView(v); }} options={VIEW_MODES.map((m) => ({ value: m, label: VIEW_LABEL[m] }))} /></label>
          <p className="muted g3-hint">PC: 방향키로 이동, S 패스 · D 슛(누르고 떼기, 공 없을 땐 태클) · W 스루 · A 로빙 · E 질주 · 폰: 왼쪽을 끌어 이동, 오른쪽 버튼으로 패스·슛</p>
          <p className="muted g3-hint">2D 와 다른 점: 키가 여럿이고(FC온라인 키 자리), 시점을 고릅니다. 1인칭은 ←→ 돌기, ↑↓ 앞뒤 — 보는 쪽으로 패스·슛.</p>
          <div className="g3-start">
            <Button type="primary" size="large" disabled={num === null} onClick={() => num !== null && onStart(players, num, minutes)}>
              {num === null ? '내 선수를 골라 주세요' : '시작'}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
