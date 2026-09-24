// 로그인해 차지한 내 번호 — 브라우저 저장소라 화면이 뜬 뒤에 읽고, 로그인·차지가 바뀔 때(wfc:me)마다 다시 읽는다.
import { useEffect, useState } from 'react';
import { cachedMe, type Me } from '../lib/auth';
import { getMe } from '../lib/me';

export function useMe(): number | null {
  const [me, setMeState] = useState<number | null>(null);
  useEffect(() => {
    const read = () => setMeState(getMe());
    read();
    window.addEventListener('wfc:me', read);
    return () => window.removeEventListener('wfc:me', read);
  }, []);
  return me;
}

/** 로그인 정보 전체(이메일·차지·관리자·오늘 판수) — 대결 화면이 제한을 미리 걸러 보여 주는 데 쓴다. */
export function useMeInfo(): Me {
  const [me, setMeInfo] = useState<Me>({ login: false });
  useEffect(() => {
    const read = () => setMeInfo(cachedMe());
    read();
    window.addEventListener('wfc:me', read);
    return () => window.removeEventListener('wfc:me', read);
  }, []);
  return me;
}
