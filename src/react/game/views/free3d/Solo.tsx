// src/react/game/views/free3d/Solo.tsx — 입장 화면의 3D 자유 훈련장 혼자 연습 칸(2026-11-07 5단계): 연습 봇 수 · 시점 → 시작.
// 2D 칸과 같은 판 만들기(buildFree3 — 2D buildFree 와 같은 뽑기). 1인칭이 이 게임의 쓸모라(스펙 §3.3) 시점을 여기서도 고른다.
import { Button, Segmented } from 'antd';
import { useEffect, useState } from 'react';
import type { Free3Config } from '../../../../lib/games/free3d';
import { buildFree3 } from '../../../../lib/games/free3d';
import { MAX_BOTS } from '../../../../lib/games/free2d';
import type { SoloProps } from '../types';
import { CONTROLS_3D } from '../match3d/Solo';
import { readView, rngFrom, saveView, VIEW_LABEL, VIEW_MODES, type ViewMode } from '../match3d/view3d';

export function Solo({ open, cardRef, players, num, onStart }: SoloProps<Free3Config>) {
  const [bots, setBots] = useState(2);
  const [view, setView] = useState<ViewMode>('broadcast');
  useEffect(() => { setView(readView()); }, []);
  const me = num === null ? null : players.find((p) => p.num === num) ?? null;
  if (!open) return null;
  return (
    <div className="card" ref={cardRef}>
      <div className="card-head"><h2>혼자 연습 <span className="muted">공 3개와 연습 봇</span></h2></div>
      <div className="game-opts">
        <label className="game-opt"><span className="muted">연습 봇</span>
          <Segmented<number> value={bots} onChange={setBots}
            options={Array.from({ length: MAX_BOTS + 1 }, (_, n) => ({ value: n, label: n ? `${n}명` : '없음', disabled: n > players.length - 1 }))} /></label>
        <label className="game-opt"><span className="muted">시점</span>
          <Segmented<ViewMode> value={view} onChange={(v) => { setView(v); saveView(v); }} options={VIEW_MODES.map((m) => ({ value: m, label: VIEW_LABEL[m] }))} /></label>
      </div>
      <p className="muted game-hint">{CONTROLS_3D} · 오른쪽 위 [공 모으기]</p>
      <p className="muted game-hint">1인칭은 ←→ 돌기, ↑↓ 앞뒤 — 보는 쪽으로 패스·슛. 시점은 연습 중에도 ✕ 아래 버튼으로 바꿉니다.</p>
      <div className="game-start">
        <Button type="primary" size="large" disabled={!me} onClick={() => {
          if (!me) return;
          onStart(() => {
            const seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
            const config = buildFree3({ humans: [{ num: me.num, name: me.name, host: true }], bots: Math.min(bots, players.length - 1), roster: players, rnd: rngFrom(seed ^ 0x9e3779b9) });
            return { config, seed, myId: 0 };
          });
        }}>
          {me ? '시작' : '내 선수를 골라 주세요'}
        </Button>
      </div>
    </div>
  );
}
