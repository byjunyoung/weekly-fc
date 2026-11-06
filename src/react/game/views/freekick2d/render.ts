// src/react/game/views/freekick2d/render.ts — 프리킥 한 프레임(2026-11-07 3단계). (state, config, layout, 내 조준) 의 함수일 뿐.
// 승부차기 화면의 조각(골문 끝 바닥 drawGoalEnd·키퍼 drawKeeper·세기 막대·선수 원·공·띠)을 그대로 쓰고, 수비벽·감는 길 미리 보기·자리 표시·순위 줄만 여기서.
// 조준과 감기 미리 보기는 aim 이 null 이 아닐 때만 — 화면(장면)이 "내가 키커일 때"만 넘긴다. 상태에는 조준·감기가 없다(찬 뒤의 curl 만).
import type { FkConfig, FkState } from '../../../../lib/games/freekick2d.ts';
import { AIM_TICKS, FK_MAX_POINTS, FK_SPOTS, READY_TICKS, WALL_R, fkPath, fkPlaces, fkRanking, fkTotal, wallAt } from '../../../../lib/games/freekick2d.ts';
import { tiedAt, topName, topWord } from '../../../../lib/games/places.ts';
import { BALL_R, BODY_R, CHARGE_TICKS, deviationOf } from '../../../../lib/games/penalty2d.ts';
import { F9, F14, GOLD, banner, drawBall, drawName, drawToken, type Sprites } from '../match2d/render.ts';
import { toScreen, type PenLayout } from '../penalty2d/layout.ts';
import { MISS, drawGoalEnd, drawKeeper, drawPowerBar } from '../penalty2d/render.ts';

export const FK_OUT_TEXT = { goal: '골!', save: '막았다!', wall: '벽!', miss: '빗나감', post: '골대!', gone: '자리 비움' } as const;
const KICKER_RING = '#ffce21', BOT_RING = '#8a8f98', WALL_FILL = '#2a2f37';

export type FkDrawOpts = { me: number | null; aim: number | null; curl: number; bubbles: { id: number; text: string }[]; best: number | null };

/** 자리 표시 — 이 사람이 자리마다 넣었나(● 금색 · ✕ 빨강 · ○ 아직). */
function marks(st: FkState, who: number): ('goal' | 'no' | 'wait')[] {
  return FK_SPOTS.map((_, i) => {
    const e = st.log.find((x) => x.kicker === who && x.spot === i);
    return e ? (e.out === 'goal' ? 'goal' : 'no') : 'wait';
  });
}
function drawMarks(ctx: CanvasRenderingContext2D, m: ('goal' | 'no' | 'wait')[], x0: number, y: number): void {
  const r = 5, gap = 15;
  m.forEach((k, i) => {
    const x = x0 + i * gap + r;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    if (k === 'goal') { ctx.fillStyle = GOLD; ctx.fill(); }
    else if (k === 'no') { ctx.strokeStyle = MISS; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y + r); ctx.moveTo(x + r, y - r); ctx.lineTo(x - r, y + r); ctx.stroke(); }
    else { ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1.5; ctx.stroke(); }
  });
}

export function drawFreekick(ctx: CanvasRenderingContext2D, st: FkState, config: FkConfig, l: PenLayout, sprites: Sprites, o: FkDrawOpts, dpr: number): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  drawGoalEnd(ctx, l, FK_SPOTS);
  const sc = l.scale, R = BODY_R * sc;
  const spot = FK_SPOTS[st.spot];

  // 내 조준 — 감는 길 미리 보기(흔들림 없이) + 골라인 위 표시 + 지금 세기의 흔들림 폭(키커 화면에만).
  if (o.aim !== null && (st.phase === 'ready' || st.phase === 'aim')) {
    const power = st.st.held ? Math.max(0.15, st.st.charge / CHARGE_TICKS) : 0.6;
    const path = fkPath(st.spot, o.aim, power, o.curl, 3);
    ctx.fillStyle = 'rgba(255,206,33,.7)';
    for (const q of path) { const p = toScreen(l, q.x, q.y); ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3); }
    const end = path[path.length - 1], t = toScreen(l, end.x, 0), m = toScreen(l, o.aim, 0);
    const dev = deviationOf(st.st.charge / CHARGE_TICKS, config.players[st.kicker].perf) * sc;
    ctx.fillStyle = 'rgba(255,206,33,.25)'; ctx.fillRect(t.x - dev, t.y - 5, dev * 2, 10);
    ctx.strokeStyle = GOLD; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(m.x, m.y, 9, 0, Math.PI * 2); ctx.moveTo(m.x - 14, m.y); ctx.lineTo(m.x + 14, m.y); ctx.moveTo(m.x, m.y - 14); ctx.lineTo(m.x, m.y + 14); ctx.stroke();
  }

  // 키퍼(봇) — 얼굴 없이 회색 고리
  drawKeeper(ctx, l, st.gk, R, null, undefined, BOT_RING, false);
  // 수비벽 — 봇 셋(작은 어깨 원)
  for (const w of wallAt(st)) {
    const p = toScreen(l, w.x, w.y), r = Math.max(4, WALL_R * sc);
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(p.x, p.y + r * 0.35, r, r * 0.8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = WALL_FILL; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = BOT_RING; ctx.lineWidth = Math.max(1.5, r * 0.3); ctx.stroke();
  }
  // 키커 + 세기 막대
  const ks = toScreen(l, st.st.x, st.st.y);
  ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(ks.x, ks.y + R * 0.3, R * 0.95, R * 0.8, 0, 0, Math.PI * 2); ctx.fill();
  drawToken(ctx, ks, R, sprites.faces[st.kicker], sprites.jerseys[st.kicker], KICKER_RING, st.st.held || st.st.kickFlash > 0, st.kicker === o.me);
  if (R >= 8) drawName(ctx, ks, R, config.players[st.kicker].name, st.kicker === o.me);
  if (st.phase === 'aim' || (st.phase === 'flight' && st.phaseTicks < 30)) drawPowerBar(ctx, ks, R, sc, st.phase === 'aim' ? st.st.charge / CHARGE_TICKS : st.power);
  // 공
  const bs = toScreen(l, st.ball.x, st.ball.y);
  ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(bs.x + 2, bs.y + 4, BALL_R * sc, BALL_R * sc * 0.8, 0, 0, Math.PI * 2); ctx.fill();
  drawBall(ctx, bs, Math.max(3.5, BALL_R * sc));
  // 말풍선 — 지금 차는 사람 머리 위에만(다른 사람은 그림에 몸이 없다)
  for (const b of o.bubbles) {
    if (b.id !== st.kicker || !b.text) continue;
    ctx.font = `14px ${F14}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = Math.ceil(ctx.measureText(b.text).width) + 14, h = 24, x = Math.min(Math.max(2, ks.x - w / 2), l.vw - w - 2), y = ks.y - R - 14 - h;
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.beginPath(); ctx.rect(x, y, w, h); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#000'; ctx.fillText(b.text, x + w / 2, y + h / 2 + 1);
  }

  // 위 띠 — 자리와 점수, 누가 차나, 점수 줄
  const y0 = l.hud + 6, cx = l.vw / 2;
  ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(0, 0, l.vw, l.top - 4);
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.font = `20px ${F9}`; ctx.fillStyle = '#fff';
  ctx.fillText(st.phase === 'end' ? '끝' : `${st.spot + 1}번 자리 · ${spot.name} · ${spot.pts}점`, cx, y0);
  ctx.font = `14px ${F14}`;
  const n = config.players.length;
  if (n === 1) {
    // 혼자 — 내 점수와 자리 표시, 최고 기록
    const text = `${st.points[0]}점 / ${FK_MAX_POINTS}${o.best !== null ? ` · 최고 ${o.best}점` : ''}`;
    ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.fillText(text, cx, y0 + 26);
    drawMarks(ctx, marks(st, 0), cx - 37, y0 + 56);
  } else {
    const k = config.players[st.kicker];
    ctx.fillStyle = st.kicker === o.me ? GOLD : 'rgba(255,255,255,.8)';
    ctx.fillText(st.phase === 'end' ? '' : `${k.name}${st.kicker === o.me ? '(나)' : ''} 차례 · ${st.kickNo + 1}/${fkTotal(n)}`, cx, y0 + 26);
    // 순위 줄 — 앞 넷(폰은 셋) + 나
    const order = fkRanking(st.points, st.log), pl = fkPlaces(st.points, st.log);
    const show = order.slice(0, l.vw < 520 ? 3 : 4);
    if (o.me !== null && !show.includes(o.me)) show.push(o.me);
    const text = show.map((i) => `${pl[i]} ${Array.from(config.players[i].name).slice(0, 4).join('')} ${st.points[i]}`).join('  ·  ');
    ctx.fillStyle = 'rgba(255,255,255,.65)'; ctx.fillText(text, cx, y0 + 50);
  }
  if (st.phase === 'aim') {
    const left = Math.max(0, 1 - st.phaseTicks / AIM_TICKS);
    ctx.fillStyle = 'rgba(255,255,255,.15)'; ctx.fillRect(0, l.top - 4, l.vw, 4);
    ctx.fillStyle = left < 0.3 ? MISS : '#fff'; ctx.fillRect(0, l.top - 4, l.vw * left, 4);
  }

  // 가운데 띠
  const midY = toScreen(l, 0, 150).y;
  if (st.phase === 'result' && st.outcome) {
    const who = config.players[st.kicker].name;
    banner(ctx, l, midY, FK_OUT_TEXT[st.outcome], st.outcome === 'goal' ? `${who} +${spot.pts}점` : st.outcome === 'gone' ? `${who} 차례를 넘깁니다` : '', 54, st.outcome === 'goal' ? GOLD : st.outcome === 'save' ? '#fff' : '#c9ced6');
  } else if (st.phase === 'ready' && st.phaseTicks < READY_TICKS - 6) {
    banner(ctx, l, midY, st.kicker === o.me ? '내 차례' : `${config.players[st.kicker].name} 차례`, `${spot.name} · ${spot.pts}점`, 24, st.kicker === o.me ? GOLD : '#fff');
  } else if (st.phase === 'end') {
    const top = fkRanking(st.points, st.log)[0], pl = fkPlaces(st.points, st.log);   // 같이 1등이면 "공동 1등 k명"(결과 상자와 같은 말)
    banner(ctx, l, midY, n === 1 ? `${st.points[0]}점` : topWord(pl, config.players[top].name), n === 1 ? `${FK_MAX_POINTS}점 만점` : tiedAt(pl, 1) > 1 ? `${topName(pl, config.players[top].name)} ${st.points[top]}점` : `${st.points[top]}점`, 54);
  }

  // 아래 안내 — 내 차례의 조작
  const hint = st.phase !== 'end' && st.kicker === o.me
    ? (st.st.held ? '누르는 동안 좌우(방향키·왼쪽 끌기) = 감아차기 · 떼면 슛' : '겨누기(방향키·왼쪽 끌기) · 킥을 누르고 있다가 떼면 슛 · 누르는 동안 좌우 = 감아차기')
    : '';
  if (hint) {
    ctx.font = `14px ${F14}`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.lineJoin = 'round'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.85)';
    const hy = Math.min(toScreen(l, 0, l.y1).y + 22, l.vh - l.bottom + 30);
    const parts = l.vw < 520 ? hint.split(' · ') : [hint];
    parts.forEach((t, i) => { ctx.strokeText(t, l.vw / 2, hy + i * 18); ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillText(t, l.vw / 2, hy + i * 18); });
  }
}
