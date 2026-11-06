// src/react/squad/NumberPicker.tsx — 등번호 1~99 격자(2026-09-28 "뭐가 남았는지 알 수가 없잖아").
// 2026-11-06: 격자 그리기(NumberGrid)를 떼어 JerseyModal(등번호 바꾸기)과 같이 쓴다. 칸이 어떤 모양인지는 부르는 쪽이 정한다.
// NumberPicker 는 [선수 추가]용 — 쓰는 번호는 흐리게, 누르면 누가 쓰는지만 알려 주고 고르지 않는다. antd Form.Item 안에 value/onChange 로 끼운다.
import { useState } from 'react';
import type { Player } from '../../lib/types';

/** 칸 모양 — free 빈 번호 · mine 내 번호(채움) · steal 가져올 수 있음(점선) · locked 못 가져옴/쓰는 중(흐림). pick 은 지금 고른 칸. */
export type GridState = 'free' | 'mine' | 'steal' | 'locked';
export type GridCell = { n: number; state: GridState; label: string };

export function NumberGrid({ cells, pick, onTap }: { cells: GridCell[]; pick?: number | null; onTap: (n: number) => void }) {
  return (
    <div className="numpick-grid" role="group" aria-label="등번호">
      {cells.map((c) => (
        <button type="button" key={c.n} aria-label={c.label} aria-pressed={pick === c.n || c.state === 'mine'}
          className={`numpick-n is-${c.state}${pick === c.n ? ' is-pick' : ''}`}
          onClick={() => onTap(c.n)}>
          {c.n}
        </button>
      ))}
    </div>
  );
}

export default function NumberPicker({ value, onChange, players, own }: {
  value?: number; onChange?: (n: number) => void; players: Player[];
  /** 지금 편집 중인 선수의 고유 번호 — 그 선수의 등번호는 쓰는 중이어도 고를 수 있다. */
  own?: number;
}) {
  // 쓰는 번호는 등번호(jersey) 기준 — 고유 번호(num)는 사람에게 보이는 번호가 아니다.
  const owner = new Map(players.filter((p) => p.num !== own).map((p) => [p.jersey, p.name]));
  const [hint, setHint] = useState<string | null>(null);
  const free = 99 - owner.size;
  const cells: GridCell[] = Array.from({ length: 99 }, (_, i) => i + 1).map((n) => {
    const who = owner.get(n);
    return { n, state: who ? 'locked' : value === n ? 'mine' : 'free', label: who ? `${n}번 ${who} 사용 중` : `${n}번` };
  });
  return (
    <div className="numpick">
      <NumberGrid cells={cells}
        onTap={(n) => { const who = owner.get(n); if (who) setHint(`${n}번은 ${who} 선수가 쓰고 있습니다`); else { setHint(null); onChange?.(n); } }} />
      <p className="numpick-hint muted" aria-live="polite">{hint ?? `빈 번호 ${free}개 · 흐린 번호는 쓰는 중${value ? ` · 고른 번호 ${value}` : ''}`}</p>
    </div>
  );
}
