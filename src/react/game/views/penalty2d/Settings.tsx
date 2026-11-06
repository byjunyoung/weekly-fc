// src/react/game/views/penalty2d/Settings.tsx — 방(로비)의 승부차기 설정 칸(2026-11-07 2단계): 차는 횟수(3·5) · 먼저 차는 편. 방장은 고르고 손님은 한 줄 요약.
import { Segmented } from 'antd';
import type { PenFirst, PenSettings } from '../../../../lib/games/penalty2d';
import type { SettingsProps } from '../types';
import { TEAM } from '../../teams';

const FIRST: { value: PenFirst; label: string }[] = [
  { value: 'random', label: '무작위' }, { value: 0, label: `${TEAM[0].short} 먼저` }, { value: 1, label: `${TEAM[1].short} 먼저` },
];

export function Settings({ room, editable, onChange, lead }: SettingsProps<PenSettings>) {
  const s = room.settings;
  const side = (t: 0 | 1): string => { const n = room.members.filter((m) => m.team === t).length; return n ? `${n}명` : '봇'; };
  const summary = `${s.kicks}번씩 · ${FIRST.find((f) => f.value === s.first)?.label ?? '무작위'} · ${TEAM[0].short} ${side(0)} 대 ${TEAM[1].short} ${side(1)}`;
  if (!onChange) return <p className="muted">{summary}</p>;
  return (
    <div className="game-opts">
      {lead}
      <label className="game-opt"><span className="muted">차는 횟수</span>
        <Segmented<number> value={s.kicks} disabled={!editable} onChange={(v) => onChange({ kicks: v as 3 | 5 })}
          options={[{ value: 3, label: '3번씩' }, { value: 5, label: '5번씩' }]} /></label>
      <label className="game-opt"><span className="muted">먼저 차기</span>
        <Segmented<string> value={String(s.first)} disabled={!editable}
          onChange={(v) => onChange({ first: v === 'random' ? 'random' : (Number(v) as 0 | 1) })}
          options={FIRST.map((f) => ({ value: String(f.value), label: f.label }))} /></label>
    </div>
  );
}
