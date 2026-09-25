// src/react/CardShareModal.tsx — 선수 카드 이미지(내 카드·POTM 카드). 공통 틀(ImageShareModal)에 "무엇을 그리나"만 넘긴다.
import { type CardImageOpts, drawCardImage } from '../components/card-image';
import { seoulToday } from '../lib/html';
import type { Tier } from '../lib/tier';
import type { Player } from '../lib/types';
import ImageShareModal from './ImageShareModal';

export default function CardShareModal({ open, onClose, player, tier, opts, title, fileTag }: {
  open: boolean; onClose: () => void; player: Player | null; tier: Tier | null | undefined;
  opts?: CardImageOpts; title: string; fileTag: string;
}) {
  return (
    <ImageShareModal open={open && !!player} onClose={onClose} title={title} fileName={`weeklyfc-${fileTag}-${seoulToday()}.png`}
      draw={(c) => { if (player) drawCardImage(c, player, tier ?? null, opts); }} />
  );
}
