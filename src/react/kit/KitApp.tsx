// 팀 자료(2026-09-30 "단체 사진이랑 로고를 웹사이트에 올려 두고 누구나 받게") — 메뉴엔 없고 라커룸 단체 사진 칸에서 들어온다.
// 단체 사진은 지금 명단·아바타로 그때그때 그리고(squad-image), 규격을 골라 공통 틀(ImageShareModal)로 저장·공유한다.
// 로고는 바뀌지 않으니 public/brand/ 의 파일을 그대로 내려받는다.
import { Button, Segmented } from 'antd';
import { useEffect, useState } from 'react';
import { ensureShareFonts } from '../../components/share-image';
import { drawSquadImage, SQUAD_FORMATS, type SquadFormat } from '../../components/squad-image';
import { href } from '../../lib/url';
import ImageShareModal from '../ImageShareModal';
import Loading from '../Loading';
import ThemeRoot from '../ThemeRoot';
import { useData } from '../useData';

const SNS: SquadFormat[] = ['feed', 'square', 'story', 'wide'];
// 고르는 줄은 짧은 이름만 — 비율까지 붙이면 폰 폭(390px)을 넘는다. 비율·크기는 미리보기 아래 한 줄에.
const SHORT: Partial<Record<SquadFormat, string>> = { feed: '피드', square: '정사각', story: '스토리', wide: '가로' };
const LOGOS: Array<{ id: string; label: string }> = [
  { id: 'word', label: '한 줄' }, { id: 'stack', label: '두 줄' }, { id: 'ball', label: '두 줄 + 공' },
];

function Kit() {
  const { data } = useData();
  const [fmt, setFmt] = useState<SquadFormat>('feed');
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const year = new Date().getFullYear();

  useEffect(() => {
    if (!data?.players.length) return;
    let live = true;
    ensureShareFonts().then(() => {
      if (!live) return;
      const c = document.createElement('canvas');
      drawSquadImage(c, data.players, fmt, year);
      setPreview(c.toDataURL('image/png'));
    });
    return () => { live = false; };
  }, [data, fmt, year]);

  const head = <div className="page-head"><h1>팀 자료</h1><div className="actions"><span className="muted">누구나 받아 가서 써도 됩니다</span></div></div>;
  if (!data) return <Loading title="팀 자료" />;
  const S = SQUAD_FORMATS[fmt];
  return (
    <>
      {head}
      <div className="stack">
        <section className="card">
          <div className="card-head"><h2>단체 사진</h2><span className="muted">{year} SQUAD · {data.players.length}명 · 지금 명단과 아바타로 그립니다</span></div>
          <div className="kit-bar">
            <Segmented className="chips" value={fmt} onChange={(v) => setFmt(v as SquadFormat)}
              options={SNS.map((f) => ({ value: f, label: SHORT[f] }))} />
            <Button type="primary" onClick={() => setOpen(true)}>저장 · 공유</Button>
          </div>
          <div className="kit-preview" style={{ aspectRatio: `${S.w} / ${S.h}` }}>
            {preview ? <img src={preview} alt={`WEEKLY FC 단체 사진 ${S.label} 미리보기`} /> : <span className="muted">그리는 중…</span>}
          </div>
          <p className="muted">{S.label} · {S.w}×{S.h}px · 선수 이름·등번호가 들어갑니다</p>
        </section>
        <section className="card">
          <div className="card-head"><h2>로고</h2><span className="muted">1080×1080 PNG · 검은 바탕 / 투명 바탕</span></div>
          <ul className="kit-logos">
            {LOGOS.map((l) => (
              <li key={l.id}>
                <img src={href(`/brand/weeklyfc-logo-${l.id}.png`)} alt={`WEEKLY FC 로고 ${l.label}`} loading="lazy" />
                <b>{l.label}</b>
                <span className="kit-dl">
                  <a href={href(`/brand/weeklyfc-logo-${l.id}.png`)} download>PNG</a>
                  <a href={href(`/brand/weeklyfc-logo-${l.id}-transparent.png`)} download>투명 PNG</a>
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <ImageShareModal open={open} onClose={() => setOpen(false)} title={`단체 사진 · ${S.label}`} shareTitle="WEEKLY FC 단체 사진"
        fileName={`weeklyfc-squad-${year}-${fmt}.png`} alt="단체 사진 미리보기" redrawKey={fmt}
        draw={(c) => drawSquadImage(c, data.players, fmt, year)} />
    </>
  );
}

export default function KitApp() {
  return <ThemeRoot><Kit /></ThemeRoot>;
}
