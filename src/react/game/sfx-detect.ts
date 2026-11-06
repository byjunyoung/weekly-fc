// 소리 낼 사건 찾기 — 이어진 두 상태를 비교한다(순수). 혼자·방장·손님 어디서나 "그리는 상태"만 있으면 된다.
// 2026-11-07 "효과음도 넣어야지". 경기 계산(sim)에는 소리를 모르게 두고, 화면 쪽에서 상태 변화로 알아낸다.
import type { MatchState } from '../../lib/game/sim.ts';

// move·confirm 은 경기가 아니라 선수 선택 화면의 작은 소리(2026-11-07 "약간 옛날 오락실게임에서 고르듯이") — 여기서 찾지 않고 화면이 직접 낸다.
/** shot·catch·tackle 은 3D 가 쓴다(src/react/game3d/sfx3d.ts) — 2D 는 안 낸다. 같은 모듈이라 골·휘슬·킥·튕김은 두 모드가 같은 소리다. */
export type Sfx = { kind: 'kick' | 'bounce' | 'goal' | 'whistle' | 'end' | 'move' | 'confirm' | 'shot' | 'catch' | 'tackle'; vol: number };

/** 공 속도(단위/초)가 이 이상일 때만 튕김 소리 — 굴러가다 살짝 닿는 건 조용히. */
const BOUNCE_MIN_SPEED = 140;

export function detectSfx(prev: MatchState | null, next: MatchState): Sfx[] {
  if (!prev || prev === next) return [];
  const out: Sfx[] = [];
  if (next.score[0] + next.score[1] > prev.score[0] + prev.score[1]) out.push({ kind: 'goal', vol: 1 });
  if (next.phase === 'end' && prev.phase !== 'end') out.push({ kind: 'end', vol: 1 });
  // 킥오프 휘슬 — 경기 시작과 골 뒤 재개. 처음 상태(틱 0 근처)에서도 한 번 울린다.
  if (next.phase === 'kickoff' && prev.phase !== 'kickoff') out.push({ kind: 'whistle', vol: 0.8 });
  // 킥 — 누군가의 쿨다운이 새로 생겼다(차는 순간에만 0 에서 올라간다).
  let kicked = false;
  for (let i = 0; i < next.players.length; i++) {
    const a = prev.players[i], b = next.players[i];
    if (a && b && b.kickCooldown > a.kickCooldown) kicked = true;
  }
  if (kicked) out.push({ kind: 'kick', vol: 1 });
  // 튕김 — 킥이 아닌데 공의 진행 방향이 확 꺾였다(벽·기둥·몸). 빠를수록 크게.
  if (!kicked && next.phase === 'play') {
    const ax = prev.ball.vx, ay = prev.ball.vy, bx = next.ball.vx, by = next.ball.vy;
    const sa = Math.sqrt(ax * ax + ay * ay), sb = Math.sqrt(bx * bx + by * by);
    if (sa > BOUNCE_MIN_SPEED && sb > 1 && (ax * bx + ay * by) / (sa * sb) < 0.5) out.push({ kind: 'bounce', vol: Math.min(1, sa / 700) });
  }
  return out;
}
