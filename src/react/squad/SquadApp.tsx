// src/react/squad/SquadApp.tsx — 스쿼드 화면 오케스트레이터. 인원·포메이션·경기장 컨트롤을 antd 로,
// 모바일에선 명단을 Drawer(아래에서)로 보여준다(antd Drawer 는 기본 document.body 에 포탈된다 — 데스크톱은
// Drawer 를 안 쓰고 RosterList 를 그냥 인라인 섹션에 둔다, 같은 컴포넌트 재사용).
import { App, Button, Drawer, Segmented, Select } from 'antd';
import { useEffect, useState } from 'react';
import * as L from '../../lib/lineup';
import { MAX_COUNT, MIN_COUNT, SHAPES, type PitchKind } from '../../lib/formation';
import { href } from '../../lib/url';
import ThemeRoot from '../ThemeRoot';
import { useAdmin } from '../useAdmin';
import { useData } from '../useData';
import BenchStrip from './BenchStrip';
import { loadView, nextFreeNum, saveView, type View } from './model';
import Pitch from './Pitch';
import RosterList from './RosterList';
import ShareModal from './ShareModal';

/** 900px 아래에선 명단을 Drawer 로. 완전 정적 빌드라 브라우저에서만 잰다. */
function useIsMobile(breakpoint = 899): boolean {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const update = () => setMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [breakpoint]);
  return mobile;
}

function Squad() {
  const { message } = App.useApp();
  const { data } = useData();
  const admin = useAdmin();
  const isMobile = useIsMobile();

  const [st, setSt] = useState<L.LineupState>(L.initial());
  const [touched, setTouched] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [pos, setPos] = useState('ALL');
  const [q, setQ] = useState('');
  const [view, setView] = useState<View>(() => loadView());
  const [sheetOpen, setSheetOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  // 캐시 명단이 처음 온 뒤 초안을 복원한다. 그 뒤엔(touched) 새 데이터가 와도 다시 덮지 않는다 —
  // 사용자가 이미 바꾼 배치를 잃지 않기 위해서다(옛 코드와 같은 규칙).
  useEffect(() => {
    if (!touched && data && data.players.length > 0) setSt(L.restore(localStorage.getItem(L.DRAFT_KEY), data.players));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  function commit(next: L.LineupState): void {
    setSt(next);
    setTouched(true);
    if (data && data.players.length > 0) { try { localStorage.setItem(L.DRAFT_KEY, L.serialize(next)); } catch { /* 저장 못 해도 화면은 돈다 */ } }
  }

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape' && selected !== null) setSelected(null); };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [selected]);

  if (!data) return <div className="page-head"><h1>스쿼드</h1><div className="actions" /></div>;

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
  function onAdd(): void { location.href = href(`/squad/${nextFreeNum(data.players)}/?new=1`); }

  const hint = selected !== null ? `${L.slotsOf(st)[selected].label} 자리 — 명단에서 선수를 누르거나, 다른 자리를 누르면 맞바꿉니다`
    : '자리를 누르고 선수를 고르세요 · 카드를 끌면 옮기거나 맞바꿉니다';

  const rosterList = (
    <RosterList view={view} onViewChange={onViewChange} pos={pos} onPosChange={setPos} q={q} onQChange={setQ}
      rows={rows} st={st} onPick={onPick} />
  );

  return (
    <>
      <div className="page-head">
        <h1>스쿼드 <span className="muted" id="count">{data.players.length}명</span></h1>
        <div className="actions">{admin && <button type="button" id="add" onClick={onAdd}>선수 추가</button>}</div>
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
        {isMobile ? (
          <Drawer placement="bottom" open={sheetOpen} onClose={() => setSheetOpen(false)} closable={false} height="70dvh"
            styles={{ body: { padding: '0 var(--s-md) var(--s-md)', overflowY: 'auto' } }} classNames={{ body: 'bd-list' }}>
            <button type="button" className="bd-sheet-handle" onClick={() => setSheetOpen(false)}>
              <span>명단 {data.players.length}명 · 선발 {filled}/{st.count}</span>
            </button>
            {rosterList}
          </Drawer>
        ) : (
          <section className="bd-list" aria-label="명단">{rosterList}</section>
        )}
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

export default function SquadApp() {
  return <ThemeRoot><Squad /></ThemeRoot>;
}
