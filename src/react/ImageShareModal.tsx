// src/react/ImageShareModal.tsx — 이미지 저장·공유의 **단 하나의 틀**(2026-09-25 "여기저기 많이 쓰이니까 하나의 기능으로").
// 라인업·티어표·팀 나누기·선수 카드·POTM 카드가 전부 이걸 쓴다. 각자는 "무엇을 그리나"(draw)만 넘긴다.
//
// 흐름: 열면 갈무리 글꼴을 쓸 크기마다 불러 둔 뒤 그린다 → 미리보기 → 환경에 맞는 버튼.
//   폰(파일 공유 가능)      [공유하기]                — 카톡 등 공유 시트
//   iOS 인데 공유 불가      길게 눌러 저장 안내
//   데스크톱               [복사] [내려받기]          — 맥 공유 시트의 "복사"는 파일을 두 번 넣어 안 쓴다(2026-09-25)
// 공유·복사 직전에 한 번 더 그린다(동기) — 제목처럼 열어 둔 채 바뀌는 값이 있어도 늘 마지막 값이 나간다.
// 그리기·toDataURL·File 만들기가 전부 동기라야 사용자 제스처가 끊기지 않는다(navigator.share 조건).
import { App, Button, Modal } from 'antd';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ensureShareFonts } from '../components/share-image';
import { fallbackMethod, pickShareMethod, type ShareMethod } from '../lib/share';
import { canCopyImage, copyImage, dataUrlToFile, shareEnv } from './shareFile';

export default function ImageShareModal({ open, onClose, title, fileName, draw, shareTitle, shareText, alt, children, extra, onBeforeAction, redrawKey }: {
  open: boolean; onClose: () => void;
  /** 모달 제목. */
  title: string;
  /** 내려받기·공유 파일 이름(.png 포함). */
  fileName: string;
  /** 캔버스에 그린다(동기). 열 때와 공유·복사 직전에 불린다 — 늘 지금 값을 읽어 그릴 것. */
  draw: (canvas: HTMLCanvasElement) => void;
  shareTitle?: string; shareText?: string;
  alt?: string;
  /** 미리보기 위(예: 라인업 제목 입력). */
  children?: ReactNode;
  /** 안내문 아래(예: 티어 "나도 하기" 주소). */
  extra?: ReactNode;
  /** 공유·복사 직전에 부르는 훅(예: 제목 확정). */
  onBeforeAction?: () => void;
  /** 열어 둔 채 이 값이 바뀌면 미리보기를 다시 그린다(예: 라인업 제목). */
  redrawKey?: unknown;
}) {
  const { message } = App.useApp();
  const canvasRef = useRef<HTMLCanvasElement>(undefined!);
  if (!canvasRef.current && typeof document !== 'undefined') canvasRef.current = document.createElement('canvas');
  const fileRef = useRef<File | null>(null);
  const [imgUrl, setImgUrl] = useState<string | undefined>(undefined);
  const [method, setMethod] = useState<ShareMethod>('download');
  const [busy, setBusy] = useState(false);   // 두 번 눌려 두 번 나가지 않게

  /** 그리고 파일까지 만든다(동기). */
  function prepare(): File {
    draw(canvasRef.current);
    const url = canvasRef.current.toDataURL('image/png');
    setImgUrl(url);
    const f = dataUrlToFile(url, fileName);
    fileRef.current = f;
    return f;
  }

  useEffect(() => {
    if (!open) return;
    setImgUrl(undefined);
    (async () => {
      try {
        await ensureShareFonts();
        const f = prepare();
        setMethod(pickShareMethod(shareEnv(f)));
      } catch (e) { message.error((e as Error).message); }
    })();
    // 열 때마다 그 순간의 값으로 다시 그린다 — draw 가 최신 값을 직접 읽는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open || !imgUrl) return;   // 처음 그리기는 위 effect 가(글꼴을 기다린 뒤) 한다
    try { prepare(); } catch (e) { message.error((e as Error).message); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [redrawKey]);

  function fresh(): File | null {
    try { onBeforeAction?.(); return prepare(); } catch (e) { message.error((e as Error).message); return null; }
  }
  async function onShare(): Promise<void> {
    if (busy) return;
    const f = fresh(); if (!f) return;
    setBusy(true);
    try { await navigator.share({ files: [f], title: shareTitle ?? title, text: shareText }); }
    catch (e) { if ((e as DOMException).name !== 'AbortError') setMethod(fallbackMethod(shareEnv(null))); }
    finally { setBusy(false); }
  }
  async function onCopy(): Promise<void> {
    if (busy) return;
    const f = fresh(); if (!f) return;
    setBusy(true);
    try { await copyImage(f); message.success('이미지를 복사했습니다 — 카톡 입력창에 붙여넣으세요'); }
    catch { message.error('복사가 막혔습니다 — 내려받기를 쓰세요'); }
    finally { setBusy(false); }
  }

  const note = method === 'longpress' ? '이미지를 길게 눌러 사진에 저장한 뒤 카톡으로 보내세요'
    : method === 'download' ? '[복사]를 누르고 카톡 입력창에 붙여넣거나, 내려받아 보내세요'
    : '공유하기를 누르면 이미지가 바로 갑니다';

  return (
    <Modal title={title} open={open} onCancel={onClose} width={560} footer={[
      <Button key="close" onClick={onClose}>닫기</Button>,
      method === 'download' && canCopyImage() ? <Button key="copy" onClick={onCopy} loading={busy}>복사</Button> : null,
      method === 'download' ? <Button key="dl" type="primary" href={imgUrl} download={fileName} onClick={() => onBeforeAction?.()}>내려받기</Button> : null,
      method === 'share' ? <Button key="go" type="primary" onClick={onShare} loading={busy}>공유하기</Button> : null,
    ]}>
      {children}
      <img className="bd-share-img" alt={alt ?? `${title} 미리보기`} src={imgUrl} />
      <p className="muted">{note}</p>
      {extra}
    </Modal>
  );
}
