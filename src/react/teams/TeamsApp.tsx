// src/react/teams/TeamsApp.tsx — 팀짜기(자체전). 온 사람을 고르고, 조끼 색 팀으로 갈라,
// 카톡에 붙여넣을 텍스트로 낸다. 계산은 전부 lib/teams.ts(순수), 여기는 배선과 화면만.
//
// 옮기기는 **눌러서 고르고 팀을 누르는** 방식이다(끌기 아님) — 폰에서 쓰는 기능이고,
// 피치에서 이미 "자리 누르고 선수 누르기"로 쓰고 있어 같은 손버릇이 된다.
import { App, Button, Input, Modal, Segmented } from 'antd';
import { useEffect, useState } from 'react';
import { avatarFaceSvg } from '../../components/avatar';
import { avatarSpecFor } from '../../lib/avatar';
import * as T from '../../lib/teams';
import Loading from '../Loading';
import ThemeRoot from '../ThemeRoot';
import { useData } from '../useData';

function Teams() {
  const { message } = App.useApp();
  const { data } = useData();
  const [st, setSt] = useState<T.TeamsState>(() => T.initialTeams());
  const [picked, setPicked] = useState<string | null>(null);   // 옮기려고 고른 사람
  const [guestName, setGuestName] = useState('');
  const [loaded, setLoaded] = useState(false);

  // 초안은 명단과 무관하게 한 번만 불러온다 — 예전엔 명단을 기다렸다 그걸로 걸렀는데,
  // 첫 값이 비었거나 낡으면 초안이 잘린 채 저장됐다(2026-09-22 리뷰). 안 온 사람을 거르는 건
  // 화면(membersOf)이 한다.
  useEffect(() => { setSt(T.load()); setLoaded(true); }, []);

  // 저장은 상태가 바뀐 뒤에 따로 한다 — commit 안에서 하면 연타 때 낡은 스냅샷이 저장된다.
  useEffect(() => { if (loaded) T.save(st); }, [st, loaded]);

  // 갱신은 항상 **직전 상태**에서 계산한다(렌더 시점의 st 를 클로저로 잡으면 연타가 날아간다).
  const commit = (fn: (prev: T.TeamsState) => T.TeamsState): void => { setSt(fn); };

  if (!data) return <Loading title="팀짜기" />;

  const players = data.players;
  const views = T.teamViews(st, players);
  const rest = T.unassigned(st, players);
  const total = T.membersOf(st, players).length;

  function onAddGuest(): void {
    const name = guestName.trim();
    if (!name) return;
    commit((prev) => T.addGuest(prev, `${Date.now().toString(36)}`, name));
    setGuestName('');
  }
  function onMemberTap(key: string): void { setPicked(picked === key ? null : key); }
  function onTeamTap(team: number | null): void {
    if (picked == null) return;
    commit((prev) => T.moveTo(prev, picked, team));
    setPicked(null);
  }
  /** 복사가 막히는 자리가 있다(비-HTTPS 로 연 폰, 권한 거부) — 그때 **글을 띄워 준다**.
   *  예전엔 "아래 글을 길게 눌러 복사하라"고만 하고 그 글이 화면에 없어 막다른 길이었다. */
  function showText(text: string): void {
    Modal.info({
      title: '팀 나누기', width: 480, okText: '닫기',
      content: <textarea className="tm-text" readOnly rows={Math.min(14, text.split('\n').length + 1)} value={text} />,
    });
  }
  async function onCopy(): Promise<void> {
    const text = T.shareText(st, players);
    if (!text) { message.info('먼저 팀을 나눠 주세요'); return; }
    try { await navigator.clipboard.writeText(text); message.success('복사했습니다 — 카톡에 붙여넣으세요'); }
    catch { showText(text); }
  }

  const chip = (m: T.Member) => (
    <button type="button" key={m.key} className={`tm-chip${picked === m.key ? ' is-picked' : ''}`}
      aria-pressed={picked === m.key} onClick={() => onMemberTap(m.key)}>
      {m.num != null && <span className="tm-face" aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: avatarFaceSvg(avatarSpecFor(m.num, players.find((p) => p.num === m.num)?.avatar), 24, m.num) }} />}
      <b>{m.name}</b>
      {m.ovr != null ? <span className="tm-ovr">{m.ovr}</span> : <span className="tm-guest">용병</span>}
    </button>
  );

  return (
    <>
      <div className="page-head">
        <h1>팀짜기 <span className="muted">{total}명</span></h1>
        <div className="actions"><Button type="primary" onClick={onCopy}>텍스트 복사</Button></div>
      </div>

      <div className="bd-controls" role="group" aria-label="팀 나누기 설정">
        <div className="bd-field"><span className="label">팀</span>
          <Segmented value={st.teams} onChange={(v) => { setPicked(null); commit((prev) => T.setTeams(prev, Number(v))); }}
            options={Array.from({ length: T.MAX_TEAMS - T.MIN_TEAMS + 1 }, (_, i) => T.MIN_TEAMS + i)} />
        </div>
        <Button onClick={() => { setPicked(null); commit((prev) => T.autoBalance(prev, players)); }}>자동 배치</Button>
        <label className="bd-field"><span className="label">용병</span>
          <Input className="w-search" placeholder="이름 (예: 오준 용병+2)" value={guestName} maxLength={20}
            onChange={(e) => setGuestName(e.target.value)} onPressEnter={onAddGuest} />
        </label>
        <Button onClick={onAddGuest}>추가</Button>
      </div>

      <p className="muted tm-hint" aria-live="polite">
        {picked ? '옮길 팀을 누르세요 · 다시 누르면 취소' : '이름을 누르고 팀을 누르면 옮겨집니다'}
      </p>
      {/* 인원이 적거나 팀이 많으면 어떤 배치로도 평균이 안 맞는다(5명 4팀은 최적해도 17 차이) —
          "배치됐으니 됐다"고 믿지 않게 알려 준다. */}
      {T.avgSpread(st, players) > T.SPREAD_WARN && (
        <p className="tm-warn" role="status">팀 평균이 {T.avgSpread(st, players)} 벌어져 있습니다 — 인원이 적거나 팀이 많으면 더 못 맞춥니다</p>
      )}

      <div className="tm-board">
        {views.map((t, i) => (
          <section key={t.vest.key} className="tm-team">
            <button type="button" className="tm-head" style={{ borderColor: t.vest.color }}
              aria-label={picked ? `${t.vest.label}팀으로 옮기기` : `${t.vest.label}팀 ${t.members.length}명`}
              aria-disabled={picked == null} onClick={() => onTeamTap(i)}>
              <span className="tm-dot" style={{ background: t.vest.color }} aria-hidden="true" />
              <b>{t.vest.label}</b>
              <span className="muted">{t.members.length}명{t.avg != null ? ` · 평균 ${t.avg}` : ''}</span>
            </button>
            <div className="tm-chips">{t.members.map(chip)}</div>
          </section>
        ))}
      </div>

      <section className="tm-team tm-rest">
        <button type="button" className="tm-head" aria-label={picked ? '팀에서 빼기' : '아직 안 정한 사람'}
          aria-disabled={picked == null} onClick={() => onTeamTap(null)}>
          <b>아직 안 정함</b><span className="muted">{rest.length}명</span>
        </button>
        <div className="tm-chips">{rest.map(chip)}</div>
      </section>

      <div className="card tm-roster">
        <h2>온 사람 고르기</h2>
        <div className="tm-pool">
          {players.map((p) => {
            const on = st.picked.includes(p.num);
            return (
              <button type="button" key={p.num} className={`tm-chip${on ? ' is-on' : ''}`} aria-pressed={on}
                onClick={() => { setPicked(null); commit((prev) => T.togglePicked(prev, p.num)); }}>
                <span className="tm-face" aria-hidden="true"
                  dangerouslySetInnerHTML={{ __html: avatarFaceSvg(avatarSpecFor(p.num, p.avatar), 24, p.num) }} />
                <b>{p.name}</b>
              </button>
            );
          })}
        </div>
        {st.guests.length > 0 && (
          <>
            <h2 className="tm-sub">용병</h2>
            <div className="tm-pool">
              {st.guests.map((g) => (
                <button type="button" key={g.id} className="tm-chip tm-chip-remove"
                  aria-label={`용병 ${g.name} 빼기`}
                  onClick={() => { setPicked(null); commit((prev) => T.removeGuest(prev, g.id)); }}>
                  <b>{g.name}</b><span aria-hidden="true">✕</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}

export default function TeamsApp() {
  return <ThemeRoot><Teams /></ThemeRoot>;
}
