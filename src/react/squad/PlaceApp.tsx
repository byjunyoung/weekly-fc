// src/react/squad/PlaceApp.tsx — 새 선수 배치 대결(2026-09-28, 스펙 2026-09-28-admin-roster-design.md §3.2).
// 모양은 티어 게임 대결(.duel)을 그대로 빌리고, 밑은 lib/placement.ts 의 이분 탐색이다. 기존 선수 숫자는 움직이지 않는다.
// 여섯 항목이 끝나야 [저장]으로 한 번에 쓴다 — 중간에 나가면 아무것도 안 바뀐다.
import { App, Button } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { avatarSvg } from '../../components/avatar';
import { placePlayer } from '../../lib/api';
import { avatarSpecFor } from '../../lib/avatar';
import { tierByNum } from '../../lib/card';
import { answer, expectedSteps, ladder, pickOpponent, startSearch, type Answer, type Rung, type Search } from '../../lib/placement';
import { band, ovr, STAT_CUTS, STAT_KO } from '../../lib/stats';
import { QUESTION } from '../../lib/tier';
import { STAT_KEYS, type Player, type StatKey } from '../../lib/types';
import { href } from '../../lib/url';
import Loading from '../Loading';
import ThemeRoot from '../ThemeRoot';
import { useAdmin } from '../useAdmin';
import { useData } from '../useData';

type Run = { rungs: Record<StatKey, Rung[]>; searches: Search[]; opp: Player | undefined };

function begin(players: Player[], p: Player): Run {
  const rungs = Object.fromEntries(STAT_KEYS.map((k) => [k, ladder(players, k, p.num)])) as Record<StatKey, Rung[]>;
  const first = startSearch(STAT_KEYS[0], rungs[STAT_KEYS[0]]);
  return advance({ rungs, searches: [first], opp: undefined }, p);
}
/** 끝난 항목은 넘기고 다음 상대를 고른다. */
function advance(r: Run, p: Player): Run {
  const searches = [...r.searches];
  while (searches[searches.length - 1].value != null && searches.length < STAT_KEYS.length) {
    const k = STAT_KEYS[searches.length];
    searches.push(startSearch(k, r.rungs[k]));
  }
  const s = searches[searches.length - 1];
  return { ...r, searches, opp: s.value == null ? pickOpponent(r.rungs[s.field], s, p.pos) : undefined };
}

function Place({ num }: { num: number }) {
  const { message } = App.useApp();
  const { data } = useData();
  const admin = useAdmin();
  const player = data?.players.find((p) => p.num === num);
  const [run, setRun] = useState<Run | null>(null);
  const [saving, setSaving] = useState(false);
  // 데이터가 오면 한 번 시작한다. 이후 데이터가 새로 와도(다른 사람 대결) 사다리는 시작 때 것으로 둔다.
  useEffect(() => { if (player && data && !run) setRun(begin(data.players, player)); }, [player, data, run]);

  const result = useMemo(() => {
    if (!run || run.searches.length < STAT_KEYS.length || run.searches.some((s) => s.value == null)) return null;
    return Object.fromEntries(run.searches.map((s) => [s.field, s.value as number])) as Record<StatKey, number>;
  }, [run]);

  if (!data) return <Loading title="능력치 배치" />;
  const back = href(player ? `/squad/${num}/` : '/squad/');
  const head = <div className="page-head"><h1>능력치 배치{player ? <span className="muted"> {player.name}</span> : null}</h1></div>;
  if (!admin) return <>{head}<div className="card"><p className="muted">관리자 모드에서만 할 수 있습니다.</p><Button href={back}>돌아가기</Button></div></>;
  if (!player) return <>{head}<div className="card"><p className="muted">{num}번 선수가 없습니다.</p><Button href={href('/squad/')}>명단으로</Button></div></>;
  if (!run) return <Loading title="능력치 배치" />;

  const onAnswer = (a: Answer) => {
    const i = run.searches.length - 1;
    const s = run.searches[i];
    if (!run.opp) return;
    const next = [...run.searches];
    next[i] = answer(run.rungs[s.field], s, a, run.opp);
    setRun(advance({ ...run, searches: next }, player));
  };
  const save = async () => {
    if (!result) return;
    setSaving(true);
    try { await placePlayer(num, result); message.success('능력치를 저장했습니다'); location.href = back; }
    catch (e) { message.error((e as Error).message); setSaving(false); }
  };

  if (result) {
    const placed = { ...player, ...result };
    const tier = tierByNum(data.players.map((p) => (p.num === num ? placed : p))).get(num);
    const had = ovr(player) > 0;
    return (
      <>
        {head}
        <div className="card place-result">
          <div className="card-head"><h2>배치 결과</h2><span className="muted">종합 {ovr(placed)}{tier ? ` · 예상 티어 ${tier}` : ''}</span></div>
          <div className="attr-list">
            {STAT_KEYS.map((k) => {
              const v = result[k], b = band(v, STAT_CUTS);
              return (
                <div className="attr-row" key={k}>
                  <span className="attr-key">{STAT_KO[k]}</span>
                  <b className={`val val-${b}`}>{v}</b>
                  <span className="muted place-was">{had && player[k] !== v ? `이전 ${player[k]}` : ''}</span>
                </div>
              );
            })}
          </div>
          <div className="duel-foot">
            <Button disabled={saving} onClick={() => setRun(begin(data.players, player))}>다시 하기</Button>
            <Button type="primary" loading={saving} onClick={save}>저장</Button>
          </div>
        </div>
      </>
    );
  }

  const s = run.searches[run.searches.length - 1];
  const opp = run.opp!;
  const fieldNo = run.searches.length;
  const side = (p: Player, tag: string, a: Answer) => (
    <button type="button" className="duel-pick" onClick={() => onAnswer(a)}>
      <span className="duel-sprite" aria-hidden="true" dangerouslySetInnerHTML={{ __html: avatarSvg(avatarSpecFor(p.num, p.avatar), 160, p.num, true) }} />
      <b className="duel-name">{p.name}</b>
      <span className="muted place-tag">{tag}</span>
    </button>
  );
  return (
    <>
      {head}
      <div className="stack">
        <div className="card duel">
          <div className="duel-head">
            <h2 className="duel-q">{QUESTION[s.field]}</h2>
            <span className="muted">{STAT_KO[s.field]} {s.asked + 1}/{expectedSteps(run.rungs[s.field])}판 · 항목 {fieldNo}/{STAT_KEYS.length}</span>
          </div>
          <div className="duel-arena">
            {side(player, '새 선수', 'win')}
            <span className="duel-vs" aria-hidden="true">VS</span>
            {side(opp, `${STAT_KO[s.field]} ${opp[s.field]}`, 'lose')}
          </div>
          <div className="duel-foot">
            <Button onClick={() => onAnswer('unsure')}>모르겠음</Button>
            <Button onClick={() => onAnswer('same')}>비슷함</Button>
          </div>
        </div>
        <p className="muted">더 나은 쪽을 누르세요. 기존 선수 숫자는 바뀌지 않고, 여섯 항목이 끝나면 한 번에 저장합니다. <a href={back}>그만하기</a></p>
      </div>
    </>
  );
}

function PlacePage() {
  // 쿼리는 화면이 뜬 뒤에만 읽는다 — 정적 빌드에서 렌더 중에 읽으면 섬이 죽는다(2026-09-25 팀 수정 때 겪음).
  const [num, setNum] = useState<number | null>(null);
  useEffect(() => { setNum(Number(new URLSearchParams(location.search).get('num')) || 0); }, []);
  if (num == null) return <Loading title="능력치 배치" />;
  return <Place num={num} />;
}

export default function PlaceApp() {
  return <ThemeRoot><PlacePage /></ThemeRoot>;
}
