import test from 'node:test';
import assert from 'node:assert/strict';
import { pickShareMethod, fallbackMethod, isDesktop, isIOS, shareFileName } from '../../src/lib/share.ts';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 25.5.0';
const IPAD_DESKTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15';
const ANDROID_KAKAO = 'Mozilla/5.0 (Linux; Android 15; SM-S928N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0 Mobile Safari/537.36;KAKAOTALK 2525500';

test('파일 공유가 되면 어디서든 공유 시트', () => {
  assert.equal(pickShareMethod({ canShareFiles: true, ua: ANDROID_KAKAO, touchPoints: 5 }), 'share');
});

test('공유가 안 되는 iOS(카톡 내부 브라우저 포함)는 길게 눌러 저장', () => {
  assert.equal(pickShareMethod({ canShareFiles: false, ua: IPHONE, touchPoints: 5 }), 'longpress');
});

test('데스크톱 모드 iPad(맥 UA + 터치)도 iOS 로 본다', () => {
  assert.equal(isIOS({ canShareFiles: false, ua: IPAD_DESKTOP, touchPoints: 5 }), true);
  assert.equal(isIOS({ canShareFiles: false, ua: IPAD_DESKTOP, touchPoints: 0 }), false);
});

test('그 외(Android 카톡·데스크톱)는 내려받기', () => {
  assert.equal(pickShareMethod({ canShareFiles: false, ua: ANDROID_KAKAO, touchPoints: 5 }), 'download');
  assert.equal(pickShareMethod({ canShareFiles: false, ua: IPAD_DESKTOP, touchPoints: 0 }), 'download');
});

test('공유 시트가 실패했을 때 대안은 OS 로만 가른다', () => {
  assert.equal(fallbackMethod({ canShareFiles: true, ua: IPHONE, touchPoints: 5 }), 'longpress');
  assert.equal(fallbackMethod({ canShareFiles: true, ua: ANDROID_KAKAO, touchPoints: 5 }), 'download');
});

test('파일 이름에 날짜', () => {
  assert.equal(shareFileName('2026-09-19'), 'weeklyfc-lineup-2026-09-19.png');
});

test('데스크톱(터치 없음)은 파일 공유가 돼도 내려받기 — 맥 공유 시트의 복사가 파일을 두 번 넣는다(2026-09-25)', () => {
  const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15';
  const WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0';
  assert.equal(isDesktop({ canShareFiles: true, ua: MAC, touchPoints: 0 }), true);
  assert.equal(isDesktop({ canShareFiles: true, ua: MAC, touchPoints: 5 }), false, '터치 맥 UA = 아이패드');
  assert.equal(pickShareMethod({ canShareFiles: true, ua: MAC, touchPoints: 0 }), 'download');
  assert.equal(pickShareMethod({ canShareFiles: true, ua: WIN, touchPoints: 0 }), 'download');
  assert.equal(pickShareMethod({ canShareFiles: true, ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', touchPoints: 5 }), 'share', '폰은 그대로 공유 시트');
});
