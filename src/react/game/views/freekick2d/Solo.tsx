// src/react/game/views/freekick2d/Solo.tsx — 입장 화면의 프리킥 혼자 하기 칸(2026-11-07 3단계). 나 혼자 다섯 자리, 기기에 최고 점수.
import { Button } from 'antd';
import { useEffect, useState } from 'react';
import type { FkConfig } from '../../../../lib/games/freekick2d';
import { FK_MAX_POINTS, buildFreekick } from '../../../../lib/games/freekick2d';
import type { SoloProps } from '../types';
import { FK_BEST_KEY, readBest } from '../best';

export function Solo({ open, cardRef, players, num, onStart }: SoloProps<FkConfig>) {
  const me = num === null ? null : players.find((p) => p.num === num) ?? null;
  const [best, setBest] = useState<number | null>(null);
  useEffect(() => { if (open) setBest(readBest(FK_BEST_KEY)); }, [open]);
  if (!open) return null;
  return (
    <div className="card" ref={cardRef}>
      <div className="card-head"><h2>혼자 연습 <span className="muted">다섯 자리 · {FK_MAX_POINTS}점 만점{best !== null ? ` · 내 최고 ${best}점` : ''}</span></h2></div>
      <p className="muted game-hint">←→ 로 겨누고, 스페이스·Shift(폰은 오른쪽 버튼)를 누르고 있다가 떼면 슛 · 누르는 동안 ←→ 를 누르면 그쪽으로 휘어 갑니다</p>
      <div className="game-start">
        <Button type="primary" size="large" disabled={!me} onClick={() => {
          if (!me) return;
          onStart(() => {
            const seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
            return { config: buildFreekick([{ num: me.num, name: me.name }], players), seed, myId: 0 };
          });
        }}>
          {me ? '시작' : '내 선수를 골라 주세요'}
        </Button>
      </div>
    </div>
  );
}
