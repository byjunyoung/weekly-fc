// src/react/game/views/free2d/Solo.tsx — 입장 화면의 자유 훈련장 혼자 하기 칸(2026-11-07 2단계): 연습 봇 수 · 경기장 크기 → 시작.
// 닫혀도 컴포넌트는 남아 고른 값을 기억한다(경기의 Solo 와 같은 약속).
import { Button, Segmented } from 'antd';
import { useState } from 'react';
import type { FreeConfig } from '../../../../lib/games/free2d';
import { MAX_BOTS, buildFree } from '../../../../lib/games/free2d';
import type { FieldChoice } from '../../../../lib/games/match2d-room';
import type { SoloProps } from '../types';
import { FIELD_OPTIONS } from '../match2d/options';
import { rngFrom } from '../match2d/view';

export function Solo({ open, cardRef, players, num, onStart }: SoloProps<FreeConfig>) {
  const [bots, setBots] = useState(2);
  const [field, setField] = useState<FieldChoice>('auto');
  const me = num === null ? null : players.find((p) => p.num === num) ?? null;
  if (!open) return null;
  return (
    <div className="card" ref={cardRef}>
      <div className="card-head"><h2>혼자 연습 <span className="muted">공 3개와 연습 봇</span></h2></div>
      <div className="game-opts">
        <label className="game-opt"><span className="muted">연습 봇</span>
          <Segmented<number> value={bots} onChange={setBots}
            options={Array.from({ length: MAX_BOTS + 1 }, (_, n) => ({ value: n, label: n ? `${n}명` : '없음', disabled: n > players.length - 1 }))} /></label>
        <label className="game-opt"><span className="muted">경기장</span>
          <Segmented<FieldChoice> value={field} onChange={setField} options={FIELD_OPTIONS} /></label>
      </div>
      <p className="muted game-hint">PC: 방향키·WASD로 이동, 스페이스나 Shift로 킥 · 폰: 왼쪽을 끌어 이동, 오른쪽 버튼으로 킥 · 오른쪽 위 [공 모으기]</p>
      <div className="game-start">
        <Button type="primary" size="large" disabled={!me} onClick={() => {
          if (!me) return;
          onStart(() => {
            // 씨앗은 화면 쪽 시계에서 — 계산 코드는 시계·난수를 모른다.
            const seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
            const config = buildFree({ humans: [{ num: me.num, name: me.name, host: true }], bots: Math.min(bots, players.length - 1), field, roster: players, rnd: rngFrom(seed ^ 0x9e3779b9) });
            return { config, seed, myId: 0 };
          });
        }}>
          {me ? '시작' : '내 선수를 골라 주세요'}
        </Button>
      </div>
    </div>
  );
}
