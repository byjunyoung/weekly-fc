// src/react/matches/MatchesApp.tsx — 매치 목록과 POTM 투표. 계산은 lib/matches.ts(순수), 여기는 배선과 화면만.
//
// 카드 하나가 매치 하루. 팀은 팀짜기와 같은 칩 모양으로(같은 손버릇), POTM 은 맨 위에 아바타로.
// 투표는 그날 뛴 로그인 회원만 — 못 누르는 이유는 lib 가 정한 한 줄을 그대로 보여 준다.
import { App, Button, Input, Modal } from 'antd';
import { useState } from 'react';
import { avatarFaceSvg } from '../../components/avatar';
import { avatarSpecFor } from '../../lib/avatar';
import { deleteMatch, setMatchVideo, votePotm } from '../../lib/api';
import { seoulToday } from '../../lib/html';
import { href } from '../../lib/url';
import * as M from '../../lib/matches';
import type { Match, Player } from '../../lib/types';
import { tierByNum } from '../../lib/card';
import CardShareModal from '../CardShareModal';
import Loading from '../Loading';
import ThemeRoot from '../ThemeRoot';
import { useAdmin } from '../useAdmin';
import { useData } from '../useData';
import { useMeInfo } from '../useMe';

function Face({ num, players, size = 24 }: { num: number; players: Player[]; size?: number }) {
  return <span className="tm-face" aria-hidden="true"
    dangerouslySetInnerHTML={{ __html: avatarFaceSvg(avatarSpecFor(num, players.find((p) => p.num === num)?.avatar), size, num) }} />;
}

function Card({ m, players, today, admin, onPotmImage }: { m: Match; players: Player[]; today: string; admin: boolean; onPotmImage: (m: Match, num: number) => void }) {
  const { message } = App.useApp();
  const me = useMeInfo();
  const [busy, setBusy] = useState(false);
  const potm = M.potmOf(m);
  const nameOf = (num: number): string => M.attendees(m).find((x) => x.num === num)?.name ?? players.find((p) => p.num === num)?.name ?? `${num}번`;
  const block = M.voteBlock(m, { login: me.login, num: me.num ?? null }, today);
  const mine = me.potm?.[String(m.id)] ?? null;
  const year = Number(today.slice(0, 4));

  async function onVote(num: number): Promise<void> {
    if (busy || num === mine) return;
    setBusy(true);
    try { await votePotm(m.id, num); message.success(`${nameOf(num)} 에게 한 표`); }
    catch (e) { message.error((e as Error).message); }
    finally { setBusy(false); }
  }
  /** 유튜브 링크 붙이기·고치기(관리자). 영상은 보통 팀을 짠 뒤에 올라오니 카드에서 따로 붙인다. */
  function onVideo(): void {
    let v = m.video;
    Modal.confirm({
      title: `${M.matchLabel(m.date, year)} 매치 영상 링크`, icon: null, okText: '저장', cancelText: '취소',
      content: <Input type="url" defaultValue={m.video} placeholder="https://youtu.be/…  (비우면 지움)" maxLength={500} onChange={(e) => { v = e.target.value; }} />,
      onOk: async () => {
        const t = v.trim();
        if (t && !M.isVideoUrl(t)) { message.info('링크는 http(s)로 시작해야 합니다'); throw new Error('invalid'); }
        try { await setMatchVideo(m.id, t); message.success(t ? '영상 링크를 붙였습니다' : '영상 링크를 지웠습니다'); }
        catch (e) { message.error((e as Error).message); throw e; }
      },
    });
  }
  function onDelete(): void {
    Modal.confirm({
      title: `${M.matchLabel(m.date, year)} 매치를 지울까요?`, content: '팀 구성과 POTM 표가 함께 사라집니다.',
      okText: '지우기', okButtonProps: { danger: true }, cancelText: '취소',
      onOk: async () => { try { await deleteMatch(m.id); message.success('지웠습니다'); } catch (e) { message.error((e as Error).message); } },
    });
  }

  return (
    <section className="card mt-card" aria-label={`${M.matchLabel(m.date, year)} 매치`}>
      <div className="card-head">
        <h2>{M.matchLabel(m.date, year)}</h2>
        <div className="card-head-act">
          {m.video && <Button size="small" href={m.video} target="_blank" rel="noopener">▶ 영상 보기</Button>}
          {admin && <Button size="small" onClick={() => { location.href = href(`/matches/new/?edit=${m.id}`); }}>팀 수정</Button>}
          {admin && <Button size="small" onClick={onVideo}>{m.video ? '영상 링크 고치기' : '영상 링크'}</Button>}
          {admin && <Button size="small" danger onClick={onDelete}>삭제</Button>}
        </div>
      </div>

      <div className="mt-potm" aria-live="polite">
        <span className="mt-potm-label">POTM</span>
        {potm.nums.length === 0
          ? <span className="muted">아직 없음</span>
          : potm.nums.map((n) => (
            <span key={n} className="mt-potm-who"><Face num={n} players={players} size={28} /><b>{nameOf(n)}</b></span>
          ))}
        {potm.votes > 0 && <span className="muted">{potm.votes}표{potm.nums.length > 1 ? ' · 공동' : ''}</span>}
        {potm.nums.map((n) => (
          <Button key={n} size="small" onClick={() => onPotmImage(m, n)}>
            {potm.nums.length > 1 ? `${nameOf(n)} POTM 이미지` : 'POTM 이미지'}
          </Button>
        ))}
      </div>

      <div className="mt-teams">
        {m.lineup.map((t, i) => {
          const vest = M.vestOf(t.vest);
          return (
            <div key={`${t.vest}-${i}`} className="mt-team">
              <div className="mt-team-head"><span className="tm-dot" style={{ background: vest.color }} aria-hidden="true" /><b>{vest.label}</b><span className="muted">{t.members.length}명</span></div>
              <div className="tm-chips">
                {t.members.map((x, j) => (
                  <span key={`${x.num ?? 'g'}-${j}`} className="tm-chip mt-chip">
                    {x.num != null && <Face num={x.num} players={players} />}
                    <b>{x.name}</b>
                    {x.num == null && <span className="tm-guest">용병</span>}
                    {x.num != null && (m.tally[x.num] ?? 0) > 0 && <span className="tm-ovr">{m.tally[x.num]}표</span>}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-vote">
        {block
          ? <p className="muted mt-vote-hint">{block}{block.startsWith('로그인') && <> · <button type="button" className="linklike" onClick={() => window.dispatchEvent(new Event('wfc:open-me'))}>로그인</button></>}</p>
          : (
            <>
              <p className="mt-vote-hint"><b>POTM 뽑기</b> <span className="muted">— {M.matchLabel(M.deadline(m), year)}까지 · 다시 누르면 표를 옮깁니다</span></p>
              <div className="tm-chips mt-ballot" role="group" aria-label="POTM 후보">
                {M.attendees(m).filter((x) => x.num !== me.num).map((x) => (
                  <button type="button" key={x.num!} className={`tm-chip${mine === x.num ? ' is-on' : ''}`}
                    aria-pressed={mine === x.num} disabled={busy} onClick={() => onVote(x.num!)}>
                    <Face num={x.num!} players={players} /><b>{x.name}</b>
                  </button>
                ))}
              </div>
            </>
          )}
        <p className="muted mt-vote-count">{M.attendees(m).length}명 중 {m.voters}명 투표</p>
      </div>
    </section>
  );
}

function Matches() {
  const { data } = useData();
  const admin = useAdmin();
  const [share, setShare] = useState<{ m: Match; num: number } | null>(null);   // 훅은 이른 return 앞에(순서 고정)
  if (!data) return <Loading title="매치" />;
  const matches = data.matches ?? [];
  const today = seoulToday();
  const tiers = tierByNum(data.players);
  const sharePlayer = share ? data.players.find((p) => p.num === share.num) ?? null : null;
  const shareVotes = share ? (share.m.tally[share.num] ?? 0) : 0;
  return (
    <>
      <div className="page-head">
        <h1>매치 <span className="muted">{matches.length}회</span></h1>
        <div className="actions"><Button type="primary" onClick={() => { location.href = href('/matches/new/'); }}>팀 짜기</Button></div>
      </div>
      {matches.length === 0 && (
        <div className="card"><h2>아직 저장된 매치가 없습니다</h2><p className="muted">[팀 짜기]에서 온 사람을 조끼 팀으로 가르고, 관리자 모드로 날짜를 골라 저장하면 여기에 쌓입니다.</p></div>
      )}
      <div className="stack">
        {matches.map((m) => <Card key={m.id} m={m} players={data.players} today={today} admin={admin} onPotmImage={(mm, n) => setShare({ m: mm, num: n })} />)}
      </div>
      <CardShareModal open={!!share} onClose={() => setShare(null)} player={sharePlayer} tier={share ? tiers.get(share.num) : null}
        title={share ? `${M.matchLabel(share.m.date, Number(today.slice(0, 4)))} POTM` : 'POTM'} fileTag={share ? `potm-${share.num}` : 'potm'}
        opts={share ? { title: 'POTM', sub: `${M.matchLabel(share.m.date, Number(today.slice(0, 4)))} 매치 · ${shareVotes}표`, potmDate: share.m.date } : undefined} />
    </>
  );
}

export default function MatchesApp() {
  return <ThemeRoot><Matches /></ThemeRoot>;
}
