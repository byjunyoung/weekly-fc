// 상단 메뉴 구성(2026-11-06 여덟 → 여섯 → 다섯, "명단이랑 티어도 하나로 합치자"). 경로는 전부 base 없는 '/…/' 꼴 — 링크로 쓸 때 href() 를 씌운다.
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
    { to: '/guide/', label: '시작하기' },   // 처음엔 「처음 왔다면」 — 2026-11-06 "문구 촌스러움" 으로 바꿈
    { to: '/rules/', label: '규칙' },
    { to: '/kit/', label: '자료' },
  ] },
];

const hit = (path: string, to: string) => (to === '/' ? path === '/' : path.startsWith(to));
const hitSub = (path: string, s: SubItem) => hit(path, s.to) || (s.also ?? []).some((p) => hit(path, p));

/** 지금 경로에서 켜질 상단 메뉴와 하위 탭. 못 찾으면 둘 다 null(예: /stats/). */
export function activeNav(path: string): { top: NavItem | null; sub: SubItem | null } {
  for (const top of NAV) {
    if (top.sub) {
      const sub = top.sub.find((s) => hitSub(path, s));
      if (sub) return { top, sub };
    } else if (hit(path, top.to) || (top.also ?? []).some((p) => hit(path, p))) return { top, sub: null };
  }
  return { top: null, sub: null };
}
