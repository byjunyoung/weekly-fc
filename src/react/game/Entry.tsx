// src/react/game/Entry.tsx — 입장 화면(/game/): 내 선수 고르기 + [방 만들기] / [혼자 연습]. ?room=CODE 로 오면 [들어가기].
// 설계: docs/superpowers/specs/2026-11-06-game-online-design.md §3. 혼자 연습은 1단계 흐름 그대로다 — 인원·시간·점수 설정을 그 뒤로 옮겼을 뿐.
// 사용자: "2단계 온라인으로 넘어가자", "PC 모바일 둘다 최적화".
import { Button, Segmented } from 'antd';
import { useEffect, useState } from 'react';
import type { Player } from '../../lib/types';
import { useMeInfo } from '../useMe';
import { PlayerPicker } from './PlayerPicker';
import type { Req } from './SoloMatch';
import { maxPerSide } from './view';

const LAST_KEY = 'wfc:game:last';          // 마지막으로 고른 내 선수(번호)
const SCORE_LIMITS = [0, 1, 3, 5] as const;

export function readLast(): number | null {
  try { const v = Number(localStorage.getItem(LAST_KEY)); return Number.isInteger(v) && v > 0 ? v : null; } catch { return null; }
}
function saveLast(n: number): void {
  try { localStorage.setItem(LAST_KEY, String(n)); } catch { /* 저장 못 해도 판은 할 수 있다 */ }
}

export function Entry({ players, roomCode, reopen = false, message, onSolo, onCreate, onJoin }: {
  players: Player[];
  /** 주소의 ?room= (형식 검사를 거친 것). 있으면 [방 만들기] 대신 [들어가기]. */
  roomCode: string | null;
  /** 이 탭이 그 방의 방장이었다(새로고침) — [들어가기] 대신 [방 다시 열기]. */
  reopen?: boolean;
  /** 방에서 나오게 된 이유(끊김·거절 등). */
  message: string | null;
  onSolo: (req: Req, roster: Player[]) => void;
  onCreate: (p: Player) => void;
  onJoin: (p: Player) => void;
}) {
  const me = useMeInfo();
  const [picked, setPicked] = useState<number | null>(null);
  const [last, setLast] = useState<number | null>(null);
  const [solo, setSolo] = useState(false);
  useEffect(() => { setLast(readLast()); }, []);
  const max = maxPerSide(players.length);
  const [perSide, setPerSide] = useState<1 | 2 | 3 | 4>(3);
  const [minutes, setMinutes] = useState(3);
  const [scoreLimit, setScoreLimit] = useState<number>(0);

  const has = (n: number | null | undefined): n is number => n != null && players.some((p) => p.num === n);
  // 고른 사람 > 지난번 > 로그인해 차지한 내 선수. 로그인은 없어도 된다.
  const num = has(picked) ? picked : has(last) ? last : has(me.num) ? me.num : null;
  const player = num === null ? null : players.find((p) => p.num === num) ?? null;
  const per = Math.min(perSide, Math.max(1, max)) as 1 | 2 | 3 | 4;
  const ok = num !== null && max >= 1;

  return (
    <>
      <div className="page-head"><h1>게임 <span className="muted">{roomCode ? `방 ${roomCode}` : '같이 한 판, 또는 혼자서 봇과'}</span></h1></div>
      <div className="stack">
        {message && <p className="game-conn" role="status">{message}</p>}
        <div className="card">
          <div className="card-head"><h2>내 선수</h2></div>
          <PlayerPicker players={players} value={num} onPick={(p) => { setPicked(p.num); saveLast(p.num); }} />
        </div>
        <div className="card">
          {roomCode ? (
            <>
              <p className="game-join-msg">{reopen ? <>내가 만든 방 <b className="game-code">{roomCode}</b> 을 다시 엽니다</> : <>방 <b className="game-code">{roomCode}</b> 에 들어갑니다</>}</p>
              <div className="game-actions">
                <Button type="primary" size="large" disabled={!player} onClick={() => player && onJoin(player)}>
                  {!player ? '내 선수를 골라 주세요' : reopen ? '방 다시 열기' : '들어가기'}
                </Button>
                <Button type="link" onClick={() => setSolo((v) => !v)}>혼자 연습</Button>
              </div>
            </>
          ) : (
            <div className="game-actions">
              <Button type="primary" size="large" disabled={!player || max < 1} onClick={() => player && onCreate(player)}>
                {player ? '방 만들기' : '내 선수를 골라 주세요'}
              </Button>
              <Button size="large" aria-expanded={solo} onClick={() => setSolo((v) => !v)}>혼자 연습</Button>
            </div>
          )}
          {!roomCode && <p className="muted game-hint">방을 만들면 초대 링크가 생깁니다. 빈자리는 봇이 채웁니다.</p>}
        </div>
        {solo && (
          <div className="card">
            <div className="card-head"><h2>혼자 연습 <span className="muted">봇과 한 판</span></h2></div>
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
              <Button type="primary" size="large" disabled={!ok} onClick={() => ok && onSolo({ num, perSide: per, minutes, scoreLimit }, players)}>
                {ok ? '시작' : '내 선수를 골라 주세요'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export { SCORE_LIMITS };
