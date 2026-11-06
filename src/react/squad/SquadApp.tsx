// src/react/squad/SquadApp.tsx — 선수 화면 오케스트레이터. 제목 아래 탭 셋: 티어 · 표 · 아바타.
// 티어는 따로 메뉴였다가 이 화면의 탭으로 들어왔고(2026-11-06 "명단이랑 티어도 하나로 합치자"), 가장 많이 쓰는
// 화면이라 가장 왼쪽·기본이다("티어가 기본뷰", "기본값이 가장 왼쪽 탭"). 주소는 티어 = /tier/, 표·아바타 = /squad/.
// **선발 찍기는 여기 없다** — 라인업(/lineup/)에서만 찍는다(2026-09-22 사용자 결정).
import { Button } from 'antd';
import { useState } from 'react';
import Loading from '../Loading';
import ThemeRoot from '../ThemeRoot';
import { useAdmin } from '../useAdmin';
import { useData } from '../useData';
import { loadView, saveView, type View } from './model';
import AddPlayerModal from './AddPlayerModal';
import RosterList from './RosterList';
import { TabRow } from '../SubTabs';
import { TierPanel } from '../tier/TierApp';
import { href } from '../../lib/url';
import { tierByNum } from '../../lib/card';

// 목록 보기는 라인업(/lineup/) 오른쪽 칸이 가져갔다 — 여기는 폭을 다 쓰는 표·카드만 남긴다.
const SQUAD_VIEWS: View[] = ['table', 'card'];

type Tab = 'tier' | View;
const TAB_LABEL: Record<Tab, string> = { tier: '티어', table: '표', card: '아바타', list: '목록' };
const TABS: Tab[] = ['tier', ...SQUAD_VIEWS];

function Squad({ initial }: { initial?: 'tier' }) {
  const { data } = useData();
  const admin = useAdmin();

  const [pos, setPos] = useState('ALL');
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<Tab>(() => (initial === 'tier' ? 'tier' : loadView(SQUAD_VIEWS)));
  const [adding, setAdding] = useState(false);

  // 탭을 바꾸면 주소도 따라간다 — 새로고침·링크 복사가 지금 보는 화면으로 가게. 표·아바타 중 무엇이었는지만 저장한다.
  function pick(t: Tab): void {
    setTab(t);
    if (t !== 'tier') saveView(t);
    try { history.replaceState(null, '', href(t === 'tier' ? '/tier/' : '/squad/')); } catch { /* 주소를 못 바꿔도 화면은 돈다 */ }
  }
  const tabs = <TabRow label="선수 탭" items={TABS.map((t) => ({ label: TAB_LABEL[t], to: t === 'tier' ? '/tier/' : '/squad/', active: t === tab, onPick: () => pick(t) }))} />;

  if (!data) return <Loading title="선수" tabs={tabs} />;

  const tiers = tierByNum(data.players);

  const rows = data.players.filter((p) => (pos === 'ALL' || p.pos === pos) && (!q || p.name.includes(q)));

  return (
    <>
      <div className="page-head">
        <h1>선수 <span className="muted" id="count">{data.players.length}명</span></h1>
        <div className="actions">{admin && <Button id="add" onClick={() => setAdding(true)}>선수 추가</Button>}</div>
      </div>
      {tabs}
      {tab === 'tier' ? <TierPanel /> : (
        <RosterList tiers={tiers} view={tab} onViewChange={pick} views={[tab]} pos={pos} onPosChange={setPos}
          q={q} onQChange={setQ} rows={rows} allPlayers={data.players} />
      )}
      {admin && <AddPlayerModal open={adding} onClose={() => setAdding(false)} players={data.players} />}
    </>
  );
}

export default function SquadApp({ initial }: { initial?: 'tier' }) {
  return <ThemeRoot><Squad initial={initial} /></ThemeRoot>;
}
