// src/lib/inapp.ts — 앱 안에 박힌 브라우저(인앱)를 알아보고, 바깥 브라우저로 빠져나갈 주소를 만든다.
//
// 왜 필요한가: 카톡 인앱 브라우저에서 구글 Apps Script 요청이 **응답 없이 멈춘다**
// (2026-09-22 확인 — iOS 18.7 / KAKAOTALK 26.7.3, 12초 무응답). 실패가 아니라 멈춤이라
// 오류 처리도 안 걸리고 화면이 제목만 남은 채 굳었다. 팀 링크가 카톡으로 오가니
// 멤버 전원이 매번 겪는다.
//
// 탈출 방법은 플랫폼마다 다르다:
//   iOS + 카톡    kakaotalk://web/openExternal?url=…      카톡이 여는 전용 스킴
//   안드로이드     intent://…#Intent;scheme=https;…;end    안드로이드 표준, 인앱 종류와 무관
//   iOS + 그 외    없음 — iOS 는 앱이 사파리를 강제로 띄우는 길을 막아 뒀다. 안내만 가능
//
// **자동 전환은 카톡에만 건다.** 다른 인앱(인스타·네이버 등)도 같은 증상인지는 확인하지
// 않았고, 멀쩡히 되는 브라우저를 밖으로 내쫓을 이유는 없다. 그쪽은 데이터가 실제로
// 안 왔을 때만 배너로 길을 알려 준다.

export type Platform = 'ios' | 'android' | 'other';
export type InApp = { name: string; platform: Platform; kakao: boolean };

/** 두 번 전환하지 않게 남기는 표식. 밖으로 나간 뒤 뒤로가기로 돌아오면 또 튕기기 때문. */
export const ESCAPE_KEY = 'wfc_inapp_escaped';

// 순서가 의미를 갖는다 — 카톡 인앱은 UA 뒤에 KAKAOTALK 을 덧붙일 뿐 앞쪽은 사파리/크롬
// 그대로라, 넓은 규칙(Line 등)보다 먼저 봐야 한다.
const APPS: ReadonlyArray<readonly [RegExp, string]> = [
  [/KAKAOTALK/i, '카카오톡'],
  [/NAVER\(inapp/i, '네이버'],
  [/DaumApps|DaumDevice/i, '다음'],
  [/Instagram/i, '인스타그램'],
  [/FBAN|FBAV|FB_IAB/i, '페이스북'],
  [/\bLine\//i, '라인'],
  [/everytimeApp/i, '에브리타임'],
];

function platformOf(ua: string): Platform {
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'other';
}

/** 인앱 브라우저면 무엇인지, 아니면 null. */
export function detectInApp(ua: string): InApp | null {
  for (const [re, name] of APPS) {
    if (re.test(ua)) return { name, platform: platformOf(ua), kakao: name === '카카오톡' };
  }
  return null;
}

/** 바깥 브라우저로 넘어갈 주소. 길이 없으면 null(=안내만 할 수 있다). */
export function escapeUrl(info: InApp, url: string): string | null {
  if (info.platform === 'android') {
    // 스킴을 떼고 intent 로 다시 싼다. 조각(#)은 뒤에 붙는 #Intent 와 부딪히므로 버린다.
    const rest = url.replace(/^https?:\/\//, '').split('#')[0];
    if (!rest) return null;
    // package 를 박으면 크롬이 없는 기기에서 실패한다 — 기본 브라우저가 받게 둔다.
    // 받을 앱이 하나도 없으면 fallback 으로 원래 주소를 열어 최소한 깨지지는 않는다.
    return `intent://${rest}#Intent;scheme=https;S.browser_fallback_url=${encodeURIComponent(url)};end`;
  }
  if (info.platform === 'ios' && info.kakao) {
    return `kakaotalk://web/openExternal?url=${encodeURIComponent(url)}`;
  }
  return null;
}

/** 지금 바로 밖으로 내보낼 대상인가 — 확인된 카톡만. */
export function shouldAutoEscape(info: InApp | null): boolean {
  return info != null && info.kakao;
}
