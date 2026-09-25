// src/react/squad/ShareModal.tsx — 라인업 공유 이미지. 공통 틀(ImageShareModal) + 제목 입력.
// 제목을 고친 뒤 blur 없이 바로 공유해도 틀이 직전에 다시 그리므로(draw 가 지금 제목을 읽는다) 마지막 값이 나간다.
import { Input } from 'antd';
import { useEffect, useState } from 'react';
import { drawLineupImage } from '../../components/share-image';
import { seoulToday } from '../../lib/html';
import { defaultTitle, type LineupState } from '../../lib/lineup';
import { shareFileName } from '../../lib/share';
import type { Player } from '../../lib/types';
import ImageShareModal from '../ImageShareModal';

export default function ShareModal({ open, onClose, st, players, onSetTitle }: {
  open: boolean; onClose: () => void; st: LineupState; players: Player[]; onSetTitle: (title: string) => void;
}) {
  const [title, setTitle] = useState('');
  useEffect(() => { if (open) setTitle(st.title || defaultTitle(seoulToday())); }, [open, st.title]);
  const titleNow = () => title || defaultTitle(seoulToday());
  function commitTitle(): void {
    const t = title.trim();
    onSetTitle(t === defaultTitle(seoulToday()) ? '' : t);
  }
  return (
    <ImageShareModal open={open} onClose={onClose} title="이미지 공유" shareTitle={titleNow()} fileName={shareFileName(seoulToday())}
      alt="라인업 이미지 미리보기" onBeforeAction={commitTitle} redrawKey={title}
      draw={(c) => { drawLineupImage(c, st, players, titleNow()); }}>
      <label className="bd-share-title"><span className="label">제목</span>
        <Input maxLength={40} value={title} onChange={(e) => setTitle(e.target.value)} onBlur={commitTitle}
          onPressEnter={(e) => (e.target as HTMLInputElement).blur()} />
      </label>
    </ImageShareModal>
  );
}
