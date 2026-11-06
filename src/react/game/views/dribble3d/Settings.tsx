// src/react/game/views/dribble3d/Settings.tsx — 방(로비)의 3D 드리블 훈련장 설정 칸(2026-11-07 6단계): 코스 고르기. 2D 칸과 같은 모양·말,
// 금 시간만 3D 것(course3 — 3D 대본 주자로 잰 메달).
import { Segmented } from 'antd';
import { MAX_HUMANS } from '../../../../lib/game/room';
import type { DrSettings } from '../../../../lib/games/dribble2d';
import { COURSES } from '../../../../lib/games/dribble2d';
import { course3 } from '../../../../lib/games/dribble3d';
import type { SettingsProps } from '../types';

export function Settings({ room, editable, onChange, lead }: SettingsProps<DrSettings>) {
  const c = course3(room.settings.course);
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
