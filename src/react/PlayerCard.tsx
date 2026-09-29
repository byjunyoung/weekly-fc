// src/react/PlayerCard.tsx — 피파식 선수 카드(2026-09-25). 홈 라커룸·명단 아바타 보기·선수 페이지가 같은 카드를 쓴다.
// 값은 lib/card.ts(cardModel)가 정하고 여기는 그리기만. 아바타 자리는 부르는 쪽이 끼워 넣을 수 있다
// (선수 페이지는 그 자리에 꾸미기 버튼을 둔다).
//
// 도트 규약: 글자 크기는 자식마다 직접 선언한다 — 카드가 <a>·<button> 안에 들어가 font-family 가 상속되므로,
// 크기를 물려받은 채 두면 10의 배수가 아닌 자리에서 흐려진다(4b 단계 교훈).
//
// POTM(2026-09-25): 표가 있는 가장 최근 매치의 1위에겐 금색 띠가 붙는다(lib/matches currentPotm). 다음 매치에
// 첫 표가 들어오면 넘어간다. 도트 글자는 기울이면 뭉개지므로 띠는 수평, 멋은 테두리 반짝임(줄인 동작 설정이면 끔)으로.
import type { ReactNode } from 'react';
import { avatarSvg } from '../components/avatar';
import { feetSvg, flagKrSvg } from '../components/pixel-icons';
import { avatarSpecFor } from '../lib/avatar';
import { cardModel, FOOT_LABEL } from '../lib/card';
import { shortDate } from '../lib/matches';
import type { Tier } from '../lib/tier';
import type { Player } from '../lib/types';
import { teamBests, titleOf } from '../lib/titles';

export type CardSize = 'lg' | 'sm';
/** 아바타 세로(24×32 격자의 정수배). lg 6배, sm 5배. */
export const CARD_AVATAR_H: Record<CardSize, number> = { lg: 192, sm: 128 };   // 2026-09-29 왼쪽 기둥을 비워 아바타를 키움(6배·4배)

export default function PlayerCard({ player, tier, size, avatar, className = '', potmDate = null, team }: {
  player: Player; tier: Tier | null | undefined; size: CardSize;
  /** 아바타 자리를 바꿔 끼운다(SVG 문자열을 받아 감싼 요소를 돌려준다). */
  avatar?: (svg: string) => ReactNode; className?: string;
  /** 이 선수가 지금 POTM 이면 그 매치 날짜('YYYY-MM-DD'). 아니면 null. */
  potmDate?: string | null;
  /** 팀 전체 — 주면 칭호 뱃지(이름 옆)와 팀 1위 항목 금색 표시를 붙인다(2026-09-29, lib/titles.ts). 칭호는 팀 안 상대 비교라 팀이 필요하다. */
  team?: Player[];
}) {
  const m = cardModel(player, tier);
  const title = team ? titleOf(player, team) : null;
  const bests = team ? teamBests(player, team) : [];
  const svg = avatarSvg(avatarSpecFor(player.num, player.avatar), CARD_AVATAR_H[size], player.num, true);
  const t = m.tier ?? 'none';
  return (
    <div className={`fcard fcard-${size} fcard-tier-${t}${potmDate ? ' fcard-is-potm' : ''} ${className}`.trim()}>
      {potmDate && <span className="fcard-potm" aria-label={`${shortDate(potmDate)} 매치 POTM`}>★ POTM {shortDate(potmDate)}</span>}
      <div className="fcard-top">
        <div className="fcard-col">
          {/* 피파 본가 순서(2026-09-29 "피파 카드랑 레이아웃이 크게 달라지지 않게") — 종합 · 포지션 · 국기 · (클럽 엠블럼 자리에) 티어.
              주발 발자국은 국기 아래(피파 앞면엔 없지만 우리 카드엔 둔다 — 사용자). */}
          <b className="fcard-ovr" data-ovr={m.ovr}>{m.ovr || '–'}</b>
          <span className={`pos pos-${m.pos.toLowerCase()} fcard-pos`}>{m.pos || '–'}</span>
          <span className="fcard-flag" dangerouslySetInnerHTML={{ __html: flagKrSvg(size === 'lg' ? 2 : 1) }} />
          {/* 주발 — 발자국 한 쌍, 주발만 밝게(2026-09-29 다시 넣음, 그림은 발자국으로) */}
          <span className="fcard-feet" title={FOOT_LABEL[m.foot]} dangerouslySetInnerHTML={{ __html: feetSvg(m.foot, size === 'lg' ? 3 : 2) }} />
          <span className={`fcard-tier tier-${t}`} aria-label={m.tier ? `티어 ${m.tier}` : '티어 없음'}>{m.tier ?? '–'}</span>
        </div>
        <div className="fcard-avatar">
          {avatar ? avatar(svg) : <span className="fcard-sprite" aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} />}
        </div>
      </div>
      {/* 이름과 칭호를 한 덩어리로 가운데. 폭이 모자라면 칭호가 다음 줄 가운데로 내려간다. */}
      <div className={`fcard-name${title ? ' has-badge' : ''}`}>
        <b>{m.name}</b><span>#{m.num}</span>
        {title && <span className="fcard-badge" title={title.desc}>{title.name}</span>}
      </div>
      <div className="fcard-stats">
        {m.stats.map((s) => (
          <span className={`fcard-stat${bests.includes(s.key) ? ' is-best' : ''}`} key={s.key}>
            {/* 피파처럼 숫자 먼저, 라벨 뒤 */}
            <b className={`fcard-stat-val val-${s.band}`}>{s.value || '–'}</b>
            <span className="fcard-stat-label" title={bests.includes(s.key) ? '팀 1위' : undefined}>{s.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
