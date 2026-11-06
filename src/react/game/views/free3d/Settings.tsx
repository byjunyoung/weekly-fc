// src/react/game/views/free3d/Settings.tsx — 방(로비)의 3D 자유 훈련장 설정 칸(2026-11-07 5단계): 연습 봇 수. 방장은 고르고 손님은 한 줄 요약.
// 2D 칸과 같은 말 — 경기장 고르기가 없는 건 3D 경기장이 하나라서(계산의 경기장 크기가 상수).
import { Segmented } from 'antd';
import type { Free3Settings } from '../../../../lib/games/free3d';
import { MAX_BOTS, ballsFor } from '../../../../lib/games/free2d';
import { MAX_HUMANS } from '../../../../lib/game/room';
import type { SettingsProps } from '../types';

export function Settings({ room, editable, onChange, lead }: SettingsProps<Free3Settings>) {
  const s = room.settings;
  const humans = Math.min(MAX_HUMANS, room.members.length);
  const summary = `${humans}명 · 공 ${ballsFor(humans)}개 · 연습 봇 ${s.bots ? `${s.bots}명` : '없음'}`;
  if (!onChange) return <p className="muted">{summary}</p>;
  return (
    <div className="game-opts">
      {lead}
      <label className="game-opt"><span className="muted">연습 봇</span>
        <Segmented<number> value={s.bots} disabled={!editable} onChange={(v) => onChange({ bots: v })}
          options={Array.from({ length: MAX_BOTS + 1 }, (_, n) => ({ value: n, label: n ? `${n}명` : '없음' }))} /></label>
      <p className="muted free-sum">{summary}</p>
    </div>
  );
}
