// 홈 대시보드 — 왼쪽 히어로(최근 매치, 직접 만든 채로)+오른쪽 타일 8개(antd Card).
import { Card } from 'antd';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { loadVideos } from '../../lib/api';
import { fmtDate, fmtWon, ytThumb, ytThumbBig } from '../../lib/html';
import { getMe } from '../../lib/me';
import { LINKS } from '../../lib/rules';
import type { Video } from '../../lib/types';
import { href } from '../../lib/url';
import ThemeRoot from '../ThemeRoot';
import { useData } from '../useData';
import { computeHomeSummary } from './model';
import type { DutyTile } from './model';

// 링크 타일 — antd Card 로 그리되, 앵커를 display:contents 로 감싸 그리드 자리·클릭을
// Card 가 그대로 물려받게 한다(astro-island 와 같은 기법). 배경(--elevated)·정렬은 인라인
// style 로 줘서 캐스케이드 순서에 기대지 않는다(2단계에서 자식 결합자가 깨졌던 교훈).
const TILE_STYLE = { background: 'var(--elevated)', display: 'flex', flexDirection: 'column' as const, textAlign: 'left' as const, padding: 'var(--s-md)', cursor: 'pointer' };
const TILE_BODY = { body: { padding: 0, display: 'contents' as const } };

function LinkTile({ to, wide, children }: { to: string; wide?: boolean; children: ReactNode }) {
  return (
    <a href={to} target={to.startsWith('http') ? '_blank' : undefined} rel={to.startsWith('http') ? 'noopener' : undefined} style={{ display: 'contents' }}>
      <Card className={`tile${wide ? ' tile-wide' : ''}`} variant="borderless" style={TILE_STYLE} styles={TILE_BODY}>{children}</Card>
    </a>
  );
}
function EmptyMeTile({ onOpen }: { onOpen: () => void }) {
  return (
    <Card className="tile" variant="borderless" style={TILE_STYLE} styles={TILE_BODY}
      role="button" tabIndex={0} onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}>
      <span className="tile-label">내 선수</span><b className="tile-big">?</b><span className="tile-sub">이름을 고르면 내 카드가 뜹니다</span>
    </Card>
  );
}
const dutyBody = (d: DutyTile) => <><span className="tile-duo"><b>{d.p1}</b><b>{d.p2}</b></span><span className="tile-sub">{d.sub}</span></>;
function HeroImg({ id }: { id: string }) {
  const [big, setBig] = useState(true);
  return <img src={big ? ytThumbBig(id) : ytThumb(id)} alt="" onError={() => setBig(false)} />;
}

function App() {
  const { data } = useData();
  const [videos, setVideos] = useState<Video[] | null>(null);
  const [me, setMe] = useState<number | null>(null);

  useEffect(() => {
    loadVideos().then(setVideos).catch(() => setVideos([]));
    const read = () => setMe(getMe());
    read();
    window.addEventListener('wfc:me', read);
    return () => window.removeEventListener('wfc:me', read);
  }, []);
  const openMe = () => window.dispatchEvent(new Event('wfc:open-me'));

  if (!data || !videos) return <div className="page-head"><h1>홈</h1><div className="actions" /></div>;

  const s = computeHomeSummary(data, videos, me, new Date());
  const thumbs = videos.slice(0, 4).map((v) => <img key={v.id} src={ytThumb(v.id)} alt="" loading="lazy" />);

  return (
    <>
      <div className="page-head"><h1>홈</h1><div className="actions"><span className="muted" id="stamp">{s.stamp}</span></div></div>
      <div className="menu">
        <section className="art">
          {s.recentMatch && <HeroImg id={s.recentMatch.id} />}
          <span className="art-kicker">최근 매치</span>
          <h2 className="art-title">{(s.recentMatch?.typeLabel ?? '') || '매치'}</h2>
          <p className="art-sub">{s.recentMatch?.date ? fmtDate(s.recentMatch.date) : '날짜 미정'}{s.recentMatch?.location ? ` · ${s.recentMatch.location}` : ''}</p>
          <div className="art-foot">
            <a className="chip" href={href('/match/')}>매치 전체 →</a>
            {s.recentMatch && <a className="chip" href={href(`/match/?v=${encodeURIComponent(s.recentMatch.id)}`)}>영상 보기 →</a>}
          </div>
        </section>
        <div className="rail">
          {s.meTile.kind === 'picked'
            ? <LinkTile to={href(`/squad/${s.meTile.num}/`)}><span className="tile-label">내 선수</span><b className="tile-big">{s.meTile.ovr || '–'}</b><span className="tile-sub">{s.meTile.name} · {s.meTile.pos}</span></LinkTile>
            : <EmptyMeTile onOpen={openMe} />}
          <LinkTile to={href('/squad/')}><span className="tile-label">스쿼드</span><b className="tile-big">{s.squadCount}</b><span className="tile-sub">{s.posSummary}</span></LinkTile>
          <LinkTile to={href('/match/')}><span className="tile-label">매치</span><b className="tile-big">{s.matchCount}</b><span className="tile-sub">채널 영상</span></LinkTile>
          <LinkTile to={href('/squad/')}><span className="tile-label">라인업</span><b className="tile-big">짜서 공유</b><span className="tile-sub">명단에서 골라 이미지로</span></LinkTile>
          <LinkTile to={href('/rules/#duty')}><span className="tile-label">{s.duty.monthLabel} 봉사</span>{dutyBody(s.duty)}</LinkTile>
          <LinkTile to={href('/rules/#duty')}><span className="tile-label">다음 봉사</span>{dutyBody(s.dutyNext)}</LinkTile>
          <LinkTile to={href('/rules/#fees')}><span className="tile-label">미납 벌금</span><b className="tile-big">{fmtWon(s.unpaidAmount)}</b><span className="tile-sub">{s.unpaidCount}건 · 내역 보기</span></LinkTile>
          <LinkTile to={LINKS.youtube} wide><span className="tile-label">최신 영상</span><b className="tile-big">{s.videoCount}</b><div className="tile-thumbs">{thumbs}</div><span className="tile-sub">채널에서 보기 · 매주 토요일 기록</span></LinkTile>
        </div>
      </div>
    </>
  );
}

export default function HomeApp() {
  return <ThemeRoot><App /></ThemeRoot>;
}
