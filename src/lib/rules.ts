// src/lib/rules.ts
export const FINE_TYPES = ['지각', '노쇼'] as const;
export const FINE_AMOUNT: Record<(typeof FINE_TYPES)[number], number> = { 지각: 30000, 노쇼: 50000 };
export const FINE_NOTE: Record<(typeof FINE_TYPES)[number], string> = { 지각: '시작 후 도착', 노쇼: '종료까지 미참' };
export const FINE_EXEMPT = '매치 시작 전 미리 공지하면 면제';
export const DUTY_PER_MONTH = 2;
export const MATCH_TIME = '토요일 오전 10–12시';
export const MATCH_MIN = 10;
export const PLACES = ['모란공원', '위례공원', '광주다이나믹'];
export const BANK = { name: '카카오뱅크 안심계좌', number: '7942-11-99103', holder: '위클리FC', since: '2025.01.18', contact: '김준영' };
export const LINKS = { kakao: 'https://open.kakao.com/o/gQLPdm5f', youtube: 'https://www.youtube.com/@WEEKLYFC2020' };
