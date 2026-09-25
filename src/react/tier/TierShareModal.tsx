// 티어표 공유 이미지 — 공통 틀(ImageShareModal). 공유 글에 "나도 하기" 주소를 함께 싣는다:
// 이미지만 돌면 게임으로 들어올 길이 없다(설계 §2).
import { drawTierImage } from '../../components/tier-image';
import { seoulToday } from '../../lib/html';
import { STAT_KO } from '../../lib/stats';
import type { TierKey } from '../../lib/tier';
import type { Player } from '../../lib/types';
import { href } from '../../lib/url';
import ImageShareModal from '../ImageShareModal';

const keyLabel = (k: TierKey): string => (k === 'ovr' ? '종합' : STAT_KO[k]);

export default function TierShareModal({ open, onClose, players, tierKey }: {
  open: boolean; onClose: () => void; players: Player[]; tierKey: TierKey;
}) {
  const link = typeof location !== 'undefined' ? `${location.origin}${href('/tier/')}` : '';
  return (
    <ImageShareModal open={open} onClose={onClose} title="티어표 공유" shareTitle="WEEKLY FC 티어" shareText={`나도 하기 → ${link}`}
      fileName={`weeklyfc-tier-${seoulToday()}.png`} alt="티어표 이미지 미리보기"
      draw={(c) => { drawTierImage(c, players, tierKey, 'WEEKLY FC 티어', `${keyLabel(tierKey)} · ${seoulToday().replaceAll('-', '.')}`); }}
      extra={<p className="tier-link"><span className="label">나도 하기</span> <span className="tier-link-url">{link}</span></p>} />
  );
}
