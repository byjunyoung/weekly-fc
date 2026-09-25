// src/lib/share.ts — 공유 이미지를 어떻게 내보낼지 고른다. 환경 값만 받는 순수 함수.
// 카카오톡 내부 브라우저는 iOS 에선 data URL, Android 에선 <a download> 만 받고 blob URL 다운로드는
// 둘 다 안 된다(devtalk.kakao.com/t/topic/146168). 파일 공유 가능 여부는 canShare 로 먼저 본다(MDN).
export type ShareEnv = { canShareFiles: boolean; ua: string; touchPoints: number };
export type ShareMethod = 'share' | 'longpress' | 'download';

/** iPadOS 는 데스크톱 모드에서 맥 UA 를 보내므로 터치 지점 수로 가른다. */
export const isIOS = (env: ShareEnv): boolean => /iPhone|iPad|iPod/i.test(env.ua) || (/Macintosh/i.test(env.ua) && env.touchPoints > 1);
export const fallbackMethod = (env: ShareEnv): 'longpress' | 'download' => (isIOS(env) ? 'longpress' : 'download');
/** 터치가 없는 데스크톱(맥·윈도). 맥 공유 시트의 "복사"는 파일을 **두 번** 클립보드에 넣어 카톡에 두 장이 간다(2026-09-25 사용자 재현) —
 *  데스크톱은 공유 시트를 안 쓰고 내려받기 + 클립보드 복사(이미지 한 장)로 간다. */
export const isDesktop = (env: ShareEnv): boolean => env.touchPoints === 0 && !isIOS(env);
export const pickShareMethod = (env: ShareEnv): ShareMethod => (env.canShareFiles && !isDesktop(env) ? 'share' : fallbackMethod(env));
export const shareFileName = (today: string): string => `weeklyfc-lineup-${today}.png`;
