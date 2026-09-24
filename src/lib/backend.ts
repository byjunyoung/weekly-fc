// src/lib/backend.ts — Supabase 프로젝트 주소와 공개 키.
// 둘 다 **브라우저에 실리게 만든 공개용 값**이다(비밀 키가 아니다). 전권을 가진 service_role 키는
// 어디에도 두지 않는다 — 모든 쓰기는 DB 함수가 PIN 으로 확인한다(설계 §6).
export const SUPABASE_URL = 'https://PROJECT_REF.supabase.co';
export const SUPABASE_KEY = 'PUBLISHABLE_KEY';
