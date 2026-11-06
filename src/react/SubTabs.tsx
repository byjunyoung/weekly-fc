// 제목 아래 탭 줄. 선수·매치·안내가 같은 자리(제목 바로 아래)·같은 모양(.subnav)으로 쓴다
// (2026-11-06 "탭 스타일이 왜 메뉴마다 다 다르냐 통일해"). 가장 왼쪽 탭이 그 메뉴의 기본 화면이다.
import { activeNav } from '../lib/nav';
import { href } from '../lib/url';

export type TabItem = { label: string; to: string; active: boolean; onPick?: () => void };

/** 모양만 — 무엇을 탭으로 둘지는 부르는 쪽이 정한다. onPick 이 있으면 페이지를 옮기지 않고 그 자리에서 바꾼다. */
export function TabRow({ items, label }: { items: TabItem[]; label: string }) {
  return (
    <nav className="subnav" aria-label={label}>
      {items.map((t) => (
        <a key={t.label} href={href(t.to)} className={t.active ? 'active' : undefined} aria-current={t.active ? 'page' : undefined}
          onClick={t.onPick ? (e) => { e.preventDefault(); t.onPick?.(); } : undefined}>{t.label}</a>
      ))}
    </nav>
  );
}

/** 묶인 메뉴(매치·안내)의 탭 — lib/nav 의 sub 를 그대로. path 는 base 없는 지금 주소. 탭이 없는 메뉴면 아무것도 안 그린다. */
export default function SubTabs({ path }: { path: string }) {
  const { top, sub } = activeNav(path);
  if (!top?.sub) return null;
  return <TabRow label={`${top.label} 탭`} items={top.sub.map((s) => ({ label: s.label, to: s.to, active: s === sub }))} />;
}
