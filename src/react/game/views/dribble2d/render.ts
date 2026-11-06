// src/react/game/views/dribble2d/render.ts — 드리블 레인 한 프레임(2026-11-07 3단계). (state, config, view) 의 함수일 뿐.
// 내 레인만 그린다(폰 세로면 레인을 세워 그리고 내 선수를 따라간다). 다른 사람은 내 레인 위의 흐린 "유령"과 왼쪽 위 순위 줄로 —
// 레인끼리 부딪치지 않으니 같은 코스 위에 겹쳐 보여 주면 나란히 달리는 느낌이 산다.
import type { Course, DrConfig, DrState } from '../../../../lib/games/dribble2d.ts';
import { CONE_R, COUNT_TICKS, LX, LY, courseCones, courseOf, drPlaces, drRanking, gateCones, laneTime, medalOf } from '../../../../lib/games/dribble2d.ts';
import { pitchOf } from '../../../../lib/game/sim.ts';
import { F9, F14, GOLD, banner, drawBall, drawName, drawToken, type Sprites } from '../match2d/render.ts';
import { toScreen, type View } from '../match2d/view.ts';

const GRASS_A = '#0f2617', GRASS_B = '#173a23', LINE = 'rgba(244, 244, 244, .82)';
const CONE = '#f08a24', CONE_DONE = 'rgba(240, 138, 36, .35)', CONE_DOWN = '#6b7078';
export const MEDAL = [{ name: '금', color: '#ffce21' }, { name: '은', color: '#c9ced6' }, { name: '동', color: '#cd8a4f' }] as const;
const RING = '#ffce21', GHOST_RING = '#c9ced6';

/** 초 → "12.3초". */
export const secText = (s: number): string => `${s.toFixed(1)}초`;

function drawLane(ctx: CanvasRenderingContext2D, v: View, c: Course): void {
  // 잔디(레인 길이 방향 줄무늬) + 테두리
  const band = 100;
  for (let x = -LX, k = 0; x < LX; x += band, k++) {
    const a = toScreen(v, x, -LY), b = toScreen(v, Math.min(LX, x + band), LY);
    ctx.fillStyle = k % 2 ? GRASS_B : GRASS_A;
    ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x) + 0.5, Math.abs(b.y - a.y) + 0.5);
  }
  const corners = [toScreen(v, -LX, -LY), toScreen(v, LX, -LY), toScreen(v, LX, LY), toScreen(v, -LX, LY)];
  ctx.strokeStyle = LINE; ctx.lineWidth = Math.max(2, 3 * v.scale);
  ctx.beginPath(); corners.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); ctx.stroke();
  // 결승선 — 흑백 칸
  const f = c.finish, cell = 20;
  for (let y = -LY, k = 0; y < LY; y += cell, k++) for (let j = 0; j < 2; j++) {
    const x0 = f.x + (j - 1) * cell * 0.5 * -f.dir;
    const a = toScreen(v, x0, y), b = toScreen(v, x0 + cell * 0.5, y + cell);
    ctx.fillStyle = (k + j) % 2 ? '#111' : '#f4f4f4';
    ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
  }
  // 출발 표시
  const s0 = toScreen(v, c.start.x, -LY), s1 = toScreen(v, c.start.x, LY);
  ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 2; ctx.setLineDash([6, 6]);
  ctx.beginPath(); ctx.moveTo(s0.x, s0.y); ctx.lineTo(s1.x, s1.y); ctx.stroke(); ctx.setLineDash([]);
}

/** 콘과 문 — 다음 문은 금색 점선과 지나는 쪽 화살표, 지난 문은 흐리게, 넘어진 콘은 회색으로 누운 모양. */
function drawCones(ctx: CanvasRenderingContext2D, v: View, c: Course, gate: number, hit: number): void {
  const r = Math.max(3, CONE_R * v.scale);
  c.gates.forEach((g, i) => {
    if (i !== gate) return;
    const [a, b] = gateCones(g), pa = toScreen(v, a.x, a.y), pb = toScreen(v, b.x, b.y);
    ctx.strokeStyle = 'rgba(255,206,33,.8)'; ctx.lineWidth = 2; ctx.setLineDash([5, 5]);
    ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke(); ctx.setLineDash([]);
    // 화살표 — 문 가운데에서 지나는 쪽으로
    const m = toScreen(v, g.x, g.y), t = toScreen(v, g.x + g.px * 34, g.y + g.py * 34);
    const dx = t.x - m.x, dy = t.y - m.y, len = Math.sqrt(dx * dx + dy * dy) || 1, ux = dx / len, uy = dy / len, s = Math.max(6, 9 * v.scale);
    ctx.fillStyle = GOLD;
    ctx.beginPath(); ctx.moveTo(t.x, t.y); ctx.lineTo(t.x - ux * s - uy * s * 0.7, t.y - uy * s + ux * s * 0.7); ctx.lineTo(t.x - ux * s + uy * s * 0.7, t.y - uy * s - ux * s * 0.7); ctx.closePath(); ctx.fill();
  });
  const cones = courseCones(c), gateConeCount = c.gates.length * 2;
  cones.forEach((k, j) => {
    const p = toScreen(v, k.x, k.y);
    if (hit & (1 << j)) {
      ctx.fillStyle = CONE_DOWN; ctx.beginPath(); ctx.ellipse(p.x, p.y, r * 1.5, r * 0.6, 0.6, 0, Math.PI * 2); ctx.fill();
      return;
    }
    const done = j < gateConeCount && Math.floor(j / 2) < gate;
    ctx.fillStyle = done ? CONE_DONE : CONE;
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = done ? 'rgba(255,255,255,.3)' : '#fff'; ctx.beginPath(); ctx.arc(p.x, p.y, r * 0.4, 0, Math.PI * 2); ctx.fill();
  });
}

export type DrDrawOpts = { me: number | null; lane: number; dpr: number; topInset: number; bubbles: { id: number; text: string }[]; popAt: number; best: number | null };

export function drawDribble(ctx: CanvasRenderingContext2D, st: DrState, config: DrConfig, v: View, sprites: Sprites, o: DrDrawOpts): void {
  ctx.setTransform(o.dpr, 0, 0, o.dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, v.vw, v.vh);
  const c = courseOf(config.course), P = pitchOf('M');
  const me = st.lanes[o.lane];
  if (!me) return;
  drawLane(ctx, v, c);
  drawCones(ctx, v, c, me.gate, me.hit);
  const R = P.playerR * v.scale, BR = Math.max(3.5, P.ballR * v.scale);
  // 유령 — 다른 레인의 선수(흐리게, 공은 안 그린다)
  st.lanes.forEach((l, i) => {
    if (i === o.lane) return;
    const s = toScreen(v, l.p.x, l.p.y);
    ctx.globalAlpha = 0.38;
    drawToken(ctx, s, R, sprites.faces[i], sprites.jerseys[i], GHOST_RING, false, false);
    ctx.globalAlpha = 0.6;
    if (R >= 8) drawName(ctx, s, R, config.players[i].name, false);
    ctx.globalAlpha = 1;
  });
  // 내 레인의 몸·공
  const ps = toScreen(v, me.p.x, me.p.y), bs = toScreen(v, me.b.x, me.b.y);
  ctx.fillStyle = 'rgba(0,0,0,.35)';
  ctx.beginPath(); ctx.ellipse(ps.x, ps.y + R * 0.28, R * 0.95, R * 0.8, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(bs.x + BR * 0.2, bs.y + BR * 0.45, BR, BR * 0.8, 0, 0, Math.PI * 2); ctx.fill();
  drawToken(ctx, ps, R, sprites.faces[o.lane], sprites.jerseys[o.lane], RING, me.p.kicking || me.p.kickFlash > 0, o.lane === o.me);
  if (R >= 8) drawName(ctx, ps, R, config.players[o.lane].name, o.lane === o.me);
  drawBall(ctx, bs, BR);
  // 말풍선 — 내 레인 사람은 몸 위, 다른 사람은 유령 위
  for (const b of o.bubbles) {
    const l = st.lanes[b.id];
    if (!l || !b.text) continue;
    const s = toScreen(v, l.p.x, l.p.y);
    ctx.font = `14px ${F14}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = Math.ceil(ctx.measureText(b.text).width) + 14, h = 24, x = Math.min(Math.max(2, s.x - w / 2), v.vw - w - 2), y = Math.max(2, s.y - R - 14 - h);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.beginPath(); ctx.rect(x, y, w, h); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#000'; ctx.fillText(b.text, x + w / 2, y + h / 2 + 1);
  }

  // 위 띠 — 코스 · 문 · 내 시계(달린 시간 + 콘 벌점)
  const y0 = o.topInset + 6, cx = v.vw / 2;
  ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(0, 0, v.vw, o.topInset + 52);   // 띠 — 따라가는 화면에서 레인 위에 글이 겹쳐도 읽히게
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  const run = st.phase === 'count' ? 0 : me.fin >= 0 ? me.fin : st.phase === 'end' ? me.fin : st.phaseTicks;
  const t = me.fin >= 0 ? (laneTime(me) ?? 0) : (Math.max(0, run) + me.pen * 60) / 60;
  ctx.font = `20px ${F9}`; ctx.fillStyle = me.fin >= 0 ? GOLD : '#fff';
  ctx.fillText(st.phase === 'count' ? c.name : secText(t), cx, y0);
  ctx.font = `14px ${F14}`; ctx.fillStyle = 'rgba(255,255,255,.75)';
  const extra = me.pen ? ` · 콘 ${me.pen}` : '';
  const best = o.best !== null ? ` · 최고 ${secText(o.best)}` : '';
  ctx.fillText(st.phase === 'count' ? `문 ${c.gates.length}개${best}` : `${c.name} · 문 ${Math.min(me.gate, c.gates.length)}/${c.gates.length}${extra}`, cx, y0 + 26);

  // 순위 줄(사람이 둘 이상) — 왼쪽 위, 띠 아래
  if (st.lanes.length > 1) {
    const order = drRanking(st), pl = drPlaces(st);
    const rows = order.slice(0, v.vw < 520 ? 3 : 8);
    if (!rows.includes(o.lane)) rows.push(o.lane);
    ctx.font = `12px ${F14}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    const x = 8, yy = o.topInset + 64, h = 16, w = 150;
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(x - 4, yy - 4, w, rows.length * h + 8);
    rows.forEach((i, k) => {
      const l = st.lanes[i], tm = laneTime(l);
      ctx.fillStyle = i === o.lane ? GOLD : '#fff';
      ctx.fillText(`${pl[i]} ${Array.from(config.players[i].name).slice(0, 4).join('')}`, x, yy + k * h);
      ctx.textAlign = 'right';
      ctx.fillText(tm !== null ? secText(tm) : l.gone ? '나감' : `문 ${l.gate}/${c.gates.length}`, x + w - 10, yy + k * h);
      ctx.textAlign = 'left';
    });
  }

  // 가운데 띠 — 3·2·1·출발, +1초, 도착
  const midY = v.oy - Math.min(v.vh, v.vw) * 0.12;
  if (st.phase === 'count') {
    const n = Math.ceil((COUNT_TICKS - st.phaseTicks) / 60);
    banner(ctx, v, midY, n > 0 ? String(n) : '출발!', st.lanes.length > 1 ? `${st.lanes.length}명 동시 출발` : c.name, 54, '#fff');
  } else if (st.phase === 'run' && st.phaseTicks < 40) {
    banner(ctx, v, midY, '출발!', '', 54, GOLD);
  } else if (me.fin >= 0) {
    const tm = laneTime(me), m = medalOf(c, tm);
    banner(ctx, v, midY, '도착!', `${secText(tm ?? 0)}${m !== null ? ` · ${MEDAL[m].name}` : ''}`, 54, m !== null ? MEDAL[m].color : GOLD);
  }
  if (o.popAt >= 0 && st.tick - o.popAt < 45) {
    const a = 1 - (st.tick - o.popAt) / 45;
    ctx.globalAlpha = a; ctx.font = `20px ${F9}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 4; ctx.strokeStyle = '#000'; ctx.strokeText('+1초', ps.x, ps.y - R - 24); ctx.fillStyle = '#e5484d'; ctx.fillText('+1초', ps.x, ps.y - R - 24);
    ctx.globalAlpha = 1;
  }
}
