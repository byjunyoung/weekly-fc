// src/react/squad/NumberPicker.tsx — 등번호 1~99 격자(2026-09-28 "뭐가 남았는지 알 수가 없잖아").
// 쓰는 번호는 흐리게, 누르면 누가 쓰는지만 알려 주고 고르지 않는다. antd Form.Item 안에 value/onChange 로 끼운다.
import { useState } from 'react';
import type { Player } from '../../lib/types';

export default function NumberPicker({ value, onChange, players, own }: {
  value?: number; onChange?: (n: number) => void; players: Player[];
  /** 지금 편집 중인 선수의 번호 — 자기 번호는 쓰는 중이어도 고를 수 있다. */
  own?: number;
}) {
  const owner = new Map(players.filter((p) => p.num !== own).map((p) => [p.num, p.name]));
  const [hint, setHint] = useState<string | null>(null);
  const free = 99 - owner.size;
  return (
    <div className="numpick">
      <div className="numpick-grid" role="radiogroup" aria-label="등번호">
        {Array.from({ length: 99 }, (_, i) => i + 1).map((n) => {
          const who = owner.get(n);
          const on = value === n;
          return (
            <button type="button" key={n} role="radio" aria-checked={on}
              className={`numpick-n${who ? ' is-taken' : ''}${on ? ' is-on' : ''}`}
              aria-label={who ? `${n}번 ${who} 사용 중` : `${n}번`}
              onClick={() => { if (who) setHint(`${n}번은 ${who} 선수가 쓰고 있습니다`); else { setHint(null); onChange?.(n); } }}>
              {n}
            </button>
          );
        })}
      </div>
      <p className="numpick-hint muted" aria-live="polite">{hint ?? `빈 번호 ${free}개 · 흐린 번호는 쓰는 중${value ? ` · 고른 번호 ${value}` : ''}`}</p>
    </div>
  );
}
