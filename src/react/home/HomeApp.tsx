// 라커룸(홈, 2026-09-28 "홈을 라커룸이라고 정의") — 왼쪽 절반이 「내 선수」 칸(내 아바타), 오른쪽에 타일 격자(antd Card).
import { Card } from 'antd';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { jerseySvg } from '../../components/jersey';
import { avatarSpecFor } from '../../lib/avatar';
import type { Player } from '../../lib/types';
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

/** 사물함 칸 셋(2026-09-28, 레퍼런스: 조명 받는 가운데 칸에 이름·등번호가 보이는 유니폼 뒷면).
 *  가운데가 내 칸 — 위에 붉게 빛나는 패널, 위에서 떨어지는 빛. 양옆은 번호 앞뒤 팀원 유니폼을 어둡게.
 *  예전 줄무늬 벽·갈색 바닥은 "뭘 그린 건지 모르겠다"(사용자)라 이걸로 바꿨다. */
/** 크기(도트 한 칸 --px)는 CSS 가 칸·화면 폭에 맞춰 정한다 — 여기선 기준값으로만 그린다. */
function Jersey({ p }: { p: Player }) {
  return (
    <span className="lk-jersey">
      <i className="lk-hanger" aria-hidden="true" />
      <span className="lk-shirt">
        <span dangerouslySetInnerHTML={{ __html: jerseySvg(avatarSpecFor(p.num, p.avatar).kit, 10) }} />
        <b className="lk-jname">{p.name}</b>
        <b className="lk-jnum">{p.num}</b>
      </span>
    </span>
  );
}
function Cubby({ main, children }: { main?: boolean; children: ReactNode }) {
  return (
    <div className={`lk-cub${main ? ' is-main' : ''}`}>
      <div className="lk-panel" aria-hidden="true"><span>WFC</span></div>
      <div className="lk-recess">{children}</div>
      <div className="lk-seat" aria-hidden="true" />
    </div>
  );
}
function LockerScene({ side, children }: { side: [Player | undefined, Player | undefined]; children: ReactNode }) {
  return (
    <div className="lk-scene">
      <Cubby>{side[0] && <Jersey p={side[0]} />}</Cubby>
      <Cubby main>{children}</Cubby>
      <Cubby>{side[1] && <Jersey p={side[1]} />}</Cubby>
    </div>
  );
}
/** 번호 순으로 선 명단에서 내 앞뒤 사람(끝이면 반대쪽 끝으로 돈다). */
function neighbors(players: Player[], num: number | null): [Player | undefined, Player | undefined] {
  const line = [...players].sort((a, b) => a.num - b.num);
  if (!line.length) return [undefined, undefined];
  const i = num == null ? -1 : line.findIndex((p) => p.num === num);
  if (i < 0) return [line[0], line[1]];
  return [line[(i - 1 + line.length) % line.length], line[(i + 1) % line.length]];
}

/** 내 칸 — 평소엔 유니폼(등번호), 누르면 뒤집혀 선수 카드(OVR·능력치). 다시 누르면 유니폼.
 *  "등번호 보이는 게 멋있다" + "카드도 볼 수 있게"(2026-09-28) 둘을 한 자리에서. */
function MyLocker({ player, card }: { player: Player; card: ReactNode }) {
  const [flipped, setFlipped] = useState(false);
  return (
    <button type="button" className={`lk-flip${flipped ? ' is-flipped' : ''}`} aria-pressed={flipped}
      aria-label={flipped ? '유니폼으로 돌리기' : '선수 카드 보기'} onClick={() => setFlipped((x) => !x)}>
      <span className="lk-face lk-front"><Jersey p={player} /></span>
      <span className="lk-face lk-back">{card}</span>
    </button>
  );
}

function LinkTile({ to, wide, children }: { to: string; wide?: boolean; children: ReactNode }) {
  const isExternal = to.startsWith('http');
  // 부모 <a> 는 display:contents 라 포커스를 받을 수 없다(CSS 스펙 — 박스 없는 요소는 포커스 대상이 될 수 없다).
  // 마우스 클릭은 그대로 <a> 가 처리하고(그대로 둔다), 키보드는 Card 자신에 얹는다 — 이름을 안 고른 라커룸(버튼)과 같은 패턴.
  const go = () => { if (isExternal) window.open(to, '_blank', 'noopener'); else location.assign(to); };
  return (
    <a href={to} target={isExternal ? '_blank' : undefined} rel={isExternal ? 'noopener' : undefined} style={{ display: 'contents' }}>
      <Card className={wide ? 'tile tile-wide' : 'tile'} variant="borderless" style={TILE_STYLE} styles={TILE_BODY}
        role="link" tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } }}>
        {children}
      </Card>
    </a>
  );
}
function EmptyMeTile({ onOpen, side }: { onOpen: () => void; side: [Player | undefined, Player | undefined] }) {
  return (
    <Card className="tile tile-locker" variant="borderless" style={LOCKER_STYLE} styles={TILE_BODY}
      role="button" tabIndex={0} onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}>
      <span className="tile-label">내 선수</span>
      <LockerScene side={side}>
        <span className="lk-jersey"><i className="lk-hanger" aria-hidden="true" /><span className="lk-empty">로그인하면<br />내 유니폼이 걸립니다</span></span>
      </LockerScene>
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

  if (!data) return <Loading title="라커룸" />;

  const s = computeHomeSummary(data, me, new Date());
  const meNum = s.meTile.kind === 'picked' ? s.meTile.num : null;
  const mePlayer = meNum != null ? data.players.find((p) => p.num === meNum) : undefined;
  const tiers = tierByNum(data.players);
  const potm = currentPotm(data.matches);
  const side = neighbors(data.players, meNum);

  return (
    <>
      <div className="page-head"><h1>라커룸 <span className="muted" id="stamp">{s.stamp}</span></h1><div className="actions" /></div>
      <div className="rail">
        {s.meTile.kind === 'picked' && mePlayer
          ? (
            // 칸 전체가 링크였는데, 가운데 유니폼을 눌러 뒤집게 되면서 링크는 아래 글줄로 옮겼다.
            <Card className="tile tile-locker is-static" variant="borderless" style={{ ...LOCKER_STYLE, cursor: 'default' }} styles={TILE_BODY}>
              <span className="tile-label">내 선수</span>
              <LockerScene side={side}>
                <MyLocker player={mePlayer}
                  card={<PlayerCard player={mePlayer} tier={tiers.get(mePlayer.num)} size="lg" className="locker-card" potmDate={potm && potm.nums.includes(mePlayer.num) ? potm.date : null} />} />
              </LockerScene>
              <span className="tile-sub lk-foot"><span>유니폼을 누르면 카드</span><a className="tile-go" href={href(`/squad/${s.meTile.num}/`)}>내 선수 보기 · 꾸미기 ›</a></span>
            </Card>
          )
          : <EmptyMeTile onOpen={openMe} side={side} />}
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
