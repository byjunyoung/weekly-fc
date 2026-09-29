// 라커룸 맨 위 단체 사진 칸(2026-09-30 "단체 사진은 라커룸에 딱 보이게, 팀 자료 바로가기도").
// 넓은 화면은 두 줄짜리 가로 띠, 폰은 정사각 — 폰 폭에 가로 띠를 넣으면 선수가 점만 해진다.
// 칸 전체가 팀 자료(/kit/)로 가는 링크다. 그림은 지금 명단·아바타로 그린다(squad-image).
import { useEffect, useState, useSyncExternalStore } from 'react';
import { ensureShareFonts } from '../../components/share-image';
import { drawSquadImage, SQUAD_FORMATS } from '../../components/squad-image';
import { href } from '../../lib/url';
import type { Player } from '../../lib/types';

const NARROW = '(max-width: 640px)';
const subscribe = (cb: () => void) => { const m = window.matchMedia(NARROW); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb); };

export default function SquadBanner({ players }: { players: Player[] }) {
  const narrow = useSyncExternalStore(subscribe, () => window.matchMedia(NARROW).matches, () => false);
  const fmt = narrow ? 'square' : 'banner';
  const [src, setSrc] = useState<string | null>(null);
  const year = new Date().getFullYear();
  useEffect(() => {
    if (!players.length) return;
    let live = true;
    ensureShareFonts().then(() => {
      if (!live) return;
      const c = document.createElement('canvas');
      drawSquadImage(c, players, fmt, year);
      setSrc(c.toDataURL('image/png'));
    });
    return () => { live = false; };
  }, [players, fmt, year]);
  const S = SQUAD_FORMATS[fmt];
  return (
    <a className="card hm-squad" href={href('/kit/')}>
      <span className="hm-squad-head"><span className="tile-label">{year} SQUAD · {players.length}명</span><span className="tile-go">팀 자료 · 로고·단체 사진 받기 ›</span></span>
      <span className="hm-squad-img" style={{ aspectRatio: `${S.w} / ${S.h}` }}>
        {src && <img src={src} alt={`WEEKLY FC ${year} 단체 사진`} />}
      </span>
    </a>
  );
}
