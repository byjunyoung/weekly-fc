// src/react/matches/PotmApp.tsx — 매치 하나의 POTM 투표 페이지(2026-09-26). /matches/potm/?m=ID
// 카톡에 링크 하나만 던지면 바로 뽑을 수 있게: 큰 제목, 후보 카드(얼굴 아바타 + 이름 + 득표 막대), 내 표 강조, 공유 버튼.
// 투표 규칙은 서버가 본다(당일만·뛴 사람만·본인 제외). 화면은 lib/matches 로 이유를 미리 보여 준다.
import { App, Button } from 'antd';
import { useEffect, useState } from 'react';
import { avatarFaceSvg } from '../../components/avatar';
import { votePotm } from '../../lib/api';
import { avatarSpecFor } from '../../lib/avatar';
import { seoulToday } from '../../lib/html';
import * as M from '../../lib/matches';
import type { Match, Player } from '../../lib/types';
import { href } from '../../lib/url';
import Loading from '../Loading';
import ThemeRoot from '../ThemeRoot';
import { useData } from '../useData';
import { useMeInfo } from '../useMe';

function Potm() {
  const { message } = App.useApp();
  const { data } = useData();
  const me = useMeInfo();
  const [id, setId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  // 정적 빌드엔 주소창이 없다 — 화면이 뜬 뒤에만 읽는다.
  useEffect(() => { const n = Number(new URLSearchParams(location.search).get('m')); setId(Number.isInteger(n) && n > 0 ? n : 0); }, []);
  if (!data || id === null) return <Loading title="POTM 투표" />;

  const today = seoulToday();
  const year = Number(today.slice(0, 4));
  // m 이 없으면 오늘 매치(있으면), 없으면 가장 최근 매치.
  const m: Match | undefined = id ? data.matches.find((x) => x.id === id)
    : data.matches.find((x) => x.date === today) ?? [...data.matches].sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  if (!m) {
    return (
      <div className="card"><h2>매치를 찾지 못했습니다</h2><p className="muted">링크가 오래됐거나 매치가 지워졌습니다.</p>
        <Button href={href('/matches/')}>매치 목록</Button></div>
    );
  }
  const players: Player[] = data.players;
  const cands = M.attendees(m);
  const potm = M.potmOf(m);
  const block = M.voteBlock(m, { login: me.login, num: me.num ?? null }, today);
  const mine = me.potm?.[String(m.id)] ?? null;
  const top = Math.max(1, ...cands.map((c) => m.tally[c.num!] ?? 0));
  const nameOf = (n: number) => cands.find((c) => c.num === n)?.name ?? players.find((p) => p.num === n)?.name ?? `${n}번`;

  async function onVote(num: number): Promise<void> {
    if (busy || num === mine) return;
    setBusy(true);
    try { await votePotm(m!.id, num); message.success(`${nameOf(num)} 에게 한 표`); }
    catch (e) { message.error((e as Error).message); }
    finally { setBusy(false); }
  }
  async function onShare(): Promise<void> {
    const url = `${location.origin}${href(`/matches/potm/?m=${m!.id}`)}`;
    const text = M.potmShareText(m!, year);
    try {
      if (typeof navigator.share === 'function') { await navigator.share({ title: 'WEEKLY FC POTM 투표', text, url }); return; }
    } catch (e) { if ((e as DOMException).name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(`${text}\n${url}`); message.success('투표 링크를 복사했습니다 — 카톡에 붙여넣으세요'); }
    catch { message.info(url); }
  }

  return (
    <>
      <section className="pv-hero">
        <span className="pv-kicker">PLAYER OF THE MATCH</span>
        <h1 className="pv-title">{M.matchLabel(m.date, year)} <span>POTM 투표</span></h1>
        <p className="pv-sub">{M.voteOpen(m, today) ? '오늘 자정까지 · 한 표 · 다시 누르면 옮겨집니다' : block ?? ''}</p>
        <div className="pv-acts">
          <Button type="primary" onClick={onShare}>투표 링크 공유</Button>
          <Button href={href('/matches/')}>매치 목록</Button>
        </div>
      </section>

      {block && (
        <p className="pv-block" role="status">{block}
          {(block.startsWith('로그인') || block.startsWith('먼저')) && <> · <button type="button" className="linklike" onClick={() => window.dispatchEvent(new Event('wfc:open-me'))}>{block.startsWith('먼저') ? '이름 고르기' : '로그인'}</button></>}
        </p>
      )}

      <div className="pv-grid" role="group" aria-label="POTM 후보">
        {cands.map((c) => {
          const n = c.num!, v = m.tally[n] ?? 0, isMe = me.num === n, isMine = mine === n, isTop = potm.nums.includes(n) && v > 0;
          const can = !block && !isMe;
          return (
            <button type="button" key={n} className={`pv-cand${isMine ? ' is-mine' : ''}${isTop ? ' is-top' : ''}${isMe ? ' is-self' : ''}`}
              disabled={!can || busy} aria-pressed={isMine} onClick={() => onVote(n)}>
              <span className="pv-face" aria-hidden="true" dangerouslySetInnerHTML={{ __html: avatarFaceSvg(avatarSpecFor(n, players.find((p) => p.num === n)?.avatar), 56, n) }} />
              <span className="pv-name">{c.name}{isMe && <i>나</i>}</span>
              <span className="pv-bar"><i style={{ width: `${Math.round((v / top) * 100)}%` }} /></span>
              <span className="pv-votes">{v ? `${v}표` : ''}{isTop && ' ★'}</span>
            </button>
          );
        })}
      </div>
      <p className="muted pv-foot">{cands.length}명 중 {m.voters}명 투표{potm.nums.length ? ` · 지금 1위 ${potm.nums.map(nameOf).join(' · ')}` : ''}</p>
    </>
  );
}

export default function PotmApp() {
  return <ThemeRoot><Potm /></ThemeRoot>;
}
