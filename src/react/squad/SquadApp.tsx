// src/react/squad/SquadApp.tsx — 명단 화면 오케스트레이터. 표·카드 2뷰 + 포지션 필터·검색,
// 「넣기/선발」로 이번 주 나올 사람을 찍는다. 라인업(자리 배치·피치·공유)은 /lineup/ 로 옮겼다 —
// 초안은 useLineup 이 localStorage 로 공유하므로 여기서 찍은 선발이 그쪽에도 그대로 보인다.
import { App } from 'antd';
import { useState } from 'react';
import * as L from '../../lib/lineup';
import { href } from '../../lib/url';
import Loading from '../Loading';
import ThemeRoot from '../ThemeRoot';
import { useAdmin } from '../useAdmin';
import { useData } from '../useData';
import { loadView, nextFreeNum, saveView, type View } from './model';
import RosterList from './RosterList';
import { useLineup } from './useLineup';

// 목록 보기는 라인업(/lineup/) 오른쪽 칸이 가져갔다 — 여기는 폭을 다 쓰는 표·카드만 남긴다.
const SQUAD_VIEWS: View[] = ['table', 'card'];

function Squad() {
  const { message } = App.useApp();
  const { data } = useData();
  const admin = useAdmin();
  const { st, commit } = useLineup(data?.players);

  const [pos, setPos] = useState('ALL');
  const [q, setQ] = useState('');
  const [view, setView] = useState<View>(() => loadView(SQUAD_VIEWS));

  if (!data) return <Loading title="명단" />;

  const rows = data.players.filter((p) => (pos === 'ALL' || p.pos === pos) && (!q || p.name.includes(q)));

  function onPick(num: number): void {
    const r = L.tapPlayer(st, num, null);
    if (r.result === 'full') { message.info('자리가 다 찼습니다 · 자리를 먼저 고르세요'); return; }
    commit(r.state);
  }
  function onViewChange(v: View): void { setView(v); saveView(v); }
  function onAdd(): void { location.href = href(`/squad/${nextFreeNum(data.players)}/?new=1`); }

  return (
    <>
      <div className="page-head">
        <h1>명단 <span className="muted" id="count">{data.players.length}명</span></h1>
        <div className="actions">{admin && <button type="button" id="add" onClick={onAdd}>선수 추가</button>}</div>
      </div>
      <RosterList view={view} onViewChange={onViewChange} views={SQUAD_VIEWS} pos={pos} onPosChange={setPos}
        q={q} onQChange={setQ} rows={rows} st={st} onPick={onPick} />
    </>
  );
}

export default function SquadApp() {
  return <ThemeRoot><Squad /></ThemeRoot>;
}
