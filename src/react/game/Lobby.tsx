// src/react/game/Lobby.tsx — 방(로비): 주황 | 대기 | 흰 세 칸, 방장은 사람을 옮기고 설정하고 시작한다. 손님은 같은 판을 보기만.
// 설계: docs/superpowers/specs/2026-11-06-game-online-design.md §3
// 사용자: "haxball 시스템 벤치마킹해" — 가져온 건 방 구조(두 팀 칸 + 대기 칸, 방장이 옮김)뿐이고 이름·모양·숫자는 포털 것이다.
// 옮기는 손짓은 포털 팀짜기(TeamsApp)와 같다: 사람을 누르고 → 칸을 누르면 옮겨진다. 다시 누르면 취소.
// 폰(390px)에서도 세 칸이 한 화면에 나란히 보이게 칩을 작게(얼굴 + 이름) 둔다 — 세로로 쌓으면 한눈에 안 들어온다.
import { App, Button, Modal, Segmented } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { avatarFaceSvg } from '../../components/avatar';
import { avatarSpecFor } from '../../lib/avatar';
import type { FieldChoice, Member, PerSide, RoomState, Team } from '../../lib/game/room';
import { MAX_PER_SIDE, resolveField, sideSizes } from '../../lib/game/room';
import type { Player } from '../../lib/types';
import type { GuestSession, HostSession, SessionView } from './net/session';
import { FIELD_OPTIONS, SCORE_LIMITS } from './Entry';
import { PlayerPicker } from './PlayerPicker';
import { TEAM } from './render';
import { maxPerSide } from './view';

const COLS: { team: Team; label: string; color: string | null }[] = [
  { team: 0, label: TEAM[0].short, color: TEAM[0].color },
  { team: null, label: '대기', color: null },
  { team: 1, label: TEAM[1].short, color: TEAM[1].color },
];

export const connText = (c: SessionView['conn']): string | null =>
  c === 'open' ? null : c === 'connecting' ? '연결하는 중…' : '연결이 끊겼습니다 — 다시 붙는 중';

const fieldLabel = (f: FieldChoice): string => FIELD_OPTIONS.find((o) => o.value === f)?.label ?? '보통';

/** 경기장 줄 — 자동이면 지금 칸 인원으로 고를 크기도 같이("자동 · 보통"). */
const fieldText = (r: RoomState): string => (r.settings.field === 'auto' ? `자동 · ${fieldLabel(resolveField(r))}` : fieldLabel(r.settings.field));

function settingsText(r: RoomState): string {
  const s = r.settings;
  const [a, b] = sideSizes(r);
  const bots = s.perSide ? `한 편 ${s.perSide}명까지 봇으로 채움` : '봇 없음';
  return `${a}대${b} · ${bots} · 경기장 ${fieldText(r)} · ${s.minutes}분 · ${s.scoreLimit ? `${s.scoreLimit}점 먼저` : '점수 제한 없음'}`;
}

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

  // 안내(거절·시작 못 함)는 잠깐 띄우고 지운다.
  useEffect(() => {
    if (!view.notice) return;
    message.warning(view.notice);
    session.clearNotice();
  }, [view.notice, session, message]);
  // 옮기려고 집은 사람이 방에서 나가면 집은 것도 푼다.
  useEffect(() => { if (picked && !room?.members.some((m) => m.clientId === picked)) setPicked(null); }, [room, picked]);

  const byNum = useMemo(() => new Map(players.map((p) => [p.num, p])), [players]);
  const held = useMemo(() => new Set((room?.members ?? []).filter((m) => m.clientId !== view.clientId).map((m) => m.num)), [room, view.clientId]);
  if (!room) return null;
  const me = room.members.find((m) => m.clientId === view.clientId);
  const ps = room.settings.perSide;
  const editable = !!host && room.phase === 'lobby';
  const block = host ? host.startBlock() : null;
  const conn = connText(view.conn);
  const hostName = room.members.find((m) => m.clientId === room.hostId)?.name ?? '';

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
          {editable ? (picked ? '옮길 칸을 누르세요 · 다시 누르면 취소' : '이름을 누르고 칸을 누르면 옮겨집니다 · 빈자리는 봇이 채웁니다')
            : '방장이 팀을 나누는 중입니다'}
          {` · 방장 ${hostName}`}
        </p>
        <div className="game-board">
          {COLS.map((c) => {
            const list = room.members.filter((m) => m.team === c.team);
            const bots = c.team === null ? 0 : Math.max(0, ps - list.length);
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
                  {Array.from({ length: bots }, (_, i) => <div key={`bot${i}`} className="game-chip is-bot" aria-label="빈자리(봇)">봇</div>)}
                </div>
              </section>
            );
          })}
        </div>

        <div className="card">
          {host ? (
            <div className="game-opts">
              {/* 인원 = "한 편을 이 수까지 봇으로 채운다"(2026-11-07 "최대 인원 같은거 헥스볼처럼 자유롭게") — 사람이 더 많은 편은 사람 수대로 다 뛴다. */}
              <label className="game-opt"><span className="muted">봇으로 채움</span>
                <Segmented<number> value={ps} disabled={!editable} onChange={(v) => host.setSettings({ perSide: v as PerSide })}
                  options={Array.from({ length: MAX_PER_SIDE + 1 }, (_, n) => ({ value: n, label: n ? `${n}명까지` : '안 채움', disabled: n > maxPerSide(players.length) }))} /></label>
              <label className="game-opt"><span className="muted">경기장</span>
                <Segmented<FieldChoice> value={room.settings.field} disabled={!editable} onChange={(v) => host.setSettings({ field: v })}
                  options={FIELD_OPTIONS.map((o) => (o.value === 'auto' && room.settings.field === 'auto' ? { ...o, label: `자동 · ${fieldLabel(resolveField(room))}` } : o))} /></label>
              <label className="game-opt"><span className="muted">시간</span>
                <Segmented<number> value={room.settings.minutes} disabled={!editable} onChange={(v) => host.setSettings({ minutes: v })}
                  options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: `${n}분` }))} /></label>
              <label className="game-opt"><span className="muted">점수 제한</span>
                <Segmented<number> value={room.settings.scoreLimit} disabled={!editable} onChange={(v) => host.setSettings({ scoreLimit: v })}
                  options={SCORE_LIMITS.map((n) => ({ value: n, label: n ? `${n}점` : '없음' }))} /></label>
            </div>
          ) : <p className="muted">{settingsText(room)}</p>}
          <div className="game-actions">
            {host && <Button type="primary" size="large" disabled={!editable || !!block} onClick={() => host.start()}>시작</Button>}
            {host && <Button size="large" disabled={!editable} onClick={() => { setPicked(null); host.autoBalance(); }}>자동 나누기</Button>}
            {guest && <Button size="large" disabled={room.phase !== 'lobby'} onClick={() => setRepick(true)}>선수 바꾸기</Button>}
          </div>
          {host && <p className="muted game-hint">한 편이 봇으로 채울 수보다 적으면 봇이 들어갑니다 · 두 편 인원이 달라도 됩니다 · 한 편 6명까지</p>}
          {block && <p className="muted game-hint">{block}</p>}
          <p className="muted game-hint">PC: 방향키·WASD 이동, 스페이스 킥, 숫자 1~6 한마디 · 폰: 왼쪽을 끌어 이동, 오른쪽 버튼으로 킥</p>
        </div>
      </div>

      {guest && (
        <Modal open={repick} title="선수 바꾸기" footer={null} onCancel={() => setRepick(false)} destroyOnHidden>
          <PlayerPicker players={players} value={me?.num ?? null} held={held}
            onPick={(p) => { guest.pick(p.num, p.name); try { localStorage.setItem('wfc:game:last', String(p.num)); } catch { /* 저장 못 해도 된다 */ } setRepick(false); }} />
        </Modal>
      )}
    </>
  );
}
