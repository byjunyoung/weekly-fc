// src/react/game/views/penalty2d/render.ts — 승부차기 한 프레임(2026-11-07 게임 묶음 2단계). (state, config, layout, 내 조준) 의 함수일 뿐.
// 경기 화면의 조각(선수 원 drawToken·이름표·공·띠)을 그대로 쓰고, 골문 앞 바닥·키퍼의 던진 몸·세기 막대·점수 띠(○●)만 여기서 그린다.
// 조준 표시는 aim 이 null 이 아닐 때만 — 화면(장면)이 "내가 키커일 때"만 넘긴다. 상태에는 조준이 없다.
import type { PenConfig, PenState } from '../../../../lib/games/penalty2d.ts';
import {
  AIM_TICKS, BALL_R, BODY_R, CHARGE_TICKS, DIVE_REACH, GOAL_DEPTH, GOAL_W, POST_R, READY_TICKS, SPOT_Y, STAND_REACH, deviationOf,
} from '../../../../lib/games/penalty2d.ts';
import { TEAM } from '../../teams.ts';
import { F9, F14, GOLD, banner, drawBall, drawName, drawToken, type Sprites } from '../match2d/render.ts';
import { toScreen, type PenLayout } from './layout.ts';

const GRASS_A = '#0f2617', GRASS_B = '#173a23', RUNOFF = '#0b1c13';
const LINE = 'rgba(244, 244, 244, .82)', NET_BG = '#0b0d10', NET = 'rgba(244, 244, 244, .2)';
export const MISS = '#e5484d'; const PENDING = 'rgba(255,255,255,.35)';
const HALF = GOAL_W / 2;

export const OUT_TEXT = { goal: '골!', save: '막았다!', miss: '빗나감', post: '골대!' } as const;

/** 바닥 — 잔디 줄무늬, 골라인, 골 에어리어, 차는 점(spots), 그물. 매 프레임 그려도 가볍다(사각형 몇 개). 프리킥도 쓴다(2026-11-07 3단계). */
export function drawGoalEnd(ctx: CanvasRenderingContext2D, l: PenLayout, spots: readonly { x: number; y: number }[]): void {
  const WX = l.wx, Y0 = l.y0, Y1 = l.y1;
  ctx.fillStyle = RUNOFF; ctx.fillRect(0, 0, l.vw, l.vh);
  const a = toScreen(l, -WX, Y0), b = toScreen(l, WX, Y1);
  const band = 60;
  for (let y = Y0, k = 0; y < Y1; y += band, k++) {
    const s0 = toScreen(l, -WX, y), s1 = toScreen(l, WX, Math.min(Y1, y + band));
    ctx.fillStyle = k % 2 ? GRASS_B : GRASS_A; ctx.fillRect(s0.x, s0.y, s1.x - s0.x, s1.y - s0.y + 0.5);
  }
  const sc = l.scale;
  // 그물
  const n0 = toScreen(l, -HALF, -GOAL_DEPTH);
  ctx.fillStyle = NET_BG; ctx.fillRect(n0.x, n0.y, GOAL_W * sc, GOAL_DEPTH * sc);
  ctx.strokeStyle = NET; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = -HALF; x <= HALF + 0.1; x += 14) { const p = toScreen(l, x, -GOAL_DEPTH), q = toScreen(l, x, 0); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); }
  for (let y = -GOAL_DEPTH; y <= 0.1; y += 14) { const p = toScreen(l, -HALF, y), q = toScreen(l, HALF, y); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); }
  ctx.stroke();
  ctx.strokeStyle = LINE; ctx.lineWidth = Math.max(2, 4 * sc);
  ctx.strokeRect(n0.x, n0.y, GOAL_W * sc, GOAL_DEPTH * sc);
  // 골라인(그림 폭 전체), 골 에어리어, 페널티 점
  const g0 = toScreen(l, -WX, 0), g1 = toScreen(l, WX, 0);
  ctx.beginPath(); ctx.moveTo(g0.x, g0.y); ctx.lineTo(g1.x, g1.y); ctx.stroke();
  const ga = toScreen(l, -HALF - 60, 0);
  ctx.lineWidth = Math.max(1.5, 3 * sc);
  ctx.strokeRect(ga.x, ga.y, (GOAL_W + 120) * sc, 86 * sc);
  ctx.fillStyle = LINE;
  for (const p of spots) { const sp = toScreen(l, p.x, p.y); ctx.beginPath(); ctx.arc(sp.x, sp.y, Math.max(2, 5 * sc), 0, Math.PI * 2); ctx.fill(); }
  // 기둥
  ctx.fillStyle = '#f4f4f4';
  for (const sx of [-1, 1]) { const p = toScreen(l, sx * HALF, 0); ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(2, POST_R * sc), 0, Math.PI * 2); ctx.fill(); }
  // 그린 칸 밖은 어둡게(가로 화면 양옆)
  ctx.fillStyle = 'rgba(0,0,0,.35)';
  if (a.x > 0) { ctx.fillRect(0, 0, a.x, l.vh); ctx.fillRect(b.x, 0, l.vw - b.x, l.vh); }
}

export type PenDrawOpts = {
  me: number | null;
  /** 내 조준(골라인 위 x) — 내가 키커일 때만, 아니면 null. */
  aim: number | null;
  bubbles: { id: number; text: string }[];
};

/** 위 점수 띠 — 편마다 차기 표시(● 골, ✕ 못 넣음, ○ 아직), 가운데 점수. */
function drawBoard(ctx: CanvasRenderingContext2D, st: PenState, config: PenConfig, l: PenLayout, y0: number): void {
  const cx = l.vw / 2;
  ctx.textBaseline = 'top'; ctx.font = `20px ${F9}`; ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
  ctx.fillText(`${st.scored[0]} : ${st.scored[1]}`, cx, y0);
  const marks = (side: 0 | 1): ('goal' | 'no' | 'wait')[] => {
    const mine = st.log.filter((e) => e.side === side).map((e) => (e.out === 'goal' ? 'goal' : 'no') as 'goal' | 'no');
    const n = Math.max(config.kicks, mine.length + (st.phase !== 'end' && st.side === side && st.phase !== 'result' ? 1 : 0));
    const all = [...mine, ...Array.from({ length: Math.max(0, n - mine.length) }, () => 'wait' as const)];
    return all.slice(l.vw < 520 ? -5 : -7);   // 서든데스가 길어지면 최근 것만(폰은 다섯)
  };
  const r = 5, gap = 15;
  for (const side of [0, 1] as const) {
    const m = marks(side);
    const dir = side === 0 ? -1 : 1;
    const start = cx + dir * 42;
    m.forEach((k, i) => {
      // 두 편 모두 왼쪽부터 차례대로 — 주황은 점수 왼쪽에, 흰은 점수 오른쪽에 놓인다.
      const y = y0 + 10, xx = side === 0 ? start - (m.length - 1 - i) * gap - r : start + i * gap + r;
      ctx.beginPath(); ctx.arc(xx, y, r, 0, Math.PI * 2);
      if (k === 'goal') { ctx.fillStyle = GOLD; ctx.fill(); }
      else if (k === 'no') { ctx.strokeStyle = MISS; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(xx - r, y - r); ctx.lineTo(xx + r, y + r); ctx.moveTo(xx + r, y - r); ctx.lineTo(xx - r, y + r); ctx.stroke(); }
      else { ctx.strokeStyle = PENDING; ctx.lineWidth = 1.5; ctx.stroke(); }
    });
    // 편 이름 + 색 칸
    const edge = side === 0 ? start - m.length * gap - 8 : start + m.length * gap + 8;
    ctx.font = `14px ${F14}`; ctx.textAlign = side === 0 ? 'right' : 'left'; ctx.fillStyle = '#fff';
    ctx.fillText(TEAM[side].short, edge + (side === 0 ? -16 : 16), y0 + 3);
    ctx.fillStyle = TEAM[side].color; ctx.fillRect(side === 0 ? edge - 12 : edge, y0 + 4, 12, 12);
  }
}

/** 둘째·셋째 줄 — 몇 번째 차기, 누가 차고 누가 막나(얼굴 + 이름). */
function drawWho(ctx: CanvasRenderingContext2D, st: PenState, config: PenConfig, l: PenLayout, sprites: Sprites, y0: number, me: number | null): void {
  const cx = l.vw / 2;
  const round = Math.floor(st.kickNo / 2) + 1;
  const sd = st.taken[0] >= config.kicks && st.taken[1] >= config.kicks;
  ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.font = `14px ${F14}`; ctx.fillStyle = 'rgba(255,255,255,.75)';
  const head = st.phase === 'end' ? '끝' : sd || round > config.kicks ? `서든데스 · ${TEAM[st.side].short} 차례` : `${round}번째 · ${TEAM[st.side].short} 차례`;
  ctx.fillText(head, cx, y0 + 26);
  if (st.phase === 'end') return;
  const k = config.players[st.kicker], g = config.players[st.keeper];
  const face = 20, y = y0 + 48;
  const name = (i: number): string => `${Array.from(config.players[i].name).slice(0, 5).join('')}${i === me ? '(나)' : ''}`;
  ctx.font = `14px ${F14}`;
  const left = `${name(k.id)} 차기`, right = `${name(g.id)} 막기`;
  const lw = ctx.measureText(left).width, rw = ctx.measureText(right).width;
  const total = face + 4 + lw + 22 + face + 4 + rw;
  let x = cx - total / 2;
  const put = (i: number, text: string, w: number): void => {
    const f = sprites.faces[i];
    if (f) { ctx.imageSmoothingEnabled = false; ctx.drawImage(f, x, y, face, face); }
    else { ctx.fillStyle = '#2a2d33'; ctx.fillRect(x, y, face, face); }
    ctx.strokeStyle = TEAM[config.players[i].side].color; ctx.lineWidth = 2; ctx.strokeRect(x, y, face, face);
    ctx.textAlign = 'left'; ctx.fillStyle = i === me ? GOLD : '#fff'; ctx.fillText(text, x + face + 4, y + 3);
    x += face + 4 + w;
  };
  put(k.id, left, lw);
  ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.textAlign = 'center'; ctx.fillText('→', x + 11, y + 3); x += 22;
  put(g.id, right, rw);
}

/** 키퍼 몸(프리킥도 쓴다) — 던졌거나 누워 있으면 옆으로 길게 늘인 팔, 서 있으면 짧은 팔, 그 위에 얼굴 원(던지는 동안 고리 하양). */
export function drawKeeper(ctx: CanvasRenderingContext2D, l: PenLayout, gk: PenState['gk'], R: number, face: HTMLCanvasElement | null | undefined, jersey: number | undefined, color: string, me: boolean): void {
  const sc = l.scale, gs = toScreen(l, gk.x, gk.y);
  const lying = gk.diveT > 0 || gk.lie > 0;
  const reach = (lying ? DIVE_REACH : STAND_REACH) * sc;
  ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(gs.x, gs.y + R * 0.3, R + reach, R * 0.7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = color; ctx.lineCap = 'round'; ctx.lineWidth = Math.max(5, 12 * sc);
  ctx.beginPath(); ctx.moveTo(gs.x - R - reach + ctx.lineWidth / 2, gs.y); ctx.lineTo(gs.x + R + reach - ctx.lineWidth / 2, gs.y); ctx.stroke();
  ctx.lineCap = 'butt';
  drawToken(ctx, gs, R, face, jersey, color, gk.diveT > 0, me);
}

/** 키커 옆 세기 막대(0..1) — 모두에게 보인다(조준은 아니다). 0.8 넘으면 빨강. */
export function drawPowerBar(ctx: CanvasRenderingContext2D, ks: { x: number; y: number }, R: number, sc: number, p: number): void {
  const bh = Math.max(40, 70 * sc), bw = 10, bx = ks.x + R + 12, by = ks.y - bh / 2;
  ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
  ctx.fillStyle = p > 0.8 ? MISS : GOLD; ctx.fillRect(bx, by + bh * (1 - p), bw, bh * p);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.strokeRect(bx - 2, by - 2, bw + 4, bh + 4);
}

export function drawPenalty(ctx: CanvasRenderingContext2D, st: PenState, config: PenConfig, l: PenLayout, sprites: Sprites, o: PenDrawOpts, dpr: number): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  drawGoalEnd(ctx, l, [{ x: 0, y: SPOT_Y }]);
  const sc = l.scale, R = BODY_R * sc;
  const kTeam = TEAM[config.players[st.kicker].side].color, gTeam = TEAM[config.players[st.keeper].side].color;

  // 내 조준 — 골라인 위 표시 + 공에서 이어지는 점선 + 지금 세기의 흔들림 폭(키커 화면에만).
  if (o.aim !== null && (st.phase === 'ready' || st.phase === 'aim')) {
    const t = toScreen(l, o.aim, 0), bs = toScreen(l, st.ball.x, st.ball.y);
    ctx.strokeStyle = 'rgba(255,206,33,.55)'; ctx.lineWidth = 2; ctx.setLineDash([6, 6]);
    ctx.beginPath(); ctx.moveTo(bs.x, bs.y); ctx.lineTo(t.x, t.y); ctx.stroke(); ctx.setLineDash([]);
    const dev = deviationOf(st.st.charge / CHARGE_TICKS, config.players[st.kicker].perf) * sc;
    ctx.fillStyle = 'rgba(255,206,33,.25)'; ctx.fillRect(t.x - dev, t.y - 5, dev * 2, 10);
    ctx.strokeStyle = GOLD; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(t.x, t.y, 9, 0, Math.PI * 2); ctx.moveTo(t.x - 14, t.y); ctx.lineTo(t.x + 14, t.y); ctx.moveTo(t.x, t.y - 14); ctx.lineTo(t.x, t.y + 14); ctx.stroke();
  }

  // 키퍼 — 던졌거나 누워 있으면 옆으로 길게 늘인 몸(팔), 서 있으면 짧은 팔. 그 위에 얼굴 원.
  const gk = st.gk, gs = toScreen(l, gk.x, gk.y);
  drawKeeper(ctx, l, gk, R, sprites.faces[st.keeper], sprites.jerseys[st.keeper], gTeam, st.keeper === o.me);

  // 키커와 세기 막대(모두에게 보인다 — 조준은 아니다)
  const ks = toScreen(l, st.st.x, st.st.y);
  ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(ks.x, ks.y + R * 0.3, R * 0.95, R * 0.8, 0, 0, Math.PI * 2); ctx.fill();
  drawToken(ctx, ks, R, sprites.faces[st.kicker], sprites.jerseys[st.kicker], kTeam, st.st.held || st.st.kickFlash > 0, st.kicker === o.me);
  if (R >= 8) { drawName(ctx, ks, R, config.players[st.kicker].name, st.kicker === o.me); drawName(ctx, { x: gs.x, y: gs.y - R * 2 - 18 }, R, config.players[st.keeper].name, st.keeper === o.me); }
  if (st.phase === 'aim' || (st.phase === 'flight' && st.phaseTicks < 30)) drawPowerBar(ctx, ks, R, sc, st.phase === 'aim' ? st.st.charge / CHARGE_TICKS : st.power);

  // 공
  const bs = toScreen(l, st.ball.x, st.ball.y);
  ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(bs.x + 2, bs.y + 4, BALL_R * sc, BALL_R * sc * 0.8, 0, 0, Math.PI * 2); ctx.fill();
  drawBall(ctx, bs, Math.max(3.5, BALL_R * sc));

  // 말풍선 — 지금 차는 사람·막는 사람 머리 위에만(다른 사람은 그림에 몸이 없다).
  drawPenBubbles(ctx, st, l, o.bubbles, R);

  // 위 띠 — 점수·차례·누가
  const y0 = l.hud + 6;
  ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(0, 0, l.vw, l.top - 4);
  drawBoard(ctx, st, config, l, y0);
  drawWho(ctx, st, config, l, sprites, y0, o.me);

  // 5초 시계(조준 중) — 위 띠 바로 아래 얇은 막대
  if (st.phase === 'aim') {
    const left = Math.max(0, 1 - st.phaseTicks / AIM_TICKS);
    ctx.fillStyle = 'rgba(255,255,255,.15)'; ctx.fillRect(0, l.top - 4, l.vw, 4);
    ctx.fillStyle = left < 0.3 ? MISS : '#fff'; ctx.fillRect(0, l.top - 4, l.vw * left, 4);
  }

  // 가운데 띠 — 판정, 내 차례 알림, 끝
  const midY = toScreen(l, 0, SPOT_Y * 0.55).y;
  if (st.phase === 'result' && st.outcome) {
    const who = config.players[st.kicker].name;
    banner(ctx, l, midY, OUT_TEXT[st.outcome], st.outcome === 'goal' ? who : st.outcome === 'save' ? config.players[st.keeper].name : '', 54, st.outcome === 'goal' ? GOLD : st.outcome === 'save' ? '#fff' : '#c9ced6');
  } else if (st.phase === 'ready' && st.phaseTicks < READY_TICKS - 6) {
    const mine = st.kicker === o.me ? '내가 찰 차례' : st.keeper === o.me ? '내가 막을 차례' : null;
    if (mine) banner(ctx, l, midY, mine, '', 24, GOLD);
  } else if (st.phase === 'end' && st.winner !== null) {
    banner(ctx, l, midY, st.winner === 'draw' ? '무승부' : `${TEAM[st.winner].short} 승`, `${st.scored[0]} : ${st.scored[1]}`, 54, st.winner === 'draw' ? '#fff' : TEAM[st.winner].color);
  }

  // 아래 안내 — 내 역할의 조작
  const hint = st.phase === 'end' ? '' : st.kicker === o.me ? '←→ 겨누기 · 킥을 누르고 있다가 떼면 슛(오래 누를수록 세고 덜 정확)'
    : st.keeper === o.me ? '←→ 옆걸음 · 킥 = 몸 던지기(그쪽으로, 한 번)' : '';
  if (hint) {
    ctx.font = `14px ${F14}`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.lineJoin = 'round'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.85)';
    // 그린 칸 바로 아래 — 폰에선 오른쪽 아래 킥 버튼(92px)에 가리지 않게 화면 맨 아래보다 위에 둔다.
    const hy = Math.min(toScreen(l, 0, l.y1).y + 22, l.vh - l.bottom + 30);
    // 폰에선 길어서 두 줄로
    const parts = l.vw < 520 ? hint.split(' · ') : [hint];
    parts.forEach((t, i) => { ctx.strokeText(t, l.vw / 2, hy + i * 18); ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillText(t, l.vw / 2, hy + i * 18); });
  }
}

function drawPenBubbles(ctx: CanvasRenderingContext2D, st: PenState, l: PenLayout, bubbles: { id: number; text: string }[], R: number): void {
  if (!bubbles.length) return;
  ctx.font = `14px ${F14}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const b of bubbles) {
    const body = b.id === st.kicker ? st.st : b.id === st.keeper ? st.gk : null;
    if (!body || !b.text) continue;
    const s = toScreen(l, body.x, body.y);
    const w = Math.ceil(ctx.measureText(b.text).width) + 14, h = 24;
    const y = b.id === st.keeper ? s.y + R + 8 : s.y - R - 14 - h;
    const x = Math.min(Math.max(2, s.x - w / 2), l.vw - w - 2);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#000'; ctx.fillText(b.text, x + w / 2, y + h / 2 + 1);
  }
  ctx.textBaseline = 'top';
}
