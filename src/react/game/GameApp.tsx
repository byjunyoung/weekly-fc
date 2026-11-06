// src/react/game/GameApp.tsx — 축구 게임: 입장(내 선수 + 방 만들기 / 혼자 연습) → 방(로비) → 경기.
// 설계: docs/superpowers/specs/2026-11-06-game-design.md(1단계), 2026-11-06-game-online-design.md(2단계 온라인).
// 사용자: "2단계 온라인으로 넘어가자", "팀원 없으면 봇 추가해서 가능해야지", "PC 모바일 둘다 최적화".
// 이 파일은 화면 전환과 세션의 수명(만들기·타이머·탭 이벤트·닫기)만 맡는다. 계산은 src/lib/game/*, 오가는 말은 net/*.
// 프레임마다 리액트 상태를 건드리지 않는다 — 세션 view 는 바뀔 때만 새 객체다.
import { App, Button } from 'antd';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { makeRoomCode } from '../../lib/game/room';
import type { Input } from '../../lib/game/sim';
import type { Player } from '../../lib/types';
import Loading from '../Loading';
import ThemeRoot from '../ThemeRoot';
import { useData } from '../useData';
import { Entry, readLast } from './Entry';
import { Lobby } from './Lobby';
import { createRealtimeTransport } from './net/realtime';
import { createGuestSession, createHostSession, type GuestSession, type HostSession, type SessionView } from './net/session';
import { OnlineMatch } from './OnlineMatch';
import {
  clearMarks, clientId, hostedCode, inviteUrl, joinedCode, markHost, markJoined, roomFromUrl, setRoomInUrl, shareInvite,
} from './online';
import { buildSoloMatch, SoloMatch, type Live, type MatchSetup, type Req } from './SoloMatch';

type Online = { session: HostSession | GuestSession; code: string };

const noSub = (): (() => void) => () => {};
const noView = (): SessionView | null => null;
/** 세션 시계 — 화면 쪽의 performance.now. 세션 안에는 시계가 없고 이걸 받아 쓴다. */
const now = (): number => performance.now();

export default function GameApp() {
  return <ThemeRoot><GameRoot /></ThemeRoot>;
}

function GameRoot() {
  const { data } = useData();
  const { message, modal } = App.useApp();
  const live = useRef<Live>({ state: null, config: null, override: null });
  const [match, setMatch] = useState<MatchSetup | null>(null);
  const [online, setOnline] = useState<Online | null>(null);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const keyN = useRef(0);
  const onlineRef = useRef<Online | null>(null);
  onlineRef.current = online;
  const triedRestore = useRef(false);

  useEffect(() => { setRoomCode(roomFromUrl()); }, []);

  // 검증용 훅 — ?debug=1 일 때만. 헤드리스 브라우저 둘(방장·손님)이 이걸로 상태를 읽고 입력을 덮어쓴다.
  // 손님의 getState 는 예측한 상태(화면에 그리는 몸), getBase 는 마지막 스냅샷. 방장은 둘 다 진짜 경기 상태.
  useEffect(() => {
    if (new URLSearchParams(location.search).get('debug') !== '1') return;
    const l = live.current;
    const o = (): Online | null => onlineRef.current;
    (window as unknown as { __wfcGame?: unknown }).__wfcGame = {
      getState: () => o()?.session.getState() ?? (o() ? null : l.state),
      getConfig: () => o()?.session.getConfig() ?? (o() ? null : l.config),
      setInput: (i: Input | null) => { l.override = i; },
      getRole: (): 'solo' | 'host' | 'guest' | null => o()?.session.role ?? (l.config ? 'solo' : null),
      getRoom: () => o()?.session.getRoom() ?? null,
      getNet: () => o()?.session.getNet() ?? null,
      getBase: () => { const s = o()?.session; return s ? (s.role === 'guest' ? s.getBase() : s.getState()) : l.state; },
    };
    return () => { delete (window as unknown as { __wfcGame?: unknown }).__wfcGame; };
  }, []);

  const startSolo = useCallback((req: Req, roster: Player[]) => { keyN.current += 1; setMatch(buildSoloMatch(req, roster, keyN.current)); }, []);

  const openHost = useCallback((p: Player, code: string) => {
    if (!data || onlineRef.current) return;
    const session = createHostSession({
      transport: createRealtimeTransport(code), roster: data.players, me: { clientId: clientId(), num: p.num, name: p.name }, code, now,
    });
    markHost(code);
    setRoomInUrl(code);   // 주소창이 곧 초대 링크
    setRoomCode(code);
    setMsg(null);
    setOnline({ session, code });
  }, [data]);

  const openGuest = useCallback((p: Player, code: string) => {
    if (!data || onlineRef.current) return;
    const session = createGuestSession({
      transport: createRealtimeTransport(code), roster: data.players, me: { clientId: clientId(), num: p.num, name: p.name }, code, now,
    });
    markJoined(code);
    setMsg(null);
    setOnline({ session, code });
  }, [data]);

  const onCreate = useCallback((p: Player) => openHost(p, makeRoomCode(Math.random)), [openHost]);
  // 이 탭이 방장이던 방이면(새로고침 뒤 선수 기억이 없어 입장 화면이 떴을 때) 손님이 아니라 방장으로 다시 연다.
  const onJoin = useCallback((p: Player) => {
    if (!roomCode) return;
    if (hostedCode() === roomCode) openHost(p, roomCode); else openGuest(p, roomCode);
  }, [roomCode, openHost, openGuest]);

  // 새로고침 복원 — 방장이던 탭은 방장으로, 손님이던 탭은 같은 clientId 로 다시 hello.
  useEffect(() => {
    if (!data || !roomCode || online || triedRestore.current) return;
    triedRestore.current = true;
    const last = readLast();
    const p = last === null ? null : data.players.find((x) => x.num === last) ?? null;
    if (!p) return;
    if (hostedCode() === roomCode) openHost(p, roomCode);
    else if (joinedCode() === roomCode) openGuest(p, roomCode);
  }, [data, roomCode, online, openHost, openGuest]);

  // 세션의 수명. advance 는 경기 화면의 rAF 도 부르지만, 로비·가려진 탭에서도 시간이 가게 느슨한 interval 을 하나 더 둔다
  // (가려진 탭은 브라우저가 1초로 늦추는데, 방장의 "멈춤" 스냅샷이 마침 1초마다라 그걸로 충분하다).
  useEffect(() => {
    if (!online) return;
    const s = online.session;
    const iv = setInterval(() => s.advance(now()), 250);
    const onVis = (): void => s.setHidden(document.hidden);
    const onHide = (): void => s.leave();   // 탭을 닫거나 떠난다 — bye 를 남긴다
    const onShow = (e: PageTransitionEvent): void => { if (e.persisted) location.reload(); };   // 뒤로 가기 캐시에서 돌아오면 세션이 죽어 있다
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', onHide);
    window.addEventListener('pageshow', onShow);
    onVis();
    return () => {
      clearInterval(iv);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('pageshow', onShow);
      s.leave();   // 이미 나갔으면 아무것도 안 한다
    };
  }, [online]);

  const view = useSyncExternalStore(online?.session.subscribe ?? noSub, online?.session.getView ?? noView, noView);

  // 세션이 끝났다(방장 끊김·거절·방 닫힘) — 입장 화면으로, 이유를 띄운다. 주소의 ?room= 은 남겨 다시 들어갈 수 있게.
  useEffect(() => {
    if (!online || !view || view.stage !== 'ended') return;
    // 이유 없이 끝난 건 내가 나간 것(나가기 또는 탭을 떠나며 pagehide) — 표시를 지우면 새로고침 복원이 깨진다. 나가기는 leaveRoom 이 지운다.
    if (view.endedWhy !== null) clearMarks();
    setMsg(view.endedWhy);
    setOnline(null);
  }, [online, view]);

  const leaveRoom = useCallback(() => {
    onlineRef.current?.session.leave();
    clearMarks();
    setRoomInUrl(null);
    setRoomCode(null);
    setMsg(null);
    setOnline(null);
  }, []);

  const share = useCallback(() => {
    const code = onlineRef.current?.code;
    if (!code) return;
    void shareInvite(code).then((r) => {
      if (r === 'copied') message.success('초대 링크를 복사했습니다');
      else if (r === 'shared') message.success('초대 링크를 보냈습니다');
      else if (r === 'manual') modal.info({ title: '초대 링크', content: <p className="game-invite-url">{inviteUrl(code)}</p>, okText: '닫기' });
    });
  }, [message, modal]);

  const readOverride = useCallback(() => live.current.override, []);

  if (!data) return <Loading title="게임" />;

  if (online && view && view.stage !== 'ended') {
    if (view.stage === 'joining') {
      return (
        <>
          <div className="page-head"><h1>방 <span className="game-code">{online.code}</span></h1>
            <div className="actions"><Button onClick={leaveRoom}>나가기</Button></div></div>
          <div className="stack">
            <p className="game-conn" role="status">
              {view.conn !== 'open' ? '연결하는 중…' : view.joinSlow ? '방장을 찾는 중입니다 — 방장이 방을 열어 두었는지 확인해 주세요' : '들어가는 중…'}
            </p>
          </div>
        </>
      );
    }
    return (
      <>
        <Lobby session={online.session} view={view} players={data.players} onLeave={leaveRoom} onShare={share} />
        {view.stage === 'match' && view.config && (
          <OnlineMatch key={view.matchKey} session={online.session} view={view} roster={data.players} readOverride={readOverride} onLeaveRoom={leaveRoom} />
        )}
      </>
    );
  }

  return (
    <>
      <Entry players={data.players} roomCode={roomCode} reopen={!!roomCode && hostedCode() === roomCode} message={msg} onSolo={startSolo} onCreate={onCreate} onJoin={onJoin} />
      {match && (
        <SoloMatch key={match.key} setup={match} live={live}
          onRestart={() => startSolo(match.req, match.roster)} onExit={() => setMatch(null)} />
      )}
    </>
  );
}
