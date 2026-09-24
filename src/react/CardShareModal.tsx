// src/react/CardShareModal.tsx — 선수 카드 이미지 공유(2026-09-25). 티어표 공유(TierShareModal)와 같은 흐름:
// 열면 그 순간의 숫자로 그리고 → 공유 / 길게 눌러 저장 / 내려받기. "내 카드"와 "POTM 카드" 둘 다 이걸로.
import { App, Button, Modal } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { type CardImageOpts, drawCardImage } from '../components/card-image';
import { ensureShareFonts } from '../components/share-image';
import { seoulToday } from '../lib/html';
import { fallbackMethod, pickShareMethod, type ShareMethod } from '../lib/share';
import type { Tier } from '../lib/tier';
import type { Player } from '../lib/types';
import { dataUrlToFile, shareEnv } from './shareFile';

export default function CardShareModal({ open, onClose, player, tier, opts, title, fileTag }: {
  open: boolean; onClose: () => void; player: Player | null; tier: Tier | null | undefined;
  opts?: CardImageOpts; title: string; fileTag: string;
}) {
  const { message } = App.useApp();
  const canvasRef = useRef<HTMLCanvasElement>(undefined!);
  if (!canvasRef.current && typeof document !== 'undefined') canvasRef.current = document.createElement('canvas');
  const fileRef = useRef<File | null>(null);
  const [imgUrl, setImgUrl] = useState<string | undefined>(undefined);
  const [method, setMethod] = useState<ShareMethod>('download');
  const fileName = `weeklyfc-${fileTag}-${seoulToday()}.png`;

  useEffect(() => {
    if (!open || !player) return;
    setImgUrl(undefined);
    (async () => {
      try {
        await ensureShareFonts();
        drawCardImage(canvasRef.current, player, tier ?? null, opts);
        const url = canvasRef.current.toDataURL('image/png');
        setImgUrl(url);
        fileRef.current = dataUrlToFile(url, fileName);
        setMethod(pickShareMethod(shareEnv(fileRef.current)));
      } catch (e) { message.error((e as Error).message); }
    })();
    // 열 때마다 그 순간의 값으로 다시 그린다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, player?.num]);

  async function onShare(): Promise<void> {
    if (!fileRef.current) return;
    try { await navigator.share({ files: [fileRef.current], title }); }
    catch (e) { if ((e as DOMException).name !== 'AbortError') setMethod(fallbackMethod(shareEnv(null))); }
  }

  const note = method === 'longpress' ? '이미지를 길게 눌러 사진에 저장하세요'
    : method === 'download' ? '내려받기를 누르면 PNG 로 저장됩니다'
    : '공유하기를 누르면 이미지가 바로 갑니다';

  return (
    <Modal title={title} open={open} onCancel={onClose} width={560} footer={[
      <Button key="close" onClick={onClose}>닫기</Button>,
      method === 'download' ? <a key="dl" className="btn" href={imgUrl} download={fileName}>내려받기</a> : null,
      method === 'share' ? <Button key="go" type="primary" onClick={onShare}>공유하기</Button> : null,
    ]}>
      <img className="bd-share-img" alt={`${title} 미리보기`} src={imgUrl} />
      <p className="muted">{note}</p>
    </Modal>
  );
}
