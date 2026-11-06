// src/react/game/views/match2d/Solo.tsx — 입장 화면의 2D 경기 혼자 연습 칸(2026-11-06). Entry.tsx 에 있던 것을 그대로 옮겼다(2026-11-07 게임 묶음 —
// 혼자 연습 설정이 게임마다의 것이 되어서). 닫혀도 컴포넌트는 남아 고른 값을 기억한다(예전처럼 칸을 닫았다 열어도 그대로).
// 사용자: "2단계 온라인으로 넘어가자", "PC 모바일 둘다 최적화", "그리고 봇도 선수를 고를 수 있게 해줘".
import { Button, Segmented } from 'antd';
import { useEffect, useState } from 'react';
import type { BotPicks } from '../../../../lib/game/room';
import { updatePicks } from '../../../../lib/game/room';
import type { FieldChoice } from '../../../../lib/games/match2d-room';
import type { MatchConfig } from '../../../../lib/game/sim';
import { BotPickModal, BotSlot } from '../../BotSlot';
import type { SoloProps } from '../types';
import { FIELD_OPTIONS, SCORE_LIMITS } from './options';
import { buildSoloMatch, type Req } from './solo-setup';
import { maxPerSide } from './view';

// 혼자 연습에서 마지막으로 고른 봇(우리 편·상대) — "그리고 봇도 선수를 고를 수 있게 해줘". 모양이 틀리면 전부 무작위로.
const SOLO_BOTS_KEY = 'wfc:game:solo-bots';
function readSoloBots(): BotPicks {
  try {
    const v = JSON.parse(localStorage.getItem(SOLO_BOTS_KEY) ?? 'null') as unknown;
    const ok = (l: unknown): l is number[] => Array.isArray(l) && l.length <= 6 && l.every((n) => Number.isInteger(n) && n > 0);
    if (Array.isArray(v) && v.length === 2 && ok(v[0]) && ok(v[1])) return [v[0], v[1]];
  } catch { /* 아래로 */ }
  return [[], []];
}
function saveSoloBots(p: BotPicks): void {
  try { localStorage.setItem(SOLO_BOTS_KEY, JSON.stringify(p)); } catch { /* 저장 못 해도 판은 할 수 있다 */ }
}

export function Solo({ open, cardRef, players, num, onStart }: SoloProps<MatchConfig>) {
  const max = maxPerSide(players.length);
  const [perSide, setPerSide] = useState<Req['perSide']>(3);
  const [field, setField] = useState<FieldChoice>('auto');
  const [bots, setBots] = useState<BotPicks>([[], []]);
  const [botEdit, setBotEdit] = useState<{ side: 0 | 1; slot: number } | null>(null);
  useEffect(() => { setBots(readSoloBots()); }, []);
  const [minutes, setMinutes] = useState(3);
  const [scoreLimit, setScoreLimit] = useState<number>(0);

  const per = Math.min(perSide, Math.max(1, max)) as Req['perSide'];
  const ok = num !== null && max >= 1;
  // 내 선수는 봇으로 못 고른다 — 내 선수를 바꿔 겹치게 되면 그 자리는 보여 주지도, 쓰지도 않는다(pickLineup 도 건너뛴다).
  const soloBots: BotPicks = [bots[0].filter((n) => n !== num), bots[1].filter((n) => n !== num)];
  const byNum = new Map(players.map((p) => [p.num, p]));
  const editNum = botEdit ? soloBots[botEdit.side][botEdit.slot] ?? null : null;
  const botHeld = new Set<number>([...(num !== null ? [num] : []), ...soloBots[0], ...soloBots[1]].filter((n) => n !== editNum));
  const setBot = (side: 0 | 1, slot: number, n: number | null): void => {
    const next = updatePicks(soloBots, side, slot, n, (x) => x !== num && byNum.has(x));
    if (next !== soloBots) { setBots(next); saveSoloBots(next); }
  };
  const botRow = (side: 0 | 1, count: number, label: string) => (
    <div className="game-botrow" role="group" aria-label={`${label} 봇`}>
      <span className="muted game-botrow-label">{label}</span>
      {count === 0 ? <span className="muted">봇 없음(나 혼자)</span> : Array.from({ length: count }, (_, i) => {
        const n = soloBots[side][i];
        return <BotSlot key={i} label={`${label} 봇 ${i + 1}`} player={n === undefined ? null : byNum.get(n) ?? null} onClick={() => setBotEdit({ side, slot: i })} />;
      })}
    </div>
  );

  return (
    <>
      {open && (
        <div className="card" ref={cardRef}>
          <div className="card-head"><h2>혼자 연습 <span className="muted">봇과 한 판</span></h2></div>
          <div className="game-opts">
            <label className="game-opt"><span className="muted">인원</span>
              <Segmented<number> value={per} onChange={(v) => setPerSide(v as Req['perSide'])}
                options={[1, 2, 3, 4, 5, 6].map((n) => ({ value: n, label: `${n}대${n}`, disabled: n > max }))} /></label>
            {/* 봇으로 뛸 선수 — 비워 두면 무작위. 사용자: "그리고 봇도 선수를 고를 수 있게 해줘". */}
            <div className="game-botrows">
              {botRow(0, per - 1, '우리 편')}
              {botRow(1, per, '상대')}
            </div>
            <label className="game-opt"><span className="muted">경기장</span>
              <Segmented<FieldChoice> value={field} onChange={setField} options={FIELD_OPTIONS} /></label>
            <label className="game-opt"><span className="muted">시간</span>
              <Segmented<number> value={minutes} onChange={setMinutes} options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: `${n}분` }))} /></label>
            <label className="game-opt"><span className="muted">점수 제한</span>
              <Segmented<number> value={scoreLimit} onChange={setScoreLimit} options={SCORE_LIMITS.map((n) => ({ value: n, label: n ? `${n}점` : '없음' }))} /></label>
          </div>
          <p className="muted game-hint">PC: 방향키·WASD로 이동, 스페이스나 Shift로 킥 · 폰: 왼쪽을 끌어 이동, 오른쪽 버튼으로 킥</p>
          {max < 1 && <p className="muted">명단이 두 명은 있어야 판을 만들 수 있습니다.</p>}
          <div className="game-start">
            <Button type="primary" size="large" disabled={!ok} onClick={() => {
              if (!ok) return;
              const req: Req = { num, perSide: per, minutes, scoreLimit, field, botPicks: soloBots };
              onStart(() => buildSoloMatch(req, players));
            }}>
              {ok ? '시작' : '내 선수를 골라 주세요'}
            </Button>
          </div>
        </div>
      )}
      <BotPickModal open={!!botEdit} title={botEdit ? `${botEdit.side === 0 ? '우리 편' : '상대'} 봇 ${botEdit.slot + 1}` : ''}
        players={players} value={editNum} held={botHeld}
        onPick={(n) => { if (botEdit) setBot(botEdit.side, botEdit.slot, n); setBotEdit(null); }}
        onClose={() => setBotEdit(null)} />
    </>
  );
}
