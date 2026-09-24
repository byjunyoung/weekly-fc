// src/lib/backend.ts — Supabase 프로젝트 주소와 공개 키.
// 둘 다 **브라우저에 실리게 만든 공개용 값**이다(비밀 키가 아니다). 전권을 가진 service_role 키는
// 어디에도 두지 않는다 — 모든 쓰기는 DB 함수가 로그인 토큰으로 누구인지 확인한다(2026-09-24 본인인증).
export const SUPABASE_URL = 'https://irltzwgijbbodkgzmnrc.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_Aum9yotpAs5M7_3g9DqA5Q_Q7mLRlMk';
