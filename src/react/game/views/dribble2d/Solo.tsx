// src/react/game/views/dribble2d/Solo.tsx — 입장 화면의 드리블 훈련장 혼자 하기 칸(2026-11-07 3단계): 코스 고르기 → 시작. 코스마다 기기에 남은 내 최고 기록.
import { Button, Segmented } from 'antd';
import { useEffect, useState } from 'react';
import type { DrConfig } from '../../../../lib/games/dribble2d';
import { COURSES, buildDribble } from '../../../../lib/games/dribble2d';
import type { SoloProps } from '../types';
import { dribbleBestKey, readBest } from '../best';
import { secText } from './render';

export function Solo({ open, cardRef, players, num, onStart }: SoloProps<DrConfig>) {
  const [course, setCourse] = useState(0);
  const [bests, setBests] = useState<(number | null)[]>([]);
  useEffect(() => { if (open) setBests(COURSES.map((c) => readBest(dribbleBestKey(c.id)))); }, [open]);
  const me = num === null ? null : players.find((p) => p.num === num) ?? null;
  if (!open) return null;
  const c = COURSES[course], best = bests[course] ?? null;
  return (
    <div className="card" ref={cardRef}>
      <div className="card-head"><h2>혼자 연습 <span className="muted">내 기록과 겨루기</span></h2></div>
      <div className="game-opts">
        <label className="game-opt"><span className="muted">코스</span>
          <Segmented<number> value={course} onChange={setCourse} options={COURSES.map((k, i) => ({ value: i, label: k.name }))} /></label>
        <p className="muted dr-sum">문 {c.gates.length}개 · 금 {c.medals[0]}초 · 은 {c.medals[1]}초 · 동 {c.medals[2]}초{best !== null ? ` · 내 최고 ${secText(best)}` : ''}</p>
      </div>
      <p className="muted game-hint">공을 몰고 금색 점선 문을 차례대로 지나 결승선까지 · 문을 건너뛰면 그 문으로 돌아가야 합니다 · 콘을 치면 1초</p>
      <div className="game-start">
        <Button type="primary" size="large" disabled={!me} onClick={() => {
          if (!me) return;
          onStart(() => ({ config: buildDribble([{ num: me.num, name: me.name }], course, players), seed: (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0, myId: 0 }));
        }}>
          {me ? '시작' : '내 선수를 골라 주세요'}
        </Button>
      </div>
    </div>
  );
}
