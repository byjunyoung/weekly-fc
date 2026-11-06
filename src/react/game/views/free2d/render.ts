// src/react/game/views/free2d/render.ts — 자유 훈련장 한 프레임(2026-11-07 게임 묶음 2단계). (state, config, view) 의 함수일 뿐.
// 경기 화면의 조각을 그대로 쓴다 — 바닥(buildField·attachStage), 선수 원(drawToken)·이름표(drawName)·공(drawBall)·띠(banner)·말풍선.
// 다른 것은 셋: 편이 없어 고리 색이 각자 아바타 유니폼 색(봇은 회색), 공이 여러 개, 점수판 대신 "자유 훈련장 · 골 N".
import { avatarSpecFor } from '../../../../lib/avatar.ts';
import { pitchOf } from '../../../../lib/game/sim.ts';
import type { FreeConfig, FreeState } from '../../../../lib/games/free2d.ts';
import { POP_TICKS } from '../../../../lib/games/free2d.ts';
import type { Player } from '../../../../lib/types.ts';
import { F9, F14, GOLD, banner, drawBall, drawName, drawToken, type Field, type Sprites } from '../match2d/render.ts';
import { toScreen, type View } from '../match2d/view.ts';

/** 봇 고리 — 사람과 헷갈리지 않게 흐린 회색. */
export const BOT_RING = '#8a8f98';
/** 유니폼 색이 너무 어두우면(잔디 위에서 안 보인다) 이 색으로. */
const NEUTRAL_RING = '#c9ced6';

/** 선수마다 고리 색 — 사람은 아바타 유니폼 색, 봇은 회색. 어두운 색은 밝은 중립색으로. 순수(테스트가 부른다). */
export function ringColors(config: FreeConfig, roster: Player[]): string[] {
  return config.players.map((p) => {
    if (p.bot) return BOT_RING;
    const r = roster.find((x) => x.num === p.num);
    const kit = r ? avatarSpecFor(r.num, r.avatar).kit : '';
    if (!/^#[0-9a-fA-F]{6}$/.test(kit)) return NEUTRAL_RING;
    const n = parseInt(kit.slice(1), 16), lum = 0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
    return lum < 70 ? NEUTRAL_RING : kit;
  });
}

export function drawFree(ctx: CanvasRenderingContext2D, st: FreeState, config: FreeConfig, view: View, field: Field, sprites: Sprites, rings: string[],
  o: { dpr: number; topInset: number; me: number | null }): void {
  const P = pitchOf(config.field);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  const c0 = toScreen(view, 0, 0);
  ctx.drawImage(field.canvas, Math.round(c0.x * o.dpr - field.canvas.width / 2), Math.round(c0.y * o.dpr - field.canvas.height / 2));
  ctx.setTransform(o.dpr, 0, 0, o.dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;

  const R = P.playerR * view.scale;
  const ballR = Math.max(P.ballR * view.scale, 3.5);
  // 그림자(몸·공 모두 아래)
  ctx.fillStyle = 'rgba(0, 0, 0, .35)';
  for (const b of st.players) { const s = toScreen(view, b.x, b.y); ctx.beginPath(); ctx.ellipse(s.x, s.y + R * 0.28, R * 0.95, R * 0.8, 0, 0, Math.PI * 2); ctx.fill(); }
  const balls = st.balls.map((b) => toScreen(view, b.x, b.y));
  for (const bs of balls) { ctx.beginPath(); ctx.ellipse(bs.x + ballR * 0.2, bs.y + ballR * 0.45, ballR, ballR * 0.8, 0, 0, Math.PI * 2); ctx.fill(); }

  const order = st.players.map((b, i) => ({ i, s: toScreen(view, b.x, b.y) })).sort((a, b) => a.s.y - b.s.y);
  for (const { i, s } of order) {
    const b = st.players[i];
    drawToken(ctx, s, R, sprites.faces[i], sprites.jerseys[i], rings[i] ?? NEUTRAL_RING, b.kicking || b.kickFlash > 0, i === o.me);
  }
  if (R >= 8) for (const { i, s } of order) drawName(ctx, s, R, config.players[i].name, i === o.me);
  for (const bs of balls) drawBall(ctx, bs, ballR);

  // "골!" — 들어간 골대 앞에 1초 동안 떠오르며 옅어진다.
  for (const p of st.pops) {
    const age = st.tick - p.tick;
    if (age < 0 || age >= POP_TICKS) continue;
    const at = toScreen(view, p.side * (P.w / 2 - 60), p.y);
    ctx.globalAlpha = 1 - age / POP_TICKS;
    ctx.font = `30px ${F9}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round'; ctx.lineWidth = 4; ctx.strokeStyle = '#000';
    ctx.strokeText('골!', at.x, at.y - age * 0.6); ctx.fillStyle = GOLD; ctx.fillText('골!', at.x, at.y - age * 0.6);
    ctx.globalAlpha = 1;
  }

  // 위 한 줄 — 무엇을 하는 곳인지와 들어간 골 수(점수가 아니라 다 같이 센 수).
  const y0 = o.topInset + 6;
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.font = `20px ${F9}`; ctx.fillStyle = '#fff';
  ctx.fillText('자유 훈련장', view.vw / 2, y0);
  ctx.font = `14px ${F14}`; ctx.fillStyle = 'rgba(255,255,255,.75)';
  ctx.fillText(`공 ${st.balls.length}개 · 들어간 골 ${st.goals}`, view.vw / 2, y0 + 24);
  if (st.tick < 150) banner(ctx, view, view.oy - Math.min(view.vh, view.vw) * 0.12, '마음대로 차 보세요', '', 24, '#fff');
}
