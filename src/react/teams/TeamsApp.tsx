// src/react/teams/TeamsApp.tsx — 자체전 팀 나누기. 온 사람을 고르고, 조끼 색 팀으로 갈라,
// 카톡에 붙여넣을 텍스트로 낸다. 계산은 전부 lib/teams.ts(순수), 여기는 배선과 화면만.
//
// 옮기기는 **눌러서 고르고 팀을 누르는** 방식이다(끌기 아님) — 폰에서 쓰는 기능이고,
// 피치에서 이미 "자리 누르고 선수 누르기"로 쓰고 있어 같은 손버릇이 된다.
import { App, Button, Input, Segmented } from 'antd';
import { useEffect, useState } from 'react';
import { avatarFaceSvg } from '../../components/avatar';
import { avatarSpecFor } from '../../lib/avatar';
import * as T from '../../lib/teams';
import ThemeRoot from '../ThemeRoot';
import { useData } from '../useData';

function Teams() {
  const { message } = App.useApp();
  const { data } = useData();
  const [st, setSt] = useState<T.TeamsState>(() => T.initialTeams());
  const [picked, setPicked] = useState<string | null>(null);   // 옮기려고 고른 사람
  const [guestName, setGuestName] = useState('');
  const [loaded, setLoaded] = useState(false);

  // 명단이 와야 저장된 초안을 제대로 걸러 복원할 수 있다(없는 번호를 버려야 하므로).
  useEffect(() => {
    if (!data || loaded) return;
    setSt(T.load(data.players));
    setLoaded(true);
  }, [data, loaded]);

  const commit = (next: T.TeamsState): void => { setSt(next); T.save(next); };

  if (!data) return <div className="page-head"><h1>자체전</h1><div className="actions" /></div>;

  const players = data.players;
  const views = T.teamViews(st, players);
  const rest = T.unassigned(st, players);
  const total = T.membersOf(st, players).length;

  function onAddGuest(): void {
    const name = guestName.trim();
    if (!name) return;
    commit(T.addGuest(st, `${Date.now().toString(36)}`, name));
    setGuestName('');
  }
  function onMemberTap(key: string): void { setPicked(picked === key ? null : key); }
  function onTeamTap(team: number | null): void {
    if (picked == null) return;
    commit(T.moveTo(st, picked, team));
    setPicked(null);
  }
  async function onCopy(): Promise<void> {
    const text = T.shareText(st, players);
    if (!text) { message.info('먼저 팀을 나눠 주세요'); return; }
    try { await navigator.clipboard.writeText(text); message.success('복사했습니다 — 카톡에 붙여넣으세요'); }
    catch { message.error('복사를 못 했습니다 — 아래 글을 길게 눌러 복사해 주세요'); }
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
        <h1>자체전 <span className="muted">{total}명</span></h1>
        <div className="actions"><Button type="primary" onClick={onCopy}>텍스트 복사</Button></div>
      </div>

      <div className="bd-controls" role="group" aria-label="팀 나누기 설정">
        <div className="bd-field"><span className="label">팀</span>
          <Segmented value={st.teams} onChange={(v) => { setPicked(null); commit(T.setTeams(st, Number(v))); }}
            options={Array.from({ length: T.MAX_TEAMS - T.MIN_TEAMS + 1 }, (_, i) => T.MIN_TEAMS + i)} />
        </div>
        <Button onClick={() => { setPicked(null); commit(T.autoBalance(st, players)); }}>자동 배치</Button>
        <label className="bd-field"><span className="label">용병</span>
          <Input className="w-search" placeholder="이름 (예: 오준 용병+2)" value={guestName} maxLength={20}
            onChange={(e) => setGuestName(e.target.value)} onPressEnter={onAddGuest} />
        </label>
        <Button onClick={onAddGuest}>추가</Button>
      </div>

      <p className="muted tm-hint">
        {picked ? '옮길 팀을 누르세요 · 다시 누르면 취소' : '이름을 누르고 팀을 누르면 옮겨집니다'}
      </p>

      <div className="tm-board">
        {views.map((t, i) => (
          <section key={t.vest.key} className="tm-team">
            <button type="button" className="tm-head" style={{ borderColor: t.vest.color }} onClick={() => onTeamTap(i)}>
              <span className="tm-dot" style={{ background: t.vest.color }} aria-hidden="true" />
              <b>{t.vest.label}</b>
              <span className="muted">{t.members.length}명{t.avg != null ? ` · 평균 ${t.avg}` : ''}</span>
            </button>
            <div className="tm-chips">{t.members.map(chip)}</div>
          </section>
        ))}
      </div>

      <section className="tm-team tm-rest">
        <button type="button" className="tm-head" onClick={() => onTeamTap(null)}>
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
                onClick={() => { setPicked(null); commit(T.togglePicked(st, p.num)); }}>
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
                <button type="button" key={g.id} className="tm-chip is-on"
                  onClick={() => { setPicked(null); commit(T.removeGuest(st, g.id)); }}>
                  <b>{g.name}</b><span className="tm-guest">빼기</span>
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
