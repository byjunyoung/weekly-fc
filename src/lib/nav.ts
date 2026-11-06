// 상단 메뉴 구성(2026-11-06 여덟 → 여섯 → 다섯, "명단이랑 티어도 하나로 합치자" → 같은 날 「게임」을 더해 여섯). 경로는 전부 base 없는 '/…/' 꼴 — 링크로 쓸 때 href() 를 씌운다.
// 화면을 모르는 순수 모듈이라 node 단위 테스트가 그대로 가져온다.
export type SubItem = { to: string; label: string; also?: string[] };   // also = 이 탭이 켜지는 다른 경로 접두
export type NavItem = { to: string; label: string; sub?: SubItem[]; also?: string[] };

export const NAV: NavItem[] = [
  { to: '/', label: '라커룸' },
  // 선수 = 티어·표·아바타 세 탭(제목 아래, SquadApp 이 그린다). 가장 왼쪽 탭인 티어가 기본 화면이라 메뉴는 /tier/ 로 간다
  // (2026-11-06 "티어가 기본뷰", "기본값이 가장 왼쪽 탭", "메뉴가 탭을 포괄하는 명칭"). 표·아바타·선수 상세는 /squad/ 아래.
  { to: '/tier/', label: '선수', also: ['/squad/'] },
  { to: '/matches/', label: '매치', sub: [
    { to: '/matches/', label: '지난 경기' },          // /matches/new/ 등 하위 주소도 접두 일치로 여기
    { to: '/lineup/', label: '라인업 짜기' },
  ] },
  { to: '/tactics/', label: '전술' },
  { to: '/guide/', label: '안내', sub: [
    // 시작하기와 규칙은 「가이드」 한 페이지로 합쳤다(2026-11-06 "하나로 퉁치자 별로 내용 차이도 없구먼"). /rules/ 는 넘김 페이지.
    { to: '/guide/', label: '가이드', also: ['/rules/'] },
    { to: '/kit/', label: '자료' },
  ] },
  // 게임 = 2D 모드 | 3D 모드(2026-11-07 "게임 메뉴는 아래 게임 여러개 고를 수 있게", "그냥 모드를 2d 모드, 3d 모드로 정의하고").
  // 메뉴는 목록 화면(/games/)으로 가고, 만든 게임을 모드별 목록에 하나씩 더한다. 게임 화면(/game/·/game3d/)에서도 메뉴와 그 모드 탭이 켜진다.
  { to: '/games/', label: '게임', sub: [
    { to: '/games/', label: '2D 모드', also: ['/game/'] },
    { to: '/games/3d/', label: '3D 모드', also: ['/game3d/'] },
  ] },
];

const hit = (path: string, to: string) => (to === '/' ? path === '/' : path.startsWith(to));
const hitSub = (path: string, s: SubItem) => hit(path, s.to) || (s.also ?? []).some((p) => hit(path, p));

/** 지금 경로에서 켜질 상단 메뉴와 하위 탭. 못 찾으면 둘 다 null(예: /stats/). */
export function activeNav(path: string): { top: NavItem | null; sub: SubItem | null } {
  for (const top of NAV) {
    if (top.sub) {
      // 여러 탭이 맞으면 주소가 가장 길게 맞는 탭 — '/games/3d/' 는 '/games/' 로도 시작하지만 3D 탭이어야 한다.
      let sub: SubItem | null = null, best = -1;
      for (const c of top.sub) {
        if (!hitSub(path, c)) continue;
        const len = Math.max(hit(path, c.to) ? c.to.length : 0, ...(c.also ?? []).map((p) => (hit(path, p) ? p.length : 0)));
        if (len > best) { best = len; sub = c; }
      }
      if (sub) return { top, sub };
    } else if (hit(path, top.to) || (top.also ?? []).some((p) => hit(path, p))) return { top, sub: null };
  }
  return { top: null, sub: null };
}
