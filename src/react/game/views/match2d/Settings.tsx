// src/react/game/views/match2d/Settings.tsx — 방(로비)의 2D 경기 설정 칸(2026-11-06). Lobby.tsx 에 있던 것을 그대로 옮겼다(2026-11-07 게임 묶음 —
// 설정은 게임마다 다르고 방 화면은 공용이 되어서). 방장은 고르고, 손님은 한 줄 요약을 본다.
import { Segmented } from 'antd';
import type { FieldChoice, PerSide, Room2d, RoomSettings } from '../../../../lib/games/match2d-room';
import { resolveField, sideSizes } from '../../../../lib/games/match2d-room';
import { MAX_PER_SIDE } from '../../../../lib/game/room';
import type { SettingsProps } from '../types';
import { FIELD_OPTIONS, SCORE_LIMITS } from './options';
import { maxPerSide } from './view';

const fieldLabel = (f: FieldChoice): string => FIELD_OPTIONS.find((o) => o.value === f)?.label ?? '보통';

/** 경기장 줄 — 자동이면 지금 칸 인원으로 고를 크기도 같이("자동 · 보통"). */
const fieldText = (r: Room2d): string => (r.settings.field === 'auto' ? `자동 · ${fieldLabel(resolveField(r))}` : fieldLabel(r.settings.field));

function settingsText(r: Room2d): string {
  const s = r.settings;
  const [a, b] = sideSizes(r);
  const bots = s.perSide ? `한 편 ${s.perSide}명까지 봇으로 채움` : '봇 없음';
  return `${a}대${b} · ${bots} · 경기장 ${fieldText(r)} · ${s.minutes}분 · ${s.scoreLimit ? `${s.scoreLimit}점 먼저` : '점수 제한 없음'}`;
}

export function Settings({ room, players, editable, onChange, lead }: SettingsProps<RoomSettings>) {
  if (!onChange) return <p className="muted">{settingsText(room)}</p>;
  const ps = room.settings.perSide;
  return (
    <div className="game-opts">
      {lead}
      {/* 인원 = "한 편을 이 수까지 봇으로 채운다"(2026-11-07 "최대 인원 같은거 헥스볼처럼 자유롭게") — 사람이 더 많은 편은 사람 수대로 다 뛴다. */}
      <label className="game-opt"><span className="muted">봇으로 채움</span>
        <Segmented<number> value={ps} disabled={!editable} onChange={(v) => onChange({ perSide: v as PerSide })}
          options={Array.from({ length: MAX_PER_SIDE + 1 }, (_, n) => ({ value: n, label: n ? `${n}명까지` : '안 채움', disabled: n > maxPerSide(players.length) }))} /></label>
      <label className="game-opt"><span className="muted">경기장</span>
        <Segmented<FieldChoice> value={room.settings.field} disabled={!editable} onChange={(v) => onChange({ field: v })}
          options={FIELD_OPTIONS.map((o) => (o.value === 'auto' && room.settings.field === 'auto' ? { ...o, label: `자동 · ${fieldLabel(resolveField(room))}` } : o))} /></label>
      <label className="game-opt"><span className="muted">시간</span>
        <Segmented<number> value={room.settings.minutes} disabled={!editable} onChange={(v) => onChange({ minutes: v })}
          options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: `${n}분` }))} /></label>
      <label className="game-opt"><span className="muted">점수 제한</span>
        <Segmented<number> value={room.settings.scoreLimit} disabled={!editable} onChange={(v) => onChange({ scoreLimit: v })}
          options={SCORE_LIMITS.map((n) => ({ value: n, label: n ? `${n}점` : '없음' }))} /></label>
    </div>
  );
}
