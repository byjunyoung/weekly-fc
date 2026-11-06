// src/react/game/views/dribble2d/Settings.tsx — 방(로비)의 드리블 훈련장 설정 칸(2026-11-07 3단계): 코스 고르기. 방장은 고르고 손님은 한 줄 요약.
import { Segmented } from 'antd';
import { MAX_HUMANS } from '../../../../lib/game/room';
import type { DrSettings } from '../../../../lib/games/dribble2d';
import { COURSES, courseOf } from '../../../../lib/games/dribble2d';
import type { SettingsProps } from '../types';

export function Settings({ room, editable, onChange, lead }: SettingsProps<DrSettings>) {
  const c = courseOf(room.settings.course);
  const summary = `${Math.min(MAX_HUMANS, room.members.length)}명 동시 · ${c.name} · 문 ${c.gates.length}개 · 금 ${c.medals[0]}초`;
  if (!onChange) return <p className="muted">{summary}</p>;
  return (
    <div className="game-opts">
      {lead}
      <label className="game-opt"><span className="muted">코스</span>
        <Segmented<number> value={room.settings.course} disabled={!editable} onChange={(v) => onChange({ course: v })}
          options={COURSES.map((k, i) => ({ value: i, label: k.name }))} /></label>
      <p className="muted dr-sum">{summary}</p>
    </div>
  );
}
