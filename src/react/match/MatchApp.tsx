// 매치 탭 = 채널 영상 목록(시트 매치 기록·관리자 가져오기는 쓰지 않는다, 스펙 §3.4).
// ?v= 로 상세(임베드), 없으면 목록(antd Card 격자). 완전 정적 빌드라 ?v= 는 브라우저에서만 읽는다.
import { Card } from 'antd';
import { useEffect, useState } from 'react';
import { loadVideos } from '../../lib/api';
import { fmtDate, ytEmbed, ytThumb, ytWatch } from '../../lib/html';
import { matchVideos } from '../../lib/match-videos';
import type { MatchVideo } from '../../lib/match-videos';
import { href } from '../../lib/url';
import ThemeRoot from '../ThemeRoot';
import { currentVideoId, findVideo, isValidVideoId, videoMeta } from './model';

function App() {
  const [list, setList] = useState<MatchVideo[] | null>(null);
  const [vid] = useState(() => (typeof window !== 'undefined' ? currentVideoId(window.location.search) : ''));

  useEffect(() => {
    loadVideos().then((v) => setList(matchVideos(v))).catch(() => setList([]));
  }, []);

  if (vid) {
    const m = list ? findVideo(list, vid) : undefined;
    const id = m?.id ?? (isValidVideoId(vid) ? vid : '');
    return (
      <>
        <div className="page-head">
          <h1 id="title">{m?.date ? fmtDate(m.date) : '매치'}</h1>
          <div className="actions" id="actions">
            <a className="chip" href={href('/match/')}>← 목록</a>
            {id && <a className="chip" href={ytWatch(id)} target="_blank" rel="noopener">유튜브에서 보기 →</a>}
          </div>
        </div>
        {list === null ? null : id ? (
          <div className="stack" id="app">
            {m && videoMeta(m) && <p className="muted">{videoMeta(m)}</p>}
            <div className="embed"><iframe src={ytEmbed(id)} title={m?.title || '매치 영상'} loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen /></div>
          </div>
        ) : (
          <div className="stack" id="app"><p className="muted">영상을 찾을 수 없습니다.</p></div>
        )}
      </>
    );
  }

  return (
    <>
      <div className="page-head">
        <h1 id="title">매치 {list && <span className="muted" id="count">{list.length}편</span>}</h1>
        <div className="actions" id="actions" />
      </div>
      <div className="stack" id="app">
        {list && (
          list.length ? (
            <div className="thumbs">
              {list.map((m) => (
                <a key={m.id} href={href(`/match/?v=${encodeURIComponent(m.id)}`)} style={{ display: 'contents' }}>
                  <Card className="thumb" variant="borderless" cover={<img src={ytThumb(m.id)} alt="" loading="lazy" />}>
                    <b>{m.date ? fmtDate(m.date) : m.title}</b>
                    <div className="muted">{videoMeta(m) || m.title}</div>
                  </Card>
                </a>
              ))}
            </div>
          ) : <p className="muted">채널 영상을 불러오지 못했습니다.</p>
        )}
      </div>
    </>
  );
}

export default function MatchApp() {
  return <ThemeRoot><App /></ThemeRoot>;
}
