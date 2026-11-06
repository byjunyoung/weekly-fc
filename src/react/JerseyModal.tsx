// src/react/JerseyModal.tsx — 등번호 바꾸기(2026-11-06 사용자: "등번호는 1-99 각자가 선택할 수있게 기능으로 만들되,
// 이미 차지한 번호면 티어가 높으면 뺏을 수 있게"). 칸 판정은 lib/jersey.ts(서버 pick_jersey 와 같은 규칙), 최종 판정은 서버.
// 본인: 빈 번호는 그대로, 주인 있는 번호는 내 티어가 한 칸 이상 높을 때 맞바꿈. 관리자(admin): 그 선수의 번호를 티어와 무관하게 정한다.
import { App, Button, Modal } from 'antd';
import { useMemo, useState } from 'react';
import { pickJersey, refresh } from '../lib/api';
import { tierByNum } from '../lib/card';
import { jerseyCells, lockedReason } from '../lib/jersey';
import type { Player } from '../lib/types';
import { NumberGrid, type GridCell } from './squad/NumberPicker';

type Props = { open: boolean; onClose: () => void; players: Player[]; num: number; admin?: boolean };

function Body({ onClose, players, num, admin }: Omit<Props, 'open'>) {
  const { message } = App.useApp();
  const me = players.find((p) => p.num === num);
  const cells = useMemo(() => jerseyCells(players, num, admin), [players, num, admin]);
  const myTier = useMemo(() => tierByNum(players).get(num) ?? null, [players, num]);
  const [pick, setPick] = useState<number | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!me) return <p className="muted">이 번호의 선수가 없습니다.</p>;

  const who = admin ? `${me.name} 님` : '내';
  const grid: GridCell[] = cells.map((c) => ({
    n: c.n, state: c.state,
    label: c.state === 'mine' ? `${c.n}번 ${who} 번호`
      : c.state === 'free' ? `${c.n}번 빈 번호`
      : `${c.n}번 ${c.holder} ${c.state === 'steal' ? '가져올 수 있음' : '못 가져옴'}`,
  }));
  const picked = pick == null ? null : cells.find((c) => c.n === pick) ?? null;
  const tierText = (t: string | null) => (t ? `(${t})` : '(배치 전)');

  const onTap = (n: number) => {
    const c = cells.find((x) => x.n === n);
    if (!c || busy) return;
    setError(null);
    if (c.state === 'mine') { setPick(null); setHint(`지금 ${who} 등번호입니다`); return; }
    if (c.state === 'locked') { setPick(null); setHint(lockedReason(c, myTier)); return; }
    setPick(n);
    setHint(c.state === 'steal' ? `${c.holder} 님${tierText(c.holderTier)}이 쓰는 번호입니다` : null);
  };

  const submit = async () => {
    if (picked == null || busy) return;
    setBusy(true); setError(null);
    try {
      const r = await pickJersey(picked.n, admin ? num : undefined);
      message.success(r.swapped ? `${r.jersey}번으로 바꿨습니다 — ${r.swapped} 님과 맞바꿨습니다` : `${r.jersey}번으로 바꿨습니다`);
      onClose();
    } catch (e) {
      // 서버 문구 그대로 — 그 사이 다른 사람이 먼저 바꿨을 수 있으니 칸도 새로 읽는다.
      setError((e as Error).message);
      setPick(null); setHint(null);
      refresh().catch(() => {});
      setBusy(false);
    }
  };

  return (
    <div className="numpick">
      <p className="muted">{admin ? `${me.name} 님의 지금 등번호는 ${me.jersey}번입니다.` : `지금 내 등번호는 ${me.jersey}번입니다.`}</p>
      <NumberGrid cells={grid} pick={pick} onTap={onTap} />
      <p className="numpick-legend muted">채운 칸 {admin ? '지금 번호' : '내 번호'} · 점선 가져올 수 있음 · 흐린 칸 못 가져옴 · 나머지 빈 번호</p>
      <p className="numpick-hint muted" aria-live="polite">{hint ?? '바꿀 번호를 누르세요'}</p>
      {error && <p className="numpick-hint warn" role="alert">{error}</p>}
      {picked && (picked.state === 'free' || picked.state === 'steal') && (
        <div className="numpick-confirm">
          <p>{picked.state === 'steal'
            ? `${picked.holder} 님과 번호를 맞바꿉니다 — ${picked.holder} 님은 ${me.jersey}번이 됩니다`
            : `${picked.n}번으로 바꿉니다`}</p>
          <Button type="primary" loading={busy} onClick={submit}>{picked.state === 'steal' ? '맞바꾸기' : '이 번호로 바꾸기'}</Button>
        </div>
      )}
    </div>
  );
}

export default function JerseyModal({ open, onClose, players, num, admin }: Props) {
  const me = players.find((p) => p.num === num);
  return (
    <Modal title={admin && me ? `${me.name} 등번호 바꾸기` : '등번호 바꾸기'} open={open} width={520} footer={null} destroyOnHidden onCancel={onClose}>
      <Body onClose={onClose} players={players} num={num} admin={admin} />
    </Modal>
  );
}
