// api.ts 의 캐시·refresh·이벤트를 React 상태로. 옛 화면과 같은 wfc:data / wfc:error 를 듣는다(스펙 §4).
// 빌드 때는 브라우저 저장소가 없어 null 로 그리고, 캐시는 화면이 뜬 뒤에 읽는다.
import { useCallback, useEffect, useState } from 'react';
import { cached, EMPTY, refresh } from '../lib/api';
import type { Data } from '../lib/types';

export function useData(): { data: Data | null; error: string | null; retry: () => void } {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const c = cached();
    if (c) setData(c);
    const onOk = (e: Event) => { setData((e as CustomEvent<Data>).detail); setError(null); };
    const onErr = (e: Event) => setError((e as CustomEvent<string>).detail);
    window.addEventListener('wfc:data', onOk);
    window.addEventListener('wfc:error', onErr);
    // 페이지 스크립트도 onData 로 refresh 를 부르지만 api.ts 가 동시 요청을 한 번으로 묶는다.
    refresh().catch(() => { if (!c) setData(EMPTY); });
    return () => { window.removeEventListener('wfc:data', onOk); window.removeEventListener('wfc:error', onErr); };
  }, []);
  const retry = useCallback(() => { refresh().catch(() => {}); }, []);
  return { data, error, retry };
}
