// src/react/game/views/dribble3d/Solo.tsx — 입장 화면의 3D 드리블 훈련장 혼자 연습 칸(2026-11-07 6단계): 코스 고르기 → 시작.
// 2D 칸과 같은 모양·말, 코스마다 기기 최고 기록은 3D 따로(dribble3BestKey), 메달 시간은 3D 것.
import { Button, Segmented } from 'antd';
import { useEffect, useState } from 'react';
import { COURSES } from '../../../../lib/games/dribble2d';
import type { Dr3Config } from '../../../../lib/games/dribble3d';
import { buildDribble3, course3 } from '../../../../lib/games/dribble3d';
import type { SoloProps } from '../types';
import { readBest } from '../best';
import { secText } from '../dribble2d/render';
import { CONTROLS_3D } from '../match3d/Solo';

export const dribble3BestKey = (courseId: string): string => `wfc:game:dribble3d-best:${courseId}`;

export function Solo({ open, cardRef, players, num, onStart }: SoloProps<Dr3Config>) {
  const [course, setCourse] = useState(0);
  const [bests, setBests] = useState<(number | null)[]>([]);
  useEffect(() => { if (open) setBests(COURSES.map((c) => readBest(dribble3BestKey(c.id)))); }, [open]);
  const me = num === null ? null : players.find((p) => p.num === num) ?? null;
  if (!open) return null;
  const c = course3(course), best = bests[course] ?? null;
  return (
    <div className="card" ref={cardRef}>
      <div className="card-head"><h2>혼자 연습 <span className="muted">내 기록과 겨루기</span></h2></div>
      <div className="game-opts">
        <label className="game-opt"><span className="muted">코스</span>
          <Segmented<number> value={course} onChange={setCourse} options={COURSES.map((k, i) => ({ value: i, label: k.name }))} /></label>
        <p className="muted dr-sum">문 {c.gates.length}개 · 금 {c.medals[0]}초 · 은 {c.medals[1]}초 · 동 {c.medals[2]}초{best !== null ? ` · 내 최고 ${secText(best)}` : ''}</p>
      </div>
      <p className="muted game-hint">공을 몰고 금색 문을 차례대로 지나 결승선까지 · 문을 건너뛰면 그 문으로 돌아가야 합니다 · 콘을 치면 1초 · 질주하며 급히 꺾으면 공이 풀립니다</p>
      <p className="muted game-hint">{CONTROLS_3D} · 시점은 ✕ 아래 버튼(처음엔 뒤에서)</p>
      <div className="game-start">
        <Button type="primary" size="large" disabled={!me} onClick={() => {
          if (!me) return;
          onStart(() => ({ config: buildDribble3([{ num: me.num, name: me.name }], course, players), seed: (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0, myId: 0 }));
        }}>
          {me ? '시작' : '내 선수를 골라 주세요'}
        </Button>
      </div>
    </div>
  );
}
