// src/lib/me.ts — "나" = 로그인해 차지한 명단 번호(2026-09-24 본인인증). 예전엔 이 기기에 적어 둔 자칭 번호였다.
// 서버 me() 의 마지막 응답(auth.ts cachedMe)에서 읽는다. 바뀌면 auth.ts 가 wfc:me 를 보낸다.
import { cachedMe } from './auth.ts';

export function getMe(): number | null {
  const n = cachedMe().num;
  return typeof n === 'number' && n > 0 ? n : null;
}
