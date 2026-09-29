// src/react/squad/SquadApp.tsx — 명단 화면 오케스트레이터. 표·카드 2뷰 + 포지션 필터·검색.
// **선발 찍기는 여기 없다** — 라인업(/lineup/)에서만 찍는다(2026-09-22 사용자 결정).
// 한 기능을 두 화면에 두면 어느 쪽이 정본인지 흐려지고, 여기선 명단을 보러 올 뿐이다.
import { Button } from 'antd';
import { useState } from 'react';
import Loading from '../Loading';
import ThemeRoot from '../ThemeRoot';
import { useAdmin } from '../useAdmin';
import { useData } from '../useData';
import { loadView, saveView, type View } from './model';
import AddPlayerModal from './AddPlayerModal';
import RosterList from './RosterList';
import { tierByNum } from '../../lib/card';
import { currentPotm } from '../../lib/matches';

// 목록 보기는 라인업(/lineup/) 오른쪽 칸이 가져갔다 — 여기는 폭을 다 쓰는 표·카드만 남긴다.
const SQUAD_VIEWS: View[] = ['table', 'card'];

function Squad() {
  const { data } = useData();
  const admin = useAdmin();

  const [pos, setPos] = useState('ALL');
  const [q, setQ] = useState('');
  const [view, setView] = useState<View>(() => loadView(SQUAD_VIEWS));
  const [adding, setAdding] = useState(false);

  if (!data) return <Loading title="명단" />;

  const tiers = tierByNum(data.players);
  const potm = currentPotm(data.matches);

  const rows = data.players.filter((p) => (pos === 'ALL' || p.pos === pos) && (!q || p.name.includes(q)));

  function onViewChange(v: View): void { setView(v); saveView(v); }

  return (
    <>
      <div className="page-head">
        <h1>명단 <span className="muted" id="count">{data.players.length}명</span></h1>
        <div className="actions">{admin && <Button id="add" onClick={() => setAdding(true)}>선수 추가</Button>}</div>
      </div>
      <RosterList tiers={tiers} potm={potm} view={view} onViewChange={onViewChange} views={SQUAD_VIEWS} pos={pos} onPosChange={setPos}
        q={q} onQChange={setQ} rows={rows} allPlayers={data.players} />
      {admin && <AddPlayerModal open={adding} onClose={() => setAdding(false)} players={data.players} />}
    </>
  );
}

export default function SquadApp() {
  return <ThemeRoot><Squad /></ThemeRoot>;
}
