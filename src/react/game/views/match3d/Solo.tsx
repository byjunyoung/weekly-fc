// src/react/game/views/match3d/Solo.tsx — 입장 화면의 3D 경기 혼자 하기 칸(2026-11-07 게임 묶음 4단계). 예전 /game3d/ 설정 화면(Game3DApp)의 시간·시점에
// 방과 같은 인원·점수 제한을 더했다. 닫혀도 컴포넌트는 남아 고른 값을 기억한다(2D 혼자 연습 칸과 같다).
import { Button, Segmented } from 'antd';
import { useEffect, useState } from 'react';
import type { MatchConfig } from '../../../../lib/game3d/sim';
import type { Outfield } from '../../../../lib/games/match3d-room';
import type { SoloProps } from '../types';
import { SCORE_LIMITS } from '../match2d/options';
import { buildSolo3d, soloBlocked, type Req3d } from './solo-setup';
import { readView, saveView, VIEW_LABEL, VIEW_MODES, type ViewMode } from './view3d';

/** 조작 안내 — 키 자리는 2026-11-07 "3d 게임은 키를 FC온라인이랑 동일하게 해주면 좋을듯"(이름·동작은 우리 것). 방 화면 controls 와 같은 말. */
export const CONTROLS_3D = 'PC: 방향키로 이동, S 패스 · D 슛(누르고 떼기, 공 없을 땐 태클) · W 스루 · A 로빙 · E 질주 · 폰: 왼쪽을 끌어 이동, 오른쪽 버튼으로 패스·슛';

export function Solo({ open, cardRef, players, num, onStart }: SoloProps<MatchConfig>) {
  const [outfield, setOutfield] = useState<Outfield>(4);
  const [minutes, setMinutes] = useState(3);
  const [scoreLimit, setScoreLimit] = useState(0);
  const [view, setView] = useState<ViewMode>('broadcast');
  useEffect(() => { setView(readView()); }, []);
  const req = (o: Outfield): Req3d | null => (num === null ? null : { num, outfield: o, minutes, scoreLimit });
  const can = (o: Outfield): boolean => { const r = req(o); return !!r && !soloBlocked(r, players); };
  const ok = can(outfield);

  if (!open) return null;
  return (
    <div className="card" ref={cardRef}>
      <div className="card-head"><h2>혼자 하기 <span className="muted">봇과 한 판</span></h2></div>
      <div className="game-opts">
        <label className="game-opt"><span className="muted">인원</span>
          <Segmented<number> value={outfield} onChange={(v) => setOutfield(v as Outfield)}
            options={([2, 3, 4] as const).map((n) => ({ value: n, label: `${n + 1}대${n + 1}`, disabled: num !== null && !can(n) }))} /></label>
        <label className="game-opt"><span className="muted">시간</span>
          <Segmented<number> value={minutes} onChange={setMinutes} options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: `${n}분` }))} /></label>
        <label className="game-opt"><span className="muted">점수 제한</span>
          <Segmented<number> value={scoreLimit} onChange={setScoreLimit} options={SCORE_LIMITS.map((n) => ({ value: n, label: n ? `${n}점` : '없음' }))} /></label>
        <label className="game-opt"><span className="muted">시점</span>
          <Segmented<ViewMode> value={view} onChange={(v) => { setView(v); saveView(v); }} options={VIEW_MODES.map((m) => ({ value: m, label: VIEW_LABEL[m] }))} /></label>
      </div>
      <p className="muted game-hint">{CONTROLS_3D}</p>
      <p className="muted game-hint">골키퍼는 봇이 맡습니다. 1인칭은 ←→ 돌기, ↑↓ 앞뒤 — 보는 쪽으로 패스·슛. 시점은 경기 중에도 ✕ 아래 버튼으로 바꿉니다.</p>
      {num !== null && !ok && <p className="muted">명단이 모자라 이 인원으로는 판을 만들 수 없습니다.</p>}
      <div className="game-start">
        <Button type="primary" size="large" disabled={!ok} onClick={() => { const r = req(outfield); if (r && ok) onStart(() => buildSolo3d(r, players)); }}>
          {num === null ? '내 선수를 골라 주세요' : '시작'}
        </Button>
      </div>
    </div>
  );
}
