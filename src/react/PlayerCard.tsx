// src/react/PlayerCard.tsx — 피파식 선수 카드(2026-09-25). 홈 라커룸·명단 아바타 보기·선수 페이지가 같은 카드를 쓴다.
// 값은 lib/card.ts(cardModel)가 정하고 여기는 그리기만. 아바타 자리는 부르는 쪽이 끼워 넣을 수 있다
// (선수 페이지는 그 자리에 꾸미기 버튼을 둔다).
//
// 도트 규약: 글자 크기는 자식마다 직접 선언한다 — 카드가 <a>·<button> 안에 들어가 font-family 가 상속되므로,
// 크기를 물려받은 채 두면 10의 배수가 아닌 자리에서 흐려진다(4b 단계 교훈).
import type { ReactNode } from 'react';
import { avatarSvg } from '../components/avatar';
import { feetSvg, flagKrSvg } from '../components/pixel-icons';
import { avatarSpecFor } from '../lib/avatar';
import { cardModel, FOOT_LABEL } from '../lib/card';
import type { Tier } from '../lib/tier';
import type { Player } from '../lib/types';

export type CardSize = 'lg' | 'sm';
/** 아바타 세로(24×32 격자의 정수배). lg 6배, sm 5배. */
export const CARD_AVATAR_H: Record<CardSize, number> = { lg: 192, sm: 120 };
const ICON_SCALE: Record<CardSize, number> = { lg: 2, sm: 1 };

export default function PlayerCard({ player, tier, size, avatar, className = '' }: {
  player: Player; tier: Tier | null | undefined; size: CardSize;
  /** 아바타 자리를 바꿔 끼운다(SVG 문자열을 받아 감싼 요소를 돌려준다). */
  avatar?: (svg: string) => ReactNode; className?: string;
}) {
  const m = cardModel(player, tier);
  const svg = avatarSvg(avatarSpecFor(player.num, player.avatar), CARD_AVATAR_H[size], player.num, true);
  const t = m.tier ?? 'none';
  return (
    <div className={`fcard fcard-${size} fcard-tier-${t} ${className}`.trim()}>
      <div className="fcard-top">
        <div className="fcard-col">
          <span className={`fcard-tier tier-${t}`} aria-label={m.tier ? `티어 ${m.tier}` : '티어 없음'}>{m.tier ?? '–'}</span>
          <b className="fcard-ovr" data-ovr={m.ovr}>{m.ovr || '–'}</b>
          <span className={`pos pos-${m.pos.toLowerCase()} fcard-pos`}>{m.pos || '–'}</span>
          <span className="fcard-flag" dangerouslySetInnerHTML={{ __html: flagKrSvg(ICON_SCALE[size]) }} />
          <span className="fcard-feet" title={FOOT_LABEL[m.foot]} dangerouslySetInnerHTML={{ __html: feetSvg(m.foot, ICON_SCALE[size]) }} />
        </div>
        <div className="fcard-avatar">
          {avatar ? avatar(svg) : <span className="fcard-sprite" aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} />}
        </div>
      </div>
      <div className="fcard-name"><b>{m.name}</b><span>#{m.num}</span></div>
      <div className="fcard-stats">
        {m.stats.map((s) => (
          <span className="fcard-stat" key={s.key}>
            <span className="fcard-stat-label">{s.label}</span>
            <b className={`fcard-stat-val val-${s.band}`}>{s.value || '–'}</b>
          </span>
        ))}
      </div>
    </div>
  );
}
