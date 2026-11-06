// src/react/game/views/free3d/surface.ts — 3D 자유 훈련장 그림판(2026-11-07 게임 묶음 5단계). three.js 묶음(match3d/surface3d.ts) 안에 같이 실린다.
// 스펙 §3.3 "3D: 같은 내용 + 1인칭 시점 연습에 좋다." — 그래서 3D 경기와 같은 장면·시점 셋(중계·1인칭·뒤에서, ✕ 아래 버튼)·조작(버튼 다섯, FC 식 키)을 쓴다.
// 다른 것: 공이 여럿(장면 옵션 balls), 고리 색은 각자 아바타 유니폼 색(2D 훈련장과 같은 ringColors, 봇은 회색), 위 줄 "자유 훈련장 · 공 n개 · 들어간 골 n",
// 처음 2.5초 "마음대로 차 보세요", 골마다 "골!" 1초, 카메라·화면 밖 화살표는 내 공(없으면 가장 가까운 공)을 본다, [공 모으기] 는 공용 틀의 게임 버튼(act).
import { Vector3 } from 'three';
import type { FreeConfig } from '../../../../lib/games/free2d';
import { POP_TICKS } from '../../../../lib/games/free2d';
import type { Free3Config, Free3Input, Free3State } from '../../../../lib/games/free3d';
import { ballOf } from '../../../../lib/game3d/multiball3d';
import { RULES3D, TICK_HZ } from '../../../../lib/game3d/sim';
import type { Surface, SurfaceIn } from '../types';
import { ringColors } from '../free2d/render';
import { attachInput } from '../match3d/input3d';
import { createScene, type SceneHandle } from '../match3d/scene';
import { edgeArrow, nextView, readView, saveView, stickToWorld, tankStep, VIEW_LABEL, type ViewMode } from '../match3d/view3d';
import { createTags, createTouch, el } from '../kit3d/dom3d';

const MAX_DPR = 2;
const START_HINT_TICKS = 150;   // 2.5초

export function createFreeSurface(o: SurfaceIn<Free3Config>): Surface<Free3State, Free3Config, Free3Input> | string {
  const { root, canvas, layer, config, roster, playing } = o;
  const myId = o.myId !== null && o.myId >= 0 && o.myId < config.players.length ? o.myId : null;
  let dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  let sc: SceneHandle;
  try {
    sc = createScene(canvas, { players: config.players.map((p) => ({ id: p.id, num: p.num })) }, roster, myId ?? -1, dpr,
      { balls: config.balls, rings: ringColors(config as unknown as FreeConfig, roster) });
  } catch {
    return '이 기기·브라우저에서는 3D 화면을 열 수 없습니다.';
  }
  const nodes: HTMLElement[] = [];
  const add = <T extends HTMLElement>(e: T): T => { nodes.push(e); return e; };
  const hud = add(el('div', 'g3-hud f3-hud', layer));
  const sum = el('b', 'g3-clock f3-sum', hud);
  const goalEl = add(el('div', 'g3-goal', layer));
  goalEl.setAttribute('role', 'status');
  goalEl.style.display = 'none';
  const goalB = el('b', '', goalEl);
  const goalS = el('span', '', goalEl);
  const gauge = add(el('div', 'g3-gauge', layer));
  gauge.setAttribute('aria-hidden', 'true');
  const fill = el('i', '', gauge);
  const arrow = add(el('div', 'g3-arrow', layer));
  arrow.setAttribute('aria-hidden', 'true');
  const lost = add(el('div', 'game-banner', layer));
  lost.style.display = 'none';
  const tags = createTags(layer, config.players.map((p) => p.name), config.players.map(() => null), myId, () => new Vector3());

  // 시점 — 3D 경기와 같은 버튼·같은 저장 칸(✕ 바로 아래). 구경은 중계만.
  let mode: ViewMode = myId === null ? 'broadcast' : readView();
  const viewBtn = myId === null ? null : add(el('button', 'g3-view', layer));
  const paintView = (): void => { if (viewBtn) { viewBtn.setAttribute('aria-label', `시점 바꾸기, 지금 ${VIEW_LABEL[mode]}`); viewBtn.innerHTML = `시점 <b>${VIEW_LABEL[mode]}</b>`; } };
  if (viewBtn) { viewBtn.type = 'button'; paintView(); viewBtn.addEventListener('click', () => { mode = nextView(mode); saveView(mode); paintView(); viewBtn.blur(); }); }
  // [공 모으기] 버튼이 오른쪽 위 줄을 쓰므로 시점 버튼은 한 칸 더 아래(공용 틀의 게임 버튼과 겹치지 않게).
  if (viewBtn) viewBtn.classList.add('is-below-acts');

  const touch = playing && myId !== null ? createTouch(layer, ['pass', 'shoot', 'through', 'lob', 'sprint']) : null;
  const input = touch ? attachInput({
    root, base: touch.base, knob: touch.knob, shootBtn: touch.btn.shoot, passBtn: touch.btn.pass, throughBtn: touch.btn.through,
    lobBtn: touch.btn.lob, sprintBtn: touch.btn.sprint, onTouch: touch.onTouch,
  }) : null;

  let w = 0, h = 0, portrait = false, snap = true, dead = false, gather = false;
  // 1인칭 시선(3D 경기와 같다 — 화면 쪽 각도, 계산엔 단위 벡터. 온라인이면 어댑터가 64방향 표로 양자화한다)
  let heading = 0, turnVel = 0, lastMode: ViewMode | null = null;
  const faceOf = (s: Free3State): number => { const p = myId === null ? undefined : s.players[myId]; return p ? Math.atan2(p.fy, p.fx) : 0; };
  let last: Free3State | null = null, lastSum = '', lastPop = '-', avgMs = 16, slowFor = 0, gaugeOn = false, arrowOn = false;
  const vCam = new Vector3();
  const onLost = (e: Event): void => { e.preventDefault(); dead = true; lost.textContent = '3D 화면이 끊겼습니다 — ✕ 로 나가 다시 열어 주세요.'; lost.style.display = ''; };
  canvas.addEventListener('webglcontextlost', onLost);

  /** 카메라가 볼 공 — 내 공, 없으면 나(구경이면 첫 몸)에게 가장 가까운 공. */
  const focusOf = (s: Free3State): number => {
    const me = myId ?? 0;
    const own = ballOf(s, me);
    if (own >= 0) return own;
    const p = s.players[me];
    let best = 0, bd = Infinity;
    s.balls.forEach((b, j) => { const d = (b.x - p.x) * (b.x - p.x) + (b.y - p.y) * (b.y - p.y); if (d < bd) { bd = d; best = j; } });
    return best;
  };

  return {
    resize(nw, nh) { w = nw; h = nh; portrait = h > w; sc.resize(w, h); },

    render(f) {
      if (dead || !w || !h) return;
      const s = f.state;
      if (mode !== lastMode) { lastMode = mode; heading = faceOf(s); turnVel = 0; }
      if (mode !== 'first') heading = faceOf(s);
      const focus = focusOf(s);
      const frame = { players: s.players, ball: s.balls[0], balls: s.balls, phase: 'play' };
      sc.update(last ? { players: last.players, ball: last.balls[0], balls: last.balls, phase: 'play' } : frame, frame, 1, f.dt, { mode, portrait, heading, snap, focus });
      snap = false;
      last = s;
      sc.render();
      const dtMs = f.dt * 1000;
      if (dtMs > 0) {
        avgMs += (dtMs - avgMs) * 0.05;
        if (avgMs > 24 && dpr > 1) { slowFor += dtMs; if (slowFor > 2000) { dpr = Math.max(1, dpr - 0.5); sc.setPixelRatio(dpr); sc.resize(w, h); slowFor = 0; } } else slowFor = 0;
      }
      // 위 줄 — 2D 훈련장과 같은 말
      const t = `자유 훈련장 · 공 ${config.balls}개 · 들어간 골 ${s.goals}`;
      if (t !== lastSum) { sum.textContent = t; lastSum = t; }
      // 처음 2.5초 안내, 골마다 "골!" 1초
      const pop = s.pops.length ? s.pops[s.pops.length - 1] : null;
      const popOn = !!pop && s.tick - pop.tick < POP_TICKS;
      const startOn = s.tick < START_HINT_TICKS;
      const key = popOn ? `p${pop!.tick}` : startOn ? 'start' : '';
      if (lastPop !== key) {
        lastPop = key;
        goalEl.style.display = key ? '' : 'none';
        goalB.textContent = popOn ? '골!' : startOn ? '마음대로 차 보세요' : '';
        goalEl.classList.toggle('f3-pop', popOn);
        goalB.className = popOn ? '' : 'f3-start';
        goalS.textContent = popOn ? `들어간 골 ${s.goals}` : startOn ? '공을 쫓아 드리블·패스·슛 — 골이 들어간 공만 가운데로 돌아옵니다' : '';
      }
      // 슛 게이지 — 내가 모으는 동안
      const me = myId === null ? undefined : s.players[myId];
      const charge = me && me.shootHeld ? me.charge / RULES3D.chargeTicks : 0;
      if ((charge > 0) !== gaugeOn) { gaugeOn = charge > 0; gauge.classList.toggle('is-on', gaugeOn); }
      if (gaugeOn) fill.style.transform = `scaleX(${charge.toFixed(3)})`;
      gauge.classList.toggle('is-touch', !!touch?.touch);
      // 이름표·말풍선 — 1인칭이면 내 이름표는 숨긴다
      tags.update(sc, w, h, (i) => !(mode === 'first' && i === myId), f.bubbles);
      // 화면 밖 공 — 1인칭·뒤에서
      let on = false;
      if (mode !== 'broadcast') {
        sc.ballPoint(vCam).applyMatrix4(sc.camera.matrixWorldInverse);
        const e = edgeArrow(vCam.x, vCam.y, vCam.z, sc.camera.fov, sc.camera.aspect, w, h, 44);
        on = e.show;
        if (on) arrow.style.transform = `translate(${e.x.toFixed(1)}px, ${e.y.toFixed(1)}px) translate(-50%, -50%) rotate(${e.angle.toFixed(3)}rad)`;
      }
      if (on !== arrowOn) { arrow.classList.toggle('is-on', on); arrowOn = on; }
    },

    readInput: input ? (): Free3Input => {
      const g = gather;
      gather = false;
      if (g) return { x: 0, y: 0, shoot: false, pass: false, gather: true };   // 공 모으기 — 그 한 틱은 가만히(입력 정수 하나)
      const k = input.read();
      if (mode === 'first') {
        const t = tankStep(k.x, k.y, heading, turnVel, 1 / TICK_HZ);
        heading = t.heading; turnVel = t.turnVel;
        return { x: t.move.x, y: t.move.y, shoot: k.shoot, pass: k.pass, through: k.through, lob: k.lob, sprint: k.sprint, fx: t.face.x, fy: t.face.y };
      }
      const fw = sc.groundForward();
      const d = stickToWorld(k.x, k.y, fw.x, fw.y);
      return { x: d.x, y: d.y, shoot: k.shoot, pass: k.pass, through: k.through, lob: k.lob, sprint: k.sprint };
    } : null,

    act(id) { if (id === 'gather') gather = true; },

    camera: () => null,

    debug: () => ({
      getInfo: () => { const i = sc.info(); return { fps: Math.round(1000 / Math.max(1, avgMs)), drawCalls: i.drawCalls, triangles: i.triangles, view: mode }; },
      setView: (m: ViewMode) => { if (myId !== null && VIEW_LABEL[m]) { mode = m; paintView(); } },
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
