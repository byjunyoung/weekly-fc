// src/react/tier/TierApp.tsx — 티어 게임(2026-09-24). 위는 지금 숫자로 나눈 S~D 티어표, 대결을 시작하면
// "누가 더 ○○?" 두 선수 중 하나를 고르고, 고르는 즉시 서버가 두 숫자를 옮긴다(설계 §2·§3).
// 선수 페이지의 "티어 게임에서 바꾸기"는 ?num=N 으로 들어와 그 선수가 낀 대결부터(항목마다 한 판) 낸다.
import { App, Button, Segmented, Select } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { avatarFaceSvg, avatarSvg } from '../../components/avatar';
import { vote } from '../../lib/api';
import { avatarSpecFor } from '../../lib/avatar';
import { setMe } from '../../lib/me';
import { STAT_KO } from '../../lib/stats';
import { pairKey, pickPair, QUESTION, tierRows, type TierKey } from '../../lib/tier';
import { STAT_KEYS, type Player, type StatKey } from '../../lib/types';
import { href } from '../../lib/url';
import Loading from '../Loading';
import ThemeRoot from '../ThemeRoot';
import { useData } from '../useData';
import { useMe } from '../useMe';
import TierShareModal from './TierShareModal';

const KEYS: Array<{ value: TierKey; label: string }> = [
  { value: 'ovr', label: '종합' }, ...STAT_KEYS.map((k) => ({ value: k as TierKey, label: STAT_KO[k] })),
];

function Board({ players, tierKey }: { players: Player[]; tierKey: TierKey }) {
  return (
    <div className="tier-board">
      {tierRows(players, tierKey).map((row) => (
        <div className="tier-row" key={row.tier}>
          <b className={`tier-badge tier-${row.tier}`}>{row.tier}</b>
          <div className="tier-people">
            {row.players.length ? row.players.map((p) => (
              <a className="tier-p" key={p.num} href={href(`/squad/${p.num}/`)}>
                <span className="tier-face" aria-hidden="true"
                  dangerouslySetInnerHTML={{ __html: avatarFaceSvg(avatarSpecFor(p.num, p.avatar), 48, p.num, true) }} />
                <span className="tier-name">{p.name}</span>
              </a>
            )) : <span className="muted">—</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

type Pair = { a: Player; b: Player; field: StatKey };
type Flash = Record<number, number>; // 번호 → 변화량(+2 / −2)

function Duel({ players, me, focus, onExit }: { players: Player[]; me: number; focus: number | null; onExit: () => void }) {
  const { message } = App.useApp();
  const seen = useRef<Record<number, number>>({});
  const recent = useRef<string[]>([]);
  const queue = useRef<StatKey[]>([]);
  const focusLeft = useRef<StatKey[]>(focus != null ? [...STAT_KEYS] : []);
  const playersRef = useRef(players);
  playersRef.current = players;
  const [pair, setPair] = useState<Pair | null>(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [count, setCount] = useState(0);

  const nextField = (): { field: StatKey; withFocus: boolean } => {
    if (focusLeft.current.length) return { field: focusLeft.current.shift()!, withFocus: true };
    if (!queue.current.length) queue.current = [...STAT_KEYS].sort(() => Math.random() - 0.5);
    return { field: queue.current.shift()!, withFocus: false };
  };
  const next = (): void => {
    const { field, withFocus } = nextField();
    const p = pickPair(playersRef.current, { field, seen: seen.current, recent: recent.current, rand: Math.random, focus: withFocus ? focus : null });
    setFlash(null);
    setPair(p);
    if (!p) return;
    seen.current[p.a.num] = (seen.current[p.a.num] ?? 0) + 1;
    seen.current[p.b.num] = (seen.current[p.b.num] ?? 0) + 1;
    recent.current = [pairKey(p.a.num, p.b.num), ...recent.current].slice(0, 6);
  };
  useEffect(() => { next(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function pick(win: Player, lose: Player): Promise<void> {
    if (!pair || busy) return;
    setBusy(true);
    try {
      const r = await vote(pair.field, win.num, lose.num, me);
      setFlash({ [r.win.num]: r.win.after - r.win.before, [r.lose.num]: r.lose.after - r.lose.before });
      setCount((c) => c + 1);
      setTimeout(() => { next(); setBusy(false); }, 700);
    } catch (e) {
      message.error((e as Error).message);
      setBusy(false);
    }
  }

  if (!pair) {
    return (
      <div className="card duel">
        <p className="muted">대결할 선수가 부족합니다.</p>
        <Button onClick={onExit}>티어표로</Button>
      </div>
    );
  }
  const side = (p: Player, other: Player) => {
    const d = flash?.[p.num];
    return (
      <button type="button" className={`duel-pick${d != null ? (d > 0 ? ' is-up' : d < 0 ? ' is-down' : ' is-still') : ''}`}
        disabled={busy} onClick={() => pick(p, other)}>
        <span className="duel-sprite" aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: avatarSvg(avatarSpecFor(p.num, p.avatar), 160, p.num, true) }} />
        <b className="duel-name">{p.name}</b>
        <span className="duel-delta" aria-live="polite">{d == null ? '' : d > 0 ? `+${d}` : d < 0 ? `−${-d}` : '±0'}</span>
      </button>
    );
  };
  return (
    <div className="card duel">
      <div className="duel-head">
        <h2 className="duel-q">{QUESTION[pair.field]}</h2>
        <span className="muted">{count}판 · 누르면 바로 반영</span>
      </div>
      <div className="duel-arena">
        {side(pair.a, pair.b)}
        <span className="duel-vs" aria-hidden="true">VS</span>
        {side(pair.b, pair.a)}
      </div>
      <div className="duel-foot">
        <Button disabled={busy} onClick={next}>비슷함·모르겠음</Button>
        <Button onClick={onExit}>그만하기</Button>
      </div>
    </div>
  );
}

function Tier() {
  const { data } = useData();
  const me = useMe();
  const [tierKey, setTierKey] = useState<TierKey>('ovr');
  const [playing, setPlaying] = useState(false);
  const [focus, setFocus] = useState<number | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  // ?num=N 으로 들어오면 바로 대결로 — 선수 페이지에서 "바꾸러" 온 사람이다.
  useEffect(() => {
    const n = Number(new URLSearchParams(location.search).get('num'));
    if (Number.isInteger(n) && n > 0) { setFocus(n); setPlaying(true); }
  }, []);

  if (!data) return <Loading title="티어" />;
  const players = data.players;
  const focusName = focus != null ? players.find((p) => p.num === focus)?.name : undefined;

  return (
    <>
      <div className="page-head">
        <h1>티어</h1>
        <span className="actions">
          {!playing && <Button onClick={() => setShareOpen(true)}>이미지로 공유</Button>}
          {!playing && <Button type="primary" onClick={() => { setFocus(null); setPlaying(true); }}>대결 시작</Button>}
        </span>
      </div>
      <div className="stack">
        {playing && me == null && (
          <div className="card duel-me">
            <h2>누가 하는지 골라 주세요</h2>
            <p className="muted">대결 기록에 이 이름이 남습니다.</p>
            <Select showSearch={{ optionFilterProp: "label" }} className="duel-me-pick" placeholder="내 이름"
              options={[...players].sort((a, b) => a.name.localeCompare(b.name, 'ko')).map((p) => ({ value: p.num, label: p.name }))}
              onChange={(v: number) => setMe(v)} />
          </div>
        )}
        {playing && me != null && (
          <>
            {focusName && <p className="muted">{focusName} 선수가 낀 대결부터 나옵니다.</p>}
            <Duel players={players} me={me} focus={focus} onExit={() => { setPlaying(false); setFocus(null); }} />
          </>
        )}
        <div className="card">
          <div className="card-head tier-head">
            <h2>지금 티어</h2>
            <Segmented<TierKey> className="chips tier-keys" value={tierKey} onChange={setTierKey} options={KEYS} />
          </div>
          <p className="muted tier-help">둘 중 누가 더 나은지 고르면 그 자리에서 능력치가 바뀝니다. 칸은 숫자 구간 — S 85 이상 · A 78 · B 70 · C 63 · D 그 아래.</p>
          <Board players={players} tierKey={tierKey} />
        </div>
      </div>
      <TierShareModal open={shareOpen} onClose={() => setShareOpen(false)} players={players} tierKey={tierKey} />
    </>
  );
}

export default function TierApp() {
  return <ThemeRoot><Tier /></ThemeRoot>;
}
