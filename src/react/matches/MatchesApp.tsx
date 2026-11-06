// src/react/matches/MatchesApp.tsx — 매치 목록. 계산은 lib/matches.ts(순수), 여기는 배선과 화면만.
//
// 카드 하나가 매치 하루. 팀은 팀짜기와 같은 칩 모양으로(같은 손버릇).
import { App, Button, InputNumber, Popconfirm } from 'antd';
import { useState } from 'react';
import { avatarFaceSvg } from '../../components/avatar';
import { avatarSpecFor } from '../../lib/avatar';
import { deleteMatch, setMatchScore } from '../../lib/api';
import { LINKS } from '../../lib/rules';
import { seoulToday } from '../../lib/html';
import { href } from '../../lib/url';
import * as M from '../../lib/matches';
import type { Match, Player } from '../../lib/types';
import TeamsShareModal from '../teams/TeamsShareModal';
import Loading from '../Loading';
import SubTabs from '../SubTabs';
import ThemeRoot from '../ThemeRoot';
import { useAdmin } from '../useAdmin';
import { useData } from '../useData';

function Face({ num, players, size = 24 }: { num: number; players: Player[]; size?: number }) {
  // num = 고유 번호(아바타 시드·찾기), 폴백 글자는 보이는 등번호(jersey).
  const p = players.find((x) => x.num === num);
  return <span className="tm-face" aria-hidden="true"
    dangerouslySetInnerHTML={{ __html: avatarFaceSvg(avatarSpecFor(num, p?.avatar), size, p?.jersey ?? num) }} />;
}

function Card({ m, players, today, admin, onTeamsImage }: { m: Match; players: Player[]; today: string; admin: boolean; onTeamsImage: (m: Match) => void }) {
  const { message } = App.useApp();
  const year = Number(today.slice(0, 4));

  // 상대팀 매치 스코어(2026-09-28) — 경기 뒤 관리자가 카드에서 넣는다.
  const ext = M.isExternal(m);
  const res = M.resultOf(m);
  const [scoring, setScoring] = useState(false);
  const [us, setUs] = useState<number | null>(m.scoreUs);
  const [them, setThem] = useState<number | null>(m.scoreThem);
  const [savingScore, setSavingScore] = useState(false);
  async function onSaveScore(): Promise<void> {
    if ((us == null) !== (them == null)) { message.info('두 팀 점수를 모두 넣어 주세요'); return; }
    setSavingScore(true);
    try { await setMatchScore(m.id, us, them); setScoring(false); message.success('스코어 저장됨'); }
    catch (e) { message.error((e as Error).message); }
    finally { setSavingScore(false); }
  }
  // 지우기 확인은 다른 관리자 삭제(선수·벌금)와 같은 Popconfirm 으로(2026-09-28 일관성 정리).
  const [deleting, setDeleting] = useState(false);
  async function onDelete(): Promise<void> {
    setDeleting(true);
    try { await deleteMatch(m.id); message.success('지웠습니다'); } catch (e) { message.error((e as Error).message); } finally { setDeleting(false); }
  }

  return (
    <section className="card mt-card" aria-label={`${M.matchLabel(m.date, year)} 매치`}>
      <div className="card-head">
        <h2>{M.matchLabel(m.date, year)}{ext && <span className="mt-vs"> vs {m.opponent}</span>}</h2>
        <div className="card-head-act">
          {/* 경기 영상(2026-09-28) — 링크는 /weekly-fc 스킬이 유튜브 게시 직후 자동으로 건다. 손으로 넣는 칸은 두지 않는다
              (2026-09-25 "일일이 넣기 번거롭다"로 걷었던 입력 UI). */}
          {M.isVideoUrl(m.video) && <Button size="small" href={m.video} target="_blank" rel="noopener">▶ 영상</Button>}
          {!ext && <Button size="small" onClick={() => onTeamsImage(m)}>이미지 저장</Button>}
          {admin && ext && <Button size="small" onClick={() => setScoring((x) => !x)}>{res ? '스코어 고치기' : '스코어 입력'}</Button>}
          {admin && <Button size="small" onClick={() => { location.href = href(`/matches/new/?edit=${m.id}`); }}>{ext ? '명단 수정' : '팀 수정'}</Button>}
          {admin && (
            <Popconfirm title="이 매치를 지울까요?" description="팀 구성이 사라집니다." okText="삭제" cancelText="취소" okButtonProps={{ danger: true, loading: deleting }} onConfirm={onDelete}>
              <Button size="small" danger loading={deleting}>삭제</Button>
            </Popconfirm>
          )}
        </div>
      </div>

      {ext && (
        <div className="mt-score">
          {res ? (
            <><b className="mt-score-num">{m.scoreUs} : {m.scoreThem}</b>
              <span className={`mt-result is-${res.toLowerCase()}`}>{M.RESULT_KO[res]}</span></>
          ) : <span className="muted">결과 입력 전</span>}
          {admin && scoring && (
            <span className="mt-score-edit">
              <span className="muted">우리</span><InputNumber size="small" min={0} max={99} value={us} onChange={(v) => setUs(v ?? null)} aria-label="우리 팀 점수" />
              <span className="muted">{m.opponent}</span><InputNumber size="small" min={0} max={99} value={them} onChange={(v) => setThem(v ?? null)} aria-label="상대팀 점수" />
              <Button size="small" type="primary" loading={savingScore} onClick={onSaveScore}>저장</Button>
            </span>
          )}
        </div>
      )}

      <div className="mt-teams">
        {m.lineup.map((t, i) => {
          const vest = M.vestOf(t.vest);
          return (
            <div key={`${t.vest}-${i}`} className="mt-team">
              <div className="mt-team-head">{ext ? <b>우리 팀</b> : <><span className="tm-dot" style={{ background: vest.color }} aria-hidden="true" /><b>{vest.label}</b></>}<span className="muted">{t.members.length}명</span></div>
              <div className="tm-chips">
                {t.members.map((x, j) => (
                  <span key={`${x.num ?? 'g'}-${j}`} className="tm-chip mt-chip">
                    {x.num != null && <Face num={x.num} players={players} />}
                    <b>{x.name}</b>
                    {x.num == null && <span className="tm-guest">용병</span>}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>

    </section>
  );
}

function Matches() {
  const { data } = useData();
  const admin = useAdmin();
  const [teamsShare, setTeamsShare] = useState<Match | null>(null);   // 팀 나누기 이미지(2026-09-25 "매치 목록 뷰에 나와야지")
  if (!data) return <Loading title="매치" tabs={<SubTabs path="/matches/" />} />;
  const matches = data.matches ?? [];
  const today = seoulToday();
  const rec = M.record(matches);
  return (
    <>
      <div className="page-head">
        <h1>매치</h1>
        <div className="actions">
          <Button href={LINKS.youtube} target="_blank" rel="noopener">▶ 유튜브 채널</Button>
          <Button type="primary" onClick={() => { location.href = href('/matches/new/'); }}>새 매치</Button>
        </div>
      </div>
      <SubTabs path="/matches/" />
      {matches.length === 0 && (
        <div className="card"><h2>아직 저장된 매치가 없습니다</h2><p className="muted">[새 매치]에서 자체전(조끼 팀 나누기)이나 상대팀전을 고르고, 관리자 모드로 날짜를 골라 저장하면 여기에 쌓입니다.</p></div>
      )}
      {rec.played > 0 && (
        <p className="mt-record">상대팀 전적 <b>{rec.w}</b>승 <b>{rec.d}</b>무 <b>{rec.l}</b>패 <span className="muted">· 득 {rec.gf} 실 {rec.ga}</span></p>
      )}
      <div className="stack">
        {matches.map((m) => <Card key={m.id} m={m} players={data.players} today={today} admin={admin} onTeamsImage={setTeamsShare} />)}
      </div>
      <TeamsShareModal open={!!teamsShare} onClose={() => setTeamsShare(null)} lineup={teamsShare?.lineup ?? []} players={data.players} date={teamsShare?.date ?? today} />
    </>
  );
}

export default function MatchesApp() {
  return <ThemeRoot><Matches /></ThemeRoot>;
}
