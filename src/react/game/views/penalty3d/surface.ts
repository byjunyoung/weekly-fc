// src/react/game/views/penalty3d/surface.ts — 3D 승부차기 그림판(2026-11-07 게임 묶음 5단계). three.js 묶음(match3d/surface3d.ts) 안에 같이 실린다 —
// 3D 게임 셋이 three.js 를 한 번만 받게. 장면은 3D 경기의 것(scene.ts — 경기장·골대·그물·도트 아바타 입체)을 그대로 쓰고,
// 승부차기만의 것은 이 파일에: 정해진 카메라 둘, 키퍼의 던진 몸(눕히기·띄우기), 내 조준 표시(골문 면 위 고리 + 흔들림 폭), 위 띠·판정 띠·안내.
// 스펙 §3.1 "3D: 키커 뒤에서 골대를 보는 화면(키퍼 차례엔 골대 뒤에서)". 고른 것: 키퍼 차례는 그물 뒤 3.6m·2m 높이에서 키커 쪽을 본다 —
// 골대 앞에서 보면 키퍼 자신이 화면을 가리고, 골대 뒤라야 공이 오는 쪽과 골문 폭이 한눈에 들어온다. 화면 좌우가 경기 좌우와 반대라
// 조작은 화면 기준 그대로 쓰게 계산에 넘길 때 뒤집는다(aim3.ts) — 오른쪽을 누르면 화면 오른쪽으로 간다.
// 2D 와 같은 것: 위 띠(● 골 · ✕ 못 넣음 · ○ 남음, 점수, n번째 · 편 차례, 키커 → 키퍼), 5초 막대, 판정 띠 "골!·막았다!·빗나감·골대!",
// "내가 찰 차례 / 내가 막을 차례", 끝 띠, 아래 내 역할 안내, 키커 고리는 모으는 중·찬 직후 하양, 소리는 2D 와 같은 detectPenSfx.
import { DoubleSide, Mesh, MeshBasicMaterial, PlaneGeometry, RingGeometry, Vector3 } from 'three';
import { avatarFaceSvg } from '../../../../components/avatar';
import { avatarSpecFor } from '../../../../lib/avatar';
import { PITCH3D } from '../../../../lib/game3d/sim';
import type { PenConfig } from '../../../../lib/games/penalty2d';
import { AIM_TICKS, CHARGE_TICKS, READY_TICKS } from '../../../../lib/games/penalty2d';
import type { Pen3Input, Pen3State } from '../../../../lib/games/penalty3d';
import { DIVE_H, SPOT_X, deviation3 } from '../../../../lib/games/penalty3d';
import { TEAM } from '../../teams';
import type { Surface, SurfaceIn } from '../types';
import { OUT_TEXT } from '../penalty2d/render';
import { attachInput } from '../match3d/input3d';
import { createScene, type SceneBody, type SceneHandle, type ScenePose } from '../match3d/scene';
import { createTags, createTouch, el } from '../kit3d/dom3d';
import { keeperCam, kickerCam } from '../kit3d/cams';
import { AIM3_START, pen3Input, type AimLocal3 } from './aim3';

const { HW } = PITCH3D;
const MAX_DPR = 2;
/** 키커를 그릴 때 옆으로 비키는 거리(m). */
const KICKER_SIDE = 0.75;
const OFF: SceneBody = { x: -40, y: 0, vx: 0, vy: 0, fx: 1, fy: 0, kickTicks: 0, shootHeld: false, charge: 0 };

export function createPenaltySurface(o: SurfaceIn<PenConfig>): Surface<Pen3State, PenConfig, Pen3Input> | string {
  const { root, canvas, layer, config, roster, playing } = o;
  const myId = o.myId !== null && o.myId >= 0 && o.myId < config.players.length ? o.myId : null;
  let dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  let sc: SceneHandle;
  try {
    sc = createScene(canvas, { players: config.players.map((p) => ({ id: p.id, num: p.num, side: p.side })) }, roster, myId ?? -1, dpr);
  } catch {
    return '이 기기·브라우저에서는 3D 화면을 열 수 없습니다.';
  }
  const nodes: HTMLElement[] = [];
  const add = <T extends HTMLElement>(e: T): T => { nodes.push(e); return e; };

  // ── 조준 표시(골문 면 위) — 고리와 흔들림 폭. 키커 화면에만 ──
  const reticle = new Mesh(new RingGeometry(0.16, 0.24, 24), new MeshBasicMaterial({ color: '#ffce21', side: DoubleSide, depthTest: false, transparent: true }));
  const spread = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ color: '#ffce21', side: DoubleSide, transparent: true, opacity: 0.22, depthTest: false }));
  for (const m of [reticle, spread]) { m.rotation.y = Math.PI / 2; m.renderOrder = 5; m.visible = false; sc.root.add(m); }

  // ── 위 띠: 점수·표시, 차례, 누가 → 누가, 5초 막대 ──
  const top = add(el('div', 'p3-top', layer));
  top.setAttribute('aria-live', 'polite');
  const board = el('div', 'p3-board', top);
  const sideEl = [0, 1].map((s) => el('span', `p3-side is-${s}`, board));
  const scoreEl = el('b', 'p3-score', board);
  board.insertBefore(scoreEl, sideEl[1]);
  const headEl = el('div', 'p3-head', top);
  const whoEl = el('div', 'p3-who', top);
  const clock = el('div', 'p3-clock', top);
  const clockFill = el('i', '', clock);
  const banner = add(el('div', 'p3-banner', layer));
  banner.setAttribute('role', 'status');
  const bannerB = el('b', '', banner), bannerS = el('span', '', banner);
  const hint = add(el('div', 'p3-hint', layer));
  const gauge = add(el('div', 'g3-gauge', layer));
  gauge.setAttribute('aria-hidden', 'true');
  const fill = el('i', '', gauge);
  const lost = add(el('div', 'game-banner', layer));
  lost.style.display = 'none';

  const names = config.players.map((p) => p.name);
  const tags = createTags(layer, names, config.players.map((p) => p.side), myId, () => new Vector3());
  const touch = playing && myId !== null ? createTouch(layer, ['shoot'], { shoot: '슛' }) : null;
  const input = touch ? attachInput({
    root, base: touch.base, knob: touch.knob, shootBtn: touch.btn.shoot, passBtn: touch.btn.pass, throughBtn: touch.btn.through,
    lobBtn: touch.btn.lob, sprintBtn: touch.btn.sprint, onTouch: touch.onTouch,
  }) : null;

  const face = (i: number): string => {
    const p = config.players[i], r = roster.find((x) => x.num === p.num);
    return avatarFaceSvg(avatarSpecFor(p.num, r?.avatar ?? ''), 20, p.jersey || '', true);
  };
  const short = (i: number): string => `${Array.from(config.players[i].name).slice(0, 5).join('')}${i === myId ? '(나)' : ''}`;

  let w = 0, h = 0, portrait = false, snap = true, dead = false;
  let local: AimLocal3 = AIM3_START, role: 'kick' | 'keep' | null = null, phase = 'ready';
  let lastKey = '', avgMs = 16, slowFor = 0;
  const onLost = (e: Event): void => { e.preventDefault(); dead = true; lost.textContent = '3D 화면이 끊겼습니다 — ✕ 로 나가 다시 열어 주세요.'; lost.style.display = ''; };
  canvas.addEventListener('webglcontextlost', onLost);

  /** 편 표시 — 2D 띠와 같은 규칙: 찬 것(● / ✕) 뒤에 남은 것(○), 서든데스가 길면 최근 것만(폰 다섯·PC 일곱). */
  const marks = (st: Pen3State, side: 0 | 1): string => {
    const mine = st.log.filter((e) => e.side === side).map((e) => (e.out === 'goal' ? '●' : '✕'));
    const n = Math.max(config.kicks, mine.length + (st.phase !== 'end' && st.side === side && st.phase !== 'result' ? 1 : 0));
    const all = [...mine, ...Array.from({ length: Math.max(0, n - mine.length) }, () => '○')];
    return all.slice(w < 520 ? -5 : -7).map((m) => `<i class="p3-mark${m === '●' ? ' is-goal' : m === '✕' ? ' is-no' : ''}">${m}</i>`).join('');
  };

  return {
    resize(nw, nh) { w = nw; h = nh; portrait = h > w; sc.resize(w, h); },

    render(f) {
      if (dead || !w || !h) return;
      const st = f.state;
      if (st.kickNo !== local.kickNo) local = { ...AIM3_START, kickNo: st.kickNo };   // 새 차기 — 조준은 가운데에서
      role = myId === null ? null : st.kicker === myId ? 'kick' : st.keeper === myId ? 'keep' : null;
      phase = st.phase;

      // 몸 — 지금 차는 사람·막는 사람만 경기장에. 키퍼는 키커를 보고, 던지면 그쪽으로 눕고 그 높이로 뜬다.
      const gk = st.gk, lying = (gk.diveT > 0 || gk.lie > 0) && gk.dive !== 0;
      const players: SceneBody[] = config.players.map((_, i) => {
        // 키커는 공 바로 뒤가 아니라 조금 옆에 그린다(그림만 — 계산의 자리는 그대로) — 키커 뒤 카메라에서 몸이 골문을 가리지 않게
        if (i === st.kicker) return { x: st.st.x, y: st.st.y - KICKER_SIDE, vx: st.st.vx, vy: st.st.vy, fx: 1, fy: 0, kickTicks: st.st.kickFlash, shootHeld: st.st.held, charge: st.st.charge };
        if (i === st.keeper) return { x: gk.x, y: lying ? gk.y - gk.dive * 0.3 : gk.y, vx: 0, vy: lying ? 0 : gk.vy, fx: -1, fy: 0, kickTicks: 0, shootHeld: gk.diveT > 0, charge: gk.diveT > 0 ? 1 : 0 };
        return OFF;
      });
      const poses: ScenePose[] = config.players.map((_, i) => {
        if (i === st.kicker) return {};
        if (i !== st.keeper) return { hide: true };
        if (lying) return { roll: (0 - gk.dive) * 1.42, lift: Math.max(0, DIVE_H[gk.diveH] - 0.25) };
        return { lift: gk.z };
      });
      const frame = { players, ball: st.ball, phase: st.phase };
      const cam = role === 'keep' ? keeperCam(SPOT_X, w / h) : kickerCam(SPOT_X, w / h);
      sc.update(frame, frame, 1, f.dt, { mode: 'broadcast', portrait, heading: 0, snap, cam, poses, noMarker: role !== null });
      snap = false;

      // 내 조준 — 키커 화면에만(조준 중). 흔들림 폭은 지금 세기 기준.
      const showAim = role === 'kick' && (st.phase === 'ready' || st.phase === 'aim');
      reticle.visible = showAim; spread.visible = showAim;
      if (showAim) {
        reticle.position.set(HW - 0.05, local.aim.z, local.aim.y);
        const dev = deviation3(st.st.charge / CHARGE_TICKS, config.players[st.kicker].perf);
        spread.position.set(HW - 0.06, local.aim.z, local.aim.y);
        spread.scale.set(dev * 2 + 0.05, dev * 1.2 + 0.05, 1);
      }
      sc.render();

      const dtMs = f.dt * 1000;
      if (dtMs > 0) {
        avgMs += (dtMs - avgMs) * 0.05;
        if (avgMs > 24 && dpr > 1) { slowFor += dtMs; if (slowFor > 2000) { dpr = Math.max(1, dpr - 0.5); sc.setPixelRatio(dpr); sc.resize(w, h); slowFor = 0; } } else slowFor = 0;
      }

      // 위 띠 — 바뀔 때만
      const key = `${st.kickNo}|${st.phase}|${st.log.length}|${w < 520}`;
      if (key !== lastKey) {
        lastKey = key;
        scoreEl.textContent = `${st.scored[0]} : ${st.scored[1]}`;
        sideEl[0].innerHTML = `<span class="p3-chip" style="background:${TEAM[0].color}"></span>${TEAM[0].short} ${marks(st, 0)}`;
        sideEl[1].innerHTML = `${marks(st, 1)} ${TEAM[1].short}<span class="p3-chip" style="background:${TEAM[1].color}"></span>`;
        const round = Math.floor(st.kickNo / 2) + 1;
        const sd = st.taken[0] >= config.kicks && st.taken[1] >= config.kicks;
        headEl.textContent = st.phase === 'end' ? '끝' : sd || round > config.kicks ? `서든데스 · ${TEAM[st.side].short} 차례` : `${round}번째 · ${TEAM[st.side].short} 차례`;
        whoEl.innerHTML = st.phase === 'end' ? '' : `<span class="p3-face">${face(st.kicker)}</span><span class="${st.kicker === myId ? 'is-me' : ''}">${short(st.kicker)} 차기</span><span class="muted">→</span>`
          + `<span class="p3-face">${face(st.keeper)}</span><span class="${st.keeper === myId ? 'is-me' : ''}">${short(st.keeper)} 막기</span>`;
        // 가운데 띠 — 판정, 내 차례 알림, 끝
        let b = '', s = '', tone = '';
        if (st.phase === 'result' && st.outcome) {
          b = OUT_TEXT[st.outcome];
          s = st.outcome === 'goal' ? config.players[st.kicker].name : st.outcome === 'save' ? config.players[st.keeper].name : '';
          tone = st.outcome === 'goal' ? 'is-goal' : st.outcome === 'save' ? 'is-save' : 'is-miss';
        } else if (st.phase === 'ready') {
          b = st.kicker === myId ? '내가 찰 차례' : st.keeper === myId ? '내가 막을 차례' : '';
          tone = 'is-turn';
        } else if (st.phase === 'end' && st.winner !== null) {
          b = st.winner === 'draw' ? '무승부' : `${TEAM[st.winner].short} 승`;
          s = `${st.scored[0]} : ${st.scored[1]}`;
          tone = 'is-end';
        }
        banner.className = `p3-banner ${tone}${b ? ' is-on' : ''}`;
        bannerB.textContent = b; bannerS.textContent = s;
        if (st.phase === 'end' && st.winner !== null && st.winner !== 'draw') bannerB.style.color = TEAM[st.winner].color; else bannerB.style.color = '';
        // 아래 안내 — 내 역할의 조작
        hint.textContent = st.phase === 'end' ? '' : st.kicker === myId ? '겨누기(방향키·왼쪽 끌기) · 슛을 누르고 있다가 떼면 슛 — 오래 누를수록 세고 덜 정확'
          : st.keeper === myId ? '←→ 옆걸음 · 슛 = 몸 던지기(↑ 높이 · ↓ 낮게 · 가운데면 팔 벌리고 뛰기)' : '';
        touch?.setLabel('shoot', role === 'keep' ? '던지기' : '슛');
      }
      // 판정·끝·남의 차례엔 터치 버튼을 숨긴다(누를 뜻이 없다)
      touch?.setShown(role !== null && st.phase !== 'end' && st.phase !== 'result');
      // 5초 막대(조준 중)
      const left = st.phase === 'aim' ? Math.max(0, 1 - st.phaseTicks / AIM_TICKS) : 0;
      clock.classList.toggle('is-on', st.phase === 'aim');
      clockFill.style.transform = `scaleX(${left.toFixed(3)})`;
      clock.classList.toggle('is-low', left < 0.3);
      // 내 차례 띠는 준비 시간 끝 무렵 지운다(2D 와 같은 길이)
      if (st.phase === 'ready' && st.phaseTicks >= READY_TICKS - 6) banner.classList.remove('is-on');
      // 세기 막대(모두에게 — 조준은 아니다): 모으는 동안, 찬 직후 잠깐
      const p = st.phase === 'aim' ? st.st.charge / CHARGE_TICKS : st.phase === 'flight' && st.phaseTicks < 30 ? st.power : 0;
      const on = p > 0;
      gauge.classList.toggle('is-on', on);
      gauge.classList.toggle('is-touch', !!touch?.touch);
      if (on) fill.style.transform = `scaleX(${p.toFixed(3)})`;

      // 이름표·말풍선 — 지금 차고 막는 둘만(다른 사람은 경기장에 없다)
      // 카메라 바로 앞의 몸(키커 화면의 키커, 키퍼 화면의 키퍼)은 등만 보이니 이름표를 뺀다.
      const near = role === 'keep' ? st.keeper : st.kicker;
      tags.update(sc, w, h, (i) => (i === st.kicker || i === st.keeper) && i !== near, f.bubbles, false);
    },

    // 틱마다 한 번 — 키커면 조준을 옮기고(떼는 순간에만 싣는다), 키퍼면 화면 기준 그대로(좌우는 뒤집어) 넘긴다.
    readInput: input ? (): Pen3Input => {
      const k = input.read();
      const r = pen3Input(local, { x: k.x, y: k.y, kick: k.shoot }, role, phase);
      local = r.local;
      return r.input;
    } : null,

    camera: () => null,

    debug: () => ({
      getInfo: () => { const i = sc.info(); return { fps: Math.round(1000 / Math.max(1, avgMs)), drawCalls: i.drawCalls, triangles: i.triangles, role, aim: role === 'kick' ? { ...local.aim } : null }; },
    }),

    dispose() {
      canvas.removeEventListener('webglcontextlost', onLost);
      input?.dispose();
      touch?.dispose();
      tags.dispose();
      for (const n of nodes) n.remove();
      sc.dispose();
    },
  };
}
