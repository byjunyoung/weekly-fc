// 홈 대시보드 — 왼쪽 절반이 라커룸(내 아바타), 오른쪽에 타일 격자(antd Card).
import { Card } from 'antd';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { avatarSvg } from '../../components/avatar';
import { tierByNum } from '../../lib/card';
import { currentPotm } from '../../lib/matches';
import PlayerCard from '../PlayerCard';
import { getMe } from '../../lib/me';
import { LINKS } from '../../lib/rules';
import { href } from '../../lib/url';
import Loading from '../Loading';
import ThemeRoot from '../ThemeRoot';
import { useData } from '../useData';
import { computeHomeSummary } from './model';
import type { DutyTile } from './model';

// 링크 타일 — antd Card 로 그리되, 앵커를 display:contents 로 감싸 그리드 자리·클릭을
// Card 가 그대로 물려받게 한다(astro-island 와 같은 기법). 배경(--elevated)·정렬은 인라인
// style 로 줘서 캐스케이드 순서에 기대지 않는다(2단계에서 자식 결합자가 깨졌던 교훈).
const TILE_STYLE = { background: 'var(--elevated)', display: 'flex', flexDirection: 'column' as const, textAlign: 'left' as const, padding: 'var(--s-md)', cursor: 'pointer' };
const TILE_BODY = { body: { padding: 0, display: 'contents' as const } };
// 라커룸은 세로로 길게 서는 칸이라 gap 만 더한다 — TILE_STYLE 과 같은 이유로 캐스케이드
// 순서에 기대지 않는다(antd Card 가 자기 규칙을 얹는다).
const LOCKER_STYLE = { ...TILE_STYLE, gap: 'var(--s-sm)' };
// 이름을 고르기 전 자리지킴 — 회색 유니폼의 일반 선수. 상수라 렌더마다 같은 그림이 나온다.
const PLACEHOLDER_SPEC = { face: 0, hair: 1, skin: 2, eyes: 0, kit: '#565f6f' };
const LOCKER_SPRITE_H = 300;

/** 라커룸 무대 — 사물함 벽·바닥 띠는 순수 CSS. 그 위에 선수 카드(피파식, 2026-09-25)가 선다.
 *  로그인 전엔 회색 유니폼 스프라이트만(카드로 만들 데이터가 없다). */
function LockerStage({ children }: { children: ReactNode }) {
  return (
    <div className="locker-stage">
      <div className="locker-wall" />
      <div className="locker-floor" />
      {children}
    </div>
  );
}

function LinkTile({ to, locker, wide, children }: { to: string; locker?: boolean; wide?: boolean; children: ReactNode }) {
  const isExternal = to.startsWith('http');
  // 부모 <a> 는 display:contents 라 포커스를 받을 수 없다(CSS 스펙 — 박스 없는 요소는 포커스 대상이 될 수 없다).
  // 마우스 클릭은 그대로 <a> 가 처리하고(그대로 둔다), 키보드는 Card 자신에 얹는다 — 이름을 안 고른 라커룸(버튼)과 같은 패턴.
  const go = () => { if (isExternal) window.open(to, '_blank', 'noopener'); else location.assign(to); };
  return (
    <a href={to} target={isExternal ? '_blank' : undefined} rel={isExternal ? 'noopener' : undefined} style={{ display: 'contents' }}>
      <Card className={locker ? 'tile tile-locker' : wide ? 'tile tile-wide' : 'tile'} variant="borderless" style={locker ? LOCKER_STYLE : TILE_STYLE} styles={TILE_BODY}
        role="link" tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } }}>
        {children}
      </Card>
    </a>
  );
}
function EmptyMeTile({ onOpen }: { onOpen: () => void }) {
  return (
    <Card className="tile tile-locker" variant="borderless" style={LOCKER_STYLE} styles={TILE_BODY}
      role="button" tabIndex={0} onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}>
      <span className="tile-label">라커룸</span>
      <LockerStage>
        <div className="locker-sprite" aria-hidden="true" dangerouslySetInnerHTML={{ __html: avatarSvg(PLACEHOLDER_SPEC, LOCKER_SPRITE_H, undefined, true) }} />
        <span className="locker-plate locker-plate-empty">로그인하면 내 선수가 섭니다</span>
      </LockerStage>
      <span className="tile-sub tile-go">눌러서 로그인 ›</span>
    </Card>
  );
}
const dutyBody = (d: DutyTile) => <><span className="tile-duo"><b>{d.p1}</b><b>{d.p2}</b></span><span className="tile-sub">{d.sub}</span></>;

function App() {
  const { data } = useData();
  const [me, setMe] = useState<number | null>(null);

  useEffect(() => {
    const read = () => setMe(getMe());
    read();
    window.addEventListener('wfc:me', read);
    return () => window.removeEventListener('wfc:me', read);
  }, []);
  const openMe = () => window.dispatchEvent(new Event('wfc:open-me'));

  if (!data) return <Loading title="홈" />;

  const s = computeHomeSummary(data, me, new Date());
  const meNum = s.meTile.kind === 'picked' ? s.meTile.num : null;
  const mePlayer = meNum != null ? data.players.find((p) => p.num === meNum) : undefined;
  const tiers = tierByNum(data.players);
  const potm = currentPotm(data.matches);

  return (
    <>
      <div className="page-head"><h1>홈 <span className="muted" id="stamp">{s.stamp}</span></h1><div className="actions" /></div>
      <div className="rail">
        {s.meTile.kind === 'picked' && mePlayer
          ? (
            <LinkTile to={href(`/squad/${s.meTile.num}/`)} locker>
              <span className="tile-label">라커룸</span>
              <LockerStage>
                <PlayerCard player={mePlayer} tier={tiers.get(mePlayer.num)} size="lg" className="locker-card" potmDate={potm && potm.nums.includes(mePlayer.num) ? potm.date : null} />
              </LockerStage>
              <span className="tile-sub tile-go">눌러서 내 선수 보기 · 꾸미기 ›</span>
            </LinkTile>
          )
          : <EmptyMeTile onOpen={openMe} />}
        <LinkTile to={href('/squad/')}><span className="tile-label">명단</span><b className="tile-big">{s.squadCount}</b><span className="tile-sub">{s.posSummary}</span></LinkTile>
        <LinkTile to={href('/lineup/')}><span className="tile-label">라인업</span><b className="tile-big">짜서 공유</b><span className="tile-sub">선수를 골라 자리 잡고 이미지로</span></LinkTile>
        <LinkTile to={href('/rules/#duty')}><span className="tile-label">{s.duty.monthLabel} 봉사</span>{dutyBody(s.duty)}</LinkTile>
        <LinkTile to={href('/rules/#duty')}><span className="tile-label">다음 봉사</span>{dutyBody(s.dutyNext)}</LinkTile>
        {/* 미납 벌금 타일은 뺐다 — 벌금은 운영 규칙에서만 본다(2026-09-23 사용자 결정). 다섯 칸이 되어
            마지막 타일을 두 칸 폭으로 펴 격자의 구멍을 메운다. */}
        <LinkTile to={LINKS.youtube} wide><span className="tile-label">매치 영상</span><b className="tile-big">유튜브</b><span className="tile-sub">채널에서 보기 · 매주 토요일 기록</span></LinkTile>
      </div>
    </>
  );
}

export default function HomeApp() {
  return <ThemeRoot><App /></ThemeRoot>;
}
