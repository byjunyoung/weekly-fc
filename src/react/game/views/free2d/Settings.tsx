// src/react/game/views/free2d/Settings.tsx — 방(로비)의 자유 훈련장 설정 칸(2026-11-07 2단계): 경기장 크기 · 연습 봇 수. 방장은 고르고 손님은 한 줄 요약.
import { Segmented } from 'antd';
import type { FreeSettings } from '../../../../lib/games/free2d';
import { MAX_BOTS, ballsFor, freeField } from '../../../../lib/games/free2d';
import { MAX_HUMANS } from '../../../../lib/game/room';
import type { FieldChoice } from '../../../../lib/games/match2d-room';
import type { SettingsProps } from '../types';
import { FIELD_OPTIONS } from '../match2d/options';

const fieldLabel = (f: FieldChoice): string => FIELD_OPTIONS.find((o) => o.value === f)?.label ?? '보통';

export function Settings({ room, editable, onChange, lead }: SettingsProps<FreeSettings>) {
  const s = room.settings;
  const humans = Math.min(MAX_HUMANS, room.members.length);
  const auto = fieldLabel(freeField('auto', humans + s.bots));
  const field = s.field === 'auto' ? `자동 · ${auto}` : fieldLabel(s.field);
  const summary = `${humans}명 · 공 ${ballsFor(humans)}개 · 연습 봇 ${s.bots ? `${s.bots}명` : '없음'} · 경기장 ${field}`;
  if (!onChange) return <p className="muted">{summary}</p>;
  return (
    <div className="game-opts">
      {lead}
      <label className="game-opt"><span className="muted">연습 봇</span>
        <Segmented<number> value={s.bots} disabled={!editable} onChange={(v) => onChange({ bots: v })}
          options={Array.from({ length: MAX_BOTS + 1 }, (_, n) => ({ value: n, label: n ? `${n}명` : '없음' }))} /></label>
      <label className="game-opt"><span className="muted">경기장</span>
        <Segmented<FieldChoice> value={s.field} disabled={!editable} onChange={(v) => onChange({ field: v })}
          options={FIELD_OPTIONS.map((o) => (o.value === 'auto' && s.field === 'auto' ? { ...o, label: `자동 · ${auto}` } : o))} /></label>
      <p className="muted free-sum">{summary}</p>
    </div>
  );
}
