// 상단 메뉴 구성(2026-11-06 여덟 → 여섯 → 다섯, "명단이랑 티어도 하나로 합치자"). 경로는 전부 base 없는 '/…/' 꼴 — 링크로 쓸 때 href() 를 씌운다.
// 화면을 모르는 순수 모듈이라 node 단위 테스트가 그대로 가져온다.
export type SubItem = { to: string; label: string; also?: string[] };   // also = 이 탭이 켜지는 다른 경로 접두
export type NavItem = { to: string; label: string; sub?: SubItem[] };

export const NAV: NavItem[] = [
  { to: '/', label: '라커룸' },
  { to: '/squad/', label: '명단', sub: [
    { to: '/squad/', label: '선수' },                  // 선수 상세(/squad/N/)·배치 대결(/squad/place/)도 여기
    { to: '/tier/', label: '티어' },
  ] },
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
    } else if (hit(path, top.to)) return { top, sub: null };
  }
  return { top: null, sub: null };
}
