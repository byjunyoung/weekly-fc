// 티어표 공유 이미지 — 라인업 ShareModal 과 같은 흐름(그리기 → 공유/길게 눌러 저장/내려받기).
// 공유 글에 "나도 하기" 주소를 함께 싣는다: 이미지만 돌면 게임으로 들어올 길이 없다(설계 §2).
import { App, Button, Modal } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { ensureShareFonts } from '../../components/share-image';
import { drawTierImage } from '../../components/tier-image';
import { seoulToday } from '../../lib/html';
import { fallbackMethod, pickShareMethod, type ShareMethod } from '../../lib/share';
import { STAT_KO } from '../../lib/stats';
import type { TierKey } from '../../lib/tier';
import type { Player } from '../../lib/types';
import { href } from '../../lib/url';
import { canCopyImage, copyImage, dataUrlToFile, shareEnv } from '../shareFile';

const keyLabel = (k: TierKey): string => (k === 'ovr' ? '종합' : STAT_KO[k]);

export default function TierShareModal({ open, onClose, players, tierKey }: {
  open: boolean; onClose: () => void; players: Player[]; tierKey: TierKey;
}) {
  const { message } = App.useApp();
  const canvasRef = useRef<HTMLCanvasElement>(undefined!);
  if (!canvasRef.current && typeof document !== 'undefined') canvasRef.current = document.createElement('canvas');
  const fileRef = useRef<File | null>(null);
  const [imgUrl, setImgUrl] = useState<string | undefined>(undefined);
  const [method, setMethod] = useState<ShareMethod>('download');
  const fileName = `weeklyfc-tier-${seoulToday()}.png`;
  const link = typeof location !== 'undefined' ? `${location.origin}${href('/tier/')}` : '';

  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        await ensureShareFonts();
        drawTierImage(canvasRef.current, players, tierKey, 'WEEKLY FC 티어', `${keyLabel(tierKey)} · ${seoulToday().replaceAll('-', '.')}`);
        const url = canvasRef.current.toDataURL('image/png');
        setImgUrl(url);
        fileRef.current = dataUrlToFile(url, fileName);
        setMethod(pickShareMethod(shareEnv(fileRef.current)));
      } catch (e) { message.error((e as Error).message); }
    })();
    // 열 때마다 그 순간의 숫자로 다시 그린다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function onShare(): Promise<void> {
    if (!fileRef.current) return;
    try { await navigator.share({ files: [fileRef.current], title: 'WEEKLY FC 티어', text: `나도 하기 → ${link}` }); }
    catch (e) { if ((e as DOMException).name !== 'AbortError') setMethod(fallbackMethod(shareEnv(null))); }
  }

  async function onCopy(): Promise<void> {
    if (!fileRef.current) return;
    try { await copyImage(fileRef.current); message.success('이미지를 복사했습니다 — 카톡 입력창에 붙여넣으세요'); }
    catch { message.error('복사가 막혔습니다 — 내려받기를 쓰세요'); }
  }
  const note = method === 'longpress' ? '이미지를 길게 눌러 사진에 저장한 뒤 카톡으로 보내세요. 아래 주소도 같이 붙여 주세요'
    : method === 'download' ? '[복사]를 누르고 카톡 입력창에 붙여넣거나 내려받아 보내세요. 아래 주소도 같이'
    : '공유하기를 누르면 이미지와 게임 주소가 함께 갑니다';

  return (
    <Modal title="티어표 공유" open={open} onCancel={onClose} width={560} footer={[
      <Button key="close" onClick={onClose}>닫기</Button>,
      method === 'download' && canCopyImage() ? <Button key="copy" type="primary" onClick={onCopy}>복사</Button> : null,
      method === 'download' ? <a key="dl" className="btn" href={imgUrl} download={fileName}>내려받기</a> : null,
      method === 'share' ? <Button key="go" type="primary" onClick={onShare}>공유하기</Button> : null,
    ]}>
      <img className="bd-share-img" alt="티어표 이미지 미리보기" src={imgUrl} />
      <p className="muted">{note}</p>
      <p className="tier-link"><span className="label">나도 하기</span> <span className="tier-link-url">{link}</span></p>
    </Modal>
  );
}
