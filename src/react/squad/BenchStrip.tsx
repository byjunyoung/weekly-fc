// src/react/squad/BenchStrip.tsx — 모바일 하단 벤치 줄. 시트가 닫혀 있을 때 화면 아래 고정,
// 시트가 열리면(z-index 위) 이 줄을 덮는다(스타일은 tokens.css 그대로). 「전체」만 시트를 연다 —
// 칩 하나를 누르면 옛 코드와 같이 onPick 으로 바로 배치/벤치 토글이다.
import { slotsOf, stripOrder, type LineupState } from '../../lib/lineup';
import { ovr } from '../../lib/stats';
import type { Player } from '../../lib/types';

export default function BenchStrip({ st, players, selected, onPick, onOpenSheet }: {
  st: LineupState; players: Player[]; selected: number | null;
  onPick: (num: number) => void; onOpenSheet: () => void;
}) {
  const items = stripOrder(st, players);
  const benchCount = items.filter((i) => !i.starter).length;
  const label = selected !== null ? `${slotsOf(st)[selected].label} 자리 ←` : `벤치 ${benchCount}`;

  return (
    <div className="bd-strip" id="strip">
      <span className="bd-strip-label" id="strip-label">{label}</span>
      <div className="bd-strip-chips" id="strip-chips"
        onClick={(e) => { const el = (e.target as HTMLElement).closest<HTMLElement>('[data-pick]'); if (el) onPick(Number(el.dataset.pick)); }}>
        {items.map(({ player: p, starter }) => (
          <button type="button" key={p.num} className={`bd-chip${starter ? ' is-on' : ''}`} data-pick={p.num} aria-pressed={starter}>
            <span className={`pos pos-${p.pos.toLowerCase()}`}>{p.pos || '–'}</span><b>{p.name}</b>
            <span className="bd-chip-ovr">{ovr(p) || '–'}</span>
            {starter ? <span className="bd-chip-check" aria-hidden="true">✓</span> : null}
          </button>
        ))}
      </div>
      <button type="button" className="bd-strip-all" id="strip-all" onClick={onOpenSheet}>전체</button>
    </div>
  );
}
