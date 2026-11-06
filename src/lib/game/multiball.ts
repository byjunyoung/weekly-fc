// src/lib/game/multiball.ts — 공 여러 개의 한 틱(2026-11-07 게임 묶음 — 자유 훈련장). 순수.
// 설계: docs/superpowers/specs/2026-11-07-games-program-design.md §3.3 — "경기장에 공 여러 개(사람 수 + 2), 골대 둘."
//
// 경기(sim.ts 의 step)는 공 하나짜리 그대로 두고, 여기서 sim.ts 가 내보낸 조각(몸 움직임 controlBody·킥 tryKick·충돌 셋·마지막 안전망)을
// 같은 순서로 이어 붙여 공을 여럿으로 넓힌다. 그래서 몸·공·킥의 느낌은 경기와 같고, 공끼리 부딪치는 것 하나만 새로 더했다.
// 시계·난수·삼각함수를 쓰지 않는다(사칙연산과 sqrt 만 — sim.ts 와 같은 약속).
import type { Body, Geo, Input, KickBody } from './sim.ts';
import { PHYS, collideCircles, collidePoint, collideSegment, controlBody, guardBall, guardPlayer, tryKick } from './sim.ts';
import type { Perf } from './stats.ts';

/** 공끼리의 반발 계수 — 공과 벽(0.5)보다 조금 더 튄다(가죽끼리라 몸에 맞을 때보다 덜 먹힌다). 이 값만 이 파일의 것. */
export const E_BALL_BALL = 0.7;

/** 한 틱. players·balls 를 그 자리에서 바꾼다(부르는 쪽이 복사본을 넘긴다). inputs[i] = i 번 몸의 입력(없으면 손 뗌).
 *  킥은 닿는 거리 안의 가장 가까운 공 하나에만 나간다. 돌려주는 값 = 이번 틱에 찬 몸들의 번호. */
export function stepBodies(players: KickBody[], perfs: Perf[], balls: Body[], inputs: (Input | undefined)[], g: Geo): number[] {
  const R = g.pitch.playerR, BR = g.pitch.ballR, postR = g.pitch.postR;
  const n = players.length, m = balls.length;
  const mass = perfs.map((p) => PHYS.PLAYER_MASS * p.mass);

  // 1) 입력 → 속도(경기와 같은 controlBody).
  for (let i = 0; i < n; i++) controlBody(players[i], perfs[i], inputs[i], true);

  // 2) 킥 — 가장 가까운 공 하나.
  const kicked: number[] = [];
  for (let i = 0; i < n; i++) {
    const p = players[i], inp = inputs[i];
    if (!inp || !inp.kick || p.kickCooldown > 0) continue;
    let best = -1, bestD2 = Infinity;
    for (let j = 0; j < m; j++) {
      const dx = balls[j].x - p.x, dy = balls[j].y - p.y, d2 = dx * dx + dy * dy;
      if (d2 < bestD2) { bestD2 = d2; best = j; }
    }
    if (best >= 0 && tryKick(p, balls[best], perfs[i].kick, R, BR, 1)) kicked.push(i);
  }

  // 3) 이동과 충돌 — 경기와 같은 쪼개기(SUBSTEPS)와 순서. 공끼리를 몸-공 다음에 더했다.
  for (let k = 0; k < PHYS.SUBSTEPS; k++) {
    for (const b of balls) { b.x += b.vx * PHYS.SUB_DT; b.y += b.vy * PHYS.SUB_DT; }
    for (const p of players) { p.x += p.vx * PHYS.SUB_DT; p.y += p.vy * PHYS.SUB_DT; }

    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++)
        collideCircles(players[i], R, mass[i], players[j], R, mass[j], PHYS.E_PLAYER_PLAYER);
    for (let i = 0; i < n; i++)
      for (let j = 0; j < m; j++) collideCircles(players[i], R, mass[i], balls[j], BR, PHYS.BALL_MASS, PHYS.E_PLAYER_BALL);
    for (let a = 0; a < m; a++)
      for (let b = a + 1; b < m; b++) collideCircles(balls[a], BR, PHYS.BALL_MASS, balls[b], BR, PHYS.BALL_MASS, E_BALL_BALL);

    for (const b of balls) {
      for (const w of g.ballWalls) collideSegment(b, BR, w, PHYS.E_BALL_WALL);
      for (const [px, py] of g.posts) collidePoint(b, BR, px, py, postR, PHYS.E_BALL_POST);
    }
    // 공이 몸과 벽 사이에 끼면 공을 못 움직이는 것으로 보고 몸을 비킨다(경기와 같은 규칙, 공마다).
    for (const p of players) {
      for (const b of balls) {
        const dx = p.x - b.x, dy = p.y - b.y;
        const d2 = dx * dx + dy * dy, min = R + BR;
        if (d2 < min * min) {
          const d = Math.sqrt(d2);
          const nx = d > 1e-6 ? dx / d : 0, ny = d > 1e-6 ? dy / d : 1;
          p.x = b.x + nx * min; p.y = b.y + ny * min;
        }
      }
    }
    for (const p of players) {
      for (const w of g.playerWalls) collideSegment(p, R, w, PHYS.E_PLAYER_WALL);
      for (const [px, py] of g.posts) collidePoint(p, R, px, py, postR, PHYS.E_PLAYER_WALL);
    }
  }

  // 4) 공 구르기 감속·속도 상한·멈춤, 마지막 안전망(경기와 같은 값).
  const keep = 1 - PHYS.BALL_DRAG * PHYS.DT;
  for (const b of balls) {
    b.vx *= keep; b.vy *= keep;
    const sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
    if (sp > PHYS.BALL_MAX_SPEED) { b.vx *= PHYS.BALL_MAX_SPEED / sp; b.vy *= PHYS.BALL_MAX_SPEED / sp; }
    else if (sp < PHYS.BALL_REST_SPEED) { b.vx = 0; b.vy = 0; }
    guardBall(b, g);
  }
  for (const p of players) guardPlayer(p, g);
  return kicked;
}
