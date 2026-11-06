// src/react/game/Entry.tsx — 입장 화면(/game/): 내 선수 고르기 + [방 만들기] / [혼자 연습]. ?room=CODE 로 오면 [들어가기].
// 설계: docs/superpowers/specs/2026-11-06-game-online-design.md §3. 혼자 연습은 1단계 흐름 그대로다 — 인원·시간·점수 설정을 그 뒤로 옮겼을 뿐.
// 사용자: "2단계 온라인으로 넘어가자", "PC 모바일 둘다 최적화".
import { href } from '../../lib/url';
import { Button, Segmented } from 'antd';
import { useEffect, useState } from 'react';
import type { BotPicks, FieldChoice } from '../../lib/game/room';
import { updatePicks } from '../../lib/game/room';
import { BotPickModal, BotSlot } from './BotSlot';
import type { Player } from '../../lib/types';
import { useMeInfo } from '../useMe';
import { PlayerPicker } from './PlayerPicker';
import type { Req } from './SoloMatch';
import { maxPerSide } from './view';

const LAST_KEY = 'wfc:game:last';          // 마지막으로 고른 내 선수(번호)
const SCORE_LIMITS = [0, 1, 3, 5] as const;
/** 경기장 고르기(2026-11-07 "맵 크기도 크기별로") — 방 설정과 혼자 연습이 같이 쓴다. */
export const FIELD_OPTIONS: { value: FieldChoice; label: string }[] = [
  { value: 'auto', label: '자동' }, { value: 'S', label: '작게' }, { value: 'M', label: '보통' }, { value: 'L', label: '크게' }, { value: 'XL', label: '아주 크게' },
];

export function readLast(): number | null {
  try { const v = Number(localStorage.getItem(LAST_KEY)); return Number.isInteger(v) && v > 0 ? v : null; } catch { return null; }
}
function saveLast(n: number): void {
  try { localStorage.setItem(LAST_KEY, String(n)); } catch { /* 저장 못 해도 판은 할 수 있다 */ }
}

// 혼자 연습에서 마지막으로 고른 봇(우리 편·상대) — "그리고 봇도 선수를 고를 수 있게 해줘". 모양이 틀리면 전부 무작위로.
const SOLO_BOTS_KEY = 'wfc:game:solo-bots';
function readSoloBots(): BotPicks {
  try {
    const v = JSON.parse(localStorage.getItem(SOLO_BOTS_KEY) ?? 'null') as unknown;
    const ok = (l: unknown): l is number[] => Array.isArray(l) && l.length <= 6 && l.every((n) => Number.isInteger(n) && n > 0);
    if (Array.isArray(v) && v.length === 2 && ok(v[0]) && ok(v[1])) return [v[0], v[1]];
  } catch { /* 아래로 */ }
  return [[], []];
}
function saveSoloBots(p: BotPicks): void {
  try { localStorage.setItem(SOLO_BOTS_KEY, JSON.stringify(p)); } catch { /* 저장 못 해도 판은 할 수 있다 */ }
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
  const [perSide, setPerSide] = useState<Req['perSide']>(3);
  const [field, setField] = useState<FieldChoice>('auto');
  const [bots, setBots] = useState<BotPicks>([[], []]);
  const [botEdit, setBotEdit] = useState<{ side: 0 | 1; slot: number } | null>(null);
  useEffect(() => { setBots(readSoloBots()); }, []);
  const [minutes, setMinutes] = useState(3);
  const [scoreLimit, setScoreLimit] = useState<number>(0);

  const has = (n: number | null | undefined): n is number => n != null && players.some((p) => p.num === n);
  // 고른 사람 > 지난번 > 로그인해 차지한 내 선수. 로그인은 없어도 된다.
  const num = has(picked) ? picked : has(last) ? last : has(me.num) ? me.num : null;
  const player = num === null ? null : players.find((p) => p.num === num) ?? null;
  const per = Math.min(perSide, Math.max(1, max)) as Req['perSide'];
  const ok = num !== null && max >= 1;
  // 내 선수는 봇으로 못 고른다 — 내 선수를 바꿔 겹치게 되면 그 자리는 보여 주지도, 쓰지도 않는다(pickLineup 도 건너뛴다).
  const soloBots: BotPicks = [bots[0].filter((n) => n !== num), bots[1].filter((n) => n !== num)];
  const byNum = new Map(players.map((p) => [p.num, p]));
  const editNum = botEdit ? soloBots[botEdit.side][botEdit.slot] ?? null : null;
  const botHeld = new Set<number>([...(num !== null ? [num] : []), ...soloBots[0], ...soloBots[1]].filter((n) => n !== editNum));
  const setBot = (side: 0 | 1, slot: number, n: number | null): void => {
    const next = updatePicks(soloBots, side, slot, n, (x) => x !== num && byNum.has(x));
    if (next !== soloBots) { setBots(next); saveSoloBots(next); }
  };
  const botRow = (side: 0 | 1, count: number, label: string) => (
    <div className="game-botrow" role="group" aria-label={`${label} 봇`}>
      <span className="muted game-botrow-label">{label}</span>
      {count === 0 ? <span className="muted">봇 없음(나 혼자)</span> : Array.from({ length: count }, (_, i) => {
        const n = soloBots[side][i];
        return <BotSlot key={i} label={`${label} 봇 ${i + 1}`} player={n === undefined ? null : byNum.get(n) ?? null} onClick={() => setBotEdit({ side, slot: i })} />;
      })}
    </div>
  );

  return (
    <>
      <div className="page-head"><h1>경기 <span className="muted">{roomCode ? `방 ${roomCode}` : '2D · 같이 한 판, 또는 혼자서 봇과'}</span></h1>
        <div className="actions"><a className="chip" href={href('/games/')}>게임 목록</a></div></div>
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
                <Segmented<number> value={per} onChange={(v) => setPerSide(v as Req['perSide'])}
                  options={[1, 2, 3, 4, 5, 6].map((n) => ({ value: n, label: `${n}대${n}`, disabled: n > max }))} /></label>
              {/* 봇으로 뛸 선수 — 비워 두면 무작위. 사용자: "그리고 봇도 선수를 고를 수 있게 해줘". */}
              <div className="game-botrows">
                {botRow(0, per - 1, '우리 편')}
                {botRow(1, per, '상대')}
              </div>
              <label className="game-opt"><span className="muted">경기장</span>
                <Segmented<FieldChoice> value={field} onChange={setField} options={FIELD_OPTIONS} /></label>
              <label className="game-opt"><span className="muted">시간</span>
                <Segmented<number> value={minutes} onChange={setMinutes} options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: `${n}분` }))} /></label>
              <label className="game-opt"><span className="muted">점수 제한</span>
                <Segmented<number> value={scoreLimit} onChange={setScoreLimit} options={SCORE_LIMITS.map((n) => ({ value: n, label: n ? `${n}점` : '없음' }))} /></label>
            </div>
            <p className="muted game-hint">PC: 방향키·WASD로 이동, 스페이스나 Shift로 킥 · 폰: 왼쪽을 끌어 이동, 오른쪽 버튼으로 킥</p>
            {max < 1 && <p className="muted">명단이 두 명은 있어야 판을 만들 수 있습니다.</p>}
            <div className="game-start">
              <Button type="primary" size="large" disabled={!ok} onClick={() => ok && onSolo({ num, perSide: per, minutes, scoreLimit, field, botPicks: soloBots }, players)}>
                {ok ? '시작' : '내 선수를 골라 주세요'}
              </Button>
            </div>
          </div>
        )}
      </div>
      <BotPickModal open={!!botEdit} title={botEdit ? `${botEdit.side === 0 ? '우리 편' : '상대'} 봇 ${botEdit.slot + 1}` : ''}
        players={players} value={editNum} held={botHeld}
        onPick={(n) => { if (botEdit) setBot(botEdit.side, botEdit.slot, n); setBotEdit(null); }}
        onClose={() => setBotEdit(null)} />
    </>
  );
}

export { SCORE_LIMITS };
