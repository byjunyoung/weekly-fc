// 팀 나누기 공유 이미지(2026-09-25) — 티어표 공유와 같은 흐름(그리기 → 공유/길게 눌러 저장/내려받기).
import { App, Button, Modal } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { ensureShareFonts } from '../../components/share-image';
import { drawTeamsImage } from '../../components/teams-image';
import { seoulToday } from '../../lib/html';
import { matchLabel } from '../../lib/matches';
import { fallbackMethod, pickShareMethod, type ShareMethod } from '../../lib/share';
import type { MatchTeam, Player } from '../../lib/types';
import { dataUrlToFile, shareEnv } from '../shareFile';

export default function TeamsShareModal({ open, onClose, lineup, players, date }: {
  open: boolean; onClose: () => void; lineup: MatchTeam[]; players: Player[]; date: string;
}) {
  const { message } = App.useApp();
  const canvasRef = useRef<HTMLCanvasElement>(undefined!);
  if (!canvasRef.current && typeof document !== 'undefined') canvasRef.current = document.createElement('canvas');
  const fileRef = useRef<File | null>(null);
  const [imgUrl, setImgUrl] = useState<string | undefined>(undefined);
  const [method, setMethod] = useState<ShareMethod>('download');
  const fileName = `weeklyfc-teams-${date || seoulToday()}.png`;

  useEffect(() => {
    if (!open) return;
    setImgUrl(undefined);
    (async () => {
      try {
        await ensureShareFonts();
        drawTeamsImage(canvasRef.current, lineup, players, '팀 나누기', `${matchLabel(date)} · ${lineup.reduce((n, t) => n + t.members.length, 0)}명`);
        const url = canvasRef.current.toDataURL('image/png');
        setImgUrl(url);
        fileRef.current = dataUrlToFile(url, fileName);
        setMethod(pickShareMethod(shareEnv(fileRef.current)));
      } catch (e) { message.error((e as Error).message); }
    })();
    // 열 때마다 그 순간의 팀으로 다시 그린다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function onShare(): Promise<void> {
    if (!fileRef.current) return;
    try { await navigator.share({ files: [fileRef.current], title: 'WEEKLY FC 팀 나누기' }); }
    catch (e) { if ((e as DOMException).name !== 'AbortError') setMethod(fallbackMethod(shareEnv(null))); }
  }
  const note = method === 'longpress' ? '이미지를 길게 눌러 사진에 저장한 뒤 카톡으로 보내세요'
    : method === 'download' ? '내려받은 이미지를 카톡으로 보내세요'
    : '공유하기를 누르면 이미지가 바로 갑니다';

  return (
    <Modal title="팀 나누기 이미지" open={open} onCancel={onClose} width={560} footer={[
      <Button key="close" onClick={onClose}>닫기</Button>,
      method === 'download' ? <a key="dl" className="btn" href={imgUrl} download={fileName}>내려받기</a> : null,
      method === 'share' ? <Button key="go" type="primary" onClick={onShare}>공유하기</Button> : null,
    ]}>
      <img className="bd-share-img" alt="팀 나누기 이미지 미리보기" src={imgUrl} />
      <p className="muted">{note}</p>
    </Modal>
  );
}
