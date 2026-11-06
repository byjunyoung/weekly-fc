// src/react/game3d/sfx3d.ts — 3D 시제품의 소리 낼 사건 찾기(2026-11-07 "3d도 당연히 효과음 있어야지 두 모드 다 일관성 갖추게해").
// 2D 의 sfx-detect.ts 와 같은 방식이다 — 이어진 두 상태를 비교하는 순수 함수, 경기 계산은 소리를 모른다.
// 소리 자체는 2D 와 같은 모듈(src/react/game/sfx.ts)이 낸다: 골·휘슬·킥·튕김은 두 모드가 똑같이 들린다.
// 3D 에만 있는 것(슛 세기·땅 튕김·골키퍼·태클)은 같은 모듈에 종류를 몇 개 더했다.
import type { Sfx } from '../game/sfx.ts';
import { RULES3D, PITCH3D, type MatchConfig, type MatchState } from '../../lib/game3d/sim.ts';

/** 땅에 떨어질 때 세로 속도(m/s)가 이보다 커야 튕김 소리 — 낮게 통통 구르는 건 조용히. */
const GROUND_MIN_VZ = 2.2;
/** 벽·기둥·몸에 꺾일 때 공 속도(m/s)가 이보다 커야 소리 — 느리게 굴러가 닿는 건 조용히. */
const HIT_MIN_SPEED = 4;
/** 이 속도(m/s)에서 튕김 소리가 가장 크다. */
const HIT_FULL_SPEED = 26;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

export function detectSfx3d(prev: MatchState | null, next: MatchState, config: MatchConfig): Sfx[] {
  if (!prev || prev === next) return [];
  const out: Sfx[] = [];
  if (next.score[0] + next.score[1] > prev.score[0] + prev.score[1]) out.push({ kind: 'goal', vol: 1 });
  if (next.phase === 'end' && prev.phase !== 'end') out.push({ kind: 'end', vol: 1 });
  // 킥오프 휘슬 — 경기 시작(첫 틱)과 골 뒤 재개. 3D 킥오프는 차는 사람이 공 앞에 서 있어 한 틱 만에 지나가기도 한다.
  if ((next.phase === 'kickoff' && prev.phase !== 'kickoff') || (prev.tick === 0 && next.tick === 1)) out.push({ kind: 'whistle', vol: 0.8 });

  // 킥 — lastKick 이 새로 생겼다. 패스는 2D 킥과 같은 소리(조금 작게), 슛은 모은 만큼 크게.
  const k = next.lastKick;
  const kicked = !!k && (!prev.lastKick || prev.lastKick.tick !== k.tick || prev.lastKick.by !== k.by);
  if (kicked && k) {
    if (k.kind === 'shot') {
      const c = clamp01((prev.players[k.by]?.charge ?? 0) / RULES3D.chargeTicks);
      out.push({ kind: 'shot', vol: 0.45 + 0.55 * c });
    } else out.push({ kind: 'kick', vol: 0.7 });
  }

  // 골키퍼 — 잡기(흘러오던 공이 골키퍼 발밑/손으로)와 쳐내기(골키퍼가 닿았고 공 길이 확 꺾였다)
  const caught = next.owner !== null && next.owner !== prev.owner && prev.owner === null && config.players[next.owner]?.gk;
  if (caught) out.push({ kind: 'catch', vol: clamp01(Math.sqrt(prev.ball.vx ** 2 + prev.ball.vy ** 2) / 16 + 0.4) });

  // 빼앗기 — 태클이든 몸싸움이든 공이 상대 편으로(또는 흘러나왔다) — 빼앗기 수가 늘었거나 태클 회복이 새로 시작되며 공을 가져왔다
  const stole = next.count.steals[0] + next.count.steals[1] > prev.count.steals[0] + prev.count.steals[1];
  const bumped = prev.owner !== null && next.owner === null && next.stealLock > prev.stealLock;
  if (stole || bumped) out.push({ kind: 'tackle', vol: stole ? 0.9 : 0.6 });

  // 튕김 — 차지 않았고 아무도 안 가진 공이 땅·벽·기둥·몸에 맞았다. 빠를수록 크게, 느린 구르기는 조용히.
  if (!kicked && !caught && prev.owner === null && next.owner === null && (next.phase === 'play' || next.phase === 'goal')) {
    const a = prev.ball, b = next.ball;
    const parried = next.players.some((p, i) => config.players[i]?.gk && p.noTouch > (prev.players[i]?.noTouch ?? 0));
    if (a.vz < 0 - GROUND_MIN_VZ && b.vz > 0 && b.z < PITCH3D.ballR + 0.3) out.push({ kind: 'bounce', vol: clamp01((0 - a.vz) / 12) });
    else {
      const sa = Math.sqrt(a.vx * a.vx + a.vy * a.vy), sb = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      const turned = sa > HIT_MIN_SPEED && (sb < 0.5 || (a.vx * b.vx + a.vy * b.vy) / (sa * sb) < 0.5);
      if (turned) out.push({ kind: parried ? 'catch' : 'bounce', vol: clamp01(sa / HIT_FULL_SPEED + (parried ? 0.3 : 0)) });
    }
  }
  return out;
}
