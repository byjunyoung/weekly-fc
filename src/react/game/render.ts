// src/react/game/render.ts — 한 프레임을 2D 캔버스에 그린다. (state, config, view) 의 함수일 뿐, 시계·입력·난수는 모른다.
// 구성: ① 경기장 바닥(잔디·선·골 상자)은 크기가 바뀔 때만 한 번 그려 두고 매 프레임 한 번에 찍는다.
//       ② 선수·공·이름표는 화면 좌표로 직접 그린다(머리는 세로 화면에서도 돌리지 않는다).
//       ③ 점수판·"골!"·선공 안내도 캔버스에 그린다 — 리액트 상태를 프레임마다 흔들지 않으려고.
// 색은 포털 톤(어두운 도트)에 맞춘 이 파일 자기 팔레트. 팀 조끼 색만 teams.ts 의 VESTS 에서 가져온다.
import { avatarPixels, FACE_SIZE, FACE_X, FACE_Y } from '../../components/avatar.ts';
import { avatarSpecFor } from '../../lib/avatar.ts';
import { PITCH, type MatchConfig, type MatchState } from '../../lib/game/sim.ts';
import { VESTS } from '../../lib/teams.ts';
import type { Player } from '../../lib/types.ts';
import { toScreen, clockText, type View } from './view.ts';

// ── 팔레트(캔버스 그림 전용) ──
const GRASS_A = '#0f2617', GRASS_B = '#173a23';   // pitch-view.ts 의 잔디 두 톤과 같은 계열
const GRAIN = 'rgba(255, 255, 255, .035)';
const LINE = 'rgba(244, 244, 244, .82)';
const NET_BG = '#0b0d10', NET = 'rgba(244, 244, 244, .2)';
const POST = '#f4f4f4';
const VOID = '#000';
const GOLD = '#ffce21';
const KICK_RING = '#ffffff';   // 킥을 누르는 동안의 고리 색
const FACE_FILL = 0.74;         // 원 반지름 대비 얼굴 반쪽 크기 — 1 이면 원에 꽉 찬다
// 도트 글꼴은 격자에 맞는 크기에서만 또렷하다: 갈무리9 = 10px 의 배수, 갈무리14 = 14px 의 배수(tokens.css 와 같은 계약).
const F9 = '"Galmuri9", "Galmuri14", "Pretendard Variable", Pretendard, system-ui, sans-serif';
const F14 = '"Galmuri14", "Galmuri9", "Pretendard Variable", Pretendard, system-ui, sans-serif';

/** 팀 색 — 0 편 주황조끼, 1 편 노조끼(VESTS 에서). */
const vest = (key: string): { color: string; short: string } => {
  const v = VESTS.find((x) => x.key === key);
  return { color: v?.color ?? '#999', short: key === 'orange' ? '주황' : '흰' };
};
export const TEAM = [vest('orange'), vest('none')] as const;

/** 점수판이 차지하는 높이(CSS px) — makeView 의 top 으로 넘겨 경기장이 밑에 깔리지 않게 한다. */
export const HUD_H = 46;

// ── 스프라이트 ──
export type Sprites = {
  /** 선수 id 별 머리 그림(미리 그려 둔 작은 캔버스). 그릴 수 없으면 null → 번호 원으로 대신. */
  faces: (HTMLCanvasElement | null)[];
  jerseys: number[];
};
const FACE_CELL = 4;   // 16칸 × 4 = 64px. 화면에선 이보다 작게 줄어 찍힌다(도트가 뭉개지지 않게 smoothing 끔).

/** 경기 시작 때 한 번. 화면 avatarFaceSvg 와 같은 영역(FACE_X/Y/SIZE)을 avatarPixels 의 도트에서 바로 칠한다 —
 *  SVG → Image 는 비동기라 첫 프레임에 못 맞출 수 있고, 같은 그림 데이터를 쓰니 모양은 같다(teams-image.ts 와 같은 방식). */
export function buildSprites(config: MatchConfig, roster: Player[]): Sprites {
  const faces: (HTMLCanvasElement | null)[] = [];
  const jerseys: number[] = [];
  for (const mp of config.players) {
    const p = roster.find((r) => r.num === mp.num);
    jerseys.push(p?.jersey ?? 0);
    let face: HTMLCanvasElement | null = null;
    try {
      const pix = p ? avatarPixels(avatarSpecFor(p.num, p.avatar)) : null;
      if (pix) {
        face = document.createElement('canvas');
        face.width = face.height = FACE_SIZE * FACE_CELL;
        const c = face.getContext('2d');
        if (c) {
          for (let row = 0; row < FACE_SIZE; row++) for (let col = 0; col < FACE_SIZE; col++) {
            const ch = pix.map[FACE_Y + row]?.[FACE_X + col];
            if (!ch || ch === '.') continue;
            c.fillStyle = pix.palette[ch];
            c.fillRect(col * FACE_CELL, row * FACE_CELL, FACE_CELL, FACE_CELL);
          }
        } else face = null;
      }
    } catch { face = null; }
    faces.push(face);
  }
  return { faces, jerseys };
}

// ── 경기장 바닥(캐시) ──
export type Field = { canvas: HTMLCanvasElement; key: string };

/** 바닥을 한 번 그려 둔다. key 가 같으면 다시 안 그려도 된다(크기·배율·방향이 같다). */
export function buildField(view: View, dpr: number): Field {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(view.vw * dpr));
  canvas.height = Math.max(1, Math.round(view.vh * dpr));
  const ctx = canvas.getContext('2d');
  if (ctx) paintField(ctx, view, dpr);
  return { canvas, key: fieldKey(view, dpr) };
}
export const fieldKey = (v: View, dpr: number): string => `${v.vw}x${v.vh}@${dpr}/${v.portrait ? 'p' : 'l'}${v.scale.toFixed(4)}`;

function paintField(ctx: CanvasRenderingContext2D, v: View, dpr: number): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = VOID; ctx.fillRect(0, 0, v.vw, v.vh);
  // 이후는 논리 단위: 원점 = 경기장 가운데, 세로면 -90도 돌려 +x 가 화면 위로.
  ctx.translate(v.ox, v.oy);
  if (v.portrait) ctx.rotate(-Math.PI / 2);
  ctx.scale(v.scale, v.scale);
  const hw = PITCH.w / 2, hh = PITCH.h / 2, gd = PITCH.goalDepth, gh = PITCH.goalW / 2;

  // 잔디 줄무늬 — 12줄(짝수라 하프라인이 줄 경계에 떨어진다) + 알갱이.
  const bands = 12, bw = PITCH.w / bands;
  for (let i = 0; i < bands; i++) { ctx.fillStyle = i % 2 ? GRASS_B : GRASS_A; ctx.fillRect(-hw + i * bw, -hh, bw + 0.5, PITCH.h); }
  ctx.fillStyle = GRAIN;
  const tile = 30;
  for (let x = -hw; x < hw; x += tile) for (let y = -hh; y < hh; y += tile) {
    ctx.fillRect(x + 4, y + 4, 6, 6); ctx.fillRect(x + 19, y + 19, 6, 6);
  }

  // 골 상자 — 그물 느낌(어두운 바탕 + 격자) + 바깥 테두리.
  for (const s of [-1, 1]) {
    const x0 = s < 0 ? -hw - gd : hw;
    ctx.fillStyle = NET_BG; ctx.fillRect(x0, -gh, gd, PITCH.goalW);
    ctx.strokeStyle = NET; ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let x = x0; x <= x0 + gd + 0.1; x += 14) { ctx.moveTo(x, -gh); ctx.lineTo(x, gh); }
    for (let y = -gh; y <= gh + 0.1; y += 14) { ctx.moveTo(x0, y); ctx.lineTo(x0 + gd, y); }
    ctx.stroke();
    ctx.strokeStyle = LINE; ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(s < 0 ? -hw : hw, -gh); ctx.lineTo(x0, -gh); ctx.lineTo(x0, gh); ctx.lineTo(s < 0 ? -hw : hw, gh);
    ctx.stroke();
  }

  // 선 — 터치라인·골라인(골문 구간은 비운다)·하프라인·가운데 원.
  ctx.strokeStyle = LINE; ctx.lineWidth = 4; ctx.lineJoin = 'miter';
  ctx.beginPath();
  ctx.moveTo(-hw, -gh); ctx.lineTo(-hw, -hh); ctx.lineTo(hw, -hh); ctx.lineTo(hw, -gh);
  ctx.moveTo(-hw, gh); ctx.lineTo(-hw, hh); ctx.lineTo(hw, hh); ctx.lineTo(hw, gh);
  ctx.moveTo(0, -hh); ctx.lineTo(0, hh);
  ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, PITCH.centerR, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = LINE; ctx.fillRect(-5, -5, 10, 10);
  // 골 앞 작은 상자(골 에어리어)
  ctx.lineWidth = 3;
  for (const s of [-1, 1]) ctx.strokeRect(s < 0 ? -hw : hw - 90, -gh - 60, 90, PITCH.goalW + 120);

  // 기둥
  ctx.fillStyle = POST;
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    ctx.beginPath(); ctx.arc(sx * hw, sy * gh, PITCH.postR, 0, Math.PI * 2); ctx.fill();
  }
}

// ── 프레임 ──
export type FrameOpts = {
  dpr: number;
  /** 이 기기에서 점수판 위쪽을 비울 높이(노치)는 view 에 이미 반영돼 있고, 여기선 점수판 글자 위치만. */
  topInset: number;
  /** 사람 선수 id(표시용). 없으면 표시 없음. */
  humanId: number | null;
};

/** 직전·현재 상태를 alpha(0~1)로 섞는다. 킥오프·골 뒤 재배치처럼 한 틱에 크게 건너뛴 몸은 섞지 않는다. */
export function blend(prev: MatchState, cur: MatchState, a: number): MatchState {
  if (prev === cur || a <= 0) return cur;
  const mix = <T extends { x: number; y: number }>(p: T, c: T): T => {
    const dx = c.x - p.x, dy = c.y - p.y;
    if (dx * dx + dy * dy > 120 * 120) return c;
    return { ...c, x: p.x + dx * a, y: p.y + dy * a };
  };
  return { ...cur, ball: mix(prev.ball, cur.ball), players: cur.players.map((c, i) => (prev.players[i] ? mix(prev.players[i], c) : c)) };
}

export function drawFrame(ctx: CanvasRenderingContext2D, st: MatchState, config: MatchConfig, view: View, field: Field, sprites: Sprites, o: FrameOpts): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(field.canvas, 0, 0);
  ctx.setTransform(o.dpr, 0, 0, o.dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;

  const R = PITCH.playerR * view.scale;
  const ballR = Math.max(PITCH.ballR * view.scale, 3.5);   // 실제 크기 그대로 — 전엔 1.15배로 키워 그렸다("공 좀 더 작게")

  // 그림자 먼저(모든 몸 아래)
  ctx.fillStyle = 'rgba(0, 0, 0, .35)';
  for (const b of st.players) { const s = toScreen(view, b.x, b.y); ctx.beginPath(); ctx.ellipse(s.x, s.y + R * 0.28, R * 0.95, R * 0.8, 0, 0, Math.PI * 2); ctx.fill(); }
  const bs = toScreen(view, st.ball.x, st.ball.y);
  ctx.beginPath(); ctx.ellipse(bs.x + ballR * 0.2, bs.y + ballR * 0.45, ballR, ballR * 0.8, 0, 0, Math.PI * 2); ctx.fill();

  // 선수 — 아래(화면 y 큰 쪽)가 위에 오게 정렬해 겹침이 자연스럽다.
  const order = st.players.map((b, i) => ({ b, i, s: toScreen(view, b.x, b.y) })).sort((a, b) => a.s.y - b.s.y);
  const showName = R >= 8;
  for (const { i, s } of order) {
    const mp = config.players[i];
    const human = mp.id === o.humanId;
    const team = TEAM[mp.side];
    const face = sprites.faces[i];
    ctx.save();
    ctx.beginPath(); ctx.arc(s.x, s.y, R, 0, Math.PI * 2); ctx.clip();
    // 얼굴은 원보다 작게 — 고리에 바짝 붙으면 답답하다(2026-11-06 "아바타 영역에 패딩이 좀 있어야"). 남는 둘레는 어두운 바탕.
    const fr = R * FACE_FILL;
    if (face) { ctx.fillStyle = '#20242b'; ctx.fillRect(s.x - R, s.y - R, R * 2, R * 2); ctx.drawImage(face, s.x - fr, s.y - fr, fr * 2, fr * 2); }
    else {
      ctx.fillStyle = '#2a2d33'; ctx.fillRect(s.x - R, s.y - R, R * 2, R * 2);
      ctx.fillStyle = '#ddd'; ctx.font = `10px ${F9}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(sprites.jerseys[i] ?? ''), s.x, s.y);
    }
    ctx.restore();
    // 킥을 누르고 있는 동안 고리가 하얗게 밝아진다 — 눌렸다는 걸 눈으로 알 수 있게(2026-11-06 "키 누를 때 피드백이 없네").
    const kicking = !!st.players[i].kicking;
    const ring = Math.max(2.5, R * 0.24);
    ctx.lineWidth = ring; ctx.strokeStyle = kicking ? KICK_RING : team.color;
    ctx.beginPath(); ctx.arc(s.x, s.y, R - ring / 2, 0, Math.PI * 2); ctx.stroke();
    if (human) {   // 내 선수 — 밝은 바깥 고리 + 머리 위 화살표
      ctx.lineWidth = 2; ctx.strokeStyle = '#fff';
      ctx.beginPath(); ctx.arc(s.x, s.y, R + 2, 0, Math.PI * 2); ctx.stroke();
      const ay = s.y - R - 5, aw = Math.max(5, R * 0.45);
      ctx.fillStyle = GOLD; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(s.x, ay); ctx.lineTo(s.x - aw, ay - aw * 1.3); ctx.lineTo(s.x + aw, ay - aw * 1.3); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  }
  // 이름표(머리 아래). 작아서 안 읽히면 그리지 않는다 — 겹쳐 지저분한 것보다 낫다.
  if (showName) {
    ctx.font = R >= 12 ? `14px ${F14}` : `10px ${F9}`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.lineJoin = 'round'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0, 0, 0, .85)';
    for (const { i, s } of order) {
      const name = Array.from(config.players[i].name).slice(0, 4).join('');
      ctx.strokeText(name, s.x, s.y + R + 3); ctx.fillStyle = config.players[i].id === o.humanId ? GOLD : '#f4f4f4'; ctx.fillText(name, s.x, s.y + R + 3);
    }
  }

  // 공 — 흰색 + 어두운 테두리
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#111'; ctx.lineWidth = Math.max(1.5, ballR * 0.25);
  ctx.beginPath(); ctx.arc(bs.x, bs.y, ballR, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

  drawHud(ctx, st, config, view, o);
}

function drawHud(ctx: CanvasRenderingContext2D, st: MatchState, config: MatchConfig, view: View, o: FrameOpts): void {
  const cx = view.vw / 2, y0 = o.topInset + 4;
  ctx.textBaseline = 'top'; ctx.lineJoin = 'round';
  // 점수판: [■ 주황 2] : [1 흰 ■], 아래에 남은 시간
  ctx.font = '20px ' + F9; ctx.textAlign = 'center';
  ctx.fillStyle = '#fff'; ctx.fillText(':', cx, y0);
  ctx.textAlign = 'right'; ctx.fillText(`${TEAM[0].short} ${st.score[0]}`, cx - 12, y0);
  ctx.textAlign = 'left'; ctx.fillText(`${st.score[1]} ${TEAM[1].short}`, cx + 12, y0);
  const lw = ctx.measureText(`${st.score[1]} ${TEAM[1].short}`).width;
  ctx.textAlign = 'right';
  const rw = ctx.measureText(`${TEAM[0].short} ${st.score[0]}`).width;
  ctx.fillStyle = TEAM[0].color; ctx.fillRect(cx - 12 - rw - 18, y0 + 2, 12, 14);
  ctx.fillStyle = TEAM[1].color; ctx.fillRect(cx + 12 + lw + 6, y0 + 2, 12, 14);
  ctx.textAlign = 'center'; ctx.font = '14px ' + F14; ctx.fillStyle = 'rgba(255,255,255,.75)';
  const limit = config.scoreLimit > 0 ? `  · ${config.scoreLimit}점 먼저` : '';
  ctx.fillText(clockText(st.ticksLeft / 60) + limit, cx, y0 + 24);

  // 가운데 안내
  const midY = view.oy;
  if (st.phase === 'goal') {
    const who = st.lastScorer !== null ? config.players[st.lastScorer]?.name : null;
    banner(ctx, view, midY, '골!', who ?? '', 54);
  } else if (st.phase === 'kickoff' && st.phaseTicks < 100) {
    const side = st.kickoffSide;
    banner(ctx, view, midY - Math.min(view.vh, view.vw) * 0.12, `${TEAM[side].short} 선공`, '', 24, TEAM[side].color);
  }
}

function banner(ctx: CanvasRenderingContext2D, view: View, y: number, big: string, small: string, size: number, color = GOLD): void {
  const fs = Math.max(30, Math.floor(Math.min(size, view.vw / 8) / 10) * 10);
  const h = fs * (small ? 2.1 : 1.5);
  ctx.fillStyle = 'rgba(0, 0, 0, .55)'; ctx.fillRect(0, y - h / 2, view.vw, h);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `${fs}px ${F9}`; ctx.fillStyle = color;
  ctx.fillText(big, view.vw / 2, small ? y - fs * 0.35 : y);
  if (small) { ctx.font = `${Math.max(10, Math.round(fs / 20) * 10)}px ${F9}`; ctx.fillStyle = '#fff'; ctx.fillText(small, view.vw / 2, y + fs * 0.5); }
  ctx.textBaseline = 'top';
}

// ── 한마디 말풍선(2단계 온라인) ──
/** 그 선수 머리 위에 말풍선. drawFrame 뒤에 부른다(같은 dpr 변환 그대로). 몸이 화면 위 끝이면 아래로 붙여 잘리지 않게. */
export function drawBubbles(ctx: CanvasRenderingContext2D, st: MatchState, view: View, bubbles: { id: number; text: string }[]): void {
  if (!bubbles.length) return;
  const R = PITCH.playerR * view.scale;
  ctx.font = `14px ${F14}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const b of bubbles) {
    const body = st.players[b.id];
    if (!body || !b.text) continue;
    const s = toScreen(view, body.x, body.y);
    const w = Math.ceil(ctx.measureText(b.text).width) + 14, h = 24;
    let y = s.y - R - 14 - h;            // 내 선수 화살표 위
    let tail = 1;
    if (y < 2) { y = s.y + R + 22; tail = -1; }   // 위가 모자라면 이름표 아래로
    const x = Math.min(Math.max(2, s.x - w / 2), view.vw - w - 2);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.fill(); ctx.stroke();
    // 꼬리 — 말한 사람 쪽으로
    const ty = tail > 0 ? y + h : y;
    ctx.beginPath(); ctx.moveTo(s.x - 5, ty); ctx.lineTo(s.x, ty + tail * 7); ctx.lineTo(s.x + 5, ty); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#000'; ctx.fillText(b.text, x + w / 2, y + h / 2 + 1);
  }
  ctx.textBaseline = 'top';
}
