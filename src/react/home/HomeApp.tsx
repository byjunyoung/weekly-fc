// 라커룸(홈, 2026-09-28 "홈을 라커룸이라고 정의") — 왼쪽 절반이 「내 선수」 칸(내 아바타), 오른쪽에 타일 격자(antd Card).
import { Card } from 'antd';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { jerseySvg } from '../../components/jersey';
import { avatarSpecFor } from '../../lib/avatar';
import type { Player } from '../../lib/types';
import { tierByNum } from '../../lib/card';
import { currentPotm } from '../../lib/matches';
import PlayerCard from '../PlayerCard';
import { getMe } from '../../lib/me';
import { fetchRecentGuestbook, fetchStatHistory, fetchTodayStats, type RecentGuest, type TodayStats } from '../../lib/api';
import { change, series } from '../../lib/history';
import { tierRows } from '../../lib/tier';
import { lawOfDay, BOARDS } from '../../lib/tactics';
import { tacticsBoardSvg } from '../../components/tactics-board';
import { seoulToday } from '../../lib/html';
import { ovr } from '../../lib/stats';
import type { StatLogRow } from '../../lib/types';
import { LINKS } from '../../lib/rules';
import { href } from '../../lib/url';
import Loading from '../Loading';
import ThemeRoot from '../ThemeRoot';
import { useData } from '../useData';
import { computeHomeSummary } from './model';
import type { DutyTile } from './model';
import SquadBanner from './SquadBanner';

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
  // 카드 크기 맞추기 — 칸 폭은 화면마다 달라 고정 배율로는 좌우 테두리가 잘렸다(2026-09-28 "양옆이 짤린다").
  // 칸(버튼) 크기와 카드 원래 크기(offset 은 transform 을 무시한다)를 재서, 여백 12px 을 두고 들어가는 배율을 건다.
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const box = ref.current;
    const fcard = box?.querySelector<HTMLElement>('.lk-back .fcard');
    if (!box || !fcard) return;
    const fit = () => {
      // 명단과 같은 작은 카드(sm)를 칸에 맞춰 키운다(2026-09-29 "라커룸 카드도 명단 카드랑 동일하게") — 최대 1.8배.
      const s = Math.min(1.8, (box.clientWidth - 24) / fcard.offsetWidth, (box.clientHeight - 24) / fcard.offsetHeight);
      if (s > 0) fcard.style.setProperty('--card-s', s.toFixed(3));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    ro.observe(fcard);   // 도트 폰트가 늦게 붙어 카드 크기가 바뀌어도 다시 잰다
    return () => ro.disconnect();
  }, []);
  return (
    <button type="button" ref={ref} className={`lk-flip${flipped ? ' is-flipped' : ''}`} aria-pressed={flipped}
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
  // 오늘 숫자(2026-09-28 "오늘 방문자 수·활동 횟수") — 누구에게나. 1분마다 다시 읽는다.
  const [today, setToday] = useState<TodayStats | null>(null);
  useEffect(() => {
    const read = () => fetchTodayStats().then(setToday).catch(() => {});
    read();
    const t = window.setInterval(read, 60_000);
    return () => window.clearInterval(t);
  }, []);

  // 최근 방명록(팀 전체)·내 능력치 기록(이번 주 변화) — 2026-09-28 명단·라인업 타일을 바꾼 자리.
  const [guests, setGuests] = useState<RecentGuest[] | null>(null);
  useEffect(() => { fetchRecentGuestbook(2).then(setGuests).catch(() => setGuests([])); }, []);
  const [myHist, setMyHist] = useState<StatLogRow[] | null>(null);
  useEffect(() => {
    if (me == null) { setMyHist(null); return; }
    fetchStatHistory(me).then(setMyHist).catch(() => setMyHist([]));
  }, [me]);

  if (!data) return <Loading title="라커룸" />;

  const s = computeHomeSummary(data, me, new Date());
  const meNum = s.meTile.kind === 'picked' ? s.meTile.num : null;
  const mePlayer = meNum != null ? data.players.find((p) => p.num === meNum) : undefined;
  const tiers = tierByNum(data.players);
  const potm = currentPotm(data.matches);
  const side = neighbors(data.players, meNum);
  // 내 티어 — 종합 순위(티어표와 같은 줄 세우기), 이번 주 종합 변화.
  const ranked = tierRows(data.players, 'ovr').flatMap((r) => r.players);
  const myRank = mePlayer ? ranked.findIndex((p) => p.num === mePlayer.num) + 1 : 0;
  const myTier = mePlayer ? tiers.get(mePlayer.num) : undefined;
  const wk = mePlayer && myHist ? change(series(myHist, mePlayer, 'ovr'), Date.now(), 7) : null;
  const law = lawOfDay(seoulToday());

  return (
    <>
      <div className="page-head"><h1>라커룸 <span className="muted" id="stamp">{s.stamp}</span></h1>
        <div className="actions">{today && (
          <p className="today-stats" aria-label="오늘 활동">
            <span>오늘 <b>{today.visitors}</b>명 방문</span>
            <span>대결 <b>{today.duels}</b>판</span>
            <span>방명록 <b>{today.guestbook}</b></span>
            {today.potm > 0 && <span>POTM 표 <b>{today.potm}</b></span>}
          </p>
        )}</div>
      </div>
      {data.players.length > 0 && <SquadBanner players={data.players} />}
      <div className="rail">
        {s.meTile.kind === 'picked' && mePlayer
          ? (
            // 칸 전체가 링크였는데, 가운데 유니폼을 눌러 뒤집게 되면서 링크는 아래 글줄로 옮겼다.
            <Card className="tile tile-locker is-static" variant="borderless" style={{ ...LOCKER_STYLE, cursor: 'default' }} styles={TILE_BODY}>
              <span className="tile-label">내 선수</span>
              <LockerScene side={side}>
                <MyLocker player={mePlayer}
                  card={<PlayerCard player={mePlayer} tier={tiers.get(mePlayer.num)} size="sm" className="locker-card" team={data.players} potmDate={potm && potm.nums.includes(mePlayer.num) ? potm.date : null} />} />
              </LockerScene>
              <span className="tile-sub lk-foot"><span>유니폼을 누르면 카드</span><a className="tile-go" href={href(`/squad/${s.meTile.num}/`)}>내 선수 보기 · 꾸미기 ›</a></span>
            </Card>
          )
          : <EmptyMeTile onOpen={openMe} side={side} />}
        {/* 명단·라인업 타일은 뺐다(2026-09-28 "의미가 없다" — 상단 탭으로 충분). 대신 내 티어·최근 방명록·오늘의 전술. */}
        {mePlayer ? (
          <LinkTile to={href(`/squad/${mePlayer.num}/#stathist`)}>
            <span className="tile-label">내 티어</span>
            {ovr(mePlayer) > 0 ? (
              <>
                <b className="tile-big hm-tier">{myTier && <span className={`hm-tier-badge tier-${myTier}`}>{myTier}</span>}{ovr(mePlayer)}</b>
                <span className="tile-sub">{data.players.length}명 중 {myRank}위{wk != null ? ` · 이번 주 ${wk > 0 ? `▲${wk}` : wk < 0 ? `▼${-wk}` : '±0'}` : ''}</span>
              </>
            ) : <span className="tile-sub">아직 능력치 배치 전입니다</span>}
          </LinkTile>
        ) : (
          <LinkTile to={href('/tier/')}><span className="tile-label">내 티어</span><b className="tile-big">티어표</b><span className="tile-sub">로그인하고 이름을 고르면 내 순위가 보입니다</span></LinkTile>
        )}
        <LinkTile to={href(guests?.[0] ? `/squad/${guests[0].num}/` : '/squad/')}>
          <span className="tile-label">최근 방명록</span>
          {guests && guests.length > 0 ? (
            <ul className="hm-guests">
              {guests.map((g) => (
                <li key={g.id}><span className="muted">{g.authorName || '누군가'} → {g.toName}</span><span className="hm-guest-text">{g.text}</span></li>
              ))}
            </ul>
          ) : <span className="tile-sub">{guests ? '아직 방명록이 없습니다 — 선수 페이지 아래에 한 줄 남겨 보세요' : '불러오는 중…'}</span>}
        </LinkTile>
        {/* 봉사는 이번 달·다음 달 두 칸이던 걸 한 칸으로(2026-09-28 "봉사에 영역을 너무 많이 배정"). 다음 달은 아래 한 줄. */}
        <LinkTile to={href('/rules/#duty')}>
          <span className="tile-label">{s.duty.monthLabel.replace(/^\d+년 /, '')} 봉사</span>{dutyBody(s.duty)}
          <span className="tile-sub">다음 {s.dutyNext.monthLabel.replace(/^\d+년 /, '')} {s.dutyNext.p1} · {s.dutyNext.p2}</span>
        </LinkTile>
        {/* 미납 벌금 타일은 뺐다 — 벌금은 운영 규칙에서만 본다(2026-09-23 사용자 결정). */}
        <LinkTile to={LINKS.youtube}><span className="tile-label">매치 영상</span><b className="tile-big">유튜브</b><span className="tile-sub">채널에서 보기 · 매주 토요일 기록</span></LinkTile>
        {/* 오늘의 전술 — 날마다 34개 중 하나(lawOfDay). 두 칸 폭. */}
        <LinkTile to={href(`/tactics/#law-${law.n}`)} wide>
          <span className="tile-label">오늘의 전술</span>
          <span className="hm-law">
            <span className="hm-law-board" aria-hidden="true" dangerouslySetInnerHTML={{ __html: tacticsBoardSvg(BOARDS[law.art], law.title) }} />
            <span className="hm-law-text"><b>{law.n}. {law.title}</b><span className="muted">{law.desc}</span></span>
          </span>
        </LinkTile>
      </div>
    </>
  );
}

export default function HomeApp() {
  return <ThemeRoot><App /></ThemeRoot>;
}
