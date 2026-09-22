// src/react/squad/LineupApp.tsx — 라인업 화면 오케스트레이터. 피치와 명단을 좌우로 나란히 둔다
// (왼쪽 포메이션, 오른쪽 명단 목록) — 자리를 누르고 바로 옆에서 선수를 고른다. 좁은 폭에서는
// 아래로 쌓인다. 라인업 초안은 localStorage 에 있어 /squad/ 에서 찍은 선발도 그대로 보인다.
import { App, Button, Segmented, Select } from 'antd';
import { useEffect, useState, useSyncExternalStore } from 'react';
import * as L from '../../lib/lineup';
import { MAX_COUNT, MIN_COUNT, SHAPES, type PitchKind } from '../../lib/formation';
import ThemeRoot from '../ThemeRoot';
import { useData } from '../useData';
import type { View } from './model';
import Pitch from './Pitch';
import RosterList from './RosterList';
import ShareModal from './ShareModal';
import { useLineup } from './useLineup';

// 좁은 칸이라 목록 하나로 고정한다 — /squad/ 에 저장된 보기(표·카드)를 따라가지 않는다.
const LINEUP_VIEWS: View[] = ['list'];

// 피치를 가로로 눕히는 건 **넓은 화면에서만**이다. 세로 피치는 폭에 비례해 길어져 한 화면에
// 안 들어오고(832px 폭이면 1285px), 가로로 눕히면 539px 로 들어온다. 반대로 좁은 화면에서는 가로
// 피치의 높이가 모자라 카드가 겹친다 — 900px 에서는 293px 뿐이라 일곱 쌍이 겹쳤다(실측).
// 1100px 부터 켠다: 피치 652×422 이고, 가로에서 세로 간격을 정하는 건 **세로 규격의 가로 간격**
// (최소 0.20)이라 0.20×422 = 84px > 카드 73px 로 여유가 남는다(2026-09-22 사용자 요청).
const LAND_QUERY = '(min-width: 1100px)';
const subscribeLand = (cb: () => void) => {
  const m = window.matchMedia(LAND_QUERY);
  m.addEventListener('change', cb);
  return () => m.removeEventListener('change', cb);
};

function Lineup() {
  const { message } = App.useApp();
  const { data } = useData();
  const { st, commit } = useLineup(data?.players);

  const [selected, setSelected] = useState<number | null>(null);
  const [pos, setPos] = useState('ALL');
  const [q, setQ] = useState('');
  const [shareOpen, setShareOpen] = useState(false);
  const land = useSyncExternalStore(subscribeLand, () => window.matchMedia(LAND_QUERY).matches, () => false);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape' && selected !== null) setSelected(null); };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [selected]);

  if (!data) return <div className="page-head"><h1>라인업</h1><div className="actions" /></div>;

  const rows = data.players.filter((p) => (pos === 'ALL' || p.pos === pos) && (!q || p.name.includes(q)));
  const filled = st.slots.filter((x) => x != null).length;

  function onPick(num: number): void {
    const r = L.tapPlayer(st, num, selected);
    if (r.result === 'full') { message.info('자리가 다 찼습니다 · 자리를 먼저 고르세요'); return; }
    setSelected(null);
    commit(r.state);
  }
  function onTapSlot(idx: number): void {
    if (selected === null) { setSelected(idx); return; }
    if (selected === idx) { setSelected(null); return; }
    const a = selected;
    setSelected(null);
    commit(L.swap(st, a, idx));
  }
  function onSwap(a: number, b: number): void { setSelected(null); commit(L.swap(st, a, b)); }

  const hint = selected !== null ? `${L.slotsOf(st)[selected].label} 자리 — 명단에서 선수를 누르거나, 다른 자리를 누르면 맞바꿉니다`
    : '자리를 누르고 선수를 고르세요 · 카드를 끌면 옮기거나 맞바꿉니다';

  return (
    <>
      <div className="page-head">
        <h1>라인업 <span className="muted">선발 {filled}/{st.count}</span></h1>
      </div>
      <div className="bd-controls" role="group" aria-label="라인업 설정">
        <div className="bd-field"><span className="label">인원</span>
          <Segmented value={st.count} onChange={(v) => { setSelected(null); commit(L.setCount(st, Number(v))); }}
            options={Array.from({ length: MAX_COUNT - MIN_COUNT + 1 }, (_, i) => MIN_COUNT + i)} />
        </div>
        <label className="bd-field"><span className="label">포메이션</span>
          <Select value={st.shape} style={{ width: 120 }} onChange={(v) => { setSelected(null); commit(L.setShape(st, v)); }}
            options={SHAPES[st.count].map((k) => ({ value: k, label: k }))} />
        </label>
        <Segmented className="chips" value={st.pitch} onChange={(v) => commit(L.setPitch(st, v as PitchKind))}
          options={[{ label: '풋살', value: 'futsal' }, { label: '축구', value: 'soccer' }]} />
        <Button onClick={() => { setSelected(null); commit(L.autoFill(st, data.players)); }}>자동 배치</Button>
      </div>
      <div className="bd">
        <section className="bd-stage" aria-label="피치">
          <Pitch st={st} players={data.players} selected={selected} land={land}
            onTapSlot={onTapSlot} onSwap={onSwap} onMoveSlot={(idx, pt) => commit(L.moveSlot(st, idx, pt))}
            onDeselect={() => setSelected(null)} />
          <div className="bd-share-row"><Button type="primary" onClick={() => setShareOpen(true)}>이미지 공유</Button></div>
          <p className="muted bd-hint">{hint}</p>
        </section>
        <aside className="bd-list" aria-labelledby="bd-list-title">
          <h2 className="bd-list-title" id="bd-list-title">명단 {data.players.length}명 · 선발 {filled}/{st.count}</h2>
          <RosterList view="list" onViewChange={() => {}} views={LINEUP_VIEWS} pos={pos} onPosChange={setPos}
            q={q} onQChange={setQ} rows={rows} st={st} onPick={onPick} />
        </aside>
      </div>
      <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} st={st} players={data.players}
        onSetTitle={(t) => commit(L.setTitle(st, t))} />
    </>
  );
}

export default function LineupApp() {
  return <ThemeRoot><Lineup /></ThemeRoot>;
}
