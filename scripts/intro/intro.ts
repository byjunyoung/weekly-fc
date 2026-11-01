// scripts/intro/intro.ts — 유튜브 경기 영상 인트로(2026-11-01 "위클리 로고랑 아바타 활용해서 도트 컨셉").
// 첫 판(밤 경기장 + 31명 이름표)은 "요소가 너무 많다"고 해서 로고 하나가 남게 덜어냈다.
// 'ball': 검은 화면에 공이 떨어져 튀다 FC 옆에 멈추고 WEEKLY FC 가 한 열씩 찍힌다(프로필 사진 「WEEKLY FC ⚽」 로고).
// 'team': 거기에 팀원 아바타가 로고 아래로 한 줄로 달려와 선다(이름표 없음).
// 'kick': 팀원 한 명이 공을 몰고 와 차 넣으면 FC 옆에 꽂히고 로고가 찍힌다. 끝 장면은 [아바타] WEEKLY FC ⚽.
//         누가 나올지는 star(번호)로 받는다 — 영상마다 돌아가며 주인공을 바꾼다.
// draw(t) 가 t 초의 한 프레임을 그린다. 효과음 시각(sfx.py)은 TIMES 와 같이 움직인다.
import { avatarSpecFor } from '../../src/lib/avatar.ts';
import type { Player } from '../../src/lib/types.ts';
import { avatarPixels } from '../../src/components/avatar.ts';
import { BALL, BALL_C, F57, glyphW } from '../../src/components/squad-image.ts';

export type Variant = 'ball' | 'team' | 'kick';
export const W = 1920, H = 1080, FPS = 30;
/** 장면 시각(초) — sfx.py 의 같은 이름 변종과 맞춘다. */
export const TIMES: Record<Variant, { drop: number; hops: number[]; logo: number; logoEnd: number; runFrom: number; runTo: number; kick?: number; fadeFrom: number; end: number }> = {
  ball: { drop: 0.2, hops: [0.6, 0.9, 1.1], logo: 1.1, logoEnd: 1.6, runFrom: 0, runTo: 0, fadeFrom: 2.7, end: 3.0 },
  team: { drop: 0.2, hops: [0.6, 0.9, 1.1], logo: 1.1, logoEnd: 1.6, runFrom: 1.5, runTo: 2.5, fadeFrom: 3.2, end: 3.5 },
  kick: { drop: 0, hops: [1.35, 1.55], logo: 1.35, logoEnd: 1.85, runFrom: 0.1, runTo: 0.9, kick: 0.9, fadeFrom: 2.9, end: 3.2 },
};

const U = 4, GW = W / U, GH = H / U;
const MUT = '#9da4af';
const clamp = (x: number) => Math.max(0, Math.min(1, x));
const ease = (x: number) => 1 - (1 - clamp(x)) ** 3;

export function makeIntro(canvas: HTMLCanvasElement, players: Player[], variant: Variant, star?: number) {
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const T = TIMES[variant];
  const px = (x: number, y: number, c: string, w = 1, h = 1) => { ctx.fillStyle = c; ctx.fillRect(x * U, y * U, w * U, h * U); };

  // 로고 — 광고판 5×7 글자를 LS 배로. WEEKLY 흰 + FC 회색(사이트 헤더와 같은 배색), 오른쪽에 공 자리.
  const LS = 5, LOGO = 'WEEKLY FC', BALL_S = 2, BALL_W = 15 * BALL_S, GAP = 8;
  const AS = 2, AV_W2 = 24 * AS, AV_H2 = 32 * AS, kick = variant === 'kick';
  const textW = glyphW(LOGO) * LS, totalW = textW + GAP + BALL_W + (kick ? AV_W2 + GAP + 2 : 0);
  const LX = Math.round(GW / 2 - totalW / 2) + (kick ? AV_W2 + GAP + 2 : 0);
  const LY = Math.round(GH / 2 - (7 * LS) / 2) - (variant === 'team' ? 22 : 0);
  const ballX = LX + textW + GAP, ballFloor = LY + 7 * LS - BALL_W; // 글자 바닥선에 공 바닥을 맞춘다
  const logo = (cols: number) => {
    let cx = 0, idx = 0;
    for (const ch of LOGO) {
      const g = F57[ch], color = idx >= 7 ? MUT : '#ffffff';
      if (g) g.forEach((r, j) => [...r].forEach((v, i) => { if (v === 'X' && cx + i < cols) px(LX + (cx + i) * LS, LY + j * LS, color, LS, LS); }));
      cx += g ? 6 : 4; idx++;
    }
  };
  const ball = (x: number, y: number) => BALL.forEach((line, j) => [...line].forEach((v, i) => { if (BALL_C[v]) px(x + i * BALL_S, y + j * BALL_S, BALL_C[v], BALL_S, BALL_S); }));
  // 위에서 떨어져 hops 시각마다 바닥을 치고, 튈 때마다 낮아진다.
  const ballY = (t: number): number | null => {
    if (t < T.drop) return null;
    const [h1, h2, h3] = T.hops;
    if (t < h1) { const u = (t - T.drop) / (h1 - T.drop); return -BALL_W + (ballFloor + BALL_W) * u * u; }
    const hop = (a: number, b: number, hgt: number) => { const u = (t - a) / (b - a); return ballFloor - hgt * 4 * u * (1 - u); };
    if (t < h2) return hop(h1, h2, 28);
    if (t < h3) return hop(h2, h3, 9);
    return ballFloor;
  };

  // 팀 한 줄 — 로고 아래, 번호순. 왼쪽 절반은 왼쪽에서, 오른쪽 절반은 오른쪽에서 달려 들어온다.
  const AV_W = 24, list = [...players].sort((a, b) => a.num - b.num);
  const step = Math.min(15, Math.floor((GW - 40 - AV_W) / Math.max(1, list.length - 1)));
  const rowW = (list.length - 1) * step + AV_W, rowX = Math.round(GW / 2 - rowW / 2), rowY = LY + 7 * LS + 18;
  let seed = 11;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const runners = list.map((p, i) => {
    const x = rowX + i * step, left = x + AV_W / 2 < GW / 2;
    return { x, from: left ? -AV_W - 4 : GW + 4, delay: rnd() * 0.4, pix: avatarPixels(avatarSpecFor(p.num, p.avatar || undefined)) };
  });

  // 킥 — 주인공은 로고 왼쪽, 발이 글자 바닥선에 닿게 선다. 공은 발 앞에서 굴러 오다 차이면 포물선으로 FC 옆까지.
  const hero = list.find((p) => p.num === star) ?? list[0];
  const heroPix = hero ? avatarPixels(avatarSpecFor(hero.num, hero.avatar || undefined)) : null;
  const heroX = LX - GAP - 2 - AV_W2, heroY = LY + 7 * LS - AV_H2 + 2;
  const drawHero = (x: number, bob: number) => heroPix?.map.forEach((line, j) => [...line].forEach((ch, i) => {
    if (ch !== '.') px(x + i * AS, heroY - bob + j * AS, heroPix.palette[ch], AS, AS);
  }));
  const kickScene = (t: number, frame: number) => {
    const k = ease((t - T.runFrom) / (T.runTo - T.runFrom));
    const x = Math.round(-AV_W2 - 40 + (heroX + AV_W2 + 40) * k), running = t < T.runTo;
    drawHero(x, running && (frame >> 1) % 2 ? 2 : 0);
    const footX = x + AV_W2 - 4;
    if (t < T.kick!) {   // 드리블 — 발 앞에서 작게 통통
      if (t >= T.runFrom) ball(footX, ballFloor - (Math.floor(t * 8) % 2 ? 3 : 0));
      return;
    }
    const [land, hop2] = T.hops;
    if (t < land) {     // 날아가는 공 — 높은 포물선
      const u = (t - T.kick!) / (land - T.kick!), x0 = heroX + AV_W2 - 4;
      ball(Math.round(x0 + (ballX - x0) * u), Math.round(ballFloor - 70 * 4 * u * (1 - u)));
    } else if (t < hop2) {
      const u = (t - land) / (hop2 - land);
      ball(ballX, Math.round(ballFloor - 10 * 4 * u * (1 - u)));
    } else ball(ballX, ballFloor);
  };

  return function draw(t: number) {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    if (kick) {
      kickScene(t, Math.floor(t * FPS));
      if (t >= T.logo) logo(Math.ceil(glyphW(LOGO) * clamp((t - T.logo) / (T.logoEnd - T.logo))));
      if (t >= T.fadeFrom) { ctx.fillStyle = `rgba(0,0,0,${clamp((t - T.fadeFrom) / (T.end - T.fadeFrom))})`; ctx.fillRect(0, 0, W, H); }
      return;
    }
    if (variant === 'team') {
      const frame = Math.floor(t * FPS);
      // 뒤에서 앞으로 겹치도록 가운데에서 먼 사람부터 그린다
      for (const r of [...runners].sort((a, b) => Math.abs(b.x - GW / 2) - Math.abs(a.x - GW / 2))) {
        const k = ease((t - T.runFrom - r.delay) / (T.runTo - T.runFrom - 0.4));
        if (k <= 0 || !r.pix) continue;
        const x = Math.round(r.from + (r.x - r.from) * k), running = k < 1, flip = running && r.from > r.x;
        const y = rowY - (running && (frame >> 1) % 2 ? 1 : 0);
        r.pix.map.forEach((line, j) => [...line].forEach((ch, i) => { if (ch !== '.') px(x + (flip ? r.pix!.w - 1 - i : i), y + j, r.pix!.palette[ch]); }));
      }
    }
    const by = ballY(t);
    if (by != null) ball(ballX, Math.round(by));
    if (t >= T.logo) logo(Math.ceil(glyphW(LOGO) * clamp((t - T.logo) / (T.logoEnd - T.logo))));
    if (t >= T.fadeFrom) { ctx.fillStyle = `rgba(0,0,0,${clamp((t - T.fadeFrom) / (T.end - T.fadeFrom))})`; ctx.fillRect(0, 0, W, H); }
  };
}
