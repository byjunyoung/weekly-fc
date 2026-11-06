// src/react/game/BotSlot.tsx — 봇 자리 하나와 그 자리에 세울 선수 고르기 창(2026-11-07).
// 사용자: "그리고 봇도 선수를 고를 수 있게 해줘". 방(로비)의 흐린 "봇" 자리와 혼자 연습의 우리 편·상대 봇 줄이 같이 쓴다.
// 고르지 않은 자리는 "봇 · 무작위"(시작할 때 명단에서 뽑는다), 고른 자리는 얼굴 + 이름 + 작은 봇 표시. 번호는 사람에게 보이는 jersey.
import { Button, Modal } from 'antd';
import { avatarFaceSvg } from '../../components/avatar';
import { avatarSpecFor } from '../../lib/avatar';
import type { Player } from '../../lib/types';
import { PlayerPicker } from './PlayerPicker';

/** 봇 자리 칩. onClick 이 없으면 읽기만(손님). */
export function BotSlot({ player, onClick, label }: { player: Player | null; onClick?: () => void; label: string }) {
  const inner = player ? (
    <>
      <span className="game-chip-face" aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: avatarFaceSvg(avatarSpecFor(player.num, player.avatar), 24, player.jersey, true) }} />
      <span className="game-chip-name">{player.name}</span>
      <span className="game-bot-tag">봇</span>
    </>
  ) : <span className="game-chip-name">봇 · 무작위</span>;
  const aria = `${label}: ${player ? `${player.name}(봇)` : '무작위 봇'}`;
  return onClick
    ? <button type="button" className={`game-chip is-bot${player ? ' is-picked-bot' : ''}`} aria-label={`${aria} — 바꾸기`} onClick={(e) => { e.stopPropagation(); onClick(); }}>{inner}</button>
    : <div className={`game-chip is-bot${player ? ' is-picked-bot' : ''}`} aria-label={aria}>{inner}</div>;
}

/** 봇 자리에 세울 선수 고르기 — 맨 위 [무작위], 아래는 선수 고르기(사람이 잡았거나 이미 다른 봇 자리에 고른 선수는 흐리게). */
export function BotPickModal({ open, title, players, value, held, onPick, onClose }: {
  open: boolean; title: string; players: Player[]; value: number | null;
  held: ReadonlySet<number>; onPick: (num: number | null) => void; onClose: () => void;
}) {
  return (
    <Modal open={open} title={title} footer={null} onCancel={onClose} destroyOnHidden>
      <div className="game-botpick-random">
        <Button type={value === null ? 'primary' : 'default'} onClick={() => onPick(null)}>무작위</Button>
        <span className="muted">시작할 때 명단에서 뽑습니다</span>
      </div>
      <PlayerPicker players={players} value={value} held={held} onPick={(p) => onPick(p.num)} />
    </Modal>
  );
}
