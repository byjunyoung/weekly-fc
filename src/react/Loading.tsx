// 데이터가 아직 없을 때의 화면. 예전엔 제목만 그려서, 응답이 안 오면 본문이 통째로 빈
// 화면이 됐다(2026-09-22 카톡 인앱 신고). 기다리는 중임을 적어 두면 "깨졌다"로 읽히지 않는다.
// 2026-09-28 — 글자만 있던 자리에 통통 튀며 도는 도트 축구공(12×12 — 가운데 오각형과 가장자리 조각). 움직임 줄이기 설정이면 멈춘 공.
import type { ReactNode } from 'react';

const BALL = [
  '....OOOO....',
  '..OOWWWWOO..',
  '.OWWWKKWWWO.',
  '.OWWKKKKWWO.',
  'OKWWWKKWWWKO',
  'OKKWWWWWWKKO',
  'OWWWWWWWWWWO',
  'OWKKWWWWKKWO',
  '.OKKWWWWKKO.',
  '.OWWWKKWWWO.',
  '..OOWKKWOO..',
  '....OOOO....',
];
const FILL: Record<string, string> = { O: '#5c6068', W: '#f2f2f2', K: '#1f2126' };   // 테두리는 어두운 바탕에서도 보이게 회색
const ballSvg = (() => {
  let r = '';
  BALL.forEach((row, y) => [...row].forEach((c, x) => { if (FILL[c]) r += `<rect x="${x}" y="${y}" width="1" height="1" fill="${FILL[c]}"/>`; }));
  return `<svg viewBox="0 0 12 12" width="48" height="48" shape-rendering="crispEdges" aria-hidden="true">${r}</svg>`;
})();

/** tabs = 그 화면의 제목 아래 탭 줄 — 불러오는 동안에도 같은 자리에 있어야 화면이 덜컹거리지 않는다. */
export default function Loading({ title, tabs = null }: { title: string; tabs?: ReactNode }) {
  return (
    <>
      <div className="page-head"><h1>{title}</h1><div className="actions" /></div>
      {tabs}
      <div className="loading" role="status">
        <span className="loading-ball"><span className="loading-spin" dangerouslySetInnerHTML={{ __html: ballSvg }} /></span>
        <i className="loading-shadow" aria-hidden="true" />
        <span className="muted">불러오는 중…</span>
      </div>
    </>
  );
}
