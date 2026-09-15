// 이 기기에 기억한 내 번호 — localStorage 라 화면이 뜬 뒤에 읽고, setMe 가 보내는 wfc:me 마다 다시 읽는다.
import { useEffect, useState } from 'react';
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
