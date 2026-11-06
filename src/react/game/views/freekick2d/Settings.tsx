// src/react/game/views/freekick2d/Settings.tsx — 방(로비)의 프리킥 설정 칸(2026-11-07 3단계). 고를 것은 없다(자리·점수가 정해져 있다) — 한 줄 요약만.
import { MAX_HUMANS } from '../../../../lib/game/room';
import type { FkSettings } from '../../../../lib/games/freekick2d';
import { FK_MAX_POINTS } from '../../../../lib/games/freekick2d';
import type { SettingsProps } from '../types';

export function Settings({ room, onChange, lead }: SettingsProps<FkSettings>) {
  const n = Math.min(MAX_HUMANS, room.members.length);
  const summary = `${n}명 · 자리 다섯 · 한 사람 다섯 번 · ${FK_MAX_POINTS}점 만점`;
  if (!onChange) return <p className="muted">{summary}</p>;
  return (
    <div className="game-opts">
      {lead}
      <p className="muted fk-sum">{summary}</p>
    </div>
  );
}
