// src/react/teams/TeamsApp.tsx — 팀짜기(자체전). 온 사람을 고르고, 조끼 색 팀으로 갈라,
// 카톡에 붙여넣을 텍스트로 낸다. 계산은 전부 lib/teams.ts(순수), 여기는 배선과 화면만.
//
// 옮기기는 **눌러서 고르고 팀을 누르는** 방식이다(끌기 아님) — 폰에서 쓰는 기능이고,
// 피치에서 이미 "자리 누르고 선수 누르기"로 쓰고 있어 같은 손버릇이 된다.
import { App, Button, Input, Modal, Segmented } from 'antd';
import { useEffect, useState } from 'react';
import { avatarFaceSvg } from '../../components/avatar';
import { saveMatch } from '../../lib/api';
import { avatarSpecFor } from '../../lib/avatar';
import { seoulToday } from '../../lib/html';
import { fromMatch, matchLabel, snapshot } from '../../lib/matches';
import * as T from '../../lib/teams';
import { href } from '../../lib/url';
import Loading from '../Loading';
import ThemeRoot from '../ThemeRoot';
import { useAdmin } from '../useAdmin';
import { useData } from '../useData';

function Teams() {
  const { message } = App.useApp();
  const { data } = useData();
  const [st, setSt] = useState<T.TeamsState>(() => T.initialTeams());
  const [picked, setPicked] = useState<string | null>(null);   // 옮기려고 고른 사람
  const [guestName, setGuestName] = useState('');
  const [loaded, setLoaded] = useState(false);
  const admin = useAdmin();
  // 매치로 저장(2026-09-25). 날짜는 그날 하루가 매치 하나라 기본 오늘. 저장은 관리자만, 초안은 그대로 둔다.
  const [date, setDate] = useState(() => seoulToday());
  const [saving, setSaving] = useState(false);
  // 저장된 매치 고치기(2026-09-25): /matches/new/?edit=ID 로 들어오면 그 매치를 불러와 초안을 대체한다. 한 번만.
  // 빌드 때는 location 이 없다(정적 빌드 — 프론트매터·초기 렌더에서 쿼리를 읽지 말 것). 화면이 뜬 뒤에만 읽는다.
  const [editId, setEditId] = useState<number | null>(null);
  useEffect(() => { const n = Number(new URLSearchParams(location.search).get('edit')); if (Number.isInteger(n) && n > 0) setEditId(n); }, []);
  const [editing, setEditing] = useState<{ id: number; date: string } | null>(null);

  // 초안은 명단과 무관하게 한 번만 불러온다 — 예전엔 명단을 기다렸다 그걸로 걸렀는데,
  // 첫 값이 비었거나 낡으면 초안이 잘린 채 저장됐다(2026-09-22 리뷰). 안 온 사람을 거르는 건
  // 화면(membersOf)이 한다.
  useEffect(() => { setSt(T.load()); setLoaded(true); }, []);
  useEffect(() => {
    if (editId == null || editing || !data) return;
    const m = data.matches.find((x) => x.id === editId);
    if (!m) { message.error('그 매치를 찾지 못했습니다'); return; }
    setSt(fromMatch(m, data.players));
    setDate(m.date);
    setEditing({ id: m.id, date: m.date });
    setPicked(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId, data]);

  // 저장은 상태가 바뀐 뒤에 따로 한다 — commit 안에서 하면 연타 때 낡은 스냅샷이 저장된다.
  useEffect(() => { if (loaded) T.save(st); }, [st, loaded]);

  // 갱신은 항상 **직전 상태**에서 계산한다(렌더 시점의 st 를 클로저로 잡으면 연타가 날아간다).
  const commit = (fn: (prev: T.TeamsState) => T.TeamsState): void => { setSt(fn); };

  if (!data) return <Loading title="팀짜기" />;

  const players = data.players;
  const snap = snapshot(st, players);   // 저장 가능 여부(안 정한 사람 없음·팀 둘 이상)
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

  async function onSaveMatch(): Promise<void> {
    if (!snap.ok) { message.info(snap.error); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { message.info('날짜를 골라 주세요'); return; }
    const run = async () => {
      setSaving(true);
      try {
        await saveMatch(date, snap.lineup);
        message.success(`${matchLabel(date)} 매치에 저장했습니다`);
        location.href = href('/matches/');   // 매치 탭의 기능이니 저장하면 목록으로 돌아간다
      } catch (e) { message.error((e as Error).message); }
      finally { setSaving(false); }
    };
    if (editing && editing.date === date) { await run(); return; }   // 고치던 매치 그대로 — 덮어쓰기가 목적이다
    // 같은 날짜가 이미 있으면 덮어쓴다 — 표는 남으니 알려만 주고 진행.
    if ((data?.matches ?? []).some((m) => m.date === date)) {
      Modal.confirm({ title: `${matchLabel(date)} 매치가 이미 있습니다`, content: '팀 구성을 이걸로 덮어씁니다. POTM 표는 그대로 남습니다.', okText: '덮어쓰기', cancelText: '취소', onOk: run });
    } else await run();
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
        <h1>{editing ? `${matchLabel(editing.date)} 팀 수정` : '팀짜기'} <span className="muted">{total}명</span></h1>
        <div className="actions">
          <Button onClick={() => { location.href = href('/matches/'); }}>매치 목록</Button>
        </div>
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
      {admin && (
        <div className="bd-controls tm-save" role="group" aria-label="매치로 저장">
          <label className="bd-field"><span className="label">날짜</span>
            <Input type="date" className="w-date" value={date} max="2099-12-31" onChange={(e) => setDate(e.target.value)} />
          </label>
          <Button onClick={onSaveMatch} loading={saving}>매치로 저장</Button>
          <span className="muted tm-save-hint">그날 팀 구성이 매치 탭에 남고, 뛴 사람들이 POTM 을 뽑습니다</span>
        </div>
      )}

      <p className="muted tm-hint" aria-live="polite">
        {picked ? '옮길 팀을 누르세요 · 다시 누르면 취소' : '이름을 누르고 팀을 누르면 옮겨집니다'}
        {editing && <> · 저장된 매치를 불러왔습니다. [매치로 저장]을 누르면 그 매치가 이걸로 바뀝니다(표는 남습니다)</>}
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
