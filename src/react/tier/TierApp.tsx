// src/react/tier/TierApp.tsx — 티어 게임(2026-09-24). 위는 지금 숫자로 나눈 S~D 티어표, 대결을 시작하면
// "누가 더 ○○?" 두 선수 중 하나를 고르고, 고르는 즉시 서버가 두 숫자를 옮긴다(설계 §2·§3).
// 선수 페이지의 "티어 게임에서 바꾸기"는 ?num=N 으로 들어와 그 선수가 낀 대결부터(항목마다 한 판) 낸다.
import { App, Button, Segmented } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { avatarFaceSvg, avatarSvg } from '../../components/avatar';
import { vote } from '../../lib/api';
import { avatarSpecFor } from '../../lib/avatar';
import { STAT_KO } from '../../lib/stats';
import { pairKey, pickPair, QUESTION, rivalPairs, tierRows, type TierKey } from '../../lib/tier';
import { STAT_KEYS, type Player, type StatKey } from '../../lib/types';
import { href } from '../../lib/url';
import Loading from '../Loading';
import ThemeRoot from '../ThemeRoot';
import { useData } from '../useData';
import { useMeInfo } from '../useMe';
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
/** 서버와 같은 제한(본인인증 2026-09-24) — 하루 30판, 같은 선수는 하루 3번. 화면은 미리 걸러 내고 서버가 최종 판정한다. */
const DAILY = 30;
const PER_PLAYER = 3;
type Flash = Record<number, number>; // 번호 → 변화량(+2 / −2)

function Duel({ players, used, today, focus, onExit }: { players: Player[]; used: Record<string, number>; today: number; focus: number | null; onExit: () => void }) {
  const { message } = App.useApp();
  const seen = useRef<Record<number, number>>({});
  const recent = useRef<string[]>([]);
  const queue = useRef<StatKey[]>([]);
  const focusLeft = useRef<StatKey[]>(focus != null ? [...STAT_KEYS] : []);
  // 오늘 3번 찬 선수는 짝에서 뺀다 — 눌러 봐야 서버가 거절할 판을 내지 않는다.
  const open = players.filter((p) => (used[p.num] ?? 0) < PER_PLAYER);
  const playersRef = useRef(open);
  playersRef.current = open;
  const [pair, setPair] = useState<Pair | null>(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<Flash | null>(null);

  const nextField = (): { field: StatKey; withFocus: boolean } => {
    if (focusLeft.current.length) return { field: focusLeft.current.shift()!, withFocus: true };
    if (!queue.current.length) queue.current = [...STAT_KEYS].sort(() => Math.random() - 0.5);
    return { field: queue.current.shift()!, withFocus: false };
  };
  const next = (): void => {
    const { field, withFocus } = nextField();
    const p = pickPair(playersRef.current, { field, seen: seen.current, recent: recent.current, rand: Math.random, focus: withFocus ? focus : null, rivals: rivalPairs(playersRef.current) });
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
      const r = await vote(pair.field, win.num, lose.num);
      setFlash({ [r.win.num]: r.win.after - r.win.before, [r.lose.num]: r.lose.after - r.lose.before });
      setTimeout(() => { next(); setBusy(false); }, 700);
    } catch (e) {
      message.error((e as Error).message);
      setBusy(false);
    }
  }

  if (today >= DAILY) {
    return (
      <div className="card duel">
        <h2 className="duel-q">오늘 대결은 여기까지!</h2>
        <p className="muted">하루 {DAILY}판까지 할 수 있습니다. 내일 또 해 주세요.</p>
        <Button onClick={onExit}>티어표로</Button>
      </div>
    );
  }
  if (!pair) {
    return (
      <div className="card duel">
        <p className="muted">오늘 판정할 수 있는 선수가 부족합니다. 같은 선수는 하루 {PER_PLAYER}번까지입니다.</p>
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
        {rivalPairs(players).get(pair.a.num) === pair.b.num && <div className="duel-rival"><span className="rival-tag">라이벌전!</span></div>}
        <h2 className="duel-q">{QUESTION[pair.field]}</h2>
        <span className="muted">오늘 {today}/{DAILY}판 · 누르면 바로 반영</span>
      </div>
      <div className="duel-arena">
        {side(pair.a, pair.b)}
        <span className="duel-vs" aria-hidden="true">VS</span>
        {side(pair.b, pair.a)}
      </div>
      <div className="duel-foot">
        <Button disabled={busy} onClick={next}>모르겠음</Button>
        <Button onClick={onExit}>그만하기</Button>
      </div>
    </div>
  );
}

function Tier() {
  const { data } = useData();
  const me = useMeInfo();
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
        {playing && !me.num && (
          <div className="card duel-me">
            <h2>{me.login ? '먼저 내 이름을 골라 주세요' : '로그인이 필요합니다'}</h2>
            <p className="muted">대결은 로그인한 팀원만 할 수 있습니다. 누가 판정했는지 기록에 남고, 하루 {DAILY}판·같은 선수 {PER_PLAYER}번까지입니다.</p>
            <Button type="primary" onClick={() => window.dispatchEvent(new Event('wfc:open-me'))}>{me.login ? '이름 고르기' : '로그인'}</Button>
          </div>
        )}
        {playing && !!me.num && (
          <>
            {focusName && <p className="muted">{focusName} 선수가 낀 대결부터 나옵니다.</p>}
            <Duel players={players} used={me.todayBy ?? {}} today={me.today ?? 0} focus={focus} onExit={() => { setPlaying(false); setFocus(null); }} />
          </>
        )}
        <div className="card">
          <div className="card-head tier-head">
            <h2>지금 티어</h2>
            <Segmented<TierKey> className="chips tier-keys" value={tierKey} onChange={setTierKey} options={KEYS} />
          </div>
          <p className="muted tier-help">둘 중 누가 더 나은지 고르면 그 자리에서 능력치가 바뀝니다. 칸은 순위 — 위에서부터 S 10% · A 20% · B 40% · C 20% · D 10%, 같은 숫자는 같은 칸.</p>
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
