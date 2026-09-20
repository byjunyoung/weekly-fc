// 선수 상세 — 카드(FC 아이템)·요약(벌금·봉사)·능력치·벌금 내역·편집. 아바타 에디터는 Task 3 이 이 파일에 더한다.
import { App, Button, Descriptions, Form, Input, InputNumber, Modal, Popconfirm, Select, Table } from 'antd';
import type { TableColumnsType } from 'antd';
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { fetchFull, serializePlayer, write, writeAvatar } from '../../lib/api';
import { fmtDate, fmtWon, monthLabel } from '../../lib/html';
import { href } from '../../lib/url';
import { nextDuty } from '../../lib/rotation';
import { band, STAT_CUTS } from '../../lib/stats';
import { playerCard, STAT_KO, STAT_LABEL } from '../../components/player-card';
import { avatarSvg } from '../../components/avatar';
import { PARTS, avatarSpecFor, serializeAvatar } from '../../lib/avatar';
import type { AvatarSpec } from '../../lib/avatar';
import { STAT_KEYS } from '../../lib/types';
import type { Fine, Player } from '../../lib/types';
import { countUp } from '../../lib/motion';
import ThemeRoot from '../ThemeRoot';
import { useAdmin } from '../useAdmin';
import { useData } from '../useData';
import { byAmount, byDate, byPaid, byType, numClash, playerFineSummary, playerFormDefaults, playerFromForm } from './model';
import type { PlayerFormValues } from './model';

function Detail({ num, isNew }: { num: number; isNew: boolean }) {
  const { message } = App.useApp();
  const { data } = useData();
  const admin = useAdmin();
  const [form] = Form.useForm<PlayerFormValues>();
  const [editing, setEditing] = useState<{ isNewPlayer: boolean; prevAvatar: string } | null>(null); // null 이면 모달 닫힘
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [opening, setOpening] = useState(false); // fetchFull 이 도는 동안(모달이 뜨기 전)
  const [deleting, setDeleting] = useState(false);
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
  const pickGroup = (key: 'face' | 'hair' | 'skin' | 'eyes', title: string) => (
    <div key={key}>
      <div className="label label-gap">{title}</div>
      <div className="pick-list">
        {PARTS[key].map((opt, i) => (
          <button type="button" key={opt.id} className={avatarSpec![key] === i ? 'primary' : ''} onClick={() => setAvatarSpec({ ...avatarSpec!, [key]: i })}>{opt.label}</button>
        ))}
      </div>
    </div>
  );

  const player = data?.players.find((p) => p.num === num);

  const openEdit = async (p: Player | undefined) => {
    setOpening(true);
    let full = p;
    if (p) {
      try { full = (await fetchFull()).players.find((x) => x.num === num) ?? p; }
      catch { message.error('전화번호를 못 불러와 편집을 열 수 없습니다. 다시 시도해주세요'); setOpening(false); return; }
    }
    setOpening(false);
    form.setFieldsValue(playerFormDefaults(num, full));
    setEditing({ isNewPlayer: !p, prevAvatar: full?.avatar ?? '' });
    setOpen(true);
  };
  const save = async (v: PlayerFormValues) => {
    if (!editing) return;
    const p = playerFromForm(v, editing.prevAvatar);
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

  // isNew=1 로 들어온 새 번호 페이지 — 관리자면 편집을 자동으로 연다(옛 페이지와 같은 동작:
  // 데이터가 새로 올 때마다(admin·data 가 바뀔 때마다) 다시 확인한다 — 그 선수가 여전히 없을 때만이라 실제로는 드물다).
  // 렌더 도중이 아니라 useEffect 안에서 불러야 한다 — openEdit 은 상태를 바꾸는 부수효과다.
  useEffect(() => {
    if (isNew && admin && data && !player && editing === null && !open && !opening) openEdit(undefined);
  }, [isNew, admin, data, player, opening]);

  // 벌금 요약 — 카운트업 이펙트(아래)가 참조해야 해서 이르게 return 하기 전에 계산해둔다.
  const fineSummary = player ? playerFineSummary(data?.fines ?? [], player.name) : null;

  // OVR 카운트업 — playerCard() 가 html 로 그린 [data-ovr] 를 훅으로 붙잡아 0→실제값으로 센다.
  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!player || !cardRef.current) return;
    const ovrEl = cardRef.current.querySelector<HTMLElement>('[data-ovr]');
    if (ovrEl) { const target = Number(ovrEl.dataset.ovr); if (target > 0) countUp(ovrEl, target); }
  }, [player]);

  // 미납 벌금 합계 카운트업.
  const fineBigRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!fineSummary || !fineBigRef.current) return;
    countUp(fineBigRef.current, fineSummary.unpaid, fmtWon);
  }, [fineSummary?.unpaid]);

  // 제목·편집 버튼 — Astro 쪽엔 자리가 없다(id 가 둘로 갈리지 않게 이 섬 하나가 다 그린다).
  // 데이터가 아직 없으면(SSR·빌드) admin·player 모두 falsy 라 제목만 "선수 #{num}", 버튼은 비어 있다 — 옛 화면의 초기 상태와 같다.
  const pageHead = (
    <div className="page-head">
      <h1 id="title">{player ? player.name : `선수 #${num}`}</h1>
      <span className="actions" id="actions">{admin && data && <Button onClick={() => openEdit(player)} loading={opening}>편집</Button>}</span>
    </div>
  );

  if (data && !player) {
    return (
      <>
        {pageHead}
        <div className="stack">
          <p className="muted">이 번호의 선수가 없습니다.{admin ? ' 편집으로 추가할 수 있습니다.' : ''}</p>
        </div>
        {editModal()}
      </>
    );
  }

  const duty = player && data ? nextDuty(data.players, data.rotation, player.name) : null;
  const attrRows = player ? STAT_KEYS.map((k) => {
    const v = player[k], b = band(v, STAT_CUTS);
    return (
      <div className="attr-row" key={k}>
        <span className="attr-key">{STAT_LABEL[k]}</span>
        <b className={`val val-${b}`}>{v || '–'}</b>
        <i className="attr-bar"><b className={`val-${b}`} style={{ '--fill': `${Math.max(0, Math.min(100, v))}%` } as CSSProperties} /></i>
      </div>
    );
  }) : null;

  const fineCols: TableColumnsType<Fine> = [
    { title: '날짜', dataIndex: 'date', sorter: byDate, defaultSortOrder: 'descend', render: (d: string) => fmtDate(d) },
    { title: '유형', dataIndex: 'type', sorter: byType },
    { title: '금액', dataIndex: 'amount', align: 'right', sorter: byAmount, render: (a: number) => fmtWon(a) },
    { title: '납부', dataIndex: 'paid', sorter: byPaid, render: (p: boolean) => (p ? '완료' : <span className="warn">미납</span>) },
  ];

  function editModal() {
    return (
      <Modal title="선수 편집" open={open} width={640} destroyOnHidden afterClose={() => setEditing(null)} onCancel={() => setOpen(false)}
        cancelButtonProps={{ disabled: saving }} maskClosable={!saving} closable={!saving} keyboard={!saving}
        classNames={{ footer: 'modal-foot-split' }}
        footer={[
          editing && !editing.isNewPlayer && (
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
            <Form.Item name="num" label="번호" rules={[{ required: true, message: '번호를 넣으세요' }]}><InputNumber min={1} max={99} style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="name" label="이름" rules={[{ required: true, message: '이름을 넣으세요' }]}><Input /></Form.Item>
            <Form.Item name="pos" label="포지션"><Select options={['', 'GK', 'DF', 'MF', 'FW'].map((x) => ({ value: x, label: x || '—' }))} /></Form.Item>
            <Form.Item name="detail" label="세부 포지션"><Input /></Form.Item>
            <Form.Item name="foot" label="주발"><Input /></Form.Item>
            <Form.Item name="vest" label="조끼"><InputNumber style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="rot" label="봉사 순번 (빈칸=제외)"><InputNumber style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="phone" label="전화 (공개 안 됨)"><Input type="tel" /></Form.Item>
            {STAT_KEYS.map((k) => (
              <Form.Item key={k} name={k} label={STAT_KO[k]} rules={[{ required: true, message: '1~99' }]}><InputNumber min={1} max={99} style={{ width: '100%' }} /></Form.Item>
            ))}
            <Form.Item name="note" label="메모" className="full"><Input /></Form.Item>
          </Form>
        )}
      </Modal>
    );
  }

  function avatarModal() {
    return (
      <Modal title="아바타 편집" open={avatarOpen} destroyOnHidden onCancel={() => setAvatarOpen(false)}
        cancelButtonProps={{ disabled: avatarSaving }} maskClosable={!avatarSaving} closable={!avatarSaving} keyboard={!avatarSaving}
        footer={[
          <Button key="cancel" disabled={avatarSaving} onClick={() => setAvatarOpen(false)}>취소</Button>,
          <Button key="save" type="primary" loading={avatarSaving} onClick={saveAvatar}>저장</Button>,
        ]}>
        {avatarSpec && (
          <>
            <div className="row" style={{ justifyContent: 'center', marginBottom: 'var(--s-md)' }} dangerouslySetInnerHTML={{ __html: avatarSvg(avatarSpec, 120) }} />
            <div className="stack">
              {pickGroup('face', '얼굴형')}
              {pickGroup('hair', '헤어')}
              {pickGroup('skin', '피부')}
              {pickGroup('eyes', '눈')}
              <div>
                <div className="label label-gap">유니폼 색</div>
                <div className="pick-list">
                  {PARTS.kit.map((hex) => (
                    <button type="button" key={hex} className={avatarSpec.kit === hex ? 'primary' : ''} style={{ background: hex }} aria-label={hex} onClick={() => setAvatarSpec({ ...avatarSpec, kit: hex })}>&nbsp;</button>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </Modal>
    );
  }

  return (
    <>
      {pageHead}
      {player && (
        <div className="stack">
          <div className="player-hero">
            <div
              ref={cardRef}
              dangerouslySetInnerHTML={{ __html: playerCard(player, `<button type="button" id="avatar-edit-btn" class="avatar-btn" title="아바타 편집">${avatarSvg(avatarSpecFor(player.num, player.avatar), 112, player.num, true)}</button>`) }}
              onClick={(e) => { if ((e.target as HTMLElement).closest('#avatar-edit-btn')) openAvatar(player); }}
            />
            <div className="player-side">
              <Descriptions bordered size="small" column={{ xs: 1, sm: 2 }}>
                <Descriptions.Item label="미납 벌금"><b ref={fineBigRef} className={fineSummary!.unpaid ? 'warn' : ''}>{fmtWon(fineSummary!.unpaid)}</b> <span className="muted">누계 {fmtWon(fineSummary!.total)} ({fineSummary!.fines.length}건)</span></Descriptions.Item>
                <Descriptions.Item label="봉사">{duty ? monthLabel(duty.year, duty.month) : '–'} <span className="muted">{player.rot ? `순번 ${player.rot} · 다음 차례` : '로테이션 제외'}</span></Descriptions.Item>
              </Descriptions>
              <div className="card"><h2>능력치</h2><div className="attr-list">{attrRows}</div></div>
            </div>
          </div>
          {fineSummary!.fines.length > 0 && (
            <div className="card"><h2>벌금 내역</h2>
              <Table<Fine> size="small" rowKey="id" pagination={false} showSorterTooltip={false} scroll={{ x: 'max-content' }} columns={fineCols} dataSource={fineSummary!.fines} />
            </div>
          )}
        </div>
      )}
      {editModal()}
      {avatarModal()}
    </>
  );
}

export default function PlayerDetail({ num }: { num: number }) {
  const isNew = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('new') === '1';
  return <ThemeRoot><Detail num={num} isNew={isNew} /></ThemeRoot>;
}
