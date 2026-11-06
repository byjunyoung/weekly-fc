// src/react/game/views/match3d/Settings.tsx — 방(로비)의 3D 경기 설정 칸(2026-11-07 게임 묶음 4단계). 방장은 고르고, 손님은 한 줄 요약을 본다.
// 2D 설정 칸(views/match2d/Settings.tsx)과 같은 모양·같은 말 — 다른 건 "봇으로 채움" 대신 "필드"(골키퍼는 늘 봇이라 고를 게 필드 수뿐)와 경기장이 없다는 것.
import { Segmented } from 'antd';
import type { Outfield, Room3d, Room3dSettings } from '../../../../lib/games/match3d-room';
import { MAX_OUTFIELD, MIN_OUTFIELD, outfieldSizes } from '../../../../lib/games/match3d-room';
import type { SettingsProps } from '../types';
import { SCORE_LIMITS } from '../match2d/options';

/** 필드 n → "n+1대n+1"(골키퍼 포함으로 센다 — 카드·결과의 "5대5"와 같게). */
const sideLabel = (n: number): string => `${n + 1}대${n + 1}`;

function settingsText(r: Room3d): string {
  const s = r.settings;
  const [a, b] = outfieldSizes(r);
  return `${a + 1}대${b + 1} · 골키퍼와 빈 필드는 봇 · ${s.minutes}분 · ${s.scoreLimit ? `${s.scoreLimit}점 먼저` : '점수 제한 없음'}`;
}

export function Settings({ room, editable, onChange, lead }: SettingsProps<Room3dSettings>) {
  if (!onChange) return <p className="muted">{settingsText(room)}</p>;
  const outs = Array.from({ length: MAX_OUTFIELD - MIN_OUTFIELD + 1 }, (_, i) => MIN_OUTFIELD + i);
  return (
    <div className="game-opts">
      {lead}
      {/* 한 편 필드 수 — 사람이 그보다 적은 편을 봇이 채운다. 사람이 더 많은 편은 사람 수대로(4명까지). 골키퍼는 늘 봇. */}
      <label className="game-opt"><span className="muted">인원</span>
        <Segmented<number> value={room.settings.outfield} disabled={!editable} onChange={(v) => onChange({ outfield: v as Outfield })}
          options={outs.map((n) => ({ value: n, label: sideLabel(n) }))} /></label>
      <label className="game-opt"><span className="muted">시간</span>
        <Segmented<number> value={room.settings.minutes} disabled={!editable} onChange={(v) => onChange({ minutes: v })}
          options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: `${n}분` }))} /></label>
      <label className="game-opt"><span className="muted">점수 제한</span>
        <Segmented<number> value={room.settings.scoreLimit} disabled={!editable} onChange={(v) => onChange({ scoreLimit: v })}
          options={SCORE_LIMITS.map((n) => ({ value: n, label: n ? `${n}점` : '없음' }))} /></label>
    </div>
  );
}
