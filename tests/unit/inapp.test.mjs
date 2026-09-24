// 인앱 브라우저 감지·탈출 주소. UA 표본은 실제로 받아 적은 것이다 — 특히 카톡 iOS 는
// 2026-09-22 진단 페이지에 찍힌 문자열 그대로다(그 환경에서 API 가 멈추는 걸 확인했다).
import test from 'node:test';
import assert from 'node:assert/strict';
import { detectInApp, escapeUrl, shouldAutoEscape } from '../../src/lib/inapp.ts';

const UA = {
  kakaoIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1 KAKAOTALK/26.7.3 (INAPP)',
  kakaoAos: 'Mozilla/5.0 (Linux; Android 14; SM-S911N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36 KAKAOTALK 10.4.5',
  safari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  chromeMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36',
  chromeAos: 'Mozilla/5.0 (Linux; Android 14; SM-S911N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  instaIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 302.0.0.23.113 (iPhone14,5; iOS 17_5_1; ko_KR)',
  instaAos: 'Mozilla/5.0 (Linux; Android 14; SM-S911N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 Instagram 302.0.0.23.113',
  naver: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 NAVER(inapp; search; 2000; 12.5.1)',
};
const URL_ = 'https://byjunyoung.github.io/weekly-fc/';

test('보통 브라우저는 인앱으로 보지 않는다', () => {
  for (const k of ['safari', 'chromeMac', 'chromeAos']) {
    assert.equal(detectInApp(UA[k]), null, `${k} 가 인앱으로 잡혔다`);
  }
});

test('카톡은 두 플랫폼 다 알아본다', () => {
  assert.deepEqual(detectInApp(UA.kakaoIos), { name: '카카오톡', platform: 'ios', kakao: true });
  assert.deepEqual(detectInApp(UA.kakaoAos), { name: '카카오톡', platform: 'android', kakao: true });
});

test('iOS 카톡은 카톡 전용 스킴으로 빠져나간다', () => {
  const u = escapeUrl(detectInApp(UA.kakaoIos), URL_);
  assert.equal(u, `kakaotalk://web/openExternal?url=${encodeURIComponent(URL_)}`);
});

test('안드로이드는 intent 스킴 — 특정 브라우저를 박지 않고 되돌아갈 주소를 남긴다', () => {
  const u = escapeUrl(detectInApp(UA.kakaoAos), URL_);
  assert.ok(u.startsWith('intent://byjunyoung.github.io/weekly-fc/#Intent;'), `앞머리가 다르다: ${u}`);
  assert.ok(u.includes('scheme=https;'), 'scheme 이 빠지면 안 열린다');
  assert.ok(!u.includes('package='), '특정 브라우저를 박으면 그게 없는 기기에서 실패한다');
  assert.ok(u.includes(`S.browser_fallback_url=${encodeURIComponent(URL_)}`), '받을 앱이 없을 때 돌아갈 주소가 없다');
  assert.ok(u.endsWith(';end'), 'intent 는 ;end 로 닫아야 한다');
});

test('주소의 조각(#)은 intent 의 #Intent 와 섞이지 않게 버린다', () => {
  const u = escapeUrl(detectInApp(UA.kakaoAos), `${URL_}squad/#top`);
  assert.equal(u.match(/#/g).length, 1, `# 가 둘 이상이면 안드로이드가 파싱을 못 한다: ${u}`);
  assert.ok(u.startsWith('intent://byjunyoung.github.io/weekly-fc/squad/#Intent;'));
});

test('iOS 의 카톡 아닌 인앱은 빠져나갈 길이 없다 — 안내만 가능', () => {
  const insta = detectInApp(UA.instaIos);
  assert.equal(insta.name, '인스타그램');
  assert.equal(escapeUrl(insta, URL_), null, 'iOS 는 앱이 사파리를 강제로 띄우지 못한다');
  assert.equal(escapeUrl(detectInApp(UA.naver), URL_), null);
});

test('자동 전환은 카톡에만 — 증상을 확인한 곳만 내보낸다', () => {
  assert.equal(shouldAutoEscape(detectInApp(UA.kakaoIos)), true);
  assert.equal(shouldAutoEscape(detectInApp(UA.kakaoAos)), true);
  assert.equal(shouldAutoEscape(detectInApp(UA.instaIos)), false);
  assert.equal(shouldAutoEscape(detectInApp(UA.instaAos)), false, '안드로이드라도 카톡이 아니면 자동 전환하지 않는다');
  assert.equal(shouldAutoEscape(detectInApp(UA.naver)), false);
  assert.equal(shouldAutoEscape(null), false);
});

test('주소에 inapp=stay 가 있으면 카톡이어도 자동 전환하지 않는다 — 새 백엔드를 인앱에서 확인하는 용도', () => {
  assert.equal(shouldAutoEscape(detectInApp(UA.kakaoIos), '?inapp=stay'), false);
  assert.equal(shouldAutoEscape(detectInApp(UA.kakaoIos), '?x=1&inapp=stay'), false);
  assert.equal(shouldAutoEscape(detectInApp(UA.kakaoIos), ''), true);
  assert.equal(shouldAutoEscape(detectInApp(UA.kakaoIos), '?inapp=go'), true);
});
