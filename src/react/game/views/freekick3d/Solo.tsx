// src/react/game/views/freekick3d/Solo.tsx — 입장 화면의 3D 프리킥 혼자 연습 칸(2026-11-07 6단계). 2D 칸과 같은 판(buildFreekick — 나 혼자 다섯 자리),
// 기기 최고 점수는 3D 따로(FK3_BEST_KEY). 다른 건 조작 안내(3D 키 배치)뿐.
import { Button } from 'antd';
import { useEffect, useState } from 'react';
import type { FkConfig } from '../../../../lib/games/freekick2d';
import { FK_MAX_POINTS, buildFreekick } from '../../../../lib/games/freekick2d';
import type { SoloProps } from '../types';
import { readBest } from '../best';

export const FK3_BEST_KEY = 'wfc:game:freekick3d-best';
export const CONTROLS_FK3 = '옆·높이 겨누기(방향키·왼쪽 끌기) · D·스페이스(폰은 슛 버튼)를 누르고 있다가 떼면 슛 · 누르는 동안 좌우 = 감아차기';

export function Solo({ open, cardRef, players, num, onStart }: SoloProps<FkConfig>) {
  const me = num === null ? null : players.find((p) => p.num === num) ?? null;
  const [best, setBest] = useState<number | null>(null);
  useEffect(() => { if (open) setBest(readBest(FK3_BEST_KEY)); }, [open]);
  if (!open) return null;
  return (
    <div className="card" ref={cardRef}>
      <div className="card-head"><h2>혼자 연습 <span className="muted">다섯 자리 · {FK_MAX_POINTS}점 만점{best !== null ? ` · 내 최고 ${best}점` : ''}</span></h2></div>
      <p className="muted game-hint">{CONTROLS_FK3}</p>
      <p className="muted game-hint">벽을 넘기려면 높이 겨누고 덜 세게 — 너무 세면 크로스바 위로 넘어갑니다. 벽 옆으로 감아 돌려도 됩니다.</p>
      <div className="game-start">
        <Button type="primary" size="large" disabled={!me} onClick={() => {
          if (!me) return;
          onStart(() => ({ config: buildFreekick([{ num: me.num, name: me.name }], players), seed: (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0, myId: 0 }));
        }}>
          {me ? '시작' : '내 선수를 골라 주세요'}
        </Button>
      </div>
    </div>
  );
}
