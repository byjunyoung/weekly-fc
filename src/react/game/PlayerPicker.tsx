// src/react/game/PlayerPicker.tsx — 내 선수 고르기(1단계 설정 화면의 것을 빼냈다). 입장 화면과 방의 [선수 바꾸기] 창이 같이 쓴다.
// 번호는 사람에게 보이는 jersey 를 쓴다(num 은 내부 고유 번호).
import { avatarFaceSvg } from '../../components/avatar';
import { avatarSpecFor } from '../../lib/avatar';
import type { Player } from '../../lib/types';

export function PlayerPicker({ players, value, onPick, held }: {
  players: Player[]; value: number | null; onPick: (p: Player) => void;
  /** 방에서 다른 사람이 이미 고른 선수(번호) — 고를 수 없게 흐리게. */
  held?: ReadonlySet<number>;
}) {
  return (
    <div className="game-picker" role="radiogroup" aria-label="내 선수">
      {players.map((p) => {
        const off = !!held?.has(p.num) && p.num !== value;
        return (
          <button type="button" key={p.num} role="radio" aria-checked={p.num === value} disabled={off}
            className={`game-pick${p.num === value ? ' is-on' : ''}${off ? ' is-held' : ''}`}
            title={off ? '다른 사람이 고른 선수' : undefined}
            onClick={() => { if (!off) onPick(p); }}>
            <span className="game-pick-face" aria-hidden="true" dangerouslySetInnerHTML={{ __html: avatarFaceSvg(avatarSpecFor(p.num, p.avatar), 48, p.jersey, true) }} />
            <span className="game-pick-name">{p.name}</span>
            <span className="game-pick-num">#{p.jersey}</span>
          </button>
        );
      })}
    </div>
  );
}
