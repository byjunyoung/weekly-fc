// src/react/squad/ShareModal.tsx — 라인업 공유 이미지. antd Modal 틀(0단계 theme.ts 의 Modal 토큰을 그대로
// 받는다) + Input(제목). 캔버스 그리기·내려받기·공유 로직은 옛 코드 그대로 — navigator.share 앞까지 전부
// 동기라야 사용자 제스처가 안 끊긴다.
import { App, Button, Input, Modal } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { drawLineupImage, ensureShareFonts } from '../../components/share-image';
import { seoulToday } from '../../lib/html';
import { defaultTitle, type LineupState } from '../../lib/lineup';
import { fallbackMethod, pickShareMethod, shareFileName, type ShareMethod } from '../../lib/share';
import { canCopyImage, copyImage, dataUrlToFile, shareEnv } from '../shareFile';
import type { Player } from '../../lib/types';

export default function ShareModal({ open, onClose, st, players, onSetTitle }: {
  open: boolean; onClose: () => void; st: LineupState; players: Player[]; onSetTitle: (title: string) => void;
}) {
  const { message } = App.useApp();
  const canvasRef = useRef<HTMLCanvasElement>(undefined!);
  if (!canvasRef.current) canvasRef.current = document.createElement('canvas');
  const fileRef = useRef<File | null>(null);
  const drawnTitleRef = useRef('');
  const [title, setTitle] = useState('');
  const [imgUrl, setImgUrl] = useState<string | undefined>(undefined);
  const [method, setMethod] = useState<ShareMethod>('download');

  const titleNow = () => title || defaultTitle(seoulToday());

  function redraw(): File {
    drawLineupImage(canvasRef.current, st, players, titleNow());
    const url = canvasRef.current.toDataURL('image/png');
    setImgUrl(url);
    drawnTitleRef.current = titleNow();
    return dataUrlToFile(url, shareFileName(seoulToday()));
  }

  useEffect(() => {
    if (!open) return;
    setTitle(st.title || defaultTitle(seoulToday()));
    (async () => {
      try {
        // 캔버스가 대체 글꼴로 굳지 않게 **쓸 크기마다** 갈무리를 불러 둔다(처음 열 때만).
        // document.fonts.ready 만으로는 부족하다 — 그건 이미 불러오는 중인 글꼴만 기다린다.
        await ensureShareFonts();
        const f = redraw();
        fileRef.current = f;
        setMethod(pickShareMethod(shareEnv(f)));
      } catch (e) { message.error((e as Error).message); }
    })();
    // open 이 바뀔 때만 다시 연다 — st·players 는 이 안에서 redraw() 가 최신 값을 직접 읽는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function commitTitle(): void {
    const t = title.trim();
    onSetTitle(t === defaultTitle(seoulToday()) ? '' : t);
  }
  function onTitleBlur(): void {
    commitTitle();
    try { fileRef.current = redraw(); } catch (e) { message.error((e as Error).message); }
  }

  async function onShare(): Promise<void> {
    // 제목을 고친 뒤 blur 없이 바로 탭하면 아직 안 그려졌을 수 있다 — 여기서도 확인해 다시 그린다.
    if (titleNow() !== drawnTitleRef.current) {
      commitTitle();
      try { fileRef.current = redraw(); } catch (e) { message.error((e as Error).message); return; }
    }
    if (!fileRef.current) return;
    try { await navigator.share({ files: [fileRef.current], title: titleNow() }); }
    catch (e) { if ((e as DOMException).name !== 'AbortError') setMethod(fallbackMethod(shareEnv(null))); }
  }

  async function onCopy(): Promise<void> {
    if (!fileRef.current) return;
    try { await copyImage(fileRef.current); message.success('이미지를 복사했습니다 — 카톡 입력창에 붙여넣으세요'); }
    catch { message.error('복사가 막혔습니다 — 내려받기를 쓰세요'); }
  }
  const note = method === 'longpress' ? '이미지를 길게 눌러 사진에 저장한 뒤 카톡으로 보내세요'
    : method === 'download' ? '[복사]를 누르고 카톡 입력창에 붙여넣거나, 내려받아 보내세요'
    : '공유하기를 누르면 카톡 등으로 바로 보낼 수 있습니다';

  return (
    <Modal title="이미지 공유" open={open} onCancel={onClose} width={560} footer={[
      <Button key="close" onClick={onClose}>닫기</Button>,
      method === 'download' && canCopyImage() ? <Button key="copy" type="primary" onClick={onCopy}>복사</Button> : null,
      method === 'download' ? <a key="dl" className="btn" href={imgUrl} download={shareFileName(seoulToday())}>내려받기</a> : null,
      method === 'share' ? <Button key="go" type="primary" onClick={onShare}>공유하기</Button> : null,
    ]}>
      <label className="bd-share-title"><span className="label">제목</span>
        <Input maxLength={40} value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={onTitleBlur}
          onPressEnter={(e) => (e.target as HTMLInputElement).blur()} />
      </label>
      <img className="bd-share-img" alt="라인업 이미지 미리보기" src={imgUrl} />
      <p className="muted">{note}</p>
    </Modal>
  );
}
