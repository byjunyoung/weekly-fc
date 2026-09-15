// 관리자 여부 — PIN 은 sessionStorage 라 빌드 때는 false 로 그리고 화면이 뜬 뒤에 읽는다. wfc:admin 마다 다시 읽는다.
import { useEffect, useState } from 'react';
import { isAdmin } from '../lib/api';

export function useAdmin(): boolean {
  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    const read = () => setAdmin(isAdmin());
    read();
    window.addEventListener('wfc:admin', read);
    return () => window.removeEventListener('wfc:admin', read);
  }, []);
  return admin;
}
