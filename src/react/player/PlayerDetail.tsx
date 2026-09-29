// 선수 상세 — 아바타·능력치(고친 기록)·편집·꾸미기.
// 벌금·봉사는 이 화면에 두지 않는다 — 요약은 2026-09-22, 내역은 2026-09-23 에 뺐다. 운영 탭에 같은 내용이 있고, 홈 라커룸에서 들어오는
// 이 화면은 "내 선수를 보고 꾸미는" 자리라 재정 정보가 끼어들 이유가 없다(사용자 지시).
import { App, Button, Form, Input, InputNumber, Modal, Popconfirm, Popover, Segmented, Select } from 'antd';
import { useEffect, useRef, useState } from 'react';
import NumberPicker from '../squad/NumberPicker';
import type { CSSProperties } from 'react';
import { adminMembers, adminRelease, fetchFull, serializePlayer, write, writeAvatar, type MemberRow } from '../../lib/api';
import { maskEmail } from '../../lib/auth';
import { href } from '../../lib/url';
import { band, ovr, STAT_CUTS, STAT_KO } from '../../lib/stats';
import { rivalPairs } from '../../lib/tier';
import { teamBests, titleCatalog, titleDetail, titleOf } from '../../lib/titles';
import { FOOT_OPTIONS, tierByNum } from '../../lib/card';
import { currentPotm, matchLabel } from '../../lib/matches';
import CardShareModal from '../CardShareModal';
import PlayerCard from '../PlayerCard';
import { avatarSpecFor, serializeAvatar } from '../../lib/avatar';
import AvatarEditor from './AvatarEditor';
import Guestbook from './Guestbook';
import StatHistory from './StatHistory';
import type { AvatarSpec } from '../../lib/avatar';
import { STAT_KEYS } from '../../lib/types';
import type { Player } from '../../lib/types';
import { countUp } from '../../lib/motion';
import ThemeRoot from '../ThemeRoot';
import { useAdmin } from '../useAdmin';
import { useMe } from '../useMe';
import { useData } from '../useData';
import { numClash, playerFormDefaults, playerFromForm } from './model';
import { POS_OPTIONS } from '../squad/model';
import type { PlayerFormValues } from './model';

function Detail({ num }: { num: number }) {
  const { message } = App.useApp();
  const { data } = useData();
  const admin = useAdmin();
  const me = useMe();
  // 꾸미기는 본인과 관리자만(2026-09-24 본인인증). 서버도 같은 걸 다시 확인한다.
  const canDress = admin || (me != null && me === num);
  // 관리자: 이 번호를 차지한 계정 — 잘못 차지됐으면 여기서 푼다.
  const [member, setMember] = useState<MemberRow | null | undefined>(undefined);
  const [releasing, setReleasing] = useState(false);
  useEffect(() => {
    if (!admin) { setMember(undefined); return; }
    adminMembers().then((rows) => setMember(rows.find((r) => r.num === num) ?? null)).catch(() => setMember(undefined));
  }, [admin, num]);
  const release = async () => {
    setReleasing(true);
    try { await adminRelease(num); setMember(null); message.success('연결을 풀었습니다'); }
    catch (e) { message.error((e as Error).message); }
    finally { setReleasing(false); }
  };
  const [form] = Form.useForm<PlayerFormValues>();
  const [editing, setEditing] = useState<{ prevAvatar: string; prevVest: number | null } | null>(null); // null 이면 모달 닫힘
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [opening, setOpening] = useState(false); // fetchFull 이 도는 동안(모달이 뜨기 전)
  const [deleting, setDeleting] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false); // 편집 모달의 능력치 직접 고치기 — 평소엔 접어 둔다(배치 대결이 정본)
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [avatarSpec, setAvatarSpec] = useState<AvatarSpec | null>(null);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const openAvatar = (p: Player) => { setAvatarSpec(avatarSpecFor(p.num, p.avatar)); setAvatarOpen(true); };
  const saveAvatar = async () => {
    if (!player || !avatarSpec) return;
    setAvatarSaving(true);
    try { await writeAvatar(player.num, serializeAvatar(avatarSpec)); setAvatarOpen(false); message.success('아바타 저장됨'); }
    catch (e) { message.error((e as Error).message); }
    finally { setAvatarSaving(false); }
  };
  const player = data?.players.find((p) => p.num === num);

  // 선수 추가는 명단의 추가 모달이 맡는다(2026-09-28) — 여기는 있는 선수 고치기만.
  const openEdit = async (p: Player) => {
    setOpening(true);
    let full = p;
    try { full = (await fetchFull()).players.find((x) => x.num === num) ?? p; }
    catch { message.error('전화번호를 못 불러와 편집을 열 수 없습니다. 다시 시도해주세요'); setOpening(false); return; }
    setOpening(false);
    form.setFieldsValue(playerFormDefaults(num, full));
    // 조끼는 폼에서 뺐다(2026-09-28, 쓰는 곳 없는 시트 시절 칸) — 값은 지우지 않고 그대로 옮긴다.
    setEditing({ prevAvatar: full.avatar ?? '', prevVest: full.vest });
    setStatsOpen(false);
    setOpen(true);
  };
  const save = async (v: PlayerFormValues) => {
    if (!editing) return;
    const p = playerFromForm({ ...v, vest: editing.prevVest }, editing.prevAvatar);
    if (!p.num || !p.name) { message.error('번호와 이름은 필수'); return; }
    const clash = numClash(data?.players ?? [], p.num, num);
    if (clash) { message.error(`${p.num}번은 이미 ${clash.name}의 번호입니다`); return; }
    setSaving(true);
    try {
      await write('writePlayer', serializePlayer(p));
      const numChanged = p.num !== num;
      if (numChanged && data?.players.some((x) => x.num === num)) {
        try { await write('deletePlayer', { num }); } catch (e) { message.error(`저장은 됐지만 이전 번호(${num}) 삭제 실패: ${(e as Error).message}`); }
      }
      setOpen(false);
      message.success('저장됨');
      if (numChanged) location.href = href(`/squad/${p.num}/`);
    } catch (e) {
      message.error((e as Error).message); // 모달·입력값은 그대로 둔다(스펙 §6)
    } finally {
      setSaving(false);
    }
  };
  const delPlayer = async () => {
    setDeleting(true);
    try { await write('deletePlayer', { num }); location.href = href('/squad/'); }
    catch (e) { message.error((e as Error).message); setDeleting(false); }
  };

  // 라이벌 — 종합이 이웃한 짝(src/lib/tier.ts rivalPairs). 대결로 숫자가 움직이면 바뀐다.
  const rival = player && data ? data.players.find((p) => p.num === rivalPairs(data.players).get(player.num)) : undefined;

  // OVR 카운트업 — [data-ovr] 를 훅으로 붙잡아 0→실제값으로 센다.
  const cardRef = useRef<HTMLDivElement>(null);
  const [shareOpen, setShareOpen] = useState(false);   // 카드 이미지 저장(2026-09-25)
  const potm = currentPotm(data?.matches ?? []);
  const myPotmDate = player && potm && potm.nums.includes(player.num) ? potm.date : null;
  useEffect(() => {
    if (!player || !cardRef.current) return;
    const ovrEl = cardRef.current.querySelector<HTMLElement>('[data-ovr]');
    if (ovrEl) { const target = Number(ovrEl.dataset.ovr); if (target > 0) countUp(ovrEl, target); }
  }, [player]);

  // 제목·편집 버튼 — Astro 쪽엔 자리가 없다(id 가 둘로 갈리지 않게 이 섬 하나가 다 그린다).
  // 데이터가 아직 없으면(SSR·빌드) admin·player 모두 falsy 라 제목만 "선수 #{num}", 버튼은 비어 있다 — 옛 화면의 초기 상태와 같다.
  const pageHead = (
    <div className="page-head">
      <h1 id="title">{player ? player.name : `선수 #${num}`}</h1>
      {/* 꾸미기는 본인(로그인해 차지한 번호)과 관리자만 — 홈 라커룸에서 "꾸미기"로 들어오는 자리라
          카드 속 작은 아바타를 눌러야만 열리던 것을 겉으로 꺼내 둔다. */}
      <span className="actions" id="actions">
        {player && !avatarOpen && <Button onClick={() => setShareOpen(true)}>이미지 저장</Button>}
        {player && canDress && !avatarOpen && <Button onClick={() => openAvatar(player)}>꾸미기</Button>}
        {admin && player && !avatarOpen && <Button onClick={() => openEdit(player)} loading={opening}>편집</Button>}
      </span>
    </div>
  );

  if (data && !player) {
    return (
      <>
        {pageHead}
        <div className="stack">
          <p className="muted">이 번호의 선수가 없습니다.{admin ? ' 명단에서 [선수 추가]로 넣을 수 있습니다.' : ''}</p>
        </div>
        {editModal()}
      </>
    );
  }

  const placed = !!player && ovr(player) > 0; // 능력치 0 = 배치 전(2026-09-28)
  const myTitle = player && data ? titleOf(player, data.players) : null;
  const myTitleWhy = player && data ? titleDetail(player, data.players) : null;
  const myBests = player && data ? teamBests(player, data.players) : [];
  const attrRows = player ? STAT_KEYS.map((k) => {
    const v = player[k], b = band(v, STAT_CUTS);
    return (
      <div className="attr-row" key={k}>
        <span className="attr-key">{STAT_KO[k]}</span>
        <b className={`val val-${b}`}>{v || '–'}</b>
        <i className="attr-bar"><b className={`val-${b}`} style={{ '--fill': `${Math.max(0, Math.min(100, v))}%` } as CSSProperties} /></i>
      </div>
    );
  }) : null;

  /** 능력치 카드 아래 칭호 칸(2026-09-29) — 이 선수 칭호·설명·받은 까닭, (?)에 칭호 전체 목록. */
  function titleBox() {
    const catalog = (
      <div className="title-catalog">
        <p className="muted">한 능력치가 팀 상위 약 5% 수준이고 그게 그 선수 안에서도 두드러질 때만 붙습니다. 능력치가 바뀌면 생기거나 사라집니다.</p>
        {titleCatalog().map((g) => (
          <section key={g.group}>
            <h4>{g.group}</h4>
            <ul>
              {g.items.map((it) => (
                <li key={it.title.name + it.need.join()}>
                  <b>{it.title.name}</b>
                  <span className="muted">{it.need.length === 6 ? '전 항목' : it.need.map((k) => STAT_KO[k]).join(' + ')} · {it.title.desc}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    );
    const help = (
      <Popover content={catalog} title="칭호 목록" trigger={['hover', 'click']} placement="bottomRight">
        <button type="button" className="title-help" aria-label="칭호 목록 보기">?</button>
      </Popover>
    );
    // 칭호가 있으면 금색 띠로 강조(2026-09-29 "강조해서 멋있게") — 큰 이름 왼쪽, 설명·까닭 오른쪽 가로로.
    if (myTitle && myTitleWhy) {
      return (
        <div className="title-box is-on">
          <div className="title-box-name"><span className="title-box-tag">칭호</span><b>{myTitle.name}</b></div>
          <div className="title-box-text">
            <span className="title-box-desc">{myTitle.desc}</span>
            <span className="title-box-why">{myTitleWhy.keys.length === 6 ? '전 항목 · 팀 상위권' : `${myTitleWhy.keys.map((k) => STAT_KO[k]).join(' + ')} · 팀 상위 5%`}</span>
          </div>
          {help}
        </div>
      );
    }
    return (
      <div className="title-box">
        <span className="label">칭호</span>
        <span className="muted title-box-empty">없음 · 한 능력치가 팀 상위 5% 수준이면 생깁니다</span>
        {help}
      </div>
    );
  }

  function editModal() {
    return (
      <Modal title="선수 편집" open={open} width={640} destroyOnHidden afterClose={() => setEditing(null)} onCancel={() => setOpen(false)}
        cancelButtonProps={{ disabled: saving }} maskClosable={!saving} closable={!saving} keyboard={!saving}
        classNames={{ footer: 'modal-foot-split' }}
        footer={[
          editing && (
            <Popconfirm key="del" title="이 선수를 명단에서 지울까요?" okText="삭제" cancelText="취소" okButtonProps={{ danger: true, loading: deleting }} onConfirm={delPlayer}>
              <Button danger loading={deleting} disabled={saving}>삭제</Button>
            </Popconfirm>
          ),
          <span key="spacer" style={{ flex: 1, display: 'inline-block' }} />,
          <Button key="cancel" disabled={saving} onClick={() => setOpen(false)}>취소</Button>,
          <Button key="save" type="primary" loading={saving} onClick={() => form.submit()}>저장</Button>,
        ]}>
        {editing && (
          <Form<PlayerFormValues> form={form} className="form" layout="vertical" clearOnDestroy onFinish={save}>
            <h3 className="form-sec full">기본</h3>
            <Form.Item name="name" label="이름" rules={[{ required: true, whitespace: true, message: '이름을 넣으세요' }]}><Input /></Form.Item>
            <Form.Item name="pos" label="포지션" className="full"><Segmented className="chips" options={POS_OPTIONS} /></Form.Item>
            <Form.Item name="detail" label="세부 포지션"><Input placeholder="예: WB, CM" /></Form.Item>
            <Form.Item name="foot" label="주발"><Select allowClear options={FOOT_OPTIONS.map((x) => ({ value: x, label: x }))} /></Form.Item>
            <Form.Item name="num" label="등번호" className="full" rules={[{ required: true, message: '번호를 고르세요' }]}><NumberPicker players={data?.players ?? []} own={num} /></Form.Item>
            <h3 className="form-sec full">운영</h3>
            <Form.Item name="rot" label="봉사 순번 (빈칸=제외)"><InputNumber min={1} style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="phone" label="전화 (공개 안 됨)"><Input type="tel" /></Form.Item>
            <Form.Item name="note" label="메모" className="full"><Input /></Form.Item>
            {member !== undefined && (
              <div className="full form-member">
                <span className="label">연결된 계정</span>
                {member ? <span>{maskEmail(member.email)}
                  <Popconfirm title="이 계정과 선수의 연결을 풀까요?" okText="풀기" cancelText="취소" onConfirm={release}>
                    <Button size="small" loading={releasing}>풀기</Button>
                  </Popconfirm></span> : <span className="muted">없음 — 본인이 로그인해 이름을 고르면 연결됩니다</span>}
              </div>
            )}
            <h3 className="form-sec full">
              능력치 <Button size="small" type="link" onClick={() => setStatsOpen((x) => !x)}>{statsOpen ? '접기' : '직접 고치기'}</Button>
            </h3>
            {!statsOpen && <p className="muted full form-note">평소엔 배치 대결·티어 게임으로 정합니다. 잘못 들어간 숫자를 바로잡을 때만 펼치세요.</p>}
            {/* 접어도 칸은 폼에 남아야 한다 — 빼 버리면 저장할 때 능력치가 빠진다. hidden 으로만 숨긴다. */}
            {STAT_KEYS.map((k) => (
              <Form.Item key={k} name={k} label={STAT_KO[k]} hidden={!statsOpen}><InputNumber min={0} max={99} style={{ width: '100%' }} /></Form.Item>
            ))}
          </Form>
        )}
      </Modal>
    );
  }

  /** 꾸미기 패널 — 모달이 아니라 오른쪽 칸(능력치 자리)에 펼친다("모달 말고 페이지 내로",
   *  2026-09-22). 왼쪽 아바타가 곧 미리보기라 모달 안에 두던 작은 미리보기는 뺐다. */
  /** 꾸미기 패널 — 오른쪽 칸(능력치 자리)에 펼친다. 부위 고르기·랜덤·되돌리기는 AvatarEditor 가,
   *  큰 미리보기는 왼쪽 아바타가 맡는다(avatarSpec 을 그대로 그린다). */
  function avatarPanel() {
    if (!player || !avatarSpec) return null;
    return (
      <AvatarEditor spec={avatarSpec} onChange={setAvatarSpec} saving={avatarSaving}
        onReset={() => setAvatarSpec(avatarSpecFor(player.num, player.avatar))}
        onSave={saveAvatar} onCancel={() => setAvatarOpen(false)} />
    );
  }

  return (
    <>
      {pageHead}
      {player && (
        <div className="stack">
          {/* FC 카드를 걷어내고 아바타를 크게 세운다(2026-09-22 사용자 결정). 카드가 겹쳐 보여
              주던 능력치 여섯 칸은 바로 오른쪽 칸이 막대까지 붙여 이미 하고 있었다. */}
          <div className={`player-hero${avatarOpen ? ' is-dressing' : ''}`}>
            <div className="phero" ref={cardRef}>
              {/* 피파식 카드(2026-09-25). 아바타 자리가 꾸미기 버튼 — 꾸미는 중엔 고르는 스펙을 그 자리에 미리 보여 준다. */}
              <PlayerCard player={avatarOpen && avatarSpec ? { ...player, avatar: serializeAvatar(avatarSpec) } : player}
                tier={tierByNum(data?.players ?? []).get(player.num)} size="lg" potmDate={myPotmDate} team={data?.players}
                avatar={(svg) => (
                  <button type="button" id="avatar-edit-btn" className="avatar-btn" title={canDress ? '아바타 편집' : undefined}
                    disabled={!canDress} onClick={() => openAvatar(player)} dangerouslySetInnerHTML={{ __html: svg }} />
                )} />
              {rival && (
                <p className="phero-rival"><span className="rival-tag">라이벌</span><a href={href(`/squad/${rival.num}/`)}>{rival.name}</a></p>
              )}
              {(player.detail || player.foot) && (
                <p className="phero-sub">{[player.detail, player.foot].filter(Boolean).join(' · ')}</p>
              )}
              {player.note && <p className="phero-sub">{player.note}</p>}
            </div>
            <div className="player-side">
              {avatarOpen ? avatarPanel() : (
              <div className="card">
                {/* 스텝퍼는 걷었다(2026-09-24) — 숫자는 티어 게임 대결로만 움직인다. 이 선수가 낀 대결부터 낸다. */}
                <div className="card-head"><h2>능력치</h2>
                  <span className="card-head-act">
                    {placed && <Button size="small" href={href(`/tier/?num=${player.num}`)}>티어 게임에서 바꾸기</Button>}
                    {admin && placed && <Button size="small" href={href(`/squad/place/?num=${player.num}`)}>재배치</Button>}
                  </span>
                </div>
                {placed ? <><div className="attr-list">{attrRows}</div>{titleBox()}</> : (
                  <div className="place-empty">
                    <p className="muted">아직 능력치 배치 전입니다. 배치가 끝나야 티어표·라이벌·대결에 나옵니다.</p>
                    {admin && <Button type="primary" href={href(`/squad/place/?num=${player.num}`)}>배치 대결 시작</Button>}
                  </div>
                )}
              </div>
              )}
            </div>
          </div>
          {/* 방명록(2026-09-25) — 카드 아래 한 줄씩. 꾸미는 중엔 숨긴다(옵션 목록이 길다). */}
          {/* 능력치 기록(2026-09-28) — 차트·게임 로그(팬/천적은 2026-09-29 뺌). 옛 「고친 기록」 여덟 줄 목록을 대신한다. */}
          {!avatarOpen && <StatHistory player={player} />}
          {!avatarOpen && data && <Guestbook player={player} players={data.players} />}
        </div>
      )}
      {editModal()}
      <CardShareModal open={shareOpen} onClose={() => setShareOpen(false)} player={player ?? null}
        tier={player ? tierByNum(data?.players ?? []).get(player.num) : null}
        title={player ? `${player.name} 카드` : '카드'} fileTag={`card-${num}`}
        opts={{ sub: myPotmDate ? `${matchLabel(myPotmDate)} 매치 POTM` : undefined, potmDate: myPotmDate,
          badge: myTitle?.name, bests: myBests }} />
    </>
  );
}

export default function PlayerDetail({ num }: { num: number }) {
  return <ThemeRoot><Detail num={num} /></ThemeRoot>;
}
