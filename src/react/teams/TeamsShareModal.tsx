// 팀 나누기 공유 이미지(2026-09-25) — 공통 틀(ImageShareModal)에 "무엇을 그리나"만 넘긴다.
import { drawTeamsImage } from '../../components/teams-image';
import { seoulToday } from '../../lib/html';
import { matchLabel } from '../../lib/matches';
import type { MatchTeam, Player } from '../../lib/types';
import ImageShareModal from '../ImageShareModal';

export default function TeamsShareModal({ open, onClose, lineup, players, date }: {
  open: boolean; onClose: () => void; lineup: MatchTeam[]; players: Player[]; date: string;
}) {
  const n = lineup.reduce((s, t) => s + t.members.length, 0);
  return (
    <ImageShareModal open={open} onClose={onClose} title="팀 나누기 이미지" shareTitle="WEEKLY FC 팀 나누기"
      fileName={`weeklyfc-teams-${date || seoulToday()}.png`} alt="팀 나누기 이미지 미리보기"
      draw={(c) => { drawTeamsImage(c, lineup, players, '팀 나누기', `${matchLabel(date)} · ${n}명`); }} />
  );
}
