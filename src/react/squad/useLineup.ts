// src/react/squad/useLineup.ts — 라인업 초안 상태. 명단(SquadApp)·라인업(LineupApp) 양쪽에서 같은 규칙으로 쓴다.
// 캐시 명단이 처음 온 뒤 초안을 복원한다. 그 뒤엔(touched) 새 데이터가 와도 다시 덮지 않는다 —
// 사용자가 이미 바꾼 배치를 잃지 않기 위해서다(옛 코드와 같은 규칙).
import { useEffect, useState } from 'react';
import * as L from '../../lib/lineup';
import type { Player } from '../../lib/types';

export function useLineup(players: Player[] | undefined): { st: L.LineupState; commit: (next: L.LineupState) => void } {
  const [st, setSt] = useState<L.LineupState>(L.initial());
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!touched && players && players.length > 0) setSt(L.restore(localStorage.getItem(L.DRAFT_KEY), players));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players]);

  function commit(next: L.LineupState): void {
    setSt(next);
    setTouched(true);
    if (players && players.length > 0) { try { localStorage.setItem(L.DRAFT_KEY, L.serialize(next)); } catch { /* 저장 못 해도 화면은 돈다 */ } }
  }

  return { st, commit };
}
