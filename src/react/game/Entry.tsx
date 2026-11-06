// src/react/game/Entry.tsx — 입장 화면(/game/): 오락실식 선수 선택(select/PlayerSelect) + [방 만들기] / [혼자 연습]. ?room=CODE 로 오면 [들어가기].
// 설계: docs/superpowers/specs/2026-11-06-game-online-design.md §3. 혼자 연습은 1단계 흐름 그대로다 — 인원·시간·점수 설정을 그 뒤로 옮겼을 뿐.
// 사용자: "2단계 온라인으로 넘어가자", "PC 모바일 둘다 최적화".
// 2026-11-07 게임 묶음: 제목·안내 글과 혼자 연습 칸은 고른 게임(주소의 ?g=)의 화면(views)이 낸다. 선수 고르기·방 만들기·들어가기는 공용.
import { href } from '../../lib/url';
import { Button } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { gameOf } from '../../lib/games/registry';
import type { Player } from '../../lib/types';
import { useMeInfo } from '../useMe';
import { PlayerSelect } from './select/PlayerSelect';
import { viewOf } from './views';
import type { SoloSetup } from './views/types';

const LAST_KEY = 'wfc:game:last';          // 마지막으로 고른 내 선수(번호)

export function readLast(): number | null {
  try { const v = Number(localStorage.getItem(LAST_KEY)); return Number.isInteger(v) && v > 0 ? v : null; } catch { return null; }
}
function saveLast(n: number): void {
  try { localStorage.setItem(LAST_KEY, String(n)); } catch { /* 저장 못 해도 판은 할 수 있다 */ }
}

export function Entry({ game, players, roomCode, reopen = false, message, onSolo, onCreate, onJoin }: {
  /** 혼자 하기·방 만들기에 쓸 게임(주소의 ?g=, 없으면 기본 게임). 방에 들어갈 땐 방장이 고른 게임이 따로 온다. */
  game: string;
  players: Player[];
  /** 주소의 ?room= (형식 검사를 거친 것). 있으면 [방 만들기] 대신 [들어가기]. */
  roomCode: string | null;
  /** 이 탭이 그 방의 방장이었다(새로고침) — [들어가기] 대신 [방 다시 열기]. */
  reopen?: boolean;
  /** 방에서 나오게 된 이유(끊김·거절 등). */
  message: string | null;
  onSolo: (make: () => SoloSetup<unknown>) => void;
  onCreate: (p: Player) => void;
  onJoin: (p: Player) => void;
}) {
  const me = useMeInfo();
  const [picked, setPicked] = useState<number | null>(null);
  const [last, setLast] = useState<number | null>(null);
  const [solo, setSolo] = useState(false);
  const soloRef = useRef<HTMLDivElement>(null);
  // 혼자 연습 설정은 명단 아래에 열린다 — 폰에선 명단이 길어 안 보이니 열자마자 그 자리로 내려 준다.
  useEffect(() => { if (solo) soloRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, [solo]);
  useEffect(() => { setLast(readLast()); }, []);
  const entry = gameOf(game), gv = viewOf(game);
  const can = players.length >= (gv?.minRoster ?? 2);   // 명단이 모자라면 판을 못 만든다(경기: 두 명)

  const has = (n: number | null | undefined): n is number => n != null && players.some((p) => p.num === n);
  // 고른 사람 > 지난번 > 로그인해 차지한 내 선수. 로그인은 없어도 된다.
  const num = has(picked) ? picked : has(last) ? last : has(me.num) ? me.num : null;
  const player = num === null ? null : players.find((p) => p.num === num) ?? null;
  if (!entry || !gv) return null;   // 등록부와 화면 등록부는 같은 id 로 짝을 맞춘다(registry.ts·views/index.ts)

  return (
    <>
      <div className="page-head"><h1>{entry.name} <span className="muted">{roomCode ? `방 ${roomCode}` : gv.entry.sub}</span></h1>
        <div className="actions"><a className="chip" href={href('/games/')}>게임 목록</a></div></div>
      <div className="stack">
        {message && <p className="game-conn" role="status">{message}</p>}
        {/* 오락실식 선수 선택 — "선택한 선수 크게 오른쪽에 다른 선수 리스트 … 약간 옛날 오락실게임에서 고르듯이"(2026-11-07).
            버튼은 큰 칸 아래(폰에선 화면 아래에 붙는다). Enter 는 주 버튼. */}
        <PlayerSelect roster={players} value={num} title="선수 선택"
          onChange={(n) => { setPicked(n); saveLast(n); }}
          onConfirm={() => { if (!player) return; if (roomCode) onJoin(player); else if (can) onCreate(player); }}
          header={roomCode
            ? (reopen ? <>내가 만든 방 <b className="game-code">{roomCode}</b> 을 다시 엽니다</> : <>방 <b className="game-code">{roomCode}</b> 에 들어갑니다</>)
            : gv.entry.header}
          actions={roomCode ? (
            <>
              <Button type="primary" size="large" disabled={!player} onClick={() => player && onJoin(player)}>
                {!player ? '내 선수를 골라 주세요' : reopen ? '방 다시 열기' : '들어가기'}
              </Button>
              <Button type="link" onClick={() => setSolo((v) => !v)}>혼자 연습</Button>
            </>
          ) : (
            <>
              <Button type="primary" size="large" disabled={!player || !can} onClick={() => player && onCreate(player)}>
                {player ? '방 만들기' : '내 선수를 골라 주세요'}
              </Button>
              <Button size="large" aria-expanded={solo} onClick={() => setSolo((v) => !v)}>혼자 연습</Button>
            </>
          )} />
        <gv.Solo open={solo} cardRef={soloRef} players={players} num={num} onStart={onSolo} />
      </div>
    </>
  );
}

