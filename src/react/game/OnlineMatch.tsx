// src/react/game/OnlineMatch.tsx — 온라인 경기 화면. 계산은 세션(방장·손님)이, 그리기·조작은 그 게임의 화면(GameView)이, 틀은 MatchFrame 이 한다.
// 설계: docs/superpowers/specs/2026-11-06-game-online-design.md §3, 2026-11-07-games-program-design.md §2
// 사용자: "PC 모바일 둘다 최적화". 한마디는 PC 숫자 1~6. 프레임마다 리액트 상태를 건드리지 않는다:
// rAF 가 세션의 advance/frame 을 부르고 장면에 그린다. 리액트 상태는 세션 view(바뀔 때만 새 객체), 한마디 메뉴 열림, 터치 여부뿐.
import { App, Button } from 'antd';
import { PHRASES } from '../../lib/games/net';
import type { AnyAdapter } from '../../lib/games/adapter';
import type { Player } from '../../lib/types';
import type { GuestSession, HostSession, SessionView } from './net/session';
import { connText } from './Lobby';
import { MatchOverlay, usePlaySurface, type Live, type ResultBox } from './MatchFrame';
import { play as playSfx } from './sfx';
import type { AnyView } from './views/types';

export function OnlineMatch({ session, view, adapter, gameView, roster, live, onLeaveRoom }: {
  session: HostSession | GuestSession; view: SessionView; adapter: AnyAdapter; gameView: AnyView; roster: Player[];
  /** 디버그 훅(?debug=1)과 나눠 쓰는 값 — override(입력 덮어쓰기)를 읽고 camera 를 써 둔다. */
  live: React.RefObject<Live>;
  onLeaveRoom: () => void;
}) {
  const { modal } = App.useApp();
  const config = view.config;
  const playing = view.myId !== null;
  const isHost = session.role === 'host';

  const { refs, touch, wait, fail } = usePlaySurface({
    view: gameView, config, roster, playing, live, myId: view.myId,
    run: ({ scene, readHuman }) => {
      session.setInputReader(playing ? readHuman : null);
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
      let lastShown: unknown = null;
      const frame = (now: number): void => {
        raf = requestAnimationFrame(frame);
        session.advance(now);
        const f = session.frame(now);
        if (!f) return;
        // 효과음 — 그리는 상태가 바뀐 것으로 알아낸다(방장·손님·구경 모두 같은 길). 틱이 뒤로 가면(새 경기) 비교하지 않는다.
        if (lastShown !== null && adapter.tick(f.state) >= adapter.tick(lastShown)) for (const fx of gameView.sfx(lastShown, f.state, config)) playSfx(fx);
        lastShown = f.state;
        scene.draw(f);
        live.current.camera = scene.camera();
      };
      raf = requestAnimationFrame(frame);
      return () => {
        cancelAnimationFrame(raf);
        window.removeEventListener('keydown', onKey);
        session.setInputReader(null);
      };
    },
  });

  if (config == null) return null;
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

  const result: ResultBox | null = view.result == null ? null : {
    ...gameView.result(view.result, config, { myId: view.myId, solo: false }),
    actions: isHost
      ? <div className="game-result-actions"><Button type="primary" size="large" onClick={() => (session as HostSession).toLobby()}>바로 방으로</Button></div>
      : <p className="muted">잠시 뒤 방으로 돌아갑니다</p>,
  };

  return (
    <MatchOverlay refs={refs} xLabel={isHost ? '경기 멈추기' : '방에서 나가기'} onX={confirmExit}
      say={playing ? (k) => { session.say(k); } : undefined} watching={!playing}
      banner={conn || view.paused || view.hostSlow ? conn ?? (view.paused ? '방장이 잠깐 자리를 비웠습니다' : '방장 응답을 기다리는 중…') : null}
      kickShown={touch && playing && !result} result={result} wait={wait} fail={fail} />
  );
}
