// 선수 상세 — 아바타·능력치(고친 기록)·편집·꾸미기.
// 벌금·봉사는 이 화면에 두지 않는다 — 요약은 2026-09-22, 내역은 2026-09-23 에 뺐다. 운영 탭에 같은 내용이 있고, 홈 라커룸에서 들어오는
// 이 화면은 "내 선수를 보고 꾸미는" 자리라 재정 정보가 끼어들 이유가 없다(사용자 지시).
import { App, Button, Form, Input, InputNumber, Modal, Popconfirm, Select } from 'antd';
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { fetchFull, refresh, serializePlayer, write, writeAvatar, writeStats } from '../../lib/api';
import { fmtLogAt } from '../../lib/html';
import { href } from '../../lib/url';
import { band, ovr, STAT_CUTS, STAT_KO } from '../../lib/stats';
import { getMe } from '../../lib/me';
import { avatarSvg } from '../../components/avatar';
import { PARTS, avatarSpecFor, serializeAvatar } from '../../lib/avatar';
import type { AvatarSpec } from '../../lib/avatar';
import { STAT_KEYS } from '../../lib/types';
import type { Player, StatKey } from '../../lib/types';
import { countUp } from '../../lib/motion';
import ThemeRoot from '../ThemeRoot';
import { useAdmin } from '../useAdmin';
import { useData } from '../useData';
import { numClash, playerFormDefaults, playerFromForm } from './model';
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
  const [draft, setDraft] = useState<Partial<Record<StatKey, number>>>({});
  const [statBusy, setStatBusy] = useState(false);
  const draftRef = useRef<Partial<Record<StatKey, number>>>({});
  const statTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushRef = useRef<() => void>(() => {});
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
  const pickGroup = (key: 'face' | 'hair' | 'skin' | 'eyes' | 'jersey' | 'socks' | 'gloves' | 'tape', title: string) => (
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

  const STAT_SAVE_DELAY = 1500;
  const flushStats = async (): Promise<void> => {
    if (statTimer.current) { clearTimeout(statTimer.current); statTimer.current = null; }
    const d = draftRef.current;
    if (!player || Object.keys(d).length === 0) return;
    try {
      await writeStats(player.num, d, getMe());
      draftRef.current = {};
      setDraft({});
      // 값은 바로 갱신되는데 방금 덧붙인 기록 줄은 한 박자 늦게 읽힌다(시트 덧붙이기 직후의
      // 읽기가 못 따라온다). 기록이 이 기능의 되먹임이라 잠시 뒤 한 번 더 받아온다.
      setTimeout(() => { void refresh().catch(() => {}); }, 1200);
    } catch (e) { message.error((e as Error).message); }
    finally { setStatBusy(false); }
  };
  flushRef.current = () => { void flushStats(); };
  // 화면을 떠나거나 탭을 접을 때 남은 편집을 먼저 보낸다.
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') flushRef.current(); };
    document.addEventListener('visibilitychange', onHide);
    return () => { document.removeEventListener('visibilitychange', onHide); flushRef.current(); };
  }, []);

  // 이 선수 기록만, 최신 여덟 줄. 전체 목록은 두지 않았다 — 숫자가 이상하면 그 선수 자리에서 보면 된다.
  const myLog = player ? (data?.statLog ?? []).filter((r) => r.num === player.num).slice(0, 8) : [];

  // ── 능력치 스텝퍼 ──────────────────────────────────────────────
  // 누를 때마다 서버로 보내면 기록이 누른 횟수만큼 쌓인다(84→85, 85→86…). 손을 뗀 뒤
  // 잠깐 기다렸다 바뀐 칸만 한 번에 보내 84→87 한 줄로 남긴다. 기다리는 사이에 화면을
  // 떠나면 그 편집이 날아가므로, 언마운트와 탭 전환에서 남은 걸 먼저 흘려보낸다.
  const shownStat = (k: StatKey): number => draft[k] ?? (player ? player[k] : 0);
  const bump = (k: StatKey, by: number): void => {
    if (!player) return;
    const now = shownStat(k);
    const val = Math.max(1, Math.min(99, now + by));
    if (val === now) return;
    const next = { ...draft };
    if (val === player[k]) delete next[k];              // 되돌아왔으면 보낼 게 없다
    else next[k] = val;
    draftRef.current = next;
    setDraft(next);
    if (statTimer.current) clearTimeout(statTimer.current);
    if (Object.keys(next).length === 0) { setStatBusy(false); return; }
    setStatBusy(true);
    statTimer.current = setTimeout(() => { void flushRef.current(); }, STAT_SAVE_DELAY);
  };

  // OVR 카운트업 — [data-ovr] 를 훅으로 붙잡아 0→실제값으로 센다.
  const cardRef = useRef<HTMLDivElement>(null);
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
      {/* 꾸미기는 관리자 전용이 아니다(아바타 에디터엔 PIN 이 없다) — 홈 라커룸에서 "꾸미기"로
          들어오는 자리라, 카드 속 작은 아바타를 눌러야만 열리던 것을 겉으로 꺼내 둔다. */}
      <span className="actions" id="actions">
        {player && !avatarOpen && <Button onClick={() => openAvatar(player)}>꾸미기</Button>}
        {admin && data && <Button onClick={() => openEdit(player)} loading={opening}>편집</Button>}
      </span>
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

  const attrRows = player ? STAT_KEYS.map((k) => {
    const v = shownStat(k), b = band(v, STAT_CUTS);
    return (
      <div className="attr-row" key={k}>
        <span className="attr-key">{STAT_KO[k]}</span>
        <button type="button" className="attr-step" aria-label={`${STAT_KO[k]} 낮추기`} disabled={v <= 1} onClick={() => bump(k, -1)}>−</button>
        <b className={`val val-${b}${draft[k] != null ? ' is-draft' : ''}`}>{v || '–'}</b>
        <button type="button" className="attr-step" aria-label={`${STAT_KO[k]} 올리기`} disabled={v >= 99} onClick={() => bump(k, 1)}>+</button>
        <i className="attr-bar"><b className={`val-${b}`} style={{ '--fill': `${Math.max(0, Math.min(100, v))}%` } as CSSProperties} /></i>
      </div>
    );
  }) : null;

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

  /** 꾸미기 패널 — 모달이 아니라 오른쪽 칸(능력치 자리)에 펼친다("모달 말고 페이지 내로",
   *  2026-09-22). 왼쪽 아바타가 곧 미리보기라 모달 안에 두던 작은 미리보기는 뺐다. */
  function avatarPanel() {
    if (!player || !avatarSpec) return null;
    return (
      <div className="card">
        <div className="card-head">
          <h2>꾸미기</h2>
          <span className="card-head-act">
            <Button size="small" disabled={avatarSaving} onClick={() => setAvatarOpen(false)}>취소</Button>
            <Button size="small" type="primary" loading={avatarSaving} onClick={saveAvatar}>저장</Button>
          </span>
        </div>
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
          {/* 축구 테마 확장(2026-09-22) — 유니폼 무늬는 face·hair 처럼 도형 선택,
              양말·장갑·손목테이프는 색 목록이되 0번이 "없음/유니폼과 같음"인 텍스트 버튼이라
              kit 스와치(라벨 없는 색 칸)와 달리 pickGroup(라벨 버튼)을 그대로 쓴다. */}
          {pickGroup('jersey', '유니폼 무늬')}
          {pickGroup('socks', '양말')}
          {pickGroup('gloves', '장갑')}
          {pickGroup('tape', '손목테이프')}
        </div>
      </div>
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
              <button type="button" id="avatar-edit-btn" className="avatar-btn" title="아바타 편집"
                onClick={() => openAvatar(player)}
                dangerouslySetInnerHTML={{ __html: avatarSvg(avatarOpen && avatarSpec ? avatarSpec : avatarSpecFor(player.num, player.avatar), 224, player.num, true) }} />
              <b className="phero-ovr" data-ovr={ovr(player)}>{ovr(player) || '–'}</b>
              <div className="phero-meta">
                <span className={`pos pos-${player.pos.toLowerCase()}`}>{player.pos || '–'}</span>
                <span className="muted">#{player.num}{player.vest ? ` · 조끼 ${player.vest}` : ''}</span>
              </div>
              {(player.detail || player.foot) && (
                <p className="phero-sub">{[player.detail, player.foot].filter(Boolean).join(' · ')}</p>
              )}
              {player.note && <p className="phero-sub">{player.note}</p>}
            </div>
            <div className="player-side">
              {avatarOpen ? avatarPanel() : (
              <div className="card">
                <div className="card-head"><h2>능력치</h2>
                  <span className="muted attr-state" aria-live="polite">{statBusy ? '저장 중…' : '＋ − 로 바로 고칩니다'}</span>
                </div>
                <div className="attr-list">{attrRows}</div>
                {myLog.length > 0 && (
                  <>
                    <h2 className="card-sub">고친 기록</h2>
                    <ul className="statlog">
                      {myLog.map((r, i) => (
                        <li key={`${r.ts}-${r.field}-${i}`}>
                          <span className="muted">{fmtLogAt(r.ts)}</span>
                          <b>{r.byName || '누군지 모름'}</b>
                          <span>{STAT_KO[r.field]}</span>
                          <span className="statlog-move">{r.before} → {r.after}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
              )}
            </div>
          </div>
        </div>
      )}
      {editModal()}
    </>
  );
}

export default function PlayerDetail({ num }: { num: number }) {
  const isNew = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('new') === '1';
  return <ThemeRoot><Detail num={num} isNew={isNew} /></ThemeRoot>;
}
