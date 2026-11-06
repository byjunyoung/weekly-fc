// src/react/game/views/penalty3d/Solo.tsx — 입장 화면의 3D 승부차기 혼자 연습 칸(2026-11-07 5단계). 2D 칸과 같은 설정·같은 판 만들기(buildPenalty) —
// 나는 주황 편 혼자(우리 편 차기는 내가 차고 상대 차기는 내가 막는다), 상대는 봇 편. 다른 건 조작 안내(3D 키 배치)뿐.
import { Button, Segmented } from 'antd';
import { useState } from 'react';
import type { PenConfig } from '../../../../lib/games/penalty2d';
import { buildPenalty } from '../../../../lib/games/penalty2d';
import type { SoloProps } from '../types';
import { rngFrom } from '../match3d/view3d';

type First = 'random' | 'me' | 'them';
export const CONTROLS_PEN3 = '내 차례: 방향키로 옆·높이를 겨누고, D·스페이스(폰은 슛 버튼)를 누르고 있다가 떼면 슛 · 상대 차례: ←→ 옆걸음, 슛 키 = 몸 던지기(↑ 높이 · ↓ 낮게)';

export function Solo({ open, cardRef, players, num, onStart }: SoloProps<PenConfig>) {
  const [kicks, setKicks] = useState<3 | 5>(5);
  const [first, setFirst] = useState<First>('random');
  const me = num === null ? null : players.find((p) => p.num === num) ?? null;
  const ok = !!me && players.length >= 2;
  if (!open) return null;
  return (
    <div className="card" ref={cardRef}>
      <div className="card-head"><h2>혼자 연습 <span className="muted">봇 편과 승부차기</span></h2></div>
      <div className="game-opts">
        <label className="game-opt"><span className="muted">차는 횟수</span>
          <Segmented<number> value={kicks} onChange={(v) => setKicks(v as 3 | 5)} options={[{ value: 3, label: '3번씩' }, { value: 5, label: '5번씩' }]} /></label>
        <label className="game-opt"><span className="muted">먼저 차기</span>
          <Segmented<First> value={first} onChange={setFirst} options={[{ value: 'random', label: '무작위' }, { value: 'me', label: '나 먼저' }, { value: 'them', label: '상대 먼저' }]} /></label>
      </div>
      <p className="muted game-hint">{CONTROLS_PEN3}</p>
      {players.length < 2 && <p className="muted">명단이 두 명은 있어야 판을 만들 수 있습니다.</p>}
      <div className="game-start">
        <Button type="primary" size="large" disabled={!ok} onClick={() => {
          if (!me) return;
          onStart(() => {
            const seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
            const { config } = buildPenalty({
              humans: [[{ num: me.num, name: me.name, clientId: null }], []], kicks,
              first: first === 'me' ? 0 : first === 'them' ? 1 : 'random', roster: players, rnd: rngFrom(seed ^ 0x9e3779b9),
            });
            return { config, seed, myId: 0 };
          });
        }}>
          {me ? '시작' : '내 선수를 골라 주세요'}
        </Button>
      </div>
    </div>
  );
}
