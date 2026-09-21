// src/react/squad/LineupApp.tsx — 라인업 화면 오케스트레이터. 명단은 화면에 같이 두지 않고
// 벤치 줄 + Drawer 로 고른다(모바일이 쓰던 방식을 모든 폭에서 쓴다 — 명단이 표 뷰일 때 380px
// 칸에 갇히던 문제의 해법이자, 라인업 초안이 localStorage 에 있어 페이지를 나눠도 유지되는 전제).
import { App, Button, Drawer, Segmented, Select } from 'antd';
import { useEffect, useState } from 'react';
import * as L from '../../lib/lineup';
import { MAX_COUNT, MIN_COUNT, SHAPES, type PitchKind } from '../../lib/formation';
import ThemeRoot from '../ThemeRoot';
import { useData } from '../useData';
import BenchStrip from './BenchStrip';
import { loadView, saveView, type View } from './model';
import Pitch from './Pitch';
import RosterList from './RosterList';
import ShareModal from './ShareModal';
import { useLineup } from './useLineup';

function Lineup() {
  const { message } = App.useApp();
  const { data } = useData();
  const { st, commit } = useLineup(data?.players);

  const [selected, setSelected] = useState<number | null>(null);
  const [pos, setPos] = useState('ALL');
  const [q, setQ] = useState('');
  const [view, setView] = useState<View>(() => loadView());
  const [sheetOpen, setSheetOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

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
  function onViewChange(v: View): void { setView(v); saveView(v); }

  const hint = selected !== null ? `${L.slotsOf(st)[selected].label} 자리 — 명단에서 선수를 누르거나, 다른 자리를 누르면 맞바꿉니다`
    : '자리를 누르고 선수를 고르세요 · 카드를 끌면 옮기거나 맞바꿉니다';

  const rosterList = (
    <RosterList view={view} onViewChange={onViewChange} pos={pos} onPosChange={setPos} q={q} onQChange={setQ}
      rows={rows} st={st} onPick={onPick} />
  );

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
        <Drawer placement="bottom" open={sheetOpen} onClose={() => setSheetOpen(false)} closable={false} height="70dvh"
          styles={{ body: { padding: '0 var(--s-md) var(--s-md)', overflowY: 'auto' } }} classNames={{ body: 'bd-list' }}>
          <button type="button" className="bd-sheet-handle" onClick={() => setSheetOpen(false)}>
            <span>명단 {data.players.length}명 · 선발 {filled}/{st.count}</span>
          </button>
          {rosterList}
        </Drawer>
        <section className="bd-stage" aria-label="피치">
          <Pitch st={st} players={data.players} selected={selected}
            onTapSlot={onTapSlot} onSwap={onSwap} onMoveSlot={(idx, pt) => commit(L.moveSlot(st, idx, pt))}
            onDeselect={() => setSelected(null)} />
          <div className="bd-share-row"><Button type="primary" onClick={() => setShareOpen(true)}>이미지 공유</Button></div>
          <p className="muted bd-hint">{hint}</p>
        </section>
      </div>
      <BenchStrip st={st} players={data.players} selected={selected} onPick={onPick} onOpenSheet={() => setSheetOpen(true)} />
      <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} st={st} players={data.players}
        onSetTitle={(t) => commit(L.setTitle(st, t))} />
    </>
  );
}

export default function LineupApp() {
  return <ThemeRoot><Lineup /></ThemeRoot>;
}
