// src/react/squad/SquadApp.tsx — 명단 화면 오케스트레이터. 표·카드 2뷰 + 포지션 필터·검색, 그리고 「티어」 보기.
// 티어는 따로 메뉴였다가 이 화면의 보기 전환으로 들어왔다(2026-11-06 "명단이랑 티어도 하나로 합치자" →
// "하단 탭으로 넣어야지"). /tier/ 주소는 이 화면을 티어 보기로 여는 문이고, 보기를 바꾸면 주소도 따라 바뀐다.
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
import RosterList, { RosterFilters, type ExtraView } from './RosterList';
import { TierPanel } from '../tier/TierApp';
import { href } from '../../lib/url';
import { tierByNum } from '../../lib/card';

// 목록 보기는 라인업(/lineup/) 오른쪽 칸이 가져갔다 — 여기는 폭을 다 쓰는 표·카드만 남긴다.
const SQUAD_VIEWS: View[] = ['table', 'card'];

const EXTRA: ExtraView[] = [{ label: '티어', value: 'tier' }];

function Squad({ initial }: { initial?: 'tier' }) {
  const { data } = useData();
  const admin = useAdmin();

  const [pos, setPos] = useState('ALL');
  const [q, setQ] = useState('');
  const [view, setView] = useState<View>(() => loadView(SQUAD_VIEWS));
  const [adding, setAdding] = useState(false);
  const [tier, setTier] = useState(initial === 'tier');

  if (!data) return <Loading title="선수" />;

  const tiers = tierByNum(data.players);

  const rows = data.players.filter((p) => (pos === 'ALL' || p.pos === pos) && (!q || p.name.includes(q)));

  // 주소를 보기에 맞춘다 — 새로고침·링크 복사가 지금 보는 화면으로 가게. 티어는 저장하지 않는다(명단을 열면 명단부터).
  const sync = (toTier: boolean) => { try { history.replaceState(null, '', href(toTier ? '/tier/' : '/squad/')); } catch { /* 주소를 못 바꿔도 화면은 돈다 */ } };
  function onViewChange(v: View): void { setView(v); saveView(v); if (tier) { setTier(false); sync(false); } }
  function onExtraView(): void { setTier(true); sync(true); }

  return (
    <>
      <div className="page-head">
        <h1>선수 <span className="muted" id="count">{data.players.length}명</span></h1>
        <div className="actions">{admin && <Button id="add" onClick={() => setAdding(true)}>선수 추가</Button>}</div>
      </div>
      {tier ? (
        <TierPanel head={<RosterFilters viewOnly viewFirst view={view} onViewChange={onViewChange} views={SQUAD_VIEWS} pos={pos} onPosChange={setPos}
          q={q} onQChange={setQ} extraViews={EXTRA} activeExtra="tier" onExtraView={onExtraView} />} />
      ) : (
        <RosterList tiers={tiers} view={view} onViewChange={onViewChange} views={SQUAD_VIEWS} pos={pos} onPosChange={setPos}
          q={q} onQChange={setQ} rows={rows} allPlayers={data.players} extraViews={EXTRA} onExtraView={onExtraView} viewFirst />
      )}
      {admin && <AddPlayerModal open={adding} onClose={() => setAdding(false)} players={data.players} />}
    </>
  );
}

export default function SquadApp({ initial }: { initial?: 'tier' }) {
  return <ThemeRoot><Squad initial={initial} /></ThemeRoot>;
}
