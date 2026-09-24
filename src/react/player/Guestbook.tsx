// src/react/player/Guestbook.tsx — 선수 방명록(2026-09-25). 선수 페이지 카드 아래 한 줄씩.
// 쓰는 사람은 로그인해 이름을 차지한 회원(사용자 결정) — 이름은 서버가 붙인다. 지우기는 본인·관리자.
// 목록은 get_all 에 없고 여기서 따로 읽는다(선수마다 100줄까지). 쓰고 나면 응답 한 줄을 맨 위에 얹는다.
import { App, Button, Input, Popconfirm } from 'antd';
import { useEffect, useState } from 'react';
import { avatarFaceSvg } from '../../components/avatar';
import { deleteGuestbook, fetchGuestbook, writeGuestbook } from '../../lib/api';
import { avatarSpecFor } from '../../lib/avatar';
import { GUESTBOOK_MAX, guestbookProblem } from '../../lib/card';
import { fmtLogAt } from '../../lib/html';
import type { GuestbookRow, Player } from '../../lib/types';
import { useAdmin } from '../useAdmin';
import { useMeInfo } from '../useMe';

export default function Guestbook({ player, players }: { player: Player; players: Player[] }) {
  const { message } = App.useApp();
  const me = useMeInfo();
  const admin = useAdmin();
  const [rows, setRows] = useState<GuestbookRow[] | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    setRows(null);
    fetchGuestbook(player.num).then((r) => { if (alive) setRows(r); }).catch(() => { if (alive) setRows([]); });
    return () => { alive = false; };
  }, [player.num]);

  const canWrite = me.login && me.num != null;
  const face = (num: number | null) => (num == null ? null : (
    <span className="gb-face" aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: avatarFaceSvg(avatarSpecFor(num, players.find((p) => p.num === num)?.avatar), 28, num) }} />
  ));

  async function onWrite(): Promise<void> {
    const problem = guestbookProblem(text);
    if (problem) { message.info(problem); return; }
    setBusy(true);
    try {
      const row = await writeGuestbook(player.num, text);
      setRows((prev) => [row, ...(prev ?? [])]);
      setText('');
    } catch (e) { message.error((e as Error).message); }
    finally { setBusy(false); }
  }
  async function onDelete(id: number): Promise<void> {
    try { await deleteGuestbook(id); setRows((prev) => (prev ?? []).filter((r) => r.id !== id)); }
    catch (e) { message.error((e as Error).message); }
  }

  return (
    <div className="card gb">
      <div className="card-head"><h2>방명록 <span className="muted">{rows ? `${rows.length}` : ''}</span></h2></div>
      {canWrite ? (
        <div className="gb-form">
          <Input placeholder={`${player.name} 선수에게 한 줄`} value={text} maxLength={GUESTBOOK_MAX} showCount
            onChange={(e) => setText(e.target.value)} onPressEnter={onWrite} disabled={busy} />
          <Button type="primary" onClick={onWrite} loading={busy}>남기기</Button>
        </div>
      ) : (
        <p className="muted gb-hint">
          {me.login ? '먼저 내 이름을 골라야 남길 수 있습니다' : '로그인하면 한 줄 남길 수 있습니다'} ·{' '}
          <button type="button" className="linklike" onClick={() => window.dispatchEvent(new Event('wfc:open-me'))}>{me.login ? '이름 고르기' : '로그인'}</button>
        </p>
      )}
      {rows === null ? <p className="muted gb-hint">불러오는 중…</p>
        : rows.length === 0 ? <p className="muted gb-hint">아직 남긴 글이 없습니다. 첫 줄을 남겨 보세요.</p>
        : (
          <ul className="gb-list">
            {rows.map((r) => (
              <li className="gb-row" key={r.id}>
                {face(r.authorNum)}
                <div className="gb-body">
                  <div className="gb-who"><b>{r.authorName || '누군가'}</b><span className="muted">{fmtLogAt(r.ts)}</span></div>
                  <p className="gb-text">{r.text}</p>
                </div>
                {(admin || (me.num != null && me.num === r.authorNum)) && (
                  <Popconfirm title="이 글을 지울까요?" okText="지우기" cancelText="취소" onConfirm={() => onDelete(r.id)}>
                    <Button size="small" className="gb-del" aria-label="글 지우기">✕</Button>
                  </Popconfirm>
                )}
              </li>
            ))}
          </ul>
        )}
    </div>
  );
}
