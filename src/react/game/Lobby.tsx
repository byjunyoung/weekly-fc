// src/react/game/Lobby.tsx — 방(로비): 주황 | 대기 | 흰 세 칸, 방장은 사람을 옮기고 설정하고 시작한다. 손님은 같은 판을 보기만.
// 설계: docs/superpowers/specs/2026-11-06-game-online-design.md §3
// 사용자: "haxball 시스템 벤치마킹해" — 가져온 건 방 구조(두 팀 칸 + 대기 칸, 방장이 옮김)뿐이고 이름·모양·숫자는 포털 것이다.
// 옮기는 손짓은 포털 팀짜기(TeamsApp)와 같다: 사람을 누르고 → 칸을 누르면 옮겨진다. 다시 누르면 취소.
// 폰(390px)에서도 세 칸이 한 화면에 나란히 보이게 칩을 작게(얼굴 + 이름) 둔다 — 세로로 쌓으면 한눈에 안 들어온다.
// 2026-11-07 게임 묶음: 방은 게임 종류를 갖는다. 방장은 그 방 모드(2D/3D)의 게임 중에서 고르고(지금 2D 는 경기 하나라 읽기 전용 칩),
// 설정 칸·안내는 그 게임의 화면(views)이 그린다. 팀 칸·봇 자리·시작·자동 나누기는 어느 게임에나 같다.
import { App, Button, Modal, Segmented } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { avatarFaceSvg } from '../../components/avatar';
import { avatarSpecFor } from '../../lib/avatar';
import type { Member, Team } from '../../lib/game/room';
import { MAX_HUMANS, NO_PICKS } from '../../lib/game/room';
import { gameOf, gamesOf } from '../../lib/games/registry';
import type { Player } from '../../lib/types';
import type { GuestSession, HostSession, SessionView } from './net/session';
import { BotPickModal, BotSlot } from './BotSlot';
import { PlayerPicker } from './PlayerPicker';
import { TEAM } from './teams';
import { viewOf } from './views';

const COLS: { team: Team; label: string; color: string | null }[] = [
  { team: 0, label: TEAM[0].short, color: TEAM[0].color },
  { team: null, label: '대기', color: null },
  { team: 1, label: TEAM[1].short, color: TEAM[1].color },
];

export const connText = (c: SessionView['conn']): string | null =>
  c === 'open' ? null : c === 'connecting' ? '연결하는 중…' : '연결이 끊겼습니다 — 다시 붙는 중';

export function Lobby({ session, view, players, onLeave, onShare }: {
  session: HostSession | GuestSession; view: SessionView; players: Player[];
  onLeave: () => void; onShare: () => void;
}) {
  const { message } = App.useApp();
  const room = view.room;
  const host = session.role === 'host' ? session : null;
  const guest = session.role === 'guest' ? session : null;
  const [picked, setPicked] = useState<string | null>(null);
  const [repick, setRepick] = useState(false);
  /** 고르는 중인 봇 자리(방장). 사용자: "그리고 봇도 선수를 고를 수 있게 해줘". */
  const [botEdit, setBotEdit] = useState<{ side: 0 | 1; slot: number } | null>(null);

  // 안내(거절·시작 못 함)는 잠깐 띄우고 지운다.
  useEffect(() => {
    if (!view.notice) return;
    message.warning(view.notice);
    session.clearNotice();
  }, [view.notice, session, message]);
  // 옮기려고 집은 사람이 방에서 나가면 집은 것도 푼다.
  useEffect(() => { if (picked && !room?.members.some((m) => m.clientId === picked)) setPicked(null); }, [room, picked]);

  // 방 게임의 그림판 묶음이 무거우면(3D) 방에서 미리 받아 둔다 — 시작하자마자 경기 화면이 열리게.
  const surfaceKit = room ? viewOf(room.game)?.surface : undefined;
  useEffect(() => { void surfaceKit?.load().catch(() => { /* 경기 화면이 다시 시도하고 안내한다 */ }); }, [surfaceKit]);
  const byNum = useMemo(() => new Map(players.map((p) => [p.num, p])), [players]);
  const held = useMemo(() => new Set((room?.members ?? []).filter((m) => m.clientId !== view.clientId).map((m) => m.num)), [room, view.clientId]);
  if (!room) return null;
  const entry = gameOf(room.game), gv = viewOf(room.game);
  if (!entry || !gv) return null;   // 모르는 게임의 방은 parseMsg 가 이미 막는다
  const me = room.members.find((m) => m.clientId === view.clientId);
  const seats = entry.botSeats ? entry.botSeats(room) : null;
  const kinds = gamesOf(entry.mode);
  // 편이 없는 게임(자유 훈련장 — GameEntry.lobby 'all')은 "참가" 한 칸: 옮기기·자동 나누기·봇 칸이 없다(2026-11-07 2단계).
  const together = entry.lobby === 'all';
  const editable = !!host && room.phase === 'lobby';
  const block = host ? host.startBlock() : null;
  const conn = connText(view.conn);
  const hostName = room.members.find((m) => m.clientId === room.hostId)?.name ?? '';
  const picks = room.botPicks ?? NO_PICKS;
  const editNum = botEdit ? picks[botEdit.side][botEdit.slot] ?? null : null;
  // 고르기 창에서 흐리게 할 선수 — 방 사람이 잡은 선수 + 다른 봇 자리에 이미 고른 선수(지금 자리의 선수는 빼고).
  const botHeld = new Set<number>([...room.members.map((m) => m.num), ...picks[0], ...picks[1]].filter((n) => n !== editNum));

  const moveTo = (team: Team): void => {
    if (!editable || !picked) return;
    host!.move(picked, team);
    setPicked(null);
  };

  const chip = (m: Member) => {
    const p = byNum.get(m.num);
    const isMe = m.clientId === view.clientId;
    const cls = `game-chip${isMe ? ' is-me' : ''}${picked === m.clientId ? ' is-picked' : ''}`;
    const inner = (
      <>
        <span className="game-chip-face" aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: avatarFaceSvg(avatarSpecFor(m.num, p?.avatar ?? ''), 24, p?.jersey ?? '', true) }} />
        <span className="game-chip-name">{m.name}</span>
      </>
    );
    return editable ? (
      <button type="button" key={m.clientId} className={cls} aria-pressed={picked === m.clientId} aria-label={isMe ? `${m.name}(나)` : m.name}
        onClick={(e) => { e.stopPropagation(); setPicked((cur) => (cur === m.clientId ? null : m.clientId)); }}>{inner}</button>
    ) : <div key={m.clientId} className={cls} aria-label={isMe ? `${m.name}(나)` : m.name}>{inner}</div>;
  };

  /** 누를 수 없는 칩(참가 칸 — 옮길 칸이 없다). */
  const chipStatic = (m: Member) => {
    const p = byNum.get(m.num);
    const isMe = m.clientId === view.clientId;
    return (
      <div key={m.clientId} className={`game-chip${isMe ? ' is-me' : ''}`} aria-label={isMe ? `${m.name}(나)` : m.name}>
        <span className="game-chip-face" aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: avatarFaceSvg(avatarSpecFor(m.num, p?.avatar ?? ''), 24, p?.jersey ?? '', true) }} />
        <span className="game-chip-name">{m.name}</span>
      </div>
    );
  };

  return (
    <>
      <div className="page-head">
        <h1>방 <span className="game-code">{room.code}</span> <span className="muted">{room.members.length}명</span></h1>
        <div className="actions">
          {host && <Button onClick={onShare}>초대 링크 복사</Button>}
          <Button onClick={onLeave}>나가기</Button>
        </div>
      </div>
      <div className="stack">
        {conn && <p className="game-conn" role="status">{conn}</p>}
        {!conn && view.hostSlow && <p className="game-conn" role="status">방장 응답을 기다리는 중…</p>}
        {room.phase === 'match' && <p className="game-conn" role="status">경기가 진행 중입니다 — 곧 구경 화면이 열립니다</p>}
        <p className="muted game-hint" aria-live="polite">
          {together ? `편 없이 방 사람 모두가 같이 뜁니다(${MAX_HUMANS}명까지, 나머지는 구경)`
            : editable ? (picked ? '옮길 칸을 누르세요 · 다시 누르면 취소' : '이름을 누르고 칸을 누르면 옮겨집니다 · 빈자리는 봇이 채웁니다')
            : '방장이 팀을 나누는 중입니다'}
          {` · 방장 ${hostName}`}
        </p>
        {together ? (
          <div className="game-board is-together">
            <section className="game-col">
              <div className="game-col-head"><span>참가</span><span className="muted">{Math.min(MAX_HUMANS, room.members.length)}명</span></div>
              <div className="game-col-list">
                {room.members.slice(0, MAX_HUMANS).map((m) => chipStatic(m))}
                {room.members.length > MAX_HUMANS && <p className="muted game-hint">구경: {room.members.slice(MAX_HUMANS).map((m) => m.name).join(', ')}</p>}
              </div>
            </section>
          </div>
        ) : (
        <div className="game-board">
          {COLS.map((c) => {
            const list = room.members.filter((m) => m.team === c.team);
            const bots = c.team === null || !seats ? 0 : seats[c.team];
            return (
              <section key={String(c.team)} className={`game-col${editable && picked ? ' is-target' : ''}`}
                onClick={editable && picked ? () => moveTo(c.team) : undefined}>
                <button type="button" className="game-col-head" style={c.color ? { borderColor: c.color } : undefined}
                  disabled={!editable} aria-label={editable && picked ? `${c.label}(으)로 옮기기` : `${c.label} ${list.length}명`}
                  onClick={(e) => { e.stopPropagation(); moveTo(c.team); }}>
                  {c.color && <span className="game-col-dot" style={{ background: c.color }} aria-hidden="true" />}
                  <span>{c.label}</span>
                  <span className="muted">{c.team === null ? list.length : `${list.length + bots}명`}</span>
                </button>
                <div className="game-col-list">
                  {list.map(chip)}
                  {/* 빈자리 = 봇. 방장은 눌러서 그 자리에 세울 선수를 고르고, 손님은 보기만 한다. */}
                  {c.team !== null && Array.from({ length: bots }, (_, i) => {
                    const side = c.team as 0 | 1;
                    const num = picks[side][i];
                    const tag = entry.botSeatTag?.(room, side, i) ?? undefined;
                    return <BotSlot key={`bot${i}`} label={`${c.label} ${tag ?? '봇'} ${i + 1}`} tag={tag} player={num === undefined ? null : byNum.get(num) ?? null}
                      onClick={editable ? () => { setPicked(null); setBotEdit({ side, slot: i }); } : undefined} />;
                  })}
                </div>
              </section>
            );
          })}
        </div>
        )}

        <div className="card">
          <gv.Settings room={room} players={players} editable={editable}
            onChange={host ? (patch) => host.setSettings(patch) : null}
            lead={host && (
              <label className="game-opt"><span className="muted">게임 종류</span>
                {kinds.length > 1
                  ? <Segmented<string> value={room.game} disabled={!editable} onChange={(v) => host.setGame(v)}
                      options={kinds.map((k) => ({ value: k.adapter.id, label: k.name }))} />
                  : <span className="chip" aria-readonly="true">{entry.name}</span>}
              </label>
            )} />
          <div className="game-actions">
            {host && <Button type="primary" size="large" disabled={!editable || !!block} onClick={() => host.start()}>시작</Button>}
            {host && !together && <Button size="large" disabled={!editable} onClick={() => { setPicked(null); host.autoBalance(); }}>자동 나누기</Button>}
            {guest && <Button size="large" disabled={room.phase !== 'lobby'} onClick={() => setRepick(true)}>선수 바꾸기</Button>}
          </div>
          {host && gv.hostHint && <p className="muted game-hint">{gv.hostHint}</p>}
          {block && <p className="muted game-hint">{block}</p>}
          <p className="muted game-hint">{gv.controls}</p>
        </div>
      </div>

      {host && (
        <BotPickModal open={!!botEdit} title={botEdit ? `${COLS.find((c) => c.team === botEdit.side)?.label} 봇 ${botEdit.slot + 1}` : ''}
          players={players} value={editNum} held={botHeld}
          onPick={(num) => { if (botEdit) host.setBotPick(botEdit.side, botEdit.slot, num); setBotEdit(null); }}
          onClose={() => setBotEdit(null)} />
      )}
      {guest && (
        <Modal open={repick} title="선수 바꾸기" footer={null} onCancel={() => setRepick(false)} destroyOnHidden>
          <PlayerPicker players={players} value={me?.num ?? null} held={held}
            onPick={(p) => { guest.pick(p.num, p.name); try { localStorage.setItem('wfc:game:last', String(p.num)); } catch { /* 저장 못 해도 된다 */ } setRepick(false); }} />
        </Modal>
      )}
    </>
  );
}
